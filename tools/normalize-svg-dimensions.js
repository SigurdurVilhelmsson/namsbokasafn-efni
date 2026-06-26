#!/usr/bin/env node

/**
 * normalize-svg-dimensions.js
 *
 * Make translated figure SVGs render at full figure size in the reader.
 *
 * vefur's content CSS sizes content images with `max-width:100%` (caps large
 * images down, never scales small ones up). Exported figure SVGs often carry a
 * small intrinsic width (~350–470px) — smaller than the reading column (≤62rem
 * ≈ 992px) — so they underfill where the original ~1300px JPGs filled. SVG is
 * vector, so enlarging the intrinsic size is lossless and aspect-safe: this tool
 * sets each SVG root's `width` to a large target and derives `height` from the
 * SVG's OWN `viewBox` (no external size data, no distortion). The existing CSS
 * classes (`max-width:100%`, `scaled-down` → 60%) then size them exactly like
 * the JPGs they replaced.
 *
 * Idempotent: re-running sets the same absolute width, so it's safe to run after
 * each new SVG batch. Only the opening <svg> tag is touched; the viewBox and all
 * inner markup are left byte-identical.
 *
 * Usage:
 *   node tools/normalize-svg-dimensions.js --book <slug> [options]
 *
 * Options:
 *   --book <slug>    Book slug (e.g. efnafraedi-2e). Required.
 *   --suffix <s>     Only process files ending in <suffix>.svg (default: _IS).
 *   --width <px>     Target intrinsic width (default: 1300; exceeds the 62rem column).
 *   --dry-run        Report what would change; write nothing.
 *   --verbose        List every file and its before→after size.
 *   -h, --help       Show this help.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

let BOOKS_DIR = path.join(fileURLToPath(new URL('..', import.meta.url)), 'books');

/** Test seam. */
export function _setTestBooksDir(dir) {
  BOOKS_DIR = dir;
}

const DEFAULT_WIDTH = 1300;

/** Format a number without trailing-zero noise (650 → "650", 243.69 → "243.69"). */
function fmt(n) {
  return String(Math.round(n * 100) / 100);
}

/**
 * Rewrite an SVG's root width/height so its intrinsic width is `targetWidth`,
 * height scaled from the viewBox (or existing width/height) aspect.
 * @param {string} svgText
 * @param {number} targetWidth
 * @returns {{svg:string, changed:boolean, before:{width:number|null,height:number|null}, after:{width:number,height:number}|null}}
 */
export function normalizeSvgDimensions(svgText, targetWidth = DEFAULT_WIDTH) {
  const tagMatch = svgText.match(/<svg\b[^>]*>/i);
  if (!tagMatch)
    return { svg: svgText, changed: false, before: { width: null, height: null }, after: null };
  const tag = tagMatch[0];

  const num = (re) => {
    const m = tag.match(re);
    if (!m) return null;
    const v = parseFloat(m[1]);
    return Number.isFinite(v) ? v : null;
  };
  const curW = num(/\bwidth="([^"]+)"/i);
  const curH = num(/\bheight="([^"]+)"/i);

  // Aspect: prefer the viewBox, fall back to the current width/height.
  let aspectW = null;
  let aspectH = null;
  const vb = tag.match(/\bviewBox="([^"]+)"/i);
  if (vb) {
    const p = vb[1]
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (p.length === 4 && p[2] > 0 && p[3] > 0) {
      aspectW = p[2];
      aspectH = p[3];
    }
  }
  if (aspectW === null && curW && curH) {
    aspectW = curW;
    aspectH = curH;
  }
  if (aspectW === null) {
    // No way to know the aspect — leave it alone rather than guess.
    return { svg: svgText, changed: false, before: { width: curW, height: curH }, after: null };
  }

  const newW = targetWidth;
  const newH = Math.round(targetWidth * (aspectH / aspectW) * 100) / 100;

  // Rewrite (or insert) width/height in the opening tag only.
  let newTag = tag;
  newTag = /\bwidth="[^"]*"/i.test(newTag)
    ? newTag.replace(/\bwidth="[^"]*"/i, `width="${fmt(newW)}"`)
    : newTag.replace(/<svg\b/i, `<svg width="${fmt(newW)}"`);
  newTag = /\bheight="[^"]*"/i.test(newTag)
    ? newTag.replace(/\bheight="[^"]*"/i, `height="${fmt(newH)}"`)
    : newTag.replace(/<svg\b/i, `<svg height="${fmt(newH)}"`);

  const newSvg =
    svgText.slice(0, tagMatch.index) + newTag + svgText.slice(tagMatch.index + tag.length);
  return {
    svg: newSvg,
    changed: newSvg !== svgText,
    before: { width: curW, height: curH },
    after: { width: newW, height: newH },
  };
}

// =====================================================================
// CLI
// =====================================================================

function parseArgs(argv) {
  const r = { book: null, suffix: '_IS', width: DEFAULT_WIDTH, dryRun: false, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--book') r.book = argv[++i];
    else if (a === '--suffix') r.suffix = argv[++i];
    else if (a === '--width') r.width = parseFloat(argv[++i]);
    else if (a === '--dry-run') r.dryRun = true;
    else if (a === '--verbose') r.verbose = true;
    else if (a === '-h' || a === '--help') r.help = true;
  }
  return r;
}

export function normalizeBookSvgs({
  book,
  suffix = '_IS',
  width = DEFAULT_WIDTH,
  dryRun = false,
} = {}) {
  if (!book) throw new Error('--book is required');
  const mediaDir = path.join(BOOKS_DIR, book, 'media');
  if (!fs.existsSync(mediaDir)) throw new Error(`No media dir at ${mediaDir}`);
  const files = fs
    .readdirSync(mediaDir)
    .filter((f) => f.toLowerCase().endsWith(`${suffix.toLowerCase()}.svg`));
  const results = [];
  for (const f of files) {
    const full = path.join(mediaDir, f);
    const before = fs.readFileSync(full, 'utf-8');
    const r = normalizeSvgDimensions(before, width);
    if (r.changed && !dryRun) fs.writeFileSync(full, r.svg);
    results.push({ file: f, ...r });
  }
  return results;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.book) {
    console.log(
      '\nNormalize translated SVG intrinsic dimensions so they fill the reading column.\n\n' +
        '  node tools/normalize-svg-dimensions.js --book <slug> [--suffix _IS] [--width 1300] [--dry-run] [--verbose]\n'
    );
    process.exit(args.book ? 0 : 1);
  }
  const results = normalizeBookSvgs(args);
  const changed = results.filter((r) => r.changed);
  const skipped = results.filter((r) => !r.changed && !r.after);
  if (args.verbose) {
    for (const r of results) {
      const b = r.before.width ? `${fmt(r.before.width)}×${fmt(r.before.height)}` : '?';
      const a = r.after ? `${fmt(r.after.width)}×${fmt(r.after.height)}` : '(skipped — no aspect)';
      console.log(`  ${r.changed ? '✓' : '·'} ${r.file}: ${b} → ${a}`);
    }
  }
  console.log(
    `${args.dryRun ? '(dry-run) ' : ''}Normalized ${changed.length}/${results.length} SVG(s) to width ${args.width}` +
      `${skipped.length ? ` — ${skipped.length} skipped (no viewBox/size)` : ''}.`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
