"""Assemble render-census.cjs from the template and the element table (the table is embedded).
Usage (from this folder): python3 -I assemble-render-census.py render-census.template.cjs ../data/elements-table.json render-census.cjs"""
import sys

template = open(sys.argv[1], encoding='utf-8').read()
table = open(sys.argv[2], encoding='utf-8').read()
marker = '/*ELEMENTS_JSON*/ []'
assert template.count(marker) == 1, 'template must hold the marker exactly once'
open(sys.argv[3], 'w', encoding='utf-8').write(template.replace(marker, table))
