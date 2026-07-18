/**
 * server/public/js/chapter-label.js — client-side chapter DISPLAY labels
 * (item 16 PR2, I14-R9). Display half of the item-14 appendices contract:
 * -1 | '-1' | 'appendices' → 'Viðaukar' (compact 'Við.'); integers →
 * 'Kafli N' (compact 'KN'); unrecognized input falls back to legacy
 * concatenation. Conversion half (dirs/argv) lives in server/lib/
 * chapterLabel.js — separate module, do not merge.
 *
 * Also carries the static adoption pins (structuralBackstopWiring style):
 * every swept view/JS file must include the helper and build labels
 * through it, never by raw concatenation.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { full, compact } = require('../public/js/chapter-label');

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(here, '..', rel), 'utf8');

describe('full()', () => {
  it('maps every appendices dialect to Viðaukar', () => {
    expect(full(-1)).toBe('Viðaukar');
    expect(full('-1')).toBe('Viðaukar');
    expect(full('appendices')).toBe('Viðaukar');
  });

  it('renders numbered chapters as Kafli N (string or number)', () => {
    expect(full(5)).toBe('Kafli 5');
    expect(full('12')).toBe('Kafli 12');
    expect(full(0)).toBe('Kafli 0'); // ch00 front-matter is real
  });

  it('falls back to legacy concatenation on unrecognized input', () => {
    expect(full('x')).toBe('Kafli x');
  });
});

describe('compact()', () => {
  it('maps every appendices dialect to Við.', () => {
    expect(compact(-1)).toBe('Við.');
    expect(compact('-1')).toBe('Við.');
    expect(compact('appendices')).toBe('Við.');
  });

  it('renders numbered chapters as KN — no space, matching existing K5-style tags', () => {
    expect(compact(5)).toBe('K5');
    expect(compact('12')).toBe('K12');
  });

  it('falls back to legacy concatenation on unrecognized input', () => {
    expect(compact('x')).toBe('Kx');
  });
});

describe('UMD contract', () => {
  it('module is requirable from CJS and exports full + compact', () => {
    const mod = require('../public/js/chapter-label');
    expect(typeof mod.full).toBe('function');
    expect(typeof mod.compact).toBe('function');
  });
});

describe('adoption — my-work.html', () => {
  it('loads the helper before the inline script', () => {
    expect(read('views/my-work.html')).toMatch(/src="\/js\/chapter-label\.js"/);
  });

  it('builds every chapter label through the helper', () => {
    const src = read('views/my-work.html');
    expect(src).not.toMatch(/Kafli ' \+/);
    expect(src).not.toMatch(/' K' \+/);
    expect((src.match(/chapterLabel\.(full|compact)\(/g) || []).length).toBeGreaterThanOrEqual(6);
  });
});

describe('adoption — admin.html + assignments', () => {
  it('admin.html includes the helper and uses it at all five sites', () => {
    const src = read('views/admin.html');
    expect(src).toMatch(/src="\/js\/chapter-label\.js"/);
    expect(src).not.toMatch(/Kafli ' \+/);
    expect(src).not.toMatch(/K' \+ ev\.chapter/);
    expect(src).not.toMatch(/K' \+ item\.chapter/);
    expect(src).not.toMatch(/">K' \+/);
    expect((src.match(/chapterLabel\.(full|compact)\(/g) || []).length).toBeGreaterThanOrEqual(5);
  });

  it('assignments.js + its view', () => {
    const js = read('public/js/assignments.js');
    expect(js).not.toMatch(/Kafli ' \+/);
    expect(js).not.toMatch(/K' \+/);
    expect((js.match(/chapterLabel\.(full|compact)\(/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(read('views/assignments.html')).toMatch(/src="\/js\/chapter-label\.js"/);
  });
});

describe('adoption — latent sites (books.html, localization-editor.js)', () => {
  it('books.html includes the helper and uses it at all six sites', () => {
    const src = read('views/books.html');
    expect(src).toMatch(/src="\/js\/chapter-label\.js"/);
    expect(src).not.toMatch(/Kafli ' \+/);
    expect(src).not.toMatch(/K\. ' \+/);
    expect((src.match(/chapterLabel\.(full|compact)\(/g) || []).length).toBeGreaterThanOrEqual(6);
  });

  it('localization-editor.js + its view', () => {
    const js = read('public/js/localization-editor.js');
    expect(js).not.toMatch(/Kafli ' \+/);
    expect((js.match(/chapterLabel\.(full|compact)\(/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(read('views/localization-editor.html')).toMatch(/src="\/js\/chapter-label\.js"/);
  });
});
