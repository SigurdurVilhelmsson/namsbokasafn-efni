"""Part 1: can the human-reviewed chemistry text be re-attached BY CONTENT to the new extraction?

Read-only. Inputs come from `git show` (refs) and the committed reference-translations
copies. Output: data/reattach.json + a printed summary.

Unit: one SEGMENT (a module's segment, keyed by its OLD segment id + position).
Test: does an IDENTICAL normalised English segment exist in the NEW 02-for-mt (98a5fe2ff)?
"""
import sys, json, re, collections, difflib
sys.path.insert(0, '.')
from segs import parse, norm_en, git_show, git_ls

OLD = '9a69414d5'
NEW = '98a5fe2ff'
R = '/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/reference-translations/pre-remt-editorial-2026-08-23'
BOOK = 'books/efnafraedi-2e'
FAITHFUL = {'m68663': 'ch01', 'm68664': 'ch01', 'm68699': 'ch03', 'm68700': 'ch03'}
FA_COMMIT = {'m68663': 'f7ea05bf9', 'm68664': '4ec48fbab', 'm68699': '8fd9d7956', 'm68700': '436e8a4fe'}
HARVEST_MOD_CH = {'m68663': 'ch01', 'm68664': 'ch01', 'm68667': 'ch01', 'm68674': 'ch01',
                  'm68699': 'ch03', 'm68700': 'ch03', 'chapter-metadata': None}


def loose(s):
    """Letters+digits only, lower-cased: a diagnostic, NOT the headline test."""
    return re.sub(r'[^0-9a-záéíóúýþæöðA-ZÁÉÍÓÚÝÞÆÖÐ]+', '', norm_en(s)).lower()


def module_files(ref):
    out = {}
    for f in git_ls(ref, f'{BOOK}/02-for-mt/'):
        m = re.match(rf'{BOOK}/02-for-mt/([^/]+)/([^/()]+)-segments\.en\.md$', f)
        if m:
            out[(m.group(1), m.group(2))] = f
    return out


# ------------------------------------------------------------ the NEW index
new_files = module_files(NEW)
NEW_SEGS = {}   # (ch, mod) -> [(id, text)]
NEW_IDX = collections.defaultdict(list)     # norm -> [(ch, mod, id, pos)]
NEW_LOOSE = collections.defaultdict(list)
for (ch, mod), f in new_files.items():
    segs = parse(git_show(NEW, f))
    NEW_SEGS[(ch, mod)] = segs
    for pos, (i, t) in enumerate(segs):
        n = norm_en(t)
        if n:
            NEW_IDX[n].append((ch, mod, i, pos))
            NEW_LOOSE[loose(t)].append((ch, mod, i, pos))
print(f'NEW index: {len(new_files)} files, {sum(len(v) for v in NEW_SEGS.values())} segments')

# ------------------------------------------------------------ OLD EN / MT
def load(ref, sub, ch, mod, ext):
    t = git_show(ref, f'{BOOK}/{sub}/{ch}/{mod}-segments.{ext}.md')
    return parse(t) if t is not None else None


def classify(ch, mod, sid, en_old):
    """Return (verdict, detail) for one old EN segment against the NEW index."""
    n = norm_en(en_old)
    hits = NEW_IDX.get(n, [])
    same_mod = [h for h in hits if h[1] == mod]
    if same_mod:
        same_id = [h for h in same_mod if h[2] == sid]
        return ('match-same-module-same-id' if same_id else 'match-same-module-other-id',
                {'newIds': sorted({h[2] for h in same_mod}), 'nHits': len(hits)})
    if hits:
        return ('match-other-module', {'newIds': sorted({f'{h[1]}:{h[2]}' for h in hits})[:5]})
    # ---- no identical normalised segment: diagnose
    lh = NEW_LOOSE.get(loose(en_old), [])
    if lh:
        return ('loose-only', {'newIds': sorted({f'{h[1]}:{h[2]}' for h in lh})[:5]})
    segs = NEW_SEGS.get((ch, mod), [])
    best = (0.0, None, None)
    for i, t in segs:
        r = difflib.SequenceMatcher(None, n, norm_en(t), autojunk=False).ratio()
        if r > best[0]:
            best = (r, i, t)
    # containment checks: old inside one new (merge), or several new inside old (split)
    contained_in = [i for i, t in segs if n and len(n) > 3 and n in norm_en(t)]
    parts = [i for i, t in segs if norm_en(t) and len(norm_en(t)) > 3 and norm_en(t) in n and norm_en(t) != n]
    same_id_new = [t for i, t in segs if i == sid]
    det = {'bestRatio': round(best[0], 3), 'bestId': best[1],
           'bestNew': (best[2] or '')[:300], 'old': en_old[:300],
           'oldContainedInNew': contained_in[:5], 'newPartsInsideOld': parts[:8],
           'sameIdNowNames': (same_id_new[0][:200] if same_id_new else None)}
    if contained_in:
        return ('no-match:old-text-now-inside-a-longer-new-segment', det)
    if len(parts) >= 1:
        return ('no-match:old-segment-now-split-across-new-segments', det)
    return ('no-match:text-differs', det)


