#!/usr/bin/env node
/**
 * The M5 figure driver. It enumerates a chapter's figures, resolves each to its artwork,
 * prepares it, classifies it and — without `--dry-run` — buys, records, composes and publishes it.
 *
 *   node tools/figure-run.js --book <slug> --chapter <N|appendices>
 *        [--module m…] [--figure B…] [--stale] [--force] [--dry-run]
 *
 * 🔴 THE ONLY STAGE THAT SPENDS MONEY IS `translate-blocks.mjs`, AND THE ONLY FIGURE IT IS EVER
 * RUN FOR IS ONE WITH **NO SIDECAR FILE**. ⚠️ The word FILE is load-bearing and was missing:
 * `readSidecar` returns null for a malformed sidecar as well as an absent one, so a
 * git-conflicted or truncated file read as "nobody has bought this" and was bought AND
 * overwritten — see `applySidecarGuard`. That is R8, and it is not a flag: after an editor's
 * correction the sidecar's blocks ARE the corrected Icelandic, so re-running the MT would
 * overwrite the correction *and* charge for it. `--stale` and `--force` therefore spend NOTHING
 * — they recompose. **To re-buy a figure, a human deletes its `books/<slug>/figure-text/
 * <basename>.is.json`.** Every child process goes through ONE injectable `spawn`, tagged by
 * stage, so "the MT was spawned zero times" is a counter a test can read rather than a claim.
 *
 * 🔴 THE ORDER IS THE FIX, AND IT IS THE WHOLE POINT OF THIS FILE:
 *
 *    5. PRE-FLIGHT   is a mapping entry present or mintable? + the identity seam   PURE, no write
 *    6. translate    ONLY when no sidecar exists                                   ← the paid step
 *    7. SIDECAR      writeSidecar IMMEDIATELY, and REGARDLESS of step 8            ← records it
 *    8. verify       compare key SETS both ways → decides the BUCKET, never the record
 *    9. compose      figure-compose.py, from the sidecar's own blocks
 *   10. mint+publish the mapping entry (tmp+rename), then publish → stamps composedHash AND
 *                   composedVersion, the two fields that describe the PUBLISHED ARTWORK
 *
 * Step 7 sits ahead of everything that can fail after payment. Without it, ADDING step 8 would
 * make things worse: a 7-of-8 return would be bucketed `failed-mt` and all 7 paid translations
 * discarded — a new DETECTION converted into a new LOSS, since the paid Icelandic otherwise
 * lives only in a `mkdtemp` directory nothing records and nothing re-reads.
 *
 * ⚠️ THE PAID STAGE IS ALL-OR-NOTHING PER FIGURE, AND THAT IS ACCEPTED RATHER THAN FIXED.
 * `translate-blocks.mjs` writes its outputs only after its whole loop, so a throw at block k of
 * n persists nothing; the figure lands `failed-mt` with NO sidecar and the next run re-buys it.
 * Exposure is one figure, ~1 ISK — §C134's shape, where [USER] ruled retry over coding around
 * it. **Do NOT "fix" it with a partial write on catch:** a partial sidecar makes the figure
 * R8-ineligible to spend and permanently part-English, with no review row for the missing keys.
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
import { basenameFromMeta, escapesMediaDir, publishFigureSvg } from './publish-figure-svg.js';
import {
  DEFAULT_SUFFIX,
  indexSourceImageBasenames,
  buildMappingEntries,
  mergeMapping,
} from './generate-image-mapping.js';

const require = createRequire(import.meta.url);
const { enumerateChapterImages } = require('./lib/figure-enumerate.cjs');
const { loadImageBasenameMap } = require('./lib/image-basename-map.cjs');
const {
  SIDECAR_VERSION,
  readSidecar,
  writeSidecar,
  sidecarPath,
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
const KNOWN_FLAGS = new Set([
  '--book',
  '--chapter',
  '--module',
  '--figure',
  '--stale',
  '--force',
  '--dry-run',
]);

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
 * ⚠️ `--stale` AND `--force` ARE BOOLEANS, AND NEITHER CAN CAUSE A PURCHASE. `--stale` narrows
 * the run to figures that already HAVE a sidecar; `--force` stops a current one being skipped so
 * it is recomposed anyway. A figure with no sidecar is bought with or without either flag,
 * because that is not a re-do — it is the first do. Neither is in VALUED_FLAGS: adding them
 * there would make the bare `--stale` a usage error.
 *
 * @param {string[]} argv
 * @returns {{book:string, chapter:string, modules:string[]|null, figures:string[]|null,
 *            stale:boolean, force:boolean, dryRun:boolean}}
 */
