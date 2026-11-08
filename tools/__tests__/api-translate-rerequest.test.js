/**
 * The RE-REQUEST mode on the paid path: `api-translate --rerequest <ids>` (plan 2026-10-10
 * §2.3; plan docs/superpowers/plans/2026-11-08-rerequest-mode.md, Tasks 3 and 4).
 *
 * 🔴 IT SENDS ONLY THROUGH THE GUARDED CORE (`translateSegmentText`), so every paid-run guard
 * covers it, and it WRITES ONLY LAYER 1S (`02-mt-selected/`). Every case below drives
 * `rerequestModule` with a scripted client and checks, after the case, that the layer-1 file
 * is byte-identical and that nothing else appeared in `02-mt-output/`.
 *
 * 🔴 "UNTRANSLATED TWICE" COUNTS ANSWERS, NOT SENDS. A refused response (no SEG marker, an id
 * the repairs cannot restore) is a transport failure: it is logged but does not count toward
 * the two untranslated answers that flag a segment.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  rerequestModule,
  formatRerequestDryRun,
  resolveRerequestCommit,
} from '../api-translate.js';
import { readBase, LAYER_DIRS, readRerequestOutcomes } from '../lib/mt-layers.js';
import { estimateIsk } from '../lib/malstadur-api.js';
import { makeGit } from '../ai-review/provenance.js';

const REPO = fileURLToPath(new URL('../..', import.meta.url));

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const SHA_A = 'a'.repeat(40);
const RUN_ID = '20261108T090000Z-1a2b3c4d';
const AT = '2026-11-08T09:00:00.000Z';
const seg = (id, text) => `<!-- SEG:${id} -->\n${text}\n\n`;

const P0_EN = 'Atoms are small.';
const P0_IS = 'Frumeindir eru litlar.';
const P1_EN = 'Water boils at one hundred degrees under normal pressure.';
const P1_IS = 'Vatn sýður við hundrað gráður við venjulegan þrýsting.';
const P2_EN = 'The [[term:boiling point|term-00001]] depends strongly on the surrounding pressure.';
// What rides the wire for P2 (stripTermFnToPaired), and its answer.
const P2_WIRE_EN =
  'The [[term]]boiling point[[/term]] depends strongly on the surrounding pressure.';
const P2_WIRE_IS = '[[term]]Suðumarkið[[/term]] veltur mjög á þrýstingnum umhverfis.';
const P2_IS = '[[term:Suðumarkið|term-00001]] veltur mjög á þrýstingnum umhverfis.';

const P1 = 'm100:para:p1';
const P2 = 'm100:para:p2';
const EN = seg('m100:para:p0', P0_EN) + seg(P1, P1_EN) + seg(P2, P2_EN);
// p1 and p2 came back as English; layer-1 files end with no newline.
const IS = (seg('m100:para:p0', P0_IS) + seg(P1, P1_EN) + seg(P2, P2_EN)).trimEnd();
const wireOf = (...pairs) => pairs.map(([id, text]) => seg(id, text)).join('');

const icelandic = (t) => t.replace(P1_EN, P1_IS).replace(P2_WIRE_EN, P2_WIRE_IS);
const dropMarker = (t) => t.replace(/<!-- SEG:[^>]*-->\n/, '');

/** A client whose n-th call applies the n-th transform (the last one repeats). */
function client(...transforms) {
  const calls = [];
  return {
    calls,
    translateAuto: async (text, opts) => {
      calls.push({ text, opts });
      const f = transforms[Math.min(calls.length - 1, transforms.length - 1)];
      return { text: f(text), usage: { units: text.length, cost: 0 } };
    },
  };
}

let root;
let book;
const ch = 'ch01';
const layer1Path = () => path.join(book, LAYER_DIRS.pure, ch, 'm100-segments.is.md');
const overlayPath = () => path.join(book, LAYER_DIRS.selected, ch, 'm100-selected.json');
const logPath = () => path.join(book, LAYER_DIRS.selected, ch, 'm100-rerequest.jsonl');
const overlay = () =>
  fs.existsSync(overlayPath()) ? JSON.parse(fs.readFileSync(overlayPath(), 'utf8')) : null;
const logLines = () =>
  fs.existsSync(logPath())
    ? fs
        .readFileSync(logPath(), 'utf8')
        .trimEnd()
        .split('\n')
        .map((l) => JSON.parse(l))
    : [];
const bodyAt = (key) =>
  readBase({ bookDir: book, chapterDir: ch, stem: 'm100' }).parsed.records.find(
    (r) => r.key === key
  ).body;
