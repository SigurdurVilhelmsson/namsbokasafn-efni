#!/usr/bin/env node
/**
 * remt-sweep.js — the §C82 battery's BASE-RATE SWEEP (Plan B Task 13).
 *
 * Runs every registered check over the EXISTING corpus and reports, per check:
 * the unit it judges, the population offered, how many it skipped, how many it
 * tripped, and the resulting base rate. That rate is what Global Constraint 4
 * consumes: "a post-MT check that blocks must additionally have a measured base
 * rate <= ~5%".
 *
 * ── WHY THIS IS A SEPARATE TOOL AND NOT `--sweep` ON `remt-battery.js` ────────
 * Plan B Task 13 says "Modify `tools/remt-battery.js`". It is split here
 * deliberately, and the reason is not tidiness:
 *
 * ① `tools/remt-battery.js` PERFORMS NO I/O AT ALL — no `fs` import — and its
 *    own docstring makes that a load-bearing claim, tied to
 *    `tools/__tests__/source-write-guard.test.js`. A sweep must read the
 *    read-only OpenStax source tree. Putting the reader there flips that claim.
 * ② A sweep loader is NOT the run's ctx loader, and merging them would make it
 *    one by accident. The ctx-loader design questions are OPEN and belong to
 *    Plan C: §C82 L19 (chapter-metadata units have no source counterpart),
 *    L21 (a gate can assert identity and non-emptiness, never VINTAGE), L36①
 *    and the L19 amendment (organic's `exercises` bundles are 91% of that
 *    book's segments and have no source counterpart at all). This file answers
 *    NONE of them. It chooses a MEASUREMENT POPULATION and states it; it does
 *    not decide what a paid run does with a unit it cannot resolve.
 *    ▶ Read every population choice below as "what this measurement covers",
 *    never as "what the loader should do".
 * ③ Hiding the reader in `tools/lib/` behind a flag on the CLI would have been
 *    the worst of the three: `source-write-guard` nets TOP-LEVEL `tools/*.js`
 *    text only, so the tripwire would go quiet while the tool became a real
 *    toucher. This file names the source tree in its own text ON PURPOSE, trips
 *    that guard, and is classified read-only in its ALLOW set.
 *
 * 🔴 THIS TOOL READS; IT NEVER WRITES. Every path it opens is opened for
 * reading, and it creates no file. It is a measurement instrument.
 *
 * ── THE RULE THIS TOOL EXISTS TO OBEY ────────────────────────────────────────
 * 🔴 EVERY ROW CARRIES ITS OWN UNIT AND ITS OWN DENOMINATOR. The battery's 33
 * checks judge FIVE different units, and Plan B's own Task 13 text ("--sweep
 * runs every check over all 220 existing EN/IS pairs") is wrong twice over:
 * "pairs" is only Tier 1's unit — and the 220 is NOT stale, which is the half a
 * cold reader gets wrong. Re-measured 2026-08-27: `02-for-mt` holds exactly 220
 * `-segments.en.md` and `02-mt-output` exactly 220 `-segments.is.md`, and the two
 * basename multisets are IDENTICAL, so "220 EN/IS pairs" is a current, exactly
 * paired count OF A THIRD UNIT. It is not Tier 1's 166 (which additionally
 * requires a source CNXML) and not Tier 2's 197 (220 - 23 chapter-metadata,
 * verified). The spec's 227 is a fourth, also real. ▶ FOUR live counts of the
 * same corpus; none is wrong and none is interchangeable. Measured 2026-08-27:
 *
 *   tier 0  a BOOK                    2
 *   tier 1  a MODULE PAIR           166   source-CNXML + live EN segment file
 *   tier 2  an IS SEGMENT FILE      197   live `-segments.is.md`, metadata excluded
 *   tier 3  a MODULE x TRACK        161   translated CNXML actually on disk
 *   tier 4  a CHAPTER x TRACK CELL  112   of which 26 carry >=1 published HTML
 *
 * ⚠️ 166 AND 197 ARE BOTH "THE CORPUS", AND THEY ARE DIFFERENT NUMBERS. The
 * register's authoritative "197" is `mtOutputSegmentFiles`; Tier 1's population
 * is `modulesWithSegments`, and the 31-unit delta is organic's `exercises`
 * bundles, which have no source counterpart to pair with. Quoting one number
 * across 33 checks is exactly the error this campaign keeps recording — "a
 * measurement generalised one step past its coverage".
 *
 * ⚠️ AND THE CORPUS IS CHEMISTRY-SHAPED. Organic contributes 17 of the 166
 * module pairs against 342 source modules: that book is ~5% extracted (§C82
 * L59). State that beside any rate quoted from this tool.
 *
 * ── WHAT A TIDY SWEEP WOULD MEAN ─────────────────────────────────────────────
 * 🔴 AN ALL-GREEN SWEEP IS THE FAILURE MODE, NOT THE GOAL. Plan B's acceptance
 * expects specific REDS, and seeing them is what proves the sweep measures
 * rather than reports zeros:
 *   E5              ~100% FAIL   the committed vintage predates §C81
 *   R5 / A5 raw     over the 5% bar, correctly disqualified from blocking
 *   A2a / A4 / A8   SKIPPED, examined 0 — no module carries a run record
 *   K3              SKIPPED on every cell — no before-snapshot exists anywhere
 * A sweep that turned those green would mean the instrument broke, not that the
 * corpus improved.
 *
 * ── THE STRUCTURAL GUARD, AND IT IS THE MOST IMPORTANT LINE IN THE FILE ──────
 * 🔴 THE PARTITION OVER `REGISTRY` MUST BE TOTAL. Every registered id is either
 * SWEPT (it has a ctx builder here) or UNMEASURABLE (it has a stated reason).
 * A check that is neither is a check this tool would silently omit — and an
 * omitted check reads, in the report, exactly like a check with nothing to
 * report. `assertTotalPartition()` throws instead. This is §C60 at the sweep
 * level: a run that judged nothing must not read clean.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './lib/parseArgs.js';
import { REGISTRY, runCheck, VERDICT } from './lib/remt-battery.js';

// The registry wiring point, exactly as in `remt-battery.js`: importing a tier
// module is the ONLY thing that puts its checks in REGISTRY (§C82 L3).
import './lib/remt-checks-glossary.js';
import './lib/remt-checks-extract.js';
import './lib/remt-checks-mt.js';
import './lib/remt-checks-output.js';
import './lib/remt-checks-chapter.js';

import { spawnGlossaryPayloadCheck } from './lib/remt-checks-glossary.js';
import { spawnSchemaCheck } from './lib/remt-checks-output.js';
import { readChapterFromDisk } from './cnxml-render-fidelity-check.js';

export const REPO_ROOT = path.resolve(import.meta.dirname, '..');

/**
 * The run's scope, and it is CLAUDE.md's, not this file's: chemistry and organic
 * are the two kept books (§C80 re-scope, §C109). The other three are withdrawn
 * from publication, and pointing a run at them is forbidden — their committed
 * bytes remain legitimate as static test fixtures, which is a different thing.
 */
export const SWEEP_BOOKS = Object.freeze(['efnafraedi-2e', 'lifraen-efnafraedi']);

/** Publication/translation tracks, in the bare-directory convention. */
export const SWEEP_TRACKS = Object.freeze(['mt-preview', 'faithful']);

/**
 * Checks this sweep cannot measure, each with the reason it cannot.
 *
 * 🔴 A REASON IS MANDATORY AND IS PART OF THE OUTPUT. "Unmeasurable" printed
 * without a cause is indistinguishable from "measured, found nothing" once it
 * reaches a summary table — which is the §C60 shape the whole battery exists to
 * refuse. Every entry below names the specific artefact that does not exist.
 *
 * ⚠️ NONE of these is a defect in the check. Three of them describe a corpus
 * that has not been produced yet (the re-extract has not run), and the fourth
 * describes a gate whose input costs real money to produce.
 */
