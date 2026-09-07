#!/usr/bin/env node
/**
 * The M5 figure driver — FREE half (Task 6a). It enumerates a chapter's figures, resolves each
 * to its artwork, prepares it, classifies it, and previews what a paid run would do.
 *
 *   node tools/figure-run.js --book <slug> --chapter <N|appendices> [--module m…] [--figure B…] --dry-run
 *
 * 🔴 THIS HALF SPENDS NOTHING AND WRITES NOTHING UNDER `books/`. `--dry-run` is currently
 * MANDATORY: the paid half — spend, mint the sidecar, compose, publish — is Task 6b, and a
 * driver that silently did nothing when asked to run live would be the §C83 failure (a declared
 * flag nothing reads) pointed at money. Every child process goes through ONE injectable
 * `spawn`, tagged by stage, so "translate-blocks.mjs was spawned zero times" is a counter a
 * test can read rather than a claim.
 *
 * WHY A DRY RUN STILL RUNS PYTHON. Classification consumes `figure-prepare.py`'s summary
 * integers, and prepare costs nothing but CPU. Three of the four things this run exists to
 * catch — a prepare that fails, a figure whose text cannot be read, and the identity seam
 * below — are invisible without it.
 *
 * 🔴 THE IDENTITY SEAM IS THE ONE A NAIVE DRY RUN COULD NOT SEE, AND IT IS WHY THE PRE-FLIGHT
 * READS meta.json. `publishFigureSvg` cross-checks `basenameFromMeta(meta.json)` against the
 * sidecar key and refuses `basename-mismatch` — AFTER the figure has been paid for, on every
 * run, for ever. `meta.json` exists the moment prepare returns, so asserting the equality here
 * costs nothing. ▶ A figure's identity is the UNSTRIPPED CNXML basename EVERYWHERE; the
 * `-[0-9a-f]{4}` de-hash below is a LOOKUP-ONLY fallback for finding artwork and must never
 * rename anything.
 *
 * 🔴 THE MIT->AGPL EDGE IS DELIBERATE AND RECORDED. The static import of
 * `server/lib/chapterLabel.js` is a class 2(a) "required, unguarded, at load time" edge; root
 * `LICENSE` lists it. `chapterLabel` is the project's canonical converter between the two
 * on-disk spellings of the appendices chapter, and reimplementing it inline is forbidden:
 * `normalizeChapter` is the PARSER ('appendices' -> -1, '4' -> 4) and `chapterDir` builds the
 * directory name. `Number('appendices')` is NaN and `chapterDir(NaN)` is 'chNaN'.
 * ⚠️ The edge lives HERE and not in `tools/lib/figure-enumerate.cjs`, which the AGPL server
 * requires: `server/` -> `tools/lib` is the permitted direction and the reverse is not, so the
 * enumerator takes the chapter DIRECTORY NAME as a parameter and this file resolves it.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

import { normalizeChapter, chapterDir } from '../server/lib/chapterLabel.js';
import { classifyFigure } from './lib/figure-classify.js';
import { emptyTally, tallyOutcome, verdict, ALL_OUTCOMES } from './lib/figure-outcomes.js';
import { basenameFromMeta } from './publish-figure-svg.js';
import {
  DEFAULT_SUFFIX,
  indexSourceImageBasenames,
  buildMappingEntries,
} from './generate-image-mapping.js';

const require = createRequire(import.meta.url);
const { enumerateChapterImages } = require('./lib/figure-enumerate.cjs');
const { loadImageBasenameMap } = require('./lib/image-basename-map.cjs');
const {
  readSidecar,
  computeRenderHash,
  COMPOSER_VERSION,
} = require('./lib/figure-text-sidecar.cjs');

// Resolved against this file, never process.cwd(): the operator stands wherever they like and
// the Python stages must be started with cwd = the experiment directory (their children spawn
// each other by relative path).
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const EXPERIMENT_DIR = path.join(REPO_ROOT, 'experiments', 'figure-text-translation');
const PYTHON = process.env.FIGTEXT_PYTHON || 'python3';

/** A hashed CNXML basename: `CNX_Chem_03_02_moles-6296`. LOOKUP ONLY — never an identity. */
const HASH_SUFFIX = /-[0-9a-f]{4}$/;

/** Every flag this tool accepts. An argv token outside it is a typo, not a no-op. */
const KNOWN_FLAGS = new Set(['--book', '--chapter', '--module', '--figure', '--dry-run']);

