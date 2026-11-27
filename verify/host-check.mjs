#!/usr/bin/env node
/**
 * verify/host-check.mjs — CONTRACT.md §6.2: the host half's pure helpers.
 *
 * Imported from `lib/index.js` (the built artifact the profile actually loads),
 * falling back to `src/host/index.js` while `lib/` cannot be built yet (it needs
 * both halves). No ctx, no sockets, no network: every check is a direct function
 * call with a fixture, and every PASS/FAIL line carries the observed value.
 *
 * Helper call signatures are a seam CONTRACT.md §6 does not literally freeze;
 * the ones used here are the ones host-core declared in src/host/index.js.
 */
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { approx, cleanupTempDirs, createReporter, guard, isIso, short, tempDir } from "./lib/common.mjs";
import { creditsBalance, iso, legacyBalance, usagePayload } from "./lib/fixtures.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const reporter = createReporter();
guard(120000, "pure host checks");

/* --------------------------------------------------------------- load host */

async function loadHost() {
  const candidates = [
    { file: join(REPO, "lib", "index.js"), label: "lib/index.js" },
    { file: join(REPO, "src", "host", "index.js"), label: "src/host/index.js" },
  ];
  const failures = [];
  for (const candidate of candidates) {
    if (!existsSync(candidate.file)) continue;
    try {
      const module = await import(pathToFileURL(candidate.file).href);
      return { module, label: candidate.label, failures };
    } catch (error) {
      failures.push(`${candidate.label}: ${error && error.message}`);
    }
  }
  return { module: null, label: null, failures };
}

const loaded = await loadHost();
if (loaded.module === null) {
  reporter.report("host/00", false, "host module imports", loaded.failures.join(" | ") || "lib/index.js and src/host/index.js are both absent");
  console.log("NOTE: src/host/index.js has not landed yet — pure-host checks cannot run.");
  reporter.finish();
  process.exit(process.exitCode);
}
const plugin = loaded.module;
console.log(`HOST MODULE: ${loaded.label}${loaded.label === "src/host/index.js" ? " (provisional: lib/ not built yet)" : ""}`);

/* ------------------------------------------------------------ export surface */

reporter.report("host/01", plugin.name === "dsh-ollama-credits", "name === 'dsh-ollama-credits'", plugin.name);
reporter.report(
  "host/02",
  Array.isArray(plugin.inject) && plugin.inject.length === 1 && plugin.inject[0] === "webServer",
  "inject === ['webServer']",
  plugin.inject,
);
reporter.report("host/03", typeof plugin.apply === "function", "apply is a function", typeof plugin.apply);

const HELPERS = [
  "resolveApiKey",
  "parseCredentialRefs",
  "summarizeBalance",
  "summarizeUsage",
  "summarizeStatus",
  "isTrustedRequest",
  "validateConfig",
];
for (const [index, name] of HELPERS.entries()) {
  const at = 4 + index;
  reporter.report(`host/${String(at).padStart(2, "0")}`, typeof plugin[name] === "function", `exports pure helper ${name}`, typeof plugin[name]);
}
for (const name of HELPERS) if (typeof plugin[name] !== "function") plugin[name] = () => undefined;

/* ------------------------------------------------------------- resolveApiKey */

const ENV_REF = "VERIFY_OC_KEY_XYZ";
const ABSENT_REF = "VERIFY_OC_ABSENT_XYZ";

function normalizedKey(result) {
  if (typeof result === "string") return { key: result, source: "(bare string)" };
  if (result !== null && typeof result === "object") {
    return {
      key: result.key === undefined ? null : result.key,
      source: result.source === undefined ? "(no source)" : result.source,
    };
  }
  return { key: null, source: "(not an object)" };
}

function resolve(options) {
  try {
    return { ok: true, value: normalizedKey(plugin.resolveApiKey({ apiKeyEnv: ENV_REF, ...options })) };
  } catch (error) {
    return { ok: false, error: String(error && error.message) };
  }
}

