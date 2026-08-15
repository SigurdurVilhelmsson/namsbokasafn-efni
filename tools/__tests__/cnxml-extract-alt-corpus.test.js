import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { extractSegments } from '../cnxml-extract.js';

// The corpus control the spec requires: on real source, alt segments must appear
// where none exist today. A green unit suite proves the fixtures work; this
// proves the change does what it claims on bytes we did not write.
const CHEM = path.join(process.cwd(), 'books/efnafraedi-2e/01-source');

describe('§C81 corpus control', () => {
  it('emits alt segments across a real chemistry chapter', () => {
    const dir = path.join(CHEM, 'ch01');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.cnxml'));
    expect(files.length).toBeGreaterThan(0); // control: the glob found something

    let altCount = 0;
    let mediaWithAlt = 0;
    for (const f of files) {
      const cnxml = fs.readFileSync(path.join(dir, f), 'utf-8');
      mediaWithAlt += (cnxml.match(/\balt="[^"]+"/g) || []).length;
      altCount += extractSegments(cnxml).segments.filter((s) => s.type === 'alt').length;
    }

    expect(mediaWithAlt).toBeGreaterThan(0); // control: the chapter really has alt text
    expect(altCount).toBeGreaterThan(0); // the change fires on real input
  });

  // The spec's other corpus assertion: chemistry has ZERO id-less media, so the
  // positional fallback must never fire there. If it does, either the census was
  // wrong or altElementId is being called with a missing id it should have had.
  // Both positional forms are checked — the inline/figure counter's `media-N-alt`
  // AND the standalone counter's `standalone-N-alt` (altElementId's two `kind`
  // namespaces) — the brief's own regex only covered the first.
  it('produces no positional alt ids anywhere in chemistry', () => {
    const dir = path.join(CHEM, 'ch01');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.cnxml'));
    const positional = [];
    for (const f of files) {
      const cnxml = fs.readFileSync(path.join(dir, f), 'utf-8');
      for (const s of extractSegments(cnxml).segments) {
        if (
          s.type === 'alt' &&
          (/:alt:media-\d+-alt$/.test(s.id) || /:alt:standalone-\d+-alt$/.test(s.id))
        ) {
          positional.push(s.id);
        }
      }
    }
    expect(positional).toEqual([]);
  });
});
