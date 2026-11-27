# dsh-ollama-credits — CONTRACT

A DSH plugin that monitors **Ollama Cloud** credit usage (session/weekly balance,
reset countdowns, hourly usage, per-model breakdown) and exposes the same facts as
JSON routes for agents and other plugins.

Status: **frozen interface** (v0.1.0). §3 route grammar, §4 JSON schemas, §5 client
bundle shape are what the host half, the client half and any downstream agent
consumer agree on. Change a section only together with both halves.

Measured facts this contract is built on (2026-11-27, live account):

* `GET https://ollama.com/api/balance` with `Authorization: Bearer <key>` →
  `{"included":{"session":{"remaining_percent":n,"resets_at":iso},"weekly":{...}},"purchased":{"balance_usd":n}}`
  (legacy plan shape; a credit-metered plan returns
  `{"included":{"balance_usd":n,"allowance_usd":n,"period":{"from","until"}},"purchased":{...}}`).
* `GET https://ollama.com/api/usage?range=24h|7d|30d[&group_by=model]` →
  `{range,scope,granularity,from,until,totals,buckets[]}`; with `group_by=model` each
  `totals`/bucket gains `groups:[{model,request_count,usage_usd?,input_tokens?,...}]`.
  **Legacy plans report `request_count` only** — no USD, no tokens. At most 10 groups,
  overflow folded into `remainder`.
* Rate limit: 10 requests/minute per user across all keys. One poll cycle = 4 calls.
* The key lives in the DSH credential store at `$DSH_HOME/.credentials.yaml` under
  `refs: { <ENV_NAME>: <secret> }` (`OLLAMA_CLOUD_API_KEY` on this machine); the launch
  environment and `.env` files are fallbacks.

---

## 1. Scope

In scope: the **cloud** API only (never a locally installed Ollama); one compact
sidebar foot card; one first-level settings section with the detail view; JSON routes
for agents; a user-settable poll interval; threshold facts for a future auto-stop
plugin.

Out of scope: auto-stopping/resuming sessions (a future plugin consumes §4.2 and
acts); local Ollama (`127.0.0.1:11434`) as a source; cost estimation on legacy plans
(no data exists); writing anything into the Ollama account.

## 2. Repository layout

```
package.json        loader row + client declaration + scripts
cordis.patch.yml    inserts the host row
build.mjs           src/ -> lib/ (deterministic, no deps)
CONTRACT.md         this document
src/host/index.js   HOST half, one ESM file, copied verbatim to lib/index.js
src/client/*.js     CLIENT half, concatenated in filename order to lib/client.js
verify/             acceptance harness (`npm run verify`)
lib/                generated, committed
```

`lib/` is generated and committed. Never edit `lib/` by hand. `npm run check` is syntax
only; `npm run verify` is the real harness.

## 3. Host half

`src/host/index.js` exports:

| export | shape | meaning |
|---|---|---|
| `name` | `string` | stable row id `dsh-ollama-credits` |
| `inject` | `string[]` | `['webServer']` |
| `apply` | `(ctx, config?) => void` | mounts the poller + routes |
| pure helpers | see §6 | importable without a ctx, for the verify harness |

Config fields (plain object; every one optional, defaults below). The row's Settings
page is provided by the plugin's own UI (§5.4), not by a schemastery Config schema, so
no `@deepseek-ai/*` import is allowed in the host file.

| field | default | meaning |
|---|---|---|
| `apiBase` | `https://ollama.com` | cloud API origin |
| `apiKeyEnv` | `OLLAMA_CLOUD_API_KEY` | credential ref name to resolve |
| `pollIntervalMin` | `5` | poll cadence in minutes, integer 1–60 |
| `lowSessionPct` | `10` | session remaining percent that counts as "low" |
| `lowWeeklyPct` | `10` | weekly remaining percent that counts as "low" |
| `stateDir` | `$DSH_HOME/ollama-credits` | persistence dir (`state.json`) |

Credential resolution order (pure function, §6 `resolveApiKey`), matching the
harness's own credential seam (`dsh-credentials-local`: a value saved through the GUI
wins over a stale launch environment):
1. `config.apiKey` literal (tests only),
2. `$DSH_HOME/.credentials.yaml` → `refs[apiKeyEnv]` (strip one layer of quotes),
3. `process.env[apiKeyEnv]`,
4. `$DSH_HOME/.env`, then `<cwd>/.env` lines `NAME=value` (strip quotes).
Return shape `{ key, source }` with `source` one of
`config|credentials-file|env|dsh-env-file|cwd-env-file|missing`.
Missing → poll records `lastError: "missing_credential"` and the routes still answer
`ok:false` with `status:"no-credential"`; the plugin must never throw out of `apply`.