const run = (c, ids, o = {}) =>
  rerequestModule(c, { bookDir: book, chapterDir: ch, stem: 'm100', ids }, null, false, undefined, {
    glossaryArm: 'no-glossary',
    commit: SHA_A,
    runId: RUN_ID,
    now: () => new Date(AT),
    ...o,
  });

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'rerequest-'));
  book = path.join(root, 'books', 'testbook');
  fs.mkdirSync(path.join(book, '02-for-mt', ch), { recursive: true });
  fs.mkdirSync(path.join(book, LAYER_DIRS.pure, ch), { recursive: true });
  fs.writeFileSync(path.join(book, '02-for-mt', ch, 'm100-segments.en.md'), EN);
  fs.writeFileSync(layer1Path(), IS);
});
afterEach(() => {
  // Layer 1 is only ever read: byte-identical, and nothing new beside it.
  expect([
    fs.readFileSync(layer1Path(), 'utf8'),
    fs.readdirSync(path.join(book, LAYER_DIRS.pure, ch)),
  ]).toEqual([IS, ['m100-segments.is.md']]);
  fs.rmSync(root, { recursive: true, force: true });
});

describe('rerequestModule', () => {
  const P1_WIRE = wireOf([P1, P1_EN]);

  it('accepts an Icelandic answer: the 1s entry carries text, beforeSha256, run, commit, rule and gate', async () => {
    const r = await run(client(icelandic), [P1]);
    expect([r, overlay().entries, bodyAt(P1)]).toEqual([
      { accepted: [P1], flagged: [], failed: [], attempts: 1, chars: P1_WIRE.length },
      [
        {
          segmentId: P1,
          occurrence: 0,
          text: P1_IS,
          beforeSha256: sha256(P1_EN),
          run: RUN_ID,
          commit: SHA_A,
          rule: 'rerequest',
          gate: { check: 'detectResidue', untranslated: false, attempt: 1 },
        },
      ],
      P1_IS,
    ]);
  });

  it('logs every attempt with the response as received and the run record', async () => {
    await run(client(icelandic), [P1]);
    const [line, ...rest] = logLines();
    expect([rest.length, line, line.run.chars]).toEqual([
      0,
      expect.objectContaining({
        schema: 'mt-rerequest/1',
        module: 'm100',
        runId: RUN_ID,
        at: AT,
        attempt: 1,
        commit: SHA_A,
        glossaryArm: 'no-glossary',
        ids: [P1],
        chars: P1_WIRE.length,
        estimatedIsk: estimateIsk(P1_WIRE.length),
        error: null,
        results: [{ segmentId: P1, outcome: 'translated', body: P1_IS, reason: null }],
      }),
      P1_WIRE.length,
    ]);
  });

  it('identity MT: nothing is written to the overlay, both attempts are logged, the id is flagged', async () => {
    const c = client((t) => t);
    const r = await run(c, [P1]);
    expect([
      overlay(),
      logLines().map((l) => l.results[0].outcome),
      r.flagged,
      c.calls.length,
    ]).toEqual([null, ['untranslated', 'untranslated'], [P1], 2]);
  });

  it('the second attempt sends only the ids still untranslated', async () => {
    const c = client((t) => t.replace(P1_EN, P1_IS)); // p2 comes back in English each time
    const r = await run(c, [P1, P2]);
    expect([
      c.calls[1].text.includes(`SEG:${P2}`),
      c.calls[1].text.includes(`SEG:${P1}`),
      r.accepted,
      r.flagged,
    ]).toEqual([true, false, [P1], [P2]]);
  });

  it('retries a marker-less one-segment response once', async () => {
    const r = await run(
      client((t) => dropMarker(icelandic(t)), icelandic),
      [P1]
    );
    const [first] = logLines();
    expect([
      r.accepted,
      first.results[0].outcome,
      /marker/.test(first.error),
      overlay().entries[0].gate.attempt,
    ]).toEqual([[P1], 'refused', true, 2]);
  });

  it('a digit rewritten inside an element id is repaired to the right id and accepted', async () => {
    // Measured 2026-11-08: repairSegTags (§C174, strategy 3) restores a digit rewrite when
    // position and skeleton agree, so the guarded core accepts it at the id it belongs to.
    const r = await run(
      client((t) => icelandic(t).replace(`SEG:${P1} `, 'SEG:m100:para:p7 ')),
      [P1]
    );
    expect([r.accepted, bodyAt(P1)]).toEqual([[P1], P1_IS]);
  });

  it('a digit rewrite that collides with another requested id is refused, logged, and not written', async () => {
    const collide = (t) => icelandic(t).replace(`SEG:${P1} `, `SEG:${P2} `);
    const r = await run(client(collide), [P1, P2]);
    expect([r.failed, overlay(), logLines().map((l) => l.results.map((x) => x.outcome))]).toEqual([
      [P1, P2],
      null,
      [
        ['refused', 'refused'],
        ['refused', 'refused'],
      ],
    ]);
  });

  it('holds a segment whose markers changed and accepts its clean sibling', async () => {
    const noTerm = (t) =>
      icelandic(t).replace(P2_WIRE_IS, 'Suðumarkið veltur mjög á þrýstingnum umhverfis.');
    const r = await run(client(noTerm), [P1, P2]);
    const p2 = logLines()[0].results.find((x) => x.segmentId === P2);
    expect([r.accepted, r.failed, p2.outcome, /term/.test(p2.reason)]).toEqual([
      [P1],
      [P2],
      'held',
      true,
    ]);
  });

  it('control: a clean term-bearing answer is accepted with its id reattached', async () => {
    const r = await run(client(icelandic), [P2]);
    expect([r.accepted, bodyAt(P2)]).toEqual([[P2], P2_IS]);
  });

  it('an id refused twice is failed, not flagged, and never written', async () => {
    const r = await run(
      client((t) => dropMarker(icelandic(t))),
      [P1]
    );
    expect([r.failed, r.flagged, overlay(), logLines().length]).toEqual([[P1], [], null, 2]);
  });

  it('one untranslated answer then one refusal leaves the id failed with one untranslated answer logged', async () => {
    const r = await run(
      client((t) => t, dropMarker),
      [P1]
    );
    const counts = readRerequestOutcomes({ bookDir: book, chapterDir: ch, stem: 'm100' });
    // A later run still requests it: one untranslated answer does not flag.
    const again = await run(client(icelandic), [P1]);
    expect([r.failed, counts.get(P1), again.accepted]).toEqual([[P1], 1, [P1]]);
  });

  it('an id with two untranslated answers from an earlier run is not sent (already-flagged)', async () => {
    await run(
      client((t) => t),
      [P1]
    ); // two untranslated answers
    const c = client(icelandic);
    await expect(run(c, [P1])).rejects.toThrow(/already-flagged/);
    expect(c.calls.length).toBe(0);
  });

  it('a body with a line break is held, logged, and not written', async () => {
    const broken = (t) =>
      t.replace(P1_EN, 'Vatn sýður\nvið hundrað gráður við venjulegan þrýsting.');
    const r = await run(client(broken), [P1]);
    const first = logLines()[0].results[0];
    expect([r.failed, overlay(), first.outcome, first.reason]).toEqual([
      [P1],
      null,
      'held',
      'line-break',
    ]);
  });

  it('records a refused attempt with chars and estimatedIsk but run null', async () => {
    await run(
      client((t) => dropMarker(icelandic(t))),
      [P1]
    );
    const [first] = logLines();
    expect([first.chars, first.estimatedIsk, first.run, first.results[0].body]).toEqual([
      P1_WIRE.length,
      estimateIsk(P1_WIRE.length),
      null,
      null,
    ]);
  });

  it('refuses before any send when a named id is already translated', async () => {
    const c = client(icelandic);
    await expect(run(c, ['m100:para:p0'])).rejects.toThrow(/not-untranslated/);
    expect([c.calls.length, overlay(), logLines()]).toEqual([0, null, []]);
  });
});

