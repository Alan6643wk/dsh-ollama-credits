#!/usr/bin/env node
/**
 * verify/route-check.mjs — CONTRACT.md §6.3: the host routes over a real socket.
 *
 * `apply()` is driven with the loader seam the contract documents — a fake `ctx`
 * whose `webServer.register` records routes, `get()` returns a trusted-hosts
 * source, `effect()` collects timer disposers. The recorded handlers are then
 * served by a real `node:http` server on 127.0.0.1 and exercised with real HTTP
 * requests: frozen §4 shapes, 400/405 paths, the §4.6 fence, and the §4.5 config
 * persistence.
 *
 * The upstream (`https://ollama.com/api/...`) is a local stub serving payloads
 * transcribed from the live API, so every number in this file is deterministic
 * and nothing here touches the network.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  approx,
  cleanupTempDirs,
  createReporter,
  guard,
  httpRequest,
  isIso,
  short,
  tempDir,
  waitFor,
} from "./lib/common.mjs";
import { makeCtx, makeStubApi, mountRoutes, iso } from "./lib/fixtures.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const PREFIX = "/api/dsh-ollama-credits";
const reporter = createReporter();
guard(180000, "route checks");

const JSON_CT = /^application\/json;\s*charset=utf-8$/i;

/* --------------------------------------------------------------- load host */

async function loadHost() {
  for (const candidate of [
    { file: join(REPO, "lib", "index.js"), label: "lib/index.js" },
    { file: join(REPO, "src", "host", "index.js"), label: "src/host/index.js" },
  ]) {
    if (!existsSync(candidate.file)) continue;
    try {
      return { module: await import(pathToFileURL(candidate.file).href), label: candidate.label, error: null };
    } catch (error) {
      return { module: null, label: candidate.label, error: String(error && error.message) };
    }
  }
  return { module: null, label: null, error: "lib/index.js and src/host/index.js are both absent" };
}

const loaded = await loadHost();
if (loaded.module === null || typeof loaded.module.apply !== "function") {
  reporter.report("route/00", false, "host module imports and exports apply()", loaded.error ?? typeof (loaded.module && loaded.module.apply));
  console.log("NOTE: the host half has not landed yet — route checks cannot run.");
  reporter.finish();
  process.exit(process.exitCode);
}
const plugin = loaded.module;
console.log(`HOST MODULE: ${loaded.label}${loaded.label === "src/host/index.js" ? " (provisional: lib/ not built yet)" : ""}`);

/* ------------------------------------------------------------- harness boot */

/**
 * Apply the plugin against a fresh stub upstream + fake ctx, and serve the
 * registered routes on a real loopback port.
 */
/** Every live harness, so a throw anywhere still clears timers and sockets. */
const liveHarnesses = new Set();

async function startHost({ config = {}, upstream = {}, trustedHosts, stateDir: givenStateDir } = {}) {
  const stub = await makeStubApi(upstream);
  const stateDir = givenStateDir ?? tempDir("dsh-oc-state-");
  const { ctx, routes, services, disposers } = makeCtx({ trustedHosts });
  const rowConfig = { apiBase: stub.base, apiKey: "test-key", stateDir, ...config };
  for (const key of Object.keys(rowConfig)) if (rowConfig[key] === undefined) delete rowConfig[key];
  let applyError = null;
  try {
    const applied = plugin.apply(ctx, rowConfig);
    if (applied !== null && typeof applied === "object" && typeof applied.then === "function") await applied;
  } catch (error) {
    applyError = String((error && error.stack) ?? error);
  }
  const mounted = await mountRoutes(routes);
  const harness = {
    stub,
    stateDir,
    ctx,
    routes,
    services,
    disposers,
    mounted,
    applyError,
    disposed: false,
    request: (path, options) => mounted.request(path, options),
    dispose: async () => {
      if (harness.disposed) return;
      harness.disposed = true;
      liveHarnesses.delete(harness);
      for (const fn of disposers.splice(0)) {
        try {
          await fn();
        } catch {
          /* disposal is best effort */
        }
      }
      await mounted.close();
      await stub.close();
    },
  };
  liveHarnesses.add(harness);
  return harness;
}

