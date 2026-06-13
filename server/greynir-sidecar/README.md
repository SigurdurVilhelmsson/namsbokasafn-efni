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
- The Node client times out after 4s and degrades to no grammar findings, so a
  slow/restarting sidecar never blocks the editor.
