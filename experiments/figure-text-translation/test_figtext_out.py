#!/usr/bin/env python3
"""`FIGTEXT_OUT` gives one figure its own output directory, and the shared `out/` stays
untouched while it does.

    FIGTEXT_PYLIBS=./pylibs python3 test_figtext_out.py

Plain asserts, like test_sources.py - no pytest in this tree.

WHY THIS EXISTS. `_deps.OUT` was a hard-coded `HERE / 'out'`, so every consumer of the
chain wrote into ONE directory. A driver that walks a chapter's figures therefore had each
figure overwrite the previous figure's `runs.json` / `meta.json` / `blocks.json`, and two
figures processed concurrently would interleave silently - no error, no missing file, just
a `blocks.json` describing a different picture from the `artwork.png` beside it.

🔴 THIS SUITE IS NOT ALL REFUSALS. Case 3 runs a REAL production consumer end to end
(`emit-blocks.py`, which itself spawns `extract.py`) against the committed fixture and
asserts the artefacts appear in the private directory with the right CONTENT - it fails
if `FIGTEXT_OUT` is merely accepted and ignored. Case 4 is its paired control: the same
inventory comparator is shown to FIRE, so "the shared out/ did not change" is a
measurement rather than a blind instrument's silence.

⚠️ This file writes ONLY into temporary directories. It deliberately does not touch the
shared `out/`, because `test_blockkey_consumers.py` requires `out/artwork.png` to be
CNX_Chem_01_01_SciMethod's.
"""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import _deps  # noqa: F401  - puts this directory and FIGTEXT_PYLIBS on sys.path

HERE = Path(__file__).resolve().parent
FIXTURE = HERE / 'fixtures' / 'fixture_figure.pdf'
SHARED_OUT = HERE / 'out'

# The modules that bind `OUT` from `_deps`. Recorded rather than counted, because the
# consequence of the env var differs per importer and a new one is a decision, not a
# detail. See the commit that introduced FIGTEXT_OUT.
OUT_IMPORTERS = {
    # production
    'extract.py', 'emit-blocks.py', 'check.py', 'compose.py', 'strip-text.py',
    # tests - a FIGTEXT_OUT set in the environment changes where THESE look too
    'test_blockkey_consumers.py', 'test_sendable.py',
}

fails = []


def check(label, ok, detail=''):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}" + (f": {detail}" if detail else ''),
          flush=True)
    if not ok:
        fails.append(label)


def child_out(env_value, cwd=None):
    """-> what a freshly imported `_deps` reports as OUT, in a child process.

    A child, not an import: `from _deps import OUT` binds BY VALUE at import time, so
    setting the variable in this process after `_deps` is imported proves nothing about
    what a spawned tool would see."""
    env = dict(os.environ)
    env.pop('FIGTEXT_OUT', None)
    if env_value is not None:
        env['FIGTEXT_OUT'] = env_value
    r = subprocess.run([sys.executable, '-c',
                        'import sys; sys.path.insert(0, %r); import _deps; '
                        'print(_deps.OUT)' % str(HERE)],
                       capture_output=True, text=True, env=env,
                       cwd=str(cwd) if cwd else None)
    if r.returncode != 0:
        return f'CHILD FAILED: {r.stderr.strip()[-300:]}'
    return r.stdout.strip()


def snapshot(directory):
    """{relative path: (size, mtime_ns)} for every file under `directory`."""
    directory = Path(directory)
    if not directory.exists():
        return {}
    return {str(p.relative_to(directory)): (p.stat().st_size, p.stat().st_mtime_ns)
            for p in sorted(directory.rglob('*')) if p.is_file()}


# ── 1. the default is preserved ──────────────────────────────────────────────────────
# A control, not a feature: it passes before the change too. If it ever fails, every tool
# and both existing test files that bind OUT have silently moved.
check('1 CONTROL with FIGTEXT_OUT unset, OUT is still HERE/out',
      child_out(None) == str(SHARED_OUT), child_out(None))

# ── 2. the variable is honoured, and absolutised the way FIGTEXT_PYLIBS is ────────────
with tempfile.TemporaryDirectory() as td:
    td = Path(td).resolve()
    check('2 an absolute FIGTEXT_OUT becomes OUT', child_out(str(td)) == str(td),
          child_out(str(td)))
    # A relative value must be resolved against the SETTING process's cwd, once, at
    # import - not left relative for each consumer to resolve against its own cwd. The
    # driver passes cwd=HERE to some children and not others, so a relative OUT would
    # mean two different directories in one run.
    check('2b a relative FIGTEXT_OUT is resolved against the child cwd, not left relative',
          child_out('relout', cwd=td) == str(td / 'relout'),
          child_out('relout', cwd=td))
    check('2c a ~ path is expanded, as FIGTEXT_PYLIBS already does',
          child_out('~/figtext-out-probe')
          == str(Path('~/figtext-out-probe').expanduser().resolve()),
          child_out('~/figtext-out-probe'))

