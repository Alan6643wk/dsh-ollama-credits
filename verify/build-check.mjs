#!/usr/bin/env node
/**
 * verify/build-check.mjs — CONTRACT.md §6.1: generated `lib/` is current and parses.
 *
 * Runs exactly what the README documents (`node build.mjs`, `node build.mjs
 * --check`) plus `node --check` on both generated halves (the same pair
 * `npm run check` runs). Each step is one PASS/FAIL line carrying the child's
 * real exit code and its raw stderr on failure.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createReporter, guard } from "./lib/common.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const reporter = createReporter();
guard(180000, "build checks");

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: REPO, encoding: "utf8", timeout: 120000 });
  return {
    status: result.status,
    signal: result.signal,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
    error: result.error === undefined ? undefined : String(result.error.message ?? result.error),
  };
}

function output(result) {
  const parts = [`exit=${result.status}${result.signal ? ` signal=${result.signal}` : ""}`];
  if (result.error) parts.push(`error=${result.error}`);
  if (result.stdout) parts.push(`stdout=${result.stdout.replace(/\n/g, " | ")}`);
  if (result.stderr) parts.push(`stderr=${result.stderr.replace(/\n/g, " | ")}`);
  return parts.join(" ");
}

const build = run(["build.mjs"]);
reporter.report("build/01", build.status === 0, "node build.mjs exits 0 and regenerates lib/", output(build));
if (build.status !== 0) console.log(`        raw build output: ${output(build)}`);

const check = run(["build.mjs", "--check"]);
reporter.report("build/02", check.status === 0, "node build.mjs --check exits 0 (lib/ is current)", output(check));

const hostSyntax = run(["--check", "lib/index.js"]);
reporter.report("build/03", hostSyntax.status === 0, "node --check lib/index.js parses", output(hostSyntax));

const clientSyntax = run(["--check", "lib/client.js"]);
reporter.report("build/04", clientSyntax.status === 0, "node --check lib/client.js parses", output(clientSyntax));

reporter.finish();
