#!/usr/bin/env python3
"""Re-prepare and recompose the 34 bought figures with the CURRENT composer (scratch tree
copy of HEAD, instrumented). 0 ISK: only figure-prepare.py, compose.py, pdftocairo run.

    python3 -u prep_driver.py resolve            # write sources.json (de-hash lookup fallback)
    python3 -u prep_driver.py run [N]            # process up to N not-yet-done figures, in order
    python3 -u prep_driver.py manifest           # aggregate figs/*/prep-row.json -> manifest.json

Resumable: a figure is DONE only when figs/<b>/prep-row.json exists (written last). A figure
dir without it is wiped and redone. Never deletes a DONE figure's outputs.
"""
import collections, hashlib, json, os, re, shutil, struct, subprocess, sys, time
from pathlib import Path

REPO = Path('/home/siggi/dev/repos/namsbokasafn-efni')
EXP = REPO / 'experiments/figure-text-translation'
P = Path('/home/siggi/dev/scratch-c140/prep')
TREE = P / 'tree'
FIGS = P / 'figs'
SIDECARS = REPO / 'books/efnafraedi-2e/figure-text'
MEDIA = REPO / 'books/efnafraedi-2e/media'
LAST = 'CNX_Chem_03_01_exocytosis-88f6'          # 24 MB artwork: do it last
HASH_SUFFIX = re.compile(r'-[0-9a-f]{4}$')
MIN_AVAIL_KIB = 2 * 1024 * 1024

ENV = dict(os.environ,
           FIGTEXT_PYLIBS=str(EXP / 'pylibs'),
           # keep every .pyc write OUT of the repo (pylibs is a symlink into it)
           PYTHONPYCACHEPREFIX=str(P / 'pycache'))


def names():
    ns = sorted(p.name[:-len('.is.json')] for p in SIDECARS.glob('*.is.json'))
    assert len(ns) == 34, len(ns)
    assert LAST in ns
    return [n for n in ns if n != LAST] + [LAST]


def avail_kib():
    out = subprocess.run(['free', '-k'], capture_output=True, text=True, check=True).stdout
    hdr, mem = out.splitlines()[0].split(), out.splitlines()[1].split()
    return int(mem[1 + hdr.index('available')])


def free_h():
    return subprocess.run(['free', '-h'], capture_output=True, text=True).stdout.splitlines()[1]


def sh(argv, env=ENV, cwd=TREE, timeout=900):
    return subprocess.run(argv, capture_output=True, text=True, env=env, cwd=str(cwd),
                          timeout=timeout)


def resolve():
    ns = names()
    r = sh([sys.executable, 'sources.py', '--json', 'efnafraedi-2e', *ns])
    (P / 'logs' / 'sources.stdout.json').write_text(r.stdout)
    (P / 'logs' / 'sources.stderr.txt').write_text(r.stderr)
    got = json.loads(r.stdout)
    direct = {n: got.get(n) for n in ns}
    missing = [n for n in ns if not got.get(n)]
    alt = {}
    if missing:
        r2 = sh([sys.executable, 'sources.py', '--json', 'efnafraedi-2e',
                 *[HASH_SUFFIX.sub('', n) for n in missing]])
        (P / 'logs' / 'sources-dehash.stdout.json').write_text(r2.stdout)
        alt = json.loads(r2.stdout)
    rec = {}
    for n in ns:
        if got.get(n):
            rec[n] = dict(record=got[n], lookup=n, dehashed=False)
        else:
            k = HASH_SUFFIX.sub('', n)
            rec[n] = dict(record=alt.get(k), lookup=k, dehashed=True)
    bad = [n for n in ns if not (rec[n]['record'] or {}).get('path')]
    (P / 'sources.json').write_text(json.dumps(rec, indent=1))
    print('direct-resolved:', len(ns) - len(missing), 'needed de-hash:', len(missing), missing)
    print('unresolved after fallback:', bad)
    exts = collections.Counter(Path(v['record']['path']).suffix.lower() for v in rec.values()
                               if v['record'])
    print('source extensions:', dict(exts))
    assert not bad, bad


