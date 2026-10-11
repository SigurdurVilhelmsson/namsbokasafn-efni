#!/usr/bin/env node
/**
 * READ-ONLY: what does the concept model resolve each English string to, for one book,
 * at chapter 0 (the book default), exactly as the glossary export resolves it?
 *
 * Written for plan 2026-10-10 Stage 1 (experiments/terminology-consistency/): a ruling
 * needs a houseStyleTerms.js entry only where its target differs from the STORED word,
 * so the compile step has to know the stored word. It calls prod's own `buildScope` and
 * `resolve`, the same pair `buildResolvedGlossary` calls, so the answer is the resolver's
 * and not a re-implementation of it.
 *
 * The database is opened `readonly: true, fileMustExist: true`; nothing is written.
 *
 * Usage (prints one JSON object on stdout):
 *   node server/scripts/read-term-resolutions.js <book> <queries.json | b64:<base64 JSON>>
 * where the JSON is an array of English strings.
 *
 * ⚠️ To run it on a box where this file is not deployed, send the SCRIPT on stdin and the
 * queries as base64 in argv, so the box receives no file:
 *   ssh <prod> "cd <repo>/server/scripts && node - efnafraedi-2e b64:$(base64 -w0 q.json)" \
 *     < server/scripts/read-term-resolutions.js
 * Run that way, `require` resolves from the working directory, which is why it must be
 * server/scripts (so `../lib` and better-sqlite3 in server/node_modules both resolve).
 */
const fs = require('fs');
const { execFileSync } = require('child_process');
const Database = require('better-sqlite3');
const resolveDbPath = require('../lib/dbPath');
const { buildScope, resolve } = require('../lib/conceptResolver');

const [book, src] = process.argv.slice(2);
if (!book || !src) {
  console.error('usage: read-term-resolutions.js <book> <queries.json | b64:<base64 JSON>>');
  process.exitCode = 2;
} else {
  const raw = src.startsWith('b64:')
    ? Buffer.from(src.slice(4), 'base64').toString('utf8')
    : fs.readFileSync(src, 'utf8');
  const queries = JSON.parse(raw);
  const dbPath = resolveDbPath();
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  const scope = buildScope(db, book, 0);
  if (scope.unscoped) throw new Error(`${book}: unscoped (${scope.unscoped})`);
  const brief = (c) =>
    c && { text: c.text, conceptId: c.conceptId, domain: c.domain, position: c.position };
  const results = {};
  for (const q of queries) {
    const r = resolve(scope, q);
    results[q] = {
      winner: brief(r.winner),
      reason: r.reason,
      tied: (r.tied || []).map((c) => brief(c) || c),
      outOfScope: (r.outOfScope || []).length,
      // Every Icelandic term on the winning concept, rank order, the winner included.
      alternatives: r.winner ? scope.stmts.terms.all(r.winner.conceptId).map((t) => t.text) : [],
    };
  }
  const head = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim();
  process.stdout.write(
    JSON.stringify({ book, chapter: 0, head, readAt: new Date().toISOString(), dbPath, results })
  );
}
