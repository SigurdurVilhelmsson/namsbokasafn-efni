// server/__tests__/binInflectionsCli.test.js
// ⚠️ The HYBRID shape every server/__tests__ file uses: `import` for vitest and
// node builtins — **Vitest CANNOT be require()d at all**, it throws — and
// `createRequire` for the server's own CommonJS modules. Matches
// importConcepts.test.js:9-14.
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseArgs, candidateSql, main } = require('../scripts/fetch-bin-inflections');
const freshMigratedDb = require('./helpers/freshMigratedDb');

describe('parseArgs', () => {
  it('defaults to dry-run', () => {
    expect(parseArgs([]).execute).toBe(false);
  });

  it('accepts --execute', () => {
    expect(parseArgs(['--execute']).execute).toBe(true);
  });

  it('reads --db and --bin-data as the NEXT argument', () => {
    const a = parseArgs(['--db', '/tmp/x.db', '--bin-data', '/tmp/y.csv']);
    expect(a.db).toBe('/tmp/x.db');
    expect(a.binData).toBe('/tmp/y.csv');
  });

  it('parses --limit as a number', () => {
    expect(parseArgs(['--limit', '50']).limit).toBe(50);
  });

  // ⚠️ argparse EXITS on an unknown flag. tools/lib/parseArgs.js silently drops
  // it (CLAUDE.md, durable) — using that helper here would be a regression.
  it('THROWS on an unknown flag rather than ignoring it', () => {
    expect(() => parseArgs(['--output-dir', '/tmp'])).toThrow(/unrecognised/i);
  });

  // The value-swallow bug B0 found in the sibling scripts.
  it('refuses a flag as the value of another flag', () => {
    expect(() => parseArgs(['--db', '--execute'])).toThrow(/expects a value/i);
  });

  // ⚠️ I-1 — Number('abc') is NaN, which is FALSY, so an un-guarded --limit
  // silently dropped the LIMIT clause and the run processed EVERY row instead
  // of refusing. Python's argparse(type=int) exits 2 on all of these.
  describe('rejects a non-integer --limit rather than silently dropping the bound', () => {
    it.each([
      ['abc', 'not numeric at all'],
      ['3.7', 'a float — SQLite would only catch this after the 377 MB load'],
      ['', "an empty string — Number('') is 0, a falsy-but-valid-looking limit"],
      ['1e3', 'scientific notation — Number() coerces it to 1000'],
      ['0x10', 'hex — Number() coerces it to 16'],
    ])('--limit %j (%s)', (v) => {
      expect(() => parseArgs(['--limit', v])).toThrow(/--limit expects an integer/);
    });

    it('still accepts a plain integer', () => {
      expect(parseArgs(['--limit', '50']).limit).toBe(50);
    });
  });

  // ⚠️ Coordinator finding B — argparse accepts `--flag=value`; the hand-rolled
  // parser originally only accepted `--flag value` (two argv elements), which
  // silently breaks any runbook or muscle memory using the `=` form.
  describe('accepts --flag=value for every value-taking flag', () => {
    it('--db=value', () => {
      expect(parseArgs(['--db=/tmp/x.db']).db).toBe('/tmp/x.db');
    });

    it('--bin-data=value', () => {
      expect(parseArgs(['--bin-data=/tmp/y.csv']).binData).toBe('/tmp/y.csv');
    });

    it('--limit=value', () => {
      expect(parseArgs(['--limit=50']).limit).toBe(50);
    });

    it('still validates the value on the = form', () => {
      expect(() => parseArgs(['--limit=abc'])).toThrow(/--limit expects an integer/);
    });

    it('does not resolve an abbreviated flag (deliberate non-support, coordinator finding C)', () => {
      // argparse would resolve --lim to --limit when unambiguous; this parser
      // treats it as an unrecognised flag on purpose (see the comment in
      // fetch-bin-inflections.js's parseArgs).
      expect(() => parseArgs(['--lim', '50'])).toThrow(/unrecognised/i);
    });
  });
});

