#!/usr/bin/env node

/**
 * cnxml-render-fidelity-check.js — Render-STAGE structural check (Track A, A3).
 *
 * Complements cnxml-fidelity-check.js (which compares source vs translated
 * CNXML at the INJECT stage). This tool validates the RENDER stage: the
 * produced HTML in 05-publication against the injected CNXML in 03-translated,
 * aggregated per CHAPTER (render redistributes content within a chapter —
 * exercises move to a compiled exercises page, equations get chapter-wide
 * numbering, key-equations/summary pages re-present content — but never across
 * chapters, so the chapter is the closed reconciliation unit).
 *
 * It runs three independent checks (see checkChapter):
 *   1. control-char scan — any C0 control char (the null-byte degree-sign class)
 *      in injected CNXML or produced HTML. Baseline-free.
 *   2. cross-stage ">=" invariant — atomic, restructure-stable units that must
 *      survive render: <m:math> -> <mjx-container>, <image> -> <img>. Render
 *      only ADDS copies (rollup pages re-present; a de-dup bug duplicates), so
 *      HTML >= CNXML always holds; HTML < CNXML is an unambiguous DROP.
 *      Baseline-free, high-precision / low-sensitivity at chapter aggregate.
 *   3. shape-drift vs a committed per-book baseline — a normalized histogram of
 *      structural HTML buckets (figure/img/em/strong/table/list/example/note/
 *      exercise/equation/link…). Any deviation from baseline is a regression
 *      (dropped figure, bold<->italic swap, …). This is the sensitive detector.
 *
 * IMPORTANT — what this does NOT do: it validates the *published artifact*
 * (output consistency + shape regression vs baseline). It does NOT catch a
 * render-CODE regression at PR time before a render actually runs; that needs a
 * re-render driver (deferred — the chapter render orchestration in
 * cnxml-render.js main() is heavily coupled, and CI credits are exhausted until
 * ~2026-07-01). The default driver reads committed 05-publication output.
 *
 * The baseline must be captured from a CLEAN render (--update-baseline), never
 * from output known to contain a render bug, or it blesses the bug.
 *
 * Usage:
 *   node tools/cnxml-render-fidelity-check.js --book efnafraedi-2e --chapter 14
 *   node tools/cnxml-render-fidelity-check.js --book efnafraedi-2e
 *   node tools/cnxml-render-fidelity-check.js --book efnafraedi-2e --update-baseline
 *
 * Exit code 0 if clean, 1 if any finding.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseArgs, BOOK_OPTION, CHAPTER_OPTION, requireBook } from './lib/parseArgs.js';

// C0 control chars except the three valid in text (tab, LF, CR). Mirrors
// api-translate.js assertNoControlChars — the degree-sign-> NUL incident.
const CONTROL_CHAR_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;

const count = (s, re) => (s.match(re) || []).length;

// ─── Pure structural measures ───────────────────────────────────────

/**
 * Normalized structural histogram of produced HTML. Regex-based on purpose:
 * rendered HTML is not XML-clean (inline SVG, the trailing page-data <script>
 * JSON blob), so a parser would fight the input. We count tag + the few class/
 * attr reflections that distinguish semantic buckets (em vs strong for the
 * emphasis swap; a[href] vs a[data-target] for link kinds; the container
 * classes example/note/exercise).
 *
 * @param {string} html
 * @returns {Record<string, number>}
 */