async function waitForOverview(harness, timeoutMs = 8000) {
  return waitFor(
    async () => {
      const response = await harness.request(`${PREFIX}/overview`);
      if (response.status !== 200 || response.json === undefined || response.json.ok !== true) return false;
      return response;
    },
    { timeoutMs, intervalMs: 40, what: "first successful poll (overview ok:true)" },
  );
}

/* ------------------------------------------------------- A. apply + routes */

let mainHarness = null;
try {
  mainHarness = await startHost();
  reporter.report("route/01", mainHarness.applyError === null, "apply(ctx, config) does not throw", mainHarness.applyError ?? "returned cleanly");

  const expectedPaths = [
    `${PREFIX}/overview`,
    `${PREFIX}/status`,
    `${PREFIX}/refresh`,
    `${PREFIX}/usage`,
    `${PREFIX}/config`,
  ];
  const paths = mainHarness.routes.map((route) => route.path);
  reporter.report(
    "route/02",
    mainHarness.routes.length === 5 && expectedPaths.every((path) => paths.filter((seen) => seen === path).length === 1),
    "registers exactly the five §4 routes once each",
    paths,
  );
  reporter.report(
    "route/03",
    mainHarness.routes.every((route) => route.kind === "exact" && typeof route.handler === "function"),
    "every route is {kind:'exact', handler:(req,res)}",
    mainHarness.routes.map((route) => route.kind),
  );

  await waitForOverview(mainHarness);

  const calls = mainHarness.stub.log.calls;
  const balanceCalls = calls.filter((call) => call.path === "/api/balance");
  const usageCalls = calls.filter((call) => call.path === "/api/usage");
  reporter.report(
    "route/04",
    calls.length === 4 && balanceCalls.length === 1 && usageCalls.length === 3,
    "first poll cycle = 1 balance + 3 usage calls (4 total)",
    `${calls.length} calls: ${calls.map((call) => `${call.path}${call.query.range ? `?range=${call.query.range}` : ""}`).join(", ")}`,
  );
  const ranges = usageCalls.map((call) => call.query.range).sort();
  reporter.report(
    "route/05",
    ranges.join(",") === "24h,30d,7d",
    "poll cycle asks for usage 24h/7d/30d",
    ranges,
  );
  reporter.report(
    "route/06",
    usageCalls.length === 3 && usageCalls.every((call) => call.query.group_by === "model"),
    "every usage call sends group_by=model (per-model data on every range)",
    usageCalls.map((call) => call.query.group_by),
  );
  reporter.report(
    "route/07",
    calls.every((call) => call.authorization === "Bearer test-key"),
    "upstream sees Authorization: Bearer <api key>",
    [...new Set(calls.map((call) => call.authorization))],
  );
  reporter.report(
    "route/08",
    calls.every((call) => call.userAgent === "dsh-ollama-credits/0.1.0"),
    "upstream sees User-Agent dsh-ollama-credits/0.1.0",
    [...new Set(calls.map((call) => call.userAgent))],
  );

  /* ------------------------------------------------------ B. GET /overview */

  const overviewResponse = await mainHarness.request(`${PREFIX}/overview`);
  const overview = overviewResponse.json;
  reporter.report("overview/01", overviewResponse.status === 200, "GET /overview -> 200", overviewResponse.status);
  reporter.report("overview/02", JSON_CT.test(overviewResponse.headers["content-type"] ?? ""), "content-type application/json; charset=utf-8", overviewResponse.headers["content-type"]);
  reporter.report("overview/03", overviewResponse.headers["cache-control"] === "no-store", "cache-control: no-store", overviewResponse.headers["cache-control"]);
  reporter.report("overview/04", overview !== undefined && overview.ok === true, "body.ok === true", overview && overview.ok);
  reporter.report("overview/05", isIso(overview && overview.generatedAt), "generatedAt is ISO", overview && overview.generatedAt);
  const poll = (overview && overview.poll) || {};
  reporter.report(
    "overview/06",
    poll.intervalMin === 5 && isIso(poll.lastPollAt) && poll.lastPollOk === true && poll.lastError === null && poll.inFlight === false,
    "poll {intervalMin:5, lastPollAt ISO, lastPollOk:true, lastError:null, inFlight:false}",
    poll,
  );
  const balance = (overview && overview.balance) || {};
  reporter.report("overview/07", balance.plan === "legacy", "balance.plan legacy", balance.plan);
  reporter.report(
    "overview/08",
    balance.session && balance.session.remainingPercent === 92.5 && balance.weekly && balance.weekly.remainingPercent === 67.7,
    "balance.session.remainingPercent 92.5 / weekly 67.7",
    { session: balance.session && balance.session.remainingPercent, weekly: balance.weekly && balance.weekly.remainingPercent },
  );
  reporter.report(
    "overview/09",
    balance.session && isIso(balance.session.resetsAt) && typeof balance.session.resetInSec === "number" && balance.session.resetInSec > 0 &&
      balance.weekly && isIso(balance.weekly.resetsAt) && typeof balance.weekly.resetInSec === "number",
    "session/weekly {resetsAt ISO, resetInSec number}",
    { session: balance.session, weekly: balance.weekly },
  );
  reporter.report("overview/10", balance.included === null, "balance.included null on a legacy plan", balance.included);
  reporter.report("overview/11", balance.purchased && balance.purchased.balanceUsd === 0, "balance.purchased.balanceUsd = 0", balance.purchased);
  reporter.report("overview/12", isIso(balance.asOf), "balance.asOf is ISO", balance.asOf);

  const usage = (overview && overview.usage) || {};
  reporter.report(
    "overview/13",
    ["24h", "7d", "30d"].every((key) => usage[key] !== null && usage[key] !== undefined),
    "usage has 24h/7d/30d (no range omitted)",
    Object.keys(usage),
  );
  const u24 = usage["24h"] || {};
  const u7 = usage["7d"] || {};
  const u30 = usage["30d"] || {};
  reporter.report(
    "overview/14",
    u24.range === "24h" && u24.granularity === "hour" && isIso(u24.from) && isIso(u24.until),
    "usage.24h {range:'24h', granularity:'hour', from/until ISO}",
    { range: u24.range, granularity: u24.granularity, from: u24.from, until: u24.until },
  );
  reporter.report(
    "overview/15",
    u7.range === "7d" && u7.granularity === "day" && u30.range === "30d" && u30.granularity === "day",
    "usage.7d granularity day / usage.30d granularity day",
    { seven: [u7.range, u7.granularity], thirty: [u30.range, u30.granularity] },
  );
  reporter.report(
    "overview/16",
    u24.totals && u24.totals.requests === 920 && u24.totals.usageUsd === null,
    "usage.24h.totals {requests:920, usageUsd:null}",
    u24.totals && { requests: u24.totals.requests, usageUsd: u24.totals.usageUsd },
  );
  const models24 = (u24.totals && u24.totals.models) || [];
  reporter.report(
    "overview/17",
    models24.length === 2 && models24[0].model === "deepseek-v4.1-flash:1017" && models24[0].requests === 575 && models24[0].sharePct === 62.5 &&
      models24[1].model === "glm-5.3-flash" && models24[1].requests === 345 && models24[1].sharePct === 37.5,
    "usage.24h models desc by requests with sharePct (575@62.5, 345@37.5)",
    models24.map((model) => `${model.model}:${model.requests}@${model.sharePct}%`),
  );
  reporter.report(
    "overview/18",
    models24.length > 0 && models24.every((model) => model.usageUsd === null),
    "legacy models keep usageUsd null (no invented cost)",
    models24.map((model) => model.usageUsd),
  );
  const models7 = (u7.totals && u7.totals.models) || [];
  const other = models7.find((model) => model.model === "__other__");
  reporter.report(
    "overview/19",
    u7.totals && u7.totals.requests === 4000 && models7.length === 3 && other !== undefined && other.requests === 500 && other.sharePct === 12.5,
    "upstream remainder -> trailing __other__ (500@12.5%) and range total 4000",
    { requests: u7.totals && u7.totals.requests, models: models7.map((model) => `${model.model}:${model.requests}@${model.sharePct}%`) },
  );
  const buckets24 = u24.buckets || [];
  reporter.report(
    "overview/20",
    buckets24.length === 24 && buckets24[5] && buckets24[5].requests === 0,
    "usage.24h.buckets = 24 hourly buckets, zero-filled (bucket 5 is a faint 0)",
    { length: buckets24.length, bucket5: buckets24[5] && buckets24[5].requests },
  );
  reporter.report(
    "overview/21",
    buckets24.length === 24 && buckets24.every((bucket, index) => index === 0 || Date.parse(bucket.from) >= Date.parse(buckets24[index - 1].from)),
    "usage.24h.buckets are chronological",
    buckets24.length > 1 ? [buckets24[0] && buckets24[0].from, buckets24[23] && buckets24[23].from] : buckets24.length,
  );
  reporter.report(
    "overview/22",
    buckets24.every((bucket) => isIso(bucket.from) && isIso(bucket.until) && typeof bucket.partial === "boolean" && typeof bucket.requests === "number" && Array.isArray(bucket.models)),
    "every bucket is {from,until,partial,requests,models[]}",
    buckets24[0],
  );
  reporter.report(
    "overview/23",
    (u7.buckets || []).length === 7 && (u30.buckets || []).length === 30,
    "usage.7d.buckets 7, usage.30d.buckets 30",
    { seven: (u7.buckets || []).length, thirty: (u30.buckets || []).length },
  );
  reporter.report(
    "overview/24",
    overview.config && overview.config.pollIntervalMin === 5 && overview.config.lowSessionPct === 10 && overview.config.lowWeeklyPct === 10,
    "overview.config echoes {5,10,10}",
    overview.config,
  );

  /* -------------------------------------------------------- C. GET /status */

  const statusResponse = await mainHarness.request(`${PREFIX}/status`);
  const status = statusResponse.json;
  reporter.report("status-route/01", statusResponse.status === 200 && JSON_CT.test(statusResponse.headers["content-type"] ?? "") && statusResponse.headers["cache-control"] === "no-store", "GET /status -> 200 JSON no-store", statusResponse.status);
  reporter.report("status-route/02", status !== undefined && status.ok === true && isIso(status.asOf) && status.plan === "legacy", "ok:true, asOf ISO, plan legacy", status && { ok: status.ok, asOf: status.asOf, plan: status.plan });
  reporter.report(
    "status-route/03",
    status.windows && status.windows.session && status.windows.session.remainingPercent === 92.5 && isIso(status.windows.session.resetsAt) && typeof status.windows.session.resetInSec === "number" &&
      status.windows.weekly && status.windows.weekly.remainingPercent === 67.7,
    "windows.session 92.5 / weekly 67.7 with resetsAt+resetInSec",
    status && status.windows,
  );
  reporter.report("status-route/04", status.included === null, "included null (legacy)", status && status.included);
  reporter.report(
    "status-route/05",
    status.thresholds && status.thresholds.sessionPct === 10 && status.thresholds.weeklyPct === 10,
    "thresholds {sessionPct:10, weeklyPct:10}",
    status && status.thresholds,
  );
  reporter.report(
    "status-route/06",
    status.low && status.low.session === false && status.low.weekly === false && status.low.any === false,
    "low {session:false,weekly:false,any:false}",
    status && status.low,
  );
  reporter.report(
    "status-route/07",
    status.usage && status.usage.hourly && status.usage.hourly.requests === 920 && status.usage.hourly.topModel === "deepseek-v4.1-flash:1017" && status.usage.hourly.topModelRequests === 575,
    "usage.hourly {requests:920, topModel, topModelRequests:575}",
    status && status.usage && status.usage.hourly,
  );
  reporter.report(
    "status-route/08",
    status.usage && status.usage.weekly && status.usage.weekly.requests === 4000 && status.usage.weekly.topModel === "deepseek-v4.1-flash:1017" && status.usage.weekly.topModelRequests === 3000,
    "usage.weekly {requests:4000, topModel, topModelRequests:3000}",
    status && status.usage && status.usage.weekly,
  );
  reporter.report(
    "status-route/09",
    status.poll && status.poll.intervalMin === 5 && isIso(status.poll.lastPollAt) && status.poll.lastError === null,
    "poll {intervalMin:5, lastPollAt ISO, lastError:null}",
    status && status.poll,
  );
  const statusKeys = status ? Object.keys(status).sort() : [];
  reporter.report(
    "status-route/10",
    statusKeys.join(",") === ["asOf", "included", "low", "ok", "plan", "poll", "thresholds", "usage", "windows"].sort().join(","),
    "frozen §4.2 top-level key set (no extra/missing keys)",
    statusKeys,
  );

  /* ---------------------------------------------------------- D. GET /usage */

  for (const range of ["24h", "7d", "30d"]) {
    const response = await mainHarness.request(`${PREFIX}/usage?range=${range}`);
    reporter.report(
      `usage-route/${range}`,
      response.status === 200 && JSON_CT.test(response.headers["content-type"] ?? "") && response.json && response.json.range === range,
      `GET /usage?range=${range} -> one UsageRange`,
      response.status === 200 && response.json ? { range: response.json.range, granularity: response.json.granularity, totals: response.json.totals && response.json.totals.requests } : response.text,
    );
  }
  const defaultRange = await mainHarness.request(`${PREFIX}/usage`);
  reporter.report("usage-route/default", defaultRange.status === 200 && defaultRange.json && defaultRange.json.range === "7d", "GET /usage (absent range) defaults to 7d", defaultRange.json && defaultRange.json.range);
  const badRange = await mainHarness.request(`${PREFIX}/usage?range=1h`);
  reporter.report(
    "usage-route/bad",
    badRange.status === 400 && badRange.json && badRange.json.ok === false && badRange.json.error === "BAD_RANGE",
    "range=1h -> 400 {ok:false,error:'BAD_RANGE'}",
    { status: badRange.status, body: badRange.json ?? badRange.text },
  );
  const usagePost = await mainHarness.request(`${PREFIX}/usage?range=24h`, { method: "POST" });
  reporter.report("usage-route/method", usagePost.status === 405, "POST /usage -> 405", usagePost.status);

  /* -------------------------------------------------------- E. POST /refresh */

  const refreshGet = await mainHarness.request(`${PREFIX}/refresh`);
  reporter.report("refresh/01", refreshGet.status === 405, "GET /refresh -> 405", refreshGet.status);
  const beforeRefresh = await mainHarness.request(`${PREFIX}/overview`);
  const callsBefore = mainHarness.stub.log.calls.length;
  const refreshed = await mainHarness.request(`${PREFIX}/refresh`, { method: "POST" });
  const callsAfter = mainHarness.stub.log.calls.length;
  reporter.report(
    "refresh/02",
    refreshed.status === 200 && JSON_CT.test(refreshed.headers["content-type"] ?? "") && refreshed.json && refreshed.json.ok === true,
    "POST /refresh -> 200 fresh overview (ok:true)",
    { status: refreshed.status, ok: refreshed.json && refreshed.json.ok },
  );
  reporter.report(
    "refresh/03",
    refreshed.json && refreshed.json.poll && refreshed.json.poll.lastPollAt !== beforeRefresh.json.poll.lastPollAt,
    "POST /refresh advances poll.lastPollAt",
    { before: beforeRefresh.json.poll.lastPollAt, after: refreshed.json && refreshed.json.poll.lastPollAt },
  );
  reporter.report(
    "refresh/04",
    callsAfter - callsBefore === 4,
    "POST /refresh forces exactly one poll cycle (4 upstream calls)",
    `${callsAfter - callsBefore} calls`,
  );
  const [firstR, secondR] = await Promise.all([
    mainHarness.request(`${PREFIX}/refresh`, { method: "POST" }),
    mainHarness.request(`${PREFIX}/refresh`, { method: "POST" }),
  ]);
  const coalescedCalls = mainHarness.stub.log.calls.length - callsAfter;
  reporter.advisory(
    "refresh/05",
    firstR.status === 200 && secondR.status === 200 && coalescedCalls <= 8,
    "concurrent refreshes coalesce (<=2 cycles, both 200)",
    `${coalescedCalls} calls`,
  );

  /* ------------------------------------------- E2. a failed cycle keeps the snapshot */

  const beforeFailure = await mainHarness.request(`${PREFIX}/overview`);
  mainHarness.stub.setMode("fail");
  const failedRefresh = await mainHarness.request(`${PREFIX}/refresh`, { method: "POST" });
  mainHarness.stub.setMode("ok");
  reporter.report(
    "poll-fail/01",
    failedRefresh.status === 200 && failedRefresh.json && failedRefresh.json.ok === true && failedRefresh.json.poll.lastPollOk === false && typeof failedRefresh.json.poll.lastError === "string",
    "failed poll keeps the document: 200 ok:true with poll.lastPollOk false + lastError",
    { status: failedRefresh.status, poll: failedRefresh.json && failedRefresh.json.poll },
  );
  reporter.report(
    "poll-fail/02",
    failedRefresh.json && beforeFailure.json && failedRefresh.json.balance.session.remainingPercent === beforeFailure.json.balance.session.remainingPercent && failedRefresh.json.usage["24h"].totals.requests === beforeFailure.json.usage["24h"].totals.requests,
    "failed poll keeps the previous numbers",
    failedRefresh.json && { session: failedRefresh.json.balance.session.remainingPercent, requests24h: failedRefresh.json.usage["24h"].totals.requests },
  );
  const recovered = await mainHarness.request(`${PREFIX}/refresh`, { method: "POST" });
  reporter.report(
    "poll-fail/03",
    recovered.json && recovered.json.poll.lastError === null && recovered.json.poll.lastPollOk === true,
    "the next good poll clears lastError",
    recovered.json && recovered.json.poll,
  );

  /* --------------------------------------------------------- F. POST /config */

  const configResponse = await mainHarness.request(`${PREFIX}/config`, {
    method: "POST",
    body: { pollIntervalMin: 30 },
  });
  reporter.report(
    "config-route/01",
    configResponse.status === 200 && configResponse.json && configResponse.json.ok === true && configResponse.json.config && configResponse.json.config.pollIntervalMin === 30,
    "POST /config {pollIntervalMin:30} -> {ok:true,config.pollIntervalMin:30}",
    { status: configResponse.status, body: configResponse.json ?? configResponse.text },
  );
  const afterConfig = await mainHarness.request(`${PREFIX}/overview`);
  reporter.report(
    "config-route/02",
    afterConfig.json && afterConfig.json.poll && afterConfig.json.poll.intervalMin === 30,
    "overview.poll.intervalMin reflects the new value (timer re-armed view)",
    afterConfig.json && afterConfig.json.poll,
  );
  for (const [id, patch, desc] of [
    ["config-route/03", { pollIntervalMin: 0 }, "pollIntervalMin 0"],
    ["config-route/04", { pollIntervalMin: 61 }, "pollIntervalMin 61"],
    ["config-route/05", { pollIntervalMin: 5.5 }, "pollIntervalMin 5.5"],
    ["config-route/06", { lowSessionPct: 101 }, "lowSessionPct 101"],
  ]) {
    const response = await mainHarness.request(`${PREFIX}/config`, { method: "POST", body: patch });
    reporter.report(
      id,
      response.status === 400 && response.json && response.json.ok === false && response.json.error === "BAD_CONFIG",
      `${desc} -> 400 {ok:false,error:'BAD_CONFIG'}`,
      { status: response.status, body: response.json ?? response.text },
    );
  }

  let stateFile = null;
  try {
    stateFile = JSON.parse(readFileSync(join(mainHarness.stateDir, "state.json"), "utf8"));
  } catch (error) {
    stateFile = String(error && error.message);
  }
  reporter.advisory(
    "config-route/07",
    stateFile !== null && typeof stateFile === "object",
    "stateDir/state.json exists and is JSON after a successful poll",
    typeof stateFile === "object" ? Object.keys(stateFile) : stateFile,
  );

  /* --------------------------------------------------------------- G. fence */

  const fencePort = mainHarness.mounted.port;
  const loopback = await mainHarness.request(`${PREFIX}/overview`);
  reporter.report("fence/01", loopback.status === 200, "loopback Host accepted (200)", loopback.status);

  const foreignHost = await httpRequest(fencePort, { path: `${PREFIX}/overview`, headers: { host: "evil.example" } });
  reporter.report(
    "fence/02",
    foreignHost.status === 403 && foreignHost.text.trim() === "forbidden" && /^text\/plain/.test(foreignHost.headers["content-type"] ?? ""),
    "foreign Host -> 403 text/plain 'forbidden'",
    { status: foreignHost.status, ct: foreignHost.headers["content-type"], body: foreignHost.text.trim() },
  );

  mainHarness.services.set("webRuntime", { trustedHosts: ["dsh.example.ts.net"] });
  const trusted = await httpRequest(fencePort, { path: `${PREFIX}/overview`, headers: { host: "dsh.example.ts.net" } });
  reporter.report("fence/03", trusted.status === 200, "trusted authority from ctx.get('webRuntime') accepted (200)", trusted.status);
  mainHarness.services.delete("webRuntime");
  const untrusted = await httpRequest(fencePort, { path: `${PREFIX}/overview`, headers: { host: "dsh.example.ts.net" } });
  reporter.report(
    "fence/04",
    untrusted.status === 403 && untrusted.text.trim() === "forbidden",
    "trusted authority refused when the live source no longer lists it (per-request ctx.get)",
    untrusted.status,
  );

  const foreignOrigin = await mainHarness.request(`${PREFIX}/overview`, { headers: { origin: "http://evil.example" } });
  reporter.report(
    "fence/05",
    foreignOrigin.status === 403 && foreignOrigin.text.trim() === "forbidden",
    "foreign Origin -> 403 'forbidden'",
    { status: foreignOrigin.status, body: foreignOrigin.text.trim() },
  );
  const crossSite = await mainHarness.request(`${PREFIX}/overview`, { headers: { "sec-fetch-site": "cross-site" } });
  reporter.report("fence/06", crossSite.status === 403 && crossSite.text.trim() === "forbidden", "sec-fetch-site: cross-site -> 403 'forbidden'", crossSite.status);
  const sameOrigin = await mainHarness.request(`${PREFIX}/overview`, { headers: { origin: `http://127.0.0.1:${fencePort}` } });
  reporter.report("fence/07", sameOrigin.status === 200, "same-origin Origin accepted (200)", sameOrigin.status);
  const fenceRefresh = await mainHarness.request(`${PREFIX}/refresh`, { method: "POST", headers: { host: "evil.example" } });
  reporter.report("fence/08", fenceRefresh.status === 403, "fence applies to POST routes too (403 before 405/200 logic)", fenceRefresh.status);

  // Persistence: a second apply() over the SAME stateDir must load the saved interval.
  const persistedStateDir = mainHarness.stateDir;
  await mainHarness.dispose();
  mainHarness = null;
  const restarted = await startHost({ config: { stateDir: persistedStateDir }, upstream: { now: Date.now() } });
  const restartedOverview = await waitForOverview(restarted);
  reporter.report(
    "config-route/08",
    restartedOverview.json && restartedOverview.json.poll && restartedOverview.json.poll.intervalMin === 30,
    "POST /config persists: re-apply with the same stateDir sees intervalMin 30",
    restartedOverview.json && restartedOverview.json.poll,
  );
  // A re-apply over a persisted stateDir must still run its immediate first poll
  // (CONTRACT.md §3), not only render the persisted snapshot.
  await waitFor(
    async () => restarted.stub.log.calls.length >= 4,
    { timeoutMs: 4000, intervalMs: 40, what: "immediate poll after a re-apply with persisted state" },
  ).then(
    () => reporter.report("config-route/09", true, "re-apply with a persisted snapshot still runs the immediate first poll (4 upstream calls)", `${restarted.stub.log.calls.length} calls`),
    (error) => reporter.report("config-route/09", false, "re-apply with a persisted snapshot still runs the immediate first poll (4 upstream calls)", String(error && error.message)),
  );
  await restarted.dispose();

  /* ------------------------------------------------- H. no-credential state */

  const previousDshHome = process.env.DSH_HOME;
  const previousCwd = process.cwd();
  const emptyHome = tempDir("dsh-oc-empty-home-");
  process.env.DSH_HOME = emptyHome;
  process.chdir(emptyHome);
  const noCred = await startHost({
    config: { apiKey: undefined, apiKeyEnv: "VERIFY_OC_ABSENT_XYZ", pollIntervalMin: 60 },
    upstream: {},
  });
  const noCredOverview = await noCred.request(`${PREFIX}/overview`);
  reporter.report("nocred/01", noCred.applyError === null, "apply() with a missing credential never throws", noCred.applyError ?? "returned cleanly");
  reporter.report(
    "nocred/02",
    noCredOverview.status === 200 && noCredOverview.json && noCredOverview.json.ok === false && noCredOverview.json.status === "no-credential" && typeof noCredOverview.json.message === "string",
    "GET /overview -> 200 {ok:false,status:'no-credential',message}",
    { status: noCredOverview.status, body: noCredOverview.json ?? noCredOverview.text },
  );
  const noCredStatus = await noCred.request(`${PREFIX}/status`);
  reporter.report(
    "nocred/03",
    noCredStatus.status === 200 && noCredStatus.json && noCredStatus.json.ok === false && noCredStatus.json.status === "no-credential",
    "GET /status -> 200 {ok:false,status:'no-credential'} (agents treat ok:false as unknown)",
    { status: noCredStatus.status, body: noCredStatus.json ?? noCredStatus.text },
  );
  await noCred.dispose();
  process.chdir(previousCwd);
  if (previousDshHome === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = previousDshHome;

  /* -------------------------------------------------------- I. no-data state */

  const failing = await startHost({ config: { pollIntervalMin: 60 }, upstream: { mode: "fail" } });
  const noDataOverview = await waitFor(
    async () => {
      const response = await failing.request(`${PREFIX}/overview`);
      return response.json && response.json.ok === false ? response : false;
    },
    { timeoutMs: 8000, intervalMs: 40, what: "failed first poll (overview ok:false)" },
  );
  reporter.report(
    "nodata/01",
    noDataOverview.status === 200 && noDataOverview.json && noDataOverview.json.ok === false && noDataOverview.json.status === "no-data" && typeof noDataOverview.json.message === "string",
    "failed first poll -> 200 {ok:false,status:'no-data',message}",
    { status: noDataOverview.status, body: noDataOverview.json ?? noDataOverview.text },
  );
  await failing.dispose();
} catch (error) {
  reporter.report("route/99", false, "route checks completed without an uncaught harness error", String((error && error.stack) ?? error));
} finally {
  for (const harness of [...liveHarnesses]) {
    try {
      await harness.dispose();
    } catch {
      /* best effort */
    }
  }
  cleanupTempDirs();
}

reporter.finish();
