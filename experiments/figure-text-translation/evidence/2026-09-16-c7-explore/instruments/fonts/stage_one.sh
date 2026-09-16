#!/bin/bash
src="$1"
tree=$(echo "$src" | awk -F/ '{print $8}')
h=$(printf '%s' "$src" | md5sum | cut -c1-8)
b=$(basename "$src"); key="${tree}__${h}__${b}"
out="staged/${key}.pdf"
if timeout 120 gs -q -dNOPAUSE -dBATCH -dSAFER -dEPSCrop -sDEVICE=pdfwrite -sOutputFile="$out" "$src" >/dev/null 2>&1 && [ -s "$out" ]; then
  pdffonts "$out" > "fontsout/${key}.txt" 2>&1
  echo "OK	$src	$out	$key"
else
  rm -f "$out"; echo "FAIL	$src	$out	$key"
fi
