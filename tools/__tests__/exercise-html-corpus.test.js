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
import { htmlToField, fieldToHtml } from '../lib/exercise-html.js';

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
