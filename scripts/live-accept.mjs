#!/usr/bin/env node
/**
 * scripts/live-accept.mjs — CONTRACT.md §6.4 live acceptance against a running
 * DSH host: every §4 route over real HTTP, and the `/status` / `/overview`
 * numbers compared with a direct `https://ollama.com/api` call.
 *
 * The API key is read from $DSH_HOME/.credentials.yaml (falling back to the
 * conventional ~/.dsh path) and is NEVER printed — only its presence is reported.
 * Run: node scripts/live-accept.mjs [baseUrl]   (default http://127.0.0.1:3081)
 */
import { readFileSync } from "node:fs";
import http from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = (process.argv[2] ?? "http://127.0.0.1:3081").replace(/\/+$/, "");
const PREFIX = `${BASE}/api/dsh-ollama-credits`;
const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), ".dsh");

let total = 0;
let failed = 0;
function report(id, ok, desc, observed) {
  total += 1;
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} [${id}] ${desc}${observed === undefined ? "" : ` :: ${render(observed)}`}`);
}
function render(value) {
  if (typeof value === "string") return value;
  try {
    const text = JSON.stringify(value);
    return text.length > 400 ? `${text.slice(0, 400)}…` : text;
  } catch {
    return String(value);
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${PREFIX}${path}`, {
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
    method: options.method ?? "GET",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: response.status, headers: response.headers, text, json };
}

/** Read one refs[NAME] value out of the DSH credential store; never echo it. */
function readRef(name) {
  let text;
  try {
    text = readFileSync(join(DSH_HOME, ".credentials.yaml"), "utf8");
  } catch {
    return undefined;
  }
  let inRefs = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^refs:\s*$/.test(line)) {
      inRefs = true;
      continue;
    }
    if (inRefs && /^\S/.test(line)) break;
    const match = inRefs && line.match(/^\s+([^:#\s]+):\s*(.*)$/);
    if (match && match[1] === name) {
      let value = match[2].trim();
      if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) value = value.slice(1, -1);
      return value;
    }
  }
  return undefined;
}

const key = readRef("OLLAMA_CLOUD_API_KEY");
console.log(`BASE ${BASE}  credential ${key === undefined ? "MISSING" : `present (${key.length} chars)`}`);

async function cloud(path) {
  if (key === undefined) throw new Error("no OLLAMA_CLOUD_API_KEY in the credential store");
  const response = await fetch(`https://ollama.com${path}`, {
    headers: { authorization: `Bearer ${key}`, "user-agent": "dsh-ollama-credits/0.1.0" },
  });
  if (!response.ok) throw new Error(`cloud ${path} -> HTTP ${response.status}`);
  return response.json();
}

const isIso = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));

/* ---------------------------------------------------------- routes / shapes */

const overviewResponse = await request("/overview");
const overview = overviewResponse.json;
report("live/01", overviewResponse.status === 200 && overview && overview.ok === true, "GET /overview -> 200 ok:true", overviewResponse.status);
report(
  "live/02",
  /^application\/json;\s*charset=utf-8$/i.test(overviewResponse.headers.get("content-type") ?? "") && overviewResponse.headers.get("cache-control") === "no-store",
  "overview content-type JSON + cache-control no-store",
  { ct: overviewResponse.headers.get("content-type"), cc: overviewResponse.headers.get("cache-control") },
);
report("live/03", isIso(overview && overview.generatedAt), "overview.generatedAt ISO", overview && overview.generatedAt);
report(
  "live/04",
  overview.poll && typeof overview.poll.intervalMin === "number" && isIso(overview.poll.lastPollAt) && overview.poll.lastPollOk === true && overview.poll.lastError === null,
  "overview.poll {intervalMin,lastPollAt,lastPollOk:true,lastError:null}",
  overview.poll,
);
report(
  "live/05",
  overview.balance && ["legacy", "credits", "unknown"].includes(overview.balance.plan) && isIso(overview.balance.asOf),
  "overview.balance.plan in legacy|credits|unknown + asOf ISO",
  overview.balance && { plan: overview.balance.plan, asOf: overview.balance.asOf },
);
const ranges = ["24h", "7d", "30d"];
report(
  "live/06",
  ranges.every((range) => overview.usage && overview.usage[range] && overview.usage[range].range === range && Array.isArray(overview.usage[range].buckets)),
  "overview.usage has 24h/7d/30d UsageRanges with buckets",
  ranges.map((range) => {
    const entry = overview.usage && overview.usage[range];
    return entry && `${range}:${entry.buckets.length}b/${entry.totals.models.length}m`;
  }),
);
report(
  "live/07",
  overview.usage && overview.usage["24h"].buckets.length > 0 && overview.usage["24h"].buckets.every((bucket) => isIso(bucket.from) && typeof bucket.requests === "number"),
  "24h buckets are real request counts",
  overview.usage && overview.usage["24h"].buckets.slice(-2),
);

