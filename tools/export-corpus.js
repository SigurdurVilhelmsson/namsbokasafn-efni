#!/usr/bin/env node

/**
 * export-corpus.js — aligned research-corpus export (campaign item 20).
 *
 * Emits, per segment, the four pipeline tiers {EN, MT, faithful, localized}
 * joined on the frozen SEG id, as JSONL (canonical, raw+clean per tier) +
 * TSV (clean text) + a stats/licence manifest. EN-driven: every extracted
 * segment becomes a row; absent tiers are null. The postEdited flag
 * reproduces the segment editor's exact view semantics (mt-normalize chain)
 * so normalization artifacts never masquerade as human edits.
 *
 * Spec: docs/superpowers/specs/2026-07-19-item20-research-corpus-export-design.md
 *
 * Usage:
 *   node tools/export-corpus.js --book efnafraedi-2e
 *   node tools/export-corpus.js --book efnafraedi-2e --chapter 3 --dry-run -v
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizeWraps, unescapeMtMarkers, normalizeTermMarkers } from './lib/mt-normalize.cjs';
import { cleanSegmentText, chapterLabel } from './generate-tm.js';
import { parseSegmentsMap, parseSegmentRecords } from './lib/seg-markers.cjs';
import { getBookLicence } from './lib/book-licences.cjs';
import { parseArgs, BOOK_OPTION, CHAPTER_OPTION, requireBook } from './lib/parseArgs.js';

const TOOL_NAME = 'export-corpus.js';
const TOOL_VERSION = '1.1';

let BOOKS_DIR = path.join(fileURLToPath(new URL('..', import.meta.url)), 'books');

// ─── Text & row helpers ───────────────────────────────────────────────

/**
 * Corpus clean text: the TM's cleanSegmentText plus corpus-only additions.
 * The legacy `[#id]` xref dialect is dropped (reference-only, mirrors
 * generate-tm's `[[xref:]]` drop) — this MUST run before the lb/rb decode:
 * a restored literal bracket sequence like `[[lb:]]#1[[rb:]]` decodes to
 * `[#1]`, and running the `[#id]` strip after decode would wrongly eat it.
 * [[lb:]]/[[rb:]] (item-9 literal-bracket escapes) decode LAST so restored
 * brackets can never be re-parsed as markers; [[MATH:N]]/[[MEDIA:n]] pass
 * through verbatim (positional placeholders, resolvable via 02-structure).
 *
 * @param {string} raw
 * @returns {string}
 */