def png_dims(path):
    with open(path, 'rb') as fh:
        head = fh.read(24)
    assert head[:8] == b'\x89PNG\r\n\x1a\n' and head[12:16] == b'IHDR', path
    return list(struct.unpack('>II', head[16:24]))


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def one(b, src):
    d = FIGS / b
    shutil.rmtree(d, ignore_errors=True)
    d.mkdir(parents=True)
    t0 = time.monotonic()
    avail_before = avail_kib()
    p = sh([sys.executable, '-u', 'figure-prepare.py', src, '--basename', b, '--out', str(d)])
    (d / 'prepare.stdout.txt').write_text(p.stdout)
    (d / 'prepare.stderr.txt').write_text(p.stderr)
    assert p.returncode == 0, (b, 'prepare', p.returncode, p.stderr[-600:])
    t_prep = time.monotonic() - t0
    sidecar = SIDECARS / f'{b}.is.json'
    c = sh([sys.executable, '-u', 'compose.py', '--translations', str(sidecar), '--svg'],
           env=dict(ENV, FIGTEXT_OUT=str(d)))
    (d / 'compose.stdout.txt').write_text(c.stdout)
    (d / 'compose.stderr.txt').write_text(c.stderr)
    assert c.returncode == 0, (b, 'compose', c.returncode, c.stderr[-600:])
    t_comp = time.monotonic() - t0 - t_prep
    staged = d / f'{b}.pdf'
    assert staged.is_file() and staged.stat().st_size > 0, staged
    s = subprocess.run(['pdftocairo', '-png', '-r', '200', '-singlefile', str(staged),
                        str(d / 'source')], capture_output=True, text=True, timeout=900)
    assert s.returncode == 0, (b, 'pdftocairo', s.stderr[-400:])
    t_src = time.monotonic() - t0 - t_prep - t_comp
    secs = time.monotonic() - t0

    required = ['artwork.png', 'artwork.pdf', 'artwork.svg', 'runs.json', 'meta.json',
                'blocks.json', 'translated.png', 'translated.svg', 'items.json',
                'compose-report.json', 'source.png', 'prepare.json', f'{b}.pdf']
    absent = [f for f in required if not (d / f).is_file() or (d / f).stat().st_size == 0]
    assert not absent, (b, 'absent outputs', absent)

    meta = json.loads((d / 'meta.json').read_text())
    prep = json.loads((d / 'prepare.json').read_text())
    rep = json.loads((d / 'compose-report.json').read_text())
    blocks = json.loads((d / 'blocks.json').read_text())
    items = json.loads((d / 'items.json').read_text())
    side = json.loads(sidecar.read_text())
    skeys = list(side['blocks'].keys())

    C = collections.Counter
    src_dims, art_dims, tr_dims = png_dims(d / 'source.png'), png_dims(d / 'artwork.png'), \
        png_dims(d / 'translated.png')

    ident, trans = set(rep['identity']), set(rep['translated'])
    pop_idx = [i for i, k in enumerate(rep['blocks']) if k in trans and k not in ident]
    kept_idx = [i for i in range(len(rep['blocks'])) if i not in set(pop_idx)]
    runexact_set = set(rep['runExact'])

    # blocks.json vs compose-report: same keys in same order (both are merge_blocks order)
    bj_keys = [x['key'] for x in blocks]
    send_true = [x['key'] for x in blocks if x['send']]
    send_false = [x['key'] for x in blocks if not x['send']]

    # item path bookkeeping
    paths_by_block = collections.defaultdict(C)
    for it in items:
        paths_by_block[it['block']][it['path']] += 1
    item_paths = C(it['path'] for it in items)
    none_block_items = sum(1 for it in items if it['block'] is None)
    path_violations = []
    for i, k in enumerate(rep['blocks']):
        got = set(paths_by_block.get(i, {}))
        if i in set(pop_idx):
            if not got <= {'arc', 'layout'}:
                path_violations.append(dict(i=i, key=k, expected='arc|layout', got=sorted(got)))
        else:
            if not got <= {'run-exact'}:
                path_violations.append(dict(i=i, key=k, expected='run-exact', got=sorted(got)))
    blocks_zero_items = [dict(i=i, key=k, population=i in set(pop_idx))
                         for i, k in enumerate(rep['blocks']) if i not in paths_by_block]
    pop_path = C()
    for i in pop_idx:
        pb = paths_by_block.get(i, {})
        pop_path['arc' if 'arc' in pb else 'layout' if 'layout' in pb else 'none'] += 1

    committed = MEDIA / f'{b}_IS.svg'
    committed_sha = sha256(committed) if committed.is_file() else None
    translated_sha = sha256(d / 'translated.svg')
    arc_all = [i for i, x in enumerate(blocks) if x['arc']]
    arc_pop = [i for i in arc_all if i in set(pop_idx)]
    row = dict(
        basename=b,
        dir=str(d),
        source=src,
        stagedPdf=str(staged),
        pageSizePt=meta['page'],
        pngDims=dict(source=src_dims, artwork=art_dims, translated=tr_dims),
        sourceArtworkDimsEqual=src_dims == art_dims,
        counts=dict(
            blocks=len(rep['blocks']),
            missing=len(rep['missing']),
            translated=len(rep['translated']),
            identity=len(rep['identity']),
            runExact=len(rep['runExact']),
            translatedMinusIdentity=len(rep['translated']) - len(rep['identity']),
            populationBlocks=len(pop_idx),         # t3's definition: drawn blocks, key in
                                                   # translated and not in identity
            degenerate=len(rep['degenerate']),
            undecodable=len(rep['undecodable']),
            items=len(items),
            itemsByPath=dict(item_paths),
            populationBlocksByPath=dict(pop_path),
            arcBlocksAll=len(arc_all),                 # blocks.json arc:true (FT.is_arc)
            arcBlocksPopulation=len(arc_pop),          # of those, translated non-identity
            arcBlocksPopulationKeys=[rep['blocks'][i] for i in arc_pop],
        ),
        prepare=dict(blocks=prep['blocks'], sendable=prep['sendable'],
                     verbatimBlocks=prep['verbatimBlocks'],
                     undecodedBlocks=prep['undecodedBlocks'],
                     missingFontBlocks=prep['missingFontBlocks'], warnings=prep['warnings']),
        checks=dict(
            blocksJsonKeysEqualReportBlocks=bj_keys == rep['blocks'],
            sendTrueKeySetEqualsSidecarKeySet=set(send_true) == set(skeys),
            sendTrueOnlyNotInSidecar=sorted(set(send_true) - set(skeys)),
            sidecarOnlyNotSendTrue=sorted(set(skeys) - set(send_true)),
            sendTrueMultiset={k: v for k, v in C(send_true).items() if v > 1},
            sidecarKeyCount=len(skeys),
            sendTrueDrawnCount=len(send_true),
            sendTrueUniqueCount=len(set(send_true)),
            reportTranslatedMultisetEqualsSendTrue=C(rep['translated']) == C(send_true),
            reportMissingMultisetEqualsSendFalse=C(rep['missing']) == C(send_false),
            runExactEqualsMissingPlusIdentity=C(rep['runExact']) == C(rep['missing']) + C(rep['identity']),
            itemsWithNoBlockIndex=none_block_items,
            pathViolations=path_violations,
            blocksWithZeroItems=blocks_zero_items,
            translatedSvgSha256=translated_sha,
            committedIsSvgSha256=committed_sha,
            translatedSvgEqualsCommitted=committed_sha is not None and committed_sha == translated_sha,
        ),
        names=dict(identity=rep['identity'], degenerate=rep['degenerate'],
                   undecodable=rep['undecodable']),
        seconds=dict(total=round(secs, 2), prepare=round(t_prep, 2), compose=round(t_comp, 2),
                     sourcePng=round(t_src, 2)),
        memAvailKiBBefore=avail_before,
    )
    (d / 'prep-row.json').write_text(json.dumps(row, indent=1, ensure_ascii=False))
    return row


