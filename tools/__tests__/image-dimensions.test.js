import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  svgDimensions,
  imageDimensions,
  setImageMediaDirs,
  imageSizeAttrs,
} from '../lib/image-dimensions.js';

/**
 * H1 (register §C201): `<img width/height>` must be the size the image already
 * displays at, in CSS px, or absent. A wrong number resizes a figure (§C162).
 * Measured 2026-11-05 against Chromium over chemistry's 1,141 published files:
 * 1,137 exact, 4 within 0.5 px (rounding of a fractional pt size).
 */

const svg = (attrs) =>
  `<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" ${attrs}><g/></svg>`;

function png(w, h) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}

/** A minimal JPEG: SOI, an optional EXIF APP1 carrying `orientation`, SOF0. */
function jpeg(w, h, orientation) {
  const parts = [Buffer.from([0xff, 0xd8])];
  if (orientation) {
    const tiff = Buffer.alloc(8 + 2 + 12 + 4);
    tiff.write('II', 0, 'latin1');
    tiff.writeUInt16LE(42, 2);
    tiff.writeUInt32LE(8, 4);
    tiff.writeUInt16LE(1, 8);
    tiff.writeUInt16LE(0x0112, 10);
    tiff.writeUInt16LE(3, 12);
    tiff.writeUInt32LE(1, 14);
    tiff.writeUInt16LE(orientation, 18);
    const body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
    const head = Buffer.from([0xff, 0xe1, 0, 0]);
    head.writeUInt16BE(body.length + 2, 2);
    parts.push(head, body);
  }
  const sof = Buffer.from([
    0xff, 0xc0, 0x00, 0x11, 0x08, 0, 0, 0, 0, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
  ]);
  sof.writeUInt16BE(h, 5);
  sof.writeUInt16BE(w, 7);
  parts.push(sof, Buffer.from([0xff, 0xd9]));
  return Buffer.concat(parts);
}

describe('H1 — SVG sizes, as a browser converts them', () => {
  it('converts pt to CSS px (117pt → 156)', () => {
    expect(svgDimensions(svg('width="117pt" height="90pt"'))).toEqual({ width: 156, height: 120 });
  });

  it('takes px and unitless lengths as they are', () => {
    expect(svgDimensions(svg('width="300px" height="150"'))).toEqual({ width: 300, height: 150 });
  });

  it('gives nothing for a relative or missing size, even with a viewBox', () => {
    expect(svgDimensions(svg('width="100%" height="50%"'))).toBeNull();
    expect(svgDimensions(svg('viewBox="0 0 400 200"'))).toBeNull();
    expect(svgDimensions(svg('width="10em" height="5em"'))).toBeNull();
    expect(svgDimensions(svg('width="200"'))).toBeNull();
  });

  it('reads the root open tag past a bare > inside an attribute value', () => {
    expect(svgDimensions(svg('aria-label="a > b" width="72pt" height="36pt"'))).toEqual({
      width: 96,
      height: 48,
    });
  });
});

describe('H1 — raster sizes and the missing file', () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'imgdim-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('reads a PNG', () => {
    writeFileSync(join(dir, 'a.png'), png(640, 480));
    expect(imageDimensions(join(dir, 'a.png'))).toEqual({ width: 640, height: 480 });
  });

  it('reads a JPEG, and swaps a quarter-turned one as a browser shows it', () => {
    writeFileSync(join(dir, 'a.jpg'), jpeg(200, 100));
    writeFileSync(join(dir, 'b.jpg'), jpeg(200, 100, 6));
    writeFileSync(join(dir, 'c.jpg'), jpeg(200, 100, 3));
    expect(imageDimensions(join(dir, 'a.jpg'))).toEqual({ width: 200, height: 100 });
    expect(imageDimensions(join(dir, 'b.jpg'))).toEqual({ width: 100, height: 200 });
    expect(imageDimensions(join(dir, 'c.jpg'))).toEqual({ width: 200, height: 100 });
  });

  it('gives nothing for a missing or unreadable file', () => {
    expect(imageDimensions(join(dir, 'none.png'))).toBeNull();
    writeFileSync(join(dir, 'junk.jpg'), Buffer.from('not an image'));
    expect(imageDimensions(join(dir, 'junk.jpg'))).toBeNull();
  });
});

describe('H1 — imageSizeAttrs looks the file up the way the render copies it', () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'imgattrs-'));
    mkdirSync(join(dir, 'src'));
    mkdirSync(join(dir, 'book'));
  });
  afterEach(() => {
    setImageMediaDirs([]);
    rmSync(dir, { recursive: true, force: true });
  });

  it('is empty until the media dirs are set', () => {
    writeFileSync(join(dir, 'src', 'a.png'), png(10, 20));
    setImageMediaDirs([]);
    expect(imageSizeAttrs('/content/x/chapters/01/images/media/a.png')).toBe('');
  });

  it('uses the basename of the published src, and the first dir that has it', () => {
    writeFileSync(join(dir, 'src', 'a.png'), png(10, 20));
    writeFileSync(join(dir, 'book', 'a.png'), png(99, 99));
    writeFileSync(join(dir, 'book', 'b_IS.svg'), svg('width="117pt" height="90pt"'));
    setImageMediaDirs([join(dir, 'src'), join(dir, 'book')]);
    expect(imageSizeAttrs('/content/x/chapters/01/images/media/a.png')).toBe(
      ' width="10" height="20"'
    );
    expect(imageSizeAttrs('/content/x/chapters/01/images/media/b_IS.svg')).toBe(
      ' width="156" height="120"'
    );
  });

  it('is empty for an image the dirs do not hold', () => {
    setImageMediaDirs([join(dir, 'src')]);
    expect(imageSizeAttrs('/content/x/chapters/01/images/media/gone.svg')).toBe('');
  });
});