function corpusCleanText(raw) {
  return cleanSegmentText(raw)
    .replace(/ ?\[#[^\]\s]+\]/g, '')
    .replace(/\[\[lb:\]\]/g, '[')
    .replace(/\[\[rb:\]\]/g, ']')
    .trim();
}

/**
 * Split a seg-id into its parts; tolerates short ids (missing parts → null).
 * @param {string} id
 * @returns {{moduleId: string|null, segmentType: string|null, elementId: string|null}}
 */
function splitSegId(id) {
  const [moduleId, segmentType, ...rest] = id.split(':');
  return {
    moduleId: moduleId || null,
    segmentType: segmentType || null,
    elementId: rest.length ? rest.join(':') : null,
  };
}

/**
 * The editor-visible view of an IS tier, per loadModuleForEditing in
 * server/services/segmentParser.js: normalizeWraps on parse →
 * unescapeMtMarkers → normalizeTermMarkers against the wrap-normalized EN.
 * postEdited answers "would the editor's diff view show a change" —
 * a byte-comparison against raw MT would mislabel every normalization
 * artifact as a human edit.
 *
 * @param {string} enRaw
 * @param {string|null} mtRaw
 * @param {string|null} faithfulRaw
 * @returns {boolean|null} null unless both IS tiers are present and non-blank
 */
function computePostEdited(enRaw, mtRaw, faithfulRaw) {
  if (mtRaw == null || faithfulRaw == null || mtRaw.trim() === '' || faithfulRaw.trim() === '')
    return null;
  const enView = normalizeWraps(enRaw ?? '');
  const view = (t) => normalizeTermMarkers(enView, unescapeMtMarkers(normalizeWraps(t)));
  return view(faithfulRaw).trim() !== view(mtRaw).trim();
}

/**
 * Build one corpus row. Key insertion order is the frozen spec order —
 * JSON.stringify preserves it, so JSONL output diffs deterministically.
 *
 * @param {{id: string, book: string, chapter: string, module: string,
 *          licence: string, en: string, mt: string|null,
 *          faithful: string|null, localized: string|null}} p
 * @returns {object}
 */
function buildRow(p) {
  const { segmentType, elementId } = splitSegId(p.id);
  const tier = (raw) => (raw == null ? null : { raw, clean: corpusCleanText(raw) });
  return {
    id: p.id,
    book: p.book,
    chapter: p.chapter,
    module: p.module,
    type: segmentType,
    elementId,
    licence: p.licence,
    en: tier(p.en),
    mt: tier(p.mt),
    faithful: tier(p.faithful),
    localized: tier(p.localized),
    postEdited: computePostEdited(p.en, p.mt, p.faithful),
    reviewStatus: p.reviewStatus ?? null,
  };
}

// ─── Discovery & corpus assembly ─────────────────────────────────────

/** Accepted EN segment-file basenames; everything else is skip-reported. */
const EN_FILE_RE = /^(m\d+|exercises|chapter-metadata)-segments\.en\.md$/;

const TIER_DIRS = {
  mt: '02-mt-output',
  faithful: '03-faithful-translation',
  localized: '04-localized-content',
};

/**
 * List EN chapter dirs: ch\d+ numeric-ascending (zero-padded names sort
 * lexicographically = numerically), then 'appendices' last (spec §4 —
 * deliberately differs from the TM's lexicographic order).
 *
 * @param {string} book
 * @param {number|string|null} chapterFilter
 * @returns {string[]}
 */
function listEnChapterDirs(book, chapterFilter) {
  const enRoot = path.join(BOOKS_DIR, book, '02-for-mt');
  if (!fs.existsSync(enRoot)) return [];
  const names = fs
    .readdirSync(enRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  let dirs = names.filter((n) => /^ch\d+$/.test(n)).sort();
  if (names.includes('appendices')) dirs.push('appendices');
  if (chapterFilter !== null && chapterFilter !== undefined) {
    const want =
      chapterFilter === 'appendices' ? 'appendices' : `ch${String(chapterFilter).padStart(2, '0')}`;
    dirs = dirs.filter((d) => d === want);
  }
  return dirs;
}

/**
 * parseSegmentsMap (first-wins, join-consistent with the TM) plus duplicate
 * counting via the all-occurrence records.
 */
function parseAndCount(content, stats) {
  const records = parseSegmentRecords(content);
  const map = parseSegmentsMap(content);
  stats.duplicateIds += records.length - map.size;
  return map;
}

/**
 * Load a module's derived review-status sidecar from disk (D1). Classification
 * is defensive by construction: any shape the corpus reader cannot trust — bad
 * JSON, a non-object `segments`, or a `module` that does not match the module
 * being exported (D2) — is 'malformed', so a single corrupt file yields `null`
 * for that module's rows without ever aborting the book export (D3.3).
 *
 * @param {string} sidecarPath  books/<book>/03-faithful-translation/<dir>/<mod>-review-status.json
 * @param {string} expectedModule  the module id the corpus is currently exporting
 * @returns {{state:'ok', segments:object} | {state:'absent'} | {state:'malformed'}}
 */
function loadSidecar(sidecarPath, expectedModule) {
  if (!fs.existsSync(sidecarPath)) return { state: 'absent' };
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(sidecarPath, 'utf-8'));
  } catch {
    return { state: 'malformed' };
  }
  const segments = parsed && parsed.segments;
  if (!segments || typeof segments !== 'object' || Array.isArray(segments)) {
    return { state: 'malformed' };
  }
  if (parsed.module !== expectedModule) return { state: 'malformed' };
  return { state: 'ok', segments };
}

/**
 * Resolve a row's reviewStatus per the addendum's ordered rules (D3). Returns
 * both the status and a `segMissing` flag so the caller can count the drift
 * tripwire (D3.4). Statuses pass through verbatim — the per-status counter is
 * the vocabulary check, so a future/malformed status reports itself rather than
 * being silently remapped.
 *
 * @param {{state:string, segments?:object}} sidecar  result of loadSidecar
 * @param {string} segId
 * @param {string|null} faithfulRaw  the row's faithful tier (already `|| null`-coerced)
 * @returns {{status: string|null, segMissing: boolean}}
 */
function resolveReviewStatus(sidecar, segId, faithfulRaw) {
  // D3.1 — cannot have reviewed a translation that is not there; also stops a
  // stale sidecar asserting a status on a row whose faithful tier is null.
  if (faithfulRaw == null || faithfulRaw.trim() === '') return { status: null, segMissing: false };
  // D3.2 (absent) + D3.3 (malformed)
  if (!sidecar || sidecar.state !== 'ok') return { status: null, segMissing: false };
  const entry = sidecar.segments[segId];
  // D3.5 — verbatim status
  if (entry && typeof entry.status === 'string') return { status: entry.status, segMissing: false };
  // D3.4 — file segment the sidecar does not list: a post-write drift tripwire
  return { status: null, segMissing: true };
}

/**
 * Assemble the corpus for a book (optionally one chapter).
 *
 * @param {string} book
 * @param {{chapter?: number|string|null}} [opts]
 * @returns {{rows: Array<object>, stats: object, skipped: string[]}}
 */
function buildCorpus(book, opts = {}) {
  const { licence } = getBookLicence(book); // throws loudly on unknown slug
  const dirs = listEnChapterDirs(book, opts.chapter ?? null);

  const rows = [];
  const skipped = [];
  const stats = {
    modulesListed: 0,
    filesSkipped: 0,
    rows: 0,
    tiers: { mt: 0, faithful: 0, localized: 0 },
    postEditedTrue: 0,
    postEditedFalse: 0,
    orphanIs: 0,
    duplicateIds: 0,
    emptyClean: 0,
    // Null-prototype map: a status value keyed literally '__proto__' must
    // become its own property, not silently hit the inherited __proto__
    // setter and vanish (F2).
    reviewStatus: Object.assign(Object.create(null), {
      edited: 0,
      accepted: 0,
      carryover: 0,
      null: 0,
    }),
    sidecarsRead: 0,
    sidecarsMalformed: 0,
    sidecarsAbsent: 0,
    sidecarSegMissing: 0,
  };

  for (const dir of dirs) {
    const chapter = chapterLabel(dir);
    const enDir = path.join(BOOKS_DIR, book, '02-for-mt', dir);

    const enFiles = [];
    for (const entry of fs.readdirSync(enDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (EN_FILE_RE.test(entry.name)) enFiles.push(entry.name);
      else {
        skipped.push(path.join(dir, entry.name));
        stats.filesSkipped++;
      }
    }
    enFiles.sort();

    for (const file of enFiles) {
      const moduleName = file.replace('-segments.en.md', '');
      const enMap = parseAndCount(fs.readFileSync(path.join(enDir, file), 'utf-8'), stats);
      if (enMap.size === 0) {
        skipped.push(`${path.join(dir, file)} (no SEG markers)`);
        stats.filesSkipped++;
        continue;
      }

      const tierMaps = {};
      for (const [tierName, tierDir] of Object.entries(TIER_DIRS)) {
        const p = path.join(BOOKS_DIR, book, tierDir, dir, `${moduleName}-segments.is.md`);
        tierMaps[tierName] = fs.existsSync(p)
          ? parseAndCount(fs.readFileSync(p, 'utf-8'), stats)
          : null;
      }

      // Review-status sidecar (D1/D2): sibling of the faithful file, one per
      // module. Classified once here so the module-grain counters stay in step
      // with modulesListed (invariant: read + malformed + absent === listed).
      const sidecar = loadSidecar(
        path.join(
          BOOKS_DIR,
          book,
          '03-faithful-translation',
          dir,
          `${moduleName}-review-status.json`
        ),
        moduleName
      );
      if (sidecar.state === 'ok') stats.sidecarsRead++;
      else if (sidecar.state === 'absent') stats.sidecarsAbsent++;
      else stats.sidecarsMalformed++;

      for (const [segId, enRaw] of enMap) {
        const faithfulRaw = tierMaps.faithful ? tierMaps.faithful.get(segId) || null : null;
        const { status: reviewStatus, segMissing } = resolveReviewStatus(
          sidecar,
          segId,
          faithfulRaw
        );
        if (segMissing) stats.sidecarSegMissing++;
        const row = buildRow({
          id: segId,
          book,
          chapter,
          module: moduleName,
          licence,
          en: enRaw,
          mt: tierMaps.mt ? tierMaps.mt.get(segId) || null : null,
          faithful: faithfulRaw,
          localized: tierMaps.localized ? tierMaps.localized.get(segId) || null : null,
          reviewStatus,
        });
        for (const tierName of ['mt', 'faithful', 'localized']) {
          if (row[tierName]) stats.tiers[tierName]++;
        }
        for (const tierName of ['en', 'mt', 'faithful', 'localized']) {
          if (row[tierName] && row[tierName].raw && row[tierName].clean === '') stats.emptyClean++;
        }
        if (row.postEdited === true) stats.postEditedTrue++;
        if (row.postEdited === false) stats.postEditedFalse++;
        const rsKey = row.reviewStatus === null ? 'null' : row.reviewStatus;
        stats.reviewStatus[rsKey] = (stats.reviewStatus[rsKey] || 0) + 1;
        rows.push(row);
        stats.rows++;
      }

      // IS-side seg-ids with no EN counterpart: warned + counted, never silent
      for (const tierMap of Object.values(tierMaps)) {
        if (!tierMap) continue;
        for (const segId of tierMap.keys()) {
          if (!enMap.has(segId)) {
            stats.orphanIs++;
            console.warn(`  warn: orphan IS seg-id (no EN counterpart): ${moduleName} ${segId}`);
          }
        }
      }
      stats.modulesListed++;
    }
  }

  skipped.sort(); // cross-clone manifest determinism
  return { rows, stats, skipped };
}

/**
 * @internal Test-only: override the books directory root.
 */
function _setTestBooksDir(dir) {
  BOOKS_DIR = dir;
}

// ─── Serialization ────────────────────────────────────────────────────

/**
 * Single source of truth for the TSV contract (I20-R6): one record per column,
 * each carrying its own getter. The header and every row derive from this array,
 * so a column can never drift between the two. Column name != row key for the
 * clean-tier columns (they dereference `.clean` off a nullable tier object) and
 * `elementId` is JSONL-only — so these are real accessors, not key lookups.
 */
const TSV_SPEC = [
  { column: 'id', get: (r) => r.id },
  { column: 'book', get: (r) => r.book },
  { column: 'chapter', get: (r) => r.chapter },
  { column: 'module', get: (r) => r.module },
  { column: 'type', get: (r) => r.type },
  { column: 'licence', get: (r) => r.licence },
  { column: 'en_clean', get: (r) => (r.en ? r.en.clean : '') },
  { column: 'mt_clean', get: (r) => (r.mt ? r.mt.clean : '') },
  { column: 'faithful_clean', get: (r) => (r.faithful ? r.faithful.clean : '') },
  { column: 'localized_clean', get: (r) => (r.localized ? r.localized.clean : '') },
  { column: 'postEdited', get: (r) => r.postEdited },
  { column: 'reviewStatus', get: (r) => r.reviewStatus },
];

const TSV_COLUMNS = TSV_SPEC.map((c) => c.column);

/** @param {Array<object>} rows */
function toJsonl(rows) {
  return rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
}

function tsvField(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[\t\n\r]/g, ' ');
}

/** @param {Array<object>} rows */
function toTsv(rows) {
  const lines = [TSV_COLUMNS.join('\t')];
  for (const r of rows) {
    lines.push(TSV_SPEC.map((c) => tsvField(c.get(r))).join('\t'));
  }
  return lines.join('\n') + '\n';
}

/**
 * @param {{book: string, licence: string, obtained: string, stats: object,
 *          skipped: string[], generated: string}} p
 */
function buildManifest(p) {
  return {
    generated: p.generated,
    tool: TOOL_NAME,
    toolVersion: TOOL_VERSION,
    book: p.book,
    licence: p.licence,
    licenceObtained: p.obtained,
    provenance: 'docs/provenance/openstax-cnxml-licence-provenance.md',
    stats: p.stats,
    skipped: p.skipped,
    notes: [
      'single-char legacy markers (*…*, ~…~, ^…^, __…__) retained in clean text (TM ambiguity rationale)',
      '[[MATH:N]]/[[MEDIA:n]] placeholders retained, resolve via 02-structure sidecars; [[BR]]/[[SPACE]] formatting placeholders also retained and are NOT sidecar-resolvable',
      `EN tier is the current extraction; for modules MT’d before a re-extraction the exact bytes sent to MT may differ (dialect drift, e.g. m68664)`,
      'faithful-tier presence and postEdited=false do not imply per-segment human review — apply rebuilds whole-module files, carrying unreviewed segments through as the normalized MT view; the per-segment record is the reviewStatus field (note 5)',
      'reviewStatus reflects the last apply, faithful-restore, or acceptance-revoke for the module — not live DB state, and not necessarily the current file bytes (a hand-edit to 03-faithful-translation/ does not regenerate the sidecar); null means unknown (no sidecar, no faithful tier, or a segment the sidecar does not list), never "unreviewed"',
    ],
  };
}

// ─── CLI ──────────────────────────────────────────────────────────────

const OUT_OPTION = { name: 'out', flags: ['--out', '-o'], type: 'string', default: null };
const DRY_RUN_OPTION = {
  name: 'dryRun',
  flags: ['--dry-run', '-n'],
  type: 'boolean',
  default: false,
};

/**
 * Write the three corpus artifacts. Stable filenames — regeneration
 * overwrites (spec §3; no date-stamp accumulation).
 */
function writeOutputs(rows, manifest, outDir, book) {
  fs.mkdirSync(outDir, { recursive: true });
  const jsonlPath = path.join(outDir, `${book}.corpus.jsonl`);
  const tsvPath = path.join(outDir, `${book}.corpus.tsv`);
  const manifestPath = path.join(outDir, `${book}.corpus-manifest.json`);
  fs.writeFileSync(jsonlPath, toJsonl(rows), 'utf-8');
  fs.writeFileSync(tsvPath, toTsv(rows), 'utf-8');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
  return { jsonlPath, tsvPath, manifestPath };
}

function printHelp() {
  console.log(`
${TOOL_NAME} - Export the aligned {EN, MT, faithful, localized} research corpus

Every extracted EN segment becomes a row, joined to the IS tiers on the frozen
SEG id; absent tiers are null. postEdited reproduces the segment editor's view
semantics. Output: JSONL (raw+clean per tier) + TSV (clean) + manifest.

Usage:
  node tools/export-corpus.js --book <book> [--chapter N] [--out <dir>] [--dry-run]

Options:
  --book <slug>      Book slug (required; must have a licence block in its books/<slug>/book-config.json)
  --chapter <N>      Limit to one chapter (number or 'appendices'); default all
  --out, -o <dir>    Output directory (default: books/<book>/corpus/)
  --dry-run, -n      Report what would be written without writing
  --verbose, -v      List skipped files
  -h, --help         Show this help
`);
}

function main() {
  const args = parseArgs(process.argv.slice(2), [
    BOOK_OPTION,
    CHAPTER_OPTION,
    OUT_OPTION,
    DRY_RUN_OPTION,
  ]);

  if (args.help) {
    printHelp();
    process.exit(0);
  }
  requireBook(args);
  const book = args.book;

  let licenceEntry;
  try {
    licenceEntry = getBookLicence(book);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  const { rows, stats, skipped } = buildCorpus(book, { chapter: args.chapter });

  if (args.verbose && skipped.length) {
    console.log(`\nSkipped files (${skipped.length}):`);
    for (const s of skipped) console.log(`  ${s}`);
  }

  console.log('\n' + '='.repeat(56));
  console.log(`Book:               ${book} (${licenceEntry.licence})`);
  console.log(`Chapter filter:     ${args.chapter ?? '(all)'}`);
  console.log(`Modules:            ${stats.modulesListed}`);
  console.log(`Rows:               ${stats.rows}`);
  console.log(
    `Tiers present:      mt=${stats.tiers.mt} faithful=${stats.tiers.faithful} localized=${stats.tiers.localized}`
  );
  console.log(`postEdited:         true=${stats.postEditedTrue} false=${stats.postEditedFalse}`);
  const rs = stats.reviewStatus;
  console.log(
    `reviewStatus:       edited=${rs.edited} accepted=${rs.accepted} carryover=${rs.carryover} null=${rs.null}`
  );
  if (stats.tiers.faithful > 0)
    console.log('  (faithful presence != per-segment review — see manifest notes)');
  if (stats.duplicateIds) console.log(`  duplicate seg-ids (first-wins): ${stats.duplicateIds}`);
  if (stats.orphanIs) console.log(`  orphan IS seg-ids (no EN):      ${stats.orphanIs}`);
  if (stats.emptyClean) console.log(`  tier texts empty after strip:   ${stats.emptyClean}`);
  if (stats.filesSkipped) console.log(`  files skipped (see manifest):   ${stats.filesSkipped}`);
  if (stats.sidecarsRead) console.log(`  review-status sidecars read:    ${stats.sidecarsRead}`);
  if (stats.sidecarsMalformed)
    console.log(`  review-status sidecars bad:     ${stats.sidecarsMalformed}`);
  if (stats.sidecarSegMissing)
    console.log(`  sidecar seg-id absent (drift):  ${stats.sidecarSegMissing}`);
  const rsUnexpected = Object.keys(rs).filter(
    (k) => !['edited', 'accepted', 'carryover', 'null'].includes(k)
  );
  if (rsUnexpected.length)
    console.log(`  unexpected reviewStatus values: ${rsUnexpected.join(', ')}`);

  if (rows.length === 0) {
    console.error('\nNo corpus rows produced. Is there extracted content in 02-for-mt/?');
    process.exit(1);
  }

  const outDir = args.out || path.join(BOOKS_DIR, book, 'corpus');
  const manifest = buildManifest({
    book,
    licence: licenceEntry.licence,
    obtained: licenceEntry.obtained,
    stats,
    skipped,
    generated: new Date().toISOString(),
  });

  if (args.dryRun) {
    console.log(`\nDRY RUN — would write ${rows.length} rows to:\n  ${outDir}`);
    return;
  }

  const paths = writeOutputs(rows, manifest, outDir, book);
  console.log(
    `\nWrote ${rows.length} rows:\n  ${paths.jsonlPath}\n  ${paths.tsvPath}\n  ${paths.manifestPath}`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export {
  corpusCleanText,
  splitSegId,
  computePostEdited,
  loadSidecar,
  resolveReviewStatus,
  buildRow,
  listEnChapterDirs,
  buildCorpus,
  _setTestBooksDir,
  toJsonl,
  toTsv,
  buildManifest,
  writeOutputs,
  TSV_COLUMNS,
  TSV_SPEC,
};
