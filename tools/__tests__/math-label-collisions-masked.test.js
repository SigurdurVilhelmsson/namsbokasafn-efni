/**
 * A CONTESTED headword must never resolve through the glossary in a math label
 * (register §C71).
 *
 * WHY THE CLASS AND NOT ONE WORD. This file first shipped asserting only that
 * `in` is not substituted, because `in → tomma` was what the collision report
 * happened to surface. That fixed the instance and missed the class: chemistry
 * carries `at → astat | marsnákaætt`, the row-order winner is **marsnákaætt**
 * (a snake family), and it lands on **21** leaf math labels. Same defect, one
 * headword over, invisible to a test named after the first one.
 *
 * THE MECHANISM. `buildGlossaryMap` keys a Map on lowercased English with
 * LAST-WRITE-WINS (§C18) and applies no omission, so a contested headword
 * silently resolves to whichever row came last. The MT path is protected —
 * `formatGlossary` omits contested headwords outright — but the RENDER path is
 * not. The two guards are independent; neither is evidence for the other.
 *
 * THE FIX is `books/<slug>/math-label-map.json`'s self-map idiom (`"at": "at"`),
 * which `resolveLabel` returns as `overlay-self`, so `substituteMathLabels`
 * sees value === key and leaves the bytes alone.
 *
 * ⚠️ REAL-TREE on purpose. Every occurrence of this defect so far arrived
 * through committed DATA an exporter wrote, with no code change — a fixture
 * test would have passed throughout and would miss the next one identically.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadMathLabelResolver } from '../lib/math-label-substitute.js';
import { findGlossaryCollisions } from '../lib/glossary-collisions.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BOOKS_DIR = path.join(REPO_ROOT, 'books');

const books = fs
  .readdirSync(BOOKS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('__'))
  .map((d) => d.name)
  .filter((slug) => fs.existsSync(path.join(BOOKS_DIR, slug, 'glossary', 'glossary-unified.json')));

/** Every leaf `<m:mtext>`/`<m:mi>` label in a book's source, with its count. */
function mathLabels(slug) {
  const counts = new Map();
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.cnxml')) {
        const t = fs.readFileSync(p, 'utf8');
        for (const m of t.matchAll(/>\s*([^<>\s][^<>]{0,24}?)\s*<\/m:m(?:text|i)>/g)) {
          const k = m[1].trim();
          if (k) counts.set(k, (counts.get(k) || 0) + 1);
        }
      }
    }
  };
  walk(path.join(BOOKS_DIR, slug, '01-source'));
  return counts;
}

/** Headwords the committed glossary cannot decide — competitions and comma-lists. */
function contested(slug) {
  const g = JSON.parse(
    fs.readFileSync(path.join(BOOKS_DIR, slug, 'glossary', 'glossary-unified.json'), 'utf8')
  );
  const c = findGlossaryCollisions(g.terms || [], { approvedOnly: true });
  return new Set([...c.competitions, ...c.commaLists].map((x) => String(x.english).toLowerCase()));
}

describe('contested headwords are masked in math labels', () => {
  it('found books to assert against', () => {
    expect(books.length).toBeGreaterThan(0); // control: no books ⇒ every case vacuous
  });

  it.each(books)('%s: no contested headword resolves through the glossary', (slug) => {
    const { resolve } = loadMathLabelResolver(path.join(BOOKS_DIR, slug));
    const bad = [];
    for (const [label, n] of mathLabels(slug)) {
      if (!contested(slug).has(label.toLowerCase())) continue;
      const r = resolve(label);
      if (r.source === 'glossary') bad.push(`${label}(x${n}) → ${r.value}`);
    }
    // Listing the offenders makes a failure self-explaining: what, how often,
    // and what it would have become.
    expect(`${slug}: ${bad.join(', ')}`).toBe(`${slug}: `);
  });

  it('the guard is NOT vacuous — some book really does have a contested math label', () => {
    // Without this, deleting every overlay would still pass if no contested
    // headword happened to appear in math. The exposure is what makes the
    // masks load-bearing; assert it exists.
    const exposed = books.flatMap((slug) => {
      const c = contested(slug);
      return [...mathLabels(slug).keys()].filter((l) => c.has(l.toLowerCase()));
    });
    expect(exposed.length).toBeGreaterThan(0);
  });
});
