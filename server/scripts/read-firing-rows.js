#!/usr/bin/env node
/**
 * READ-ONLY census of the glossary rows the segment editor shows, for one book (c19).
 *
 * It runs the editor's own matcher, `terminologyService.findTermsInSegments`, over every
 * module of every chapter and prints one row per (English, Icelandic) pair, with where it
 * fired, how the concept resolver chose it, and the alternatives. Nothing is written: the
 * database is opened `readonly: true, fileMustExist: true` and no file is created.
 *
 * Usage (prints one JSON object, schema `c19-census/1`, on stdout):
 *   node server/scripts/read-firing-rows.js <book> [--books-dir <abs path>]
 * `--books-dir` is a test seam (it calls segmentParser._setTestBooksDir); the database is
 * redirected with the existing SESSIONS_DB_PATH variable.
 *
 * ⚠️ To run it on a box where this file is not deployed, send the SCRIPT on stdin, so the
 * box receives no file (cwd must be server/scripts so `../lib` and better-sqlite3 resolve):
 *   ssh -o BatchMode=yes <prod> "cd <repo>/server/scripts && node - efnafraedi-2e" \
 *     < server/scripts/read-firing-rows.js
 *
 * ⚠️ The server logger (pino) writes JSON to stdout in production, and findTermsInSegments
 * logs a warning for a book with no domain priorities. Both variables below are read when
 * the logger is first required, so they are set before any server `require`. They are set
 * only when this file is the entry point; a test that requires it keeps its own settings.
 */
// Under `node -` (script on stdin) require.main is undefined, but module.id is '[stdin]'.
const IS_ENTRY = require.main === module || module.id === '[stdin]';
if (IS_ENTRY) {
  process.exitCode = 1; // failure default: only a fully written document sets 0
  process.env.LOG_LEVEL = 'silent';
  process.env.NODE_ENV = 'production';
}

const { parseArgs } = require('node:util');
const { execFileSync } = require('node:child_process');
const Database = require('better-sqlite3');
const resolveDbPath = require('../lib/dbPath');
const { buildScope, resolve } = require('../lib/conceptResolver');
const terminologyService = require('../services/terminologyService');
const segmentParser = require('../services/segmentParser');

/**
 * @typedef {object} CensusRow
 * @property {string} english
 * @property {string|null} icelandic
 * @property {string|null} domain
 * @property {number|null} conceptId
 * @property {boolean} isFallback
 * @property {boolean} isTied
 * @property {string|null} reason
 * @property {string[]} alternatives
 * @property {{text: string, domain: string}|null} ifRemoved
 * @property {number[]} chapters
 * @property {number} matchCount
 * @property {number} issueCount
 * @property {Array<{chapter: number, moduleId: string, segmentId: string}>} matches
 */

/**
 * Collect every glossary row that fires over the given chapters.
 *
 * Call `terminologyService._setTestDb(db)` first: the matcher reads that handle.
 *
 * @param {object} args
 * @param {import('better-sqlite3').Database} args.db
 * @param {string} args.book
 * @param {number[]} args.chapters
 * @param {(chapter: number) => Array<{moduleId: string, segments: Array<{segmentId: string, enContent: string, isContent: string}>}>} args.loadSegments
 * @returns {{rows: CensusRow[]}}
 */
function collectFiringRows({ db, book, chapters, loadSegments }) {
  const rows = new Map();
  for (const chapter of chapters) {
    const scope = buildScope(db, book, chapter);
    const resolved = new Map(); // english -> resolution facts, per chapter scope
    const facts = (english) => {
      if (resolved.has(english)) return resolved.get(english);
      const res = resolve(scope, english);
      const first = (res.alsoInScope || [])[0] || (res.outOfScope || [])[0] || null;
      const f = {
        reason: res.reason ?? null,
        domain: res.winner ? res.winner.domain : null,
        conceptId: res.winner ? res.winner.conceptId : null,
        alternatives: res.winner
          ? scope.stmts.terms.all(res.winner.conceptId).map((t) => t.text)
          : [],
        ifRemoved: first ? { text: first.text, domain: first.domain } : null,
        fallbackDomain: !res.winner && (res.outOfScope || [])[0] ? res.outOfScope[0].domain : null,
        fallbackConceptId:
          !res.winner && (res.outOfScope || [])[0] ? res.outOfScope[0].conceptId : null,
      };
      resolved.set(english, f);
      return f;
    };

    for (const { moduleId, segments } of loadSegments(chapter)) {
      const found = terminologyService.findTermsInSegments(segments, book, chapter);
      for (const [segmentId, { matches, issues }] of Object.entries(found)) {
        for (const m of matches) {
          const key = `${m.english}\u0000${m.icelandic ?? ''}`;
          let row = rows.get(key);
          if (!row) {
            const f = facts(m.english);
            row = {
              english: m.english,
              icelandic: m.icelandic ?? null,
              domain: f.domain ?? f.fallbackDomain,
              conceptId: f.conceptId ?? f.fallbackConceptId,
              isFallback: Boolean(m.isFallback),
              isTied: Boolean(m.isTied),
              reason: f.reason,
              alternatives: f.alternatives,
              ifRemoved: f.ifRemoved,
              chapters: [],
              matchCount: 0,
              issueCount: 0,
              matches: [],
            };
            rows.set(key, row);
          }
          if (!row.chapters.includes(chapter)) row.chapters.push(chapter);
          row.matchCount += 1;
          row.matches.push({ chapter, moduleId, segmentId });
        }
        // An issue belongs to the segment, not to one match; count it against every
        // row that fired there so a row's issueCount says "issues where it appeared".
        const issueCount = (issues || []).length;
        if (issueCount > 0) {
          for (const m of matches) {
            rows.get(`${m.english}\u0000${m.icelandic ?? ''}`).issueCount += issueCount;
          }
        }
      }
    }
  }
  return { rows: [...rows.values()] };
}

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    strict: true,
    options: { 'books-dir': { type: 'string' } },
  });
  const [book] = positionals;
  if (!book || positionals.length !== 1) {
    console.error('usage: read-firing-rows.js <book> [--books-dir <abs path>]');
    process.exitCode = 2;
    return;
  }
  // The commit first: a box where it cannot be read fails here, before the long work.
  const head = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim();
  if (values['books-dir']) segmentParser._setTestBooksDir(values['books-dir']);

  const dbPath = resolveDbPath();
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  terminologyService._setTestDb(db);

  const loadSegments = (chapter) =>
    segmentParser.listChapterModules(book, chapter).map(({ moduleId }) => ({
      moduleId,
      segments: segmentParser
        .loadModuleForEditing(book, chapter, moduleId)
        .segments.map((s) => ({ segmentId: s.segmentId, enContent: s.en, isContent: s.is })),
    }));

  const { rows } = collectFiringRows({
    db,
    book,
    chapters: segmentParser.listChapters(book),
    loadSegments,
  });
  process.stdout.write(
    JSON.stringify({
      schema: 'c19-census/1',
      book,
      head,
      readAt: new Date().toISOString(),
      dbPath,
      rows,
    })
  );
  process.exitCode = 0;
}

if (IS_ENTRY) main();

module.exports = { collectFiringRows };