Poll cycle: immediate first poll, then every `pollIntervalMin`. Each cycle fetches
`/api/balance`, `/api/usage?range=24h&group_by=model`, `?range=7d`, `?range=30d`
sequentially with `AbortSignal.timeout(10000)` and a `User-Agent:
dsh-ollama-credits/0.1.0`. Never overlap cycles; a failed cycle keeps the previous
snapshot and sets `lastError`. State is persisted atomically (tmp file + rename) to
`$DSH_HOME/ollama-credits/state.json` and reloaded on apply so a restart shows the last
known facts before the first fresh poll. Timers are cleared on disposal.

## 4. Host routes

Prefix `/api/dsh-ollama-credits`. Registered with
`ctx.webServer.register({ kind: 'exact', path, handler })`; node `(req, res)`.
`GET` unless noted. All bodies JSON with `application/json; charset=utf-8` and
`cache-control: no-store`. Errors are `{"ok":false,"error":<CODE>,"message":…}`.

### 4.1 `GET /api/dsh-ollama-credits/overview`

The full document the settings section renders. Frozen schema:

```jsonc
{
  "ok": true,
  "generatedAt": "<ISO>",
  "poll": {
    "intervalMin": 5,
    "lastPollAt": "<ISO>|null",
    "lastPollOk": true,
    "lastError": null,            // string|null
    "inFlight": false
  },
  "balance": {
    "asOf": "<ISO>|null",
    "plan": "legacy" | "credits" | "unknown",
    "session": { "remainingPercent": 92.5, "resetsAt": "<ISO>", "resetInSec": 1234 },
    "weekly":  { "remainingPercent": 67.7, "resetsAt": "<ISO>", "resetInSec": 123456 },
    "included": null,             // credits plan only:
                                  // {"balanceUsd":n,"allowanceUsd":n,"period":{"from","until","resetInSec"}}
    "purchased": { "balanceUsd": 0 }
  },
  "usage": {
    "24h": UsageRange,
    "7d": UsageRange,
    "30d": UsageRange | null
  },
  "config": { "pollIntervalMin": 5, "lowSessionPct": 10, "lowWeeklyPct": 10 }
}
```

`UsageRange`:

```jsonc
{
  "range": "24h",
  "granularity": "hour",          // "day" for 7d/30d
  "from": "<ISO>", "until": "<ISO>",
  "totals": {
    "requests": 1871,
    "usageUsd": null,             // null on legacy plans
    "models": [                   // desc by requests, max 10 + "other"
      { "model": "deepseek-v4.1-flash:1017", "requests": 987, "sharePct": 52.8, "usageUsd": null }
    ]
  },
  "buckets": [                    // chronological, zero-filled
    { "from": "<ISO>", "until": "<ISO>", "partial": false,
      "requests": 129,
      "models": [ { "model": "...", "requests": 95, "sharePct": 73.6, "usageUsd": null } ] }
  ]
}
```

Rules the host enforces: `sharePct` = that model's requests / range total × 100,
rounded to one decimal; when upstream folds groups into `remainder`, emit one extra
entry `{ "model": "__other__", "requests": n, "sharePct": p }`; a missing range is
`null`, never omitted; a failed poll keeps the previous document with `ok:true` plus
`poll.lastError`; with no snapshot at all the route answers
`{ "ok": false, "status": "no-credential" | "no-data", "message": "…" }` and status 200.

### 4.2 `GET /api/dsh-ollama-credits/status`

Compact, stable facts for agents and future plugins (the consumer of a future
auto-stop). Frozen schema:

```jsonc
{
  "ok": true,
  "asOf": "<ISO>",
  "plan": "legacy" | "credits" | "unknown",
  "windows": {
    "session": { "remainingPercent": 92.5, "resetsAt": "<ISO>", "resetInSec": 1234 },
    "weekly":  { "remainingPercent": 67.7, "resetsAt": "<ISO>", "resetInSec": 123456 }
  },
  "included": null | { "balanceUsd": n, "allowanceUsd": n, "resetInSec": n },
  "thresholds": { "sessionPct": 10, "weeklyPct": 10 },
  "low": { "session": false, "weekly": false, "any": false },
  "usage": {
    "hourly": { "requests": 1871, "topModel": "…", "topModelRequests": 987 },
    "weekly": { "requests": 37142, "topModel": "…", "topModelRequests": 32463 }
  },
  "poll": { "intervalMin": 5, "lastPollAt": "<ISO>|null", "lastError": null }
}
```

