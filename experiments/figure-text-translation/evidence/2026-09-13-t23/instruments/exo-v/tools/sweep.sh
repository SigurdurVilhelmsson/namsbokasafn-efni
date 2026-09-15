#!/bin/bash
# sequential uncollapse sweep; one browser at a time
cd /home/siggi/dev/scratch-c140/exo-v
export PYTHONDONTWRITEBYTECODE=1
O=/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/media/CNX_Chem_03_01_exocytosis-88f6_IS.svg
R=fix/CNX_Chem_03_01_exocytosis-88f6_IS.rep.json
REF=r/exo_IS_fix.png
./tools/one.sh fix/CNX_Chem_03_01_exocytosis-88f6_IS.mine.svg sweep/fix_repeat.png 1200 669.444 60000 > sweep/fix_repeat.sum
echo "fix_repeat $(PYTHONPATH=/home/siggi/dev/scratch-c140/c10/pylibs-np python3 tools/pix.py same sweep/fix_repeat.png $REF)" >> sweep/results.txt
for a in 0 10 20 30 40 50 60 70 80 90 100 110 120 130 140 145 150; do
  b=$((a+10)); [ $a -eq 140 ] && b=145; [ $a -eq 145 ] && continue; [ $b -gt 155 ] && b=155
  V=sweep/v_${a}_${b}
  [ -f $V.png ] && { echo "$V exists" ; } || {
    python3 tools/mkvariant.py $O $R $V.svg $a:$b > $V.mk.json
    ./tools/one.sh $V.svg $V.png 1200 669.444 60000 > $V.sum 2>&1
    rm -f $V.svg
  }
  echo "$V $(tr -d '\n' < $V.sum | cut -c1-400) :: $( [ -f $V.png ] && PYTHONPATH=/home/siggi/dev/scratch-c140/c10/pylibs-np python3 tools/pix.py same $V.png $REF)" >> sweep/results.txt
done
echo DONE >> sweep/results.txt
