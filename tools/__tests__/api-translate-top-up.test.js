/**
 * §C183 — the segment top-up on the PAID path: `api-translate --top-up`.
 *
 * 🔴 THE TOP-UP MUST SEND THROUGH THE SAME GUARDED CORE AS A FULL RUN. Every paid-run
 * guard (id sets, truncation, Greek conservation, the wire-only leak check, the bracket
 * delta) lives on that path; a top-up with its own send/splice/write would buy with none
 * of them. So these tests drive `topUpModule` with a scripted client and assert that a
 * guard firing leaves the committed IS and its provenance BYTE-IDENTICAL.
 *
 * 🔴 PROVENANCE, THREE CONSTRAINTS, EACH FROM A MEASURED READER:
 *  - keep `run` untouched — `chapter-term-check` and `compute-glossary-subset` read
 *    `run.glossary.arm` as the arm the module's MT was bought under;
 *  - keep `schemaVersion` — `compute-glossary-subset` filters on `=== 2`;
 *  - re-stamp `generatedAt` — the battery's drift view reads it as the MT's vintage, and
 *    an IS topped up under its old stamp reads as pre-type (register §C183).
 *
 * ⚠️ CLI SAFETY: `requireBook` resolves against the real `books/`, so the CLI cases use
 * the real chemistry tree. Every one of them is a --dry-run or is refused before the
 * client exists — once chemistry is re-extracted, a live `--top-up` on m68865 WOULD call
 * the API (with this bogus key: a loud 401, not a charge).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mtRunDecision, topUpAction, topUpModule } from '../api-translate.js';
import { spliceTopUp } from '../lib/mt-top-up.js';

const require = createRequire(import.meta.url);
const { parseSegmentsMap } = require('../lib/seg-markers.cjs');

const seg = (type, id, text) => `<!-- SEG:m1:${type}:${id} -->\n${text}\n\n`;
const SUMMARY_EN = 'A table of boiling points.';
const SUMMARY_IS = 'Tafla yfir suðumark.';
const EN = seg('para', 'p1', 'Water boils.') + seg('table-summary', 't1', SUMMARY_EN);
// The committed IS files end with NO newline (m68865 ends "—" then EOF).
const IS = '<!-- SEG:m1:para:p1 -->\nVatn sýður.';
const PRIOR = {
  schemaVersion: 2,
  tool: 'api-translate',
  generatedAt: '2026-09-21T20:08:33.056Z',
  run: { runRecordVersion: 1, chars: 40, glossary: { arm: 'glossary-only', termCount: 26 } },
  manualCorrections: [{ note: 'a hand repair recorded by a human' }],
};

/** A client that applies `transform` to the wire text, recording each call. */
function client(transform = (t) => t.replace(SUMMARY_EN, SUMMARY_IS)) {
  const calls = [];
  return {
    calls,
    translateAuto: async (text, opts) => {
      calls.push({ text, glossary: Boolean(opts?.glossaries) });
      return { text: transform(text), usage: { units: text.length, cost: 0 } };
    },
  };
}

let dir, enPath, isPath, provPath, linksPath;
function setUp({ en = EN, is = IS, prov = PRIOR } = {}) {
  fs.writeFileSync(enPath, en);
  fs.writeFileSync(isPath, is);
  if (prov) fs.writeFileSync(provPath, JSON.stringify(prov, null, 2) + '\n');
}
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'top-up-'));
  for (const d of ['02-for-mt/ch01', '02-mt-output/ch01']) {
    fs.mkdirSync(path.join(dir, d), { recursive: true });
  }
  enPath = path.join(dir, '02-for-mt/ch01/m1-segments.en.md');
  isPath = path.join(dir, '02-mt-output/ch01/m1-segments.is.md');
  provPath = path.join(dir, '02-mt-output/ch01/m1-provenance.json');
  linksPath = path.join(dir, '02-mt-output/ch01/m1-segments-links.json');
  setUp();
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const topUp = (c) =>
  topUpModule(c, enPath, isPath, null, false, undefined, { glossaryArm: 'no-glossary' });