export function htmlShapeHistogram(html) {
  return {
    figure: count(html, /<figure\b/g),
    img: count(html, /<img\b/g),
    table: count(html, /<table\b/g),
    ul: count(html, /<ul\b/g),
    ol: count(html, /<ol\b/g),
    li: count(html, /<li\b/g),
    em: count(html, /<em\b/g),
    strong: count(html, /<strong\b/g),
    'aside.example': count(html, /<aside\b[^>]*class="[^"]*\bexample\b/g),
    'aside.note': count(html, /<aside\b[^>]*class="[^"]*\bnote\b/g),
    'div.eoc-exercise': count(html, /<div\b[^>]*class="[^"]*\beoc-exercise\b/g),
    'div.equation': count(html, /<div\b[^>]*class="[^"]*\bequation\b/g),
    'mjx-container': count(html, /<mjx-container\b/g),
    'span.math-inline': count(html, /class="math-inline"/g),
    'span.mathjax-display': count(html, /class="mathjax-display"/g),
    'a[href]': count(html, /<a\b[^>]*\shref=/g),
  };
}

/** Sum two histograms bucket-wise. */
export function addHistograms(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] || 0) + v;
  return out;
}

/**
 * Run the three render-stage checks for one chapter's aggregated inputs.
 * Pure — the caller supplies content; no disk access. The acceptance vitest
 * feeds fixtures here directly, never through the driver.
 *
 * @param {object} inputs
 * @param {string[]} inputs.cnxml - injected CNXML strings (03-translated) for the chapter
 * @param {string[]} inputs.html  - produced HTML strings (05-publication) for the chapter
 * @param {Record<string, number>|null} [baseline] - committed shape histogram for this chapter
 * @returns {Array<object>} findings (empty = clean)
 */
export function checkChapter(inputs, baseline = null) {
  const findings = [];
  const cnxmlAll = inputs.cnxml.join('\n');
  const htmlAll = inputs.html.join('\n');

  // 1. control-char scan (baseline-free)
  for (const [label, text] of [
    ['injected-cnxml', cnxmlAll],
    ['produced-html', htmlAll],
  ]) {
    const m = text.match(CONTROL_CHAR_REGEX);
    if (m) {
      const codes = [
        ...new Set(m.map((c) => '0x' + c.charCodeAt(0).toString(16).padStart(2, '0'))),
      ];
      findings.push({ type: 'control-char', where: label, count: m.length, codes });
    }
  }

  // 2. cross-stage ">=" invariant (baseline-free): a DROP is unambiguous.
  const invariants = [
    {
      unit: 'math',
      cnxml: count(cnxmlAll, /<m:math\b/g),
      html: count(htmlAll, /<mjx-container\b/g),
    },
    { unit: 'image', cnxml: count(cnxmlAll, /<image\b/g), html: count(htmlAll, /<img\b/g) },
  ];
  for (const inv of invariants) {
    if (inv.html < inv.cnxml) {
      findings.push({
        type: 'cross-stage-drop',
        unit: inv.unit,
        cnxml: inv.cnxml,
        html: inv.html,
        dropped: inv.cnxml - inv.html,
      });
    }
  }

  // 3. shape-drift vs committed baseline (the sensitive detector)
  if (baseline) {
    const actual = inputs.html.reduce((acc, h) => addHistograms(acc, htmlShapeHistogram(h)), {});
    const buckets = new Set([...Object.keys(baseline), ...Object.keys(actual)]);
    for (const bucket of [...buckets].sort()) {
      const exp = baseline[bucket] || 0;
      const act = actual[bucket] || 0;
      if (exp !== act) {
        findings.push({
          type: 'shape-drift',
          bucket,
          expected: exp,
          actual: act,
          delta: act - exp,
        });
      }
    }
  }

  return findings;
}

// ─── Driver: read committed 05-publication + 03-translated ───────────

function formatChapterDir(chapter) {
  if (chapter === 'appendices') return 'appendices';
  return `ch${String(chapter).padStart(2, '0')}`;
}

function discoverChapters(bookDir) {
  const sourceDir = path.join(bookDir, '01-source');
  if (!fs.existsSync(sourceDir)) return [];
  return fs
    .readdirSync(sourceDir)
    .filter((d) => /^ch\d+$/.test(d) || d === 'appendices')
    .sort((a, b) =>
      a === 'appendices'
        ? 1
        : b === 'appendices'
          ? -1
          : a.localeCompare(b, undefined, { numeric: true })
    );
}

