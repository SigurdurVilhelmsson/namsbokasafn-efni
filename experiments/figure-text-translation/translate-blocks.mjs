/**
 * Send a figure's prose blocks to Málstaður and record the result.
 *
 * One request per DISTINCT BLOCK KEY, not one joined request: a block is the
 * semantic unit (a label, not a line), and a joined payload would have to be
 * split back out of the response — which §C118 measured the model restructuring.
 * Per-block costs the same in characters as a joined payload, since billing is by
 * character.
 *
 * 🔴 "DISTINCT" IS LOAD-BEARING AND WAS NOT ALWAYS TRUE. `blocks.json` carries the
 * same key more than once whenever a figure repeats a label — `compose.py` DRAWS
 * both, which is ruling R-13 — and this loop used to issue one BILLED request per
 * OCCURRENCE while `out[b.key]` kept only the last. Every extra request was paid
 * for and discarded before it could be written anywhere. Measured over chemistry
 * ch03/05/06/07 (265 figures prepared, 102 with sendable text): 446 send
 * occurrences over 426 distinct keys — 20 requests, 238 characters, 2.38 ISK
 * bought for nothing, on 9 of the 102 figures; ch04 measured 11.0% of its
 * requests. The multiplicity STAYS in `blocks.json` and in the composer, which is
 * what R-13 rules; it is the WIRE that is content-keyed. See `dedupeSendBlocks`.
 *
 *   node translate-blocks.mjs --book <slug> [--out <dir>] [--dry-run] [--no-glossary]
 *
 * 🔴 GATE 1 IS INVERTED: THIS LEG SENDS NO GLOSSARY, EVER. [USER] 2026-09-06,
 * on §C133's measurement that the glossary buys no terminology consistency —
 * 44.2 / 44.6 / 44.4% across three runs, inside the measure's own noise floor.
 * The case is STRONGER for figures than for prose: figure text is labels and
 * captions — short, fragmentary, often a single noun — which is exactly where a
 * flat context-free map does its worst work, because there is no sentence to
 * disambiguate against. And a wrong label is baked into an IMAGE, not editable
 * in the segment editor the way a prose segment is.
 *
 * This REPLACES the gate that used to live here ("send the glossary, or
 * refuse"). It is inverted rather than DELETED: deleting it would leave the
 * paid figure leg ungated, and this project has lost a guard that way before.
 * What remains is a PRE-FLIGHT INVARIANT — every block's wire options are built
 * before the first paid request, and the run refuses outright if any of them
 * carries `glossaries`. See `glossarySteeredBlocks`.
 *
 * ⚠️ `--book` IS STILL REQUIRED, and it no longer selects anything. It names
 * the run in `api-run.json`, and keeping it mandatory keeps a driver's
 * per-figure spawn self-describing. `--no-glossary` is now a no-op kept for
 * callers that still pass it — retiring it would make it an UNKNOWN flag, i.e.
 * exit 2, and the reject-unknown rule exists for typos, not for retired flags.
 *
 * ⚠️ WHAT THIS CANNOT DO IS MAKE THE GLOSSARY REACH FIGURES BY ANOTHER ROUTE.
 * A [USER] terminology ruling now reaches figure text only through an editor,
 * which is what `docs/plans/2026-09-06-editor-terminology-assistant.md` is for.
 *
 * 🔴 IMPORTING THIS FILE USED TO SPEND MONEY. Every top-level statement ran at
 * import — including the paid translate loop — so merely importing the module
 * from a test made 8 live requests and overwrote `out/`. Measured 2026-09-05:
 * 8 requests, 120 chars, 1.20 ISK, from a test that asserted nothing yet. The
 * CLI body now sits behind the `process.argv[1] === fileURLToPath(...)` guard
 * that `api-translate.js` uses, and `.env` is read inside it, so the module is
 * import-safe and its wiring is testable with a stub client and no network.
 *
 * ⚠️ THAT LAST CLAUSE WAS TRUE ONLY OF THE PURE EXPORTS. `main` was not
 * exported and minted its own client, so the WRITE path — the half `--out`
 * changes — had no stub anywhere. `main` now takes its API module as a
 * PARAMETER; see its docstring for why a module mock could not do the job.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadGlossary, filterGlossaryForText, loadEnvFile } from '../../tools/api-translate.js';
import { bookToDomain } from '../../tools/lib/book-rendering-config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

/** Every flag this tool accepts. An argv token outside it is a typo, not a no-op. */
const KNOWN_FLAGS = new Set(['--book', '--out', '--dry-run', '--no-glossary']);

