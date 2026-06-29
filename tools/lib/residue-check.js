/**
 * Untranslated-EN residue detection (A2).
 *
 * Pure functions, no I/O. Normalizes EN source and IS translation text
 * identically, then compares: an exact-normalized match is a verbatim
 * untranslated residue (gates report.complete); a high token-overlap ratio
 * is a "mostly English" warning (non-gating).
 */

export const RESIDUE_DEFAULTS = { minTokens: 3, warnThreshold: 0.7, minWordLen: 3 };

/**
 * Strip inline marker DELIMITERS while keeping their inner content, so a
 * translated marker payload differs from an untranslated one. Applied
 * identically to EN and IS, so any structural noise cancels out.
 */
function stripMarkers(text) {
  let t = String(text == null ? '' : text);
  // Positional placeholders carry no translatable text -> drop entirely.
  t = t.replace(/\[\[(?:math|media):\d+\]\]/gi, ' ');
  // Bracket markers [[type:content]] (content may have a |url or |id tail) ->
  // keep the visible text before '|'.
  t = t.replace(/\[\[[a-z]+:([^\]]*)\]\]/gi, (_m, inner) => ' ' + inner.split('|')[0] + ' ');
  // xref shorthand [#id] -> drop.
  t = t.replace(/\[#[^\]]*\]/g, ' ');
  // Legacy paired delimiters {{type}} ... {{/type}} -> drop delimiters, keep inner.
  t = t.replace(/\{\{\/?[a-z]+\}\}/gi, ' ');
  return t;
}

/** Normalize for comparison: markers stripped, no digits/symbols, lowercased. */
export function normalizeForComparison(text) {
  let t = stripMarkers(text);
  t = t.replace(/[0-9]/g, ' ');
  // Replace any non-letter, non-space (Unicode-aware) with a space. \p{L}
  // keeps Icelandic letters (þ æ ö ð á í ...).
  t = t.replace(/[^\p{L}\s]/gu, ' ');
  return t.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Count "content words" in normalized text: tokens of at least `minWordLen`
 * letters. This deliberately excludes single-letter unit abbreviations (g, L),
 * enumeration markers (a, b, c), and short function words — the language-
 * invariant tokens that make number/unit/formula cells look untranslated. A
 * genuine English residue is rich in content words; a measurement cell is not.
 */
export function countContentWords(normalized, minWordLen = RESIDUE_DEFAULTS.minWordLen) {
  if (!normalized) return 0;
  return normalized.split(' ').filter((tok) => tok.length >= minWordLen).length;
}

/** Overlap coefficient |A∩B| / min(|A|,|B|) over token sets (0 if either empty). */
export function tokenOverlapRatio(aNorm, bNorm) {
  const a = new Set(aNorm ? aNorm.split(' ').filter(Boolean) : []);
  const b = new Set(bNorm ? bNorm.split(' ').filter(Boolean) : []);
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const tok of a) if (b.has(tok)) inter++;
  return inter / Math.min(a.size, b.size);
}

/**
 * Detect untranslated-EN residue for one segment.
 * @returns {{alphaTokens:number, exact:boolean, ratio:number, warn:boolean}}
 */
export function detectResidue(enText, isText, opts = {}) {
  const { minTokens, warnThreshold, minWordLen } = { ...RESIDUE_DEFAULTS, ...opts };
  const enNorm = normalizeForComparison(enText);
  const isNorm = normalizeForComparison(isText);
  const contentWords = countContentWords(isNorm, minWordLen);
  // No EN counterpart, or too few real words to judge -> never flag. The
  // content-word floor (not a raw token count) is what keeps number/unit cells
  // from false-positiving while still catching real English prose.
  if (!enNorm || contentWords < minTokens) {
    return { contentWords, exact: false, ratio: 0, warn: false };
  }
  const exact = enNorm === isNorm;
  const ratio = exact ? 1 : tokenOverlapRatio(enNorm, isNorm);
  const warn = !exact && ratio >= warnThreshold;
  return { contentWords, exact, ratio, warn };
}

/**
 * Immutably upsert one module's residue entry into a manifest object and
 * recompute its summary. An empty entry removes the module (so a re-inject
 * that fixed the residue clears the record). Preserves `track`.
 */
export function upsertResidueModule(report, moduleId, entry = {}) {
  const exact = entry.exact || [];
  const warnings = entry.warnings || [];
  const modules = { ...((report && report.modules) || {}) };
  if (exact.length === 0 && warnings.length === 0) {
    delete modules[moduleId];
  } else {
    modules[moduleId] = {
      exact: [...exact],
      warnings: warnings.map((w) => ({ segmentId: w.segmentId, ratio: w.ratio })),
    };
  }
  const ids = Object.keys(modules);
  return {
    track: (report && report.track) || null,
    generatedBy: 'cnxml-inject.js',
    summary: {
      modulesWithResidue: ids.length,
      exactResidues: ids.reduce((s, m) => s + modules[m].exact.length, 0),
      ratioWarnings: ids.reduce((s, m) => s + modules[m].warnings.length, 0),
    },
    modules,
  };
}
