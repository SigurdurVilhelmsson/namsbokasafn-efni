#!/usr/bin/env python3
"""1b census: formatting features the current composer destroys, per block, over the
driver's population. READER ONLY - no compose, no MT.

Mirrors emit-blocks.py literally for grouping / keys / sendability:
    runs, meta, outcome = readlayer.read(path)
    blocks = FT.merge_blocks(FT.group(runs))
    arc = FT.is_arc(b); lines = block_lines(b); key = block_key(b)
    joined = key if arc else ' '.join(lines)
    send = FT.sendable(b, joined, meta['fonts'])

usage: python3 -u census.py --out figs.jsonl [--only names.txt] [--budget 420]
Resumable: a figure already in --out is skipped. A figure that was STARTED but never
written (process killed / crashed) is recorded as status 'crashed-or-killed' and skipped.
"""
import argparse, json, math, os, re, signal, sys, time, gc
from pathlib import Path
from collections import defaultdict, OrderedDict

EXP = Path('/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation')
sys.path.insert(0, str(EXP)); sys.path.insert(0, str(EXP / 'pylibs'))
os.environ.setdefault('FIGTEXT_PYLIBS', str(EXP / 'pylibs'))
import _deps  # noqa
import figtext as FT
from blockkey import block_key, block_lines
from readlayer import read, _looks_undecoded
sys.path.insert(0, '/home/siggi/dev/scratch-c140/c2/proto')
import scripts as TS  # c2

HERE = Path(__file__).resolve().parent

# ---- thresholds (stated) ------------------------------------------------------------
SCRIPT_RATIO = 0.9        # run size / line max size below this = smaller run
SCRIPT_OFFSET_PT = 0.5    # |proj(run) - line base| above this = baseline shift
STACK_FRAC = 0.6          # stacked split: |dproj| < 0.6 * block max size * 1.222
SKEW_DEG = 2.0            # synthetic oblique: up-vector off perpendicular by > 2 deg
ROT_EPS = 0.5
ITALIC_RE = re.compile(r'italic|oblique', re.I)
ITALIC_LOOSE_RE = re.compile(r'(-|,)(Bold)?It(MT)?$|Ital|Slant|Kursiv', re.I)
BOLD_RE = re.compile(r'bold', re.I)          # compose.py BOLD rule: 'bold' in base.lower()
SYMBOL_RE = re.compile(r'symbol|dingbat|wingding|webding|mathematicalpi|mathpi|greek|'
                       r'mt ?extra|euclid|cmsy|cmmi|msam|msbm|marlett|stixsizes', re.I)
COMMON_PUNCT = set(chr(c) for c in list(range(0x2010, 0x2016)) + list(range(0x2018, 0x2020))
                   + [0x2020, 0x2021, 0x2022, 0x2026, 0x2030, 0x2032, 0x2033])


def norm_family(base):
    b = (base or '').lstrip('/')
    if len(b) > 7 and b[6] == '+' and b[:6].isalpha() and b[:6].isupper():
        b = b[7:]
    b = re.split(r'[-,]', b, maxsplit=1)[0]
    b = re.sub(r'(PSMT|PS|MT)$', '', b)
    return b or '(empty)'


def fill_class(f):
    if f is None:
        return 'None'
    if isinstance(f, (list, tuple)) and f and f[0] == 'cmyk' and len(f) == 5:
        c, m, y, k = f[1:]
        if max(c, m, y) < 1e-3:
            return 'black' if k > 0.999 else ('white' if k < 1e-3 else 'gray')
        return 'colour'
    return 'other:' + str(f)[:20]


def fill_kind(f):
    if f is None:
        return 'None'
    if isinstance(f, (list, tuple)) and f:
        return str(f[0])
    return type(f).__name__


def skew_deg(r):
    tm = r.get('tm')
    if not tm or len(tm) < 4:
        return 0.0
    a, b, c, d = tm[:4]
    if math.hypot(c, d) < 1e-9 or math.hypot(a, b) < 1e-9:
        return 0.0
    rot = math.degrees(math.atan2(b, a))
    up = math.degrees(math.atan2(d, c))
    return abs(((up - rot) % 180.0) - 90.0)