try {
  const home = tempDir("dsh-oc-cred-home-");
  const cwd = tempDir("dsh-oc-cred-cwd-");
  const cleanHome = tempDir("dsh-oc-cred-empty-");

  delete process.env[ENV_REF];
  delete process.env.DSH_HOME;

  // 1. config.apiKey literal wins over every ambient source.
  process.env[ENV_REF] = "env-secret";
  let result = resolve({ apiKey: "literal-secret", dshHome: home, cwd });
  reporter.report(
    "resolve/01",
    result.ok && result.value.key === "literal-secret" && result.value.source === "config",
    "config.apiKey literal wins (source 'config')",
    result.ok ? result.value : result.error,
  );

  // 2. launch environment.
  result = resolve({ dshHome: home, cwd });
  reporter.report(
    "resolve/02",
    result.ok && result.value.key === "env-secret" && result.value.source === "env",
    "process.env[apiKeyEnv] resolves (source 'env')",
    result.ok ? result.value : result.error,
  );

  // 3. The stored credential file wins over the launch environment — a key saved
  // through the DSH GUI must not be shadowed by a stale exported variable
  // (CONTRACT.md §3 precedence updated 2026-11-27).
  writeFileSync(
    join(home, ".credentials.yaml"),
    [
      "version: 1",
      "records:",
      "  client-connection/browser-session:",
      "    kind: secret",
      "refs:",
      `  ${ENV_REF}: 'cred-secret'`,
      "",
    ].join("\n"),
  );
  result = resolve({ dshHome: home, cwd });
  reporter.report(
    "resolve/03",
    result.ok && result.value.key === "cred-secret" && result.value.source === "credentials-file",
    "stored credentials file outranks the environment (quote layer stripped, source 'credentials-file')",
    result.ok ? result.value : result.error,
  );

  // 4. The environment is the fallback when the store has no such ref.
  writeFileSync(join(home, ".credentials.yaml"), "version: 1\nrefs:\n  OTHER_REF_FOR_VERIFY: 'unrelated'\n");
  result = resolve({ dshHome: home, cwd });
  reporter.report(
    "resolve/04",
    result.ok && result.value.key === "env-secret" && result.value.source === "env",
    "process.env[apiKeyEnv] used when the credential store has no ref for it (source 'env')",
    result.ok ? result.value : result.error,
  );

  // 5. $DSH_HOME/.env fallback.
  delete process.env[ENV_REF];
  writeFileSync(join(home, ".credentials.yaml"), "version: 1\nrefs: {}\n");
  writeFileSync(join(home, ".env"), `${ENV_REF}="dotenv-home-secret"\n`);
  result = resolve({ dshHome: home, cwd });
  reporter.report(
    "resolve/05",
    result.ok && result.value.key === "dotenv-home-secret" && result.value.source === "dsh-env-file",
    "$DSH_HOME/.env fallback resolves, quotes stripped (source 'dsh-env-file')",
    result.ok ? result.value : result.error,
  );

  // 5. <cwd>/.env fallback.
  writeFileSync(join(home, ".env"), "");
  writeFileSync(join(cwd, ".env"), `${ENV_REF}=dotenv-cwd-secret\n`);
  result = resolve({ dshHome: home, cwd });
  reporter.report(
    "resolve/06",
    result.ok && result.value.key === "dotenv-cwd-secret" && result.value.source === "cwd-env-file",
    "<cwd>/.env fallback resolves (source 'cwd-env-file')",
    result.ok ? result.value : result.error,
  );

  // 6. missing everywhere -> null key, source 'missing' (never throws).
  delete process.env[ENV_REF];
  result = resolve({ apiKeyEnv: ABSENT_REF, dshHome: cleanHome, cwd: cleanHome });
  reporter.report(
    "resolve/07",
    result.ok && result.value.key === null && result.value.source === "missing",
    "missing credential yields key null / source 'missing' (no throw)",
    result.ok ? result.value : result.error,
  );

  // 7. config.apiKey literal still outranks every stored/ambient source.
  writeFileSync(join(home, ".credentials.yaml"), `version: 1\nrefs:\n  ${ENV_REF}: 'stored-secret'\n`);
  result = resolve({ apiKey: "literal-over-stored", dshHome: home, cwd });
  reporter.report(
    "resolve/08",
    result.ok && result.value.key === "literal-over-stored" && result.value.source === "config",
    "config.apiKey literal outranks the stored credential file (source 'config')",
    result.ok ? result.value : result.error,
  );
} catch (error) {
  reporter.report("resolve/00", false, "resolveApiKey checks ran", String(error && error.stack));
}

/* ------------------------------------------------------- parseCredentialRefs */

