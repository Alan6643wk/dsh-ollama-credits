#!/usr/bin/env node
/**
 * verify/lib/common.mjs — shared reporting + socket helpers for the
 * dsh-ollama-credits acceptance harness (CONTRACT.md §6).
 *
 * House style (see dsh-media-viewer/verify, dsh-trusted-local/verify): plain Node
 * ESM, no dependencies, one raw PASS/FAIL line per check with the observed value,
 * and a non-zero exit code when a counted check fails. `(advisory)` lines document
 * seams CONTRACT.md does not fix and never decide the exit code.
 */
import http from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* ---------------------------------------------------------------- reporting */

/** A reporter with counted checks, advisory lines, and a RESULT/exit summary. */
export function createReporter() {
  let total = 0;
  let failed = 0;
  const state = { total: 0, failed: 0 };

  function report(id, ok, desc, observed) {
    const passed = ok === true;
    total += 1;
    state.total = total;
    if (!passed) {
      failed += 1;
      state.failed = failed;
    }
    console.log(`${passed ? "PASS" : "FAIL"} [${id}] ${desc}${observed === undefined || observed === "" ? "" : ` :: ${short(observed)}`}`);
  }

  function advisory(id, ok, desc, observed) {
    console.log(`${ok === true ? "PASS" : "FAIL"} (advisory) [${id}] ${desc}${observed === undefined || observed === "" ? "" : ` :: ${short(observed)}`}`);
  }

  function finish() {
    const ok = failed === 0;
    console.log(`RESULT ${ok ? "PASS" : "FAIL"}: ${total - failed}/${total} counted checks passed`);
    process.exitCode = ok ? 0 : 1;
    return ok;
  }

  return { report, advisory, finish, state };
}

/** Compact one-value rendering for a PASS/FAIL detail suffix. */
export function short(value, max = 320) {
  let text;
  if (typeof value === "string") text = value;
  else {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  }
  if (text === undefined) text = String(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Hang-breaker: nothing in this harness should ever take this long. */
export function guard(ms, what) {
  const timer = setTimeout(() => {
    console.error(`verify: HARNESS TIMEOUT after ${Math.round(ms / 1000)}s — ${what}`);
    process.exit(2);
  }, ms);
  timer.unref();
  return timer;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------------- values */

export function isIso(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function approx(actual, expected, tolerance) {
  return typeof actual === "number" && Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
}

export function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Assert a closed-shaped JSON object: every expected key present, no unknown key. */
export function shape(value, keys) {
  if (!isObject(value)) return { ok: false, why: `not an object (${typeof value})` };
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  const missing = expected.filter((key) => !actual.includes(key));
  const extra = actual.filter((key) => !expected.includes(key));
  return { ok: missing.length === 0 && extra.length === 0, missing, extra };
}

/* ------------------------------------------------------------------ temp dirs */

const tempDirs = [];
export function tempDir(prefix = "dsh-oc-verify-") {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}
export function cleanupTempDirs() {
  for (const dir of tempDirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
}

/* ------------------------------------------------------------------- sockets */

/** Listen on an ephemeral loopback port; resolves with the port. */
export function listen(server, host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("error", onError);
      reject(error);
    };
    server.once("error", onError);
    server.listen(0, host, () => {
      server.off("error", onError);
      resolve(server.address().port);
    });
  });
}

export function closeServer(server) {
  return new Promise((resolve) => {
    if (typeof server.closeAllConnections === "function") server.closeAllConnections();
    server.close(() => resolve());
  });
}

/**
 * A raw HTTP request over a real socket. Deliberately NOT `fetch`: the §4.6 fence
 * is driven by the `Host` / `Origin` / `sec-fetch-site` headers, and `fetch`
 * refuses to set `Host`.
 *
 * @param port - loopback port to dial.
 * @param options - { method, path, headers, body, timeoutMs }.
 * @returns { status, headers, text, json }
 */
export function httpRequest(port, options = {}) {
  const { method = "GET", path = "/", headers = {}, body, timeoutMs = 10000 } = options;
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
    const request = http.request(
      {
        host: "127.0.0.1",
        port,
        method,
        path,
        headers: {
          ...(payload === undefined ? {} : { "content-type": "application/json", "content-length": String(payload.length) }),
          ...headers,
        },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json;
          try {
            json = JSON.parse(text);
          } catch {
            json = undefined;
          }
          resolve({ status: response.statusCode, headers: response.headers, text, json });
        });
      },
    );
    request.setTimeout(timeoutMs, () => request.destroy(new Error(`request timeout after ${timeoutMs}ms: ${method} ${path}`)));
    request.on("error", reject);
    if (payload !== undefined) request.write(payload);
    request.end();
  });
}

/** Poll `probe` until it returns truthy or the budget expires; returns the last value. */
export async function waitFor(probe, { timeoutMs = 5000, intervalMs = 50, what = "condition" } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await probe();
    if (last) return last;
    await sleep(intervalMs);
  }
  throw new Error(`${what} not met within ${timeoutMs}ms (last=${short(last)})`);
}
