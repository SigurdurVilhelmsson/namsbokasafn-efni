#!/usr/bin/env python3
"""§C140 ⑥b — mutants of svgout.write_svg's font-kerning branch against test_svgout.py, with the golden-copy discipline
CLAUDE.md requires (never `git checkout --` a mutated file). 0 ISK.

    cd experiments/figure-text-translation
    FIGTEXT_PYLIBS=./pylibs python3 -u evidence/2026-09-17-c6b-build/instruments/mutate_writer.py <scratch-dir> <report.txt>

Refuses unless svgout.py equals HEAD (`git diff --quiet`). Copies svgout.py to <scratch-dir>/svgout.golden.py, then for
each round: write the mutant (its anchor must occur exactly once), run test_svgout.py, record the exit code and every
FAIL line, restore from the golden copy, and `cmp` the restored file against the golden. Round 0 is the unmutated
control (must print ALL PASS). After the last round: `cmp` again and `git diff --quiet -- svgout.py`.
Terminal marker: the report's and stdout's last line `MUTANTS-DONE ok=<bool>` (ok = control passed, every mutant failed,
every restore byte-identical, tree clean).
"""
import filecmp, shutil, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[3]
TARGET = HERE / 'svgout.py'
ANCHOR_ATTR = "attrs.append('style=\"font-kerning:none\"')"
ANCHOR_IF = "if it.get('path') == 'layout':"
ROUNDS = [
    ('control (no mutation)', None, None),
    ('attribute form: font-kerning="none" instead of an inline style', ANCHOR_ATTR, "attrs.append('font-kerning=\"none\"')"),
    ('every path: the property on run-exact, arc and path-less items too', ANCHOR_IF, 'if True:'),
    ('no property at all (the pre-⑥b writer)', ANCHOR_IF, 'if False:'),
    ('arc items too', ANCHOR_IF, "if it.get('path') in ('layout', 'arc'):"),
]


def run_test():
    r = subprocess.run([sys.executable, '-u', 'test_svgout.py'], capture_output=True, text=True, cwd=str(HERE),
                       timeout=600)
    # The verdict is test_svgout.py's last STDOUT line; fontTools writes warnings to stderr, which must not be
    # read as the verdict (the first run of this instrument did, and reported a passing control as failed).
    fails = [l.strip() for l in r.stdout.splitlines() if l.strip().startswith('FAIL')]
    last = r.stdout.strip().splitlines()[-1] if r.stdout.strip() else ''
    return r.returncode, fails, last


def main():
    scratch, report = Path(sys.argv[1]), Path(sys.argv[2])
    scratch.mkdir(parents=True, exist_ok=True)
    clean = subprocess.run(['git', 'diff', '--quiet', '--', str(TARGET)], cwd=str(HERE)).returncode == 0
    assert clean, 'svgout.py differs from HEAD - refusing to mutate uncommitted work'
    golden = scratch / 'svgout.golden.py'
    shutil.copyfile(TARGET, golden)
    lines, ok = [f'# mutants of svgout.write_svg vs test_svgout.py; golden copy {golden}'], True
    try:
        for name, anchor, repl in ROUNDS:
            if anchor is not None:
                src = golden.read_text()
                assert src.count(anchor) == 1, f'anchor not unique: {anchor}'
                TARGET.write_text(src.replace(anchor, repl))
            rc, fails, last = run_test()
            shutil.copyfile(golden, TARGET)
            restored = filecmp.cmp(TARGET, golden, shallow=False)
            expect_fail = anchor is not None
            round_ok = bool(restored and ((rc != 0 and len(fails) > 0) if expect_fail else (rc == 0 and last == 'ALL PASS')))
            ok = ok and round_ok
            lines.append(f'\n## {name}\n  exit={rc} last={last!r} restored_byte_identical={restored} round_ok={round_ok}')
            lines += [f'  {f[:160]}' for f in fails]
    finally:
        shutil.copyfile(golden, TARGET)
    final_cmp = filecmp.cmp(TARGET, golden, shallow=False)
    tree_clean = subprocess.run(['git', 'diff', '--quiet', '--', str(TARGET)], cwd=str(HERE)).returncode == 0
    ok = ok and final_cmp and tree_clean
    lines.append(f'\nfinal cmp against golden: {final_cmp}; git diff --quiet svgout.py: {tree_clean}')
    lines.append(f'MUTANTS-DONE ok={ok}')
    report.write_text('\n'.join(lines) + '\n')
    print('\n'.join(lines))


if __name__ == '__main__':
    main()
