/**
 * verify/lib/fixtures.mjs — deterministic, offline stand-ins for the two things
 * the harness must not depend on: the Ollama Cloud API and the DSH loader.
 *
 * The balance/usage payloads are transcriptions of the LIVE shapes measured on
 * 2026-11-27 (CONTRACT.md "Measured facts"): legacy balance is
 * `included.session/weekly + purchased.balance_usd`; `/api/usage` is
 * `{range,scope,granularity,from,until,totals,buckets[]}` with `groups:
 * [{model,request_count}]` and request counts only (legacy plan).
 */
import http from "node:http";
import { closeServer, httpRequest, listen } from "./common.mjs";

const HOUR = 3600_000;
const DAY = 86_400_000;
export const iso = (ms) => new Date(ms).toISOString();
export const floorHour = (ms) => Math.floor(ms / HOUR) * HOUR;
export const floorDay = (ms) => Math.floor(ms / DAY) * DAY;

/* --------------------------------------------------------------- balance */

/** Legacy plan: session + weekly percentages and USD purchase balance. */
export function legacyBalance(now = Date.now()) {
  return {
    included: {
      session: { remaining_percent: 92.5, resets_at: iso(now + HOUR) },
      weekly: { remaining_percent: 67.7, resets_at: iso(now + 123_456_000) },
    },
    purchased: { balance_usd: 0 },
  };
}

/** Credit-metered plan: included USD allowance over a period + purchased USD. */
export function creditsBalance(now = Date.now()) {
  return {
    included: {
      balance_usd: 12.34,
      allowance_usd: 50,
      period: { from: iso(now - DAY), until: iso(now + 2 * HOUR) },
    },
    purchased: { balance_usd: 3.21 },
  };
}

/* ----------------------------------------------------------------- usage */

function bucket(fromMs, untilMs, requests, groups, extra = {}) {
  return {
    from: iso(fromMs),
    until: iso(untilMs),
    request_count: requests,
    ...(groups === undefined ? {} : { groups }),
    ...extra,
  };
}

/**
 * One upstream `/api/usage?range=…&group_by=model` payload on a clean window.
 * Window lengths are exact so the host's zero-fill grid is unambiguous:
 * 24h -> 24 hourly buckets, 7d -> 7 daily buckets, 30d -> 30 daily buckets.
 */
export function usagePayload(range, now = Date.now()) {
  if (range === "24h") {
    const start = floorHour(now) - 23 * HOUR;
    const buckets = [];
    let deepseek = 0;
    let glm = 0;
    for (let i = 0; i < 24; i += 1) {
      const from = start + i * HOUR;
      const requests = i === 5 ? 0 : 40; // one faint (zero) bar
      const groups = i === 5 ? [] : [
        { model: "deepseek-v4.1-flash:1017", request_count: 25 },
        { model: "glm-5.3-flash", request_count: 15 },
      ];
      if (i !== 5) {
        deepseek += 25;
        glm += 15;
      }
      buckets.push(bucket(from, from + HOUR, requests, groups, { partial: i === 23 }));
    }
    return {
      range: "24h",
      scope: "self",
      granularity: "hour",
      group_by: "model",
      from: iso(start),
      until: iso(start + 24 * HOUR),
      totals: { request_count: deepseek + glm, groups: [
        { model: "deepseek-v4.1-flash:1017", request_count: deepseek },
        { model: "glm-5.3-flash", request_count: glm },
      ] },
      buckets,
    };
  }

  if (range === "7d") {
    const start = floorDay(now) - 6 * DAY;
    const buckets = [];
    let deepseek = 0;
    let glm = 0;
    for (let i = 0; i < 7; i += 1) {
      const from = start + i * DAY;
      const requests = i === 6 ? 1000 : 500;
      const d = i === 6 ? 600 : 400;
      const g = i === 6 ? 140 : 60;
      deepseek += d;
      glm += g;
      buckets.push(bucket(from, from + DAY, requests, [
        { model: "deepseek-v4.1-flash:1017", request_count: d },
        { model: "glm-5.3-flash", request_count: g },
      ], { partial: i === 6 }));
    }
    const total = deepseek + glm + 500;
    return {
      range: "7d",
      scope: "self",
      granularity: "day",
      group_by: "model",
      from: iso(start),
      until: iso(start + 7 * DAY),
      totals: {
        request_count: total,
        groups: [
          { model: "deepseek-v4.1-flash:1017", request_count: deepseek },
          { model: "glm-5.3-flash", request_count: glm },
        ],
        // Upstream folds the overflow when it truncates to 10 groups; the host
        // must keep that quantity as one __other__ entry (CONTRACT.md §4.1).
        remainder: { request_count: total - deepseek - glm },
      },
      buckets,
    };
  }

  if (range === "30d") {
    const start = floorDay(now) - 29 * DAY;
    const buckets = [];
    for (let i = 0; i < 30; i += 1) {
      const from = start + i * DAY;
      buckets.push(bucket(from, from + DAY, 100, [
        { model: "deepseek-v4.1-flash:1017", request_count: 70 },
        { model: "glm-5.3-flash", request_count: 30 },
      ], { partial: i === 29 }));
    }
    return {
      range: "30d",
      scope: "self",
      granularity: "day",
      group_by: "model",
      from: iso(start),
      until: iso(start + 30 * DAY),
      totals: { request_count: 3000, groups: [
        { model: "deepseek-v4.1-flash:1017", request_count: 2100 },
        { model: "glm-5.3-flash", request_count: 900 },
      ] },
      buckets,
    };
  }

  return undefined;
}