const statusResponse = await request("/status");
const status = statusResponse.json;
report("live/08", statusResponse.status === 200 && status && status.ok === true && status.plan === "legacy", "GET /status -> 200 ok:true legacy", status && status.plan);
report(
  "live/09",
  status.windows && typeof status.windows.session.remainingPercent === "number" && isIso(status.windows.session.resetsAt) && typeof status.windows.weekly.remainingPercent === "number",
  "status.windows session/weekly real",
  status.windows,
);
report("live/10", status.thresholds && status.low && typeof status.low.any === "boolean", "status.thresholds + low.any", status && { thresholds: status.thresholds, low: status.low });
report(
  "live/11",
  status.usage && status.usage.hourly && typeof status.usage.hourly.requests === "number" && status.usage.weekly && typeof status.usage.weekly.requests === "number",
  "status.usage.hourly/weekly real numbers",
  status.usage,
);

for (const range of ranges) {
  const response = await request(`/usage?range=${range}`);
  report(
    `live/12-${range}`,
    response.status === 200 && response.json && response.json.range === range && Array.isArray(response.json.buckets),
    `GET /usage?range=${range} -> UsageRange`,
    response.json && { range: response.json.range, granularity: response.json.granularity, requests: response.json.totals.requests },
  );
}
const badRange = await request("/usage?range=1h");
report("live/13", badRange.status === 400 && badRange.json && badRange.json.error === "BAD_RANGE", "range=1h -> 400 BAD_RANGE", badRange.json);
const method405 = await request("/refresh");
report("live/14", method405.status === 405, "GET /refresh -> 405", method405.status);

/* ------------------------------------------------- direct cloud comparison */

let directBalance;
let direct24h;
let direct7d;
try {
  directBalance = await cloud("/api/balance");
  direct24h = await cloud("/api/usage?range=24h&group_by=model");
  direct7d = await cloud("/api/usage?range=7d&group_by=model");
  report("live/15", true, "direct https://ollama.com/api/balance + /api/usage reachable (key present, never printed)", {
    session: directBalance.included.session.remaining_percent,
    weekly: directBalance.included.weekly.remaining_percent,
  });
} catch (error) {
  report("live/15", false, "direct cloud reachable", String(error && error.message));
}

if (directBalance !== undefined) {
  // The direct call lands after the poll, and live usage can move the percentage in
  // between; 1 percentage point tolerates that drift while still catching real errors.
  const near = (left, right) => typeof left === "number" && typeof right === "number" && Math.abs(left - right) <= 1;
  report(
    "live/16",
    near(status.windows.session.remainingPercent, directBalance.included.session.remaining_percent),
    "/status session.remainingPercent matches direct /api/balance (<=1pp live drift)",
    { status: status.windows.session.remainingPercent, direct: directBalance.included.session.remaining_percent },
  );
  report(
    "live/17",
    near(status.windows.weekly.remainingPercent, directBalance.included.weekly.remaining_percent),
    "/status weekly.remainingPercent matches direct /api/balance (<=1pp live drift)",
    { status: status.windows.weekly.remainingPercent, direct: directBalance.included.weekly.remaining_percent },
  );
  report(
    "live/18",
    Date.parse(status.windows.session.resetsAt) === Date.parse(directBalance.included.session.resets_at) &&
      Date.parse(status.windows.weekly.resetsAt) === Date.parse(directBalance.included.weekly.resets_at),
    "/status resetsAt matches direct /api/balance",
    { session: [status.windows.session.resetsAt, directBalance.included.session.resets_at], weekly: [status.windows.weekly.resetsAt, directBalance.included.weekly.resets_at] },
  );
}
if (direct7d !== undefined) {
  const drift = (polled, direct) => {
    if (typeof polled !== "number" || typeof direct !== "number") return Number.POSITIVE_INFINITY;
    return Math.abs(polled - direct) / Math.max(1, direct);
  };
  const hourlyDrift = drift(status.usage.hourly.requests, direct24h.totals.request_count);
  const weeklyDrift = drift(status.usage.weekly.requests, direct7d.totals.request_count);
  report("live/19", hourlyDrift <= 0.05, "/status usage.hourly.requests within 5% of direct 24h total (poll vs now)", {
    status: status.usage.hourly.requests,
    direct: direct24h.totals.request_count,
    drift: `${(hourlyDrift * 100).toFixed(2)}%`,
  });
  report("live/20", weeklyDrift <= 0.05, "/status usage.weekly.requests within 5% of direct 7d total", {
    status: status.usage.weekly.requests,
    direct: direct7d.totals.request_count,
    drift: `${(weeklyDrift * 100).toFixed(2)}%`,
  });
  const topDirect = [...direct7d.totals.groups].sort((left, right) => right.request_count - left.request_count)[0];
  report("live/21", status.usage.weekly.topModel === topDirect.model, "/status weekly topModel matches direct 7d groups", {
    status: status.usage.weekly.topModel,
    direct: topDirect.model,
  });
  report(
    "live/22",
    overview.usage["7d"].totals.models.length <= 11 && overview.usage["7d"].totals.models.every((model) => typeof model.sharePct === "number"),
    "7d models list bounded (<=10+__other__) with sharePct",
    overview.usage["7d"].totals.models.map((model) => `${model.model}:${model.requests}@${model.sharePct}%`),
  );
}

