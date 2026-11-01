/**
 * The 2026-11-01 ruling set: [USER]'s correction of polyatomic ion to the two-word fjölatóma jón
 * (docs/decisions/2026-11-01-polyatomic-ion-two-words.md), carried out by a third, dated amendments
 * file on top of 2026-10-29 and 2026-10-30.
 *
 * No format change: a plain retarget. So this file pins only the new artifact; the 2026-10-29 and
 * 2026-10-30 artifacts stay byte-pinned by their own tests, which is what proves the older sets
 * are untouched.
 */
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  compileRulingSet,
  readInputs,
  serializeRulingSet,
} from '../ai-review/compile-ruling-set.js';
import { loadRulingSet } from '../ai-review/ruling-set.js';
import { offeredRulings } from '../ai-review/worklist.js';
import { DEFAULT_RULING_SET } from '../ai-review/term-pass.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = 'experiments/terminology-consistency/results';
const BASE_REL = `${DIR}/2026-10-11/ruling-set-after-stage1.json`;
const EXC_REL = `${DIR}/2026-10-29/scope-exceptions-2026-10-29.json`;
const AMD29_REL = `${DIR}/2026-10-29/amendments-2026-10-29.json`;
const AMD30_REL = `${DIR}/2026-10-30/amendments-2026-10-30.json`;
const SET30_REL = `${DIR}/2026-10-30/ruling-set-2026-10-30.json`;
const AMD01_REL = `${DIR}/2026-11-01/amendments-2026-11-01.json`;
const SET01_REL = `${DIR}/2026-11-01/ruling-set-2026-11-01.json`;
const RECORD01 = 'docs/decisions/2026-11-01-polyatomic-ion-two-words.md';
const CLI = path.join(REPO, 'tools', 'ai-review', 'compile-ruling-set.js');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const ruling = (set, enNorm) => set.rulings.find((r) => r.enNorm === enNorm);
const text01 = () => fs.readFileSync(path.join(REPO, SET01_REL), 'utf8');
const set01 = () => JSON.parse(text01());
const set30 = () => JSON.parse(fs.readFileSync(path.join(REPO, SET30_REL), 'utf8'));
const compile01 = () => {
  const { base, exceptions, amendments } = readInputs(BASE_REL, EXC_REL, [
    AMD29_REL,
    AMD30_REL,
    AMD01_REL,
  ]);
  return compileRulingSet(base, exceptions, amendments);
};

