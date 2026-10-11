"""Sensitivity: how much of ABSENT do the variants a reader identified in the 28 ABSENT reads cover?"""
import json, sys
from collections import Counter
sys.path.insert(0, sys.argv[1])
import lib
M = lib.M
B = json.load(open(sys.argv[2]))
READ = [('ch05', 'heat (q)', 'hiti'), ('ch07', 'Lewis structure', 'Lewis-formgerð'), ('ch17', 'galvanic (voltaic) cell', 'rafefnafruma'),
        ('ch08', 'hybridization', 'blöndun'), ('ch04', 'product', 'afurð'), ('ch18', 'representative metal', 'dæmigerður málmur'),
        ('ch05', 'calorimeter', 'varmaefnamælir'), ('ch10', 'dispersion force', 'dreifkraftur'), ('ch08', 'bond order', 'tengistig'),
        ('ch12', 'reaction mechanism', 'hvarfkerfi'), ('ch19', 'central metal', 'miðlægur málmur'), ('ch14', 'acid-base indicator', 'sýru-basa-vísir'),
        ('ch21', 'radioactive decay', 'geislavirk rotnun'), ('ch17', 'anode', 'rafskaut'), ('ch21', 'alpha particle', 'alfaögn'),
        ('ch06', 'line spectrum', 'línulitróf'), ('ch06', 'd orbital', 'd-svið'), ('ch20', 'carboxylic acid', 'karbónsýra'),
        ('ch02', 'structural isomer', 'byggingarfásæta'), ('ch08', 'molecular orbital diagram', 'sameindasvigrúmsrit'),
        ('ch05', 'calorimetry', 'varmaefnamæling'), ('ch02', 'polyatomic ion', 'fjöleindajón')]
idx = {(c, e): v for c, e, v in READ}
cov = Counter(); tot = Counter(); per = Counter()
for r in B['records']:
    if r['class'] != 'ABSENT': continue
    tot[r['base']] += 1
    v = idx.get((r['chapter'], r['en']))
    if v and M.carries(r['isText'], M.stems(v)):
        cov[r['base']] += 1; per[(r['base'], r['chapter'], r['en'], v)] += 1
for b in ('june', 'new', 'hybrid'):
    print(b, 'ABSENT', tot[b], '-> carried by a reader-identified variant', cov[b], f'({100*cov[b]/tot[b]:.0f}%)')
for k, n in sorted(per.items(), key=lambda kv: -kv[1])[:30]: print('  ', k, n)
