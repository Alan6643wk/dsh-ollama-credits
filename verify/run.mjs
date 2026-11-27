#!/usr/bin/env node
/**
 * verify/run.mjs — CONTRACT.md §6 acceptance harness entry point.
 *
 * Runs the checks in the contract's order and streams their raw PASS/FAIL lines:
 *
 *   1. build-check — `node build.mjs`, `node build.mjs --check`, `node --check`
 *   2. host-check  — the pure host helpers (§6.2)
 *   3. route-check — apply() + real HTTP, frozen §4 schemas, §4.6 fence (§6.3)
 *
 * No dependency on npm packages, no network. Exit code is non-zero when any
 * counted check in any child fails; a child that dies on an uncaught exception
 * is still reported with its exit code (and its raw output is streamed above).
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const CHILD_TIMEOUT_MS = 180_000;

const CHECKS = [
  ["build-check", join(HERE, "build-check.mjs")],
  ["host-check", join(HERE, "host-check.mjs")],
  ["route-check", join(HERE, "route-check.mjs")],
];

function run(name, file) {
  return new Promise((resolve) => {
    console.log(`---- ${name}: ${process.execPath} ${file} ----`);
    const child = spawn(process.execPath, [file], { cwd: REPO, stdio: ["ignore", "pipe", "pipe"] });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      console.log(`FAIL run/${name}: killed after ${CHILD_TIMEOUT_MS}ms (child hung — leaked timer or socket)`);
      child.kill("SIGKILL");
    }, CHILD_TIMEOUT_MS);
    timer.unref();
    child.stdout.on("data", (chunk) => process.stdout.write(chunk));
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      console.log(`FAIL run/${name}: spawn error: ${error.message}`);
      resolve({ name, ok: false });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (timedOut) {
        resolve({ name, ok: false });
        return;
      }
      const ok = code === 0;
      console.log(`${ok ? "PASS" : "FAIL"} run/${name}: exit=${code}${signal ? ` signal=${signal}` : ""}`);
      resolve({ name, ok });
    });
  });
}

const results = [];
for (const [name, file] of CHECKS) results.push(await run(name, file));

console.log("---- verify summary ----");
for (const result of results) console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}`);
const bad = results.filter((result) => !result.ok);
if (bad.length > 0) {
  console.log(`VERIFY FAIL: ${bad.map((result) => result.name).join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("VERIFY PASS: build-check + host-check + route-check");
  process.exitCode = 0;
}