`low.any` is `windows.session.remainingPercent <= thresholds.sessionPct ||
windows.weekly.remainingPercent <= thresholds.weeklyPct` (a credits plan compares
`included.balanceUsd <= 0` instead). A future auto-stop plugin must poll only this
route and must treat `ok:false` as "unknown, do not act".

### 4.3 `POST /api/dsh-ollama-credits/refresh`

Forces one poll now and answers the fresh overview (same body as §4.1). `405` on a
non-POST method. Concurrent refreshes coalesce into the in-flight cycle.

### 4.4 `GET /api/dsh-ollama-credits/usage?range=24h|7d|30d`

Answers one `UsageRange`; absent `range` → `7d`; anything else → `400`
`{"ok":false,"error":"BAD_RANGE"}`.

### 4.5 `POST /api/dsh-ollama-credits/config`

Body `{"pollIntervalMin"?:n,"lowSessionPct"?:n,"lowWeeklyPct"?:n}`. Validates
(integer 1–60 / 0–100), persists, re-arms the timer, answers
`{"ok":true,"config":{…}}`; invalid → `400 {"ok":false,"error":"BAD_CONFIG"}`.

### 4.6 Fence

Same browser-trust fence as the other `/_dsh/*` plugin routes (a DNS-rebinding and
cross-site defense, not authentication): `Host` must be loopback (`localhost`,
`[::1]`, `127.0.0.0/8`) or a trusted authority; `sec-fetch-site` must not be
`cross-site`; when `Origin` is present its hostname must equal `Host`'s. A denial is
`403` with body exactly `forbidden` (`text/plain`). Trusted authorities are assembled
per request from whatever live sources this DSH provides (`ctx.webRuntime?.trustedHosts`,
`ctx.webStartup?.trustedHosts`, `ctx.connection?.trustedHosts`) and read with
`ctx.get`, never injected (a missing service must not park the row pending).

## 5. Client half

`src/client/*.js`, concatenated in filename order into one lazy-CJS module
(§5.1). Files: `00-const.js`, `05-api.js`, `10-format.js`, `20-foot-card.js`,
`30-section.js`, `90-entry.js`.

### 5.1 Bundle shape

The build wraps every file in
`window.__ModuleLoader__.load({ id:'dsh-ollama-credits', factory:(require)=>{ … } })`;
each file is a plain statement list (no import/export/JSX/top-level return). `NS`
carries `react`, `jsx`, `jsxs`, `Fragment`, `createRoot`. `90-entry.js` defines
`apply(ctx)` and `inject = ['slots']` and exports them via `module.exports`.

### 5.2 Foot card

A compact card injected directly **above the sidebar's Settings row** (the shell's
foot area has no block slot; insert a plain `div[data-dsh-ollama-credits-foot]` with
its own React root and re-seat it on body mutations). Content: `Session` and `Week`
rows with remaining percent, a thin remaining bar, and a live `resets in HH:MM:SS`
countdown; an error line when the host says so. Polls
`api/dsh-ollama-credits/status` every 30 s while visible; the countdown ticks every
second locally from `resetsAt`. Clicking anywhere on the card opens the settings
section (replay the user's own path: click the sidebar Settings trigger, then the nav
row whose label is `Ollama Credits`). The card must degrade to an "unavailable" line
when the host row is not mounted, must never throw, and must mount at most once per
page (guard on the data attribute). Collapsing the sidebar hides it with the rest.

### 5.3 Settings section

Registered on the `settings.section` slot via
`ctx.slots.inject('settings.section', () => ctx.slots.register({name:'settings.section',
id:'dsh-ollama-credits', order:152, label: () => 'Ollama Credits', inject: face}, Component))`.
It fetches `api/dsh-ollama-credits/overview` on mount and every 30 s while visible
plus a manual Refresh button (`POST refresh`). Required content, top to bottom:

1. Two window rows (`Session`, `Weekly`): percent remaining, reset countdown, and a
   progress bar coloured by threshold (normal / low).
2. **Hourly usage**: a 24-bar chart from `usage.24h.buckets` (requests per hour, last
   24 h, zero-height bars rendered faintly), with total requests and the busiest hour.
3. **Per-model detail**: range tabs `24h | 7d | 30d`; a table of
   `model | requests | share %` from that range's `totals.models`, plus that range's
   total requests; `__other__` renders as "other".
