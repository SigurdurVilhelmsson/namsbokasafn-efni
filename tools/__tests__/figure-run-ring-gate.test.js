/**
 * `applyRingGate` — §C140 ⑩'s soft-mask ring gate, the driver step between prepare and compose
 * ([USER] ruling Q2, 2026-09-15).
 *
 * 🔴 WHAT THIS FILE IS REALLY GUARDING IS A REFUSAL, NOT A FIX. The byte signature this step
 * starts from fires on 9 masks in this corpus and only ONE of them is a visible ring; healing the
 * other 8 destroys picture content. So the assertions that matter are the ones where the step
 * does NOTHING — and each of those is paired with a run through the SAME code path where it DOES
 * heal, because "spawned nothing because it correctly stood down" and "spawned nothing because it
 * is broken" are different facts and only the control separates them.
 *
 * ⚠️ NO BROWSER AND NO PYTHON RUN HERE. Every child goes through the driver's one injectable
 * `spawn`, so the renderer and the census are fakes and the test is about the DECISIONS.
 * `figrings.py`'s own behaviour is tested by `experiments/figure-text-translation/test_figrings.py`
 * against the real committed SVGs; duplicating that here would pin a fake.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { applyRingGate } from '../figure-run.js';

let outDir;
beforeEach(() => {
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ring-gate-'));
});
afterEach(() => {
  fs.rmSync(outDir, { recursive: true, force: true });
});

const ARTWORK = 'original-artwork-bytes';

/**
 * What each faked child prints when it fails. Distinct per stage, so an assertion that finds one
 * in a warning proves THAT stage's cause was carried — not some other stage's. The heal's is the
 * real one from the 2026-09-15 local-box run, where a `pylibs/` without numpy failed the heal and
 * the warning said only "exit 1".
 */
const STDERR = {
  // The SHAPE of a real uncaught Node error from render-check.mjs with no browser installed:
  // message first, then Playwright's box, the stack frame, a props dump and the version footer.
  render: [
    'node:internal/modules/run_main:123',
    '    triggerUncaughtException(',
    '    ^',
    '',
    "browserType.launch: Executable doesn't exist at /home/u/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell",
    '╔═════════════════════════════════════════════════════════════════════════╗',
    '║ Looks like Playwright Test or Playwright was just installed or updated. ║',
    '║ Please run the following command to download new browsers:              ║',
    '║                                                                         ║',
    '║     npx playwright install                                              ║',
    '║                                                                         ║',
    '║ <3 Playwright Team                                                      ║',
    '╚═════════════════════════════════════════════════════════════════════════╝',
    '    at file:///repo/experiments/figure-text-translation/render-check.mjs:79:28 {',
    '  log: [],',
    "  name: 'Error'",
    '}',
    '',
    'Node.js v22.22.2',
  ].join('\n'),
  renderAfter: 'Error: the counterfactual SVG could not be loaded',
  census: 'Traceback (most recent call last):\n  census exploded',
  gate: 'Traceback (most recent call last):\n  gate exploded',
  // The SHAPE of the real traceback from the 2026-09-15 run: frames first, the exception LAST.
  heal: [
    'Traceback (most recent call last):',
    '  File "/repo/experiments/figure-text-translation/figure-rings.py", line 170, in <module>',
    '    sys.exit(main())',
    '             ~~~~^^',
    '  File "/repo/experiments/figure-text-translation/figure-rings.py", line 163, in main',
    '    return args.fn(args)',
    '           ~~~~~~~^^^^^^',
    '  File "/repo/experiments/figure-text-translation/figure-rings.py", line 129, in cmd_heal',
    '    healed, rep = figrings.heal(text, approved)',
    '                  ~~~~~~~~~~~~~^^^^^^^^^^^^^^^^',
    '  File "/repo/experiments/figure-text-translation/figrings.py", line 433, in heal',
    '    import numpy as np',
    "ModuleNotFoundError: No module named 'numpy'",
  ].join('\n'),
};

function writeArtwork() {
  fs.writeFileSync(path.join(outDir, 'artwork.svg'), ARTWORK);
}
function artworkNow() {
  return fs.readFileSync(path.join(outDir, 'artwork.svg'), 'utf-8');
}

/**
 * A fake `spawn` standing in for the census, the renderer and the heal.
 *
 * @param {object} plan
 * @param {string[]} plan.candidates mask ids the census reports
 * @param {string[]} plan.approved   mask ids the gate approves
 * @param {object}   plan.fail       force a stage to fail: {render, heal, gatedHeal, gate, census}
 *                                   — `heal` fails EVERY heal (so the counterfactual one first);
 *                                   `gatedHeal` fails only the gated heal that follows a verdict
 */