export const UNMEASURABLE = Object.freeze({
  E6: {
    reason:
      "needs `emittedFiles` scoped to THIS RUN's extract output. The two kept books' EXTRACT " +
      'trees hold 14,634 historical backup files (02-for-mt 3,110 + 02-structure 11,524; ' +
      '2026-03-08 -> 2026-08-12, re-derived 2026-08-27), so offering a directory listing ' +
      'would measure history, not a run — and E6 is BLOCKING. ' +
      'STATE THE POPULATION WITH THAT NUMBER: every `*.backup.*` under the two books is ' +
      '26,618, because 03-translated adds 11,984 belonging to the INJECTOR, not the extract. ' +
      'The wider count reads as the narrower one having gone stale; it has not.',
    availableAfter: 'the re-extract, when a run-scoped emitted-file list exists',
  },
  E7: {
    reason:
      'needs BOTH `committedExtract` and `freshExtract` snapshots; the fresh one does not ' +
      'exist until the re-extract. ' +
      'NOTE: until Task 13 neither key appeared in the CheckContext typedef (§C82 L105), so a ' +
      'loader built to the documented contract left E7 permanently SKIPPED — and E7 is advisory, ' +
      'so that read as ignorable rather than broken. Both are documented now, and ' +
      '`remt-ctx-contract.test.js` derives the read set mechanically so a seventh cannot ship.',
    availableAfter: 'the re-extract',
  },
  E9: {
    reason:
      'a PRE-FLIGHT over run state, not a corpus unit: it takes `locked`, `handEdits`, ' +
      "`inputs`, `force` and `costEstimate`. Leg 5's estimate comes from " +
      '`api-translate --force --dry-run`. ⚠️ CORRECTED 2026-08-31: this reason used to say ' +
      'that invocation "spends real money". It does NOT — the `--dry-run` block reads files, ' +
      'sums characters, calls `estimateIsk` and `process.exit(0)`s BEFORE `createClient()`, so ' +
      'it opens no API client. The TOOL costs money; that FLAG PATH does not, and the ' +
      "register's own 1,129 ISK figure for chemistry ch15 was obtained through it at 0 ISK. " +
      'E9 stays unmeasurable in a sweep for the reason above — it is a pre-flight over RUN ' +
      'state the driver produces once per run, not a property of a corpus unit — not because ' +
      'reaching leg 5 would cost anything.',
    availableAfter: 'never in a sweep; the driver produces it once, per run',
  },
  R2: {
    reason:
      'needs `injectReport` — the object `buildCnxml()` returns. Producing one means ' +
      "assembling the injector's inputs (02-structure, parsed segments, equations) and " +
      'running the injection, i.e. running a PIPELINE STAGE. That is Plan C driver work; a ' +
      'measurement instrument that ran it would stop being a measurement instrument.',
    availableAfter: "Plan C's driver, which calls `buildCnxml` and hands the gate its report",
  },
});

/**
 * Global Constraint 4's threshold: "a post-MT check that blocks must additionally
 * have a measured base rate <= ~5%".
 */
export const BLOCKING_RATE_BAR = 0.05;

/**
 * Which tiers judge inputs the re-MT loop REGENERATES — and it is all of them
 * except one.
 *
 * 🔴 THIS IS THE DIFFERENCE BETWEEN "THIS CHECK IS MISCALIBRATED" AND "THIS DATA
 * IS BROKEN", AND THE SWEEP CANNOT BE READ WITHOUT IT. §C82 recorded the shape
 * for Tier 3 ("the first tier whose inputs are outputs of the pipeline it
 * judges… so no Tier-3 base rate measured today is a rate for the code that will
 * run"). Measured here, it reaches further down:
 *
 *   tier 1  reads 02-for-mt        REGENERATED by the re-extract
 *   tier 2  reads 02-mt-output     REGENERATED by the re-MT
 *   tier 3  reads 03-translated    REGENERATED by the re-inject
 *   tier 4  reads 05-publication   REGENERATED by the re-render
 *   tier 0  reads the GLOSSARY     *** NOT regenerated by the loop ***
 *
 * ▶ So a tier-1..4 rate over the bar is a statement about the COMMITTED VINTAGE
 * and must be re-measured after the run's own extract — E5 is already documented
 * that way, and E1 (62.7%) and A6 (58.4%) are the same shape.
 * ▶ A TIER-0 rate over the bar is a statement about DATA THE RUN WILL CONSUME.
 * Nothing in the loop fixes it, so it is a precondition, not a calibration
 * question. Measured 2026-08-27: G1 and G3 are BLOCKING and FAIL on both books.
 */
export const TIER_INPUT_REGENERATED = Object.freeze({
  0: false,
  1: true,
  2: true,
  3: true,
  4: true,
});

/**
 * WHICH STAGE rewrites each tier's input.
 *
 * ⚠️ THE OVER-BAR MESSAGE USED TO SAY "re-measure after the run's own EXTRACT"
 * FOR ALL FOUR, AND THAT IS ONLY TIER 1's STAGE. A6 (tier 2, 58.4%, BLOCKING) is
 * a live instance: it reads `ctx.isText` and nothing else, so its rate moves when
 * the re-MT lands, not when the extract does. Telling a reader to re-measure one
 * stage too early is telling them to re-measure while the number cannot have
 * changed — and to conclude from it.
 * ⚠️ IT NAMES THE STAGE THAT PRODUCES A TIER'S OWN ARTEFACT, NOT THE ONLY STAGE
 * THAT CAN MOVE ITS ROWS. Tier 3 is the exception worth stating: R1/R5 read
 * `03-translated` (the inject), but R4's `auditResults` come from a tool reading
 * `05-publication`, which the re-RENDER rewrites. A tier-3 row over the bar may
 * therefore need re-measuring after EITHER stage, depending which check it is.
 */
export const TIER_REGENERATED_BY = Object.freeze({
  1: "the run's own re-EXTRACT (02-for-mt)",
  2: 'the re-MT (02-mt-output)',
  3: 'the re-INJECT (03-translated)',
  4: 'the re-RENDER (05-publication)',
});

/**
 * Checks whose ctx comes from ANOTHER PROCESS, and what their row means without
 * `--with-spawns`.
 *
 * 🔴 WITHOUT THE SPAWN, THESE ROWS ARE NOT BASE RATES, AND ONE OF THEM LOOKS
 * EXACTLY LIKE ONE. Measured: with spawns off, G5 reports `FAIL — producer NOT
 * CHECKED` on both books, i.e. **100%**. That is the contract working as
 * designed — "G5's producer leg is a FINDING when `payloadVerdict` is absent,
 * not a pass" — but it is a statement about the INVOCATION, not about the
 * corpus, and a summary table renders the two identically. R3 and R4 fail the
 * other way and SKIP, which at least looks inert.
 * ▶ So a spawn-dependent row printed without its spawn reports `rate: null` and
 * carries this note. §C60 one level up: the sweep's own summary must not turn
 * "I did not supply the input" into a measurement.
 */
export const SPAWN_DEPENDENT = Object.freeze({
  G5: 'needs spawnGlossaryPayloadCheck(); without it G5 reports FAIL (producer NOT CHECKED) — a refusal, not a rate',
  R3: 'needs spawnSchemaCheck() (jing + the gitignored RelaxNG schema); without it R3 SKIPs',
  R4: 'needs audit-render-output.js --json; without it R4 SKIPs',
});

/* ────────────────────────────────────────────────────────────────────────────
 * POPULATIONS
 *
 * ⚠️ EVERY WALKER BELOW IS A MEASUREMENT POPULATION, NOT A RUN POLICY. See ② in
 * the header. Where a walker excludes a class, it says which and why, because an
 * unstated exclusion is how a denominator quietly becomes the wrong one.
 * ──────────────────────────────────────────────────────────────────────────── */

