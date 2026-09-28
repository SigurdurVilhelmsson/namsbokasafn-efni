/**
 * The two MT-output guards, anchored on chemistry's COMMITTED MT (the book being bought).
 *
 * 🔴 THE FOUR GREEK LOSSES BELOW ARE REAL, READER-VISIBLE DEFECTS — NOT FIXTURES. They
 * were found by this guard's first corpus run on 2026-09-28 and are logged in the active
 * register (§C191 ②). They are pinned here as the guard's POSITIVE CONTROL: a guard that
 * found nothing on this corpus would be indistinguishable from a broken one.
 * ▶ When one is repaired (by an authorised hand repair or by an editor), this test goes
 * red ON PURPOSE: remove it from KNOWN_GREEK_LOSSES and update the register in the same
 * commit. When a NEW one appears, it is a new defect: log it, do not just pin it.
 *
 * Chemistry only, deliberately: organic's committed MT is scheduled for removal (§C190 ②).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  greekConservationBySegment,
  truncationSuspectsBySegment,
  TRUNCATION_MAX_RATIO,
} from '../lib/mt-output-guards.js';

const require = createRequire(import.meta.url);
const { parseSegmentsMap } = require('../lib/seg-markers.cjs');

const BOOK = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../books/efnafraedi-2e'
);

function pairs() {
  const out = [];
  const mtRoot = path.join(BOOK, '02-mt-output');
  for (const ch of fs.readdirSync(mtRoot)) {
    const dir = path.join(mtRoot, ch);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('-segments.is.md'))) {
      const enPath = path.join(BOOK, '02-for-mt', ch, f.replace('.is.md', '.en.md'));
      if (!fs.existsSync(enPath)) continue;
      out.push({
        en: fs.readFileSync(enPath, 'utf8'),
        is: fs.readFileSync(path.join(dir, f), 'utf8'),
      });
    }
  }
  return out;
}

const PAIRS = pairs();

const KNOWN_GREEK_LOSSES = [
  'm68745:para:fs-idm25402912 πσ→ΔΔ', // ch08 — σ and π bonds both became Δ
  'm68846:para:fs-idp51580832 ππ→ΒΒ', // ch20 — "A Β-tengi": π became capital Beta
  'm68852:glossary-def:fs-idm57603984-def α→Α', // ch21 key term — reads as a Latin A
  'm68852:glossary-def:fs-idm12021616-def γ→Γ', // ch21 key term
];

describe('chemistry committed MT — Greek-letter conservation', () => {
  it('reads a real corpus (denominator control)', () => {
    expect(PAIRS.length).toBeGreaterThan(150);
  });

  it('finds exactly the four logged losses — no more, no fewer', () => {
    const losses = PAIRS.flatMap(({ en, is }) =>
      greekConservationBySegment(en, is)
        .filter((f) => f.lost.length)
        .map((f) => `${f.segId} ${f.lost.join('')}→${f.added.join('')}`)
    );
    expect(losses.sort()).toEqual([...KNOWN_GREEK_LOSSES].sort());
  });
});

describe('chemistry committed MT — truncation', () => {
  it('flags no committed segment (the measured base rate is 0)', () => {
    const suspects = PAIRS.flatMap(({ en, is }) => truncationSuspectsBySegment(en, is));
    expect(suspects).toEqual([]);
  });

  // Positive controls ON REAL TEXT: without them, a guard that could never fire would
  // pass the base-rate test above just as well.
  const longest = (() => {
    let best = null;
    for (const { en, is } of PAIRS) {
      const e = parseSegmentsMap(en);
      const i = parseSegmentsMap(is);
      for (const [id, text] of e) {
        if (i.has(id) && (!best || text.length > best.en.length)) {
          best = { id, en: text, is: i.get(id) };
        }
      }
    }
    return best;
  })();
  const one = (id, text) => `<!-- SEG:${id} -->\n${text}\n`;

  it('fires the ratio leg on a real long segment cut below the floor', () => {
    const cut = longest.is.slice(0, Math.floor(longest.en.length * TRUNCATION_MAX_RATIO) - 1);
    const r = truncationSuspectsBySegment(one(longest.id, longest.en), one(longest.id, cut));
    expect(r.map((s) => s.reason)).toEqual(['ratio']);
  });

  it('fires the unterminated leg on the same segment cut just short of its end', () => {
    const cut = longest.is.slice(0, -40).replace(/[.!?:;)\]"'”“»…\s]+$/u, '');
    const r = truncationSuspectsBySegment(one(longest.id, longest.en), one(longest.id, cut));
    expect(r.map((s) => s.reason)).toEqual(['unterminated']);
  });
});
