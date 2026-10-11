import json, collections
R = json.load(open('data/reattach.json'))
def short(v):
    return {'match-same-module-same-id':'M:same-id','match-same-module-other-id':'M:other-id','match-other-module':'M:other-module',
            'loose-only':'LOOSE','no-match:old-text-now-inside-a-longer-new-segment':'X:merged','no-match:old-segment-now-split-across-new-segments':'X:split',
            'no-match:text-differs':'X:differs','chapter-title':'chapter-title','id-not-in-old-EN':'X:no-old-EN'}.get(v,v)
print('=== FAITHFUL FILES (unit: segment in the file; pos-aligned with EN at the file\'s own commit)')
for mod in ['m68663','m68664','m68699','m68700']:
    rs=[r for r in R if r['source']=='faithful' and r['module']==mod]
    ed=[r for r in rs if r['editedVsMT']]
    print(f'{mod}: segs={len(rs)} editedVsMT={len(ed)} rawDiffVsMT={sum(r["rawDiffVsMT"] for r in rs)}')
    print('   all  :', dict(collections.Counter(short(r['verdict']) for r in rs)))
    print('   edited:', dict(collections.Counter(short(r['verdict']) for r in ed)))
print()
print('=== HARVEST ROWS (unit: segment_edits row)')
H=[r for r in R if r['source']=='harvest']
for mod in sorted({r['module'] for r in H}):
    rs=[r for r in H if r['module']==mod]
    print(f'{mod}: rows={len(rs)} status={dict(collections.Counter(r["status"] for r in rs))} distinctSegIds={len({r["segId"] for r in rs})}')
    print('   verdicts:', dict(collections.Counter((r['status'],short(r['verdict'])) for r in rs)))