/** Flags that take a value, kept as its own set so the missing-value check is a property of
 *  the flag rather than a branch somebody has to remember to add. */
const VALUED_FLAGS = new Set(['--book', '--chapter', '--module', '--figure']);

/** A usage refusal. Exit 2, the same code `translate-blocks.mjs` and argparse use. */
export class CliError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CliError';
    this.code = 2;
  }
}

/**
 * Parse argv, REFUSING anything unrecognised.
 *
 * `tools/lib/parseArgs.js` silently DROPS unknown flags (CLAUDE.md), which is how a
 * "safe rehearsal into a scratch directory" became a full-strength run over a read-only tree.
 *
 * ⚠️ A VALUED FLAG WHOSE VALUE IS MISSING OR BEGINS WITH `--` IS ALSO A REFUSAL:
 * `--book --dry-run` would otherwise parse as `{book: '--dry-run', dryRun: FALSE}` — the
 * operator asked for a dry run and would have got a paid one, the safety flag eaten by the slug.
 *
 * 🔴 THE RETURNED KEY IS `dryRun`, AND THERE IS NO `'dry-run'` KEY. The plan's own skeleton read
 * `args.dryRun` from a parser that only ever set `args['dry-run']`, so every consumer written
 * that way would have run LIVE.
 *
 * @param {string[]} argv
 * @returns {{book:string, chapter:string, modules:string[]|null, figures:string[]|null, dryRun:boolean}}
 */
export function parseCli(argv) {
  const args = { book: null, chapter: null, modules: null, figures: null, dryRun: false };
  const lists = { '--module': [], '--figure': [] };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!KNOWN_FLAGS.has(token)) {
      throw new CliError(`Unknown argument: ${token}\nKnown: ${[...KNOWN_FLAGS].sort().join(' ')}`);
    }
    if (!VALUED_FLAGS.has(token)) {
      if (token === '--dry-run') args.dryRun = true;
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new CliError(
        `${token} needs a value, and got ${value === undefined ? 'nothing' : JSON.stringify(value)}`
      );
    }
    i += 1;
    // Both list flags are repeatable AND comma-separated: a driver invocation is written by
    // hand, and refusing one of the two spellings buys nothing.
    if (token === '--module' || token === '--figure') {
      lists[token].push(
        ...value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      );
    } else if (token === '--book') {
      args.book = value;
    } else {
      args.chapter = value;
    }
  }

  if (!args.book) throw new CliError('--book is required');
  if (args.chapter === null) throw new CliError('--chapter is required');
  if (lists['--module'].length) args.modules = lists['--module'];
  if (lists['--figure'].length) args.figures = lists['--figure'];
  return args;
}

/**
 * Both of R7's sets for one chapter: every `<image src>` in the CNXML, and which of them the
 * review panel can show. Returns `figure-enumerate.cjs`'s whole result — not a bare array —
 * because the driver needs `unreviewable` by NAME (that gap is what R7 orders it to report) and
 * `structureDirExists` to tell "nothing extracted yet" from "this chapter has no figures".
 *
 * @param {string} bookSlug
 * @param {string|number} chapter any dialect: 4, '4', 'appendices'
 * @param {{modules?: string[]|null}} [opts]
 */
export function enumerateChapterFigures(bookSlug, chapter, opts = {}) {
  const canonical = normalizeChapter(chapter);
  if (canonical === null) {
    throw new CliError(
      `--chapter ${JSON.stringify(String(chapter))} is not a chapter: give a number or the word "appendices"`
    );
  }
  return enumerateChapterImages({
    bookDir: path.join(REPO_ROOT, 'books', bookSlug),
    chapterDir: chapterDir(canonical),
    moduleIds: opts.modules || undefined,
  });
}

/**
 * Is this figure's published artwork out of date with its translations?
 *
 * 🔴 DERIVED FROM THE HASHES, NEVER FROM A FILE EXISTING (D3). Editorial state in this project
 * is computed, not stored, and `publish-figure-svg.js` stamps `composedHash` only on a
 * successful publish — which makes the stamp the publish-success marker for free. So a sidecar
 * carrying `renderHash` and no `composedHash` was PAID FOR AND NEVER PUBLISHED, and is stale.
 *
 * The `blocks` re-hash is what makes a COMPOSER_VERSION bump reach every figure: the stamp can
 * agree with itself while both were computed by a composer that no longer exists.
 */
