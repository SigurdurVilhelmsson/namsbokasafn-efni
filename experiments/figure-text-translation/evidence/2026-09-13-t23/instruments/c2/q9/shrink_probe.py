"""Q9 probe (scratch): plant a TRANSLATED subscript block into the committed fixture, compose with the
UNCHANGED composer and with the c2 prototype, and evaluate the proposed RED-first assertions."""
import json, os, re, subprocess, sys, shutil, collections
from pathlib import Path
EXP = Path('/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation')
sys.path.insert(0, str(EXP)); sys.path.insert(0, str(EXP / 'pylibs'))
os.environ.setdefault('FIGTEXT_PYLIBS', str(EXP / 'pylibs')); os.environ['SOURCE_DATE_EPOCH'] = '1700000000'
os.environ['PYTHONDONTWRITEBYTECODE'] = '1'
import figtext as FT
from blockkey import block_key, block_lines, block_english
HERE = Path(__file__).resolve().parent
HELV = {'M': 833, 'o': 556, 'l': 222, 'e': 556, 's': 500, ' ': 278, 'f': 278, 'N': 722, 'a': 556, '3': 556, 'P': 667, 'O': 778, '4': 556}
FILL = ['cmyk', 0.75, 0.5, 0.0, 0.2]
def adv(t, size): return round(sum(HELV[c] for c in t) * size / 1000.0, 3)
def run(text, x, y, size=12.0, font='PAGE/F1', a=0.0):
    return dict(text=text, font=font, size=size, rot=0.0, x=x, y=y, adv=a, fill=FILL, tm=[1, 0, 0, 1, x, y])
K = 'Moles of Na3PO4'
def plant(out):
    runs = json.loads((out / 'runs.json').read_text())
    x = 10.0; y = 170.0; seq = []
    for t, sz, dy in (('Moles of Na', 12.0, 0.0), ('3', 8.0, -3.0), ('PO', 12.0, 0.0), ('4', 8.0, -3.0)):
        seq.append(run(t, round(x, 3), y + dy, size=sz, a=adv(t, sz))); x += adv(t, sz)
    (out / 'runs.json').write_text(json.dumps(runs + seq, ensure_ascii=False))
def derive(out):
    runs = json.loads((out / 'runs.json').read_text()); fonts = json.loads((out / 'meta.json').read_text())['fonts']
    bl = FT.merge_blocks(FT.group(runs)); ents = []
    for b in bl:
        ents.append(dict(key=block_key(b), english=block_english(b), lines=block_lines(b), arc=FT.is_arc(b), send=FT.sendable(b, block_english(b), fonts)))
    (out / 'blocks.json').write_text(json.dumps(ents, indent=1, ensure_ascii=False)); return bl, ents
def els(svg): return [(m.group(2), dict(re.findall(r'([\w:-]+)="([^"]*)"', m.group(1)))) for m in re.finditer(r'<text ([^>]*)>([^<]*)</text>', svg)]
res = {}
for variant, composer in [('c2', Path('/home/siggi/dev/scratch-c140/c2/proto/compose_ts.py'))]:
    for trname, value in [('shrink', 'Na3PO4Na3PO4Na3PO4Na3PO4')]:
        out = HERE / f'{variant}-{trname}'
        shutil.rmtree(out, ignore_errors=True)
        p = subprocess.run([sys.executable, str(EXP / 'figure-prepare.py'), str(EXP / 'fixtures' / 'fixture_figure.pdf'), '--basename', 'CNX_Fixture_Scripts', '--out', str(out)], capture_output=True, text=True)
        assert p.returncode == 0, p.stderr
        plant(out); bl, ents = derive(out)
        e = [x for x in ents if x['key'] == K]; b = [x for x in bl if block_key(x) == K]
        pre = dict(one_block=len(e) == 1, send=e and e[0]['send'], one_line=b and len(FT.lines(b[0])) == 1, runs=b and len(b[0]))
        tr = out / 'tr.json'
        tr.write_text(json.dumps({'blocks': {x['key']: ('Setja fram tilgatu' if x['key'] == 'Form a hypothesis' else value if x['key'] == K else 'Athugun og forvitni' if x['key'].startswith('Observation') else 'Profa tilgatuna') for x in ents if x['send']}}, ensure_ascii=False))
        env = dict(os.environ, FIGTEXT_OUT=str(out))
        c = subprocess.run([sys.executable, str(composer), '--translations', str(tr), '--svg'], capture_output=True, text=True, env=env, cwd=str(EXP))
        svg = (out / 'translated.svg').read_text(); rep = json.loads((out / 'compose-report.json').read_text())
        E = els(svg)
        line = sorted([(float(a['x']), t, a['font-size'], a['y']) for t, a in E if ('3' in t or '4' in t or 'Na' in t or 'PO' in t)], key=lambda z: z[0])
        three = [x for x in line if x[1] == '3']
        base_y = [x for x in line if x[2] == '12.000']
        res[(variant, trname)] = dict(pre=pre, exit=c.returncode, line=line,
            red_assert_3_own_text_8pt_3below=bool(three) and three[0][2] == '8.000' and base_y and abs(float(three[0][3]) - float(base_y[0][3]) - 3.0) < 1e-6,
            reconstructs=''.join(x[1] for x in line), unformatted=rep.get('unformatted'),
            plain_population=[t for t, a in E if t in ('Athugun og forvitni', 'Profa tilgatuna', 'Setja fram tilgatu')])
for k, v in res.items(): print(k, json.dumps(v, ensure_ascii=False))