try {
  const text = [
    "version: 2",
    "records:",
    "  client-connection/browser-session:",
    "    kind: secret",
    "    payload:",
    "      version: 2",
    "refs:",
    "  # a comment line is not a ref",
    "  OLLAMA_CLOUD_API_KEY: 'sk-quoted'",
    "  PLAIN_REF: plain-value",
    '  "DOUBLE_REF": "double-quoted"',
    "",
  ].join("\n");
  let refs;
  let threw;
  try {
    refs = plugin.parseCredentialRefs(text);
  } catch (error) {
    threw = String(error && error.message);
  }
  reporter.report(
    "refs/01",
    threw === undefined && refs !== null && typeof refs === "object",
    "parseCredentialRefs returns an object",
    threw ?? typeof refs,
  );
  reporter.report(
    "refs/02",
    threw === undefined && refs && refs.OLLAMA_CLOUD_API_KEY === "sk-quoted",
    "single-quoted value is unquoted",
    refs && refs.OLLAMA_CLOUD_API_KEY,
  );
  reporter.report(
    "refs/03",
    threw === undefined && refs && refs.PLAIN_REF === "plain-value",
    "plain unquoted value is kept",
    refs && refs.PLAIN_REF,
  );
  reporter.report(
    "refs/04",
    threw === undefined && refs && refs.DOUBLE_REF === "double-quoted",
    "double-quoted value is unquoted",
    refs && refs.DOUBLE_REF,
  );
  const keys = threw === undefined && refs ? Object.keys(refs) : [];
  reporter.report(
    "refs/05",
    keys.length === 3 && !keys.includes("version") && !keys.includes("records"),
    "only the refs block is returned (comments/other sections ignored)",
    keys,
  );
} catch (error) {
  reporter.report("refs/00", false, "parseCredentialRefs checks ran", String(error && error.stack));
}

/* ---------------------------------------------------------- summarizeBalance */

const NOW = Date.parse("2026-11-27T06:00:00Z");

try {
  const legacy = legacyBalance(NOW);
  // `summarizeBalance(raw, {nowMs, asOf})`: asOf is the poller's snapshot time, which
  // the pure function can only know if it is handed over (CONTRACT.md §4.1 allows null).
  const balance = plugin.summarizeBalance(legacy, { nowMs: NOW, asOf: iso(NOW) });
  reporter.report(
    "balance/01",
    balance !== null && typeof balance === "object",
    "summarizeBalance(legacy) returns an object",
    typeof balance,
  );
  reporter.report("balance/02", balance && balance.plan === "legacy", "legacy plan identified", balance && balance.plan);
  reporter.report(
    "balance/03",
    balance && balance.session && balance.session.remainingPercent === 92.5,
    "session.remainingPercent = 92.5",
    balance && balance.session && balance.session.remainingPercent,
  );
  reporter.report(
    "balance/04",
    balance && balance.weekly && balance.weekly.remainingPercent === 67.7,
    "weekly.remainingPercent = 67.7",
    balance && balance.weekly && balance.weekly.remainingPercent,
  );
  reporter.report(
    "balance/05",
    balance && balance.session && balance.session.resetsAt === legacy.included.session.resets_at && isIso(balance.session.resetsAt),
    "session.resetsAt is the upstream ISO timestamp",
    balance && balance.session && balance.session.resetsAt,
  );
  reporter.report(
    "balance/06",
    balance && balance.session && approx(balance.session.resetInSec, 3600, 5),
    "session.resetInSec ~= 3600 (now-relative)",
    balance && balance.session && balance.session.resetInSec,
  );
  reporter.report(
    "balance/07",
    balance && balance.weekly && approx(balance.weekly.resetInSec, 123456, 5),
    "weekly.resetInSec ~= 123456",
    balance && balance.weekly && balance.weekly.resetInSec,
  );
  reporter.report("balance/08", balance && balance.included === null, "legacy included is null", balance && balance.included);
  reporter.report(
    "balance/09",
    balance && balance.purchased && balance.purchased.balanceUsd === 0,
    "purchased.balanceUsd = 0",
    balance && balance.purchased,
  );
  reporter.report("balance/10", balance && isIso(balance.asOf), "asOf is an ISO timestamp", balance && balance.asOf);

  const credits = plugin.summarizeBalance(creditsBalance(NOW), { nowMs: NOW, asOf: iso(NOW) });
  reporter.report("balance/11", credits && credits.plan === "credits", "credit-metered plan identified", credits && credits.plan);
  reporter.report(
    "balance/12",
    credits && credits.included && credits.included.balanceUsd === 12.34,
    "credits included.balanceUsd = 12.34",
    credits && credits.included && credits.included.balanceUsd,
  );
  reporter.report(
    "balance/13",
    credits && credits.included && credits.included.allowanceUsd === 50,
    "credits included.allowanceUsd = 50",
    credits && credits.included && credits.included.allowanceUsd,
  );
  reporter.report(
    "balance/14",
    credits && credits.included && credits.included.period && isIso(credits.included.period.from) && isIso(credits.included.period.until) && approx(credits.included.period.resetInSec, 7200, 5),
    "credits included.period {from,until,resetInSec~7200}",
    credits && credits.included && credits.included.period,
  );
  reporter.report(
    "balance/15",
    credits && credits.purchased && credits.purchased.balanceUsd === 3.21,
    "credits purchased.balanceUsd = 3.21",
    credits && credits.purchased,
  );

  let unknown;
  let unknownThrew;
  try {
    unknown = plugin.summarizeBalance({});
  } catch (error) {
    unknownThrew = String(error && error.message);
  }
  reporter.report(
    "balance/16",
    unknownThrew === undefined && unknown && unknown.plan === "unknown",
    "unrecognised balance is plan 'unknown' (never omits the field)",
    unknownThrew ?? (unknown && unknown.plan),
  );
} catch (error) {
  reporter.report("balance/00", false, "summarizeBalance checks ran", String(error && error.stack));
}