function fakeSpawn(plan = {}) {
  const calls = [];
  const candidates = (plan.candidates || []).map((mask) => ({ mask }));
  const fn = ({ stage, argv }) => {
    calls.push({ stage, argv });
    if (stage === 'ring-render') {
      if (plan.fail && plan.fail.render) return { status: 1, stdout: '', stderr: STDERR.render };
      // argv = [render-check.mjs, src, dst, w, h, dsf]; the counterfactual's src is artwork.ring-all.svg
      if (plan.fail && plan.fail.renderAfter && argv[1].endsWith('ring-all.svg'))
        return { status: 1, stdout: '', stderr: STDERR.renderAfter };
      fs.writeFileSync(argv[argv.length - 4], 'png');
      return { status: 0, stdout: '', stderr: '' };
    }
    const sub = argv[1];
    if (sub === 'census') {
      if (plan.fail && plan.fail.census)
        return { status: 1, stdout: 'not json', stderr: STDERR.census };
      return {
        status: 0,
        stderr: '',
        stdout: JSON.stringify([{ svg: 'a.svg', viewBox: [0, 0, 351, 174], candidates }]),
      };
    }
    if (sub === 'gate') {
      if (plan.fail && plan.fail.gate) return { status: 1, stdout: '', stderr: STDERR.gate };
      fs.writeFileSync(
        argv[argv.indexOf('--report') + 1],
        JSON.stringify({ approved: plan.approved || [] })
      );
      return { status: 0, stdout: '', stderr: '' };
    }
    if (sub === 'heal') {
      const gated = argv.includes('--gate-report');
      // What spawnSync reports for a child the kernel killed: no status, a signal, empty stderr.
      if (plan.fail && plan.fail.healSignal)
        return { status: null, signal: 'SIGKILL', stdout: '', stderr: '' };
      if (plan.fail && (plan.fail.heal || (plan.fail.gatedHeal && gated)))
        return { status: 1, stdout: '', stderr: STDERR.heal };
      const out = argv[argv.indexOf('--out') + 1];
      fs.writeFileSync(out, argv.includes('--approve-all') ? 'all-healed' : 'gated-healed');
      return { status: 0, stdout: '', stderr: '' };
    }
    throw new Error(`fakeSpawn got an unexpected call: ${stage} ${argv.join(' ')}`);
  };
  fn.calls = calls;
  fn.countOf = (stage) => calls.filter((c) => c.stage === stage).length;
  fn.subCountOf = (sub) => calls.filter((c) => c.argv[1] === sub).length;
  return fn;
}

describe('applyRingGate — when it stands down', () => {
  it('does nothing at all when there is no cairo artwork', () => {
    const spawn = fakeSpawn({ candidates: ['mask-2'] });
    const rec = applyRingGate({ basename: 'b' }, outDir, { spawn });
    expect(spawn.calls).toHaveLength(0);
    expect(rec.rings).toBeUndefined();
  });

  it('spawns only the census when the corpus is clean — and never a browser', () => {
    writeArtwork();
    const spawn = fakeSpawn({ candidates: [] });
    const rec = applyRingGate({ basename: 'b' }, outDir, { spawn });
    expect(spawn.subCountOf('census')).toBe(1);
    // THE COST INVARIANT: 689 of 691 figures reach exactly this line.
    expect(spawn.countOf('ring-render')).toBe(0);
    expect(spawn.subCountOf('heal')).toBe(0);
    expect(rec.rings).toEqual({ candidates: 0, approved: [], refused: [] });
    expect(artworkNow()).toBe(ARTWORK);
  });

  it('reports candidates but does not render or heal in a dry run', () => {
    writeArtwork();
    const spawn = fakeSpawn({ candidates: ['mask-2'], approved: ['mask-2'] });
    const rec = applyRingGate({ basename: 'b' }, outDir, { spawn, dryRun: true });
    expect(spawn.countOf('ring-render')).toBe(0);
    expect(spawn.subCountOf('heal')).toBe(0);
    expect(rec.ringWarnings.join(' ')).toContain('mask-2');
    expect(rec.ringWarnings.join(' ')).toContain('not gated in a dry run');
    expect(artworkNow()).toBe(ARTWORK);
  });
});

