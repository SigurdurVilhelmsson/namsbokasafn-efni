#!/usr/bin/env python3
"""§C140 ④ P3 — run the FIXED strip over every figure the 2026-09-16 census scanned and count refusals. No render.

    cd experiments/figure-text-translation
    FIGTEXT_PYLIBS=./pylibs python3 -u evidence/2026-09-17-c4-build/instruments/refusal_walk.py

Reads evidence/2026-09-16-c4-explore/census/results.jsonl.gz (status ok rows: artwork path + staged_pdf_recipe),
stages .eps/.ai with the census's own ghostscript argv (readlayer.GS_ARGV), opens the PDF, calls strip_text, and
records ok / refused (with message) / error. Writes reports/after/refusal-walk.jsonl and prints DONE n=… refused=….
"""
import gzip, importlib.util, json, os, subprocess, sys, tempfile
from pathlib import Path

HERE = Path(__file__).resolve()
EXP = HERE.parents[3]
sys.path.insert(0, str(EXP))
import _deps  # noqa: F401,E402
import pikepdf  # noqa: E402
import readlayer  # noqa: E402

spec = importlib.util.spec_from_file_location('strip_after', EXP / 'strip-text.py')
ST = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ST)
CENSUS = EXP / 'evidence/2026-09-16-c4-explore/census/results.jsonl.gz'
OUT = HERE.parents[1] / 'reports/after/refusal-walk.jsonl'


def main():
    rows = [json.loads(l) for l in gzip.open(CENSUS, 'rt')]
    rows = [r for r in rows if r['status'] == 'ok']
    n = refused = errors = 0
    with open(OUT, 'w') as fh:
        for r in rows:
            art = Path(r['artwork'])
            tmp = None
            try:
                if r['kind'] in ('eps', 'ai'):
                    fd, tmp = tempfile.mkstemp(suffix='.pdf')
                    os.close(fd)
                    subprocess.run(readlayer.GS_ARGV + [f'-sOutputFile={tmp}', str(art)],
                                   check=True, capture_output=True, timeout=300)
                    src = tmp
                else:
                    src = str(art)
                with pikepdf.open(src) as pdf:
                    stats = ST.strip_text(pdf)
                rec = {'key': r['key'], 'status': 'ok', 'state_kept': stats['state_kept']}
            except ST.UnparsableStream as exc:
                refused += 1
                rec = {'key': r['key'], 'status': 'refused', 'message': str(exc)[:400]}
            except Exception as exc:  # noqa: BLE001
                errors += 1
                rec = {'key': r['key'], 'status': 'error', 'message': f'{type(exc).__name__}: {exc}'[:400]}
            finally:
                if tmp and os.path.exists(tmp):
                    os.unlink(tmp)
            n += 1
            fh.write(json.dumps(rec) + '\n')
            fh.flush()
    print(f'DONE n={n} refused={refused} errors={errors}')


if __name__ == '__main__':
    main()
