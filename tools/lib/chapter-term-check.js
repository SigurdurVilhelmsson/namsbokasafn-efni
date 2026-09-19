/**
 * chapter-term-check — the two per-chapter checks [USER] ruled on 2026-09-19
 * (docs/decisions/2026-09-19-glossary-subset-standard-per-chapter.md). Both are
 * CANDIDATE generators for a human, never gates: they name what to look at.
 *
 * (a) glossaryCoverage — for each approved glossary term, the share of the chapter's
 *     English segments containing its headword whose aligned Icelandic contains the
 *     target's stem. Low coverage means ONE of two things the tool cannot tell apart:
 *     a mirror case the MT collapses (ch05's enthalpy → varmi, a subset candidate), or a
 *     glossary entry the MT rightly overrides (`addition → álagning`). `collisions` names
 *     the other glossary targets the uncovered segments used, which is usually what
 *     separates the two.
 *     ⚠️ The stem test is a heuristic (see stemOf); a report row prints its stem so a
 *     reader can see what was matched.
 *     ⚠️ Terms come from the MT leg's own loader, so contested headwords the MT never
 *     sees (e.g. `atom`) are not checked.
 *
 * (b) findSuppressedShortLabels — short math labels the book's `math-label-map.json`
 *     (via 'overlay') or glossary (via 'glossary') would translate, but which the
 *     2026-09-04 short-label default keeps in English. `ruled: true` marks one the ruling
 *     named (RULED_ENGLISH_SHORT_LABELS), so only unruled labels are new questions.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  collectMathTokens,
  SHORT_LABEL_MAX,
  LOCALIZABLE_SHORT_LABELS,
  RULED_ENGLISH_SHORT_LABELS,
  DEFAULT_STOPLIST,
} from './math-label-inventory.js';

/**
 * Fold Icelandic u-umlaut ö → a so a prefix stem survives inflection:
 * `jafna` → *jöfnu*, `hlutfall` → *hlutföll*. Applied to stem and text alike, so it can
 * only turn a miss into a hit, never the reverse.
 * @param {string} s lowercase text
 */
export function foldUmlaut(s) {
  return s.replace(/ö/g, 'a');
}

/**
 * Does the English segment use `headword` as a WORD? Unlike the MT leg's
 * `headwordAppearsIn` (a substring test for long headwords, by design: it decides what
 * goes on the wire), this asks what the prose says — so `pound` must not fire in
 * *compound*, nor `meter` in *calorimeter*. Headwords of ≤ 3 characters stay
 * case-sensitive, as on the MT leg (`As` is arsenic, *as* is not); longer ones are
 * case-insensitive and admit a plural `-s`/`-es`.
 */
