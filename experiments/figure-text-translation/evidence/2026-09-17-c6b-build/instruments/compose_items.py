#!/usr/bin/env python3
"""§C140 ⑥b — run an UNMODIFIED compose.py and dump its drawn ITEMS. 0 ISK, no MT.

    FIGTEXT_OUT=<work> python3 -u compose_items.py <composer_dir>/compose.py --translations <sidecar> --svg

Executes <compose.py> with runpy as __main__ (cwd and sys.argv exactly as a direct run: argv[0] is the script's
own path, the rest pass through), then writes <FIGTEXT_OUT>/items.json from the finished module's `ITEMS` list:
one entry per drawn string, in the order svgout.write_svg writes one <text> per entry. Each entry keeps every
field compose.py set (path, text, x, y, rot, size, bold, italic, rgb, dx, and family/line/seg where present).
compose.py is not imported, patched or copied, so what is dumped is what that tree draws.
"""
import json, os, runpy, sys
from pathlib import Path

script = Path(sys.argv[1]).resolve()
sys.argv = [str(script)] + sys.argv[2:]
sys.path.insert(0, str(script.parent))   # as a direct run puts the script's own dir first
g = runpy.run_path(str(script), run_name='__main__')
out = Path(os.environ['FIGTEXT_OUT'])
(out / 'items.json').write_text(json.dumps(g['ITEMS'], indent=1, ensure_ascii=False))
print(f'\nwrote items.json ({len(g["ITEMS"])} items)')