describe('applyRingGate — the decision', () => {
  it('heals an approved mask and replaces the artwork in place', () => {
    writeArtwork();
    const spawn = fakeSpawn({ candidates: ['mask-2'], approved: ['mask-2'] });
    const rec = applyRingGate({ basename: 'brain' }, outDir, { spawn });
    expect(rec.rings.approved).toEqual(['mask-2']);
    expect(rec.rings.refused).toEqual([]);
    expect(artworkNow()).toBe('gated-healed');
    // Two renders: the file as it is, and the counterfactual with everything healed.
    expect(spawn.countOf('ring-render')).toBe(2);
  });

  it('REFUSES a candidate the gate does not approve, names it, and leaves the bytes alone', () => {
    writeArtwork();
    const spawn = fakeSpawn({
      candidates: ['mask-8', 'mask-491'],
      approved: [],
    });
    const rec = applyRingGate({ basename: 'exocytosis' }, outDir, { spawn });
    expect(rec.rings.approved).toEqual([]);
    expect(rec.rings.refused).toEqual(['mask-8', 'mask-491']);
    // Q4: named, never silent.
    expect(rec.ringWarnings.join(' ')).toContain('mask-491');
    expect(rec.ringWarnings.join(' ')).toContain('NOT healed');
    // 🔴 THE ONE THAT MATTERS: no gated heal was even attempted.
    expect(spawn.calls.filter((c) => c.argv.includes('--gate-report'))).toHaveLength(0);
    expect(artworkNow()).toBe(ARTWORK);
  });

  it('heals only the approved subset when a figure carries both', () => {
    writeArtwork();
    const spawn = fakeSpawn({
      candidates: ['mask-2', 'mask-491'],
      approved: ['mask-2'],
    });
    const rec = applyRingGate({ basename: 'mixed' }, outDir, { spawn });
    expect(rec.rings.approved).toEqual(['mask-2']);
    expect(rec.rings.refused).toEqual(['mask-491']);
    expect(rec.ringWarnings.join(' ')).toContain('mask-491');
    expect(artworkNow()).toBe('gated-healed');
  });
});

