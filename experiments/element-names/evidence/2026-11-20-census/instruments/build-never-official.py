"""Build never-official-readonly.cjs from render-census.cjs (same read-only header, element table and
classifier) with a main loop that LISTS segments instead of counting forms. The targets are computed
from the committed census: every name that occurs and whose forms are never the official one.
Usage (from this folder): python3 -I build-never-official.py render-census.cjs ../data/render-census-69-names.json never-official-readonly.cjs

With --mixed first, it builds mixed-readonly.cjs instead: the targets are the names whose MT forms are partly
official and partly not, and a segment that ALSO holds the official name is kept (marked alsoOfficial), because
an editor fixes the non-official form there too:
  python3 -I build-never-official.py --mixed render-census.cjs ../data/render-census-69-names.json mixed-readonly.cjs"""
import json
import sys

MIXED = sys.argv[1] == '--mixed'
args = sys.argv[2:] if MIXED else sys.argv[1:]
src = open(args[0], encoding='utf-8').read()
census = json.load(open(args[1], encoding='utf-8'))
if MIXED:
    targets = [r['english'][0] for r in census['rows']
               if r['enSegments'] > 0 and r['bases'] and any(v['official'] for v in r['bases'].values())
               and not all(v['official'] for v in r['bases'].values())]
else:
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

if MIXED:
    old_c = ("// READ-ONLY dry lists: for each element name whose MT forms are never the official one, the segments\n"
             "// holding a non-official form.")
    assert head.count(old_c) == 1
    head = head.replace(old_c, "// READ-ONLY dry lists: for each element name whose MT forms are partly official, the segments\n"
                               "// holding a non-official form (a segment that also holds the official name is kept).")
    old_skip = """      // The worklist's rule: a segment already holding the official name is not listed.
      if (findWholeWord(is, t.e.official, { exactCase: false })) {
        t.alreadyOfficial += 1;
        continue;
      }"""
    assert main.count(old_skip) == 1
    main = main.replace(old_skip, """      // Kept even when it also holds the official name: the editor fixes the non-official form there too.
      const alsoOfficial = !!findWholeWord(is, t.e.official, { exactCase: false });
      if (alsoOfficial) t.alreadyOfficial += 1;""")
    old_item = "        excerpt: excerptOf(is, first.index, first.word.length),\n      });"
    assert main.count(old_item) == 1
    main = main.replace(old_item, "        excerpt: excerptOf(is, first.index, first.word.length),\n        alsoOfficial,\n      });")
    # The census names aluminum by its search spelling; the element table's first English name is aluminium.
    old_match = "ELEMENTS.filter((e) => tset.has(e.english[0]))"
    assert main.count(old_match) == 1
    main = main.replace(old_match, "ELEMENTS.filter((e) => tset.has(e.searchEnglish[0]))")
open(args[2], 'w', encoding='utf-8').write(head + main)
print('targets', len(targets), targets)
