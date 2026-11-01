/**
 * The 2026-11-02 ruling set: [USER]'s ruling of 2026-11-01 that stoichiometry → hlutfallaefnafræði
 * covers only the subject (docs/decisions/2026-11-01-stoichiometry-subject-sense.md). A sense lives in
 * the exceptions file, not in an amendments file, so this set is compiled from a new exceptions file
 * (the 2026-10-29 file plus one sense) and the same base and three amendments files as 2026-11-01.
 * The set cannot be named 2026-11-01: that set was used by the 2026-11-01 ch10 runs and stays
 * byte-pinned by its own test.
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
import { rulingForRequest } from '../ai-review/term-pass-request.js';
import { DEFAULT_RULING_SET } from '../ai-review/term-pass.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = 'experiments/terminology-consistency/results';
const BASE_REL = `${DIR}/2026-10-11/ruling-set-after-stage1.json`;
const EXC29_REL = `${DIR}/2026-10-29/scope-exceptions-2026-10-29.json`;
const EXC02_REL = `${DIR}/2026-11-02/scope-exceptions-2026-11-02.json`;
const AMD_RELS = [
  `${DIR}/2026-10-29/amendments-2026-10-29.json`,
  `${DIR}/2026-10-30/amendments-2026-10-30.json`,
  `${DIR}/2026-11-01/amendments-2026-11-01.json`,
];
const SET01_REL = `${DIR}/2026-11-01/ruling-set-2026-11-01.json`;
const SET02_REL = `${DIR}/2026-11-02/ruling-set-2026-11-02.json`;
const FINAL_SORT_REL = `${DIR}/2026-11-01/stoichiometry-census/final-sort-2026-11-01.json`;
const RECORD = 'docs/decisions/2026-11-01-stoichiometry-subject-sense.md';
const CLI = path.join(REPO, 'tools', 'ai-review', 'compile-ruling-set.js');

const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const ruling = (set, enNorm) => set.rulings.find((r) => r.enNorm === enNorm);
const set01 = () => json(SET01_REL);
const set02 = () => json(SET02_REL);
const compile02 = () => {
  const { base, exceptions, amendments } = readInputs(BASE_REL, EXC02_REL, AMD_RELS);
  return compileRulingSet(base, exceptions, amendments);
};

describe('the 2026-11-02 exceptions file', () => {
  it('is the 2026-10-29 file plus one sense, stoichiometry, and nothing else changed', () => {
    const [a, b] = [json(EXC29_REL), json(EXC02_REL)];
    expect(b.exceptions).toEqual(a.exceptions);
    expect(b.senses.filter((s) => s.enNorm !== 'stoichiometry')).toEqual(a.senses);
    expect(b.senses.map((s) => s.enNorm)).toEqual([
      ...a.senses.map((s) => s.enNorm),
      'stoichiometry',
    ]);
    expect(b.about.startsWith(a.about)).toBe(true);
  });

  it('keeps the senses sorted by enNorm', () => {
    const names = json(EXC02_REL).senses.map((s) => s.enNorm);
    expect(names).toEqual([...names].sort());
  });

  // The glossBy text quotes [USER]'s sort; the committed census file is the evidence for it.
  it('the counts its glossBy quotes are the census final sort', () => {
    const s = json(EXC02_REL).senses.find((x) => x.enNorm === 'stoichiometry');
    const f = json(FINAL_SORT_REL).finalCounts;
    const quoted = s.glossBy
      .match(/(\d+) subject, (\d+) mixed, (\d+) ratio/)
      .slice(1)
      .map(Number);
    expect(quoted).toEqual([f.topic, f.mixed, f.ratio]);
    expect(f.head).toBe(1);
  });

  // [USER] sorted "reaction stoichiometry calculations" both ways (s05, s06 ratio; s18 subject),
  // so neither gloss may use it as an example.
  it('no gloss uses the phrase the sort contests', () => {
    const s = json(EXC02_REL).senses.find((x) => x.enNorm === 'stoichiometry');
    const glosses = [s.gloss, ...s.otherSenses.map((o) => o.gloss)].join(' ');
    expect(glosses).not.toMatch(/stoichiometry calculation/i);
    const items = json(FINAL_SORT_REL).items;
    const sense = (id) => items.find((i) => i.id === id).final;
    expect([sense('s05'), sense('s06'), sense('s18')]).toEqual(['ratio', 'ratio', 'topic']);
  });
});

describe('the committed 2026-11-02 artifact', () => {
  it('re-compiling the committed inputs reproduces it byte for byte', () => {
    expect(serializeRulingSet(compile02())).toBe(read(SET02_REL));
  });

  it('loads through the loader', () => {
    expect(loadRulingSet(path.join(REPO, SET02_REL)).rulings.length).toBe(set02().rulings.length);
  });

  it('records its inputs by path and sha256: the new exceptions file, the same base and amendments', () => {
    const ref = (rel) => ({ path: rel, sha256: sha256(fs.readFileSync(path.join(REPO, rel))) });
    const c = set02();
    expect([c.base, c.exceptions, c.amendments]).toEqual([
      ref(BASE_REL),
      ref(EXC02_REL),
      AMD_RELS.map(ref),
    ]);
    expect([c.base, c.amendments]).toEqual([set01().base, set01().amendments]);
  });

  // Predicted before compiling: a sense changes no headword, target, competitor or match.
  it('predicted delta against 2026-11-01: rulings 0, excluded 0, unmatchable 0, ruled senses +1', () => {
    const [a, b] = [set01().counts, set02().counts];
    expect([b.rulings - a.rulings, b.excluded - a.excluded, b.unmatchable - a.unmatchable]).toEqual(
      [0, 0, 0]
    );
    expect([a.senses, b.senses]).toEqual([
      { proposed: 0, ruled: 7 },
      { proposed: 0, ruled: 8 },
    ]);
    expect(b.amendments).toEqual(a.amendments);
  });

  it('stoichiometry keeps its target and competitor and gains the subject sense', () => {
    const r = ruling(set02(), 'stoichiometry');
    expect([r.is, r.competitors, r.matchable, r.sense.id, r.sense.status]).toEqual([
      'hlutfallaefnafræði',
      ['magnhlutföll'],
      true,
      'subject',
      'ruled',
    ]);
    expect(r.sense.otherSenses.map((o) => o.id)).toEqual(['amount-ratios']);
    // Control: the 2026-11-01 set really had no sense on it.
    expect(ruling(set01(), 'stoichiometry').sense).toBeNull();
  });

  it('changes no other ruling', () => {
    const changed = set01()
      .rulings.filter((r) => JSON.stringify(r) !== JSON.stringify(ruling(set02(), r.enNorm)))
      .map((r) => r.enNorm);
    expect(changed).toEqual(['stoichiometry']);
  });

  it('its sense note names the decision record, which exists', () => {
    const note = set02().notes.find((n) => n.kind === 'sense' && n.enNorm === 'stoichiometry');
    expect(note.source).toContain(RECORD);
    expect(fs.existsSync(path.join(REPO, RECORD))).toBe(true);
  });

  it('the model is sent the ruled sense id and the closed list, the ruled gloss first', () => {
    const r = ruling(set02(), 'stoichiometry');
    const req = rulingForRequest(r);
    expect([req.sense, req.senses.map((s) => s.id), req.senses[0].gloss]).toEqual([
      'subject',
      ['subject', 'amount-ratios'],
      r.sense.gloss,
    ]);
  });

  // What changes for the pass: a sensed ruling is a candidate wherever it matches, because the
  // model must judge the sense. A title that already carries the target was not sent before.
  const isCandidate = (set, en, is) =>
    offeredRulings({
      item: { occurrences: [{ en, is }] },
      rulings: set.rulings,
      chapterDir: 'ch04',
    }).candidateIds.includes('stoichiometry');

  it('a title already written hlutfallaefnafræði is sent under 2026-11-02, not under 2026-11-01', () => {
    const [en, is] = ['Stoichiometry of Chemical Reactions', 'Hlutfallaefnafræði efnahvarfa'];
    expect([isCandidate(set01(), en, is), isCandidate(set02(), en, is)]).toEqual([false, true]);
  });

  it('control: a sentence without the target is sent under both sets', () => {
    const [en, is] = ['The reaction stoichiometry shows that', 'Efnajafnan sýnir að'];
    expect([isCandidate(set01(), en, is), isCandidate(set02(), en, is)]).toEqual([true, true]);
  });

  it('the AI pass reads this set by default', () => {
    expect(DEFAULT_RULING_SET).toBe(SET02_REL);
  });
});

describe('CLI', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ruling-2026-11-02-'));
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const compileTo = (exc, name) => {
    const out = path.join(tmp, name);
    const args = [CLI, '--base', BASE_REL, '--exceptions', exc];
    for (const a of AMD_RELS) args.push('--amendments', a);
    const r = spawnSync(process.execPath, [...args, '--out', out], { cwd: REPO, encoding: 'utf8' });
    return { r, text: r.status === 0 ? fs.readFileSync(out, 'utf8') : null };
  };

  it('writes the 2026-11-02 set from the new exceptions file, byte for byte', () => {
    const { r, text } = compileTo(EXC02_REL, 'ruling-set-2026-11-02.json');
    expect([r.status, r.stderr]).toEqual([0, '']);
    expect(text).toBe(read(SET02_REL));
  });

  it('control: the 2026-10-29 exceptions file with the same amendments gives the 2026-11-01 set', () => {
    const { r, text } = compileTo(EXC29_REL, 'ruling-set-2026-11-03.json');
    expect(r.status).toBe(0);
    expect(text).toBe(read(SET01_REL));
  });
});