records = []

# ------------------------------------------------------------ faithful files
for mod, ch in FAITHFUL.items():
    fa = parse(open(f'{R}/{ch}/{mod}-segments.is.md').read())
    # EN at the faithful file's own commit (the tree prod had when it wrote the file)
    en_c = load(FA_COMMIT[mod], '02-for-mt', ch, mod, 'en')
    en_o = load(OLD, '02-for-mt', ch, mod, 'en')
    mt_c = load(FA_COMMIT[mod], '02-mt-output', ch, mod, 'is')
    assert [i for i, _ in fa] == [i for i, _ in en_c] == [i for i, _ in en_o] == [i for i, _ in mt_c], mod
    for pos, ((sid, is_fa), (_, en), (_, en9), (_, mt)) in enumerate(zip(fa, en_c, en_o, mt_c)):
        assert norm_en(en) == norm_en(en9), (mod, sid)
        edited = norm_en(is_fa) != norm_en(mt)
        v, det = classify(ch, mod, sid, en)
        records.append({'source': 'faithful', 'module': mod, 'chapter': ch, 'segId': sid, 'pos': pos,
                        'editedVsMT': edited, 'rawDiffVsMT': is_fa != mt,
                        'enOld': en, 'isHuman': is_fa, 'mtOld': mt, 'verdict': v, 'detail': det})

# ------------------------------------------------------------ harvest rows
H = json.load(open(f'{R}/segment-edits-harvest-2026-08-30.json'))['edits']
en_cache, mt_cache = {}, {}
for e in H:
    mod = e['module_id']
    sid = e['segment_id']
    if mod == 'chapter-metadata':
        ch = 'ch%02d' % int(e['chapter'])
        segs = parse(git_show(OLD, f'{BOOK}/02-for-mt/{ch}/chapter-metadata-segments.en.md'))
        enmap = collections.defaultdict(list)
        for i, t in segs:
            enmap[i].append(t)
        en = enmap.get(sid, [None])[0]
        v, det = ('chapter-title', {}) if en is None else classify(ch, 'chapter-metadata', sid, en)
        records.append({'source': 'harvest', 'harvestId': e['id'], 'status': e['status'],
                        'created': e['created_at'], 'module': mod, 'chapter': ch, 'segId': sid,
                        'enOld': en, 'isHuman': e['edited_content'], 'origMT': e['original_content'],
                        'verdict': v, 'detail': det})
        continue
    ch = HARVEST_MOD_CH[mod]
    if (ch, mod) not in en_cache:
        en_cache[(ch, mod)] = load(OLD, '02-for-mt', ch, mod, 'en')
        mt_cache[(ch, mod)] = load(OLD, '02-mt-output', ch, mod, 'is')
    ens = [t for i, t in en_cache[(ch, mod)] if i == sid]
    mts = [t for i, t in mt_cache[(ch, mod)] if i == sid]
    if not ens:
        records.append({'source': 'harvest', 'harvestId': e['id'], 'status': e['status'],
                        'created': e['created_at'], 'module': mod, 'chapter': ch, 'segId': sid,
                        'enOld': None, 'verdict': 'id-not-in-old-EN', 'detail': {}})
        continue
    assert len({norm_en(t) for t in ens}) == 1, (mod, sid)
    en = ens[0]
    v, det = classify(ch, mod, sid, en)
    records.append({'source': 'harvest', 'harvestId': e['id'], 'status': e['status'],
                    'created': e['created_at'], 'module': mod, 'chapter': ch, 'segId': sid,
                    'enOld': en, 'isHuman': e['edited_content'], 'origMT': e['original_content'],
                    'origEqualsOldMT': any(norm_en(m) == norm_en(e['original_content'] or '') for m in mts),
                    'verdict': v, 'detail': det})

json.dump(records, open('data/reattach.json', 'w'), ensure_ascii=False, indent=1)
print('records', len(records))