/* -------------------------------------------------------------- stub API */

/**
 * A local Ollama Cloud stand-in. Records every request (path, query,
 * authorization, user-agent) so the harness can prove the poll cycle's shape
 * without any network.
 *
 * @param options - { now, mode: 'ok'|'fail', balance, usage: { '24h': payload } }
 */
export async function makeStubApi(options = {}) {
  const { now = Date.now(), balance, usage } = options;
  let mode = options.mode ?? "ok";
  const log = { calls: [] };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    log.calls.push({
      method: req.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      authorization: req.headers.authorization,
      userAgent: req.headers["user-agent"],
      at: Date.now(),
    });
    const send = (status, body) => {
      res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(body));
    };
    if (mode === "fail") return send(500, { error: "stub failure" });
    if (url.pathname === "/api/balance") return send(200, balance ?? legacyBalance(now));
    if (url.pathname === "/api/usage") {
      const range = url.searchParams.get("range");
      const payload = usage?.[range] ?? usagePayload(range, now);
      if (payload === undefined) return send(400, { error: "bad range" });
      return send(200, payload);
    }
    return send(404, { error: "not found" });
  });
  const port = await listen(server);
  return {
    base: `http://127.0.0.1:${port}`,
    port,
    log,
    server,
    /** Flip the upstream between healthy and failing without a restart. */
    setMode: (next) => {
      mode = next;
    },
    close: () => closeServer(server),
  };
}

/* -------------------------------------------------------------- fake ctx */

/**
 * The loader seam CONTRACT.md §3/§4.6 documents: `webServer.register`,
 * per-request `ctx.get(name)`, and `ctx.effect(fn)` for timer disposal. No other
 * DSH service is reachable, which is exactly the contract's rule that a missing
 * service must not park the row.
 */
export function makeCtx(options = {}) {
  const { trustedHosts } = options;
  const routes = [];
  const services = new Map();
  if (trustedHosts !== undefined) services.set("webRuntime", { trustedHosts });
  const disposers = [];
  const ctx = {
    get(name) {
      return services.get(name);
    },
    effect(fn) {
      const dispose = fn();
      if (typeof dispose === "function") disposers.push(dispose);
      return () => {};
    },
    webServer: {
      register(route) {
        if (route === null || typeof route !== "object" || typeof route.path !== "string" || typeof route.handler !== "function") {
          throw new Error(`bad route registration: ${JSON.stringify(route)}`);
        }
        if (routes.some((existing) => existing.kind === route.kind && existing.path === route.path)) {
          throw new Error(`duplicate route: ${route.kind} ${route.path}`);
        }
        routes.push(route);
        return () => {
          const index = routes.indexOf(route);
          if (index >= 0) routes.splice(index, 1);
        };
      },
    },
  };
  return { ctx, routes, services, disposers };
}

/** Serve the registered routes on a real loopback socket for wire-level checks. */
export async function mountRoutes(routes, host = "127.0.0.1") {
  const server = http.createServer((req, res) => {
    let url;
    try {
      url = new URL(req.url, "http://127.0.0.1");
    } catch {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("bad request");
      return;
    }
    const route = routes.find(
      (candidate) =>
        candidate.path === url.pathname ||
        (candidate.kind === "prefix" && url.pathname.startsWith(candidate.path)),
    );
    if (route === undefined) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    try {
      route.handler(req, res);
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: "HANDLER_THREW", message: String(error && error.stack) }));
    }
  });
  const port = await listen(server, host);
  return {
    server,
    port,
    base: `http://${host}:${port}`,
    request: (path, options) => httpRequest(port, { path, ...options }),
    close: () => closeServer(server),
  };
}
