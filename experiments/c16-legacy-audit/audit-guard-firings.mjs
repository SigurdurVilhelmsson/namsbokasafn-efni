#!/usr/bin/env node
/**
 * C16 audit — artifact (a): does the !hasApiMarkers legacy branch actually
 * alter injected output, and where?
 *
 * METHOD (deliberately not a shape regex — §C16 records that a regex census
 * mis-scored chemistry's MathML <mo>_____</mo> blanks):
 *   Run the REAL reverseInlineMarkup twice over identical inputs — once as
 *   shipped, once from a copy of the module whose `hasApiMarkers` const is
 *   forced to true. The delta is exactly what the three !hasApiMarkers blocks
 *   contributed. One variable, no re-implementation.
 *
 * READ-ONLY over books/. Writes only its own JSON report + a temp module copy
 * in tools/, which it deletes in a finally.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve against this file, never process.cwd() (CLAUDE.md durable rule).
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOOLS = path.join(REPO, 'tools');
const BOOKS = path.join(REPO, 'books');
const PATCHED = path.join(TOOLS, '__c16_audit_forced.mjs');
const OUT = process.argv[2] || '/tmp/c16-audit-a.json';
// Which source track to scan. 02-mt-output is READ-ONLY MT; 03-faithful-translation and
// 04-localized-content are EDITABLE — that is where the C13-class "era inferred from
// editable text" hazard can actually bite, so both must be audited, not just the MT.
const STAGE = process.env.STAGE || '02-mt-output';

// The exact guard regex from tools/cnxml-inject.js:1252 — copied verbatim so
// the census figure is derived from the same predicate the code uses.
const GUARD =
  /\{\{[ib]\}\}|\{\{[ib]:|\{\{term\}\}|\{\{fn\}\}|\[\[sub:|\[\[sup:|\[\[i:|\[\[b:|\[\[term:|\[\[fn:|\[\[u:|\[\[em:/;

function makePatched() {
  const src = fs.readFileSync(path.join(TOOLS, 'cnxml-inject.js'), 'utf8');
  const re = /const hasApiMarkers =\s*\n\s*\/[^\n]*\n\s*text\n\s*\);/;
  if (!re.test(src)) {
    throw new Error('PATCH TARGET NOT FOUND — the guard shape changed; audit would be vacuous.');
  }
  const patched = src.replace(re, 'const hasApiMarkers = true; /* C16 AUDIT FORCED */');
  if (patched === src) throw new Error('patch was a no-op');
  fs.writeFileSync(PATCHED, patched);
}

function chapterDirs(bookDir, stage) {
  const p = path.join(bookDir, stage);
  if (!fs.existsSync(p)) return [];
  return fs
    .readdirSync(p, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

async function main() {
  makePatched();
  const orig = await import(path.join(TOOLS, 'cnxml-inject.js'));
  const forced = await import(PATCHED);

  // Silence the tools' per-segment warnings; we only want the delta.
  const noop = () => {};
  const realWarn = console.warn,
    realErr = console.error,
    realLog = console.log;

  const report = {
    method:
      'A/B of real reverseInlineMarkup; variable = hasApiMarkers const only. Counting unit: SEGMENT.',
    generated: process.env.AUDIT_STAMP || null,
    totals: { books: 0, files: 0, segments: 0, guardFalse: 0, guardTrue: 0, fired: 0, errors: 0 },
    perBook: {},
    firings: [],
    errors: [],
  };

  const books = fs
    .readdirSync(BOOKS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  for (const book of books) {
    const bookDir = path.join(BOOKS, book);
    const b = { files: 0, segments: 0, guardFalse: 0, fired: 0, firedModules: new Set() };
    for (const [stage, chDir] of chapterDirs(bookDir, STAGE).map((c) => [STAGE, c])) {
      const dir = path.join(bookDir, stage, chDir);
      for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('-segments.is.md'))) {
        const moduleId = f.replace('-segments.is.md', '');
        const content = fs.readFileSync(path.join(dir, f), 'utf8');

        console.warn = noop;
        console.error = noop;
        console.log = noop;
        let segments;
        try {
          segments = orig.parseSegments(content);
        } finally {
          console.warn = realWarn;
          console.error = realErr;
          console.log = realLog;
        }
        if (!segments || segments.size === 0) continue;
        b.files++;

        const eqPath = path.join(bookDir, '02-structure', chDir, `${moduleId}-equations.json`);
        const equations = fs.existsSync(eqPath)
          ? JSON.parse(fs.readFileSync(eqPath, 'utf8'))
          : {};

        for (const [segId, text] of segments) {
          b.segments++;
          const hasApi = GUARD.test(text);
          if (hasApi) continue;
          b.guardFalse++;

          console.warn = noop;
          console.error = noop;
          console.log = noop;
          let a, c, err = null;
          try {
            const args = [equations, [], [], null, null, null, { segmentId: segId }];
            a = orig.reverseInlineMarkup(text, ...args);
            c = forced.reverseInlineMarkup(text, ...args);
          } catch (e) {
            err = e.message;
          } finally {
            console.warn = realWarn;
            console.error = realErr;
            console.log = realLog;
          }

          if (err) {
            report.errors.push({ book, chDir, moduleId, segId, err });
            report.totals.errors++;
            continue;
          }
          if (a !== c) {
            b.fired++;
            b.firedModules.add(`${chDir}/${moduleId}`);
            report.firings.push({
              book,
              chDir,
              moduleId,
              segId,
              // NO TRUNCATION. A truncated pair silently reports "no change" for
              // any difference past the cut — no observer, not no effect.
              input: text,
              withLegacy: a,
              withoutLegacy: c,
            });
          }
        }
      }
    }
    if (b.files === 0) continue;
    report.totals.books++;
    report.totals.files += b.files;
    report.totals.segments += b.segments;
    report.totals.guardFalse += b.guardFalse;
    report.totals.fired += b.fired;
    report.perBook[book] = {
      files: b.files,
      segments: b.segments,
      guardFalse: b.guardFalse,
      guardFalsePct: +((100 * b.guardFalse) / b.segments).toFixed(1),
      fired: b.fired,
      firedModules: [...b.firedModules].sort(),
    };
  }
  report.totals.guardTrue = report.totals.segments - report.totals.guardFalse;
  report.totals.guardFalsePct = +(
    (100 * report.totals.guardFalse) /
    report.totals.segments
  ).toFixed(1);

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ totals: report.totals, perBook: report.perBook }, null, 2));
  console.log(`\nfirings written to ${OUT} (${report.firings.length} rows)`);
}

main()
  .catch((e) => {
    console.error('FAILED:', e);
    process.exitCode = 1;
  })
  .finally(() => {
    if (fs.existsSync(PATCHED)) fs.unlinkSync(PATCHED);
  });
