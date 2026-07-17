#!/usr/bin/env node

/**
 * exercise-extract.js — Extract os-embed exercise content into MT-ready
 * segments (item 9 / D3).
 *
 * Reads books/{book}/01-source/exercises/*.json (READ-ONLY — the cache
 * fetched by resolve-os-embed.js) and writes, per chapter:
 *   02-for-mt/chNN/exercises-segments.en.md      (translatable runs)
 *   02-structure/chNN/exercises-skeleton.json    (byte-exact structure)
 *
 * Only the fields the renderer consumes are extracted: stimulus_html,
 * questions[].stem_html, and questions[].collaborator_solutions[0]
 * .content_html — solutions only when solutions_are_public is truthy
 * (mirrors resolveOsEmbed; render-blocked content never spends MT budget).
 *
 * Deterministic seg-ids ({nickname}:{type}:{elementId}) — re-extraction is
 * byte-identical; ids are stable the day real MT runs.
 *
 * Usage:
 *   node tools/exercise-extract.js --book lifraen-efnafraedi [--chapter 12] [--verbose]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { htmlToField } from './lib/exercise-html.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOOKS_DIR = path.join(__dirname, '..', 'books');

/** Chapter dir from a nickname's first token: '01'→ch01, '18a'→ch18 (documented fold). */
function chapterDirForNickname(nickname) {
  const token = nickname.split('-')[0];
  const n = parseInt(token, 10);
  if (Number.isNaN(n))
    throw new Error(`unparsable chapter token '${token}' in nickname ${nickname}`);
  return `ch${String(n).padStart(2, '0')}`;
}

/** Per-field translatable surfaces of one exercise, in canonical order. */
function exerciseFields(exercise) {
  const fields = [];
  if ((exercise.stimulus_html || '').trim()) {
    fields.push({
      key: 'stimulus',
      type: 'stimulus',
      elementId: (k) => `b${k}`,
      html: exercise.stimulus_html,
    });
  }
  const solutionsPublic = exercise.solutions_are_public || false;
  const seenQids = new Set();
  for (const q of exercise.questions || []) {
    // A duplicate id collides on the SAME seg-id (`{nickname}:stem:{id}-b{k}`)
    // and skeleton field key (`stem:{id}`) — the second question would
    // silently overwrite the first's field/segments instead of surfacing as
    // an error (final review M-b).
    if (seenQids.has(q.id)) throw new Error(`duplicate question id ${q.id} within exercise`);
    seenQids.add(q.id);
    if ((q.stem_html || '').trim()) {
      fields.push({
        key: `stem:${q.id}`,
        type: 'stem',
        elementId: (k) => `${q.id}-b${k}`,
        html: q.stem_html,
      });
    }
    const sol = (q.collaborator_solutions || [])[0];
    if (solutionsPublic && sol && (sol.content_html || '').trim()) {
      fields.push({
        key: `sol:${q.id}`,
        type: 'sol',
        elementId: (k) => `${q.id}-b${k}`,
        html: sol.content_html,
      });
    }
  }
  return fields;
}

/**
 * Extract one book's exercises. Pure of argv/process.exit for testability.
 * @param {string} bookDir - absolute path to books/{slug}
 * @param {{chapter?: string|number, verbose?: boolean, log?: (s:string)=>void}} opts
 * @returns {{chapters: Map<string, {segments: string, skeleton: object}>,
 *            failures: {nickname: string, error: string}[],
 *            counts: {exercises: number, segments: number}}}
 */
