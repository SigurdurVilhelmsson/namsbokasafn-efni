#!/usr/bin/env python3
"""Install rehearsal: apply reference/ to a fresh git-archive copy of HEAD in task order, and record
exactly what a plan executor sees after every action.

    python3 -u rehearse.py <install-dir> <report.md>

<install-dir> must not exist. The script makes it: `git archive HEAD experiments/figure-text-translation
tools/lib` from the repository, plus sources.local.json and out/ copied and a pylibs symlink, then
`git init && git add -A && git commit` INSIDE the copy (so `git apply` works and HEAD's files stay
readable by `git show`). Nothing in the repository is written.

Order (T-W, T-S, T-C, T-L), each with a RED-first step and a named mutation: golden `cp` first, mutate
through a count==1 anchor, run, restore from the golden, `cmp`. After T-L: every test_*.py by name, then
`cmp` of every touched file against /home/siggi/dev/scratch-c140/fix2/final/tree.

Recorded per test run: the command, rc, the output's last non-empty line, and every line whose stripped
text starts with "FAIL" when that last line is not ALL PASS. The report ends with a terminal marker line
`REHEARSAL-COMPLETE`.
"""
import filecmp, os, shutil, subprocess, sys
from pathlib import Path

REPO = Path('/home/siggi/dev/repos/namsbokasafn-efni')
EXPR = REPO / 'experiments/figure-text-translation'
REF = EXPR / 'evidence/2026-09-15-t23-review-fixes/reference'
FINAL_TREE = Path('/home/siggi/dev/scratch-c140/fix2/final/tree')
PATCH = {p.name[:2]: p.name for p in REF.glob('*.patch')}
TOUCHED = ['strip-text.py', 'svgfix.py', 'figure-prepare.py', 'test_figure_prepare.py', 'figcolour.py',
           'compose.py', 'readlayer.py', 'test_figcolour.py', 'test_readlayer.py', 'test_compose_runexact.py',
           'test_compose_t23.py', 'svgout.py', 'test_svgout.py', 'figlayout.py', 'test_figlayout.py',
           'figscripts.py']

INST = Path(sys.argv[1]).resolve()
REPORT = Path(sys.argv[2])
EXP = INST / 'experiments/figure-text-translation'
TMP = INST.parent / 'install-tmp'
GOLD = INST.parent / 'install-golden'
OUT = []


def emit(s=''):
    OUT.append(s)
    print(s, flush=True)
    REPORT.write_text('\n'.join(OUT) + '\n')


def sh(cmd, cwd, check=True):
    p = subprocess.run(cmd, cwd=str(cwd), shell=True, capture_output=True, text=True, executable='/bin/bash')
    if check and p.returncode != 0:
        emit('```')
        emit(f'$ {cmd}\n{p.stdout}{p.stderr}rc={p.returncode}')
        emit('```')
        emit('REHEARSAL-ABORTED')
        sys.exit(1)
    return p


def block(lines):
    emit('```')
    for l in lines:
        emit(l)
    emit('```')


def apply(*keys):
    names = [PATCH[k] for k in keys]
    cmd = 'git apply ' + ' '.join(f'"$REF/{n}"' for n in names)
    p = sh(cmd.replace('$REF', str(REF)), INST)
    block([f'$ cd $INSTALL && {cmd}', (p.stdout + p.stderr).rstrip() or '(no output)', f'rc={p.returncode}'])


def test(*files):
    lines = []
    names = {}
    for t in files:
        cmd = f'FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u {t}'
        env = dict(os.environ, FIGTEXT_PYLIBS='./pylibs', PYTHONDONTWRITEBYTECODE='1', TMPDIR=str(TMP))
        p = subprocess.run([sys.executable, '-u', t], cwd=str(EXP), env=env, capture_output=True, text=True,
                           timeout=1800)
        nonempty = [l for l in p.stdout.splitlines() if l.strip()]
        last = nonempty[-1] if nonempty else '(no stdout)'
        lines.append(f'$ {cmd}')
        lines.append(f'rc={p.returncode}  last line: {last}')
        if last.strip() != 'ALL PASS':
            fails = [l for l in p.stdout.splitlines() if l.strip().startswith('FAIL')]
            names[t] = sorted(l.strip()[4:].strip().split(': ')[0] for l in fails)
            lines += fails or ['(no FAIL lines)']
            if p.returncode != 0 and not fails:
                lines += ['--- stderr tail ---'] + p.stderr.strip().splitlines()[-8:]
    block(lines)
    return names