/**
 * The flags that take a value. Kept as its own set so the missing-value check
 * below is a property of the flag, not a branch somebody has to remember to add.
 */
const VALUED_FLAGS = new Set(['--book', '--out']);

/**
 * Parse argv, REFUSING anything unrecognised.
 *
 * `tools/lib/parseArgs.js` silently drops unknown flags (CLAUDE.md), and a
 * hand-rolled `argv.includes` is the same trap one level down: `--bok` would
 * leave `book` unset, and the run record would then name no book at all while
 * still spending money. (Before the gate inverted, the same typo walked the run
 * straight past a glossary check; the trap outlived the check.)
 *
 * ⚠️ A VALUED FLAG WHOSE VALUE IS MISSING IS ALSO A REFUSAL. `--book --dry-run`
 * used to parse as `{book: '--dry-run', dryRun: FALSE}` — the operator asked for
 * a dry run and would have got a PAID one, the safety flag eaten by the slug.
 * That is the same silent-no-op class one argument along.
 *
 * @param {string[]} argv  arguments only, without node/script
 * @returns {{ok: true, book: string|null, out: string|null, dryRun: boolean,
 *            noGlossary: boolean}
 *           | {ok: false, message: string}}
 */
export function parseFigureArgs(argv) {
  const parsed = { ok: true, book: null, out: null, dryRun: false, noGlossary: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!KNOWN_FLAGS.has(arg)) {
      return {
        ok: false,
        message: `Unknown argument: ${arg}\nKnown: ${[...KNOWN_FLAGS].join(' ')}`,
      };
    }
    if (VALUED_FLAGS.has(arg)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        return {
          ok: false,
          message: `${arg} needs a value, and got ${value === undefined ? 'nothing' : `\`${value}\``}.`,
        };
      }
      i++;
      if (arg === '--book') parsed.book = value;
      else parsed.out = value;
    } else if (arg === '--dry-run') parsed.dryRun = true;
    else if (arg === '--no-glossary') parsed.noGlossary = true;
  }
  return parsed;
}

/**
 * Load the book's glossary, or refuse the run.
 *
 * 🔴 NO LONGER CALLED BY `main` — GATE 1 INVERTED (see the file header). Kept,
 * unmodified, because it is the whole of a `--with-glossary` escape hatch
 * should one ever be wanted, and because its three refusal CODES are a
 * worked distinction worth not re-deriving. ⚠️ Consequence to state plainly:
 * `no-book`, `no-glossary-file` and `glossary-unusable` are now unreachable
 * from the CLI, and are held alive only by this function's own unit tests.
 *
 * ⚠️ THE TWO REFUSAL CODES ARE DELIBERATELY DISTINCT. `loadGlossary` returns
 * `null` both when the file is absent and when it loads to zero usable terms,
 * and its own comment notes that callers render the two identically. They are
 * not the same finding: one is an operator/setup error, the other says the
 * book's glossary is wholly malformed or wholly contested — a data defect that
 * a second `--book` attempt will not fix.
 *
 * @param {{book: string|null, noGlossary?: boolean, booksDir?: string}} opts
 * @returns {{ok: true, glossary: object|null, termCount: number}
 *           | {ok: false, code: string, message: string}}
 */
export function resolveGlossaryOrRefuse({ book, noGlossary = false, booksDir } = {}) {
  if (noGlossary) return { ok: true, glossary: null, termCount: 0 };

  if (!book) {
    return {
      ok: false,
      code: 'no-book',
      message:
        'No --book given, so no glossary can be loaded and the run would send bare.\n' +
        'Pass --book <slug>, or --no-glossary to send bare deliberately (the §C73 control).',
    };
  }

  const glossaryDir = path.join(booksDir ?? path.join(REPO, 'books'), book, 'glossary');
  if (!fs.existsSync(path.join(glossaryDir, 'glossary-unified.json'))) {
    return {
      ok: false,
      code: 'no-glossary-file',
      message: `No glossary-unified.json in ${glossaryDir}. Is --book ${book} the right slug?`,
    };
  }

  let skippedCount = 0;
  let omittedCount = 0;
  const glossary = loadGlossary(glossaryDir, bookToDomain(book), {
    onSkipped: (dropped) => {
      skippedCount = dropped.length;
    },
    onOmitted: (report) => {
      omittedCount = report.omitted.length;
    },
  });

  if (!glossary) {
    return {
      ok: false,
      code: 'glossary-unusable',
      message:
        `${book}'s glossary loaded to ZERO usable terms ` +
        `(${skippedCount} malformed, ${omittedCount} contested). The file exists; its ` +
        'content is the defect. Fix the concept model, not this command.',
    };
  }
  return { ok: true, glossary, termCount: glossary.terms.length, skippedCount, omittedCount };
}

