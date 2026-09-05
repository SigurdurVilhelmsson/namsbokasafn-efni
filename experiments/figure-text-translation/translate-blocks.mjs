/**
 * Send a figure's prose blocks to Málstaður and record the result.
 *
 * One request per BLOCK, not one joined request: a block is the semantic unit
 * (a label, not a line), and a joined payload would have to be split back out of
 * the response — which §C118 measured the model restructuring. Per-block costs
 * the same in characters, since billing is by character.
 *
 *   node translate-blocks.mjs --book <slug> [--dry-run] [--no-glossary]
 *
 * 🔴 `--book` IS REQUIRED, AND THE REFUSAL IS THE POINT. This is the figure
 * track's gate 1: the leg used to send `glossary: null` unconditionally, so a
 * [USER] terminology ruling reached prose and never reached figures. A warning
 * printed into a bulk run's scroll is a detector firing into a log, not a gate
 * (CLAUDE.md), so a run that cannot load a glossary REFUSES rather than quietly
 * paying for hundreds of figures that carry the term the project ruled against.
 * `--no-glossary` is the separate acknowledgement — the `--force`/`--adopt`
 * idiom already on `main` — and it has a real use: item ⑯ was sent bare on
 * purpose, because §C73's control is what the model does UNPROMPTED.
 *
 * ⚠️ THE GATE IS NECESSARY, NOT SUFFICIENT. It proves a glossary rode the wire;
 * it cannot prove that glossary carries any particular ruling. That is a data
 * state reached by: the ruling's PR merges → deploy (051 asserts it at boot) →
 * the 2-hourly export cron rewrites `glossary-unified.json` → that commit is
 * pulled. The register carries the checkable predicate.
 *
 * 🔴 IMPORTING THIS FILE USED TO SPEND MONEY. Every top-level statement ran at
 * import — including the paid translate loop — so merely importing the module
 * from a test made 8 live requests and overwrote `out/`. Measured 2026-09-05:
 * 8 requests, 120 chars, 1.20 ISK, from a test that asserted nothing yet. The
 * CLI body now sits behind the `process.argv[1] === fileURLToPath(...)` guard
 * that `api-translate.js` uses, and `.env` is read inside it, so the module is
 * import-safe and its wiring is testable with a stub client and no network.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  loadGlossary,
  filterGlossaryForText,
  glossaryStatusLine,
} from '../../tools/api-translate.js';
import { bookToDomain } from '../../tools/lib/book-rendering-config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

/** Every flag this tool accepts. An argv token outside it is a typo, not a no-op. */
const KNOWN_FLAGS = new Set(['--book', '--dry-run', '--no-glossary']);

/**
 * Parse argv, REFUSING anything unrecognised.
 *
 * `tools/lib/parseArgs.js` silently drops unknown flags (CLAUDE.md), and a
 * hand-rolled `argv.includes` is the same trap one level down: `--bok` would
 * leave `book` unset and the run would send bare — walking straight through the
 * gate this file exists to hold.
 *
 * @param {string[]} argv  arguments only, without node/script
 * @returns {{ok: true, book: string|null, dryRun: boolean, noGlossary: boolean}
 *           | {ok: false, message: string}}
 */
export function parseFigureArgs(argv) {
  const out = { ok: true, book: null, dryRun: false, noGlossary: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!KNOWN_FLAGS.has(arg)) {
      return {
        ok: false,
        message: `Unknown argument: ${arg}\nKnown: ${[...KNOWN_FLAGS].join(' ')}`,
      };
    }
    if (arg === '--book') out.book = argv[++i] ?? null;
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--no-glossary') out.noGlossary = true;
  }
  return out;
}

/**
 * Load the book's glossary, or refuse the run.
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
 * The figure this run is for, read from what the extractor left in `out/`.
 *
 * Derived rather than hardcoded: `out/` holds whichever figure was extracted
 * LAST, and a literal in the record goes stale the moment a second figure runs.
 * This is the same stem `publish-figure-svg.js` cross-checks the sidecar
 * against, so both stages name the figure from one place.
 */
export function figureNameFrom(metaPath) {
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  return path.basename(meta.source, path.extname(meta.source));
}

async function main() {
  const args = parseFigureArgs(process.argv.slice(2));
  if (!args.ok) {
    console.error(`  ✗ ${args.message}`);
    process.exitCode = 2;
    return;
  }

  const resolved = resolveGlossaryOrRefuse({ book: args.book, noGlossary: args.noGlossary });
  if (!resolved.ok) {
    console.error(`  ✗ REFUSED (${resolved.code}): ${resolved.message}`);
    process.exitCode = 2;
    return;
  }

  const blocks = JSON.parse(fs.readFileSync(path.join(HERE, 'out/blocks.json'), 'utf-8'));
  const send = blocks.filter((b) => b.send);
  const chars = send.reduce((n, b) => n + b.english.length, 0);

  // .env is not auto-loaded by node. Read it here, not at import: this file is
  // imported by its test, and a module that reads secrets at import cannot be.
  for (const line of fs.readFileSync(path.join(REPO, '.env'), 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
  const { createClient, estimateIsk } = await import(path.join(REPO, 'tools/lib/malstadur-api.js'));

  // The glossary line is part of the PLAN, so --dry-run shows it: the operator
  // decides whether to spend while looking at what would ride the wire.
  console.log(`  ${send.length} blocks, ${chars} chars, est ${estimateIsk(chars).toFixed(2)} ISK`);
  console.log(
    args.noGlossary
      ? '  glossary: NONE — bare run, acknowledged with --no-glossary'
      : `  ${glossaryStatusLine(resolved.glossary, resolved.skippedCount, resolved.omittedCount)}`
  );
  if (args.dryRun) {
    console.log('  --dry-run: nothing sent.');
    return;
  }

  const client = createClient();
  const out = {};
  const log = [];
  for (const b of send) {
    const t0 = Date.now();
    const opts = translateOptsFor(resolved.glossary, b.english);
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
  const glossaryRecord = args.noGlossary
    ? null
    : {
        book: args.book,
        terms: resolved.termCount,
        blocksSteered: log.filter((l) => l.glossarySent).length,
      };
  fs.writeFileSync(
    path.join(HERE, 'out/api-run.json'),
    JSON.stringify(
      {
        figure: figureNameFrom(path.join(HERE, 'out/meta.json')),
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
    path.join(HERE, 'out/translations-api.json'),
    JSON.stringify(
      {
        _source: glossaryRecord
          ? `Málstaður /v1/translate, glossary ${args.book} (${resolved.termCount} terms)`
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
  await main();
}
