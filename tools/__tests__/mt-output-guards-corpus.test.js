/**
 * The two MT-output guards, anchored on chemistry's COMMITTED MT (the book being bought).
 *
 * 🔴 THE GREEK-LOSS SET IS NOW EMPTY — AND THAT IS WHY THE PLANTED-HISTORY TEST EXISTS.
 * This guard's first corpus run (2026-09-28) found four real, reader-visible substitutions
 * (§C191 ②); [USER] authorised a hand repair of exactly those segments the same day.
 * ▶ REPAIRING THE CORPUS STRIPS A CHECK OF ITS PROOF THAT IT WORKS — CLAUDE.md's
 * bracket-delta lesson, which happened three times in one afternoon there. A guard that
 * finds nothing on a clean corpus is indistinguishable from a broken one, so the four
 * defects are pinned as HISTORY: re-planted into the repaired, real segments in memory,
 * and the guard must report each exactly. Do not delete that test because the corpus is
 * clean — a clean corpus is exactly when it is the only proof left.
 * ▶ A NEW loss in the committed MT is a new defect: log it, do not just pin it.
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

// The four substitutions the paid MT really made, hand-repaired 2026-09-28. Written as
// code points: capital Greek Beta and Alpha are indistinguishable from Latin B and A.
const cp = (...c) => String.fromCodePoint(...c);
const [DELTA, BETA, ALPHA, GAMMA] = [cp(0x394), cp(0x392), cp(0x391), cp(0x393)];
const [sigma, pi, alpha, gamma] = [cp(0x3c3), cp(0x3c0), cp(0x3b1), cp(0x3b3)];
const HISTORY = [
  {
    unit: 'ch08/m68745', // "sigma (Δ) tengi … Pí (Δ) tengi"
    segId: 'm68745:para:fs-idm25402912',
    plant: [
      [`(${sigma})`, `(${DELTA})`],
      [`(${pi})`, `(${DELTA})`],
    ],
    lost: [pi, sigma].sort(),
  },
  {
    unit: 'ch20/m68846', // "A Β-tengi": π became capital Beta, which reads as a B
    segId: 'm68846:para:fs-idp51580832',
    plant: [
      [`${pi}-tengi, sem`, `A ${BETA}-tengi, sem`],
      [`${pi}-tengið`, `${BETA}-tengið`],
    ],
    lost: [pi, pi],
  },
  {
    unit: 'ch21/m68852', // key term: "(Α" reads as a Latin A
    segId: 'm68852:glossary-def:fs-idm57603984-def',
    plant: [[`(${alpha}`, `(${ALPHA}`]],
    lost: [alpha],
  },
  {
    unit: 'ch21/m68852',
    segId: 'm68852:glossary-def:fs-idm12021616-def',
    plant: [[`(${gamma}`, `(${GAMMA}`]],
    lost: [gamma],
  },
];

const segmentOf = (tree, unit, lang, segId) =>
  parseSegmentsMap(
    fs.readFileSync(path.join(BOOK, tree, `${unit}-segments.${lang}.md`), 'utf8')
  ).get(segId);

describe('chemistry committed MT — Greek-letter conservation', () => {
  it('reads a real corpus (denominator control)', () => {
    expect(PAIRS.length).toBeGreaterThan(150);
  });

  it('finds exactly the two addition-only segments — the pin on the look-alike fold', () => {
    // Without the fold, ∆ Ʃ ∑ are not Script=Greek, so the MT's proper Δ/Σ read as
    // ADDITIONS: six more segments land here (m68727, m68741 ×2, m68752, m68817, m68819).
    // The LOSS set below cannot see the fold's removal — measured by the 2026-09-28 review.
    // Both are a spelled-out name the MT turned into a symbol, the benign addition the guard
    // reports and does not hold. The second arrived with §C183's summary top-up (2026-09-28),
    // whose run printed it: EN "the greek letter mu" → IS "μL".
    const addedOnly = PAIRS.flatMap(({ en, is }) =>
      greekConservationBySegment(en, is)
        .filter((f) => !f.lost.length)
        .map((f) => `${f.segId} +${f.added.join('')}`)
    );
    expect(addedOnly).toEqual([
      'm68674:table-summary:fs-idm81128320-summary +μ', // "the greek letter mu" → μL
      'm68729:alt:fs-idm60605232-alt +λλν', // "lambda"/"nu" → λ/ν
    ]);
  });

  it('finds no loss in the committed MT — the four were hand-repaired 2026-09-28', () => {
    const losses = PAIRS.flatMap(({ en, is }) =>
      greekConservationBySegment(en, is)
        .filter((f) => f.lost.length)
        .map((f) => `${f.segId} ${f.lost.join('')}→${f.added.join('')}`)
    );
    expect(losses).toEqual([]);
  });

  for (const h of HISTORY) {
    it(`PLANTED HISTORY: re-planting ${h.segId}'s real substitution is caught`, () => {
      const en = segmentOf('02-for-mt', h.unit, 'en', h.segId);
      const repaired = segmentOf('02-mt-output', h.unit, 'is', h.segId);
      let planted = repaired;
      for (const [good, bad] of h.plant) planted = planted.replace(good, bad);
      expect(planted).not.toBe(repaired); // control: the plant really happened
      const one = (text) => `<!-- SEG:${h.segId} -->\n${text}\n`;
      expect(greekConservationBySegment(one(en), one(repaired))).toEqual([]);
      const found = greekConservationBySegment(one(en), one(planted));
      expect(found.map((f) => f.lost)).toEqual([h.lost]);
    });
  }
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