const wordRe = new Map();
export function usesHeadword(headword, text) {
  let re = wordRe.get(headword);
  if (!re) {
    const esc = headword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    re =
      [...headword].length <= 3
        ? new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, 'u')
        : new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?:e?s)?(?![\\p{L}\\p{N}])`, 'iu');
    wordRe.set(headword, re);
  }
  return re.test(text);
}

/**
 * The prefix an inflected Icelandic form of `target` is expected to keep. Uses the
 * longest word of a multi-word target; drops one letter from a word of ≤ 5 letters
 * (`vermi` → `verm`) and two from a longer one (`vermibreyting` → `vermibreyti`), never
 * going below 4 letters (`pund` stays `pund`) — except a 4-letter word ending in a vowel,
 * which keeps 3 (`orka` → `ork`, matched only before a vowel; see containsStem). Returns
 * null when the word is under 4 letters.
 * The stem is umlaut-folded (see foldUmlaut), so compare it with folded text.
 * @param {string} target
 * @returns {string|null}
 */
export function stemOf(target) {
  const word = String(target)
    .toLowerCase()
    .split(/\s+/)
    .reduce((a, b) => ([...b].length > [...a].length ? b : a), '');
  const n = [...word].length;
  if (n < 4) return null;
  // A 4-letter word ending in a vowel inflects on that vowel (orka → orku, sýra → sýru),
  // so it keeps 3 letters; containsStem then matches it only before a vowel.
  const keep = n === 4 && /[aeiouyáéíóúýæö]$/.test(word) ? 3 : Math.max(4, n <= 5 ? n - 1 : n - 2);
  return foldUmlaut([...word].slice(0, keep).join(''));
}

/**
 * Does folded Icelandic text contain `stem`? A stem of 4+ letters may sit anywhere, so
 * it also finds compounds (`vermi` in *myndunarvermi*). A 3-letter stem — the vowel-final
 * 4-letter case — must be followed by a vowel, which is where that word inflects:
 * `sýr` finds *sýru* and *ediksýra*, `ork` finds *orku* and *varmaorka*, and neither
 * fires on an arbitrary run of letters.
 * @param {string} foldedText lowercase, umlaut-folded
 * @param {string} stem from stemOf
 */
const shortStemRe = new Map();
export function containsStem(foldedText, stem) {
  if ([...stem].length >= 4) return foldedText.includes(stem);
  let re = shortStemRe.get(stem);
  if (!re) {
    re = new RegExp(`${stem}[aeiouyáéíóúý]`, 'u');
    shortStemRe.set(stem, re);
  }
  return re.test(foldedText);
}

/**
 * (a) Per approved term: `total` English segments using the headword, of which `covered`
 * carry the target's stem and `kept` keep the headword itself (a symbol the MT rightly
 * leaves alone); `coverage = (covered + kept) / total`. A term is a `candidate` when it
 * has at least `minSegments` segments and coverage below `threshold`. `collisions` are
 * the other targets the UNCOVERED segments used, kept only at ≥ 2× their chapter-wide
 * rate — so a word common everywhere (*efni*) is not reported as what replaced a term.
 * @param {{en: Map<string,string>, is: Map<string,string>,
 *          terms: Array<{sourceWord:string,targetWord:string}>,
 *          minSegments?: number, threshold?: number, sample?: number}} p
 * @returns {Array<{sourceWord:string,targetWord:string,stem:string,total:number,covered:number,
 *   kept:number,coverage:number,candidate:boolean,uncovered:string[],
 *   collisions:Array<{sourceWord:string,targetWord:string,count:number}>}>}
 *   sorted: candidates first, then by total descending. Terms with no stem or no
 *   matching segment are omitted.
 */
export function glossaryCoverage({ en, is, terms, minSegments = 5, threshold = 0.5, sample = 3 }) {
  const stems = terms.map((t) => ({ ...t, stem: stemOf(t.targetWord) })).filter((t) => t.stem);
  const pairs = [];
  for (const [id, text] of en) {
    if (!is.has(id)) continue;
    pairs.push({ id, text, is: is.get(id), isFold: foldUmlaut(is.get(id).toLowerCase()) });
  }
  // Base rate of each distinct stem across the chapter's Icelandic, for collision lift.
  const distinct = [...new Map(stems.map((t) => [t.stem, t])).values()];
  const base = new Map(
    distinct.map((t) => [t.stem, pairs.filter((p) => containsStem(p.isFold, t.stem)).length])
  );
  const rows = [];
  for (const t of stems) {
    const hits = pairs.filter((p) => usesHeadword(t.sourceWord, p.text));
    if (hits.length === 0) continue;
    // A SYMBOL the MT kept verbatim (kg, Cl, ppm, pH) is not a miss. Only symbol-shaped
    // headwords qualify: an English WORD left in the Icelandic is untranslated residue,
    // exactly what this check must expose, so it falls through to `uncovered`.
    const symbolLike = [...t.sourceWord].length <= 3 || /[A-Z0-9]/.test(t.sourceWord);
    const kept = symbolLike
      ? hits.filter((p) => !containsStem(p.isFold, t.stem) && usesHeadword(t.sourceWord, p.is))
      : [];
    const uncovered = hits.filter((p) => !containsStem(p.isFold, t.stem) && !kept.includes(p));
    const collisions = [];
    if (uncovered.length > 0) {
      for (const o of distinct) {
        if (o.stem === t.stem || o.stem.includes(t.stem) || t.stem.includes(o.stem)) continue;
        const count = uncovered.filter((p) => containsStem(p.isFold, o.stem)).length;
        if (count < 2) continue;
        const lift = count / uncovered.length / (base.get(o.stem) / pairs.length);
        if (lift >= 2)
          collisions.push({ sourceWord: o.sourceWord, targetWord: o.targetWord, count, lift });
      }
      collisions.sort((a, b) => b.count - a.count || b.lift - a.lift);
    }
    const covered = hits.length - uncovered.length - kept.length;
    const coverage = (covered + kept.length) / hits.length;
    rows.push({
      sourceWord: t.sourceWord,
      targetWord: t.targetWord,
      stem: t.stem,
      total: hits.length,
      covered,
      kept: kept.length,
      coverage,
      candidate: hits.length >= minSegments && coverage < threshold,
      uncovered: uncovered.slice(0, sample).map((p) => p.id),
      collisions: collisions.slice(0, 3).map(({ sourceWord, targetWord, count }) => ({
        sourceWord,
        targetWord,
        count,
      })),
    });
  }
  return rows.sort((a, b) => b.candidate - a.candidate || b.total - a.total);
}

/**
 * Every math token in a chapter's source CNXML — what `cnxml-inject` substitutes on.
 * @param {string} chapterSourceDir e.g. books/efnafraedi-2e/01-source/ch05
 * @returns {Array<{text:string,context:string,position:string}>}
 */
export function chapterMathTokens(chapterSourceDir) {
  return fs
    .readdirSync(chapterSourceDir)
    .filter((f) => f.endsWith('.cnxml'))
    .sort()
    .flatMap((f) => collectMathTokens(fs.readFileSync(path.join(chapterSourceDir, f), 'utf8')));
}

/**
 * Short labels a map would translate but the short-label default keeps English.
 *
 * The overlay tier spells out `resolveLabel`'s predicate so the allowlist can be
 * injected (for the pre-2026-09-19 `rxn` control); a corpus-agreement test pins it to
 * `resolveLabel`'s own `'english-short-default'`. The glossary tier mirrors
 * resolveLabel's glossary key (lowercase only for a pure word) and its symbol guard
 * (≤ 2 chars or stoplisted never reaches the glossary), so it reports only what the
 * glossary route would really have translated.
 *
 * @param {Array<{text:string,context:string}>} tokens
 * @param {{overlay?:Record<string,string>, glossaryMap?:Map<string,string>,
 *          allowlist?:Set<string>, ruledEnglish?:Set<string>}} ctx
 * @returns {Array<{label:string,via:'overlay'|'glossary',value:string,count:number,context:string,ruled:boolean}>}
 */
export function findSuppressedShortLabels(
  tokens,
  {
    overlay = {},
    glossaryMap = new Map(),
    allowlist = LOCALIZABLE_SHORT_LABELS,
    ruledEnglish = RULED_ENGLISH_SHORT_LABELS,
  } = {}
) {
  const byLabel = new Map();
  for (const t of tokens) {
    const label = t.text;
    const lower = label.toLowerCase();
    if ([...label].length > SHORT_LABEL_MAX || allowlist.has(lower)) continue;
    const isWord = /^[A-Za-z][a-z]{2,}$/.test(label);
    let ov = overlay[label];
    if (!(typeof ov === 'string' && ov.trim()) && isWord && lower !== label) ov = overlay[lower];
    let hit = null;
    if (typeof ov === 'string' && ov.trim()) {
      const v = ov.trim();
      if (v !== label && v !== lower) hit = { via: 'overlay', value: v };
    } else {
      const isSymbol = [...label].length <= 2 || DEFAULT_STOPLIST.has(lower);
      const g = isSymbol ? undefined : glossaryMap.get(isWord ? lower : label);
      if (typeof g === 'string' && g.trim()) hit = { via: 'glossary', value: g };
    }
    if (!hit) continue;
    const row = byLabel.get(label);
    if (row) row.count++;
    else
      byLabel.set(label, {
        label,
        ...hit,
        count: 1,
        context: t.context,
        ruled: ruledEnglish.has(lower),
      });
  }
  return [...byLabel.values()].sort((a, b) => a.ruled - b.ruled || b.count - a.count);
}
