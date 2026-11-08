# Greynir proofreading sidecar

Python HTTP wrapper around [GreynirCorrect](https://github.com/mideind/GreynirCorrect)
that gives the Node server Icelandic grammar/spelling annotations
(editorial-throughput roadmap Unit 4.2).

## Why a sidecar
GreynirCorrect is Python; the editorial server is Node. Rather than embed a
Python runtime, the checker runs as a small localhost HTTP service and the Node
client (`server/services/greynirEngine.js`) calls it. It is **optional** — with
`GREYNIR_URL` unset the QA layer simply omits grammar findings (the engine-free
number/EN-residue checks still run).

A decision of 2026-08-06 ruled that this sidecar be deleted in favour of Málstaður's hosted
`/v1/grammar` endpoint, recording that it had never run:
[docs/decisions/2026-08-06-mideind-toolchain-evaluation.md](../../docs/decisions/2026-08-06-mideind-toolchain-evaluation.md).
That record is dated evidence; whether the deletion has been carried out is tracked in the
active plan in `docs/plans/`. ⚠️ The same record found that the grammar endpoint corrupts
inline `[[…]]` markers, so marker-bearing text needs masking before it is sent there.

## Run
```bash
cd server/greynir-sidecar
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
GREYNIR_PORT=5119 gunicorn -b 127.0.0.1:5119 app:app   # or: python app.py
```
Then set on the Node server (e.g. in its env / systemd unit):
```
GREYNIR_URL=http://127.0.0.1:5119
```
Verify: `curl -s localhost:5119/health` → `{"ok": true, ...}`.

## Contract
- `POST /correct` `{ "text": "<is prose>" }` → `{ "corrections": [ { start, end, original, suggestions, code, message, type } ] }`
- `GET /health` → `{ "ok": true }`

## Operational notes
- Bind to **localhost** and keep it behind the firewall — editorial text is internal.
- First model load is slow; keep the process warm (gunicorn, 1–2 workers is plenty for ~5 editors).
- The Node client times out after `DEFAULT_TIMEOUT_MS` (`server/services/greynirEngine.js`)
  and degrades to no grammar findings, so a slow/restarting sidecar never blocks the editor.