def block_features(b, fonts):
    arc = FT.is_arc(b)
    lines_txt = block_lines(b)
    key = block_key(b)
    joined = key if arc else ' '.join(lines_txt)
    send = FT.sendable(b, joined, fonts)
    ls = FT.lines(b)
    nb = [r for r in b if r['text'].strip()]
    base_of = lambda r: fonts.get(r['font'], {}).get('base', '')
    bmax = max(r['size'] for r in b)

    has_script = False; script_runs = 0; mixed_size = False; shift_any = False; shift_examples = []
    max_space = 0; max_gap = 0.0
    multifill_line = mixed_font_line = mixed_weight_line = False
    script_examples = []
    for l in ls:
        lnb = [r for r in l if r['text'].strip()] or l
        M = max(r['size'] for r in lnb)
        full = [r for r in lnb if r['size'] >= SCRIPT_RATIO * M]
        projs = sorted(FT.proj(r) for r in full)
        base = projs[len(projs) // 2]
        for r in lnb:
            if r['size'] < SCRIPT_RATIO * M:
                mixed_size = True
                off = FT.proj(r) - base
                if abs(off) > SCRIPT_OFFSET_PT:
                    has_script = True; script_runs += 1
                    if len(script_examples) < 3:
                        script_examples.append([r['text'], round(r['size'], 2), round(off, 2)])
            if not arc:
                off2 = FT.proj(r) - base
                if abs(off2) > SCRIPT_OFFSET_PT:
                    shift_any = True
                    if len(shift_examples) < 3:
                        shift_examples.append([r['text'], round(r['size'], 2), round(off2, 2)])
        jt = ''.join(r['text'] for r in l)
        for m in re.findall(r'[  ]{2,}', jt.strip()):
            max_space = max(max_space, len(m))
        for p, r in zip(l, l[1:]):
            g = FT.along(r) - FT.along(p) - p['adv']
            max_gap = max(max_gap, g)
        if len({json.dumps(r['fill']) for r in lnb}) > 1: multifill_line = True
        if len({r['font'] for r in lnb}) > 1: mixed_font_line = True
        if len({bool(BOLD_RE.search(base_of(r))) for r in lnb}) > 1: mixed_weight_line = True

    # stacked split: the pair lines() split on, closer than a script-shift, with a smaller run
    n_lines = len(ls)
    joins_boundary = joins_baseline = joins_geom = 0
    for i in range(n_lines - 1):
        x, y = ls[i][-1], ls[i + 1][0]
        d = abs(FT.proj(y) - FT.proj(x))
        smaller = x['size'] < SCRIPT_RATIO * bmax or y['size'] < SCRIPT_RATIO * bmax
        if smaller and d < STACK_FRAC * bmax * 1.222:
            joins_boundary += 1
        # secondary: dominant baselines of the two lines within half a size
        def dom(l):
            lnb = [r for r in l if r['text'].strip()] or l
            M = max(r['size'] for r in lnb)
            ps = sorted(FT.proj(r) for r in lnb if r['size'] >= SCRIPT_RATIO * M)
            return ps[len(ps) // 2], M
        (p1, m1), (p2, m2) = dom(ls[i]), dom(ls[i + 1])
        if abs(p1 - p2) < 0.5 * max(m1, m2):
            joins_baseline += 1
        # geometric: the next line CONTINUES rightward from where this one ended (a kerned
        # script), at less than 0.9 of a normal leading. Size-independent. Arcs excluded.
        gap = FT.along(y) - FT.along(x) - x['adv']
        if (not arc) and -0.6 * bmax <= gap <= 2.5 and d < 0.9 * bmax * 1.222 \
                and abs(x['rot'] - y['rot']) < 3:
            joins_geom += 1

    italic_fonts = sorted({base_of(r) for r in nb if ITALIC_RE.search(base_of(r))})
    italic_loose = sorted({base_of(r) for r in nb if not ITALIC_RE.search(base_of(r))
                           and ITALIC_LOOSE_RE.search(base_of(r))})
    obl = [round(skew_deg(r), 1) for r in nb if skew_deg(r) > SKEW_DEG]
    fams = sorted({norm_family(base_of(r)) for r in nb})
    text_nb = ''.join(r['text'] for r in nb)
    non_text = sorted({ch for ch in text_nb if ord(ch) > 0xFF and ch not in COMMON_PUNCT})
    nonascii = sorted({ch for ch in text_nb if ord(ch) > 0x7E})
    sym = sorted({base_of(r) for r in nb if SYMBOL_RE.search(base_of(r))})
    sym_ascii = sorted({r['text'] for r in nb if SYMBOL_RE.search(base_of(r))
                        and re.search(r'[A-Za-z]', r['text'])})
    # ---- c2 additions ------------------------------------------------------------------
    it = lambda r: bool(ITALIC_RE.search(base_of(r)))
    c2_it_mixed_line = any(len({it(r) for r in l if r['text'].strip()}) > 1 for l in ls)
    c2_it_whole = bool(nb) and all(it(r) for r in nb)
    c2_it_texts = [r['text'] for r in nb if it(r)][:8]
    c2_toks = TS.source_tokens(b, fonts) if not arc else []
    c2_tok_kinds = sorted({('script' if any(st and abs(st[1]) > 0.05 for st in t['styles']) else '')
                           + ('italic' if any(st and st[2] for st in t['styles']) else '') for t in c2_toks})
    c2_nobase = [t['text'] for t in c2_toks if all(st is not None for st in t['styles'])]
    c2_script_chars = 0; c2_orphan_line = False
    for l in ([b] if arc else ls):
        t_, sts, base_ = TS.line_char_styles(l, fonts)
        c2_script_chars += sum(1 for st in sts if st and abs(st[1]) > 0.05)
        if l and all(r['size'] < SCRIPT_RATIO * bmax for r in l if r['text'].strip()) and any(r['text'].strip() for r in l):
            c2_orphan_line = True
    c2 = dict(c2_italic_mixed_line=c2_it_mixed_line, c2_italic_whole_block=c2_it_whole,
              c2_italic_texts=c2_it_texts, c2_tokens=[t['text'] for t in c2_toks][:12],
              c2_token_kinds=c2_tok_kinds, c2_nobase_tokens=c2_nobase,
              c2_script_chars=c2_script_chars, c2_script_only_line=c2_orphan_line)
    return OrderedDict(
        **c2,
        key=key, english=joined, send=send, arc=arc, n_lines=n_lines, n_runs=len(b),
        sizes=sorted({round(r['size'], 2) for r in nb}),
        rot=round(b[0]['rot'], 2), rot_nonzero=any(abs(r['rot']) > ROT_EPS for r in b),
        has_script=has_script, script_runs=script_runs, script_examples=script_examples,
        has_mixed_size=mixed_size,
        has_italic=bool(italic_fonts), italic_fonts=italic_fonts,
        italic_loose_fonts=italic_loose, has_oblique_tm=bool(obl), oblique_skews=obl[:5],
        has_bold=any(BOLD_RE.search(base_of(r)) for r in nb),
        has_mixed_weight_line=mixed_weight_line,
        has_multispace=max_space >= 2, max_space_run=max_space, max_gap_pt=round(max_gap, 2),
        stacked_split=joins_boundary > 0, n_lines_scriptaware=n_lines - joins_boundary,
        stacked_split_baseline=joins_baseline > 0,
        stacked_split_geom=joins_geom > 0, n_lines_geomaware=n_lines - joins_geom,
        has_shift_any=shift_any, shift_examples=shift_examples,
        first_run_smaller=b[0]['size'] < SCRIPT_RATIO * bmax,
        arc_mixed_size=arc and (max(r['size'] for r in b) - min(r['size'] for r in b)) >= 0.2,
        runs=[[r['text'], round(r['size'], 2), round(FT.along(r), 2), round(FT.proj(r), 2),
               round(r['adv'], 2), round(r['rot'], 1), r['font']] for r in b],
        font_families=fams, font_bases=sorted({base_of(r) for r in nb}),
        non_text_glyphs=non_text, nonascii_chars=nonascii,
        fill_kinds=sorted({fill_kind(r['fill']) for r in nb}),
        fill_classes=sorted({fill_class(r['fill']) for r in nb}),
        has_multifill_line=multifill_line, has_mixed_font_line=mixed_font_line,
        undecoded=_looks_undecoded(joined),
        symbol_fonts=sym, symbol_font_ascii=sym_ascii,
    )


class Timeout(Exception):
    pass


def _alarm(signum, frame):
    raise Timeout()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--only')
    ap.add_argument('--budget', type=float, default=420)
    ap.add_argument('--fig-timeout', type=int, default=150)
    ap.add_argument('--path-override-dir',
                    help='read <dir>/<basename>/<basename>.pdf instead of the resolved artwork')
    args = ap.parse_args()
    out = Path(args.out)
    started_f = out.with_suffix('.started')
    rows = json.load(open(HERE / 'resolved.json'))
    if args.only:
        want = set(Path(args.only).read_text().split())
        rows = [r for r in rows if r['basename'] in want]
    done = set()
    if out.exists():
        for line in out.read_text().splitlines():
            if line.strip():
                done.add(json.loads(line)['basename'])
    fh = open(out, 'a')
    if started_f.exists():
        s = started_f.read_text().strip()
        if s and s not in done:
            rec = next((r for r in rows if r['basename'] == s), None)
            if rec:
                fh.write(json.dumps(dict(basename=s, chapter=rec['chapter'], moduleId=rec['moduleId'],
                                         status='crashed-or-killed', artwork=rec['artwork'])) + '\n')
                fh.flush(); done.add(s)
                print(f'  recorded {s} as crashed-or-killed')
        started_f.unlink()

    # round-robin across chapters so a partial run is not chapter-biased
    bych = OrderedDict()
    for r in rows:
        bych.setdefault(r['chapter'], []).append(r)
    order = []
    queues = [list(v) for v in bych.values()]
    while any(queues):
        for q in queues:
            if q:
                order.append(q.pop(0))

    signal.signal(signal.SIGALRM, _alarm)
    t0 = time.time(); n = 0
    for rec in order:
        b = rec['basename']
        if b in done:
            continue
        if time.time() - t0 > args.budget:
            print(f'  budget reached after {n} figures this call')
            break
        base = dict(basename=b, chapter=rec['chapter'], moduleId=rec['moduleId'],
                    edition=rec['edition'], via=rec['via'], artwork=rec['artwork'],
                    ext=Path(rec['artwork']).suffix.lower() if rec['artwork'] else None)
        if not rec['artwork']:
            base.update(status='unresolved', superseded=bool(rec.get('superseded')),
                        contest=rec.get('contest'))
            fh.write(json.dumps(base, ensure_ascii=False) + '\n'); fh.flush(); n += 1; done.add(b)
            continue
        path = rec['artwork']
        if args.path_override_dir:
            path = str(Path(args.path_override_dir) / b / f'{b}.pdf')
            base['read_path'] = path
        started_f.write_text(b)
        ft = time.time()
        signal.alarm(args.fig_timeout)
        try:
            runs, meta, outcome = read(path)
            signal.alarm(0)
            blocks = FT.merge_blocks(FT.group(runs))
            fonts = meta['fonts']
            feats = [block_features(bl, fonts) for bl in blocks]
            base.update(status='read-ok', outcome=outcome, n_runs=len(runs), chars=meta['chars'],
                        n_blocks=len(feats), sendable=sum(1 for f in feats if f['send']),
                        color_warnings=meta.get('color_warnings'),
                        unknown_colorspaces=meta.get('unknown_colorspaces'),
                        adv_repaired=meta.get('adv_repaired'),
                        unscoped_fonts=meta.get('unscoped_fonts'),
                        secs=round(time.time() - ft, 2), blocks=feats)
        except Timeout:
            base.update(status='read-timeout', secs=round(time.time() - ft, 2))
        except Exception as e:  # noqa: BLE001 - recorded per figure
            signal.alarm(0)
            base.update(status='read-error', error=f'{type(e).__name__}: {str(e)[:300]}',
                        secs=round(time.time() - ft, 2))
        finally:
            signal.alarm(0)
        fh.write(json.dumps(base, ensure_ascii=False) + '\n'); fh.flush()
        started_f.unlink(missing_ok=True)
        n += 1; done.add(b)
        gc.collect()
    remaining = sum(1 for r in order if r['basename'] not in done)
    print(f'  wrote {n} this call; remaining {remaining}; elapsed {time.time() - t0:.0f}s')


if __name__ == '__main__':
    main()
