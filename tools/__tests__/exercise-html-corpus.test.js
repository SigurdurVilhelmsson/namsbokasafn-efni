/**
 * exercise-html-corpus.test.js — item 9 (D3): the closed-inventory proof.
 * Round-trips EVERY translatable field of the live lifraen-efnafraedi
 * exercise cache (5,540 fields / 1,961 exercises at authoring time) through
 * htmlToField/fieldToHtml and requires byte-identity. Skips when the book
 * isn't present (CI clones without books/ content still pass).
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlToField, fieldToHtml, fieldImgAlts, withImgAlt } from '../lib/exercise-html.js';

const EX_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'books',
  'lifraen-efnafraedi',
  '01-source',
  'exercises'
);

describe.skipIf(!fs.existsSync(EX_DIR))('exercise-html — live corpus round-trip', () => {
  it('every consumed field round-trips byte-identical', () => {
    const files = fs.readdirSync(EX_DIR).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(1900); // the cache, not a stub
    let fields = 0;
    const failures = [];
    for (const f of files) {
      const d = JSON.parse(fs.readFileSync(path.join(EX_DIR, f), 'utf8'));
      const surfaces = [d.stimulus_html || ''];
      for (const q of d.questions || []) {
        surfaces.push(q.stem_html || '');
        const sol = (q.collaborator_solutions || [])[0];
        if (sol) surfaces.push(sol.content_html || '');
      }
      for (const h of surfaces) {
        if (!h.trim()) continue;
        fields++;
        try {
          const rt = fieldToHtml(htmlToField(h));
          if (rt !== h) failures.push({ f, kind: 'diff', h: h.slice(0, 80) });
        } catch (e) {
          failures.push({ f, kind: e.name, msg: e.message.slice(0, 100) });
        }
      }
    }
    expect(fields).toBeGreaterThan(5000);
    expect(failures).toEqual([]);
  });
});

/** Every translatable surface of one cached exercise (all solutions — the converter is field-agnostic). */
function surfacesOf(d) {
  const surfaces = [d.stimulus_html || ''];
  for (const q of d.questions || []) {
    surfaces.push(q.stem_html || '');
    const sol = (q.collaborator_solutions || [])[0];
    if (sol) surfaces.push(sol.content_html || '');
  }
  return surfaces.filter((h) => h.trim());
}

// §C126 #3 — the alt helpers' closed-inventory proof, over the same live cache.
describe.skipIf(!fs.existsSync(EX_DIR))('exercise-html — live corpus <img> alts', () => {
  const all = () =>
    fs
      .readdirSync(EX_DIR)
      .filter((f) => f.endsWith('.json'))
      .flatMap((f) => surfacesOf(JSON.parse(fs.readFileSync(path.join(EX_DIR, f), 'utf8'))));

  it('every non-blank alt a NAIVE scan sees is claimed by fieldImgAlts — none skipped silently', () => {
    // The naive scan deliberately does NOT require whitespace before `alt`, so a
    // refresh writing `class="c"alt="x"` (which the sticky attribute tokeniser
    // would not read) turns this red instead of dropping the alt. The lookbehind
    // keeps `data-alt` out.
    const NAIVE_ALT = /(?<![\w-])alt\s*=\s*"([^"]*)"/;
    let naive = 0;
    let claimed = 0;
    for (const h of all()) {
      for (const m of h.matchAll(/<img\b[^>]*>/gi)) {
        const a = NAIVE_ALT.exec(m[0]);
        if (a && a[1].trim()) naive++;
      }
      claimed += fieldImgAlts(htmlToField(h)).length;
    }
    expect(naive).toBeGreaterThan(2000); // the cache, not a stub
    expect(claimed).toBe(naive);
  });

  it('writing each alt back unchanged reproduces its literal byte-for-byte', () => {
    let alts = 0;
    const broken = [];
    for (const h of all()) {
      const field = htmlToField(h);
      for (const a of fieldImgAlts(field)) {
        alts++;
        const lit = field.opaques[a.n];
        if (withImgAlt(lit, a.core) !== lit) broken.push(lit.slice(0, 100));
      }
    }
    expect(alts).toBeGreaterThan(2000);
    expect(broken).toEqual([]);
  });
});