describe('applyRingGate — fail-closed', () => {
  // Each of these is the same corpus as the healing case above; only the failure differs. So a
  // green result here is "it stood down because it could not judge", not "there was nothing to do".
  const cases = [
    ['the renderer is unavailable', { render: true }, 'could not render'],
    ['the census returns nothing parseable', { census: true }, 'did not return JSON'],
    ['the gate produces no verdict', { gate: true }, 'no verdict'],
    ['the heal itself fails', { heal: true }, 'counterfactual'],
  ];
  for (const [name, fail, expected] of cases) {
    it(`leaves the artwork untouched when ${name}`, () => {
      writeArtwork();
      const spawn = fakeSpawn({ candidates: ['mask-2'], approved: ['mask-2'], fail });
      const rec = applyRingGate({ basename: 'b' }, outDir, { spawn });
      expect(artworkNow()).toBe(ARTWORK);
      expect((rec.ringWarnings || []).join(' ')).toContain(expected);
      expect(rec.rings ? rec.rings.approved : []).toEqual([]);
    });
  }

  // 🔴 A FAIL-CLOSED WARNING THAT DROPS THE CHILD'S STDERR HIDES THE CAUSE. On 2026-09-15 a box
  // whose `pylibs/` lacked numpy printed "could not build the counterfactual heal (exit 1)" and
  // shipped brain unhealed with VERDICT ok; the ModuleNotFoundError was one stderr read away.
  const causes = [
    ['the renderer', { render: true }, "browserType.launch: Executable doesn't exist"],
    ['the census', { census: true }, 'census exploded'],
    ['the gate', { gate: true }, 'gate exploded'],
    ['the counterfactual heal', { heal: true }, "No module named 'numpy'"],
    ['the gated heal', { gatedHeal: true }, "No module named 'numpy'"],
  ];
  for (const [name, fail, cause] of causes) {
    it(`names the child's own error when ${name} fails`, () => {
      writeArtwork();
      const spawn = fakeSpawn({ candidates: ['mask-2'], approved: ['mask-2'], fail });
      const rec = applyRingGate({ basename: 'b' }, outDir, { spawn });
      expect((rec.ringWarnings || []).join('\n')).toContain(cause);
      expect(artworkNow()).toBe(ARTWORK);
    });
  }

  // 🔴 THE CAUSE MUST SURVIVE THE CHILD'S OWN SHAPE (whole-branch review, 2026-09-15). Python
  // prints its exception LAST; Node prints an uncaught error's message FIRST, then a stack, a props
  // dump and a `Node.js vNN` footer — so a bare tail keeps the Python message and throws the Node
  // one away. And the summary prints one line per warning, so a raw multi-line stderr breaks it.
  it("keeps a NODE child's message, which comes first, not just its stack and footer", () => {
    writeArtwork();
    const spawn = fakeSpawn({
      candidates: ['mask-2'],
      approved: ['mask-2'],
      fail: { render: true },
    });
    const rec = applyRingGate({ basename: 'b' }, outDir, { spawn });
    const text = (rec.ringWarnings || []).join('\n');
    expect(STDERR.render.length).toBeGreaterThan(400); // the fixture is long enough to truncate
    expect(text).toContain("Executable doesn't exist");
  });

  it("keeps a PYTHON child's exception, which comes last, from a traceback longer than the cap", () => {
    writeArtwork();
    const spawn = fakeSpawn({ candidates: ['mask-2'], approved: ['mask-2'], fail: { heal: true } });
    const rec = applyRingGate({ basename: 'b' }, outDir, { spawn });
    expect(STDERR.heal.length).toBeGreaterThan(400);
    expect((rec.ringWarnings || []).join('\n')).toContain(
      "ModuleNotFoundError: No module named 'numpy'"
    );
  });

  for (const [name, fail] of [
    ['render', { render: true }],
    ['census', { census: true }],
    ['gate', { gate: true }],
    ['heal', { heal: true }],
    ['gatedHeal', { gatedHeal: true }],
  ]) {
    it(`prints every ${name} failure warning as ONE line, so the summary's layout holds`, () => {
      writeArtwork();
      const spawn = fakeSpawn({ candidates: ['mask-2'], approved: ['mask-2'], fail });
      const rec = applyRingGate({ basename: 'b' }, outDir, { spawn });
      expect(rec.ringWarnings.length).toBeGreaterThan(0);
      for (const w of rec.ringWarnings) expect(w).not.toMatch(/[\r\n]/);
    });
  }

  it('prints a cause shared by both renders ONCE', () => {
    writeArtwork();
    const spawn = fakeSpawn({
      candidates: ['mask-2'],
      approved: ['mask-2'],
      fail: { render: true },
    });
    const rec = applyRingGate({ basename: 'b' }, outDir, { spawn });
    const text = (rec.ringWarnings || []).join('\n');
    expect(spawn.countOf('ring-render')).toBe(2); // both renders really did fail
    expect(text.split("Executable doesn't exist").length - 1).toBe(1);
  });

  it("names the AFTER render's own error when only the counterfactual render fails", () => {
    writeArtwork();
    const spawn = fakeSpawn({
      candidates: ['mask-2'],
      approved: ['mask-2'],
      fail: { renderAfter: true },
    });
    const rec = applyRingGate({ basename: 'b' }, outDir, { spawn });
    const text = (rec.ringWarnings || []).join('\n');
    expect(text).toContain('could not render');
    expect(text).toContain(STDERR.renderAfter);
  });

  it('names the SIGNAL when a child is killed with no stderr (an OOM kill)', () => {
    writeArtwork();
    const spawn = fakeSpawn({
      candidates: ['mask-2'],
      approved: ['mask-2'],
      fail: { healSignal: true },
    });
    const rec = applyRingGate({ basename: 'b' }, outDir, { spawn });
    expect((rec.ringWarnings || []).join('\n')).toContain('SIGKILL');
    expect(artworkNow()).toBe(ARTWORK);
  });

  it('leaves the artwork untouched and un-approves when only the gated heal fails', () => {
    writeArtwork();
    const spawn = fakeSpawn({
      candidates: ['mask-2'],
      approved: ['mask-2'],
      fail: { gatedHeal: true },
    });
    const rec = applyRingGate({ basename: 'b' }, outDir, { spawn });
    // It got as far as a verdict — the counterfactual heal and both renders succeeded …
    expect(spawn.countOf('ring-render')).toBe(2);
    expect(spawn.calls.filter((c) => c.argv.includes('--gate-report'))).toHaveLength(1);
    // … and the failure after it still stands down.
    expect((rec.ringWarnings || []).join(' ')).toContain('the gated heal failed');
    expect(rec.rings.approved).toEqual([]);
    expect(artworkNow()).toBe(ARTWORK);
  });

  it('CONTROL: the same corpus with nothing forced to fail does heal', () => {
    writeArtwork();
    const spawn = fakeSpawn({ candidates: ['mask-2'], approved: ['mask-2'] });
    applyRingGate({ basename: 'b' }, outDir, { spawn });
    expect(artworkNow()).toBe('gated-healed');
  });
});
