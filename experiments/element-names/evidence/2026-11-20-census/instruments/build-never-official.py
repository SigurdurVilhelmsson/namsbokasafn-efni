"""Build never-official-readonly.cjs from render-census.cjs (same read-only header, element table and
classifier) with a main loop that LISTS segments instead of counting forms. The targets are computed
from the committed census: every name that occurs and whose forms are never the official one.
Usage (from this folder): python3 -I build-never-official.py render-census.cjs ../data/render-census-69-names.json never-official-readonly.cjs"""
import json
import sys

src = open(sys.argv[1], encoding='utf-8').read()
census = json.load(open(sys.argv[2], encoding='utf-8'))
targets = [r['english'][0] for r in census['rows']
           if r['enSegments'] > 0 and r['bases'] and not any(v['official'] for v in r['bases'].values())]

cut = src.index('const targets = ELEMENTS.filter')
head = src[:cut]
old_comment = ("// READ-ONLY census: how chemistry's segments render element names that have no chemistry\n"
               "// glossary row. Send on stdin, cwd = server/scripts:  node - <book>\n")
assert head.startswith(old_comment)
head = ("// READ-ONLY dry lists: for each element name whose MT forms are never the official one, the segments\n"
        "// holding a non-official form. Built by build-never-official.py from render-census.cjs (same header,\n"
        "// element table and classifier). Send on stdin, cwd = server/scripts:  node - <book>\n") + head[len(old_comment):]
old_req = "const { englishHit } = require(path.join(serverRoot, 'lib/worklistMatch'));"
assert head.count(old_req) == 1
head = head.replace(old_req, "const { englishHit, findWholeWord, excerptOf } = require(path.join(serverRoot, 'lib/worklistMatch'));")

main = """const TARGETS = %s;
const tset = new Set(TARGETS);
const targets = ELEMENTS.filter((e) => tset.has(e.english[0])).map((e) => ({ e, enSegments: 0, alreadyOfficial: 0, items: [], misses: [] }));
if (targets.length !== TARGETS.length) throw new Error('not every target name is in the element table');
const isOfficial = (e, base) => e.official.some((o) => base === o.toLocaleLowerCase('is'));

const units = listStudyUnits({ book, booksDir: segmentParser.BOOKS_DIR });
const unreadable = [];
const WORD = /[\\p{L}]+/gu;
for (const u of units) {
  let segs;
  try {
    segs = ses.buildEffectiveSegments(book, u.chapter, u.moduleId);
  } catch (err) {
    unreadable.push({ unit: u.unit, err: String(err && err.message) });
    continue;
  }
  for (const s of segs) {
    const en = s.enContent || '';
    const is = s.isContent || '';
    for (const t of targets) {
      if (!englishHit(en, t.e.searchEnglish)) continue;
      t.enSegments += 1;
      // The worklist's rule: a segment already holding the official name is not listed.
      if (findWholeWord(is, t.e.official, { exactCase: false })) {
        t.alreadyOfficial += 1;
        continue;
      }
      const strong = [];
      const near = [];
      for (const m of is.matchAll(WORD)) {
        const c = classify(m[0], t.e, en);
        if (!c) continue;
        if (c.tier === 'strong' && !isOfficial(t.e, c.base)) strong.push({ word: m[0], base: c.base, index: m.index });
        else if (c.tier === 'weak' || c.tier === 'unshaped') near.push({ word: m[0], tier: c.tier, index: m.index });
      }
      if (!strong.length && !near.length) {
        t.misses.push({ chapter: u.chapter, segmentId: s.segmentId, is: is.slice(0, 160) });
        continue;
      }
      const first = strong[0] || near[0];
      t.items.push({
        chapter: u.chapter,
        moduleId: u.moduleId,
        segmentId: s.segmentId,
        forms: strong.map((x) => x.word),
        bases: [...new Set(strong.map((x) => x.base))],
        near: near.map((x) => `${x.word} (${x.tier})`),
        excerpt: excerptOf(is, first.index, first.word.length),
      });
    }
  }
}

const doc = {
  control: {
    registeredBooks: db.prepare('SELECT COUNT(*) n FROM registered_books').get().n,
    unitsListed: units.length,
    unreadable,
    openedDbPaths: [...new Set(opened)],
    targets: TARGETS,
  },
  rows: targets.map((t) => ({
    n: t.e.n,
    english: t.e.searchEnglish,
    official: t.e.official,
    enSegments: t.enSegments,
    alreadyOfficial: t.alreadyOfficial,
    listed: t.items.length,
    listedStrong: t.items.filter((i) => i.forms.length).length,
    items: t.items,
    misses: t.misses,
  })),
};
process.stdout.write(JSON.stringify(doc) + '\\nEND-OF-REPORT\\n', () => {
  process.exitCode = unreadable.length ? 1 : 0;
});
""" % json.dumps(targets)

open(sys.argv[3], 'w', encoding='utf-8').write(head + main)
print('targets', len(targets), targets)
