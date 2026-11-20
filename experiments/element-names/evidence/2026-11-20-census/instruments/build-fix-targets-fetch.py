"""Build fetch-fix-targets.cjs: a READ-ONLY fetch of the current effective Icelandic (what the segment
editor shows) and any live edit for the 26 segments the editors' fixes cover. Targets: the 8 ruthenium
segments (data/dry-count-ruthenium-mt-forms.json) and the 18 lanthanide segments still holding the old
derived forms (data/lanthanide-census.json). Reuses nine-readonly.cjs's read-only header.
Usage (from this folder):
  python3 -I build-fix-targets-fetch.py nine-readonly.cjs ../data/dry-count-ruthenium-mt-forms.json ../data/lanthanide-census.json fetch-fix-targets.cjs"""
import json
import sys

src_path, ru_path, la_path, out_path = sys.argv[1:5]
ru = json.load(open(ru_path, encoding='utf-8'))
la = json.load(open(la_path, encoding='utf-8'))
targets = [{'set': 'ruthenium', 'chapter': i['chapter'], 'moduleId': i['moduleId'], 'segmentId': i['segmentId']} for i in ru['items']]
targets += [{'set': 'lanthanide', 'chapter': i['chapter'], 'moduleId': i['moduleId'], 'segmentId': i['segmentId']}
            for i in la['items'] if 'derived-old' in i['kinds']]
src = open(src_path, encoding='utf-8').read()
head = src[:src.index('const scope = buildScope')]
head = head.replace(head[:head.index('process.exitCode = 1;')],
                    "// READ-ONLY fetch of the current effective Icelandic (what the segment editor shows) and any live edit\n"
                    "// for a fixed list of segments. Send on stdin, cwd = server/scripts:  node - <book>\n")
body = "const TARGETS = " + json.dumps(targets, ensure_ascii=False) + ";\n" + r'''
const out = [];
const byUnit = new Map();
for (const t of TARGETS) {
  const k = t.chapter + '|' + t.moduleId;
  if (!byUnit.has(k)) byUnit.set(k, []);
  byUnit.get(k).push(t);
}
for (const [k, ts] of byUnit) {
  const [chapter, moduleId] = [Number(k.split('|')[0]), k.split('|')[1]];
  const segs = ses.buildEffectiveSegments(book, chapter, moduleId);
  const edits = db.prepare("SELECT segment_id, status, created_at FROM segment_edits WHERE book = ? AND module_id = ? AND status NOT IN ('rejected','superseded')").all(book, moduleId);
  for (const t of ts) {
    const s = segs.find((x) => x.segmentId === t.segmentId);
    out.push({ ...t, found: !!s, current: s ? s.isContent : null, liveEdits: edits.filter((e) => e.segment_id === t.segmentId) });
  }
}
process.stdout.write(JSON.stringify({ openedDbPaths: [...new Set(opened)], registeredBooks: db.prepare('SELECT COUNT(*) n FROM registered_books').get().n, n: out.length, segments: out }) + '\nEND-OF-REPORT\n', () => { process.exitCode = 0; });
'''
open(out_path, 'w', encoding='utf-8').write(head + body)
print('targets', len(targets))