describe('the committed 2026-11-01 artifact', () => {
  it('re-compiling the committed inputs reproduces it byte for byte', () => {
    expect(serializeRulingSet(compile01())).toBe(text01());
  });

  it('loads through the loader', () => {
    expect(loadRulingSet(path.join(REPO, SET01_REL)).rulings.length).toBe(set01().rulings.length);
  });

  it('records its inputs by path and sha256, the three amendments files in date order', () => {
    const ref = (rel) => ({ path: rel, sha256: sha256(fs.readFileSync(path.join(REPO, rel))) });
    const c = set01();
    expect([c.base, c.exceptions, c.amendments]).toEqual([
      ref(BASE_REL),
      ref(EXC_REL),
      [ref(AMD29_REL), ref(AMD30_REL), ref(AMD01_REL)],
    ]);
  });

  it('the 2026-11-01 file carries out only the 2026-11-01 record', () => {
    const f = JSON.parse(fs.readFileSync(path.join(REPO, AMD01_REL), 'utf8'));
    expect([f.record, f.amendments.every((a) => !('record' in a))]).toEqual([RECORD01, true]);
  });

  // Predicted before compiling: one retarget; no ruling added, removed or made unmatchable
  // (fjölatóma jón is two plain words with an ASCII space).
  it('predicted delta against 2026-10-30: rulings 0, excluded 0, unmatchable 0, retargeted +1', () => {
    const [a, b] = [set30().counts, set01().counts];
    expect([b.rulings - a.rulings, b.excluded - a.excluded, b.unmatchable - a.unmatchable]).toEqual(
      [0, 0, 0]
    );
    expect(b.amendments).toEqual({ retargeted: 28, added: 12, removed: 1, forms: 1 });
  });

  it('polyatomic ion → fjölatóma jón; the withdrawn fjölatómajón survives as a competitor', () => {
    const r = ruling(set01(), 'polyatomic ion');
    expect([r.is, r.competitors, r.matchable, r.kinds]).toEqual([
      'fjölatóma jón',
      ['fjölatómajón', 'fjölfrumeinda jón'],
      true,
      ['amendment', 'verdict'],
    ]);
    // Control: the 2026-10-30 set really did carry the one-word target.
    expect(ruling(set30(), 'polyatomic ion').is).toBe('fjölatómajón');
  });

  it('changes no other ruling', () => {
    const changed = set30()
      .rulings.filter((r) => r.enNorm !== 'polyatomic ion')
      .filter((r) => JSON.stringify(r) !== JSON.stringify(ruling(set01(), r.enNorm)))
      .map((r) => r.enNorm);
    expect(changed).toEqual([]);
  });

  // What changes for editors: the pass reviews an occurrence only where the Icelandic lacks the
  // target, so under 2026-10-30 every correct fjölatóma jón was sent for review (and could be
  // "corrected" to the withdrawn form); under 2026-11-01 it is not.
  const isCandidate = (set, is) =>
    offeredRulings({
      item: { occurrences: [{ en: 'Sulfate is a polyatomic ion.', is }] },
      rulings: set.rulings,
      chapterDir: 'ch02',
    }).candidateIds.includes('polyatomic-ion');

  it('a sentence already written fjölatóma jón is reviewed under 2026-10-30, not under 2026-11-01', () => {
    const is = 'Súlfat er fjölatóma jón.';
    expect([isCandidate(set30(), is), isCandidate(set01(), is)]).toEqual([true, false]);
  });

  it('control: the glossary form fjölfrumeinda jón is still sent for review', () => {
    expect(isCandidate(set01(), 'Súlfat er fjölfrumeinda jón.')).toBe(true);
  });

  it('the AI pass reads this set by default', () => {
    expect(DEFAULT_RULING_SET).toBe(SET01_REL);
  });
});

describe('CLI', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ruling-2026-11-01-'));
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('writes the 2026-11-01 set from three --amendments flags, byte for byte', () => {
    const out = path.join(tmp, 'ruling-set-2026-11-01.json');
    const r = spawnSync(
      process.execPath,
      [
        CLI,
        '--base',
        BASE_REL,
        '--exceptions',
        EXC_REL,
        '--amendments',
        AMD29_REL,
        '--amendments',
        AMD30_REL,
        '--amendments',
        AMD01_REL,
        '--out',
        out,
      ],
      { cwd: REPO, encoding: 'utf8' }
    );
    expect([r.status, r.stderr]).toEqual([0, '']);
    expect(fs.readFileSync(out, 'utf8')).toBe(text01());
  });

  it('control: the 2026-11-01 file alone compiles, but to a different set — the chain matters', () => {
    // fjölatómajón is the base verdict's target, so the retarget applies without the earlier files;
    // what it then lacks is every change those files make.
    const out = path.join(tmp, 'ruling-set-2026-11-02.json');
    const r = spawnSync(
      process.execPath,
      [CLI, '--base', BASE_REL, '--exceptions', EXC_REL, '--amendments', AMD01_REL, '--out', out],
      { cwd: REPO, encoding: 'utf8' }
    );
    expect(r.status).toBe(0);
    const lone = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect([ruling(lone, 'polyatomic ion').is, lone.counts.amendments.retargeted]).toEqual([
      'fjölatóma jón',
      1,
    ]);
    expect(fs.readFileSync(out, 'utf8')).not.toBe(text01());
  });
});
