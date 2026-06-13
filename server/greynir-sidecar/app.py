"""
GreynirCorrect proofreading sidecar (Unit 4.2).

A tiny HTTP wrapper around Miðeind's GreynirCorrect so the Node server can get
Icelandic grammar/spelling annotations without embedding Python. The Node
client is server/services/greynirEngine.js; the contract it expects:

    POST /correct   { "text": "<icelandic prose>" }
    200             { "corrections": [ { "start", "end", "original",
                                         "suggestions": [..], "code",
                                         "message", "type" } ] }
    GET  /health    200 { "ok": true }

Run (on the Linode box, in its own venv):

    cd server/greynir-sidecar
    python3 -m venv .venv && . .venv/bin/activate
    pip install -r requirements.txt
    GREYNIR_PORT=5119 python app.py        # or: gunicorn -b 127.0.0.1:5119 app:app

Then point the Node server at it:  GREYNIR_URL=http://127.0.0.1:5119

NOTE: bind to localhost and keep it behind the box firewall — content is
internal editorial text. This file is deployment infrastructure; it is not
exercised by the Node test suite (the Node adapter is tested against a mocked
transport).
"""

import os

from flask import Flask, jsonify, request

# GreynirCorrect (PyPI: reynir-correct). Import lazily-tolerantly so /health
# still answers if the model isn't installed yet.
try:
    from reynir_correct import check  # type: ignore

    _IMPORT_ERROR = None
except Exception as exc:  # pragma: no cover - depends on the deploy env
    check = None
    _IMPORT_ERROR = str(exc)

app = Flask(__name__)

MAX_TEXT_LEN = 20000


def _annotations(text):
    """Yield correction dicts for a piece of Icelandic prose."""
    # reynir_correct.check() returns a result whose paragraphs contain
    # sentences, each carrying `.annotations` with .start/.end (token indices),
    # .code, .text (human description) and .suggest (suggested replacement).
    result = check(text)
    for paragraph in result.paragraphs:
        for sentence in paragraph:
            for a in getattr(sentence, "annotations", []) or []:
                suggest = getattr(a, "suggest", None)
                original = getattr(a, "original", None) or getattr(a, "text", "")
                code = getattr(a, "code", "") or ""
                # Codes beginning with "S" are spelling; others grammar/style.
                kind = "spelling" if str(code).startswith("S") else "grammar"
                yield {
                    "start": getattr(a, "start", None),
                    "end": getattr(a, "end", None),
                    "original": original,
                    "suggestions": [suggest] if suggest else [],
                    "code": code,
                    "message": getattr(a, "text", "") or "",
                    "type": kind,
                }


@app.get("/health")
def health():
    return jsonify({"ok": check is not None, "error": _IMPORT_ERROR})


@app.post("/correct")
def correct():
    if check is None:
        return jsonify({"error": f"GreynirCorrect not available: {_IMPORT_ERROR}"}), 503
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "")[:MAX_TEXT_LEN]
    if not text.strip():
        return jsonify({"corrections": []})
    return jsonify({"corrections": list(_annotations(text))})


if __name__ == "__main__":
    port = int(os.environ.get("GREYNIR_PORT", "5119"))
    app.run(host="127.0.0.1", port=port)
