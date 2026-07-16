#!/usr/bin/env node

/**
 * exercise-assemble.js — Assemble translated os-embed exercise sidecars
 * (item 9 / D3). The inject-stage counterpart for exercise content.
 *
 * Reads per-chapter skeleton sidecars (02-structure) + EN segments
 * (02-for-mt) + IS segments (02-mt-output for mt-preview, or
 * 03-faithful-translation for faithful), re-slots translated runs into each
 * field's skeleton, and writes 03-translated/{track}/exercises/{nickname}.json
 * shaped exactly like the fields resolveOsEmbed reads from source.
 *
 * Never touches 01-source (everything needed rides the skeleton sidecar).
 *
 * Fail-loud invariants (spec): a missing segment, marker corruption, or a
 * real EN residue skips THAT exercise (no sidecar — the renderer's EN
 * fallback persists) and sets exit code 1; other exercises proceed.
 * Residue policy = inject's, same libs (detectResidue + allowlist).
 *
 * Usage:
 *   node tools/exercise-assemble.js --book lifraen-efnafraedi --track mt-preview [--chapter 12] [--verbose]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fieldToHtml } from './lib/exercise-html.js';
import { parseSegmentsMap } from './lib/seg-markers.cjs';
import { detectResidue } from './lib/residue-check.js';
import { loadResidueAllowlist, classifyResidue } from './lib/residue-allowlist.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOOKS_DIR = path.join(__dirname, '..', 'books');

/** Seg-id for field key + slot, mirroring exercise-extract's scheme exactly. */
function segIdFor(nickname, fieldKey, k) {
  if (fieldKey === 'stimulus') return `${nickname}:stimulus:b${k}`;
  const [type, qid] = fieldKey.split(':'); // 'stem:448142' | 'sol:448142'
  return `${nickname}:${type}:${qid}-b${k}`;
}

/**
 * Assemble one book's translated exercises.
 * @param {string} bookDir - absolute path to books/{slug}
 * @param {{track: 'mt-preview'|'faithful', chapter?: string|number,
 *          log?: (s:string)=>void}} opts
 */