describe('parseArgs — the B4b-0b additions', () => {
  it('accepts --report as a path', () => {
    expect(parseArgs(['--report', '/tmp/r.json']).report).toBe('/tmp/r.json');
  });

  it('accepts --report=path too', () => {
    expect(parseArgs(['--report=/tmp/r.json']).report).toBe('/tmp/r.json');
  });

  it('refuses --report with no value, like every other value flag', () => {
    expect(() => parseArgs(['--report', '--execute'])).toThrow(/expects a value/i);
  });

  it('defaults report to null', () => {
    expect(parseArgs([]).report).toBeNull();
  });

  // --limit's UNIT changed in B4b-0b (rows -> distinct strings); its parsing
  // strictness must not. That strictness is B4b-0a's reviewed fix for a NaN
  // limit silently dropping the bound and processing every row.
  it('still rejects a non-integer --limit', () => {
    expect(() => parseArgs(['--limit', '3.7'])).toThrow(/--limit expects an integer/);
  });
});

describe('candidateSql', () => {
  it('targets concept_term, not the old terminology tables', () => {
    const sql = candidateSql({ force: false });
    expect(sql).toMatch(/FROM concept_term/);
    expect(sql).not.toMatch(/terminology_translations/);
  });

  it('selects only Icelandic terms', () => {
    expect(candidateSql({ force: false })).toMatch(/lang\s*=\s*'is'/);
  });

  it("excludes already-populated rows by default — D5's one-way fill", () => {
    expect(candidateSql({ force: false })).toMatch(/inflections IS NULL/);
  });

  it('--force drops the IS NULL guard', () => {
    expect(candidateSql({ force: true })).not.toMatch(/inflections IS NULL/);
  });

  it('skips multi-word strings — BÍN handles single words', () => {
    for (const force of [true, false]) {
      expect(candidateSql({ force })).toContain("NOT LIKE '% %'");
    }
  });

  // ⚠️ --limit bounds STRINGS in main(), never rows in SQL. A row-level LIMIT
  // splits a string's rows across the boundary and leaves the corpus with one
  // row of that string populated and another not — which the bucket tripwire
  // cannot see, because it counts only the rows the run fetched.
  it('never emits a LIMIT clause — the bound is applied per string in main()', () => {
    expect(candidateSql({ force: false })).not.toMatch(/LIMIT/);
  });

  it('orders by ct.id so the string grouping is deterministic', () => {
    expect(candidateSql({ force: false })).toContain('ORDER BY ct.id');
  });
});

// ⚠️ INVENTED ROWS. `zafl` is not an Icelandic word and the ids are not BÍN's —
// §C41 forbids committing BÍN bytes, test fixtures included.
// SHsnid layout: lemma;binId;wordClass;register;form;tag
const CSV_ROWS = [
  'zafl;9001;kk;alm;zafl;NFET',
  'zafl;9001;kk;alm;zafli;THGFET',
  'zafl;9002;hk;alm;zafl;NFET',
  'zafl;9002;hk;alm;zafls;EFET',
  'zhverfa;9101;kvk;alm;zhverfa;NFET',
  'zhverfa;9101;kvk;alm;zhverfu;THGFET',
  'zhverfa;9102;so;alm;zhorfinn;LHTHT',
  'zsolo;9201;kvk;alm;zsolo;NFET',
  'zsolo;9201;kvk;alm;zsolu;THGFET',
  'zflat;9301;hk;alm;zflat;NFET',
];

function writeCsv() {
  const p = path.join(os.tmpdir(), `bin-cli-${Math.random().toString(36).slice(2)}.csv`);
  fs.writeFileSync(p, CSV_ROWS.join('\n') + '\n', 'utf-8');
  return p;
}

/** One concept per term, so the string->row fan-out is controllable per test. */
function seedTerm(db, text, domain = 'chemistry') {
  const c = db.prepare("INSERT INTO concept (domain, collection) VALUES (?, 'test')").run(domain);
  db.prepare(
    "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'is', ?, 1, 'test')"
  ).run(c.lastInsertRowid, text);
  return c.lastInsertRowid;
}