def same_set(a, b, what):
    emit(f'FAIL-name set of this run == FAIL-name set of {what}: **{a == b}**')
    emit()


def mutate(fname, old, new, label):
    src = EXP / fname
    GOLD.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, GOLD / fname)
    s = src.read_text()
    n = s.count(old)
    emit(f'**Mutation — {label}.** Golden copy: `cp {fname} $GOLDEN/{fname}`. Anchor in `{fname}` '
         f'(count == {n}):')
    block([f'- {old}', f'+ {new}'])
    assert n == 1, f'anchor count {n}'
    src.write_text(s.replace(old, new))


def restore(fname):
    shutil.copy2(GOLD / fname, EXP / fname)
    ok = filecmp.cmp(GOLD / fname, EXP / fname, shallow=False)
    block([f'$ cp $GOLDEN/{fname} {fname} && cmp {fname} $GOLDEN/{fname} && echo restored',
           'restored' if ok else 'CMP FAILED'])
    assert ok


def main():
    assert not INST.exists(), f'{INST} exists'
    INST.mkdir(parents=True)
    TMP.mkdir(parents=True, exist_ok=True)
    shutil.rmtree(GOLD, ignore_errors=True)
    head = sh('git rev-parse HEAD', REPO).stdout.strip()
    sh(f'git -C {REPO} archive HEAD experiments/figure-text-translation tools/lib | tar -x -C {INST}', INST)
    shutil.copy2(EXPR / 'sources.local.json', EXP / 'sources.local.json')
    shutil.copytree(EXPR / 'out', EXP / 'out', symlinks=True)
    (EXP / 'pylibs').symlink_to(EXPR / 'pylibs')
    sh('git init -q && git add -A && git -c core.hooksPath=/dev/null commit -q -m "HEAD archive" && git rev-parse HEAD',
       INST)
    init_sha = sh('git rev-parse HEAD', INST).stdout.strip()

    emit('# Install rehearsal — the 16 reference patches, in task order, on a fresh copy of HEAD')
    emit()
    emit(f'Repository HEAD `{head}`. Copy: `$INSTALL` = `{INST}` (`git archive HEAD '
         'experiments/figure-text-translation tools/lib`, plus `sources.local.json`, `out/` and a `pylibs` '
         f'symlink, then `git init && git add -A && git commit` inside it → `{init_sha}`). Tests run in '
         f'`$INSTALL/experiments/figure-text-translation`; `$REF` = `{REF}`; `$TMP` = `{TMP}`; `$GOLDEN` = '
         f'`{GOLD}`. Produced by `instruments/rehearse.py`; every block below is its verbatim output.')
    emit()

    emit('## T-W — artwork shift (R15)')
    emit('Apply the test first; it is RED on HEAD code.')
    apply('04'); test('test_figure_prepare.py')
    emit('Apply the implementation.')
    apply('01', '02', '03'); test('test_figure_prepare.py')
    mutate('figure-prepare.py', "    refusal = artwork_transform_refusal(out_dir / 'artwork.pdf')",
           '    refusal = None', "prepare() no longer calls the guard")
    test('test_figure_prepare.py'); restore('figure-prepare.py')

    emit('## T-S — geometricPrecision on the text group (R12)')
    apply('13'); test('test_svgout.py')
    apply('12', '16'); test('test_svgout.py', 'test_compose_runexact.py', 'test_compose_t23.py')
    mutate('svgout.py', """'<g text-rendering="geometricPrecision">'""", "'<g>'",
           "the group opener loses the attribute")
    test('test_svgout.py'); restore('svgout.py')

    emit('## T-C — poppler DeviceCMYK text colour (R14)')
    emit('Module and tests first; the composer and readlayer are not yet wired.')
    apply('05', '08', '09', '10', '11')
    unwired = test('test_figcolour.py', 'test_readlayer.py', 'test_compose_runexact.py', 'test_compose_t23.py')
    mutate('figcolour.py', '        return poppler_cmyk_rgb(c, m, y, k)',
           '        return ((1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k))',
           "fill_rgb's cmyk branch becomes the naive inverse")
    m = test('test_figcolour.py'); restore('figcolour.py')
    same_set(m.get('test_figcolour.py'), unwired.get('test_figcolour.py'),
             'the UNMUTATED run just above (composer not yet wired)')
    emit('Wire the composer and readlayer.')
    apply('06', '07')
    test('test_figcolour.py', 'test_readlayer.py', 'test_compose_runexact.py', 'test_compose_t23.py')
    GOLD.mkdir(parents=True, exist_ok=True)
    shutil.copy2(EXP / 'readlayer.py', GOLD / 'readlayer.py')
    cmd = f'git show {init_sha}:experiments/figure-text-translation/readlayer.py'
    p = sh(cmd, INST)
    (EXP / 'readlayer.py').write_text(p.stdout)
    emit('**Trap mutation — HEAD\'s readlayer.py (folds RGB/Gray into CMYK) under the wired composer.** '
         'Golden copy: `cp readlayer.py $GOLDEN/readlayer.py`.')
    block([f'$ cd $INSTALL && {cmd} > experiments/figure-text-translation/readlayer.py'])
    test('test_figcolour.py'); restore('readlayer.py')
    emit('**Added control (not in the task order) — the same naive `fill_rgb` mutation, now that the composer is '
         'wired.** Before 06/07 the composer does not call `figcolour`, so the mutation above cannot be told '
         'apart from the unwired RED state; this run is the one that shows the pure module\'s mutation is killed.')
    mutate('figcolour.py', '        return poppler_cmyk_rgb(c, m, y, k)',
           '        return ((1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k))',
           "fill_rgb's cmyk branch becomes the naive inverse (composer wired)")
    test('test_figcolour.py', 'test_compose_runexact.py', 'test_compose_t23.py'); restore('figcolour.py')

    emit('## T-L — box/cell label rules A and E (R13)')
    apply('15'); redL = test('test_figlayout.py')
    apply('14'); test('test_figlayout.py')
    mutate('figlayout.py', '_height=True, _ae=True):', '_height=True, _ae=False):',
           "decide()'s `_ae` default switched off (rules A and E off)")
    mL = test('test_figlayout.py'); restore('figlayout.py')
    same_set(mL.get('test_figlayout.py'), redL.get('test_figlayout.py'), 'the RED run (HEAD figlayout.py, new test)')

    emit('## After T-L — every test file by name')
    tests = sorted(p.name for p in EXP.glob('test_*.py'))
    test(*tests)
    emit('## After T-L — touched files against the verified scratch tree')
    lines = []
    for f in TOUCHED:
        same = filecmp.cmp(EXP / f, FINAL_TREE / f, shallow=False)
        lines.append(f'cmp {f} fix2/final/tree/{f}: {"identical" if same else "DIFFERENT"}')
    allpy = sorted(p.name for p in EXP.glob('*.py'))
    differ = [f for f in allpy if not (FINAL_TREE / f).is_file()
              or not filecmp.cmp(EXP / f, FINAL_TREE / f, shallow=False)]
    lines.append(f'touched identical: {sum("identical" in l for l in lines)}/{len(TOUCHED)}')
    lines.append(f'all *.py in the copy: {len(allpy)}; differing from fix2/final/tree or missing there: {differ}')
    block(lines)
    st = sh('git status --porcelain', INST)
    block(['$ cd $INSTALL && git status --porcelain'] + st.stdout.rstrip().splitlines())
    emit('REHEARSAL-COMPLETE')


if __name__ == '__main__':
    main()