/* ------------------------------------------------------------ summarizeUsage */

function usageCall(raw) {
  try {
    return { ok: true, value: plugin.summarizeUsage(raw) };
  } catch (error) {
    return { ok: false, error: String(error && error.message) };
  }
}

try {
  const raw = {
    range: "7d",
    scope: "self",
    granularity: "day",
    group_by: "model",
    from: "2026-11-20T00:00:00.000Z",
    until: "2026-11-21T00:00:00.000Z",
    totals: {
      request_count: 400,
      groups: [
        { model: "alpha", request_count: 300 },
        { model: "beta", request_count: 100 },
      ],
    },
    buckets: [
      {
        from: "2026-11-20T00:00:00.000Z",
        until: "2026-11-21T00:00:00.000Z",
        request_count: 400,
        groups: [
          { model: "alpha", request_count: 300 },
          { model: "beta", request_count: 100 },
        ],
      },
    ],
  };
  const out = usageCall(raw);
  const usage = out.ok ? out.value : undefined;
  reporter.report("usage/01", out.ok && usage && usage.range === "7d", "range is carried through", out.ok ? usage && usage.range : out.error);
  reporter.report(
    "usage/02",
    out.ok && usage && usage.granularity === "day" && usage.from === raw.from && usage.until === raw.until,
    "granularity/from/until are carried through",
    out.ok ? { granularity: usage.granularity, from: usage.from, until: usage.until } : out.error,
  );
  reporter.report(
    "usage/03",
    out.ok && usage && usage.totals && usage.totals.requests === 400 && usage.totals.usageUsd === null,
    "totals.requests = 400, totals.usageUsd = null on a legacy payload",
    out.ok ? usage && usage.totals && { requests: usage.totals.requests, usageUsd: usage.totals.usageUsd } : out.error,
  );
  const models = out.ok && usage && usage.totals && Array.isArray(usage.totals.models) ? usage.totals.models : [];
  reporter.report(
    "usage/04",
    models.length === 2 && models[0].model === "alpha" && models[0].requests === 300 && models[0].sharePct === 75 && models[1].sharePct === 25,
    "models are desc by requests with sharePct = requests/total*100 (1 dp)",
    models.map((m) => `${m.model}:${m.requests}@${m.sharePct}%`),
  );
  reporter.report(
    "usage/05",
    models.length === 2 && models.every((m) => m.usageUsd === null || m.usageUsd === undefined),
    "legacy models carry no invented USD (usageUsd null)",
    models.map((m) => m.usageUsd),
  );
  const buckets = out.ok && usage && Array.isArray(usage.buckets) ? usage.buckets : [];
  reporter.report(
    "usage/06",
    buckets.length === 1 && buckets[0].requests === 400 && Array.isArray(buckets[0].models) && buckets[0].models.length === 2,
    "buckets carry requests + models lists",
    buckets.map((b) => ({ requests: b.requests, models: Array.isArray(b.models) ? b.models.length : b.models })),
  );

  // __other__ folding from upstream `remainder` (object shape, the documented case).
  const folded = usageCall({
    range: "7d",
    granularity: "day",
    from: "2026-11-20T00:00:00.000Z",
    until: "2026-11-21T00:00:00.000Z",
    totals: { request_count: 500, groups: [{ model: "alpha", request_count: 400 }], remainder: { request_count: 100 } },
    buckets: [],
  });
  const foldedModels = folded.ok && folded.value && folded.value.totals ? folded.value.totals.models : [];
  reporter.report(
    "usage/07",
    foldedModels.length === 2 && foldedModels[0].model === "alpha" && foldedModels[0].sharePct === 80 && foldedModels[1].model === "__other__" && foldedModels[1].requests === 100 && foldedModels[1].sharePct === 20,
    "upstream remainder folds into one trailing {model:'__other__'}",
    foldedModels.map((m) => `${m.model}:${m.requests}@${m.sharePct}%`),
  );

  // A numeric remainder (defensive: the response was never observed with >10 groups).
  const numericRemainder = usageCall({
    range: "30d",
    granularity: "day",
    from: "2026-11-20T00:00:00.000Z",
    until: "2026-11-21T00:00:00.000Z",
    totals: { request_count: 500, groups: [{ model: "alpha", request_count: 400 }], remainder: 100 },
    buckets: [],
  });
  const numericModels = numericRemainder.ok && numericRemainder.value && numericRemainder.value.totals ? numericRemainder.value.totals.models : [];
  reporter.advisory(
    "usage/08",
    numericModels.length === 2 && numericModels[1].model === "__other__" && numericModels[1].requests === 100,
    "numeric remainder is also folded into __other__ (defensive)",
    numericModels.map((m) => `${m.model}:${m.requests}`),
  );

  // Zero-fill on the from/until grid when the upstream buckets are sparse.
  const sparse = usageCall({
    range: "24h",
    granularity: "hour",
    from: "2026-11-20T00:00:00.000Z",
    until: "2026-11-20T03:00:00.000Z",
    totals: { request_count: 5, groups: [{ model: "alpha", request_count: 5 }] },
    buckets: [
      {
        from: "2026-11-20T01:00:00.000Z",
        until: "2026-11-20T02:00:00.000Z",
        request_count: 5,
        groups: [{ model: "alpha", request_count: 5 }],
      },
    ],
  });
  const sparseBuckets = sparse.ok && sparse.value && Array.isArray(sparse.value.buckets) ? sparse.value.buckets : [];
  reporter.report(
    "usage/09",
    sparseBuckets.length === 3 && sparseBuckets[0].requests === 0 && sparseBuckets[1].requests === 5 && sparseBuckets[2].requests === 0,
    "sparse upstream buckets are zero-filled on the hourly grid (0,5,0 over 3 h)",
    sparseBuckets.map((b) => b.requests),
  );
  reporter.report(
    "usage/10",
    sparseBuckets.length === 3 && sparseBuckets.map((b) => b.from).join(",") === [
      "2026-11-20T00:00:00.000Z",
      "2026-11-20T01:00:00.000Z",
      "2026-11-20T02:00:00.000Z",
    ].join(","),
    "zero-filled buckets are chronological with grid from/until",
    sparseBuckets.map((b) => b.from),
  );

  // Empty buckets list over a 2 h window -> two zero buckets.
  const empty = usageCall({
    range: "24h",
    granularity: "hour",
    from: "2026-11-20T00:00:00.000Z",
    until: "2026-11-20T02:00:00.000Z",
    totals: { request_count: 0, groups: [] },
    buckets: [],
  });
  const emptyBuckets = empty.ok && empty.value && Array.isArray(empty.value.buckets) ? empty.value.buckets : [];
  reporter.report(
    "usage/11",
    emptyBuckets.length === 2 && emptyBuckets.every((b) => b.requests === 0) && empty.value.totals.requests === 0,
    "empty upstream buckets -> zero buckets, requests 0",
    emptyBuckets.map((b) => b.requests),
  );

  // Missing groups -> an empty models array, never undefined.
  const noGroups = usageCall({
    range: "24h",
    granularity: "hour",
    from: "2026-11-20T00:00:00.000Z",
    until: "2026-11-20T01:00:00.000Z",
    totals: { request_count: 0 },
    buckets: [],
  });
  const noGroupModels = noGroups.ok && noGroups.value && noGroups.value.totals ? noGroups.value.totals.models : undefined;
  reporter.report(
    "usage/12",
    Array.isArray(noGroupModels) && noGroupModels.length === 0,
    "missing totals.groups -> totals.models: [] (never omitted/undefined)",
    noGroupModels,
  );

  // >10 upstream groups -> 10 models + one __other__ entry.
  const manyGroups = Array.from({ length: 12 }, (_, index) => ({ model: `m${index + 1}`, request_count: index + 1 }));
  const many = usageCall({
    range: "30d",
    granularity: "day",
    from: "2026-11-20T00:00:00.000Z",
    until: "2026-11-21T00:00:00.000Z",
    totals: { request_count: 78, groups: manyGroups },
    buckets: [],
  });
  const manyModels = many.ok && many.value && many.value.totals ? many.value.totals.models : [];
  reporter.report(
    "usage/13",
    manyModels.length === 11 && manyModels[10].model === "__other__" && manyModels[10].requests === 3,
    "12 upstream groups -> top 10 + __other__ (2+1=3 requests)",
    manyModels.map((m) => `${m.model}:${m.requests}`),
  );
} catch (error) {
  reporter.report("usage/00", false, "summarizeUsage checks ran", String(error && error.stack));
}