4. **Settings**: poll-interval input (minutes, 1–60) + Save (`POST config`), low
   thresholds optional, and the last-poll line (`lastPollAt`, `lastError`).
5. Plan footer: legacy warning ("counts only on legacy plan") or USD balances when
   the plan is credit-metered.

All styles are inline style objects (no CSS files). Use shell CSS variables when
available (`var(--color-text, …)`, `var(--color-muted, …)`) with neutral fallbacks so
light and dark both read. Text must be English. No console errors.

### 5.4 Behavioural acceptance

* Card shows live numbers within 2 s of the section/GUI opening.
* Countdown decreases once per second and never shows negative (clamps at `0s`).
* Clicking the card lands on the `Ollama Credits` section with the detail visible.
* Range tabs switch the table without a page reload.
* Saving a poll interval shows the new value and survives a host restart.
* With the host row removed, both halves show a quiet unavailable state.

## 6. Verify harness (owned by the verifier)

`verify/run.mjs` runs, in order, and prints one line per check with real output:

1. `node build.mjs` then `node build.mjs --check` (generated files current).
2. Pure-host tests against `lib/index.js` imports: `resolveApiKey` (env / credentials
   file / .env / missing), `parseCredentialRefs`, `summarizeBalance` (legacy + credits
   shapes), `summarizeUsage` (share math, `__other__`, zero buckets),
   `summarizeStatus` (low flags at/above/below thresholds), `isTrustedRequest`
   (loopback ok, foreign origin denied, cross-site denied), `validateConfig`.
3. Route tests: call `apply` with a fake `ctx` capturing registrations, then drive
   each handler over a real `node:http` server; assert §4 schemas, 400/405 paths, and
   that `POST config` persists.
4. Live acceptance in the `opcheck` profile (see §7): curl every route on
   `127.0.0.1:3081` and compare `/status` numbers with a direct cloud call.

## 7. Dev profile procedure (approved)

`opcheck` is the dev surface (`~/.dsh/profiles/opcheck`, port **3081**, loopback).
`web` (:3080) is production and must not be touched.

```bash
dsh plugin --profile opcheck add link:/Users/alan/Workspace/projects/dsh-ollama-credits
# that command writes the link dependency AND appends "dsh-ollama-credits" to
# dsh.profile.bundles, so this package's own bundle patch inserts the loader row;
# no manual cordis.patch.yml row is needed.
```

**Launcher-env rule (measured 2026-11-27).** `dsh` refuses to start at all when
`$DSH_HOME/.env` contains a key only the launch environment may set — e.g.
`DSH_TELEMETRY_DISABLED`: `… sets "DSH_TELEMETRY_DISABLED", which only the launching
environment may set; export DSH_TELEMETRY_DISABLED instead of putting it in a .env
file`. On this machine `~/.dsh/.env` carries that key, so a fresh `dsh opcheck` (or any
`dsh …`) exits 1 before booting. Until the line is removed from that file and the
variable is exported by whatever launches dsh, acceptance runs against a **workspace
clone** of the profile instead:

```bash
WS=/Users/alan/Workspace/tmp/opcheck-home
mkdir -p "$WS/profiles/opcheck"
cp ~/.dsh/profiles/opcheck/{package.json,cordis.patch.yml,cordis.yml,compatibility.json,pnpm-lock.yaml,pnpm-workspace.yaml} "$WS/profiles/opcheck/"
ln -s ~/.dsh/profiles/opcheck/node_modules "$WS/profiles/opcheck/node_modules"
ln -s ~/.dsh/.credentials.yaml "$WS/.credentials.yaml"
DSH_HOME="$WS" dsh opcheck --no-open     # same bundles, same :3081 loopback, workspace state
```

Differences in that mode: plugin state/config live under `$WS/ollama-credits`, and
plugins that hard-code `~/.dsh` paths (comm-bridge) log EPERM noise. The plugin's own
routes, client bundle, port and cloud calls are identical.

Verify with `curl -s 127.0.0.1:3081/api/dsh-ollama-credits/overview`, then the GUI with
Playwright (`http://127.0.0.1:3081/?token=…` once per host process). Screenshots go to
`/Users/alan/Workspace/screenshots/`.

## 8. Known limits

* Legacy plans: request counts only; `usageUsd`/token fields stay `null` — the UI
  says so instead of faking a cost.
* 10 model groups per response; the rest fold into `remainder` → `__other__`.
* New usage may lag on Ollama's side; `asOf`/`lastPollAt` are shown so a stale number
  is visible rather than hidden.
* The key is read from the local credential store on every poll; nothing is cached in
  the state file.
