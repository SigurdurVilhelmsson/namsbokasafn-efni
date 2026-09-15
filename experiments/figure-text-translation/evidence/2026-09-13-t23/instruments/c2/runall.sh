#!/bin/bash
# compose every work figure with the unchanged composer (base) and the c2 prototype (ts)
EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation
export PYTHONDONTWRITEBYTECODE=1 FIGTEXT_PYLIBS=$EXP/pylibs SOURCE_DATE_EPOCH=1700000000
SC=/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/figure-text
cd $EXP
for d in /home/siggi/dev/scratch-c140/c2/work/*/; do
  b=$(basename $d)
  tr=${TRDIR:-$SC}/$b.is.json
  FIGTEXT_OUT=$d/base python3 compose.py --translations $tr --svg > $d/base/stdout.txt 2>&1 || echo "BASE FAIL $b"
  FIGTEXT_OUT=$d/ts python3 /home/siggi/dev/scratch-c140/c2/proto/compose_ts.py --translations $tr --svg > $d/ts/stdout.txt 2>&1 || echo "TS FAIL $b"
done
echo done