/* ----------------------------------------------------------- summarizeStatus */

try {
  const now = NOW;
  const balance = plugin.summarizeBalance(legacyBalance(now), { nowMs: now, asOf: iso(now) });
  const usage = {
    "24h": plugin.summarizeUsage(usagePayload("24h", now)),
    "7d": plugin.summarizeUsage(usagePayload("7d", now)),
    "30d": plugin.summarizeUsage(usagePayload("30d", now)),
  };
  const poll = { intervalMin: 5, lastPollAt: iso(now), lastError: null };
  const config = { pollIntervalMin: 5, lowSessionPct: 10, lowWeeklyPct: 10 };
  const status = plugin.summarizeStatus({ balance, usage, poll }, config);

  reporter.report("status/01", status && status.ok === true, "ok:true with a snapshot", status && status.ok);
  reporter.report("status/02", status && status.plan === "legacy" && isIso(status.asOf), "plan legacy + asOf ISO", status && { plan: status.plan, asOf: status.asOf });
  reporter.report(
    "status/03",
    status && status.windows && status.windows.session && status.windows.session.remainingPercent === 92.5 && status.windows.weekly.remainingPercent === 67.7,
    "windows.session/weekly copy the balance percentages",
    status && status.windows,
  );
  reporter.report(
    "status/04",
    status && status.windows && status.windows.session && isIso(status.windows.session.resetsAt) && typeof status.windows.session.resetInSec === "number",
    "window resetsAt ISO + resetInSec number",
    status && status.windows && status.windows.session,
  );
  reporter.report("status/05", status && status.included === null, "included null on the legacy plan", status && status.included);
  reporter.report(
    "status/06",
    status && status.thresholds && status.thresholds.sessionPct === 10 && status.thresholds.weeklyPct === 10,
    "thresholds echo config",
    status && status.thresholds,
  );
  reporter.report(
    "status/07",
    status && status.low && status.low.session === false && status.low.weekly === false && status.low.any === false,
    "low flags false when both windows are far above threshold",
    status && status.low,
  );
  reporter.report(
    "status/08",
    status && status.usage && status.usage.hourly && status.usage.hourly.requests === usage["24h"].totals.requests && status.usage.hourly.topModel === "deepseek-v4.1-flash:1017" && status.usage.hourly.topModelRequests === usage["24h"].totals.models[0].requests,
    "usage.hourly = 24h requests + top model",
    status && status.usage && status.usage.hourly,
  );
  reporter.report(
    "status/09",
    status && status.usage && status.usage.weekly && status.usage.weekly.requests === usage["7d"].totals.requests && status.usage.weekly.topModel === "deepseek-v4.1-flash:1017",
    "usage.weekly = 7d requests + top model",
    status && status.usage && status.usage.weekly,
  );
  reporter.report(
    "status/10",
    status && status.poll && status.poll.intervalMin === 5 && status.poll.lastPollAt === iso(now) && status.poll.lastError === null,
    "poll {intervalMin,lastPollAt,lastError}",
    status && status.poll,
  );

  const withWindows = (sessionPct, weeklyPct) => ({
    ...balance,
    session: { remainingPercent: sessionPct, resetsAt: balance.session.resetsAt, resetInSec: balance.session.resetInSec },
    weekly: { remainingPercent: weeklyPct, resetsAt: balance.weekly.resetsAt, resetInSec: balance.weekly.resetInSec },
  });
  const at = plugin.summarizeStatus({ balance: withWindows(10, 10), usage, poll }, config);
  reporter.report(
    "status/11",
    at && at.low && at.low.session === true && at.low.weekly === true && at.low.any === true,
    "remaining 10 / threshold 10 -> low at the boundary (<=)",
    at && at.low,
  );
  const above = plugin.summarizeStatus({ balance: withWindows(10.5, 10.5), usage, poll }, config);
  reporter.report(
    "status/12",
    above && above.low && above.low.session === false && above.low.weekly === false && above.low.any === false,
    "remaining 10.5 / threshold 10 -> not low",
    above && above.low,
  );
  const below = plugin.summarizeStatus({ balance: withWindows(9.9, 67), usage, poll }, config);
  reporter.report(
    "status/13",
    below && below.low && below.low.session === true && below.low.weekly === false && below.low.any === true,
    "remaining 9.9 -> session low, any low",
    below && below.low,
  );

  const creditsBalanceSummary = {
    asOf: iso(now),
    plan: "credits",
    session: null,
    weekly: null,
    included: { balanceUsd: 0, allowanceUsd: 50, period: { from: iso(now - 86400000), until: iso(now + 7200000), resetInSec: 7200 } },
    purchased: { balanceUsd: 3.21 },
  };
  const creditsStatus = plugin.summarizeStatus({ balance: creditsBalanceSummary, usage, poll }, config);
  reporter.report(
    "status/14",
    creditsStatus && creditsStatus.plan === "credits" && creditsStatus.included && creditsStatus.included.balanceUsd === 0,
    "credits plan carries included.balanceUsd",
    creditsStatus && { plan: creditsStatus.plan, included: creditsStatus.included },
  );
  reporter.report(
    "status/15",
    creditsStatus && creditsStatus.low && creditsStatus.low.any === true,
    "credits plan: included.balanceUsd 0 -> low.any true",
    creditsStatus && creditsStatus.low,
  );
  const creditsMore = {
    ...creditsBalanceSummary,
    included: { ...creditsBalanceSummary.included, balanceUsd: 0.5 },
  };
  const creditsMoreStatus = plugin.summarizeStatus({ balance: creditsMore, usage, poll }, config);
  reporter.report(
    "status/16",
    creditsMoreStatus && creditsMoreStatus.low && creditsMoreStatus.low.any === false,
    "credits plan: balanceUsd 0.5 -> low.any false",
    creditsMoreStatus && creditsMoreStatus.low,
  );

  const noData = plugin.summarizeStatus({ balance: null, usage: {}, poll: { intervalMin: 5, lastPollAt: null, lastError: "missing_credential" } }, config);
  reporter.report(
    "status/17",
    noData && noData.ok === false && (noData.status === "no-credential" || noData.status === "no-data") && typeof noData.message === "string",
    "no snapshot -> {ok:false,status:'no-credential'|'no-data',message}",
    noData && { ok: noData.ok, status: noData.status, message: noData.message },
  );
} catch (error) {
  reporter.report("status/00", false, "summarizeStatus checks ran", String(error && error.stack));
}