/**
 * The per-block translate options — the only thing that decides what rides the
 * wire for this block.
 *
 * Filtering per block rather than sending the whole glossary mirrors
 * `translateChunk`: a figure label is a handful of words, and §C116's
 * short-headword rule is applied inside `filterGlossaryForText`, so this gets
 * the case-sensitive word-boundary treatment for free.
 *
 * ⚠️ The field is OMITTED, never sent empty — matching `translateChunk`.
 *
 * @param {object|null} glossary  API-formatted glossary, or null for a bare run
 * @param {string} english
 * @returns {{targetLanguage: string, glossaries?: Array<object>}}
 */
export function translateOptsFor(glossary, english) {
  const opts = { targetLanguage: 'is' };
  const filtered = filterGlossaryForText(glossary, english);
  if (filtered) opts.glossaries = [filtered];
  return opts;
}

/**
 * The blocks whose wire options would carry a glossary — the pre-flight
 * invariant's predicate.
 *
 * 🔴 EXPORTED BECAUSE ITS BRANCH IN `main` IS UNREACHABLE AT HEAD. `main` builds
 * every block's options from a null glossary, so the refusal below it cannot
 * fire, and a gate that cannot fire is a gate that does not exist (CLAUDE.md).
 * Pinning the predicate against a plan that DOES carry a glossary is what keeps
 * it a real assertion: the test proves it can SEE one, so an empty result on the
 * real path means "none present" rather than "this instrument is blind".
 *
 * ⚠️ Returns the offending KEYS, not a boolean: if this ever fires, the operator
 * needs to know which blocks leaked, and a count cannot say.
 *
 * @param {Array<{block: {key: string}, opts: object}>} wire  one entry per block
 *        that would be sent, each holding the exact opts destined for the API
 * @returns {string[]} the offending blocks' keys, in send order
 */
export function glossarySteeredBlocks(wire) {
  return wire.filter((w) => Boolean(w.opts.glossaries)).map((w) => w.block.key);
}

/**
 * One entry per DISTINCT block key — what the wire buys, out of what the read
 * layer emitted.
 *
 * 🔴 THE MULTIPLICITY IS CORRECT WHERE IT LIVES AND WRONG ON THE WIRE. A figure
 * that repeats a label carries that key twice in `blocks.json`, and `compose.py`
 * DRAWS both — ruling R-13, which is why nothing here touches `blocks.json`,
 * `figure-prepare.py`'s counts or `figure-compose.py`'s multiset check. But the
 * translation is looked up BY KEY (`TR[key]` at draw time, `out[b.key]` here), so
 * a second request for a key already bought is money spent on an answer that has
 * nowhere to go.
 *
 * 🔴 THE SURVIVOR IS THE **LAST** TWIN, NOT THE FIRST, AND THAT IS DELIBERATE.
 * `out[b.key] = …` was already last-write-wins, so keeping the last occurrence
 * makes "the files this tool writes are unchanged" true BY CONSTRUCTION instead
 * of by measurement. The two choices are not equivalent: `blockkey.block_key`
 * joins an ARC block's runs bare and a non-arc block's lines with '|', so a
 * one-line block `NaCl` and an arc block spelling N-a-C-l collide on `key` AND on
 * `english` while differing in `arc` — and `arc` is the whole of what reaches the
 * written value. A keep-first dedupe would quietly write `["…"]` where this tool
 * has always written `"…"`. Unobserved in 265 prepared figures, and pinned in
 * `figure-mt-duplicate-keys.test.js` precisely because a rare shape that no
 * measurement covers is exactly what a test is for.
 *
 * ⚠️ A `Map` keyed on the block key gives both halves at once: an existing key
 * keeps its FIRST insertion position and takes the LAST value, so the request
 * order is the order the blocks were emitted in while the surviving record is the
 * one whose translation would have been kept anyway.
 *
 * @param {Array<{key: string}>} send  the `send:true` blocks, in emit order
 * @returns {Array<{key: string}>} one block per key, first-occurrence order
 */
export function dedupeSendBlocks(send) {
  const byKey = new Map();
  for (const b of send) byKey.set(b.key, b);
  return [...byKey.values()];
}

/**
 * The figure this run is for, read from the `meta.json` the extractor left in
 * this run's output directory.
 *
 * Derived rather than hardcoded: the DEFAULT output directory holds whichever
 * figure was extracted LAST, and a literal in the record goes stale the moment a
 * second figure runs. (Under `--out` there is one directory per figure, which is
 * what makes a chapter-wide run possible at all.)
 * This is the same stem `publish-figure-svg.js` cross-checks the sidecar
 * against, so both stages name the figure from one place.
 */