# ── 3. THE POSITIVE CONTROL — a real consumer writes THERE, with the right content ────
# emit-blocks.py spawns extract.py by a RELATIVE path with no cwd=, so it can only be run
# with cwd=HERE. Both processes must land in the private directory.
check('3 PRECONDITION the committed fixture is present', FIXTURE.exists(), str(FIXTURE))

with tempfile.TemporaryDirectory() as td:
    private = Path(td) / 'fig-private'
    private.mkdir()
    before_shared = snapshot(SHARED_OUT)
    env = dict(os.environ)
    env['FIGTEXT_OUT'] = str(private)
    env.setdefault('FIGTEXT_PYLIBS', str(HERE / 'pylibs'))
    r = subprocess.run([sys.executable, 'emit-blocks.py', str(FIXTURE)],
                       capture_output=True, text=True, env=env, cwd=str(HERE))
    after_shared = snapshot(SHARED_OUT)

    check('3a emit-blocks.py exits 0 under FIGTEXT_OUT', r.returncode == 0,
          f'exit {r.returncode}: {r.stderr.strip()[-400:]}')
    landed = sorted(p.name for p in private.iterdir())
    check('3b runs.json, meta.json and blocks.json landed in the PRIVATE directory',
          landed == ['blocks.json', 'meta.json', 'runs.json'], f'{landed!r}')

    if (private / 'blocks.json').exists():
        blocks = json.loads((private / 'blocks.json').read_text())
        sendable = [b['english'] for b in blocks if b['send']]
        # The same numbers test_make_fixture.py derives IN-PROCESS. Two independent
        # routes to one answer: if the CLI chain and the library disagree, one of them is
        # reading a different file from the one it reports.
        check('3c the private blocks.json carries the fixture, not a leftover figure',
              [b['english'] for b in blocks]
              == ['Observation and curiosity', 'Form a hypothesis',
                  'Test the hypothesis', 'H2O (g)'],
              f"{[b['english'] for b in blocks]!r}")
        check('3d 3 of the 4 blocks are sendable, as measured in-process',
              len(blocks) == 4 and len(sendable) == 3, f'{len(blocks)}/{len(sendable)}')
        fonts = json.loads((private / 'meta.json').read_text())['fonts']
        check('3e the private meta.json describes the fixture font',
              sorted(fonts) == ['PAGE/F1'], f'{sorted(fonts)!r}')

    check('3f THE SHARED out/ IS UNTOUCHED — same files, same sizes, same mtimes',
          after_shared == before_shared,
          f'{len(before_shared)} files before, {len(after_shared)} after; '
          f'changed: {sorted(set(before_shared.items()) ^ set(after_shared.items()))[:4]}')

# ── 4. CONTROL — the comparator in 3f can actually see a change ───────────────────────
# "nothing changed" and "my instrument is blind" look identical. This runs the SAME
# comparator over a directory that IS written to, and requires it to fire. It uses a
# throwaway directory rather than the shared out/, so proving the detector works does not
# cost the fixtures test_blockkey_consumers.py depends on.
with tempfile.TemporaryDirectory() as td:
    probe = Path(td) / 'probe'
    probe.mkdir()
    empty = snapshot(probe)
    env = dict(os.environ)
    env['FIGTEXT_OUT'] = str(probe)
    env.setdefault('FIGTEXT_PYLIBS', str(HERE / 'pylibs'))
    r2 = subprocess.run([sys.executable, 'extract.py', str(FIXTURE)],
                        capture_output=True, text=True, env=env, cwd=str(HERE))
    written = snapshot(probe)
    check('4 CONTROL the same comparator FIRES on a directory that was written to',
          r2.returncode == 0 and written != empty and len(written) > 0,
          f'exit {r2.returncode}, {len(empty)} files -> {len(written)}: '
          f'{sorted(written)!r}')

# ── 5. the recorded list of OUT importers is not stale ───────────────────────────────
# Read as BYTES and matched here rather than shelling out to grep: committed files in this
# repo carry raw NUL bytes, and grep reports nothing for strings such a file demonstrably
# contains unless -a is passed.
found = set()
for path in sorted(HERE.glob('*.py')):
    text = path.read_bytes().decode('utf-8', 'replace')
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith('from _deps import') and 'OUT' in stripped:
            found.add(path.name)
check('5 NON-VACUITY the scan found importers at all', len(found) >= 5, f'{sorted(found)!r}')
check('5b the recorded set of OUT importers matches the tree',
      found == OUT_IMPORTERS,
      f'added={sorted(found - OUT_IMPORTERS)!r} gone={sorted(OUT_IMPORTERS - found)!r} '
      f'— a new importer of OUT is a decision about isolation, not a detail: work out '
      f'what FIGTEXT_OUT means for it and update OUT_IMPORTERS')

print(f"\n{'ALL PASS' if not fails else str(len(fails)) + ' FAILED: ' + ', '.join(fails)}")
sys.exit(1 if fails else 0)