/* --------------------------------------------------------- isTrustedRequest */

function trusted(headers, trustedHosts) {
  const req = { headers, socket: { remoteAddress: "127.0.0.1" } };
  try {
    return { ok: true, value: plugin.isTrustedRequest(req, trustedHosts) };
  } catch (error) {
    return { ok: false, error: String(error && error.message) };
  }
}

try {
  const cases = [
    ["trust/01", "loopback 127.0.0.1:3081", { host: "127.0.0.1:3081" }, undefined, true],
    ["trust/02", "localhost:3081", { host: "localhost:3081" }, undefined, true],
    ["trust/03", "[::1]:3081", { host: "[::1]:3081" }, undefined, true],
    ["trust/04", "127.9.9.9:9000 (127/8)", { host: "127.9.9.9:9000" }, undefined, true],
    ["trust/05", "foreign Host evil.example", { host: "evil.example" }, undefined, false],
    ["trust/06", "trusted authority in the list", { host: "dsh.example.ts.net" }, ["dsh.example.ts.net"], true],
    ["trust/07", "trusted authority, empty list", { host: "dsh.example.ts.net" }, [], false],
    ["trust/08", "foreign Origin with loopback Host", { host: "127.0.0.1:3081", origin: "http://evil.example" }, undefined, false],
    ["trust/09", "same-origin Origin with loopback Host", { host: "127.0.0.1:3081", origin: "http://127.0.0.1:3081" }, undefined, true],
    ["trust/10", "Origin: null", { host: "127.0.0.1:3081", origin: "null" }, undefined, false],
    ["trust/11", "sec-fetch-site: cross-site", { host: "127.0.0.1:3081", "sec-fetch-site": "cross-site" }, undefined, false],
    ["trust/12", "sec-fetch-site: same-origin", { host: "127.0.0.1:3081", "sec-fetch-site": "same-origin" }, undefined, true],
    ["trust/13", "missing Host header", {}, undefined, false],
    ["trust/14", "trusted authority with port", { host: "dsh.example.ts.net:443" }, ["dsh.example.ts.net"], true],
  ];
  for (const [id, desc, headers, hosts, expected] of cases) {
    const result = trusted(headers, hosts);
    reporter.report(id, result.ok && result.value === expected, `isTrustedRequest: ${desc} -> ${expected}`, result.ok ? result.value : result.error);
  }
  const bare = (() => {
    try {
      return { ok: true, value: plugin.isTrustedRequest({ host: "127.0.0.1:3081" }, undefined) };
    } catch (error) {
      return { ok: false, error: String(error && error.message) };
    }
  })();
  reporter.advisory("trust/15", bare.ok && bare.value === true, "bare headers object is accepted (defensive)", bare.ok ? bare.value : bare.error);
  const fnList = (() => {
    try {
      return { ok: true, value: plugin.isTrustedRequest({ headers: { host: "dsh.example.ts.net" } }, () => ["dsh.example.ts.net"]) };
    } catch (error) {
      return { ok: false, error: String(error && error.message) };
    }
  })();
  reporter.advisory("trust/16", fnList.ok && fnList.value === true, "trustedHosts as () => string[] is accepted (defensive)", fnList.ok ? fnList.value : fnList.error);
} catch (error) {
  reporter.report("trust/00", false, "isTrustedRequest checks ran", String(error && error.stack));
}