export function figureNameFrom(metaPath) {
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  return path.basename(meta.source, path.extname(meta.source));
}

/**
 * Run the paid stage.
 *
 * 🔴 THE API MODULE IS A PARAMETER, NOT A MODULE MOCK. The real load is a
 * dynamic `import()` of a COMPUTED ABSOLUTE PATH, which `vi.mock` cannot reach,
 * so without this seam every test of the write path would have to spawn the tool
 * — against the live, billed API. Injection is what keeps the isolation test
 * free.
 *
 * ⚠️ A HALF injection is refused rather than filled in: supplying only
 * `estimateIsk` would silently fall back to the real `createClient`, i.e. a test
 * that believes it is stubbed spends money. Both or neither.
 *
 * `envPath` exists for the same reason: on a developer box `.env` is present, so
 * a test asserting "a missing `.env` is survivable" passes there whatever the
 * code does.
 *
 * 🔴 NO GLOSSARY IS LOADED HERE, BY DESIGN — see the file header. The three
 * sites that record what happened (the status line, `api-run.json`'s `glossary`
 * and `translations-api.json`'s `_source`) are keyed on the OUTCOME, never on
 * `args.noGlossary`. That was not cosmetic: keyed on the flag, a default
 * `--book efnafraedi-2e` run stamped `glossary efnafraedi-2e (N terms)` on a run
 * that sent nothing — a durable record lying about its own provenance, which is
 * worse than no record. The convention is the one `glossarySent` already states
 * in the loop below.
 *
 * @param {string[]} argv  arguments only, without node/script
 * @param {{createClient?: Function, estimateIsk?: Function, envPath?: string}} [deps]
 *        `envPath` defaults to `<repo>/.env`; the API pair to the real module.
 */
