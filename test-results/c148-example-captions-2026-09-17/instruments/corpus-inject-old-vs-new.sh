#!/usr/bin/env bash
# usage: corpus-run.sh <label old|new> ; runs the real inject CLI per chapter with cwd = scratch tree
set -u
label=$1; tool=<repo>/tools/cnxml-inject.js; [ "$label" = old ] && tool=<repo>/tools/c148tmp-head-inject.js
root=<scratch>/run-$label; rm -rf $root; mkdir -p $root/logs
for book in efnafraedi-2e lifraen-efnafraedi; do
  mkdir -p $root/books/$book
  for e in <repo>/books/$book/*; do n=$(basename $e)
    case "$n" in 03-translated) mkdir -p $root/books/$book/03-translated;; residue-report.*.json|translation-errors.json) cp $e $root/books/$book/;; *) ln -s $e $root/books/$book/$n;; esac
  done
  for chd in <repo>/books/$book/02-mt-output/*/; do c=$(basename $chd); arg=${c#ch}; arg=$(echo $arg | sed 's/^0*\([0-9]\)/\1/')
    ( cd $root && node $tool --book $book --chapter $arg > logs/$book-$c.out 2> logs/$book-$c.err; echo "exit $?" >> logs/$book-$c.out )
  done
done
echo DONE-$label