def run(limit):
    rec = json.loads((P / 'sources.json').read_text())
    done_n = 0
    for b in names():
        if (FIGS / b / 'prep-row.json').is_file():
            continue
        if done_n >= limit:
            break
        a = avail_kib()
        print(f'[{time.strftime("%H:%M:%S")}] {b}  free: {free_h()}', flush=True)
        if a < MIN_AVAIL_KIB:
            print(f'STOP: available {a} KiB < 2 GiB before {b}', flush=True)
            return
        row = one(b, rec[b]['record']['path'])
        c = row['counts']
        print(f'   done {row["seconds"]["total"]}s  blocks={c["blocks"]} missing={c["missing"]} '
              f'translated={c["translated"]} identity={c["identity"]} runExact={c["runExact"]} '
              f'dims src={row["pngDims"]["source"]} art={row["pngDims"]["artwork"]} '
              f'svg==committed={row["checks"]["translatedSvgEqualsCommitted"]}', flush=True)
        done_n += 1
    left = [b for b in names() if not (FIGS / b / 'prep-row.json').is_file()]
    print('remaining:', len(left), left, flush=True)


def manifest():
    rec = json.loads((P / 'sources.json').read_text())
    rows = []
    for b in names():
        f = FIGS / b / 'prep-row.json'
        assert f.is_file(), f'not done: {b}'
        r = json.loads(f.read_text())
        r['sourceResolution'] = dict(lookup=rec[b]['lookup'], dehashed=rec[b]['dehashed'],
                                     record=rec[b]['record'])
        rows.append(r)
    keys = ('blocks', 'missing', 'translated', 'identity', 'runExact',
            'translatedMinusIdentity', 'populationBlocks', 'degenerate', 'undecodable', 'items',
            'arcBlocksAll', 'arcBlocksPopulation')
    tot = {k: sum(r['counts'][k] for r in rows) for k in keys}
    tot['figures'] = len(rows)
    tot['itemsByPath'] = dict(sum((collections.Counter(r['counts']['itemsByPath']) for r in rows),
                                  collections.Counter()))
    tot['populationBlocksByPath'] = dict(sum((collections.Counter(r['counts']['populationBlocksByPath'])
                                              for r in rows), collections.Counter()))
    tot['seconds'] = round(sum(r['seconds']['total'] for r in rows), 1)
    chk = {k: [r['basename'] for r in rows if not r['checks'][k]]
           for k in ('blocksJsonKeysEqualReportBlocks', 'sendTrueKeySetEqualsSidecarKeySet',
                     'reportTranslatedMultisetEqualsSendTrue',
                     'reportMissingMultisetEqualsSendFalse',
                     'runExactEqualsMissingPlusIdentity', 'translatedSvgEqualsCommitted')}
    chk['sourceArtworkDimsDiffer'] = [r['basename'] for r in rows if not r['sourceArtworkDimsEqual']]
    chk['pathViolations'] = {r['basename']: r['checks']['pathViolations'] for r in rows
                             if r['checks']['pathViolations']}
    chk['blocksWithZeroItems'] = {r['basename']: r['checks']['blocksWithZeroItems'] for r in rows
                                  if r['checks']['blocksWithZeroItems']}
    chk['itemsWithNoBlockIndex'] = sum(r['checks']['itemsWithNoBlockIndex'] for r in rows)
    chk['sendTrueDuplicatedKeys'] = {r['basename']: r['checks']['sendTrueMultiset'] for r in rows
                                     if r['checks']['sendTrueMultiset']}
    inherited = dict(blocks=367, translatedMinusIdentity=176, identity=7, runExact=191,
                     missing=184)
    compare = {k: dict(inherited=v, measured=tot[k], match=v == tot[k]) for k, v in inherited.items()}
    head = subprocess.run(['git', '-C', str(REPO), 'rev-parse', 'HEAD'], capture_output=True,
                          text=True).stdout.strip()
    out = dict(
        generated=time.strftime('%Y-%m-%dT%H:%M:%S'),
        repoHead=head,
        composer='scratch copy of experiments/figure-text-translation at repoHead, compose.py '
                 'instrumented by patch_compose.py (items.json: block index + draw path)',
        tree=str(TREE),
        units=dict(blocks='drawn blocks (compose-report blocks list, with multiplicity)',
                   items='drawn strings (one per run for run-exact, per glyph for arc, per '
                         'wrapped line for layout)'),
        totals=tot, inheritedComparison=compare, checkFailures=chk, figures=rows)
    (P / 'manifest.json').write_text(json.dumps(out, indent=1, ensure_ascii=False))
    print(json.dumps(dict(totals=tot, inheritedComparison=compare, checkFailures=chk),
                     indent=1, ensure_ascii=False))


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'resolve':
        resolve()
    elif cmd == 'run':
        run(int(sys.argv[2]) if len(sys.argv) > 2 else 10 ** 9)
    elif cmd == 'manifest':
        manifest()