export function assembleBook(bookDir, opts) {
  const track = opts.track;
  if (track !== 'mt-preview' && track !== 'faithful') {
    throw new Error(`--track must be mt-preview or faithful (got '${track}')`);
  }
  const log = opts.log || (() => {});
  const allowlist = loadResidueAllowlist(bookDir);

  const structRoot = path.join(bookDir, '02-structure');
  const wantCh =
    opts.chapter != null
      ? `ch${String(parseInt(String(opts.chapter), 10)).padStart(2, '0')}`
      : null;

  const written = [];
  const skipped = [];
  const residues = [];
  const tolerated = [];
  const chaptersMissingIs = [];

  const chDirs = fs.existsSync(structRoot)
    ? fs
        .readdirSync(structRoot)
        .filter((d) => /^ch\d+$/.test(d))
        .sort()
    : [];

  for (const chDir of chDirs) {
    if (wantCh && chDir !== wantCh) continue;
    const skelPath = path.join(structRoot, chDir, 'exercises-skeleton.json');
    if (!fs.existsSync(skelPath)) continue;

    const enPath = path.join(bookDir, '02-for-mt', chDir, 'exercises-segments.en.md');
    const isPath =
      track === 'faithful'
        ? path.join(bookDir, '03-faithful-translation', chDir, 'exercises-segments.is.md')
        : path.join(bookDir, '02-mt-output', chDir, 'exercises-segments.is.md');

    if (!fs.existsSync(isPath)) {
      chaptersMissingIs.push(chDir);
      log(`  ${chDir}: no ${track} IS segments yet — skipped`);
      continue;
    }

    const skeletonDoc = JSON.parse(fs.readFileSync(skelPath, 'utf8'));
    const enMap = fs.existsSync(enPath)
      ? parseSegmentsMap(fs.readFileSync(enPath, 'utf8'))
      : new Map();
    const isMap = parseSegmentsMap(fs.readFileSync(isPath, 'utf8'));

    const outDir = path.join(bookDir, '03-translated', track, 'exercises');
    fs.mkdirSync(outDir, { recursive: true });

    for (const [nickname, entry] of Object.entries(skeletonDoc.exercises)) {
      try {
        const assembled = {}; // fieldKey -> IS html
        for (const [fieldKey, fieldMeta] of Object.entries(entry.fields)) {
          const runs = [];
          for (let k = 0; k < fieldMeta.slots; k++) {
            const segId = segIdFor(nickname, fieldKey, k);
            const isText = isMap.get(segId);
            if (isText === undefined) throw new Error(`missing IS segment ${segId}`);
            const enText = enMap.get(segId);
            if (enText !== undefined) {
              const r = detectResidue(enText, isText); // inject's policy, same lib
              if (r.exact) {
                if (classifyResidue(nickname, segId, allowlist).tolerated) {
                  tolerated.push({ nickname, segId });
                } else {
                  residues.push({ nickname, segId });
                  throw new Error(`untranslated EN residue at ${segId}`);
                }
              }
            }
            runs.push(isText.trim());
          }
          const field = {
            skeleton: fieldMeta.skeleton,
            runs: new Array(fieldMeta.slots).fill(''),
            opaques: fieldMeta.opaques,
            wraps: fieldMeta.wraps,
          };
          assembled[fieldKey] = fieldToHtml(field, runs); // throws MarkerError on corruption
        }

        const sidecar = {
          nickname,
          source_uid: entry.source_uid,
          generated_by: 'exercise-assemble.js',
          track,
          solutions_are_public: entry.solutions_are_public,
          stimulus_html: assembled.stimulus || '',
          questions: entry.question_order.map((qid) => ({
            id: qid,
            stem_html: assembled[`stem:${qid}`] || '',
            collaborator_solutions:
              `sol:${qid}` in assembled ? [{ content_html: assembled[`sol:${qid}`] }] : [],
          })),
        };

        // Temp+rename: a sidecar either exists complete or not at all.
        const outPath = path.join(outDir, `${nickname}.json`);
        const tmpPath = `${outPath}.tmp`;
        fs.writeFileSync(tmpPath, JSON.stringify(sidecar, null, 2) + '\n', 'utf8');
        fs.renameSync(tmpPath, outPath);
        written.push(outPath);
      } catch (err) {
        skipped.push({ nickname, reason: err.message });
        log(`  ✗ ${nickname}: ${err.message}`);
      }
    }
  }

  return { written, skipped, residues, tolerated, chaptersMissingIs };
}

// ─── CLI ─────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    console.log(
      'Usage: node tools/exercise-assemble.js --book <slug> --track <mt-preview|faithful> [--chapter <num>] [--verbose]'
    );
    process.exit(0);
  }
  const book = args.find((a, i) => args[i - 1] === '--book') || '';
  const track = args.find((a, i) => args[i - 1] === '--track') || '';
  const chapter = args.find((a, i) => args[i - 1] === '--chapter');
  const verbose = args.includes('--verbose') || args.includes('-v');
  if (!book || !track) {
    console.error('Error: --book and --track are required');
    process.exit(1);
  }
  const bookDir = path.join(BOOKS_DIR, book);
  if (!fs.existsSync(bookDir)) {
    console.error(`Error: book not found: ${bookDir}`);
    process.exit(1);
  }

  const res = assembleBook(bookDir, {
    track,
    chapter,
    log: verbose ? console.log : () => {},
  });
  console.log(
    `Assembled ${res.written.length} exercise sidecar(s) [track=${track}]` +
      (res.tolerated.length ? `; tolerated (allowlisted) residues: ${res.tolerated.length}` : '')
  );
  if (res.chaptersMissingIs.length > 0) {
    console.log(`  chapters without ${track} IS segments: ${res.chaptersMissingIs.join(', ')}`);
  }
  if (res.skipped.length > 0) {
    console.error(`FAILED: ${res.skipped.length} exercise(s) skipped (EN fallback persists):`);
    for (const s of res.skipped) console.error(`  ${s.nickname}: ${s.reason}`);
    process.exitCode = 1;
  }
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) main();