// ─── The CLI (Task 4) ────────────────────────────────────────────────────────────────────
// ⚠️ These run the real tool on the real chemistry tree, so every case is a --dry-run or is
// refused before a client exists, and the child gets a bogus API key: an accidental live call
// fails loudly (401), never charges. ⚠️ ONLY CASES WHOSE RESULT SURVIVES THE BUY GO HERE: once
// the 8 segments are committed to layer 1s the planner refuses them (`already-selected`), so
// "the 8 ids plan cleanly" is a manual measurement, and its printout is pinned through the
// pure formatter below instead.

const cli = (...args) =>
  spawnSync(process.execPath, ['tools/api-translate.js', '--book', 'efnafraedi-2e', ...args], {
    cwd: REPO,
    env: { ...process.env, MALSTADUR_API_KEY: 'bogus-key-for-tests' },
    encoding: 'utf8',
  });
const TRANSLATED_ID = 'm68852:abstract-item:abstract-item-1';

describe('api-translate --rerequest (CLI)', () => {
  it('the flag is declared: --rerequest with an unknown id exits 1 and names it', () => {
    const r = cli('--rerequest', 'm68852:para:nope', '--dry-run');
    expect([
      r.status,
      r.stderr.includes('m68852:para:nope'),
      r.stderr.includes('not-in-en'),
    ]).toEqual([1, true, true]);
  });

  it('a translated id is refused: not-untranslated, exit 1, nothing sent', () => {
    const r = cli('--rerequest', TRANSLATED_ID, '--dry-run');
    expect([
      r.status,
      r.stderr.includes('not-untranslated'),
      r.stdout.includes('Re-request:'),
    ]).toEqual([1, true, false]);
  });

  it('refuses --rerequest with --force, --top-up, --june-wire or --update-status', () => {
    const outcomes = ['--force', '--top-up', '--june-wire', '--update-status'].map((flag) => {
      const r = cli('--rerequest', TRANSLATED_ID, flag, '--dry-run', '--no-glossary');
      return [flag, r.status, r.stderr.includes('Nothing was sent')];
    });
    expect(outcomes).toEqual([
      ['--force', 1, true],
      ['--top-up', 1, true],
      ['--june-wire', 1, true],
      ['--update-status', 1, true],
    ]);
  });

  it('a live --rerequest with no glossary arm is refused (exit 2) before any client', () => {
    const r = cli('--rerequest', TRANSLATED_ID);
    expect([r.status, r.stderr.includes('no glossary arm')]).toEqual([2, true]);
  });
});