export function isStale(sidecar) {
  if (!sidecar || typeof sidecar !== 'object' || Array.isArray(sidecar)) return true;
  const { blocks, renderHash, composedHash } = sidecar;
  if (!renderHash || !composedHash) return true;
  if (composedHash !== renderHash) return true;
  if (blocks && typeof blocks === 'object') {
    if (computeRenderHash(blocks, COMPOSER_VERSION) !== renderHash) return true;
  }
  return false;
}

/**
 * Turn `translations-api.json`'s payload into the flat `{key: string}` a sidecar carries.
 *
 * ⚠️ AN ARC BLOCK'S VALUE IS A BARE STRING AND EVERY OTHER BLOCK'S IS A ONE-ELEMENT ARRAY
 * (`translate-blocks.mjs`: `out[b.key] = b.arc ? got : [got]`). `Array.isArray(v) ? v[0] : v`
 * discriminates the two exactly; a naive `v[0]` yields the first CHARACTER of an arc block.
 *
 * 🔴 IT REPORTS WHAT IT DROPPED (D9). An empty MT value vanishing silently means English left
 * in the image with no review row for anyone to notice it, so the survivors alone are not an
 * answer — the caller gets the casualties too.
 *
 * @param {object|null} apiJson
 * @returns {{blocks: Record<string,string>, dropped: string[]}}
 */
export function normaliseTranslations(apiJson) {
  const blocks = {};
  const dropped = [];
  const source = apiJson && typeof apiJson === 'object' ? apiJson.blocks : null;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return { blocks, dropped };
  for (const [key, raw] of Object.entries(source)) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value !== 'string' || value.trim() === '') {
      dropped.push(key);
      continue;
    }
    blocks[key] = value;
  }
  return { blocks, dropped };
}

/**
 * Can this figure's composed SVG ever reach a reader?
 *
 * `publishFigureSvg` refuses `unmapped` when `books/<slug>/media/image-mapping.json` has no
 * entry for the basename — AFTER the money is spent. Organic has no mapping file at all, so
 * without this check every one of its figures would be bought and then refused.
 *
 * 🔴 MINTABILITY IS COMPUTED WITH THE MINTER'S OWN CODE, and that is what makes it more than a
 * tautology. `generate-image-mapping.js` finds source basenames with a `[^>]*` regex, while
 * enumeration uses the quote-aware `TAG_ATTR_SPAN`; a raw `>` inside an attribute value
 * truncates the naive form silently (§C115). Where the two disagree, the figure is enumerated,
 * translated, and then permanently unpublishable — so the disagreement must be a REFUSAL, not
 * a shrug.
 *
 * ⚠️ Conservative on purpose: the minter scans the whole book, this scans the enumerated
 * modules. Over the enumerated set the two scopes coincide, because every basename here came
 * out of one of those files.
 *
 * @returns {{status: 'mapped'|'mintable'|'unmintable', outputName: string|null}}
 */
export function mappingPreflight(basename, { mapped, mintIndex }) {
  const existing = mapped.get(basename);
  if (existing) return { status: 'mapped', outputName: existing.outputName };
  if (!mintIndex.has(basename)) return { status: 'unmintable', outputName: null };
  // Ask the minter, rather than rebuilding `<basename><suffix>.svg` by hand: DEFAULT_SUFFIX is
  // an enforceable value owned by generate-image-mapping.js and pinned against the corpus.
  const outputName = `${basename}${DEFAULT_SUFFIX}.svg`;
  const { entries } = buildMappingEntries([outputName], mintIndex, DEFAULT_SUFFIX);
  if (entries.length !== 1 || entries[0].originalImage !== basename) {
    return { status: 'unmintable', outputName: null };
  }
  return { status: 'mintable', outputName };
}

/**
 * The outcomes that end as a file in `books/<slug>/media/`, and therefore need a mapping entry.
 * `unresolved` and `unreadable-text` are absent because neither produces anything to publish;
 * `skipped-current` because its artwork is already there.
 */
const PUBLISH_BOUND = new Set(['translated', 'copied-photo', 'copied-textless']);