const bookDir = (book) => path.join(REPO_ROOT, 'books', book);
const exists = (p) => fs.existsSync(p);
const readIf = (p) => (exists(p) ? fs.readFileSync(p, 'utf8') : null);
const dirsIn = (p) =>
  exists(p)
    ? fs
        .readdirSync(p, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()
    : [];
const filesIn = (p) =>
  exists(p)
    ? fs
        .readdirSync(p, { withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => e.name)
        .sort()
    : [];

/**
 * The chapter directories of a source tree — and NOTHING ELSE.
 *
 * 🔴 `readdirSync` OVER `01-source` RETURNS `media`, `docx` AND `exercises` TOO,
 * AND THE FIRST VERSION OF `chapterCellUnits` COUNTED ALL THREE AS CHAPTERS.
 * Measured: it produced a Tier-4 population of 120 against §C82 L88's
 * independently measured 112 — four non-chapter directories across two books,
 * times two tracks. ⚠️ THE INFLATION WAS INVISIBLE IN THE VERDICT COLUMN: a
 * `media` cell has no published HTML, so it SKIPs, and a report with 8 extra
 * SKIPs reads as orderly. Only the DENOMINATOR moved — i.e. every Tier-4 rate
 * was quietly computed over the wrong base. It was caught by the rate
 * disagreeing with a number measured by a different route, which is the only
 * instrument that could have caught it.
 * ▶ The predicate is the `ch`-prefixed source convention plus the appendix
 * directory; see CLAUDE.md § Directory Structure for why that spelling differs
 * from the BARE one the publication track uses.
 */
export function sourceChapterDirs(book) {
  return dirsIn(path.join(bookDir(book), '01-source')).filter(
    (d) => d === 'appendices' || /^ch\d+$/.test(d)
  );
}

/** Parse JSON, or null. Used only where "absent" and "malformed" are both inert. */
function readJsonOrNull(p) {
  const t = readIf(p);
  if (t == null) return null;
  try {
    const v = JSON.parse(t);
    // §C21/§C82 L57: `null` parses. A non-object payload is not a document.
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

/**
 * TIER 1's unit: a module with BOTH a source CNXML and a live EN segment file.
 *
 * ⚠️ IT DRIVES FROM THE SOURCE SIDE, AND THAT IS THE POINT — BUT NOT FOR THE
 * REASON USUALLY GIVEN. The inherited rationale is that a naive `endsWith('.md')`
 * walk over `02-for-mt` counts dated backups as modules. **Measured 2026-08-27:
 * it cannot.** Chemistry's `02-for-mt` holds 3,102 backups and **0 of them end in
 * `.md`** — the shape is `<name>-segments.en.md.backup.<ISO>`. The real
 * over-count is 70: **49 `(b)`/`(c)`/`(d)` re-extract variants** (`m68865-segments(b).en.md`)
 * **plus 21 `chapter-metadata`**, taking a naive walk from 149 to 219. A
 * `.cnxml`-driven walk sees neither, so the CONSTRUCTION is right and only its
 * stated cause was wrong.
 * (Same construction as `tools/__tests__/helpers/remt-corpus.js`'s
 * `modulesWithSegments`; `tools/__tests__/remt-sweep.test.js`'s "the sweep's
 * walkers agree UNIT-FOR-UNIT with the test helper's" asserts the two against each
 * other, with a non-empty control, so they cannot drift apart silently.)
 */
export function modulePairUnits(book) {
  const srcRoot = path.join(bookDir(book), '01-source');
  const segRoot = path.join(bookDir(book), '02-for-mt');
  const out = [];
  for (const ch of sourceChapterDirs(book)) {
    for (const f of filesIn(path.join(srcRoot, ch)).filter((f) => f.endsWith('.cnxml'))) {
      const m = f.replace(/\.cnxml$/, '');
      if (exists(path.join(segRoot, ch, `${m}-segments.en.md`))) out.push({ book, ch, module: m });
    }
  }
  return out;
}

/**
 * TIER 2's unit: a LIVE `02-mt-output` IS segment file.
 *
 * ⚠️ A DIFFERENT, LARGER POPULATION THAN TIER 1's, deliberately. Tier 2 judges
 * what came BACK from the paid MT, and a large part of that has no source
 * counterpart: organic's `exercises-segments.is.md` bundles are their own files
 * (31 of them, 6,664 segments). Driving from the source side would drop exactly
 * where A1's only natural must-trip lives.
 * ⚠️ `chapter-metadata-*` IS EXCLUDED — those units carry `SEG:chapter:` markers
 * and no module id, and Tier 1's own ctx guard treats them as a separate class.
 * ⚠️ The `-segments.is.md` suffix filter is what keeps dated backups out: a
 * backup is `…-segments.is.<date>.md` and cannot end with the live suffix.
 */
export function isFileUnits(book) {
  const root = path.join(bookDir(book), '02-mt-output');
  const out = [];
  const walk = (dir, ch) => {
    for (const e of fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, e.name);
      else if (e.name.endsWith('-segments.is.md') && !e.name.startsWith('chapter-metadata')) {
        out.push({ book, ch, isPath: p, module: e.name.replace(/-segments\.is\.md$/, '') });
      }
    }
  };
  if (exists(root)) walk(root, null);
  return out;
}

/** TIER 3's unit: a translated CNXML that actually exists, per track. */
export function translatedUnits(book) {
  const out = [];
  for (const track of SWEEP_TRACKS) {
    const root = path.join(bookDir(book), '03-translated', track);
    if (!exists(root)) continue;
    for (const ch of dirsIn(root)) {
      for (const f of filesIn(path.join(root, ch)).filter((f) => f.endsWith('.cnxml'))) {
        out.push({
          book,
          track,
          ch,
          module: f.replace(/\.cnxml$/, ''),
          cnxmlPath: path.join(root, ch, f),
        });
      }
    }
  }
  return out;
}

/**
 * TIER 4's unit: a chapter x track CELL.
 *
 * ⚠️ THE POPULATION IS THE CELLS THAT COULD EXIST, NOT THE ONES THAT DO. It is
 * built from the SOURCE tree's chapter directories crossed with both tracks, so
 * a whole track that was never rendered still appears — as SKIPPED, with a
 * reason. Building it from `05-publication` instead would make an unrendered
 * track invisible, and "no cell" and "a cell with nothing in it" are exactly the
 * two states a blocking tier must not confuse (§C82 L88's control: 0 of 112
 * cells are total-render-loss, and that number only means something because the
 * denominator counts cells that could have had HTML).
 * ▶ The chapter key is the BARE publication-track convention (`'01'`,
 * `'appendices'`) — never `-1`, and never `chNN`. Both spellings read as EMPTY
 * through `readChapterFromDisk` (§C82 L100①).
 */
export function chapterCellUnits(book) {
  const chapters = sourceChapterDirs(book).map((d) =>
    d === 'appendices' ? 'appendices' : d.replace(/^ch/, '')
  );
  const out = [];
  for (const track of SWEEP_TRACKS)
    for (const chapter of chapters) out.push({ book, track, chapter });
  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
 * ctx BUILDERS — one per tier. Each returns the ctx for ONE unit.
 * These read files; the gates stay pure (Global Constraint 5).
 * ──────────────────────────────────────────────────────────────────────────── */

function tier0Ctx(unit, { spawns }) {
  const dir = bookDir(unit.book);
  const payloadPath = path.join(dir, 'glossary', 'glossary-unified.json');
  const glossary = readJsonOrNull(payloadPath);
  const glossariesByBook = {};
  for (const b of SWEEP_BOOKS) {
    const g = readJsonOrNull(path.join(bookDir(b), 'glossary', 'glossary-unified.json'));
    if (g) glossariesByBook[b] = g;
  }
  return {
    book: unit.book,
    glossary,
    glossariesByBook,
    payloadText: readIf(payloadPath) ?? undefined,
    payloadVerdict: spawns ? spawns.glossary.get(unit.book) : undefined,
  };
}

function tier1Ctx(unit) {
  const dir = bookDir(unit.book);
  return {
    book: unit.book,
    chapter: unit.ch.replace(/^ch/, ''),
    module: unit.module,
    cnxml: readIf(path.join(dir, '01-source', unit.ch, `${unit.module}.cnxml`)) ?? undefined,
    segText:
      readIf(path.join(dir, '02-for-mt', unit.ch, `${unit.module}-segments.en.md`)) ?? undefined,
  };
}

function tier2Ctx(unit) {
  const dir = bookDir(unit.book);
  const enPath = unit.isPath
    .replace(`${path.sep}02-mt-output${path.sep}`, `${path.sep}02-for-mt${path.sep}`)
    .replace(/-segments\.is\.md$/, '-segments.en.md');
  // 🔴 `loadResidueAllowlistOrNull`'s DISTINCTION, reproduced: A5 SKIPs on a
  // missing allowlist and must not be handed `{entries: []}` for one, because a
  // real empty allowlist and an absent file are different states and A5's guard
  // exists to tell them apart. `readJsonOrNull` returns null for absent.
  // 🔴 NO `?? undefined` HERE. `null` and `undefined` are DIFFERENT VALUES to the
  // OrNull-family keys, and coercing one to the other is the exact defect the ctx
  // contract warns about six lines above its sibling. A5 happens to refuse both
  // today, so this line is latent rather than live — but it is the same class as
  // the `fidelityAllowlist` one below, which was NOT latent.
  const residueAllowlist = readJsonOrNull(path.join(dir, 'residue-allowlist.json'));
  const provenancePath = unit.isPath.replace(/-segments\.is\.md$/, '-provenance.json');
  return {
    book: unit.book,
    chapter: unit.ch ? unit.ch.replace(/^ch/, '') : undefined,
    module: unit.module,
    segText: readIf(enPath) ?? undefined,
    isText: readIf(unit.isPath) ?? undefined,
    cnxml: unit.ch
      ? (readIf(path.join(dir, '01-source', unit.ch, `${unit.module}.cnxml`)) ?? undefined)
      : undefined,
    provenance: readJsonOrNull(provenancePath) ?? undefined,
    residueAllowlist,
  };
}

function tier3Ctx(unit, { spawns }) {
  const dir = bookDir(unit.book);
  return {
    book: unit.book,
    chapter: unit.ch.replace(/^ch/, ''),
    module: unit.module,
    track: unit.track,
    cnxml: readIf(path.join(dir, '01-source', unit.ch, `${unit.module}.cnxml`)) ?? undefined,
    translatedCnxml: readIf(unit.cnxmlPath) ?? undefined,
    // 🔴 `loadAllowlistOrNull`, not `loadAllowlist`: a missing file, `{entries: []}`
    // and `{entries: null}` all collapse to the same value through the eager
    // loader, and organic HAS no fidelity-allowlist (§C82 L57, third instance).
    // 🔴 AND NO `?? undefined` — THIS LINE CARRIED ONE, ONE LINE BELOW THE COMMENT
    // WARNING ABOUT EXACTLY IT. R1 accepts an object or an explicit `null` and
    // REFUSES `undefined`, so the coercion turned organic's legitimate "no
    // allowlist exists" into "the loader never set the key" and R1 SKIPPED all 8
    // of organic's translated units. MEASURED, and stated at its real scope:
    // R1's 8 SKIPs of 161 were organic ENTIRE (chemistry SKIP 0), and the same 8
    // units with an explicit `null` return **6 FAIL and 2 PASS** — the SKIPs were
    // hiding 6 real findings, all `unexplained-tag-count`, which is the class
    // chemistry's 36-entry allowlist explains and organic has none for. R1 is
    // tier 3, so that is a statement about the committed VINTAGE, not a new defect.
    // ⚠️ THIS COMMENT SAID "returns PASS" — a claim the commit message shipping the
    // repair CONTRADICTED in the same breath ("6 real findings, organic 75.0% of
    // 8"). A file disagreeing with its own commit is the cheapest possible instance
    // of a comment generalising past its code.
    // ▶ A comment stating the rule is not the rule.
    fidelityAllowlist: readJsonOrNull(path.join(dir, 'fidelity-allowlist.json')),
    schemaVerdict: spawns ? spawns.schema.get(`${unit.book}|${unit.track}|${unit.ch}`) : undefined,
    auditResults: spawns ? spawns.audit.get(`${unit.book}|${unit.track}|${unit.ch}`) : undefined,
  };
}

/**
 * `render-fidelity-baseline.json`'s chapter keys are UNPADDED (`"3"`), while the
 * publication directory is `"03"`. That mapping is the loader's, and a gate
 * handed the wrong key reads "no baseline" and SKIPs — which looks exactly like
 * the expected inert state (§C82 L90).
 */
export function baselineKeyFor(chapter) {
  if (chapter === 'appendices') return 'appendices';
  const n = Number(chapter);
  return Number.isInteger(n) ? String(n) : String(chapter);
}

/**
 * Only these `specialModules` types replace their static images with an
 * interactive element. MIRRORS `computeIntentionalImageDrops`'s own set in
 * `tools/cnxml-render-fidelity-check.js` — which is MODULE-LOCAL and therefore
 * cannot be imported (that unavailability is §C82 L88's whole subject).
 * ⚠️ A NEW TYPE MUST BE ADDED IN BOTH PLACES. `remt-sweep.test.js` asserts this
 * set against the producer's, by reading its source, so a divergence goes red.
 */
export const IMAGE_REPLACEMENT_TYPES = Object.freeze(['periodic-table']);

/**
 * Images this CHAPTER deliberately omits, computed from THE SAME CNXML K2 JUDGES.
 *
 * 🔴 PER CHAPTER, NEVER THE BOOK TOTAL, AND K2 IS BLOCKING. `checkChapter`
 * subtracts this from THAT CHAPTER's `<image>` count, so the book total masks a
 * real one-image drop as PASS (§C82 L96①); zero where the special module really
 * is manufactures the chemistry-appendices false positive that moves K2's rate
 * 3.8% -> 7.7%, across the ~5% blocking bar (§C82 L88).
 *
 * 🔴 THREE DIVERGENCES FROM THE PRODUCER, ALL PRESENT IN THE FIRST VERSION AND
 * ALL INVISIBLE ON TODAY'S CORPUS. It counted MODULES, applied NO type filter,
 * and read `01-source`. The producer counts `<image>` OCCURRENCES, filters on
 * REPLACEMENT_TYPES, and takes the INJECTED CNXML. They agree today only because
 * chemistry's one special module (`m68859`, the periodic table) has exactly ONE
 * `<image>` and its type IS `periodic-table` — measured. Each divergence breaks
 * a different way:
 *   - modules-not-images  -> a 2-image special module UNDER-counts -> K2 reports
 *                            a drop that was deliberate: a FALSE HALT.
 *   - no type filter      -> a special module of a non-replacement type is
 *                            subtracted -> K2 MASKS a real drop: a false pass.
 *   - source-not-injected -> the two trees diverge the moment a track is
 *                            partially injected, which the clean-break run does
 *                            by construction.
 * ▶ Taking `chapterInputs.cnxml` closes all three at once, because that is
 * literally the array `checkChapter` is about to read.
 *
 * @param {string} book
 * @param {string[]} chapterCnxml  `readChapterFromDisk(...).cnxml` for THIS chapter
 */
export function intentionalImageDropsFor(book, chapterCnxml) {
  const cfg = readJsonOrNull(path.join(bookDir(book), 'book-config.json'));
  const special = (cfg && cfg.specialModules) || {};
  if (Object.keys(special).length === 0) return 0;
  const types = new Set(IMAGE_REPLACEMENT_TYPES);
  let drops = 0;
  for (const text of Array.isArray(chapterCnxml) ? chapterCnxml : []) {
    const m = /<md:content-id>(m\d+)<\/md:content-id>/.exec(String(text));
    if (!m) continue;
    const type = special[m[1]];
    if (type && types.has(type)) drops += (String(text).match(/<image\b/g) || []).length;
  }
  return drops;
}

function tier4Ctx(unit) {
  const dir = bookDir(unit.book);
  const inputs = readChapterFromDisk(dir, unit.chapter, unit.track);
  const baselineFile = readJsonOrNull(path.join(dir, 'render-fidelity-baseline.json'));
  // TRI-STATE, and `undefined` (loader never set the key) is refused separately
  // from `null` (this chapter has no baseline) — §C82 L90's seven representations.
  let renderBaseline = null;
  if (baselineFile && baselineFile.chapters && typeof baselineFile.chapters === 'object') {
    const k = baselineKeyFor(unit.chapter);
    renderBaseline = Object.prototype.hasOwnProperty.call(baselineFile.chapters, k)
      ? baselineFile.chapters[k]
      : null;
  }
  // 🔴 THE FILE'S OWN `track`, NOT a re-stamped one. `readSlugMap` re-stamps
  // `track` from the caller's argument and discards the value on disk, which
  // makes K3's cross-track refusal a tautology (§C82 L104①). Parsing the JSON
  // directly is what makes that guard real.
  const slugMap = readJsonOrNull(
    path.join(dir, '05-publication', unit.track, `slug-map.${unit.track}.json`)
  );
  return {
    book: unit.book,
    chapter: unit.chapter,
    track: unit.track,
    chapterInputs: inputs,
    renderBaseline,
    knownIntentionalImageDrops: intentionalImageDropsFor(unit.book, inputs.cnxml),
    slugMap,
    // 🔴 DELIBERATELY ABSENT, AND K3 IS BLOCKING SO THIS COSTS AN EXIT 1.
    // `publishedBefore` is the only ctx key whose correctness is a property of
    // WHEN it was taken, and no pure gate can check that. No before-snapshot
    // artefact exists anywhere in the repo, tracked or untracked. Fabricating one
    // here from today's tree would flip K3 from an honest SKIPPED to a clean PASS
    // with a plausible non-zero `examined` — which §C82 L92 measured as strictly
    // WORSE than the halt. So the sweep hands nothing and reports SKIPPED.
    publishedBefore: undefined,
    publishedAfter: undefined,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * TIER TABLE
 * ──────────────────────────────────────────────────────────────────────────── */

export const TIER_SPECS = Object.freeze([
  { tier: 0, unit: 'book', units: (b) => [{ book: b }], ctx: tier0Ctx },
  { tier: 1, unit: 'module pair', units: modulePairUnits, ctx: (u) => tier1Ctx(u) },
  { tier: 2, unit: 'IS segment file', units: isFileUnits, ctx: (u) => tier2Ctx(u) },
  { tier: 3, unit: 'module x track', units: translatedUnits, ctx: tier3Ctx },
  { tier: 4, unit: 'chapter x track cell', units: chapterCellUnits, ctx: (u) => tier4Ctx(u) },
]);

/**
 * 🔴 THE PARTITION MUST BE TOTAL — see the header. A registered check that this
 * sweep neither sweeps nor declares unmeasurable would be silently absent from
 * the report, and an absent row reads exactly like a row with nothing to report.
 *
 * ⚠️ IT ASKS ABOUT THE TOOL, NOT ABOUT THIS INVOCATION, AND THE FIRST VERSION
 * ASKED THE WRONG ONE. Passing the tiers a scoped run SELECTED made
 * `--tier 1` throw over the 24 checks in the other four tiers — which are not
 * orphans, merely out of scope for that run. The invariant that matters is
 * "every registered check has SOMEWHERE to go", and its input is the set of
 * tiers this file knows how to build a ctx for. Measured by running it: the
 * scoped form is the common one, so the wrong spelling would have made the tool
 * unusable rather than subtly wrong — the lucky direction, and not one to rely
 * on twice.
 *
 * @param {Iterable<object>} checks     normally REGISTRY.values()
 * @param {number[]} [knownTiers]       tiers this TOOL can build a ctx for
 */
export function assertTotalPartition(checks, knownTiers = TIER_SPECS.map((s) => s.tier)) {
  const orphans = [];
  for (const c of checks) {
    if (UNMEASURABLE[c.id]) continue;
    if (knownTiers.includes(c.tier)) continue;
    orphans.push(`${c.id} (tier ${c.tier})`);
  }
  if (orphans.length) {
    throw new Error(
      `remt-sweep: ${orphans.length} registered check(s) are neither swept nor declared ` +
        `unmeasurable: ${orphans.join(', ')}. Add a ctx builder or an UNMEASURABLE entry with ` +
        `a reason — an omitted check is indistinguishable from one that found nothing.`
    );
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * SPAWNS — the three checks whose input comes from another process.
 *
 * ⚠️ OFF BY DEFAULT, AND THEIR ABSENCE IS REPORTED RATHER THAN SCORED. Without
 * `--with-spawns`, G5/R3/R4 receive no verdict object and SKIP — which is
 * correct behaviour and honest output, but it is NOT a base rate, so the report
 * marks the run `spawns: false` and every affected row carries the note.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Spawn the render audit and return its `--json` array.
 *
 * ⚠️ THE EXIT CODE IS IGNORED ON PURPOSE — the spawn model at
 * `publicationService.js:124-184`, which `child.on('close', ...)` without reading
 * the code and parses `--json` from stdout. `audit-render-output.js` exits 1
 * whenever it found errors, which is a normal result here, not a failure to run.
 * A JSON parse failure REJECTS with stderr attached rather than reading as a pass.
 */
function spawnRenderAudit(book, track, chapter) {
  // 🔴 `--chapter` IS REQUIRED, AND THE FIRST VERSION OMITTED IT. The tool exited
  // with `Error: --chapter is required` on stderr and an EMPTY stdout, so all four
  // spawns produced 0 bytes and R4 reported SKIPPED on 161 of 161 units — a row
  // that looks exactly like "R4 had nothing to judge". It was diagnosable only
  // because a failing spawn is LOGGED rather than swallowed; the parse error also
  // carries stderr, which is what named the missing flag.
  // ▶ The chapter form is BARE (`1`, `appendices`), not `chNN` — the publication
  // convention, same as everywhere on this side of the pipeline.
  const args = [
    path.join(REPO_ROOT, 'tools', 'audit-render-output.js'),
    '--book',
    book,
    '--track',
    track,
    '--chapter',
    chapter,
    '--json',
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: REPO_ROOT, env: process.env });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => reject(new Error(`spawnRenderAudit: ${e.message}`)));
    child.on('close', () => {
      try {
        resolve(JSON.parse(out));
      } catch (e) {
        reject(
          new Error(
            `spawnRenderAudit(${book}, ${track}): could not parse --json (${out.length} bytes, ` +
              `${e.message}). If the byte count is a power of two, suspect a truncated pipe. ` +
              `stderr: ${err.trim().slice(0, 300)}`
          )
        );
      }
    });
  });
}

/**
 * ⚠️ EXPORTED FOR TESTING, AND THE REASON IS NOT CONVENIENCE. This function is the
 * SOLE producer of the `failures` and `expected` fields that `spawnIncomplete` — and
 * therefore the rate suppression on three checks, one of them BLOCKING — consumes.
 * It was module-local and exercised by nothing, so the bookkeeping the repair rests
 * on had no pin at all. §C82: "a gate never called is a gate that does not exist."
 */
export async function collectSpawns(books, tiers, log = () => {}) {
  // 🔴 `failures` AND `expected` ARE NOT BOOKKEEPING. A spawn that dies leaves its
  // Map entry unset, and every consumer downstream then sees exactly what it sees
  // when the spawn was never asked for — except that the suppression keyed on the
  // FLAG stands down, so the resulting verdict is scored as a base rate. Measured:
  // with `--with-spawns` and a dead glossary spawn, G5 (BLOCKING) reports 100.0%
  // with no note and joins the over-the-bar alarm, which under Global Constraint 4
  // disqualifies the only detector for a wholesale glossary producer swap.
  // ⚠️ AND THE ONLY RECORD WENT TO `log`, A NO-OP UNDER `--json`/`--quiet` — i.e.
  // silenced in exactly the mode a decision document is built from, in a file whose
  // own comment credits a LOGGED spawn failure with making the 161-SKIP incident
  // diagnosable.
  const out = {
    glossary: new Map(),
    schema: new Map(),
    audit: new Map(),
    failures: [],
    expected: {},
  };
  // A failure ALWAYS reaches stderr, whatever `log` is, and is always recorded on
  // the report object so `--json` carries it.
  const fail = (kind, key, message) => {
    out.failures.push({ kind, key, message });
    console.error(`remt-sweep: ${kind} spawn FAILED for ${key}: ${message}`);
  };
  // 🔴 `expected` COUNTS VERDICTS OWED, NOT SPAWNS ATTEMPTED — AND THE FIRST
  // VERSION COUNTED THE SECOND. The increments sat INSIDE the loop bodies, AFTER
  // the early `continue`s, so a unit whose verdict is never even REQUESTED
  // incremented neither `expected` nor `failures`: `delivered === expected` held
  // (including the degenerate `0 < 0`), `spawnIncomplete` returned false, and the
  // suppression stood down again — rebuilding the very hole the delivered-vs-
  // expected mechanism was written to close, with a new mechanism and the wrong
  // invariant.
  // ⚠️ THE REACHABLE ROUTE IS ONE THE CLEAN-BREAK RUN CREATES BY CONSTRUCTION:
  // once organic is re-injected but not yet re-rendered, `05-publication/faithful`
  // does not exist, that track's audits are never attempted, and R4's row is
  // scored over the units that DID get verdicts. `owe()` is called BEFORE every
  // guard, and a unit that cannot be attempted is recorded as a failure with a
  // reason — so the row is suppressed and the reader is told why.
  const owe = (kind) => {
    out.expected[kind] = (out.expected[kind] || 0) + 1;
  };
  const notAttempted = (kind, key, why) => {
    out.failures.push({ kind, key, message: `not attempted: ${why}` });
    console.error(`remt-sweep: ${kind} spawn NOT ATTEMPTED for ${key}: ${why}`);
  };
  if (tiers.includes(0)) {
    for (const book of books) {
      const p = path.join(bookDir(book), 'glossary', 'glossary-unified.json');
      owe('glossary');
      if (!exists(p)) {
        notAttempted('glossary', book, 'no glossary/glossary-unified.json');
        continue;
      }
      log(`  spawn G5 payload check: ${book}`);
      try {
        out.glossary.set(book, await spawnGlossaryPayloadCheck(p, { repoRoot: REPO_ROOT }));
      } catch (e) {
        fail('glossary', book, e.message);
      }
    }
  }
  if (tiers.includes(3)) {
    for (const book of books) {
      // R4: one audit per book x track x CHAPTER — 26 spawns on today's corpus
      // (chemistry mt-preview 23 + chemistry faithful 2 + organic mt-preview 1;
      // organic has no faithful directory). The tool REQUIRES `--chapter`.
      // `audit-render-output.js` already writes
      // its `--json` with `process.exitCode` rather than `process.exit()`, so the
      // payload is not at risk of the 64 KB pipe truncation that bit the schema
      // tool (its own comment at :623 records the fix).
      for (const track of SWEEP_TRACKS) {
        const chapters = new Set(
          translatedUnits(book)
            .filter((u) => u.track === track)
            .map((u) => u.ch)
        );
        if (!exists(path.join(bookDir(book), '05-publication', track))) {
          // Owe one verdict per chapter this track WOULD have audited, so the
          // shortfall is visible instead of cancelling itself out.
          for (const ch of chapters) {
            owe('audit');
            notAttempted('audit', `${book}|${track}|${ch}`, `no 05-publication/${track}`);
          }
          continue;
        }
        for (const ch of new Set(
          translatedUnits(book)
            .filter((u) => u.track === track)
            .map((u) => u.ch)
        )) {
          const bare = ch === 'appendices' ? 'appendices' : ch.replace(/^ch0*/, '') || '0';
          log(`  spawn R4 render audit: ${book} / ${track} / ${bare}`);
          owe('audit');
          try {
            out.audit.set(`${book}|${track}|${ch}`, await spawnRenderAudit(book, track, bare));
          } catch (e) {
            fail('audit', `${book}|${track}|${bare}`, e.message);
          }
        }
      }
      const byChapter = new Map();
      for (const u of translatedUnits(book)) {
        const k = `${u.book}|${u.track}|${u.ch}`;
        if (!byChapter.has(k)) byChapter.set(k, []);
        byChapter.get(k).push(u.cnxmlPath);
      }
      for (const [k, targets] of byChapter) {
        log(`  spawn R3 schema check: ${k} (${targets.length} file(s))`);
        owe('schema');
        try {
          out.schema.set(k, await spawnSchemaCheck(targets, { repoRoot: REPO_ROOT }));
        } catch (e) {
          fail('schema', k, e.message);
        }
      }
    }
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
 * THE SWEEP
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * @param {object}   opts
 * @param {string[]} opts.books
 * @param {number[]} opts.tiers
 * @param {object}   [opts.spawns]  from collectSpawns(), or undefined
 * @param {number}   [opts.limit]   cap units per tier per book (smoke runs only)
 * @param {Function} [opts.log]
 */
/** Which spawn map feeds which check. */
const SPAWN_SOURCE = Object.freeze({ G5: 'glossary', R3: 'schema', R4: 'audit' });

/**
 * True when a spawn-dependent check did not receive every verdict it was owed —
 * because spawns were never collected, or because some died.
 * ⚠️ COMPARES DELIVERED AGAINST EXPECTED rather than testing for zero: a run in
 * which 3 of 26 audits died still produces a partial, quotable-looking rate, and
 * that is precisely the case a `size > 0` test would wave through.
 */
export function spawnIncomplete(id, spawns) {
  const src = SPAWN_SOURCE[id];
  if (!src) return false;
  if (!spawns) return true;
  return (spawns[src] ? spawns[src].size : 0) < (spawns.expected ? spawns.expected[src] || 0 : 0);
}

export async function sweep({ books, tiers, spawns, limit = 0, log = () => {} }) {
  // 🔴 AN EMPTY REGISTRY MUST THROW, NOT REPORT CLEAN. `runTier` already refuses
  // "a clean run over an empty set"; this is the same rule one level up, and it
  // was missing — a sweep over 0 checks returned a well-formed report with empty
  // `rows` and a partition line reading "0 of 0", which is §C60 verbatim. The
  // registry is populated by IMPORT, so an empty one means the tier modules never
  // loaded — exactly the failure that is invisible without this.
  if (REGISTRY.size === 0) {
    throw new Error(
      'remt-sweep: the check registry is EMPTY — the tier modules did not load. Refusing to ' +
        'report a clean sweep over zero checks.'
    );
  }
  assertTotalPartition(REGISTRY.values());

  /**
   * id -> accumulator, and `id|book` -> the same shape.
   *
   * 🔴 THE PER-BOOK SPLIT IS NOT A CONVENIENCE. Measured on this corpus, A5's
   * rate is **0.7% in chemistry and 23.5% in organic — a 35x spread** inside one
   * aggregate of 3.0%.
   * ⚠️ THIS COMMENT PREVIOUSLY QUOTED 3.4% / 5.4%, WHICH ARE THE RATES WITH THE
   * ALLOWLIST **NOT APPLIED** — i.e. numbers this tool does not print, in the
   * docstring justifying the column that prints them. (A5's own message reports
   * post-allowlist residues first and `tolerated` separately; reading the leading
   * number as "raw" is what produced them.) The raw figures are real and belong
   * beside the acceptance criterion, which is written in raw terms — they simply
   * are not what the table shows. [[engineering-lessons]]:
   * "a saturated rate is a CATEGORY, not a result — look for the split that
   * separates it before believing an aggregate." Two books is the split that is
   * always available, so it is always computed.
   */
  const acc = new Map();
  const blank = (check, unitName) => ({
    id: check.id,
    tier: check.tier,
    blocking: check.blocking,
    version: check.version,
    unit: unitName,
    population: 0,
    PASS: 0,
    FAIL: 0,
    WARN: 0,
    SKIPPED: 0,
    examinedTotal: 0,
  });
  const seed = (check, unitName, book) => {
    for (const key of [check.id, `${check.id}|${book}`]) {
      if (!acc.has(key)) acc.set(key, blank(check, unitName));
    }
  };
  const bump = (check, unitName, verdict, examined, book) => {
    // ⚠️ `blank()` IS THE ONLY PLACE THE ROW SHAPE IS WRITTEN. This branch used to
    // carry a second 11-field literal, which `seed()` had already made unreachable
    // for every real call path — dead code that nothing could see drift out of
    // sync with the live one.
    for (const key of [check.id, `${check.id}|${book}`]) {
      if (!acc.has(key)) acc.set(key, blank(check, unitName));
      const a = acc.get(key);
      a.population += 1;
      a[verdict] += 1;
      a.examinedTotal += examined;
    }
  };

  const truncated = [];
  // 🔴 A ctx THAT COULD NOT BE BUILT MUST LEAVE A TRACE IN THE PAYLOAD. It marks
  // every check SKIPPED for that unit, and `evaluable = population - SKIPPED`, so a
  // PARTIAL ctx failure SHRINKS the denominator and the rate RISES: measured, E2
  // (BLOCKING) moves **2/149 = 1.34% -> 2/7 = 28.57%** and joins the over-the-bar
  // alarm on the strength of 142 units nothing ever read.
  // ⚠️ BOTH OF THOSE ARE CHEMISTRY-ONLY, AND EVERY OTHER RATE QUOTED IN THIS FILE
  // IS THE TWO-BOOK AGGREGATE THE TOOL PRINTS (E1 62.7%, A6 58.4%, A5 0.7/23.5/3.0)
  // — so a reader has every reason to read 1.34% the same way, and the default
  // two-book run prints **1.20%** (2/166). A number is mis-scoped the moment its
  // neighbours use a different denominator, even when it is right about its own.
  // The failure message went only to `log`, a no-op under `--json`. Recorded here
  // so the payload carries it.
  const ctxFailures = [];
  for (const spec of TIER_SPECS) {
    if (!tiers.includes(spec.tier)) continue;
    const checks = [...REGISTRY.values()].filter(
      (c) => c.tier === spec.tier && !UNMEASURABLE[c.id]
    );
    if (checks.length === 0) continue;
    for (const book of books) {
      let units = spec.units(book);
      if (limit > 0 && units.length > limit) {
        // 🔴 NO SILENT CAPS. A truncation that does not announce itself turns a
        // partial sweep into a report that reads as full coverage.
        truncated.push(`tier ${spec.tier} / ${book}: ${units.length} -> ${limit}`);
        units = units.slice(0, limit);
      }
      // 🔴 SEEDED BEFORE THE UNIT LOOP, SO A BOOK THAT CONTRIBUTED NOTHING STILL
      // APPEARS. The per-book split prints only when `byBook.length > 1`, and a book
      // with zero units had no accumulator entry at all — so the split VANISHED
      // exactly when it mattered most, and an aggregate covering ONE book read as
      // covering both. A tier with zero units everywhere made its checks disappear
      // from the table entirely, and an absent row cannot be told from a row with
      // nothing to report.
      for (const c of checks) seed(c, spec.unit, book);
      log(
        `tier ${spec.tier} · ${book} · ${units.length} ${spec.unit}(s) x ${checks.length} check(s)`
      );
      for (const unit of units) {
        let ctx;
        try {
          ctx = spec.ctx(unit, { spawns });
        } catch (e) {
          // A ctx that cannot be built is a FINDING about this unit, not a
          // reason to drop it from the denominator.
          for (const c of checks) bump(c, spec.unit, VERDICT.SKIPPED, 0, book);
          ctxFailures.push({
            tier: spec.tier,
            book,
            unit: JSON.stringify(unit),
            message: e.message,
          });
          // ⚠️ NAMES THE UNIT. Reproduced at 142 failures: the lines were
          // byte-identical and said nothing about WHICH units were lost. Loudness
          // is right here — silencing it is what caused the defect — but
          // undifferentiated loudness is not.
          console.error(
            `remt-sweep: ctx build FAILED (tier ${spec.tier}, ${book}, ${JSON.stringify(unit)}): ${e.message}`
          );
          continue;
        }
        for (const c of checks) {
          const r = await runCheck(c, ctx);
          bump(c, spec.unit, r.verdict, r.examined, book);
        }
      }
    }
  }

  const shape = (a) => {
    const evaluable = a.population - a.SKIPPED;
    const tripped = a.FAIL + a.WARN;
    // A spawn-dependent row whose spawn did not DELIVER is not a rate at all.
    // 🔴 KEYED ON THE ROW'S INPUT, NEVER ON THE RUN FLAG. The first version was
    // `!spawns && SPAWN_DEPENDENT[a.id]`, which stands down the moment
    // `--with-spawns` is passed — even when the spawn it enabled then died. So
    // passing the flag was enough to DISABLE the suppression that exists for
    // exactly that state.
    const spawnGap =
      SPAWN_DEPENDENT[a.id] && spawnIncomplete(a.id, spawns)
        ? SPAWN_DEPENDENT[a.id] + (spawns ? ' — AND ITS SPAWN FAILED IN THIS RUN' : '')
        : null;
    return {
      ...a,
      evaluable,
      tripped,
      // 🔴 A RATE OVER ZERO EVALUABLE UNITS IS NOT 0% — it is undefined, and
      // printing 0% would be the single most misleading cell in the report.
      rate: spawnGap || evaluable === 0 ? null : tripped / evaluable,
      note: spawnGap,
    };
  };

  const rows = [...acc.entries()]
    .filter(([key]) => !key.includes('|'))
    .map(([, a]) => {
      const row = shape(a);
      row.byBook = [...acc.entries()]
        .filter(([key]) => key.startsWith(`${a.id}|`))
        .map(([key, v]) => ({ book: key.slice(a.id.length + 1), ...shape(v) }))
        .sort((x, y) => (x.book < y.book ? -1 : 1));
      return row;
    })
    .sort((a, b) => a.tier - b.tier || (a.id < b.id ? -1 : 1));

  const unmeasurable = [...REGISTRY.values()]
    .filter((c) => UNMEASURABLE[c.id])
    .map((c) => ({ id: c.id, tier: c.tier, blocking: c.blocking, ...UNMEASURABLE[c.id] }))
    .sort((a, b) => a.tier - b.tier || (a.id < b.id ? -1 : 1));

  // Checks that exist and were simply not in this run's tier scope. They are a
  // THIRD partition class, and naming them is what keeps the arithmetic total on
  // a scoped run: rows + unmeasurable + scopedOut === registrySize. Folding them
  // into either of the other two would misreport them — "unmeasurable" is a
  // claim about the corpus, and this is a claim about the invocation.
  const scopedOut = [...REGISTRY.values()]
    .filter((c) => !UNMEASURABLE[c.id] && !tiers.includes(c.tier))
    .map((c) => ({ id: c.id, tier: c.tier }))
    .sort((a, b) => a.tier - b.tier || (a.id < b.id ? -1 : 1));

  return {
    books,
    tiers,
    spawnsEnabled: Boolean(spawns),
    spawnFailures: (spawns && spawns.failures) || [],
    ctxFailures,
    truncated,
    registrySize: REGISTRY.size,
    rows,
    unmeasurable,
    scopedOut,
    // The partition, restated as data so a consumer can re-check it rather than
    // trust that `assertTotalPartition` ran.
    covered: rows.length + unmeasurable.length + scopedOut.length,
  };
}

const pct = (r) => (r === null ? '   n/a' : `${(r * 100).toFixed(1).padStart(5)}%`);

export function formatReport(report) {
  const lines = [];
  lines.push(
    `# §C82 base-rate sweep — books: ${report.books.join(', ')} · tiers: ${report.tiers.join(',')}` +
      ` · spawns: ${report.spawnsEnabled ? 'on' : 'OFF'}`
  );
  lines.push('');
  // 🔴 FAIL AND WARN ARE SEPARATE COLUMNS, NOT ONE `TRIP`. On a BLOCKING check
  // the difference is the whole decision: `runTier`'s blocking filter halts on
  // FAIL and on SKIPPED, and lets a WARN that examined something through. A
  // merged column makes a gate that halts the run look identical to one that
  // files a note — on exactly the rows where that matters most.
  lines.push('ID   T B  UNIT                  POP  PASS  FAIL  WARN  SKIP  EVAL    RATE  EXAMINED');
  let lastTier = -1;
  for (const r of report.rows) {
    if (r.tier !== lastTier) {
      lines.push(`-- tier ${r.tier} ${'-'.repeat(52)}`);
      lastTier = r.tier;
    }
    lines.push(
      [
        r.id.padEnd(4),
        String(r.tier),
        r.blocking ? '*' : ' ',
        r.unit.padEnd(20),
        String(r.population).padStart(5),
        String(r.PASS).padStart(5),
        String(r.FAIL).padStart(5),
        String(r.WARN).padStart(5),
        String(r.SKIPPED).padStart(5),
        String(r.evaluable).padStart(5),
        pct(r.rate),
        String(r.examinedTotal).padStart(9),
      ].join(' ') +
        // 🔴 THE SPLIT IS PRINTED, NOT HIDDEN BEHIND A FLAG. An aggregate over two
        // books whose rates differ 35x (A5: chemistry 0.7%, organic 23.5%) is the
        // shape "a saturated rate is a CATEGORY" warns about, and the aggregate is
        // what a reader quotes. One continuation line costs nothing and removes the
        // chance of quoting a number that describes neither book.
        (r.byBook && r.byBook.length > 1
          ? `\n     · ${r.byBook.map((b) => `${b.book} ${pct(b.rate).trim()} of ${b.evaluable}`).join('  ·  ')}`
          : '') +
        (r.note ? `\n     ^ NOT A RATE: ${r.note}` : '')
    );
  }
  lines.push('');
  lines.push(`UNMEASURABLE IN A SWEEP (${report.unmeasurable.length}) — reasons, not zeros:`);
  for (const u of report.unmeasurable) {
    lines.push(`  ${u.id} (tier ${u.tier}${u.blocking ? ', BLOCKING' : ''}): ${u.reason}`);
    lines.push(`      available after: ${u.availableAfter}`);
  }
  if (report.truncated.length) {
    lines.push('');
    lines.push('⚠️ TRUNCATED (--limit was passed; these rows are NOT full coverage):');
    for (const t of report.truncated) lines.push(`  ${t}`);
  }
  const overBar = report.rows.filter(
    (r) => r.blocking && r.rate !== null && r.rate > BLOCKING_RATE_BAR
  );
  if (overBar.length) {
    lines.push('');
    lines.push(
      `🔴 BLOCKING CHECKS OVER GLOBAL CONSTRAINT 4's ~${BLOCKING_RATE_BAR * 100}% BAR (${overBar.length}) — ` +
        'and they are TWO different situations:'
    );
    for (const r of overBar) {
      const regen = TIER_INPUT_REGENERATED[r.tier];
      lines.push(
        `  ${r.id.padEnd(4)} tier ${r.tier}  ${pct(r.rate).trim()} of ${r.evaluable}  ` +
          (regen
            ? '— tier input is REGENERATED by the loop: a statement about the committed VINTAGE, ' +
              `not about the code that will run. Re-measure after ${TIER_REGENERATED_BY[r.tier]}.`
            : '— tier input is NOT regenerated by the loop: a statement about DATA THE RUN WILL ' +
              'CONSUME. A PRECONDITION, not a calibration question.')
      );
    }
  }

  // 🔴 A BLOCKING CHECK WITH NO RATE IS INVISIBLE TO THE ALARM ABOVE, because
  // `overBar` filters on `r.rate !== null`. Such a row does not read clean
  // (SKIP n / EVAL 0 / n/a / EXAMINED 0), so this is a completeness note rather
  // than a §C60 hazard — but a reader scanning only the alarm would miss that a
  // blocking gate supplied no evidence at all, which `runTier` scores as a halt.
  // ⚠️ AMENDED 2026-08-31 — K3 WAS THIS SECTION'S STANDING EXAMPLE AND HAS LEFT IT.
  // K3 went `blocking: false` with the [LEAD] clean-break decision, so it no longer
  // matches this filter and the section can now be EMPTY. That is not evidence the
  // hazard was fixed; it is evidence the membership moved. This is the same shape
  // that emptied the "BLOCKING CHECKS OVER <bar>" section when the glossary cleanup
  // dropped G3 below its bar — a section going quiet because its population left.
  const blockingNoRate = report.rows.filter((r) => r.blocking && r.rate === null);
  if (blockingNoRate.length) {
    lines.push('');
    lines.push(
      `⚠️ BLOCKING CHECKS WITH NO MEASURABLE RATE (${blockingNoRate.length}) — not over the bar, ` +
        'and not under it either; they supplied no evidence, which `runTier` scores as a halt:'
    );
    // 🔴 THE COUNTER IS PER CLASS. `SKIPPED n of pop` is true for exactly ONE of
    // the three ways a blocking row reaches `rate === null` — the K3 case the
    // heading reasons from. For a SPAWN-SUPPRESSED row it prints "SKIPPED 0 of 2"
    // beside two real FAILs, and for a row whose tier had NO UNITS it prints
    // "SKIPPED 0 of 0" under a heading asserting the check supplied no evidence.
    // Both are the section's own failure mode: a line that reads as a measurement
    // and is not.
    for (const r of blockingNoRate) {
      const why =
        r.population === 0
          ? 'no units in this run — nothing was offered to it'
          : r.note
            ? `rate suppressed — ${r.note}`
            : `SKIPPED ${r.SKIPPED} of ${r.population}`;
      lines.push(`  ${r.id.padEnd(4)} tier ${r.tier}  ${why}`);
    }
  }

  if (report.spawnFailures.length) {
    lines.push('');
    lines.push(
      `🔴 SPAWN FAILURES (${report.spawnFailures.length}) — every affected row is NOT a rate:`
    );
    for (const f of report.spawnFailures) lines.push(`  ${f.kind} / ${f.key}: ${f.message}`);
  }
  if (report.ctxFailures.length) {
    // ⚠️ SCOPED TO THE TIERS THAT ACTUALLY FAILED. This said "this run's rates",
    // condemning rows in tiers no ctx failure touched — the same over-reach the
    // section exists to warn about, one level up. 🔴 The word `unusable` is PINNED
    // by remt-sweep.test.js; only the scope changed.
    const hitTiers = [...new Set(report.ctxFailures.map((f) => f.tier))].sort();
    lines.push('');
    lines.push(
      `🔴 ctx BUILD FAILURES (${report.ctxFailures.length}) — each marks EVERY check SKIPPED for ` +
        `that unit, which SHRINKS the rate denominator. Treat tier ${hitTiers.join(', ')}'s rates ` +
        `in this run as unusable:`
    );
    for (const f of report.ctxFailures.slice(0, 20)) {
      lines.push(`  tier ${f.tier} / ${f.book} / ${f.unit}: ${f.message}`);
    }
    if (report.ctxFailures.length > 20) {
      lines.push(`  … and ${report.ctxFailures.length - 20} more`);
    }
  }

  if (report.scopedOut.length) {
    lines.push('');
    lines.push(
      `NOT IN THIS RUN'S TIER SCOPE (${report.scopedOut.length}): ` +
        report.scopedOut.map((c) => c.id).join(' ')
    );
  }
  lines.push('');
  lines.push(
    `partition: ${report.rows.length} swept + ${report.unmeasurable.length} unmeasurable + ` +
      `${report.scopedOut.length} out-of-scope = ${report.covered} of ${report.registrySize} registered` +
      (report.covered === report.registrySize ? '' : '   *** NOT TOTAL — this is a defect ***')
  );
  lines.push(
    '⚠️ * = blocking. RATE is (FAIL+WARN)/EVAL, i.e. tripped over non-SKIPPED. ' +
      '🔴 A BLOCKING **SKIP** ALSO HALTS THE LOOP, and SKIPs are subtracted from EVAL — so ' +
      'this RATE is a base rate, NOT a halt rate, and the SKIP column is the other half of ' +
      'what a blocking check costs. (That is correct for Global Constraint 4, which is about ' +
      'how often a check TRIPS; do not fold SKIPs into it — on this corpus that would ' +
      'disqualify K2 and K5 over chapters the re-render has not produced yet.) ' +
      'A blocking FAIL halts the loop; a blocking WARN that examined something does not. ' +
      'The corpus is chemistry-shaped and every unit predates the re-extract — ' +
      'state that beside any rate quoted from this table.'
  );
  return lines.join('\n');
}

function usage(message) {
  console.error(`Error: ${message}`);
  process.exit(2);
}

async function main() {
  // Failure default: a run that never reaches a report must not exit 0.
  process.exitCode = 2;

  const args = parseArgs(process.argv.slice(2), [
    { name: 'book', flags: ['--book'], type: 'string' },
    { name: 'tier', flags: ['--tier'], type: 'string' },
    { name: 'json', flags: ['--json'], type: 'boolean', default: false },
    { name: 'quiet', flags: ['--quiet'], type: 'boolean', default: false },
    { name: 'withSpawns', flags: ['--with-spawns'], type: 'boolean', default: false },
    { name: 'limit', flags: ['--limit'], type: 'string' },
  ]);

  const books = args.book ? [args.book] : [...SWEEP_BOOKS];
  for (const b of books) {
    if (!exists(bookDir(b))) usage(`unknown book '${b}' (no books/${b} directory)`);
    // ⚠️ ACCEPTED, NOT REFUSED, AND SAID OUT LOUD. A withdrawn book's committed
    // bytes are legitimate MEASUREMENT input (CLAUDE.md: pointing a RUN at them is
    // what is forbidden, and this tool never runs anything) — but a rate quoted
    // from such a sweep would look exactly like an in-scope rate, so the report
    // must not be silent about it.
    if (!SWEEP_BOOKS.includes(b)) {
      console.error(
        `remt-sweep: ⚠️ '${b}' is NOT one of the two kept books (${SWEEP_BOOKS.join(', ')}). ` +
          'It is withdrawn from publication (§C80/§C109); measuring it is fine, quoting the ' +
          'result as an in-scope base rate is not.'
      );
    }
  }

  let tiers = [0, 1, 2, 3, 4];
  if (args.tier != null) {
    if (!/^[0-4]$/.test(String(args.tier)))
      usage(`--tier must be a bare integer 0-4, got ${JSON.stringify(args.tier)}`);
    tiers = [Number(args.tier)];
  }

  let limit = 0;
  if (args.limit != null) {
    if (!/^[1-9][0-9]*$/.test(String(args.limit)))
      usage(`--limit must be a positive integer, got ${JSON.stringify(args.limit)}`);
    limit = Number(args.limit);
  }

  const log = args.quiet || args.json ? () => {} : (m) => console.error(m);
  const spawns = args.withSpawns ? await collectSpawns(books, tiers, log) : undefined;
  const report = await sweep({ books, tiers, spawns, limit, log });

  if (args.json) console.log(JSON.stringify(report, null, 2));
  else console.log(formatReport(report));

  // 🔴 `process.exitCode`, NEVER `process.exit()`, WITH OUTPUT IN FLIGHT — Node
  // writes stdout to a PIPE asynchronously and discards what is still queued.
  // A full `--json` sweep is far larger than the 64 KB pipe buffer.
  //
  // ⚠️ 0 HERE MEANS "THE SWEEP RAN", NOT "THE CORPUS IS CLEAN". This tool
  // MEASURES; it does not gate. Trips are the expected output — the acceptance
  // criteria demand several near-100% rows — so scoring them into the exit code
  // would make the honest result look like a failure and invite someone to
  // "fix" it. `remt-battery.js` is the tool whose exit code is a verdict.
  process.exitCode = 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.stack || e.message);
    process.exit(2);
  });
}