describe('fetch-bin-inflections main()', () => {
  let db, dbPath, csv;
  beforeEach(() => {
    const built = freshMigratedDb();
    db = built.db;
    dbPath = built.path;
    csv = writeCsv();
  });

  const run = (extra = []) => main(['--db', dbPath, '--bin-data', csv, ...extra]);
  const inflOf = (t) =>
    db.prepare('SELECT inflections FROM concept_term WHERE text = ?').get(t).inflections;

  it('writes nothing without --execute', async () => {
    seedTerm(db, 'zsolo');
    await run();
    expect(inflOf('zsolo')).toBeNull();
  });

  it('writes the paradigm of an unambiguous term with --execute', async () => {
    seedTerm(db, 'zsolo');
    await run(['--execute']);
    expect(JSON.parse(inflOf('zsolo'))).toEqual(['zsolu']);
  });

  // ⚠️ D4's ANCHOR at the CLI level — the `afl` case, kk + hk.
  it('REFUSES an ambiguous term and names its contending entries', async () => {
    seedTerm(db, 'zafl');
    const rep = await run(['--execute']);
    expect(inflOf('zafl')).toBeNull();
    const r = rep.refusals.find((x) => x.text === 'zafl');
    expect(r.entries.map((e) => e.wordClass).sort()).toEqual(['hk', 'kk']);
  });

  // ⚠️ D4.2's ANCHOR, asserted BY IDENTITY rather than by count: the verb
  // participle must not be in there. A length assertion would pass on the wrong
  // paradigm of the right size.
  it('RESCUES the sole noun and writes ONLY its forms', async () => {
    seedTerm(db, 'zhverfa');
    const rep = await run(['--execute']);
    const v = JSON.parse(inflOf('zhverfa'));
    expect(v).toEqual(['zhverfu']);
    expect(v).not.toContain('zhorfinn');
    expect(rep.rescues.find((x) => x.text === 'zhverfa').discarded[0].wordClass).toBe('so');
  });

  // ⚠️ The bucket the port could not express: getInflections returned null both
  // for "absent from BÍN" and for "present, but nothing survives the base-form
  // filter". Folded together the tripwire still balances, so the loss is silent.
  it('buckets a BÍN word with no non-base form separately from an absent one', async () => {
    seedTerm(db, 'zflat');
    seedTerm(db, 'zabsent');
    const rep = await run();
    expect(rep.strings.baseFormOnly).toBe(1);
    expect(rep.strings.notInBin).toBe(1);
  });

  // ⚠️ THE COUNTING UNIT, made concrete. concept_term is keyed (concept_id,
  // lang, text): one lookup, many writes.
  it('writes one lookup to EVERY row sharing the string', async () => {
    seedTerm(db, 'zsolo', 'chemistry');
    seedTerm(db, 'zsolo', 'biology');
    const rep = await run(['--execute']);
    expect(rep.strings.unambiguous).toBe(1);
    expect(rep.rows.written).toBe(2);
    expect(
      db
        .prepare(
          "SELECT COUNT(*) c FROM concept_term WHERE text='zsolo' AND inflections IS NOT NULL"
        )
        .get().c
    ).toBe(2);
  });

  it('reports multi-word strings as skipped rather than dropping them silently', async () => {
    seedTerm(db, 'zsolo');
    seedTerm(db, 'zafl zsolo');
    const rep = await run();
    expect(rep.rows.multiWordSkipped).toBe(1);
  });

  // ⚠️ Assert the PARTITION, never a total that equals the fixture's row count —
  // that passes for the wrong reason the moment the fixture changes.
  it('every string lands in exactly one bucket', async () => {
    ['zsolo', 'zafl', 'zhverfa', 'zflat', 'zabsent'].forEach((t) => seedTerm(db, t));
    const s = (await run()).strings;
    expect(
      s.unambiguous +
        s.rescuedNominal +
        s.refusedAmbiguous +
        s.refusedNoNoun +
        s.baseFormOnly +
        s.notInBin
    ).toBe(s.total);
  });

  // ⚠️ BOTH units, because they fail differently: a string mis-bucketed breaks
  // the string partition; a row written twice or skipped breaks only the row one.
  it('every row lands in exactly one bucket', async () => {
    ['zsolo', 'zafl', 'zhverfa', 'zflat', 'zabsent'].forEach((t) => seedTerm(db, t));
    const r = (await run(['--execute'])).rows;
    expect(r.written + r.refused + r.baseFormOnly + r.notInBin).toBe(r.total);
  });

  // D5: idempotency MEASURED, not inferred.
  it('a re-run writes 0 rows, and the before/after counts prove it', async () => {
    seedTerm(db, 'zsolo');
    seedTerm(db, 'zafl');
    await run(['--execute']);
    const rep = await run(['--execute']);
    expect(rep.rows.written).toBe(0);
    expect(rep.rows.alreadyPopulatedBefore).toBe(1);
    expect(rep.rows.alreadyPopulatedAfter).toBe(1);
  });

  // ⚠️ --force IS THE ONE EXCEPTION, AND IT MUST ACTUALLY WORK. --force drops
  // `inflections IS NULL` from the candidate query; if the UPDATE keeps it, the
  // run selects every row, writes none, and reports written: 0 with a full
  // candidate count — a flag parsed but never read, which CLAUDE.md names as a
  // durable trap. The row partition still balances in that state, so no other
  // assertion here would catch it.
  it('--force DOES overwrite an existing paradigm', async () => {
    seedTerm(db, 'zsolo');
    db.prepare(`UPDATE concept_term SET inflections = '["stale"]' WHERE text='zsolo'`).run();
    const rep = await run(['--execute', '--force']);
    expect(JSON.parse(inflOf('zsolo'))).toEqual(['zsolu']);
    expect(rep.rows.written).toBe(1);
  });

  it('never clobbers a non-null value', async () => {
    seedTerm(db, 'zsolo');
    db.prepare(`UPDATE concept_term SET inflections = '["hand-written"]' WHERE text='zsolo'`).run();
    await run(['--execute']);
    expect(inflOf('zsolo')).toBe('["hand-written"]');
  });

  // B0's rule: a zero-yield run is REFUSED, not printed. The DEFAULT --db is
  // resolveDbPath(), which on a dev box has no concept model at all.
  it('REFUSES a run with no candidates AND nothing populated', async () => {
    await expect(run()).rejects.toThrow(/no candidate/i);
  });

  // ⚠️ THE OTHER HALF, and the one that is easy to get wrong: a fully-populated
  // corpus ALSO yields zero candidates. That is D5's no-op, not an empty
  // database, and alreadyPopulatedBefore is the discriminator. Without this the
  // corpus gate's idempotency check goes red on a correct implementation.
  it('does NOT refuse when there are no candidates because everything is populated', async () => {
    seedTerm(db, 'zsolo');
    await run(['--execute']);
    const rep = await run(['--execute']);
    expect(rep.rows.written).toBe(0);
    expect(rep.rows.alreadyPopulatedBefore).toBe(1);
  });

  // ⚠️ --limit takes WHOLE strings. The failure it prevents is a string with one
  // row populated and another not — invisible to the bucket tripwire.
  it('--limit never half-populates a string', async () => {
    seedTerm(db, 'zsolo', 'chemistry');
    seedTerm(db, 'zsolo', 'biology');
    seedTerm(db, 'zflat');
    const rep = await run(['--execute', '--limit', '1']);
    const populated = db
      .prepare("SELECT COUNT(*) c FROM concept_term WHERE text='zsolo' AND inflections IS NOT NULL")
      .get().c;
    expect([0, 2]).toContain(populated);
    expect(rep.strings.total).toBe(1);
  });

  it('--report writes the full lists to a file', async () => {
    seedTerm(db, 'zafl');
    seedTerm(db, 'zsolo');
    const out = path.join(os.tmpdir(), `rep-${Math.random().toString(36).slice(2)}.json`);
    await run(['--report', out]);
    const j = JSON.parse(fs.readFileSync(out, 'utf-8'));
    expect(j.refusals.find((r) => r.text === 'zafl').entries).toHaveLength(2);
  });

  // 🔴 §C41 / D6: the report carries BÍN ids and word classes; it must NEVER
  // carry forms. A committed paradigm is the licence breach neither export gate
  // would catch.
  it('the report carries no BÍN forms', async () => {
    seedTerm(db, 'zhverfa');
    const out = path.join(os.tmpdir(), `rep-${Math.random().toString(36).slice(2)}.json`);
    await run(['--report', out]);
    expect(fs.readFileSync(out, 'utf-8')).not.toContain('zhverfu');
  });
});