/**
 * Attach the mapping pre-flight to one figure, and DOWNGRADE it when publication is impossible.
 *
 * 🔴 A FIGURE THAT CAN NEVER BE PUBLISHED IS NOT `translated`. Leaving it in that bucket would
 * report as done a figure no reader can ever see, and — because the run would then be green —
 * the next paid run would buy it again. `failed-publish` is the honest bucket: it keeps the
 * partition summing (a throw would not) and it makes the run not-ok, which is the entire point
 * of doing this check before the money is spent.
 *
 * @param {object} rec a per-figure record; MUTATED
 * @param {{mapped: Map, mintIndex: Set}} ctx
 * @returns {object} the same record
 */
export function applyMappingPreflight(rec, ctx) {
  if (!PUBLISH_BOUND.has(rec.outcome)) return rec;
  rec.mapping = mappingPreflight(rec.basename, ctx);
  if (rec.mapping.status === 'unmintable') {
    rec.outcome = 'failed-publish';
    rec.reason =
      `no image-mapping.json entry, and generate-image-mapping.js would not mint one: ` +
      `its own source scan does not see ${rec.basename}. publish-figure-svg.js refuses ` +
      `"unmapped", so this figure is permanently unpublishable.`;
  }
  return rec;
}

/** The default child-process runner. Every stage goes through here so a test can count them. */
function defaultSpawn({ stage, command, argv, cwd, env, timeout }) {
  const result = spawnSync(command, argv, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf-8',
    timeout,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) {
    return { status: null, stdout: '', stderr: `${stage}: ${result.error.message}` };
  }
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

/** Read a JSON file, or null. Used where absence is a fact the caller must handle, not a crash. */
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Resolve every basename to its artwork in ONE spawn.
 *
 * 🔴 A RESOLVER FAILURE ABORTS THE RUN; IT NEVER BECOMES N x `unresolved`. `sources.py` raises
 * on a CONFIGURED-but-unmounted artwork tree precisely so a per-figure `except` cannot swallow
 * it into a skip — with `updates-2e` unmounted every figure silently resolves to its superseded
 * 1st-edition artwork, which is a correct-looking translation of the wrong picture. Catching
 * the failed spawn here and filing everything `unresolved` would rebuild that defect one
 * process up.
 */
function resolveArtwork(spawn, book, names) {
  if (names.length === 0) return new Map();
  const result = spawn({
    stage: 'resolve',
    command: PYTHON,
    argv: [path.join(EXPERIMENT_DIR, 'sources.py'), '--json', book, ...names],
    cwd: EXPERIMENT_DIR,
    env: { FIGTEXT_PYLIBS: path.join(EXPERIMENT_DIR, 'pylibs') },
    timeout: 120_000,
  });
  if (result.status !== 0) {
    throw new Error(
      `sources.py refused to resolve ${book}'s artwork (exit ${result.status}). ` +
        `This is NOT "these figures are missing" — it is the resolver itself failing, and ` +
        `falling back would silently source superseded artwork:\n${result.stderr.trim()}`
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (err) {
    throw new Error(`sources.py --json returned something that is not JSON: ${err.message}`);
  }
  return new Map(Object.entries(parsed));
}

/**
 * Walk one chapter's figures, free of charge.
 *
 * @param {ReturnType<typeof parseCli>} args
 * @param {{spawn?: Function}} [deps]
 */
export async function runFigures(args, deps = {}) {
  const spawn = deps.spawn || defaultSpawn;
  const enumeration = enumerateChapterFigures(args.book, args.chapter, { modules: args.modules });

  let figures = enumeration.figures;
  if (args.figures) {
    const present = new Set(figures.map((f) => f.basename));
    const missing = args.figures.filter((b) => !present.has(b));
    if (missing.length) {
      // §C83: a declared flag that selects nothing must REFUSE, not exit 0 having done nothing.
      throw new CliError(
        `--figure names ${missing.length} figure(s) that ${enumeration.chapterDir} does not ` +
          `contain: ${missing.join(', ')}`
      );
    }
    const want = new Set(args.figures);
    figures = figures.filter((f) => want.has(f.basename));
  }

  const { bookDir } = enumeration;
  const mapped = new Map(loadImageBasenameMap(bookDir).map((e) => [e.originalImage, e]));
  const mintIndex = new Set();
  for (const id of enumeration.moduleIds) {
    const file = path.join(enumeration.sourceDir, `${id}.cnxml`);
    for (const b of indexSourceImageBasenames(fs.readFileSync(file, 'utf-8'))) mintIndex.add(b);
  }

  // Which figures still need artwork at all. A figure whose sidecar is CURRENT is skipped
  // before anything is resolved or prepared — "already done" is a hash question, not a file
  // question, and answering it first is what keeps a re-run cheap.
  const records = figures.map((f) => ({
    basename: f.basename,
    moduleId: f.moduleId,
    src: f.src,
    reviewable: f.reviewable,
    captionSegmentId: f.captionSegmentId,
    altSegmentId: f.altSegmentId,
    sidecar: readSidecar(bookDir, f.basename),
    artwork: null,
    edition: null,
    resolvedVia: null,
    outcome: null,
    reason: null,
    sendable: 0,
    blocks: 0,
    chars: null,
    formTextXObjects: null,
    imageXObjects: null,
    paintOps: null,
    holds: null,
    mapping: null,
    outDir: null,
    warnings: [],
  }));

  for (const rec of records) {
    if (rec.sidecar && !isStale(rec.sidecar)) {
      rec.outcome = 'skipped-current';
      rec.reason = 'sidecar is published and current';
    }
  }

  const pending = records.filter((r) => r.outcome === null);
  const resolved = resolveArtwork(
    spawn,
    args.book,
    pending.map((r) => r.basename)
  );
  for (const rec of pending) {
    const hit = resolved.get(rec.basename);
    if (hit) {
      rec.artwork = hit.path;
      rec.edition = hit.edition;
      rec.resolvedVia = 'basename';
    }
  }

  // 🔴 THE DE-HASH IS LOOKUP-ONLY. `CNX_Chem_03_02_moles-6296` is delivered as
  // `CNX_Chem_03_02_moles`, and reporting the gap as a hole in the artwork delivery would be
  // wrong. The figure keeps its UNSTRIPPED name everywhere downstream — sidecar key, --out
  // directory, image-mapping entry — because that is what publish cross-checks against.
  const hashed = pending.filter((r) => !r.artwork && HASH_SUFFIX.test(r.basename));
  if (hashed.length) {
    const stripped = hashed.map((r) => r.basename.replace(HASH_SUFFIX, ''));
    const second = resolveArtwork(spawn, args.book, [...new Set(stripped)]);
    hashed.forEach((rec, i) => {
      const hit = second.get(stripped[i]);
      if (hit) {
        rec.artwork = hit.path;
        rec.edition = hit.edition;
        rec.resolvedVia = 'de-hashed';
      }
    });
  }

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figure-run-'));
  try {
    for (const rec of pending) {
      if (!rec.artwork) {
        rec.outcome = 'unresolved';
        rec.reason = 'no artwork in any configured source tree';
        continue;
      }
      const outDir = path.join(tmpRoot, rec.basename);
      rec.outDir = outDir;
      fs.mkdirSync(outDir, { recursive: true });
      const prepared = spawn({
        stage: 'prepare',
        command: PYTHON,
        argv: [
          path.join(EXPERIMENT_DIR, 'figure-prepare.py'),
          rec.artwork,
          '--basename',
          rec.basename,
          '--out',
          outDir,
        ],
        cwd: EXPERIMENT_DIR,
        env: { FIGTEXT_PYLIBS: path.join(EXPERIMENT_DIR, 'pylibs') },
        timeout: 1_200_000,
      });
      const payload = readJson(path.join(outDir, 'prepare.json'));
      if (prepared.status !== 0 || !payload || payload.error) {
        rec.outcome = 'failed-prepare';
        rec.reason =
          (payload && payload.error) ||
          prepared.stderr.trim().slice(-400) ||
          `figure-prepare.py exited ${prepared.status}`;
      } else {
        rec.blocks = payload.blocks;
        rec.chars = payload.chars;
        rec.formTextXObjects = payload.formTextXObjects;
        rec.imageXObjects = payload.imageXObjects;
        rec.paintOps = payload.paintOps;
        // Why blocks were NOT sent, kept apart: `figure-prepare.py` counts three independent
        // hold reasons that one boolean cannot express, and they mean different things. A
        // verbatim hold is correct (an element symbol is the same word in Icelandic); a
        // missing-font hold means the plumbing is broken.
        rec.holds = {
          verbatim: payload.verbatimBlocks,
          undecoded: payload.undecodedBlocks,
          missingFont: payload.missingFontBlocks,
        };
        rec.warnings = payload.warnings || [];
        // THE IDENTITY SEAM — see the module header. Free here, unrecoverable after payment.
        const composed = basenameFromMeta(path.join(outDir, 'meta.json'));
        if (composed !== rec.basename) {
          rec.outcome = 'failed-prepare';
          rec.reason =
            `basename-mismatch: meta.json names ${composed || '(unreadable meta.json)'} but ` +
            `this figure is ${rec.basename}. publish-figure-svg.js would refuse it AFTER the ` +
            `MT had been paid for.`;
        } else {
          const { outcome, sendable } = classifyFigure({
            vectorPath: rec.artwork,
            rasterPath: null,
            ...payload,
          });
          rec.outcome = outcome;
          rec.sendable = sendable;
        }
      }
      // A dry run keeps nothing: one figure's output directory is ~14 MB and /tmp here is a
      // 4.9 GB tmpfs that routinely runs over 90% full.
      if (args.dryRun) {
        fs.rmSync(outDir, { recursive: true, force: true });
        rec.outDir = null;
      }
    }

    for (const rec of records) applyMappingPreflight(rec, { mapped, mintIndex });

    const tally = emptyTally();
    for (const rec of records) tallyOutcome(tally, rec.outcome);

    return {
      mode: args.dryRun ? 'dry-run' : 'live',
      book: args.book,
      chapter: args.chapter,
      chapterDir: enumeration.chapterDir,
      bookDir,
      moduleIds: enumeration.moduleIds,
      structureDirExists: enumeration.structureDirExists,
      structureOnly: enumeration.structureOnly,
      enumerationWarnings: enumeration.warnings,
      enumerated: records.length,
      figures: records,
      tally,
      verdict: verdict(tally, records.length),
      tmpRoot,
    };
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

/** One line per figure in a named list, wrapped so a 30-figure chapter stays readable. */
function nameList(label, names) {
  if (!names.length) return [];
  return [`  ${label} (${names.length}):`, ...names.map((n) => `    ${n}`)];
}

/**
 * The run report.
 *
 * 🔴 IT ASSERTS THE PARTITION AT RUNTIME AND REFUSES TO PRINT OVER A BROKEN ONE. A figure that
 * falls out of the tally is a figure nobody knows was missed, and a pretty report over a tally
 * that does not sum is exactly the false green this driver exists to avoid. `verdict()` also
 * reports the mismatch as a fatal reason, deliberately: if this check is ever "simplified"
 * away the run still fails.
 *
 * ⚠️ IT NAMES, IT DOES NOT ONLY COUNT — the unresolved figures, the R7 gap (translated figures
 * the review panel cannot show), and anything the pre-flight refused. A count tells an operator
 * that something is wrong; only a name tells them what to do next.
 */
export function summarise(result) {
  const summed = ALL_OUTCOMES.reduce((n, k) => n + (result.tally[k] || 0), 0);
  if (summed !== result.figures.length) {
    throw new Error(
      `partition broken: the outcome tally sums to ${summed} but ${result.figures.length} ` +
        `figure(s) were enumerated. Tally: ${JSON.stringify(result.tally)}`
    );
  }

  const lines = [];
  lines.push(
    result.mode === 'dry-run'
      ? `DRY RUN — nothing bought, nothing written under books/`
      : `LIVE RUN`
  );
  lines.push(
    `${result.book} ${result.chapterDir}: ${result.figures.length} figure(s) across ` +
      `${result.moduleIds.length} module(s)`
  );
  if (!result.structureDirExists) {
    lines.push(
      `  ⚠️ 02-structure/${result.chapterDir} is absent — reviewability is UNKNOWN, not zero. ` +
        `Re-extract the chapter before reading the gap below.`
    );
  }

  lines.push('');
  for (const outcome of ALL_OUTCOMES) {
    const n = result.tally[outcome];
    if (n > 0) lines.push(`  ${String(n).padStart(4)}  ${outcome}`);
  }
  lines.push(`  ${String(summed).padStart(4)}  = enumerated`);

  const by = (predicate) => result.figures.filter(predicate).map((f) => f.basename);
  lines.push('');
  lines.push(
    ...nameList(
      'unresolved — the artwork delivery has a hole here',
      by((f) => f.outcome === 'unresolved')
    )
  );
  lines.push(
    ...nameList(
      'text we cannot read — see experiments/figure-text-translation/READ-LAYER-ACCEPTANCE.md',
      by((f) => f.outcome === 'unreadable-text')
    )
  );
  // R7 ([USER]): the review panel shows only images inside a <figure>. The gap is REPORTED,
  // never silent — widening the review surface is a tracked follow-up, not part of M5.
  lines.push(
    ...nameList(
      'translated but NOT reviewable — no <figure> node, so no editor can see this one (R7)',
      by((f) => f.outcome === 'translated' && !f.reviewable)
    )
  );
  lines.push(
    ...nameList(
      'would need an image-mapping.json entry minted before publish',
      by((f) => f.mapping && f.mapping.status === 'mintable')
    )
  );
  // 🔴 THE COPIED FIGURES' OWN NUMBERS, BECAUSE THE ACCEPTANCE CRITERION IS ABOUT THEM AND A
  // BUCKET NAME CANNOT CARRY IT: "no figure lands in copied-* while carrying
  // formTextXObjects > 0 AND chars === 0" is a read-layer regression check, and reading it off
  // this report is what makes the criterion checkable rather than asserted. `classifyFigure`
  // routes exactly that pair to `unreadable-text`, so a line here showing `chars=0 formText>0`
  // means the classifier and this report have drifted.
  const copied = result.figures.filter((f) => f.outcome.startsWith('copied-'));
  if (copied.length) {
    lines.push(`  copied figures, with the counts the read layer produced (${copied.length}):`);
    for (const f of copied) {
      lines.push(
        `    ${f.outcome.padEnd(16)} chars=${f.chars} formText=${f.formTextXObjects} ` +
          `images=${f.imageXObjects} paint=${f.paintOps} ` +
          `held=${f.holds ? `${f.holds.verbatim}v/${f.holds.undecoded}u/${f.holds.missingFont}f` : '-'}` +
          `  ${f.basename}`
      );
    }
  }

  for (const rec of result.figures) {
    if (rec.outcome.startsWith('failed-')) {
      lines.push(`  ${rec.outcome}  ${rec.basename}: ${rec.reason}`);
    }
  }
  if (result.structureOnly.length) {
    lines.push(
      ...nameList(
        'in 02-structure but NOT in the CNXML — the extractor invented one',
        result.structureOnly
      )
    );
  }
  for (const w of result.enumerationWarnings) {
    lines.push(`  enumeration warning [${w.moduleId}] ${w.reason}: ${w.tag}`);
  }

  lines.push('');
  lines.push(result.verdict.ok ? 'VERDICT ok' : 'VERDICT needs a human');
  for (const reason of result.verdict.reasons) lines.push(`  ${reason}`);
  return lines.join('\n');
}

/**
 * @returns {Promise<number>} the exit code. 0 ok · 1 the run needs a human · 2 usage.
 */
export async function main(argv, deps = {}) {
  let args;
  try {
    args = parseCli(argv);
  } catch (err) {
    if (err instanceof CliError) {
      console.error(err.message);
      return 2;
    }
    throw err;
  }

  // 🔴 THE MONEY GUARD. Task 6a builds the free half only; the paid half is 6b. Refusing here
  // — loudly, before a single child process — is what makes "this session spent nothing" a
  // property of the code rather than of the operator's care.
  if (!args.dryRun) {
    console.error(
      'figure-run.js: --dry-run is required. The paid half (spend, sidecar, compose, publish) ' +
        'is M5 Task 6b and is not built on this branch; running without --dry-run would do ' +
        'nothing and report success.'
    );
    return 2;
  }

  try {
    const result = await runFigures(args, deps);
    console.log(summarise(result));
    return result.verdict.ok ? 0 : 1;
  } catch (err) {
    console.error(`figure-run: ${err.message}`);
    return err instanceof CliError ? 2 : 1;
  }
}

/* c8 ignore start -- CLI wiring; the behaviour above is what the tests drive. */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // 🔴 FAILURE DEFAULT, FIRST STATEMENT INSIDE THE GUARD. A promise that never settles holds no
  // handle, so Node's event loop empties and the process exits 0 having reached no verdict.
  // It sits inside the guard rather than at module scope because the test file IMPORTS this
  // module, and a top-level assignment would set vitest's own exit code to 1.
  process.exitCode = 1;
  // `process.exitCode`, never `process.exit()`: stdout to a pipe is asynchronous and an exit
  // after a write discards whatever is still queued, with the exit code still correct.
  process.exitCode = await main(process.argv.slice(2));
}
/* c8 ignore stop */