const prov = () => JSON.parse(fs.readFileSync(provPath, 'utf8'));
const snapshot = () => [enPath, isPath, provPath].map((p) => fs.readFileSync(p, 'utf8'));

describe('mtRunDecision under --top-up', () => {
  it('tops up an existing, unlocked IS', () => {
    expect(mtRunDecision({ exists: true, force: false, locked: false, topUp: true })).toBe(
      'top-up'
    );
  });

  // The glossary-arm CLI tests spawn a LIVE run on m68865 and are safe only because an
  // existing IS is `skip` — which must stay true when that IS lacks a newly extracted id.
  it('still skips an existing IS without --top-up', () => {
    expect(mtRunDecision({ exists: true, force: false, locked: false })).toBe('skip');
  });

  it('keeps a lock absolute', () => {
    expect(mtRunDecision({ exists: true, force: false, locked: true, topUp: true })).toBe(
      'locked-skip'
    );
  });

  it('writes a missing IS in full', () => {
    expect(mtRunDecision({ exists: false, force: false, locked: false, topUp: true })).toBe(
      'write'
    );
  });
});

describe('topUpAction — what the plan makes of a module', () => {
  it('tops up when ids are missing', () => {
    expect(topUpAction({ missing: ['x'], extra: [] })).toBe('top-up');
  });

  it('skips when nothing is missing', () => {
    expect(topUpAction({ missing: [], extra: [] })).toBe('skip');
  });

  it('refuses drift, even when ids are also missing', () => {
    expect(topUpAction({ missing: ['x'], extra: ['y'] })).toBe('refuse');
  });
});

describe('topUpModule — buys only what is missing, keeps everything else', () => {
  it('sends only the segments the IS lacks', async () => {
    const c = client();
    await topUp(c);
    expect(c.calls.map((call) => [...parseSegmentsMap(call.text).keys()])).toEqual([
      ['m1:table-summary:t1'],
    ]);
  });

  it('writes the IS with the new segment spliced in and every old byte intact', async () => {
    await topUp(client());
    const want = spliceTopUp(EN, IS, seg('table-summary', 't1', SUMMARY_IS)).text;
    expect(fs.readFileSync(isPath, 'utf8')).toBe(want);
  });

  it('keeps the original run record', async () => {
    await topUp(client());
    expect(prov().run).toEqual(PRIOR.run);
  });

  it('re-stamps generatedAt', async () => {
    await topUp(client());
    expect(Date.parse(prov().generatedAt)).toBeGreaterThan(Date.parse(PRIOR.generatedAt));
  });

  it('records the top-up: its ids, the stamp it replaced, and its own arm', async () => {
    await topUp(client());
    const [t] = prov().topUps;
    expect([t.ids, t.priorGeneratedAt, t.run.glossary.arm]).toEqual([
      ['m1:table-summary:t1'],
      PRIOR.generatedAt,
      'no-glossary',
    ]);
  });

  it('keeps the schema version and every other key', async () => {
    await topUp(client());
    expect([prov().schemaVersion, prov().manualCorrections]).toEqual([2, PRIOR.manualCorrections]);
  });

  it('does not touch the -links.json', async () => {
    fs.writeFileSync(linksPath, '{"old":true}\n');
    fs.writeFileSync(enPath.replace('-segments.en.md', '-segments-links.json'), '{"new":true}\n');
    await topUp(client());
    expect(fs.readFileSync(linksPath, 'utf8')).toBe('{"old":true}\n');
  });
});

