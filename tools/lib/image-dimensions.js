/**
 * image-dimensions.js — the `width`/`height` a rendered content `<img>` carries
 * (vefur request H1, register §C201).
 *
 * An `<img>` with no size takes no space until it loads, so the reader's paged
 * mode cannot split a section into pages before every figure has downloaded.
 * The attributes let the browser reserve the box first.
 *
 * 🔴 THE VALUES ARE THE SIZE THE IMAGE ALREADY DISPLAYS AT, IN CSS PIXELS. An HTML
 * `width` attribute becomes the CSS `width`, so a wrong number resizes the
 * figure. §C162 ([USER] 2026-09-19: keep print size) stands, so:
 *  - an SVG's declared `width`/`height` is converted to CSS px the way a browser
 *    converts it (`pt` × 4/3, so 117pt → 156; `in` × 96; and so on);
 *  - an SVG with no absolute size (none, `%`, `em`, or only a `viewBox`) gets NO
 *    attributes: a browser sizes it from its container, and any number written
 *    here would change it;
 *  - a raster image gets its pixel size, swapped for a JPEG whose EXIF
 *    orientation turns it a quarter turn, because a browser shows it turned.
 * Anything unreadable gets no attributes, never a guess.
 */

import fs from 'node:fs';
import { safeJoin } from './safe-join.js';

/** CSS px per unit, as CSS Values 4 defines them. */
const PX_PER_UNIT = {
  '': 1,
  px: 1,
  pt: 96 / 72,
  pc: 16,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  q: 96 / 101.6,
};

/** @returns {number|null} the length in CSS px, or null if it has no absolute size. */
function svgLengthPx(value) {
  if (value == null) return null;
  const m = /^\s*([0-9]*\.?[0-9]+(?:e[+-]?\d+)?)\s*([a-z]*)\s*$/i.exec(String(value));
  if (!m) return null;
  const unit = m[2].toLowerCase();
  if (!(unit in PX_PER_UNIT)) return null;
  const px = parseFloat(m[1]) * PX_PER_UNIT[unit];
  return px > 0 ? px : null;
}

/** Read one attribute's value out of an open tag, respecting quotes. */
function attrValue(openTag, name) {
  const re = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`);
  const m = re.exec(openTag);
  return m ? (m[2] ?? m[3]) : null;
}

/**
 * The root `<svg>` open tag, found by scanning with quotes respected (an
 * attribute value may hold a bare `>`; see CLAUDE.md on open-tag ends).
 */
function svgOpenTag(text) {
  const start = text.search(/<svg[\s>]/);
  if (start < 0) return null;
  let quote = null;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '>') {
      return text.slice(start, i + 1);
    }
  }
  return null;
}

/** @returns {{width:number,height:number}|null} */
export function svgDimensions(text) {
  const tag = svgOpenTag(text);
  if (!tag) return null;
  const w = svgLengthPx(attrValue(tag, 'width'));
  const h = svgLengthPx(attrValue(tag, 'height'));
  if (w == null || h == null) return null;
  return { width: Math.round(w), height: Math.round(h) };
}

function pngDimensions(buf) {
  if (buf.length < 24 || buf.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function gifDimensions(buf) {
  if (buf.length < 10) return null;
  return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
}

/**
 * EXIF orientation (1–8) from a JPEG APP1 segment: 1 for an EXIF segment with
 * no usable tag, and null for an APP1 that is not EXIF (XMP, for one), so the
 * caller can ignore it.
 */
function exifOrientation(seg) {
  if (seg.length < 14 || seg.toString('latin1', 0, 6) !== 'Exif\0\0') return null;
  const t = seg.subarray(6);
  const le = t.toString('latin1', 0, 2) === 'II';
  const u16 = (o) => (le ? t.readUInt16LE(o) : t.readUInt16BE(o));
  const u32 = (o) => (le ? t.readUInt32LE(o) : t.readUInt32BE(o));
  const ifd = u32(4);
  if (ifd + 2 > t.length) return 1;
  const n = u16(ifd);
  for (let k = 0; k < n; k++) {
    const e = ifd + 2 + k * 12;
    if (e + 12 > t.length) break;
    if (u16(e) === 0x0112) {
      const v = u16(e + 8);
      return v >= 1 && v <= 8 ? v : 1;
    }
  }
  return 1;
}

function jpegDimensions(buf) {
  let i = 2;
  let orientation = 1;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    // Only an EXIF APP1 sets the orientation: an XMP APP1 usually follows the
    // EXIF one, and must not reset it.
    if (marker === 0xe1) {
      const o = exifOrientation(buf.subarray(i + 4, i + 2 + len));
      if (o !== null) orientation = o;
    }
    // SOF0–SOF15, except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      const height = buf.readUInt16BE(i + 5);
      const width = buf.readUInt16BE(i + 7);
      return orientation >= 5 ? { width: height, height: width } : { width, height };
    }
    i += 2 + len;
  }
  return null;
}

/**
 * @param {string} filePath
 * @returns {{width:number,height:number}|null} the displayed size in CSS px, or
 *   null when there is none to state (see the header).
 */
export function imageDimensions(filePath) {
  let buf;
  try {
    buf = fs.readFileSync(filePath);
  } catch {
    return null;
  }
  let dims = null;
  if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') dims = pngDimensions(buf);
  else if (buf[0] === 0xff && buf[1] === 0xd8) dims = jpegDimensions(buf);
  else if (buf.toString('latin1', 0, 4) === 'GIF8') dims = gifDimensions(buf);
  else if (/\.svgz?$/i.test(filePath) || buf.toString('utf8', 0, 512).includes('<svg'))
    dims = svgDimensions(buf.toString('utf8'));
  if (!dims || !(dims.width > 0) || !(dims.height > 0)) return null;
  return dims;
}

// The media directories, in the renderer's precedence (01-source/media first,
// then the book's media/: the order copyChapterImages copies from, so the size
// is read from the file that is published). Set by cnxml-render per book.
let MEDIA_DIRS = [];
const CACHE = new Map();

/** @param {string[]} dirs */
export function setImageMediaDirs(dirs) {
  MEDIA_DIRS = [...dirs];
  CACHE.clear();
}

/**
 * ` width="W" height="H"` for a published image src (any path; its basename is
 * looked up in the media dirs), or '' when the size is unknown or unstateable.
 * @param {string} src
 */
export function imageSizeAttrs(src) {
  if (!src || MEDIA_DIRS.length === 0) return '';
  let base;
  try {
    base = decodeURIComponent(String(src).split(/[?#]/)[0].split('/').pop());
  } catch {
    return '';
  }
  if (!base || base === '.' || base === '..') return '';
  if (CACHE.has(base)) return CACHE.get(base);
  let attrs = '';
  for (const dir of MEDIA_DIRS) {
    // The name is decoded after the split on '/', so an encoded slash (%2F)
    // can carry a path: keep the lookup inside the dir, as copyChapterImages does.
    const file = safeJoin(dir, base);
    if (!file || !fs.existsSync(file)) continue;
    const d = imageDimensions(file);
    if (d) attrs = ` width="${d.width}" height="${d.height}"`;
    break;
  }
  CACHE.set(base, attrs);
  return attrs;
}