/* -------------------------------------------------------------- POST routes */

const before = await request("/status");
const refreshed = await request("/refresh", { method: "POST" });
report("live/23", refreshed.status === 200 && refreshed.json && refreshed.json.ok === true, "POST /refresh -> 200 fresh overview", { status: refreshed.status, ok: refreshed.json && refreshed.json.ok });
report(
  "live/24",
  refreshed.json && refreshed.json.poll && before.json && refreshed.json.poll.lastPollAt !== before.json.poll.lastPollAt,
  "POST /refresh advances poll.lastPollAt",
  { before: before.json && before.json.poll.lastPollAt, after: refreshed.json && refreshed.json.poll.lastPollAt },
);

const config = await request("/config", { method: "POST", body: { pollIntervalMin: 7 } });
report(
  "live/25",
  config.status === 200 && config.json && config.json.ok === true && config.json.config.pollIntervalMin === 7,
  "POST /config {pollIntervalMin:7} accepted",
  config.json,
);
const afterConfig = await request("/overview");
report("live/26", afterConfig.json && afterConfig.json.poll.intervalMin === 7, "overview reflects intervalMin 7", afterConfig.json && afterConfig.json.poll);
const badConfig = await request("/config", { method: "POST", body: { pollIntervalMin: 0 } });
report("live/27", badConfig.status === 400 && badConfig.json && badConfig.json.error === "BAD_CONFIG", "POST /config invalid -> 400 BAD_CONFIG", badConfig.json);

/* ------------------------------------------------------------------- fence */

function rawRequest(path, headers) {
  // node:http, not fetch: the §4.6 fence is driven by the Host header, which fetch forbids.
  const url = new URL(`${BASE}${path}`);
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: url.hostname, port: url.port, method: "GET", path: url.pathname + url.search, headers },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve({ status: response.statusCode, text: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    request.on("error", reject);
    request.end();
  });
}
const foreign = await rawRequest("/api/dsh-ollama-credits/overview", { host: "evil.example" });
report("live/28", foreign.status === 403 && foreign.text.trim() === "forbidden", "foreign Host -> 403 'forbidden'", { status: foreign.status, body: foreign.text.trim() });
const foreignOrigin = await rawRequest("/api/dsh-ollama-credits/overview", { origin: "http://evil.example" });
report("live/29", foreignOrigin.status === 403 && foreignOrigin.text.trim() === "forbidden", "foreign Origin -> 403 'forbidden'", foreignOrigin.status);
const crossSite = await rawRequest("/api/dsh-ollama-credits/status", { "sec-fetch-site": "cross-site" });
report("live/30", crossSite.status === 403 && crossSite.text.trim() === "forbidden", "cross-site fetch -> 403 'forbidden'", crossSite.status);

/* -------------------------------------------------------------- summary */

console.log(`RESULT ${failed === 0 ? "PASS" : "FAIL"}: ${total - failed}/${total} counted checks passed`);
process.exitCode = failed === 0 ? 0 : 1;