/** Gather a chapter's injected CNXML + produced HTML from disk (the default driver). */
export function readChapterFromDisk(bookDir, chapter, track) {
  const chDir = formatChapterDir(chapter);
  const cnxmlDir = path.join(bookDir, '03-translated', track, chDir);
  // 05-publication uses numeric chapter dirs (chapters/14), not ch14
  const numericCh = chapter === 'appendices' ? 'appendices' : String(chapter);
  const htmlDir = path.join(bookDir, '05-publication', track, 'chapters', numericCh);

  const cnxml = fs.existsSync(cnxmlDir)
    ? fs
        .readdirSync(cnxmlDir)
        .filter((f) => /^m\d+\.cnxml$/.test(f))
        .sort()
        .map((f) => fs.readFileSync(path.join(cnxmlDir, f), 'utf8'))
    : [];
  const html = fs.existsSync(htmlDir)
    ? fs
        .readdirSync(htmlDir)
        .filter((f) => f.endsWith('.html') && !f.includes('.backup'))
        .sort()
        .map((f) => fs.readFileSync(path.join(htmlDir, f), 'utf8'))
    : [];
  return { cnxml, html };
}

function baselinePath(bookDir) {
  return path.join(bookDir, 'render-fidelity-baseline.json');
}

function loadBaseline(bookDir) {
  const p = baselinePath(bookDir);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function parseCliArgs(argv) {
  return parseArgs(argv, [
    BOOK_OPTION,
    CHAPTER_OPTION,
    { name: 'track', flags: ['--track'], type: 'string', default: 'mt-preview' },
    { name: 'updateBaseline', flags: ['--update-baseline'], type: 'boolean', default: false },
  ]);
}

function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help) {
    console.log('cnxml-render-fidelity-check.js — render-stage structural check. See file header.');
    process.exit(0);
  }
  requireBook(args);
  const bookDir = `books/${args.book}`;
  const chapters = args.chapter
    ? [String(args.chapter)]
    : discoverChapters(bookDir).map((d) => d.replace(/^ch0?/, ''));

  const baselineData = loadBaseline(bookDir);
  const newBaseline = {};
  let totalFindings = 0;

  for (const chapter of chapters) {
    const inputs = readChapterFromDisk(bookDir, chapter, args.track);
    if (inputs.html.length === 0) continue;

    if (args.updateBaseline) {
      newBaseline[chapter] = inputs.html.reduce(
        (acc, h) => addHistograms(acc, htmlShapeHistogram(h)),
        {}
      );
      console.log(`baseline ch${chapter}: ${inputs.html.length} html files`);
      continue;
    }

    const chapterBaseline =
      baselineData && baselineData.chapters ? baselineData.chapters[chapter] : null;
    const findings = checkChapter(inputs, chapterBaseline);
    if (findings.length) {
      totalFindings += findings.length;
      console.log(`\nch${chapter}: ${findings.length} finding(s)`);
      for (const f of findings) console.log('  ' + JSON.stringify(f));
    } else {
      console.log(
        `ch${chapter}: clean${chapterBaseline ? '' : ' (no baseline — shape-drift skipped)'}`
      );
    }
  }

  if (args.updateBaseline) {
    const out = {
      _note:
        'Render-stage shape baseline. Capture ONLY from a clean render — a baseline taken from output containing a render bug blesses the bug. Regenerate after intentional render changes (e.g. after the C2 equation-dedup fix re-renders).',
      track: args.track,
      chapters: newBaseline,
    };
    fs.writeFileSync(baselinePath(bookDir), JSON.stringify(out, null, 2) + '\n', 'utf8');
    console.log(`\nWrote ${baselinePath(bookDir)} (${Object.keys(newBaseline).length} chapters)`);
    process.exit(0);
  }

  console.log(`\n${'═'.repeat(50)}\nTotal findings: ${totalFindings}`);
  process.exit(totalFindings > 0 ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
