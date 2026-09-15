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
 * @param {object}   plan.fail       force a stage to fail: {render, heal, gate, census}
 */
function fakeSpawn(plan = {}) {
  const calls = [];
  const candidates = (plan.candidates || []).map((mask) => ({ mask }));
  const fn = ({ stage, argv }) => {
    calls.push({ stage, argv });
    if (stage === 'ring-render') {
      if (plan.fail && plan.fail.render) return { status: 1, stdout: '', stderr: 'no browser' };
      fs.writeFileSync(argv[argv.length - 4], 'png');
      return { status: 0, stdout: '', stderr: '' };
    }
    const sub = argv[1];
    if (sub === 'census') {
      if (plan.fail && plan.fail.census) return { status: 1, stdout: 'not json', stderr: '' };
      return {
        status: 0,
        stderr: '',
        stdout: JSON.stringify([{ svg: 'a.svg', viewBox: [0, 0, 351, 174], candidates }]),
      };
    }
    if (sub === 'gate') {
      if (plan.fail && plan.fail.gate) return { status: 1, stdout: '', stderr: 'boom' };
      fs.writeFileSync(
        argv[argv.indexOf('--report') + 1],
        JSON.stringify({ approved: plan.approved || [] })
      );
      return { status: 0, stdout: '', stderr: '' };
    }
    if (sub === 'heal') {
      if (plan.fail && plan.fail.heal) return { status: 1, stdout: '', stderr: 'boom' };
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

  it('CONTROL: the same corpus with nothing forced to fail does heal', () => {
    writeArtwork();
    const spawn = fakeSpawn({ candidates: ['mask-2'], approved: ['mask-2'] });
    applyRingGate({ basename: 'b' }, outDir, { spawn });
    expect(artworkNow()).toBe('gated-healed');
  });
});