export function extractBook(bookDir, opts = {}) {
  const log = opts.log || (() => {});
  const exercisesDir = path.join(bookDir, '01-source', 'exercises');
  if (!fs.existsSync(exercisesDir)) {
    throw new Error(`no exercises cache at ${exercisesDir} (run resolve-os-embed.js first)`);
  }

  const wantCh =
    opts.chapter != null
      ? `ch${String(parseInt(String(opts.chapter), 10)).padStart(2, '0')}`
      : null;

  const byChapter = new Map(); // chDir -> [{nickname, exercise}]
  const failures = [];
  const files = fs
    .readdirSync(exercisesDir)
    .filter((f) => f.endsWith('.json'))
    .sort();

  for (const file of files) {
    const nickname = file.replace(/\.json$/, '');
    try {
      const chDir = chapterDirForNickname(nickname);
      if (wantCh && chDir !== wantCh) continue;
      const exercise = JSON.parse(fs.readFileSync(path.join(exercisesDir, file), 'utf8'));
      if (!byChapter.has(chDir)) byChapter.set(chDir, []);
      byChapter.get(chDir).push({ nickname, exercise });
    } catch (err) {
      failures.push({ nickname, error: err.message });
      log(`  ✗ ${nickname}: ${err.message}`);
    }
  }

  const chapters = new Map();
  let segmentCount = 0;
  let exerciseCount = 0;

  for (const [chDir, list] of [...byChapter.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const segLines = [];
    const skeleton = { generated_by: 'exercise-extract.js', exercises: {} };

    for (const { nickname, exercise } of list.sort((a, b) =>
      a.nickname.localeCompare(b.nickname)
    )) {
      try {
        const entryFields = {};
        const fieldDefs = exerciseFields(exercise);
        // Buffer this exercise's SEG lines locally — commit-or-discard. A
        // throw from a LATER field must never leave an EARLIER field's
        // already-converted lines in the chapter-wide segLines array; the
        // exercise is extracted atomically or not at all (a leaked orphan
        // segment would waste MT budget and can never be reassembled, since
        // its skeleton entry never gets written).
        const exSegLines = [];
        let exSegmentCount = 0;
        for (const fd of fieldDefs) {
          const field = htmlToField(fd.html);
          entryFields[fd.key] = {
            skeleton: field.skeleton,
            slots: field.runs.length,
            opaques: field.opaques,
            wraps: field.wraps,
          };
          field.runs.forEach((run, k) => {
            exSegLines.push(`<!-- SEG:${nickname}:${fd.type}:${fd.elementId(k)} -->`, run, '');
            exSegmentCount++;
          });
        }
        segLines.push(...exSegLines);
        segmentCount += exSegmentCount;
        skeleton.exercises[nickname] = {
          source_uid: exercise.uid || null,
          solutions_are_public: exercise.solutions_are_public || false,
          question_order: (exercise.questions || []).map((q) => String(q.id)),
          fields: entryFields,
        };
        exerciseCount++;
      } catch (err) {
        failures.push({ nickname, error: err.message });
        log(`  ✗ ${nickname}: ${err.message}`);
      }
    }

    if (Object.keys(skeleton.exercises).length === 0) continue;

    const forMtDir = path.join(bookDir, '02-for-mt', chDir);
    const structDir = path.join(bookDir, '02-structure', chDir);
    fs.mkdirSync(forMtDir, { recursive: true });
    fs.mkdirSync(structDir, { recursive: true });
    const segments = segLines.join('\n') + '\n';
    const skeletonJson = JSON.stringify(skeleton, null, 2) + '\n';
    fs.writeFileSync(path.join(forMtDir, 'exercises-segments.en.md'), segments, 'utf8');
    fs.writeFileSync(path.join(structDir, 'exercises-skeleton.json'), skeletonJson, 'utf8');
    chapters.set(chDir, { segments, skeleton });
    log(`  ${chDir}: ${Object.keys(skeleton.exercises).length} exercises`);
  }

  return { chapters, failures, counts: { exercises: exerciseCount, segments: segmentCount } };
}

// ─── CLI ─────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    console.log(
      'Usage: node tools/exercise-extract.js --book <slug> [--chapter <num>] [--verbose]'
    );
    process.exit(0);
  }
  const book = args.find((a, i) => args[i - 1] === '--book') || '';
  const chapter = args.find((a, i) => args[i - 1] === '--chapter');
  const verbose = args.includes('--verbose') || args.includes('-v');
  if (!book) {
    console.error('Error: --book <slug> is required');
    process.exit(1);
  }
  const bookDir = path.join(BOOKS_DIR, book);
  if (!fs.existsSync(bookDir)) {
    console.error(`Error: book not found: ${bookDir}`);
    process.exit(1);
  }

  const res = extractBook(bookDir, { chapter, verbose, log: verbose ? console.log : () => {} });
  console.log(
    `Extracted ${res.counts.exercises} exercises → ${res.counts.segments} segments across ${res.chapters.size} chapter file(s)`
  );
  if (res.failures.length > 0) {
    console.error(`FAILED: ${res.failures.length} exercise(s) skipped:`);
    for (const f of res.failures) console.error(`  ${f.nickname}: ${f.error}`);
    process.exitCode = 1;
  }
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) main();
