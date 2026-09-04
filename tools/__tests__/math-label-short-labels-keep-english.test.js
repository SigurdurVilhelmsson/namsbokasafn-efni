/**
 * [USER] RULING 2026-09-04 — A SHORT MATH ABBREVIATION KEEPS ITS ENGLISH BY
 * DEFAULT. Localization is opt-in, via an explicit allowlist.
 *
 * The trigger was `E°cell` rendering as `Eker°` in published chemistry
 * (`17-key-terms.html`), alongside `Ekerfis°` from `sys → kerfi`. `cell` really
 * does mean *ker*, but **`E°cell` is international formula convention** — this is
 * the §C82 ③ wrong-REGISTER class: an entry correct for the WORD and wrong for
 * the SYMBOL, exactly like `ln → náttúrlegur logri` ruining `S = k ln W`.
 *
 * 🔴 THE GUARD MUST OUTRANK THE CURATED OVERLAY, and that is the whole point.
 * `cell → ker` IS an overlay entry — a deliberate curation — so a rule that only
 * gated the glossary would change nothing. CLAUDE.md records that the overlay is
 * checked first and outranks the symbol guard; this ruling narrows that for short
 * tokens.
 *
 * ⚠️ WHY THE DEFAULT IS INVERTED RATHER THAN THE MAP HAND-EDITED. Editing the 43
 * short entries fixes today's corpus and nothing else: `inventory-math-labels.js`
 * regenerates the skeleton from source and a later curation pass re-fills them.
 * A default enforced in code holds without anyone remembering it.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveLabel } from '../lib/math-label-substitute.js';
import { LOCALIZABLE_SHORT_LABELS, SHORT_LABEL_MAX } from '../lib/math-label-inventory.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('short math labels keep English unless allow-listed', () => {
  it('🔴 an overlay TRANSLATION of a short label is refused — E°cell must not become Eker°', () => {
    const r = resolveLabel('cell', { overlay: { cell: 'ker' } });
    expect(r.value).toBe('cell');
    expect(r.source).not.toBe('overlay-translated');
  });

  it('🔴 the same for sys — E°sys must not become Ekerfis°', () => {
    expect(resolveLabel('sys', { overlay: { sys: 'kerfi' } }).value).toBe('sys');
  });

  it('covers every short token the ruling named', () => {
    for (const t of ['cell', 'surr', 'sys', 'vap', 'fus', 'sub', 'rxn', 'con', 'dep', 'rev']) {
      expect(resolveLabel(t, { overlay: { [t]: 'ÞÝTT' } }).value, `overlay for ${t}`).toBe(t);
    }
  });

  it('the glossary cannot reach a short label either — the overlay is not the only route', () => {
    const glossaryMap = new Map([['cell', 'ker']]);
    expect(resolveLabel('cell', { glossaryMap }).value).toBe('cell');
  });

  it('🔴 CONTROL — an allow-listed short label STILL localizes, or the rule is a blanket ban', () => {
    expect(resolveLabel('mol', { overlay: { mol: 'mól' } }).value).toBe('mól');
    expect(resolveLabel('ice', { overlay: { ice: 'ís' } }).value).toBe('ís');
    expect(resolveLabel('day', { overlay: { day: 'dagur' } }).value).toBe('dagur');
  });

  it('🔴 CONTROL — a LONG label is untouched by this rule', () => {
    // The ruling is about 2-4 letter abbreviations. `cathode` (7) still localizes.
    expect(resolveLabel('cathode', { overlay: { cathode: 'katóða' } }).value).toBe('katóða');
  });

  it('a self-map still reports overlay-self, so collision MASKING keeps working', () => {
    // loadMathLabelResolver annotates a glossary collision as "masked" via
    // source.startsWith('overlay'). Short-circuiting before the overlay would
    // silently un-mask every 2-3 char entry (at, si, ppm) in that report.
    expect(resolveLabel('at', { overlay: { at: 'at' } }).source).toBe('overlay-self');
  });

  it('an EMPTY overlay value can no longer be auto-upgraded by the glossary', () => {
    // The 7 empty entries (con, dep, eff, ele, frz, sub, tet) are "pending":
    // they fall through and the glossary may translate them later. For short
    // tokens that upgrade is now refused.
    const glossaryMap = new Map([['con', 'samtenging']]);
    expect(resolveLabel('con', { overlay: { con: '' }, glossaryMap }).value).toBe('con');
  });

  it('the allowlist is non-empty and holds only short tokens — a vacuous list would pass everything', () => {
    expect(LOCALIZABLE_SHORT_LABELS.size).toBeGreaterThan(0);
    for (const t of LOCALIZABLE_SHORT_LABELS) {
      expect([...t].length, `${t} is not short`).toBeLessThanOrEqual(SHORT_LABEL_MAX);
      expect(t, `${t} must be lowercase`).toBe(t.toLowerCase());
    }
  });
});

describe('over the real chemistry overlay', () => {
  const mapPath = path.join(REPO_ROOT, 'books/efnafraedi-2e/math-label-map.json');
  const overlay = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

  it('🔴 no short, non-allow-listed key resolves to anything but its English', () => {
    const offenders = [];
    for (const key of Object.keys(overlay)) {
      if ([...key].length > SHORT_LABEL_MAX) continue;
      if (LOCALIZABLE_SHORT_LABELS.has(key.toLowerCase())) continue;
      const r = resolveLabel(key, { overlay });
      if (r.value !== key) offenders.push(`${key} -> ${r.value}`);
    }
    expect(offenders).toEqual([]);
  });

  it('CONTROL — the allow-listed keys present in this map DO still localize', () => {
    const localized = Object.keys(overlay).filter(
      (k) =>
        LOCALIZABLE_SHORT_LABELS.has(k.toLowerCase()) &&
        String(overlay[k]).trim() &&
        resolveLabel(k, { overlay }).value !== k
    );
    // Non-vacuity: if this is empty the previous test proves nothing, because
    // "everything renders English" would satisfy it trivially.
    expect(localized.length).toBeGreaterThan(0);
    expect(localized).toContain('mol');
  });
});
