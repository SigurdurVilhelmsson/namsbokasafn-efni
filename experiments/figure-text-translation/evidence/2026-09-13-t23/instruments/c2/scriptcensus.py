#!/usr/bin/env python3
"""c2 Q1/Q2: compare script definitions on real runs, and record script geometry.

Read-only. Imports figtext/blockkey from the repo (PYTHONDONTWRITEBYTECODE=1 set by caller).
usage: scriptcensus.py <prep-root> <out.jsonl> <basename>...
"""
import sys, json, statistics, collections
EXP = '/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation'
sys.path.insert(0, EXP)
sys.path.insert(0, '/home/siggi/dev/scratch-c140/c2/lib')
import figtext as FT
from blockkey import block_key, block_english
import analyse as A   # 2b's char_attrs (SCRIPT_RATIO 0.9, SHIFT_FRAC 0.12)

SC = '/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/figure-text'


def group_clauses(p, r):
    """figtext.group's four clauses for the consecutive pair (p, r), copied verbatim."""
    import math
    same = abs(r['size']-p['size']) < 0.2 and abs(r['rot']-p['rot']) < 3
    adjacent = -0.5 <= FT.along(r)-FT.along(p)-p['adv'] < 2.5
    cont = same and abs(FT.proj(r)-FT.proj(p)) < 0.5*p['size'] and adjacent
    script = (adjacent and abs(r['rot']-p['rot']) < 3
              and abs(FT.proj(r)-FT.proj(p)) < 0.45*max(p['size'], r['size'])
              and 0.4 <= r['size']/p['size'] <= 2.5)
    nl = same and abs((FT.proj(p)-FT.proj(r)) - p['size']*1.222) < 2.0 and abs(FT.along(r)-FT.along(p)) < 45
    arc = (abs(r['size']-p['size']) < 0.2 and len(p['text']) <= 1 and len(r['text']) <= 1
           and abs(r['rot']-p['rot']) < 12
           and math.hypot(r['x']-p['x'], r['y']-p['y']) < p['size']*1.6)
    return dict(cont=cont, script=script, nl=nl, arc=arc)


def main(root, outp, names):
    rows = []
    for bn in names:
        d = f'{root}/{bn}'
        runs = json.load(open(f'{d}/runs.json'))
        meta = json.load(open(f'{d}/meta.json'))
        bj = json.load(open(f'{d}/blocks.json'))
        try:
            sc = json.load(open(f'{SC}/{bn}.is.json'))['blocks']
        except FileNotFoundError:
            sc = {}
        blocks = FT.merge_blocks(FT.group(runs))
        keys = [block_key(b) for b in blocks]
        vint = (collections.Counter(keys) == collections.Counter(p['key'] for p in bj)
                and set(sc) == {p['key'] for p in bj if p['send']})
        idx = {id(r): i for i, r in enumerate(runs)}
        send = {p['key']: p['send'] for p in bj}
        for bi, b in enumerate(blocks):
            key = keys[bi]
            arc = FT.is_arc(b)
            state = ('never-sent' if key not in sc else
                     'identity' if FT.is_identity(sc[key], block_english(b), arc) else 'translated')
            for li, l in enumerate([b] if arc else FT.lines(b)):
                attrs, base = A.char_attrs(l, meta)
                maxsz = max(r['size'] for r in l)
                full = [r for r in l if abs(r['size'] - maxsz) < 0.2]
                base_1b = statistics.median(FT.proj(r) for r in full)
                base_runs = [r for r in l if abs(r['size'] - base) < 0.2]
                base_2b = statistics.median(FT.proj(r) for r in base_runs)
                k = 0
                for ri, r in enumerate(l):
                    n = len(r['text'])
                    sc2b = attrs[k]['script'] if n else None
                    k += n
                    gi = idx[id(r)]
                    clauses = group_clauses(runs[gi-1], r) if gi > 0 else None
                    shift = FT.proj(r) - base_2b
                    bold, italic = FT.run_face(r, meta['fonts'])
                    rows.append(dict(
                        basename=bn, vintage_ok=vint, block=bi, key=key, state=state, arc=arc,
                        line=li, run=ri, text=r['text'], size=r['size'], base_size=base,
                        ratio=round(r['size']/base, 4), shift_pt=round(shift, 3),
                        shift_frac=round(shift/base, 4),
                        rule_2b=sc2b,
                        rule_1b_has_script=bool(r['text'].strip()) and r['size'] < 0.9*maxsz
                                            and abs(FT.proj(r) - base_1b) > 0.5,
                        rule_1b_shift075=(not arc) and abs(FT.proj(r) - base_1b) > 0.75,
                        group_script_clause=clauses['script'] if clauses else None,
                        group_script_decisive=(clauses['script'] and not (clauses['cont'] or clauses['nl'] or clauses['arc'])) if clauses else None,
                        group_prev_same_line=(ri > 0),
                        italic=italic, bold=bold,
                        font=meta['fonts'].get(r['font'], {}).get('base', ''),
                        adv=r['adv'], along=round(FT.along(r), 3),
                        send=send.get(key)))
    with open(outp, 'w') as fo:
        for row in rows:
            fo.write(json.dumps(row, ensure_ascii=False) + '\n')
    print('rows', len(rows), 'figures', len(names))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3:])
