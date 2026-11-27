# dsh-ollama-credits

Ollama **Cloud** credit monitor for the DSH Web GUI.

A compact card above the sidebar's Settings row shows the two plan windows (session and
weekly) with remaining percentage and a live reset countdown; clicking it opens an
**Ollama Credits** settings section with a 24-hour usage chart, a per-model breakdown
(share % and request counts) for 24 h / 7 d / 30 d, a settable poll interval and a manual
refresh. The same facts are exposed as JSON routes so agents and other plugins can read
them — designed to feed a future auto-stop/resume plugin.

It talks to `https://ollama.com/api` directly. It never touches a locally installed
Ollama and never writes to the Ollama account.

## Install (profile)

```bash
dsh plugin --profile <profile> add dsh-ollama-credits
# local development / unpublished checkout:
# dsh plugin --profile <profile> add link:$PWD
```

The plugin's bundle patch inserts the loader row itself. Restart the host (`dsh <profile>`)
and refresh the browser for the client half.

The API key is resolved as `OLLAMA_CLOUD_API_KEY` — the same credential the `ollama-cloud`
provider already uses: the stored DSH credential file wins, then the launch environment,
then `.env` files. A plugin row config can override it:

| field | default | meaning |
|---|---|---|
| `apiBase` | `https://ollama.com` | cloud API origin |
| `apiKeyEnv` | `OLLAMA_CLOUD_API_KEY` | credential name to resolve |
| `pollIntervalMin` | `5` | poll cadence, 1–60 minutes |
| `lowSessionPct` | `10` | session "low" threshold for `status.low` |
| `lowWeeklyPct` | `10` | weekly "low" threshold for `status.low` |

## JSON routes (agents / other plugins)

All under `/api/dsh-ollama-credits`, JSON, `cache-control: no-store`, behind the same
loopback/trusted-authority fence as the other GUI routes.

| route | method | purpose |
|---|---|---|
| `/overview` | GET | full document the GUI renders |
| `/status` | GET | compact facts for agents: windows, reset times, `low.any`, thresholds |
| `/usage?range=24h\|7d\|30d` | GET | one usage range (hourly/daily buckets + per-model groups) |
| `/refresh` | POST | poll now and answer the fresh overview |
| `/config` | POST | `{"pollIntervalMin"?:n,"lowSessionPct"?:n,"lowWeeklyPct"?:n}` |

A future auto-stop plugin should poll only `/status` and treat `ok:false` as "unknown —
do not act". Frozen schemas: [CONTRACT.md](CONTRACT.md) §4.

Upstream rate limit is 10 requests/minute; one poll cycle costs 4 calls.

## Development

```bash
node build.mjs            # src/ -> lib/ (no dependencies)
npm run check             # syntax of generated files
npm run verify            # acceptance harness (build + 94 host + 75 route checks)
```

`lib/` is generated and committed — edit `src/`, never `lib/`. The host half is
`src/host/index.js` (self-contained ESM); the browser half is `src/client/*.js`,
concatenated into one module-loader bundle. Interfaces are frozen in
[CONTRACT.md](CONTRACT.md).

Live GUI acceptance runs in a scratch profile, never in `web`:

```bash
dsh plugin --profile opcheck add link:$PWD
DSH_HOME=<cloned dsh home> dsh opcheck --no-open   # :3081 loopback
node scripts/live-accept.mjs                       # routes vs a direct cloud call
```

CONTRACT §7 documents the profile procedure and the DSH launcher rule that forces the
workspace `DSH_HOME` clone on this machine (`$DSH_HOME/.env` must not contain
launch-environment-only keys such as `DSH_TELEMETRY_DISABLED`).

## Known limits

* **Legacy plans report request counts only** — no USD and no token counts exist
  upstream, so the table shows requests + share % and the UI says so instead of
  inventing a cost.
* At most 10 model groups per response; the remainder renders as `other`.
* Ollama's usage reporting may lag; `asOf` / last-poll line make staleness visible.