export function parseCli(argv) {
  const args = {
    book: null,
    chapter: null,
    modules: null,
    figures: null,
    stale: false,
    force: false,
    dryRun: false,
  };
  const lists = { '--module': [], '--figure': [] };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!KNOWN_FLAGS.has(token)) {
      throw new CliError(`Unknown argument: ${token}\nKnown: ${[...KNOWN_FLAGS].sort().join(' ')}`);
    }
    if (!VALUED_FLAGS.has(token)) {
      if (token === '--dry-run') args.dryRun = true;
      else if (token === '--stale') args.stale = true;
      else if (token === '--force') args.force = true;
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
 * ⚠️ `booksRoot` IS A TEST SEAM AND IT IS NOT OPTIONAL EQUIPMENT. The paid half WRITES —
 * a sidecar, a mapping entry, an SVG in `media/` — so its suite has to drive the real code
 * against a throwaway tree. Pointing the whole run at one root is the only injection point
 * that covers all three writers, because every one of them derives its path from `bookDir`.
 *
 * @param {string|number} chapter any dialect: 4, '4', 'appendices'
 * @param {{modules?: string[]|null, booksRoot?: string}} [opts]
 */
export function enumerateChapterFigures(bookSlug, chapter, opts = {}) {
  const canonical = normalizeChapter(chapter);
  if (canonical === null) {
    throw new CliError(
      `--chapter ${JSON.stringify(String(chapter))} is not a chapter: give a number or the word "appendices"`
    );
  }
  return enumerateChapterImages({
    bookDir: path.join(opts.booksRoot || path.join(REPO_ROOT, 'books'), bookSlug),
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
 * 🔴 A COMPOSER_VERSION BUMP IS ANSWERED BY `composedVersion`, NOT BY RE-HASHING THE BLOCKS —
 * AND THE DIFFERENCE WAS A PERMANENT LOOP. This used to re-hash `blocks` under the module's
 * CURRENT COMPOSER_VERSION and compare against the STORED `renderHash`, which is a perfectly
 * good bump detector and has no way to be SATISFIED: nothing in the driver ever rewrites
 * `renderHash`, and the publisher stamps `composedHash = sidecar.renderHash`, the value already
 * there. So after a bump every figure recomposed and republished on every run, wrote nothing,
 * and reported VERDICT ok — measured over four consecutive runs, `sidecarBytesUnchanged=true`
 * each time. The only writer that refreshes `renderHash` is an editor approving, so the loop's
 * exit was a human review pass, which the R7 figures with no `<figure>` node cannot have.
 *
 * ⚠️ A SIDECAR WITH NO `composedVersion` IS STALE, DELIBERATELY. "I do not know which composer
 * drew this SVG" fails safe, exactly as an absent `composedHash` does — it costs ONE recompose
 * (0 ISK) and then converges, because that recompose stamps the version.
 *
 * ⚠️ AND THE BLOCK RE-HASH STAYS, UNDER THE SIDECAR'S OWN `composerVersion`. It still catches a
 * sidecar whose `blocks` were hand-edited while its `renderHash` was left alone. Hashing under
 * the CURRENT version instead would re-open the loop the moment the publisher stamps a new
 * `composedVersion`, because `renderHash` was computed under the old one and never moves.
 *
 * ▶ WHAT IT DELIBERATELY DOES NOT ANSWER: whether an EDITOR still approves. That is
 * `editorialState`, which re-hashes the blocks under the CURRENT composer against `renderHash`
 * and therefore still demotes an approved figure to mt-preview after a bump — which is what
 * COMPOSER_VERSION's own docstring promises. "The artwork is current" and "the approval is
 * current" are different questions and this one answers only the first.
 */
export function isStale(sidecar) {
  if (!sidecar || typeof sidecar !== 'object' || Array.isArray(sidecar)) return true;
  const { blocks, renderHash, composedHash, composerVersion, composedVersion } = sidecar;
  if (!renderHash || !composedHash) return true;
  if (composedHash !== renderHash) return true;
  if (composedVersion !== COMPOSER_VERSION) return true;
  if (blocks && typeof blocks === 'object') {
    if (computeRenderHash(blocks, composerVersion || COMPOSER_VERSION) !== renderHash) return true;
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
 * The outcomes whose `image-mapping.json` row is INSPECTED. Not "the outcomes that end as a
 * file in `books/<slug>/media/`", which is what this comment used to say and is false:
 * `processFigureLive` returns at `rec.outcome !== 'translated'`, so THIS DRIVER PUBLISHES
 * NOTHING FOR A COPY — the reader keeps OpenStax's own artwork out of the media tree, and
 * `ls books/efnafraedi-2e/media/` is all `*_IS.*` bar its housekeeping files.
 *
 * A copy is still inspected, and that is deliberate: a row whose `outputName` escapes
 * `media/` is a defect in a COMMITTED data file whatever the figure's bucket. What a copy is
 * NOT subject to is the `unmintable` downgrade — see `applyMappingPreflight`.
 *
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
 * 🔴 AND IT CHECKS THAT AN ALREADY-`mapped` ENTRY CAN ACTUALLY BE PUBLISHED. Returning `mapped`
 * for any existing row without inspecting its `outputName` left TWO publish refusals landing
 * after the money — the extension check in `processFigureLive` and `publishFigureSvg`'s
 * `unsafe-output-name` — both decidable here, from a value this function already holds.
 *
 * ⚠️ THE TWO CHECKS HAVE DIFFERENT SCOPES, AND CONFLATING THEM MANUFACTURES A FALSE RED.
 * CONTAINMENT applies to every PUBLISH_BOUND outcome: nothing may ever be written outside
 * `media/`, and the rule has ONE owner (`escapesMediaDir`, in the publisher) rather than a copy
 * here. The `.svg` EXTENSION applies only to `translated`, the one outcome whose composer output
 * is an SVG — a `copied-photo` carrying a legitimate `PHOTO1_IS.png` row is healthy, and
 * asserting `.svg` across all of PUBLISH_BOUND flips it to a spurious `failed-publish`
 * (measured).
 *
 * @param {object} rec a per-figure record; MUTATED
 * @param {{mapped: Map, mintIndex: Set, bookDir: string}} ctx
 * @returns {object} the same record
 */
export function applyMappingPreflight(rec, ctx) {
  if (!PUBLISH_BOUND.has(rec.outcome)) return rec;
  rec.mapping = mappingPreflight(rec.basename, ctx);
  if (rec.mapping.status === 'unmintable') {
    // 🔴 A COPY IS NOT FAILED OVER A PUBLISH THAT NEVER HAPPENS. `processFigureLive` returns
    // at `rec.outcome !== 'translated'`, so nothing is composed, minted or published for a
    // `copied-*` — "no row, and the minter cannot make one" is the ORDINARY state of a figure
    // nobody publishes (organic has no mapping file at all and every one of its figures reads
    // `mintable`). Downgrading it made `verdict()` FATAL and the chapter exit 1, "needs a
    // human", over work that does not exist. The pre-flight's ANSWER is still recorded above,
    // because it is a fact about the book; it just stops being a failure.
    // ⚠️ THIS IS NOT THE CONTAINMENT CHECK BELOW, WHICH STILL COVERS COPIES. An outputName
    // that escapes media/ is a defect in a committed data file whatever the bucket.
    if (rec.outcome !== 'translated') return rec;
    rec.outcome = 'failed-publish';
    rec.reason =
      `no image-mapping.json entry, and generate-image-mapping.js would not mint one: ` +
      `its own source scan does not see ${rec.basename}. publish-figure-svg.js refuses ` +
      `"unmapped", so this figure is permanently unpublishable.`;
    return rec;
  }
  const { outputName } = rec.mapping;
  if (escapesMediaDir(ctx.bookDir, outputName)) {
    rec.outcome = 'failed-publish';
    rec.reason =
      `the image-mapping.json entry for ${rec.basename} names an outputName that escapes ` +
      `media/: ${JSON.stringify(outputName)}. A published figure is a flat file in the book's ` +
      `media/ directory; nothing may be written outside it — 01-source/ in particular holds ` +
      `the licensed OpenStax copy. publish-figure-svg.js refuses "unsafe-output-name", so this ` +
      `figure is unpublishable until the row is repaired.`;
    return rec;
  }
  // ⚠️ `translated` ONLY. The composer writes an SVG; a copy publishes its own bytes, and
  // `.png` is a correct outputName for one.
  if (rec.outcome === 'translated' && path.extname(outputName) !== '.svg') {
    rec.outcome = 'failed-publish';
    rec.reason =
      `the image-mapping.json entry for ${rec.basename} names ${outputName}, but the composer ` +
      `writes an .svg: publishing would put ${path.extname(outputName) || '(no extension)'} ` +
      `bytes into that filename. Repair the row before this figure is bought.`;
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
 * 🔴 WHICH STRIPPED STEMS MORE THAN ONE ENUMERATED FIGURE WOULD CLAIM.
 *
 * The de-hash fallback assumed the stripped -> delivered map is INJECTIVE. On chemistry ch21 it
 * is not: `CNX_Chem_21_03_RadioDecay-d92b` (a table of PARTICLE types) and
 * `…-e619` (a table of DECAY types) are different pictures, neither resolves directly, and both
 * strip to `CNX_Chem_21_03_RadioDecay`. Both were handed the SAME PDF — the MT bought twice for
 * one picture, and one figure published the other's artwork under its own caption and alt text.
 *
 * 🔴 AND NOTHING DOWNSTREAM COULD SEE IT. `figure-prepare.py` stages the artwork AS the
 * requested basename, so `basenameFromMeta(meta.json) === rec.basename` compares the name with
 * ITSELF whatever picture was staged; `publishFigureSvg`'s `basename-mismatch` reads that same
 * meta.json; `figure-compose.py`'s key-set assertions compare the sidecar against a blocks.json
 * derived from the same wrong artwork. Every stage reports its own success truthfully.
 *
 * ⚠️ AN UNHASHED FIGURE OF THE SAME NAME IS A CLAIMANT TOO. `FOO` enumerated beside `FOO-abcd`
 * means the artwork delivered as `FOO` is `FOO`'s OWN picture, so de-hashing onto it is the same
 * defect with one claimant arriving through the first resolver pass instead of the second.
 *
 * ⚠️ THE INPUT MUST BE THE WHOLE CHAPTER'S BASENAMES, NEVER THE RUN'S SELECTION. `--figure` or
 * `--module` naming only ONE claimant hides the contest inside the run — and that is precisely
 * the invocation that would buy the wrong picture, because there is no second record to compare
 * against. Its caller re-enumerates without `modules` when the run is narrowed.
 *
 * @param {string[]} basenames every figure basename in the chapter
 * @returns {Map<string, string[]>} contested stem -> the basenames claiming it, sorted
 */
export function dehashStemClaims(basenames) {
  const unhashed = new Set(basenames.filter((b) => !HASH_SUFFIX.test(b)));
  const byStem = new Map();
  for (const b of basenames) {
    if (!HASH_SUFFIX.test(b)) continue;
    const stem = b.replace(HASH_SUFFIX, '');
    if (!byStem.has(stem)) byStem.set(stem, new Set());
    byStem.get(stem).add(b);
  }
  const contested = new Map();
  for (const [stem, claimants] of byStem) {
    if (unhashed.has(stem)) claimants.add(stem);
    if (claimants.size > 1) contested.set(stem, [...claimants].sort());
  }
  return contested;
}

/** How many translated blocks a sidecar carries. `null`/malformed counts as zero. */
function sidecarBlockCount(sidecar) {
  if (!sidecar || typeof sidecar.blocks !== 'object' || sidecar.blocks === null) return 0;
  return Object.keys(sidecar.blocks).length;
}

/**
 * The block keys the paid stage was asked to translate — `blocks.json`'s `send:true` entries.
 *
 * ⚠️ READ AS A SET, NOT A MULTISET, AND THAT IS CORRECT ONLY HERE. `figure-compose.py` compares
 * the same keys as MULTISETS because `compose.py` DRAWS a duplicate key twice; this comparison
 * is against `translations-api.json`, whose `blocks` is a JSON OBJECT, so duplicates have
 * already collapsed by construction and a multiset check would report a loss that cannot exist.
 *
 * @returns {string[]|null} null when blocks.json is missing or is not an array
 */
function sendKeysFrom(outDir) {
  const blocks = readJson(path.join(outDir, 'blocks.json'));
  if (!Array.isArray(blocks)) return null;
  return blocks.filter((b) => b && b.send).map((b) => b.key);
}

/**
 * STEP 8. Compare the keys we PAID FOR against the keys that came BACK, in both directions.
 *
 * 🔴 IT DECIDES THE BUCKET, NEVER THE RECORD. The sidecar has already been written by the time
 * this runs, deliberately — see the module header.
 *
 * `missing` is the money finding: a key that was bought and returned nothing usable ships in
 * English, and nothing downstream can see it. `extra` is the stale-directory finding: a key we
 * never asked for means the payload belongs to another figure or another vintage.
 */
export function verifyTranslatedKeys(expected, blocks) {
  const got = new Set(Object.keys(blocks));
  const want = new Set(expected);
  return {
    missing: [...want].filter((k) => !got.has(k)),
    extra: [...got].filter((k) => !want.has(k)),
  };
}

/** The one construction of the mapping path, so the two readers cannot drift apart. */
function mappingFilePath(bookDir) {
  return path.join(bookDir, 'media', 'image-mapping.json');
}

/**
 * 🔴 THE ONE PLACE A MAPPING PAYLOAD IS JUDGED. Both the run-level pre-flight and the mint call
 * it, so they cannot disagree about what "readable" means — and a third `JSON.parse` here would
 * have been the third representation of the same question.
 *
 * ⚠️ `loadImageBasenameMap` deliberately swallows a parse error into `[]`, and that is right for
 * the RENDERER — one bad file must not kill a chapter. It is wrong for a gate: every figure then
 * reads `mintable`, the pre-flight passes, and `mintMappingEntry` refuses the SAME file one
 * purchase later. Same shape as `readSidecar`'s null (see `applySidecarGuard`).
 *
 * @throws {Error} when the bytes are not a JSON array
 */
function parseMappingOrRefuse(mappingPath, raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `${mappingPath} is not valid JSON (${err.message}); refusing to merge over it. ` +
        `Repair the file — a run that continued would buy this chapter's figures and then be ` +
        `unable to publish a single one of them.`
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error(
      `${mappingPath} is a ${Array.isArray(parsed) ? 'array' : typeof parsed}, not an array; ` +
        `refusing to merge over it. Repair the file — a run that continued would buy this ` +
        `chapter's figures and then be unable to publish a single one of them.`
    );
  }
  return parsed;
}

/**
 * The run-level pre-flight for the mapping file. ABORTS the run rather than bucketing figures,
 * for the reason `resolveArtwork` aborts: this is one broken FILE, not N broken figures, and
 * filing it per-figure would report a chapter-wide fault as a scatter of individual ones.
 *
 * ⚠️ It runs in a DRY RUN too. A dry run over a corrupt mapping printed a report BYTE-IDENTICAL
 * to the healthy case — VERDICT ok — which is the report an operator reads before spending.
 *
 * A MISSING file is fine and stays fine: organic has none, and every one of its figures is
 * legitimately `mintable`.
 */
function assertMappingReadable(bookDir) {
  const mappingPath = mappingFilePath(bookDir);
  let raw;
  try {
    raw = fs.readFileSync(mappingPath, 'utf-8');
  } catch {
    return; // absent: the ordinary state of a book that has published no figure
  }
  parseMappingOrRefuse(mappingPath, raw);
}

/**
 * STEP 10a. Add this figure's entry to `books/<slug>/media/image-mapping.json`.
 *
 * 🔴 THE OBVIOUS ALTERNATIVE IS MEASURED CLOSED: "just run generate-image-mapping.js first" is a
 * NO-OP here. It derives entries from files ALREADY IN `media/`, so with nothing published yet
 * it mints zero — it helps only the figures that need no help — and it throws outright on a book
 * with no `media/` directory at all.
 *
 * ⚠️ IT REFUSES OVER AN UNPARSABLE MAPPING rather than replacing it. Overwriting would silently
 * discard whatever legacy entries the file held, and `mergeMapping` keys on `originalImage`, so
 * a file it cannot read is a file it must not merge into.
 *
 * ⚠️ tmp + rename, like `writeSidecar`: this file is read by `cnxml-inject` on every render, and
 * a crash mid-write would leave half a JSON array in the reader's path.
 *
 * @returns {{mappingPath: string, previous: string|null}} `previous` is the exact bytes that
 *   were there (null when the file did not exist), which is what a rollback needs.
 */
function mintMappingEntry(bookDir, basename, outputName) {
  const mappingPath = mappingFilePath(bookDir);
  let previous = null;
  try {
    previous = fs.readFileSync(mappingPath, 'utf-8');
  } catch {
    previous = null;
  }
  // Re-read and re-checked here rather than trusting the pre-flight's earlier verdict: the file
  // is committed and two writers touch it, so the bytes may have moved since the run started.
  const existing = previous === null ? [] : parseMappingOrRefuse(mappingPath, previous);
  const fresh = [{ originalImage: basename, outputName, extension: path.extname(outputName) }];

  // 🔴 `mergeMapping` KEYS ON `originalImage`, SO EVERY ROW WITHOUT ONE COLLAPSES ONTO
  // `undefined` AND ALL BUT THE LAST IS LOST. This is not hypothetical: measured 2026-09-07,
  // `books/liffraedi-2e/media/image-mapping.json` holds 34 rows and ALL 34 lack the field —
  // it is the docx-import route, keyed on `figureId`, which `cnxml-inject`'s legacy
  // `resolveTranslatedImage` still consumes. Handing that file to `mergeMapping` whole returns
  // ONE row. So the rows it cannot key are held out, and every row is re-emitted in its
  // ORIGINAL POSITION — a reordered mapping is diff churn on a committed data file.
  const keyed = existing.filter((e) => e && e.originalImage);
  const mergedKeyed = new Map(mergeMapping(keyed, fresh).map((e) => [e.originalImage, e]));
  const merged = [];
  const emitted = new Set();
  for (const entry of existing) {
    if (!entry || !entry.originalImage) {
      merged.push(entry);
      continue;
    }
    if (emitted.has(entry.originalImage)) continue; // mergeMapping dedupes; match it
    emitted.add(entry.originalImage);
    merged.push(mergedKeyed.get(entry.originalImage));
  }
  for (const entry of mergedKeyed.values()) {
    if (emitted.has(entry.originalImage)) continue;
    emitted.add(entry.originalImage);
    merged.push(entry);
  }

  fs.mkdirSync(path.dirname(mappingPath), { recursive: true });
  const tmp = `${mappingPath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(merged, null, 2)}\n`, 'utf-8');
  fs.renameSync(tmp, mappingPath);
  return { mappingPath, previous };
}

/**
 * Undo a mint whose publish then failed.
 *
 * 🔴 A DANGLING MAPPING ENTRY IS A READER-VISIBLE BROKEN IMAGE, NOT A HARMLESS LEFTOVER.
 * `cnxml-inject.js`'s `applyImageBasenameSwaps` rewrites `<image src>` on a basename match and
 * NEVER checks that the target exists, so an entry pointing at a file the publish did not write
 * puts a 404 on the page at the next render.
 */
function restoreMapping(minted) {
  if (!minted) return;
  if (minted.previous === null) fs.rmSync(minted.mappingPath, { force: true });
  else fs.writeFileSync(minted.mappingPath, minted.previous, 'utf-8');
}

/**
 * The classification outcomes a figure can land in while a PAID sidecar already exists for it.
 * `unresolved` is deliberately absent: a missing artwork is a hole in the delivery (R9, named
 * and non-fatal), not a composition problem, and re-labelling it would hide the one number in
 * the pipeline that looks at the delivery at all.
 */
const DRIFTABLE = new Set(['copied-photo', 'copied-textless', 'unreadable-text']);

/**
 * 🔴 THE READ LAYER MOVED UNDER A FIGURE WE HAVE ALREADY PAID FOR — REFUSE, DO NOT RECOMPOSE.
 *
 * The sidecar says this figure has text; prepare now finds none. `figure-compose.py` CANNOT see
 * it: with an empty `blocks.json` both of its multiset assertions compare `[]` against `[]` and
 * pass, and it would happily publish the artwork with its text STRIPPED and nothing drawn back —
 * a figure whose labels have been deleted, reported as a success.
 *
 * ⚠️ It fires in a DRY RUN too, on purpose. A dry run exists to surface exactly this before any
 * money moves, and the reason string says plainly that compose was never spawned.
 */
export function applyDriftGuard(rec) {
  if (!DRIFTABLE.has(rec.outcome) || sidecarBlockCount(rec.sidecar) === 0) return rec;
  // Captured BEFORE the overwrite: it is the whole diagnosis. Reading `rec.outcome` after the
  // assignment reports `failed-compose` back to itself and loses which bucket the figure had
  // actually drifted into — `copied-photo`, `copied-textless` and `unreadable-text` each mean
  // something different about what went wrong upstream.
  const classified = rec.outcome;
  rec.outcome = 'failed-compose';
  rec.reason =
    `a sidecar with ${sidecarBlockCount(rec.sidecar)} translated block(s) exists, but the read ` +
    `layer now finds no sendable text in this figure (classified ${classified}). ` +
    `Composing would publish the artwork with its labels stripped and nothing drawn back, and ` +
    `figure-compose.py cannot detect that — its key-set assertions compare [] against []. ` +
    `Compose was NOT run. Re-check the artwork edition, or delete the sidecar to start over.`;
  return rec;
}

/**
 * 🔴 A SIDECAR THAT EXISTS AND CANNOT BE READ IS NOT "NO SIDECAR" — REFUSE, NEVER RE-BUY.
 *
 * `readSidecar` answers `null` for BOTH "the file is absent" and "the file is present and
 * malformed", and its own comment gives the RENDERER's reason for that: one bad file must not
 * kill a whole chapter's render. The spend gate one function down reads that single value, so
 * a git-conflicted, truncated or hand-mangled sidecar was indistinguishable from a figure
 * nobody has ever bought — it was sent to the paid MT, and step 7's `writeSidecar` then
 * overwrote it, destroying a head editor's approved Icelandic and the `state` key, with a
 * green verdict and no bucket.
 *
 * ⚠️ THIS IS CLAUDE.md §C14 ③'s CLASS, NOT A ONE-OFF: a gate keyed on one representation of
 * "nothing", walked past by another representation of "nothing". There it was four bytes of
 * `null` in `glossary-unified.json`, which parsed, so `kind` was not `'absent'` while the
 * payload was the exact sentinel for "no previous producer", and all three gates stood down.
 * Expect the shape wherever a reader collapses "missing" and "broken" into one falsy value.
 *
 * ▶ `publishFigureSvg` already gets this right — it refuses `no-sidecar` with "missing OR
 * malformed" — but it runs AFTER the money and AFTER the overwrite, so it can never see the
 * file the driver destroyed.
 *
 * The check is `existsSync` on the path `readSidecar` just failed on: it costs one stat, it
 * runs before anything is resolved or prepared, and it cannot be reached by `--force` (which
 * suppresses only the skipped-current skip) or by `--dry-run`.
 *
 * @param {object} rec MUTATED
 * @param {string} bookDir
 * @returns {object} the same record
 */
export function applySidecarGuard(rec, bookDir) {
  if (rec.sidecar) return rec;
  const file = sidecarPath(bookDir, rec.basename);
  if (!fs.existsSync(file)) return rec; // genuinely absent: the ordinary, spendable state
  rec.sidecarUnreadable = true;
  rec.outcome = 'failed-sidecar';
  rec.reason =
    `${file} EXISTS and could not be read as a sidecar object (malformed JSON, a git merge ` +
    `conflict, a truncated write, or a top-level array). That is NOT "no sidecar": this ` +
    `figure may already carry an editor's approved Icelandic, so it was neither sent to the ` +
    `MT nor overwritten. Repair or delete the file by hand — deleting it is what makes the ` +
    `figure spendable again.`;
  return rec;
}

/**
 * STEPS 6–10 for ONE figure, live. Mutates `rec`; returns nothing.
 *
 * 🔴 TWO PATHS, SELECTED BY WHETHER A SIDECAR EXISTS — NOT BY A FLAG.
 *   no sidecar  → buy it (the ONLY spendable state), record it, verify it, compose, publish
 *   a sidecar   → RECOMPOSE from its own blocks, 0 ISK, and write nothing but the publisher's
 *                 stamp. The blocks may be an editor's corrections; re-running the MT would
 *                 overwrite them and charge for it.
 *
 * @param {object} rec MUTATED
 * @param {{spawn:Function, publish:Function, readSidecar:Function, args:object,
 *          bookDir:string, outDir:string}} ctx
 */
function processFigureLive(
  rec,
  { spawn, publish, readSidecar: readSidecarFor, args, bookDir, outDir }
) {
  // Copies, failures and unresolved figures end at classification: there is no text to compose
  // and nothing to publish that a reader is not already getting from the OpenStax media tree.
  if (rec.outcome !== 'translated') return;
  if (!rec.mapping) {
    rec.outcome = 'failed-publish';
    rec.reason = 'no mapping pre-flight ran for this figure; refusing to publish blind';
    return;
  }
  const sidecarFile = sidecarPath(bookDir, rec.basename);

  if (!rec.sidecar) {
    // ── STEP 6. THE ONLY PAID STEP IN THE WHOLE DRIVER. ──────────────────────────────────
    const expected = sendKeysFrom(outDir);
    if (expected === null) {
      rec.outcome = 'failed-mt';
      rec.reason = `figure-prepare.py wrote no readable blocks.json in ${outDir}, so there is no key set to buy against and nothing was sent`;
      return;
    }
    rec.spent = true;
    const mt = spawn({
      stage: 'translate',
      command: process.execPath,
      // ⚠️ `--book` is REQUIRED and is provenance, not glossary selection — the figure MT leg
      // sends no glossary at all ([USER] 2026-09-06, §C133). `--no-glossary` is deliberately
      // NOT passed: it is a redundant no-op kept only so old callers are not rejected as typos.
      argv: [
        path.join(EXPERIMENT_DIR, 'translate-blocks.mjs'),
        '--book',
        args.book,
        '--out',
        outDir,
      ],
      cwd: EXPERIMENT_DIR,
      env: {},
      timeout: 900_000,
    });
    if (mt.status !== 0) {
      rec.outcome = 'failed-mt';
      rec.reason =
        `translate-blocks.mjs exited ${mt.status}. It writes its output files only after its ` +
        `whole loop, so NOTHING was persisted and no sidecar was minted — the figure stays ` +
        `eligible and the next run re-buys it (~1 ISK). ${mt.stderr.trim().slice(-400)}`;
      return;
    }
    const { blocks, dropped } = normaliseTranslations(
      readJson(path.join(outDir, 'translations-api.json'))
    );
    rec.droppedKeys = dropped;
    // ⚠️ THE CLAUSE THAT STOPS AN EMPTY SIDECAR. Read literally, "write the sidecar regardless
    // of step 8's verdict" invites `blocks: {}` with a perfectly valid renderHash — which R8
    // then locks out of ever being bought again.
    if (Object.keys(blocks).length === 0) {
      rec.outcome = 'failed-mt';
      rec.reason =
        `translations-api.json is absent or carries no usable translation` +
        (dropped.length ? ` (${dropped.length} empty value(s): ${dropped.join(', ')})` : '') +
        `. NO sidecar was minted, deliberately: an empty one would make this figure ` +
        `permanently ineligible to spend.`;
      return;
    }

    // ── STEP 7. RECORD THE PURCHASE, AHEAD OF EVERYTHING THAT CAN FAIL AFTER IT. ─────────
    const minted = {
      version: SIDECAR_VERSION,
      basename: rec.basename,
      renderHash: computeRenderHash(blocks, COMPOSER_VERSION),
      composerVersion: COMPOSER_VERSION,
      blocks,
    };
    // 🔴 NO `state` KEY, AND THAT IS LOAD-BEARING. `editorialState` returns 'mt-preview' on
    // `!sidecar.state` before it looks at any hash, so an unreviewed machine translation reads
    // as mt-preview for free; storing a derived value is what this design exists not to do.
    // `renderHash` IS required — `publish-figure-svg.js` stamps `composedHash` iff it is
    // truthy, which makes the stamp the publish-success marker at no extra cost.
    writeSidecar(bookDir, rec.basename, minted);
    rec.sidecar = minted;
    rec.sidecarWritten = true;

    // ── STEP 8. VERIFY. IT DECIDES THE BUCKET, NEVER THE RECORD. ────────────────────────
    const { missing, extra } = verifyTranslatedKeys(expected, blocks);
    if (missing.length || extra.length) {
      rec.outcome = 'failed-mt';
      rec.reason =
        `the MT returned a different key set from the one it was paid for. ` +
        (missing.length
          ? `BOUGHT AND NOT RETURNED (these ship in English): ${missing.join(', ')}. `
          : '') +
        (extra.length ? `RETURNED BUT NEVER ASKED FOR: ${extra.join(', ')}. ` : '') +
        `The ${Object.keys(blocks).length} translation(s) that DID come back are on disk in ` +
        `${sidecarFile} — they are paid for and are not thrown away. To re-buy the whole ` +
        `figure, delete that file.`;
      return;
    }
  }

  // ── STEP 9. COMPOSE — from the SIDECAR, on both paths. ────────────────────────────────
  // `compose.py` reads `TR = _tr.get('blocks', _tr)`, so a sidecar is a valid --translations
  // payload as it stands, and `normalise_block_value` accepts its flat strings. Passing the
  // sidecar itself rather than a second copy is what makes "recompose from the sidecar's own
  // blocks" a fact about the command line rather than a claim.
  if (sidecarBlockCount(rec.sidecar) === 0) {
    rec.outcome = 'failed-compose';
    rec.reason = `the sidecar at ${sidecarFile} carries no translated blocks; composing from it would strip this figure's text and draw nothing back`;
    return;
  }
  // 🔴 THE COMPOSE VINTAGE, READ AS LATE AS POSSIBLE. `publishFigureSvg` re-reads this file
  // after the composer has run — it must, because it MERGES its stamp into whatever the file
  // now holds — so a `writeSidecar` landing in between (a head editor approving THIS figure)
  // used to have the stamp certify blocks the SVG was never drawn from: composedHash ===
  // renderHash, effectiveState 'approved', no badge, `isStale` false, and the reader kept the
  // pre-correction artwork for ever. The publisher refuses `sidecar-moved` on a disagreement,
  // and this is the value it disagrees with.
  //
  // ⚠️ RE-READ RATHER THAN REUSING `rec.sidecar`, WHICH IS READ FOR THE WHOLE CHAPTER UP
  // FRONT. On a 50-figure run that read can be minutes old, and an approval landing in THAT
  // window is composed correctly — the composer reads the file, not our copy — so comparing
  // against the stale copy would refuse a publish that was right. Reading here narrows the
  // window to the compose itself, which is the part that cannot be closed.
  //
  // ⚠️ AND IT IS COPIED, NEVER RECOMPUTED FROM `blocks`: a sidecar whose stored hash disagrees
  // with its own blocks is legal, and hashing here would refuse it on every run for ever.
  // `rec.sidecar` is deliberately NOT overwritten — the report must say what the driver minted
  // or found, not what someone else wrote underneath it.
  const composeFrom = readSidecarFor(bookDir, rec.basename) || rec.sidecar;
  const composed = spawn({
    stage: 'compose',
    command: PYTHON,
    argv: [
      path.join(EXPERIMENT_DIR, 'figure-compose.py'),
      '--out',
      outDir,
      '--translations',
      sidecarFile,
    ],
    cwd: EXPERIMENT_DIR,
    env: { FIGTEXT_PYLIBS: path.join(EXPERIMENT_DIR, 'pylibs') },
    timeout: 900_000,
  });
  // ⚠️ THE VERDICT IS compose.json, NEVER THE EXIT CODE ALONE — `compose.py` keeps the English
  // for any key it cannot match and exits 0. The wrapper REMOVES translated.svg on any refusal,
  // so the file's presence means exit 0; reading the file is still what decides.
  const composeVerdict = readJson(path.join(outDir, 'compose.json'));
  if (
    composed.status !== 0 ||
    !composeVerdict ||
    composeVerdict.error ||
    !composeVerdict.outputPath
  ) {
    rec.outcome = 'failed-compose';
    rec.reason =
      (composeVerdict && composeVerdict.error) ||
      composed.stderr.trim().slice(-400) ||
      `figure-compose.py exited ${composed.status} and wrote no verdict`;
    return;
  }
  const svgPath = composeVerdict.outputPath;

  // ── STEP 10. MINT THE MAPPING ENTRY, THEN PUBLISH. ────────────────────────────────────
  const outputName = rec.mapping.outputName;
  if (path.extname(outputName) !== path.extname(svgPath)) {
    // The pre-flight builds the mintable name with a `.svg` literal while the composer's
    // extension is whatever it actually wrote. They agree today; if they ever stop, publishing
    // would copy one format's bytes into the other format's filename, silently.
    rec.outcome = 'failed-publish';
    rec.reason =
      `the composer produced ${path.basename(svgPath)} but image-mapping.json names ` +
      `${outputName}: publishing would write ${path.extname(svgPath)} bytes into a ` +
      `${path.extname(outputName)} file.`;
    return;
  }
  let minted = null;
  if (rec.mapping.status === 'mintable') {
    try {
      minted = mintMappingEntry(bookDir, rec.basename, outputName);
    } catch (err) {
      rec.outcome = 'failed-publish';
      rec.reason = `could not mint the image-mapping.json entry for ${rec.basename}: ${err.message}`;
      return;
    }
  }

  // 🔴 `publishFigureSvg` HAS THREE OUTCOMES, NOT TWO. It refuses with seven distinct reason
  // codes, and it also THROWS: `fs.copyFileSync` is unguarded, and so is the `writeSidecar`
  // that follows it — the second fires with the artwork ALREADY on disk, which is why the
  // rollback below only takes the mapping entry back and leaves an unreferenced file alone.
  // Such a file is inert (nothing points at it) and the next run republishes over it, whereas
  // a mapping entry with no file is a 404 on the reader's page.
  let result;
  try {
    result = publish({
      sidecarPath: sidecarFile,
      svgPath,
      metaPath: path.join(outDir, 'meta.json'),
      // Present even when null — the key's PRESENCE is what turns the check on, and a
      // legacy sidecar with no renderHash is a real expectation, not an absent one.
      expectedRenderHash: (composeFrom && composeFrom.renderHash) || null,
    });
  } catch (err) {
    restoreMapping(minted);
    rec.outcome = 'failed-publish';
    rec.reason = `publish-figure-svg.js THREW: ${err && err.message}`;
    return;
  }
  if (!result || !result.ok) {
    restoreMapping(minted);
    rec.outcome = 'failed-publish';
    rec.reason = `publish refused (${result ? result.reason : 'no result'}): ${result ? result.message : 'the publisher returned nothing'}`;
    return;
  }
  rec.published = {
    outputName: result.outputName,
    path: result.path,
    replaced: result.replaced,
    // ⚠️ RECORDED FROM THE RETURN VALUE FOR THE REPORT ONLY. §C138 was a bug in which the
    // publisher returned the correct stamp while writing the stale one, so nothing may treat
    // this as evidence that the file on disk is stamped — read the sidecar for that.
    composedHash: result.composedHash,
  };
}

/**
 * Walk one chapter's figures.
 *
 * ⚠️ `readSidecar`, `publish` and `booksRoot` are injectable for the same reason `spawn` is:
 * the live path WRITES, so its suite has to drive the real code against a throwaway tree.
 * `booksRoot` covers all three writers at once (sidecar, mapping entry, published SVG) because
 * every one of them derives its path from `bookDir`.
 *
 * ⚠️ `readSidecar` is injectable for a second reason, and it is not a convenience:
 * `books/efnafraedi-2e/figure-text/` DOES NOT EXIST — the campaign has minted no sidecar for a
 * real book yet — so on every chapter of the real corpus `readSidecar` returns null, `&&`
 * short-circuits, and the `skipped-current` branch below is unreachable from any corpus-driven
 * test. Two mutations of that branch survived all 57 tests before this seam existed. It is the
 * branch that decides whether 6b re-buys a figure, so it needs an exerciser, and the only
 * honest way to get one without writing into `books/` is to inject the reader.
 *
 * @param {ReturnType<typeof parseCli>} args
 * @param {{spawn?: Function, readSidecar?: Function, publish?: Function, booksRoot?: string}} [deps]
 */
export async function runFigures(args, deps = {}) {
  const spawn = deps.spawn || defaultSpawn;
  const readSidecarFor = deps.readSidecar || readSidecar;
  const publish = deps.publish || publishFigureSvg;
  const enumeration = enumerateChapterFigures(args.book, args.chapter, {
    modules: args.modules,
    booksRoot: deps.booksRoot,
  });

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
  // 🔴 BEFORE THE PER-FIGURE LOOP, AND SO BEFORE ANY MONEY. `loadImageBasenameMap` swallows a
  // corrupt payload into `[]`, which makes every figure read `mintable` and the pre-flight pass
  // — while `mintMappingEntry` refuses the same file one purchase later.
  assertMappingReadable(bookDir);
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
    sidecar: readSidecarFor(bookDir, f.basename),
    // 🔴 THE FILE IS THERE AND THE READ CAME BACK NULL — SEE `applySidecarGuard`. Recorded
    // beside the parsed value rather than replacing it, because every other consumer of
    // `rec.sidecar` (the spend gate, `--stale`, the drift guard, compose) wants the parsed
    // object and must keep seeing `null` here.
    sidecarUnreadable: false,
    artwork: null,
    edition: null,
    resolvedVia: null,
    // Set when two or more enumerated figures would be given ONE artwork file — by the de-hash,
    // or by the resolver itself. It turns `unresolved` from "the delivery has a hole" into
    // "we refused to guess", which is a different fact and gets its own report line.
    artworkContest: null,
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
    // The paid half's own record. `spent` is TRUE only when the MT was actually spawned for
    // this figure, so a run's total spend is a count over the records rather than a claim.
    spent: false,
    sidecarWritten: false,
    droppedKeys: [],
    published: null,
    warnings: [],
  }));

  for (const rec of records) applySidecarGuard(rec, bookDir);

  // `--stale`: narrow to the figures that already HAVE a sidecar, i.e. the ones a recompose can
  // finish. Selecting them OUT of the run rather than giving them an outcome is deliberate and
  // matches `--figure`: the tally then describes what was worked on, and the partition still
  // sums. Selecting nothing is a legitimate answer here (nothing is stranded), so — unlike a
  // `--figure` that names no figure — it is not a refusal.
  //
  // 🔴 THE PREDICATE IS "A SIDECAR FILE IS PRESENT", NOT "readSidecar RETURNED SOMETHING". An
  // unreadable sidecar HAS a file, so `--stale` must SELECT it — deselecting it printed the
  // operator the exact opposite of the truth: "have no sidecar … the ones a run WITHOUT
  // --stale would buy", about the one file in the chapter that must never be bought again.
  const selected = args.stale ? records.filter((r) => r.sidecar || r.sidecarUnreadable) : records;

  // 🔴 "ALREADY DONE" IS A HASH QUESTION, NOT A FILE QUESTION, AND IT IS ASKED FIRST — before
  // anything is resolved or prepared, because a figure that needs nothing should cost nothing.
  // ⚠️ A STALE SIDECAR MUST NOT BE SKIPPED. `renderHash` with no `composedHash` means the
  // figure was PAID FOR and never published; skipping it would strand that spend for ever.
  // ⚠️ `--force` suppresses ONLY this skip. It cannot make a figure spendable, because
  // spendability is decided by whether a sidecar EXISTS, one branch further down.
  for (const rec of selected) {
    if (rec.sidecar && !isStale(rec.sidecar) && !args.force) {
      rec.outcome = 'skipped-current';
      rec.reason = 'sidecar is published and current';
    }
  }

  const pending = selected.filter((r) => r.outcome === null);
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
    // 🔴 THE CONTEST IS A PROPERTY OF THE CHAPTER, NOT OF THIS RUN'S SELECTION — so when
    // `--module` narrowed the enumeration, ask the chapter again. It is pure file reading, no
    // spawn, and it is what stops `--module m68852` (one claimant, no second record to compare
    // against) buying the picture that belongs to the module next door.
    const chapterFigures = args.modules
      ? enumerateChapterFigures(args.book, args.chapter, { booksRoot: deps.booksRoot }).figures
      : enumeration.figures;
    const contested = dehashStemClaims(chapterFigures.map((f) => f.basename));

    const dehashable = [];
    for (const rec of hashed) {
      const stem = rec.basename.replace(HASH_SUFFIX, '');
      const claimants = contested.get(stem);
      if (claimants) rec.artworkContest = { source: stem, claimants };
      else dehashable.push(rec);
    }
    if (dehashable.length) {
      const stripped = dehashable.map((r) => r.basename.replace(HASH_SUFFIX, ''));
      const second = resolveArtwork(spawn, args.book, [...new Set(stripped)]);
      dehashable.forEach((rec, i) => {
        const hit = second.get(stripped[i]);
        if (hit) {
          rec.artwork = hit.path;
          rec.edition = hit.edition;
          rec.resolvedVia = 'de-hashed';
        }
      });
    }
  }

  // 🔴 THE BACKSTOP, AND IT IS NOT A DUPLICATE OF THE GUARD ABOVE. The invariant is "one
  // artwork file, one figure", however the two got there: the resolver itself can map two
  // distinct names onto one delivered file, which no stem check can see. Neither guard can
  // replace the other — this one cannot fire when a narrowed run holds a single claimant, and
  // the stem guard cannot see a collision that never involved a de-hash. Measured 0 times on
  // the corpus today, so this is the class rather than the instance.
  const byArtwork = new Map();
  for (const rec of pending) {
    if (!rec.artwork) continue;
    if (!byArtwork.has(rec.artwork)) byArtwork.set(rec.artwork, []);
    byArtwork.get(rec.artwork).push(rec);
  }
  for (const [file, claimants] of byArtwork) {
    if (claimants.length < 2) continue;
    const names = claimants.map((r) => r.basename).sort();
    for (const rec of claimants) {
      rec.artwork = null;
      rec.edition = null;
      rec.resolvedVia = null;
      rec.artworkContest = { source: file, claimants: names };
    }
  }

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figure-run-'));
  try {
    for (const rec of pending) {
      if (!rec.artwork) {
        rec.outcome = 'unresolved';
        rec.reason = rec.artworkContest
          ? `REFUSED, not missing: ${rec.artworkContest.claimants.length} enumerated figures ` +
            `would be handed the same artwork ${JSON.stringify(rec.artworkContest.source)} ` +
            `(${rec.artworkContest.claimants.join(', ')}). They are different figures, so at ` +
            `most one of them owns that picture and nothing here can tell which — translating ` +
            `on a guess publishes one figure's artwork under another's caption and alt text, ` +
            `and no downstream check can see it. Deliver the artwork under each figure's own ` +
            `basename, or narrow the run to the one that owns it once that is known.`
          : 'no artwork in any configured source tree';
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
      // 🔴 THE PRE-FLIGHT RUNS HERE, PER FIGURE, AND NOT IN A SECOND PASS AFTERWARDS. It has
      // to be ahead of THIS figure's paid stage, or "refuses an unmintable figure before the
      // MT is called" is unsatisfiable. Nothing outside this loop needs it: every record is
      // either `skipped-current` or in `pending`, and neither of the outcomes reached by the
      // early `continue` above is PUBLISH_BOUND.
      applyDriftGuard(rec);
      applyMappingPreflight(rec, { mapped, mintIndex, bookDir });
      if (!args.dryRun)
        processFigureLive(rec, {
          spawn,
          publish,
          readSidecar: readSidecarFor,
          args,
          bookDir,
          outDir,
        });

      // 🔴 PEAK DISK, IN BOTH MODES. One figure's output directory is ~14 MB and /tmp here is
      // a 4.9 GB tmpfs routinely over 90% full, so 30 figures kept at once is ~420 MB and a
      // whole book ~16 GB — an ENOSPC that reads as a code fault. The live path needs the
      // directory right up to publish (compose reads artwork.svg from it, the MT writes
      // translations-api.json into it) and not one figure longer.
      fs.rmSync(outDir, { recursive: true, force: true });
      rec.outDir = null;
    }

    const tally = emptyTally();
    for (const rec of selected) tallyOutcome(tally, rec.outcome);
    const shipsUndecoded = selected.filter(
      (r) => r.outcome === 'translated' && r.holds && r.holds.undecoded > 0
    );

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
      enumerated: selected.length,
      // How many the chapter holds that this run did not work on — `--stale` narrows the run,
      // and a report that silently dropped them would look like a chapter that shrank.
      deselected: records.length - selected.length,
      figures: selected,
      tally,
      // 🔴 COUNTED OVER THE RECORDS, BECAUSE A TALLY COUNTS BUCKETS AND THIS IS A PROPERTY
      // OF A FIGURE INSIDE ONE. A `translated` figure may still carry labels the read layer
      // could not decode — see `verdict`'s NOTE and the report section that names them.
      verdict: verdict(tally, selected.length, {
        undecodedFigures: shipsUndecoded.length,
        undecodedLabels: shipsUndecoded.reduce((n, r) => n + r.holds.undecoded, 0),
      }),
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

  if (result.deselected > 0) {
    lines.push(
      `  --stale: ${result.deselected} figure(s) in this chapter have no sidecar and were not ` +
        `selected. They are the ones a run WITHOUT --stale would buy.`
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
      by((f) => f.outcome === 'unresolved' && !f.artworkContest)
    )
  );
  // 🔴 A REFUSAL IS NOT A HOLE, AND THE OPERATOR'S NEXT ACTION IS DIFFERENT. A hole is fixed in
  // the artwork delivery; a contest is fixed by giving each figure its own file — and until then
  // the run is CORRECT to translate neither. Kept out of the list above so a delivery count is
  // not quietly inflated by our own refusals.
  const contests = new Map();
  for (const f of result.figures) {
    if (f.artworkContest) contests.set(f.artworkContest.source, f.artworkContest.claimants);
  }
  for (const [source, claimants] of contests) {
    lines.push(
      `  ⚠️ REFUSED to guess: ${claimants.length} figures would share one artwork ` +
        `${JSON.stringify(source)} — ${claimants.join(', ')}`
    );
  }
  // 🔴 WHICH FIGURE GOT WHICH FILE. `summarise` printed neither `artwork` nor `resolvedVia`, so
  // a --dry-run — the one report an operator reads BEFORE spending — was silent about two
  // figures sharing a source. The de-hashed ones are where a lookup-only fallback can put the
  // wrong picture on the page, so they are the ones named with their file.
  const dehashed = result.figures.filter((f) => f.resolvedVia === 'de-hashed');
  if (dehashed.length) {
    lines.push(`  de-hashed to stripped-name artwork, LOOKUP ONLY (${dehashed.length}):`);
    for (const f of dehashed) lines.push(`    ${f.basename}  <-  ${f.artwork}`);
  }
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
  // 🔴 ONLY THE FIGURES THIS RUN WOULD ACTUALLY PUBLISH. Measured on real chemistry ch04
  // before this line was narrowed: the work-list named 9 figures and ALL 9 were copies — an
  // entry nothing was ever going to mint, for a figure nothing was ever going to publish, so
  // the list was wrong for every row it printed.
  lines.push(
    ...nameList(
      'would need an image-mapping.json entry minted before publish',
      by((f) => f.outcome === 'translated' && f.mapping && f.mapping.status === 'mintable')
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

  // 🔴 THE HOLDS THE READ LAYER COULD NOT RESOLVE, FOR EVERY OUTCOME — NOT ONLY `copied-*`.
  // The `held=` triple above is printed only inside the copied block, and the two holds that
  // mean something is BROKEN can occur in any bucket. Measured 2026-09-07 on
  // CNX_Chem_05_02_FoodLabel: 47 blocks / 28 sendable / 2 undecoded classifies `translated`
  // (correctly — `sendable > 0` is tested first), so neither the copied block nor the
  // `unreadable-text` NOTE could name it, and the composed SVG shipped two live `<text>`
  // elements reading `(cid:127) 5% or less` under VERDICT ok.
  // ⚠️ `missingFont` is REPORTED here and routed nowhere. It is a RESIDUE, not evidence — it
  // fires with a complete font table — so classifying on it would re-commit the plan's
  // `formTextXObjects > 0` error (216 of 216 false positives). A line is the honest shape.
  const unreadableHolds = result.figures.filter(
    (f) => f.holds && (f.holds.undecoded > 0 || f.holds.missingFont > 0)
  );
  if (unreadableHolds.length) {
    lines.push(
      `  blocks the read layer could not read (${unreadableHolds.length}) — never bought, ` +
        `so these labels ship in English:`
    );
    for (const f of unreadableHolds) {
      lines.push(
        `    ${f.outcome.padEnd(16)} ${f.holds.undecoded} undecodable, ` +
          `${f.holds.missingFont} missing-font of ${f.blocks} block(s)  ${f.basename}`
      );
    }
  }

  // 🔴 `figure-prepare.py`'s WARNINGS, WHICH REACHED NOBODY. `rec.warnings` was written and
  // never read, and the child's stdout — where prepare prints the same facts as `!! …` lines
  // — is captured by `defaultSpawn` and used only on the failure path. The design's
  // Invariant 5 is "Warnings are surfaced, not swallowed"; this is where that happens.
  // ⚠️ EVERY WARNING, FOR EVERY OUTCOME, AND DELIBERATELY UNFILTERED. `unparsable content
  // stream …` — figure-prepare.py: "Silence there would mean a form whose English may still
  // be drawn, counted as clean" — lands on figures that classify `copied-*`, so keying this
  // on `translated` would silence it exactly where it matters.
  // ⚠️ THE VOLUME WAS MEASURED, NOT GUESSED: real efnafraedi-2e ch05, 24 figures → 35
  // warnings across 20 of them, of which **34 of 35 are `subset font …`**. That one benign
  // kind is 97% of the channel, and it is tempting to filter it here. Do not: the driver has
  // no severity information, `build_warnings` emits a flat list of strings, and a
  // benign-kinds enumeration maintained HERE would be a second copy of the producer's
  // vocabulary — drifting silently, in the direction that hides a warning. If a kind is ever
  // worth suppressing, suppress it in the PRODUCER, which knows what it means.
  const warned = result.figures.filter((f) => f.warnings && f.warnings.length);
  if (warned.length) {
    const total = warned.reduce((n, f) => n + f.warnings.length, 0);
    lines.push(
      `  figure-prepare.py warnings — ${total} across ${warned.length} figure(s), its own ` +
        `!! lines:`
    );
    for (const f of warned) lines.push(`    ${f.basename}: ${f.warnings.join('; ')}`);
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

  // 🔴 THE SPEND, AS A COUNT OVER THE RECORDS. `spent` is set at the paid spawn and nowhere
  // else, so this line cannot report a purchase that did not happen or hide one that did.
  // ⚠️ It is printed on a dry run too, where it is always zero — a line that appears only when
  // it is non-zero is a line nobody learns to look for.
  if (result.mode === 'live') {
    const spent = result.figures.filter((f) => f.spent);
    const published = result.figures.filter((f) => f.published);
    lines.push('');
    lines.push(
      `  MT spawned for ${spent.length} figure(s) — only a figure with NO sidecar is spendable`
    );
    lines.push(`  published ${published.length} figure(s) into ${result.bookDir}/media/`);
    lines.push(
      ...nameList(
        'bought this run',
        spent.map((f) => f.basename)
      )
    );
    const dropped = result.figures.filter((f) => f.droppedKeys.length);
    for (const f of dropped) {
      lines.push(
        `  ⚠️ ${f.basename}: the MT returned ${f.droppedKeys.length} empty value(s) ` +
          `(${f.droppedKeys.join(', ')}) — those labels ship in English`
      );
    }
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