describe('topUpModule — refuses before writing, and says so', () => {
  it('makes no API call and writes nothing when nothing is missing', async () => {
    setUp({ en: seg('para', 'p1', 'Water boils.') });
    const before = snapshot();
    const c = client();
    const result = await topUp(c);
    expect([c.calls.length, result.toppedUp, snapshot()]).toEqual([0, 0, before]);
  });

  it('refuses drift before any API call, writing nothing', async () => {
    setUp({ is: IS + '\n\n<!-- SEG:m1:para:gone -->\nGamalt.' });
    const before = snapshot();
    const c = client();
    await expect(topUp(c)).rejects.toThrow(/m1:para:gone/);
    expect([c.calls.length, snapshot()]).toEqual([0, before]);
  });

  it('refuses a module with no provenance before any API call', async () => {
    fs.rmSync(provPath);
    const c = client();
    await expect(topUp(c)).rejects.toThrow(/provenance/i);
    expect(c.calls.length).toBe(0);
  });

  it('refuses an IS another tool produced', async () => {
    setUp({ prov: { ...PRIOR, tool: 'docx-import' } });
    const c = client();
    await expect(topUp(c)).rejects.toThrow(/docx-import/);
    expect(c.calls.length).toBe(0);
  });

  it('refuses a truncated response and leaves the IS and provenance byte-identical', async () => {
    const long = 'The table lists the boiling point of each liquid at one atmosphere. '.repeat(6);
    setUp({ en: seg('para', 'p1', 'Water boils.') + seg('table-summary', 't1', long.trim()) });
    const before = snapshot();
    const c = client((t) => t.replace(long.trim(), 'Taflan sýnir'));
    await expect(topUp(c)).rejects.toThrow(/truncat/i);
    expect(snapshot()).toEqual(before);
  });

  it('writes a Greek loss in a new segment but reports it for the hold-back', async () => {
    setUp({
      en: seg('para', 'p1', 'Water boils.') + seg('table-summary', 't1', 'A table of σ bonds.'),
    });
    const result = await topUp(
      client((t) => t.replace('A table of σ bonds.', 'Tafla yfir Δ-tengi.'))
    );
    expect([result.greekLost.length, fs.readFileSync(isPath, 'utf8')]).toEqual([
      1,
      expect.stringContaining('Tafla yfir Δ-tengi.'),
    ]);
  });

  // The bracket delta must describe what THIS run bought. An old segment whose markers
  // already differ is the original buy's business, and holding the top-up back for it
  // would send a human to triage a module the top-up did not damage.
  it('judges bracket markers over the new segments only', async () => {
    setUp({ en: seg('para', 'p1', 'Water [[i:boils]].') + seg('table-summary', 't1', SUMMARY_EN) });
    const result = await topUp(client());
    expect(result.bracketDelta).toEqual({});
  });
});

describe('the CLI — refusals that never reach the client', () => {
  const TOOL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../api-translate.js');
  const SCOPE = ['--book', 'efnafraedi-2e', '--chapter', 'appendices', '--module', 'm68865'];
  const cli = (extra) => {
    const r = spawnSync(process.execPath, [TOOL, ...SCOPE, ...extra], {
      encoding: 'utf8',
      env: { ...process.env, MALSTADUR_API_KEY: 'test-bogus-key-never-sent' },
    });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  };

  // --dry-run rides along ON PURPOSE. This test's first RED run, before `--top-up` existed,
  // dropped the unknown flag (parseArgs drops them silently) and so ran a LIVE `--force`
  // on m68865 — only the bogus key stopped it at a 401. With --dry-run, any future RED
  // (a renamed flag, a moved check) degrades to a rehearsal, never to a call.
  it('refuses --top-up together with --force, even in a dry run', () => {
    const r = cli(['--top-up', '--force', '--dry-run', '--no-glossary']);
    expect([r.code, r.out]).toEqual([
      1,
      expect.stringMatching(/--top-up.*--force|--force.*--top-up/),
    ]);
  });

  it('sizes a top-up in a dry run and states the arm', () => {
    const r = cli(['--top-up', '--dry-run', '--no-glossary']);
    expect([r.code, r.out]).toEqual([
      0,
      expect.stringMatching(/To top up:\s+\d+[\s\S]*Glossary arm: no-glossary/),
    ]);
  });
});