export async function main(argv, { createClient, estimateIsk, envPath } = {}) {
  if (Boolean(createClient) !== Boolean(estimateIsk)) {
    throw new TypeError('main: inject both createClient and estimateIsk, or neither');
  }
  const args = parseFigureArgs(argv);
  if (!args.ok) {
    console.error(`  ✗ ${args.message}`);
    process.exitCode = 2;
    return;
  }

  // `--book` survives the inversion as a REQUIREMENT even though nothing now
  // selects on it: it is what names the run in `api-run.json`, and a driver that
  // could forget it would produce a pile of records naming no book. Checked here
  // rather than via `resolveGlossaryOrRefuse`, which `main` no longer calls.
  if (!args.book) {
    console.error(
      '  ✗ REFUSED (no-book): No --book given, so the run record would name no book.\n' +
        'The figure leg sends no glossary either way ([USER] 2026-09-06); the slug is provenance.\n' +
        'Pass --book <slug>.'
    );
    process.exitCode = 2;
    return;
  }

  // One figure, one directory. `HERE/out` is the default because the single-
  // figure exploratory runs that built this tool use it; a chapter-wide run MUST
  // pass --out, or every figure translates from whichever was extracted last.
  // `path.resolve` because a relative --out is relative to the operator's cwd,
  // not to this file — the one place cwd is what the user meant.
  const outDir = args.out ? path.resolve(args.out) : path.join(HERE, 'out');

  const blocks = JSON.parse(fs.readFileSync(path.join(outDir, 'blocks.json'), 'utf-8'));
  // One request per DISTINCT key — see `dedupeSendBlocks`. Deduped HERE rather than at
  // the loop so that the plan line, the pre-flight invariant and the billed requests are
  // all derived from one list; a plan that quotes a cost the run does not spend is the
  // provenance defect gate 1's inversion already had to fix once.
  //
  // ⚠️ SO THIS `chars` READS LOWER THAN `prepare.json`'s ON A FIGURE THAT REPEATS A
  // LABEL, and `tools/figure-run.js` records THAT one as `rec.chars`. The two are
  // different questions — the read layer counts the characters a figure DRAWS (R-13
  // multiplicity intact), this counts the characters it BUYS — so the difference is the
  // duplicate, not a discrepancy. Do not "reconcile" them by re-counting either side.
  const send = dedupeSendBlocks(blocks.filter((b) => b.send));
  const chars = send.reduce((n, b) => n + b.english.length, 0);

  // 🔴 GATE 1, INVERTED. `null` is not a placeholder for a glossary we failed to
  // load — it is the value `translateOptsFor` needs in order to OMIT the field.
  const glossary = null;

  // PRE-FLIGHT INVARIANT: build every block's wire options up front and refuse
  // the whole run if any of them carries a glossary. Deliberately placed here —
  // before `.env` is read, before the API module is imported, before a client
  // exists — so the refusal cannot happen with a request already in flight.
  // Building the opts once and reusing them below also means the thing asserted
  // on is the same object that rides the wire, not a second computation of it.
  const wire = send.map((b) => ({ block: b, opts: translateOptsFor(glossary, b.english) }));
  const steered = glossarySteeredBlocks(wire);
  if (steered.length > 0) {
    console.error(
      `  ✗ REFUSED (glossary-on-the-figure-wire): ${steered.length} of ${wire.length} ` +
        `blocks would carry a glossary — ${steered.join(', ')}.\n` +
        'The figure MT leg is bare by [USER] ruling 2026-09-06 (§C133). Nothing sent.'
    );
    process.exitCode = 2;
    return;
  }

  // .env is not auto-loaded by node. Read it here, not at import: this file is
  // imported by its test, and a module that reads secrets at import cannot be.
  //
  // ⚠️ `loadEnvFile` RETURNS a vars object and never touches `process.env`, so
  // this is an assignment loop rather than a bare call — a literal "replace the
  // readFileSync with loadEnvFile" would load the file, throw the result away,
  // and drop the API key on the leg that costs money.
  for (const [key, value] of Object.entries(loadEnvFile(envPath ?? path.join(REPO, '.env')))) {
    if (!process.env[key]) process.env[key] = value;
  }
  const api = createClient
    ? { createClient, estimateIsk }
    : await import(path.join(REPO, 'tools/lib/malstadur-api.js'));

  // The glossary line is part of the PLAN, so --dry-run shows it: the operator
  // decides whether to spend while looking at what would ride the wire.
  console.log(
    `  ${send.length} blocks, ${chars} chars, est ${api.estimateIsk(chars).toFixed(2)} ISK`
  );
  // Keyed on the PLAN, not on `args.noGlossary`: the count is derived from the
  // opts that will actually be sent, so this line stays true if a future
  // `--with-glossary` ever reintroduces one.
  console.log(
    `  glossary: NONE — the figure leg is bare by default ` +
      `([USER] 2026-09-06, §C133); ${steered.length} of ${wire.length} blocks steered`
  );
  if (args.noGlossary) {
    console.log(
      '  --no-glossary: accepted, and now redundant — the leg is bare either way. ' +
        'Kept as a no-op so callers that still pass it are not rejected as typos.'
    );
  }
  if (args.dryRun) {
    console.log('  --dry-run: nothing sent.');
    return;
  }

  const client = api.createClient();
  const out = {};
  const log = [];
  for (const { block: b, opts } of wire) {
    const t0 = Date.now();
    const r = await client.translate(b.english, opts);
    const got = (r.text || '').trim();
    // `glossarySent` is an OUTCOME, not the caller's intent: it is false
    // whenever no headword occurs in THIS block's text. Recording intent would
    // make a run look glossary-steered when most of its blocks were not.
    log.push({
      key: b.key,
      en: b.english,
      is: got,
      ms: Date.now() - t0,
      glossarySent: Boolean(opts.glossaries),
    });
    out[b.key] = b.arc ? got : [got]; // composer wraps lines itself
    console.log(`    ${JSON.stringify(b.english).padEnd(28)} -> ${JSON.stringify(got)}`);
  }
  const usage = client.getUsage ? client.getUsage() : client.usage;
  // OUTCOME, not intent — same convention as `glossarySent` above. At HEAD this
  // is always null, because `glossary` is always null; writing it as a
  // derivation rather than a literal is what keeps the record honest if that
  // ever changes.
  const blocksSteered = log.filter((l) => l.glossarySent).length;
  const glossaryRecord = blocksSteered === 0 ? null : { book: args.book, blocksSteered };
  fs.writeFileSync(
    path.join(outDir, 'api-run.json'),
    JSON.stringify(
      {
        figure: figureNameFrom(path.join(outDir, 'meta.json')),
        // The slug used to live inside `glossary`, which is now null on every
        // run — so it is recorded in its own right rather than lost with it.
        book: args.book,
        when: new Date().toISOString(),
        glossary: glossaryRecord,
        blocks: log,
        usage,
      },
      null,
      1
    )
  );
  fs.writeFileSync(
    path.join(outDir, 'translations-api.json'),
    JSON.stringify(
      {
        _source: glossaryRecord
          ? `Málstaður /v1/translate, glossary ${args.book}`
          : 'Málstaður /v1/translate, no glossary',
        blocks: out,
      },
      null,
      1
    )
  );
  console.log('\n  usage:', JSON.stringify(usage));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
