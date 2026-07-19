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

const TOOL_NAME = 'export-corpus.js';
const TOOL_VERSION = '1.0';

let BOOKS_DIR = path.join(fileURLToPath(new URL('..', import.meta.url)), 'books');

// ─── Text & row helpers ───────────────────────────────────────────────

/**
 * Corpus clean text: the TM's cleanSegmentText plus corpus-only additions.
 * [[lb:]]/[[rb:]] (item-9 literal-bracket escapes) decode LAST so restored
 * brackets can never be re-parsed as markers; [[MATH:N]]/[[MEDIA:n]] pass
 * through verbatim (positional placeholders, resolvable via 02-structure).
 *
 * @param {string} raw
 * @returns {string}
 */
function corpusCleanText(raw) {
  return cleanSegmentText(raw)
    .replace(/\[\[lb:\]\]/g, '[')
    .replace(/\[\[rb:\]\]/g, ']');
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
 * The editor-visible view of an IS tier, per loadModuleForEditing
 * (server/services/segmentParser.js:164-239): normalizeWraps on parse →
 * unescapeMtMarkers → normalizeTermMarkers against the wrap-normalized EN.
 * postEdited answers "would the editor's diff view show a change" —
 * a byte-comparison against raw MT would mislabel every normalization
 * artifact as a human edit.
 *
 * @param {string} enRaw
 * @param {string|null} mtRaw
 * @param {string|null} faithfulRaw
 * @returns {boolean|null} null unless both IS tiers are present
 */
function computePostEdited(enRaw, mtRaw, faithfulRaw) {
  if (mtRaw == null || faithfulRaw == null) return null;
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

      for (const [segId, enRaw] of enMap) {
        const row = buildRow({
          id: segId,
          book,
          chapter,
          module: moduleName,
          licence,
          en: enRaw,
          mt: tierMaps.mt ? (tierMaps.mt.get(segId) ?? null) : null,
          faithful: tierMaps.faithful ? (tierMaps.faithful.get(segId) ?? null) : null,
          localized: tierMaps.localized ? (tierMaps.localized.get(segId) ?? null) : null,
        });
        for (const tierName of ['mt', 'faithful', 'localized']) {
          if (row[tierName]) stats.tiers[tierName]++;
        }
        for (const tierName of ['en', 'mt', 'faithful', 'localized']) {
          if (row[tierName] && row[tierName].raw && row[tierName].clean === '') stats.emptyClean++;
        }
        if (row.postEdited === true) stats.postEditedTrue++;
        if (row.postEdited === false) stats.postEditedFalse++;
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

  return { rows, stats, skipped };
}

/**
 * @internal Test-only: override the books directory root.
 */
function _setTestBooksDir(dir) {
  BOOKS_DIR = dir;
}

// ─── Serialization ────────────────────────────────────────────────────

const TSV_COLUMNS = [
  'id',
  'book',
  'chapter',
  'module',
  'type',
  'licence',
  'en_clean',
  'mt_clean',
  'faithful_clean',
  'localized_clean',
  'postEdited',
];

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
    lines.push(
      [
        r.id,
        r.book,
        r.chapter,
        r.module,
        r.type,
        r.licence,
        r.en ? r.en.clean : '',
        r.mt ? r.mt.clean : '',
        r.faithful ? r.faithful.clean : '',
        r.localized ? r.localized.clean : '',
        r.postEdited === null ? '' : String(r.postEdited),
      ]
        .map(tsvField)
        .join('\t')
    );
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
      '[[MATH:N]]/[[MEDIA:n]] placeholders retained; resolve via 02-structure sidecars',
      `EN tier is the current extraction; for modules MT'd before a re-extraction the exact bytes sent to MT may differ (dialect drift, e.g. m68664)`,
    ],
  };
}

export {
  corpusCleanText,
  splitSegId,
  computePostEdited,
  buildRow,
  listEnChapterDirs,
  buildCorpus,
  _setTestBooksDir,
  toJsonl,
  toTsv,
  buildManifest,
  TSV_COLUMNS,
};