describe('formatRerequestDryRun', () => {
  const modules = [
    {
      chapterDir: 'ch08',
      stem: 'm68744',
      ids: [{ id: 'm68744:para:fs-idp92007424', chars: 392 }],
      wireChars: 433,
      recordedArm: 'glossary-only',
      recordedTermCount: 8,
    },
    {
      chapterDir: 'ch21',
      stem: 'm68852',
      ids: Array.from({ length: 6 }, (_, i) => ({ id: `m68852:para:x${i}`, chars: 100 })),
      wireChars: 900,
      recordedArm: 'glossary-only',
      recordedTermCount: 36,
    },
    {
      chapterDir: 'ch21',
      stem: 'm68856',
      ids: [{ id: 'm68856:para:fs-idm211204656', chars: 1006 }],
      wireChars: 1047,
      recordedArm: null,
      recordedTermCount: null,
    },
  ];
  const text = (o = {}) =>
    formatRerequestDryRun({
      modules,
      statedArm: 'no-glossary',
      commit: 'c'.repeat(40),
      commitProblems: [],
      ...o,
    });

  it('prints the summary line, per-id chars, ISK per attempt, both arms and the commit', () => {
    const t = text();
    expect([
      t.includes('Re-request: 3 module(s), 8 segment(s)'),
      t.includes('m68744:para:fs-idp92007424') && t.includes('392'),
      t.includes(`~${estimateIsk(433 + 900 + 1047).toFixed(0)} ISK per attempt`),
      t.includes('Glossary arm: no-glossary'),
      t.includes('glossary-only, 36 term(s)'),
      t.includes(`Commit: ${'c'.repeat(40)}`),
    ]).toEqual([true, true, true, true, true, true]);
  });

  it('prints the would-refuse line when there are commit problems', () => {
    const t = text({ commitProblems: ['books/x differs from its blob'] });
    expect([t.includes('the live run would refuse'), t.includes('books/x differs')]).toEqual([
      true,
      true,
    ]);
  });

  it('warns when no glossary arm is given', () => {
    expect(text({ statedArm: null }).includes('REFUSED')).toBe(true);
  });
});

describe('resolveRerequestCommit', () => {
  it('returns HEAD for clean inputs and refuses a dirty one', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'rerequest-git-'));
    try {
      const g = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8' });
      g('init', '-q');
      g('config', 'user.email', 't@example.invalid');
      g('config', 'user.name', 'test');
      fs.mkdirSync(path.join(repo, 'in'));
      fs.writeFileSync(path.join(repo, 'in', 'a.txt'), 'one\n');
      g('add', '.');
      g('commit', '-q', '-m', 'one');
      const head = g('rev-parse', 'HEAD').trim();
      const git = makeGit({ cwd: repo });
      const clean = resolveRerequestCommit({ git, repoRoot: repo, files: ['in/a.txt'] });
      fs.writeFileSync(path.join(repo, 'in', 'a.txt'), 'two\n');
      expect([
        clean,
        () => resolveRerequestCommit({ git, repoRoot: repo, files: ['in/a.txt'] }),
      ]).toEqual([head, expect.any(Function)]);
      expect(() => resolveRerequestCommit({ git, repoRoot: repo, files: ['in/a.txt'] })).toThrow(
        /in\/a\.txt/
      );
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});