/* ------------------------------------------------------------ validateConfig */

function validate(patch) {
  try {
    return { ok: true, value: plugin.validateConfig(patch) };
  } catch (error) {
    return { ok: false, error: String(error && error.message) };
  }
}

try {
  const defaults = validate({});
  reporter.report(
    "config/01",
    defaults.ok && defaults.value && defaults.value.ok === true && defaults.value.config && defaults.value.config.pollIntervalMin === 5 && defaults.value.config.lowSessionPct === 10 && defaults.value.config.lowWeeklyPct === 10,
    "{} -> ok with defaults 5 / 10 / 10",
    defaults.ok ? defaults.value : defaults.error,
  );
  const valid = validate({ pollIntervalMin: 30, lowSessionPct: 25, lowWeeklyPct: 15 });
  reporter.report(
    "config/02",
    valid.ok && valid.value && valid.value.ok === true && valid.value.config.pollIntervalMin === 30 && valid.value.config.lowSessionPct === 25 && valid.value.config.lowWeeklyPct === 15,
    "{pollIntervalMin:30,lowSessionPct:25,lowWeeklyPct:15} accepted",
    valid.ok ? valid.value : valid.error,
  );
  reporter.report(
    "config/03",
    validate({ pollIntervalMin: 1 }).value.config.pollIntervalMin === 1 && validate({ pollIntervalMin: 60 }).value.config.pollIntervalMin === 60,
    "interval boundaries 1 and 60 accepted",
    [validate({ pollIntervalMin: 1 }).value?.config?.pollIntervalMin, validate({ pollIntervalMin: 60 }).value?.config?.pollIntervalMin],
  );
  const rejects = [
    ["config/04", "pollIntervalMin 0", { pollIntervalMin: 0 }],
    ["config/05", "pollIntervalMin 61", { pollIntervalMin: 61 }],
    ["config/06", "pollIntervalMin -1", { pollIntervalMin: -1 }],
    ["config/07", "pollIntervalMin 5.5 (non-integer)", { pollIntervalMin: 5.5 }],
    ["config/08", "pollIntervalMin '30' (string)", { pollIntervalMin: "30" }],
    ["config/09", "lowSessionPct 101", { lowSessionPct: 101 }],
    ["config/10", "lowWeeklyPct -1", { lowWeeklyPct: -1 }],
  ];
  for (const [id, desc, patch] of rejects) {
    const result = validate(patch);
    reporter.report(
      id,
      result.ok && result.value && result.value.ok === false && result.value.error === "BAD_CONFIG",
      `rejects ${desc} with BAD_CONFIG (no silent clamp)`,
      result.ok ? result.value : result.error,
    );
  }
  reporter.report(
    "config/11",
    validate({ lowSessionPct: 0 }).value.ok === true && validate({ lowSessionPct: 100 }).value.ok === true,
    "threshold boundaries 0 and 100 accepted",
    [validate({ lowSessionPct: 0 }).value?.ok, validate({ lowSessionPct: 100 }).value?.ok],
  );
  const unknownKey = validate({ pollIntervalMin: 2, bogusKey: true });
  reporter.report(
    "config/12",
    unknownKey.ok && unknownKey.value && unknownKey.value.ok === true && unknownKey.value.config.pollIntervalMin === 2,
    "unknown keys are ignored",
    unknownKey.ok ? unknownKey.value : unknownKey.error,
  );
} catch (error) {
  reporter.report("config/00", false, "validateConfig checks ran", String(error && error.stack));
}

/* --------------------------------------------------------------------- exit */

cleanupTempDirs();
reporter.finish();
