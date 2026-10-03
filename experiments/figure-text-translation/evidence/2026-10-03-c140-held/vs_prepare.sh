#!/bin/bash
# Prepare each value-sheet figure into a scratch dir on disk, one at a time.
set -u
E=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation
O=$HOME/.cache/namsbokasafn-audit/2026-10-03-step2/vs-prepare
export TMPDIR=$HOME/.cache/namsbokasafn-audit/2026-10-03-step2/tmp/vs; mkdir -p $TMPDIR $O
cd $E
for b in CNX_Chem_01_02_MattType CNX_Chem_07_04_HNO2_img CNX_Chem_20_04_amide1_img CNX_Chem_09_05_MolSpeed1 CNX_Chem_14_02_phscale CNX_Chem_14_06_buffer CNX_Chem_18_04_OxStNonmts CNX_Chem_01_04_MYdCmIn; do
  p=$(FIGTEXT_PYLIBS=./pylibs python3 -B sources.py --json efnafraedi-2e $b | python3 -c "import json,sys; d=json.load(sys.stdin); print(list(d.values())[0]['path'])")
  echo "== $b <- $p"; free -h | sed -n 2p
  FIGTEXT_PYLIBS=./pylibs python3 -B figure-prepare.py "$p" --basename $b --out $O/$b > $O/$b.log 2>&1; echo "exit $?"
done
echo DONE
