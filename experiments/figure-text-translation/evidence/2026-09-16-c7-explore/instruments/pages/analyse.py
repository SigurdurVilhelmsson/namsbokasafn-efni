import json, math, collections
rows = [json.loads(l) for l in open('pagecensus.jsonl')]
print('rows', len(rows), collections.Counter(r['kind'] for r in rows))
print('no raster', sum(1 for r in rows if not r['raster']), 'no page', sum(1 for r in rows if not r['page']), 'txtErr', sum(1 for r in rows if r.get('txtErr')))
print('raster dpi', collections.Counter(tuple(r['rasterDpi']) if r.get('rasterDpi') else None for r in rows).most_common(6))
print('pages>1', [r['basename'] for r in rows if r.get('pages') and r['pages']>1])
def letter(p): 
    w,h = sorted(p); return abs(w-612)<2 and abs(h-792)<2
for r in rows:
    p, ras = r['page'], r['raster']
    r['letter'] = bool(p and letter(p))
    if p and ras:
        r['rw'] = p[0]*200/72/ras[0]; r['rh'] = p[1]*200/72/ras[1]
        r['aspect'] = abs(math.log((p[0]/p[1])/(ras[0]/ras[1])))
    else:
        r['rw']=r['rh']=r['aspect']=None
ok = [r for r in rows if r['rw']]
print('\nletter-size pages:', [(r['basename'], r['kind'], r['creator']) for r in rows if r['letter']])
print('largest pages (pt):')
for r in sorted(ok, key=lambda r: -max(r['page']))[:12]:
    print(f"  {r['basename']:40} {r['kind']} page={r['page'][0]:.0f}x{r['page'][1]:.0f} raster={r['raster']} rw={r['rw']:.2f} rh={r['rh']:.2f} asp={r['aspect']:.3f} creator={r['creator']}")
# ratio distribution
def bucket(x):
    for lo,hi,lab in [(0,0.5,'<0.5'),(0.5,0.9,'0.5-0.9'),(0.9,0.98,'0.9-0.98'),(0.98,1.02,'0.98-1.02'),(1.02,1.1,'1.02-1.1'),(1.1,1.5,'1.1-1.5'),(1.5,2.0,'1.5-2.0'),(2.0,99,'>=2.0')]:
        if lo<=x<hi: return lab
print('\nmax(rw,rh) distribution:', sorted(collections.Counter(bucket(max(r['rw'],r['rh'])) for r in ok).items()))
print('min(rw,rh) distribution:', sorted(collections.Counter(bucket(min(r['rw'],r['rh'])) for r in ok).items()))
print('\n max ratio >= 1.5:')
for r in sorted(ok, key=lambda r: -max(r['rw'],r['rh'])):
    if max(r['rw'],r['rh']) < 1.5: break
    print(f"  {r['basename']:40} {r['kind']} page={r['page'][0]:.1f}x{r['page'][1]:.1f} raster={r['raster']} rw={r['rw']:.2f} rh={r['rh']:.2f} asp={r['aspect']:.3f} creator={r['creator']!r} chrome={r.get('chrome')}")
print('\n both ratios >= 1.25:')
for r in ok:
    if min(r['rw'],r['rh'])>=1.25: print('  ', r['basename'], round(r['rw'],2), round(r['rh'],2))
print('\naspect > log(1.25):', sum(1 for r in ok if r['aspect']>math.log(1.25)))
print('creator counts:', collections.Counter((r['creator'] or 'None').split('(')[0].strip()[:40] for r in rows).most_common(15))
print('InDesign:', [r['basename'] for r in rows if r['creator'] and 'InDesign' in r['creator']])
json.dump(rows, open('analysed.json','w'))
