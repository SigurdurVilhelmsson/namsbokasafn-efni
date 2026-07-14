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

// Recognized language-neutral units (matched case-insensitively). Deliberately
// EXCLUDES multi-letter English homographs (bar, log, ln, sin, cos, tan): a segment
// whose only non-predicate token is such a homograph belongs on the residue allowlist,
// not here — admitting them would erode the all-or-nothing safety property below.
const LN_UNITS = new Set([
  'amu',
  'atm',
  'torr',
  'mmhg',
  'kpa',
  'pa',
  'mol',
  'l',
  'ml',
  'g',
  'kg',
  'mg',
  'k',
  'j',
  'kj',
  'cal',
  'kcal',
  'v',
  'n',
  'w',
  'ev',
  'rem',
  'rad',
  'rbe',
  'gy',
  'sv',
  'bq',
  'ci',
  'ppm',
  'nm',
  'pm',
  'cm',
  'mm',
  'm',
  's',
  'hz',
]);
// Unambiguous scientific quantity symbols (non-homograph). Matched case-SENSITIVELY.
const LN_QUANTITIES = new Set(['pH', 'pOH', 'pKa', 'pKb', 'pKw', 'pI']);
// Chemical-formula case shape: uppercase-initial element-symbol runs (+ optional digits).
const FORMULA_RE = /^([A-Z][a-z]?\d*)+$/;

/**
 * True when EVERY word-token of `text` is a recognized language-neutral token —
 * a curated unit, a chemical-formula-shaped token, or an unambiguous quantity
 * symbol (pH/pOH/…). Numbers and enumeration letters ((a),(b)) are ignored.
 * One unrecognized word ⇒ false. This all-or-nothing rule is the safety property:
 * genuine English prose (which always carries articles/verbs) can never pass.
 * Case-preserving on purpose — case is the formula signal, so this runs BEFORE
 * normalizeForComparison's lowercasing.
 */
export function isLanguageNeutral(text) {
  const stripped = stripMarkers(text);
  const tokens = stripped
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // operators/punctuation (= + − · : ; , ( )) → space
    .split(/\s+/)
    .filter(Boolean);
  let recognized = 0;
  for (const tok of tokens) {
    if (/^\p{N}/u.test(tok)) continue; // number-leading token (123, 896) → ignore
    // Membership checks come BEFORE the enumeration-skip so single-lowercase-
    // letter SI units (g, l, m, s, k, v, n, w) are recognized in their
    // canonical form — otherwise "5 g" would fail while "5 L" passes.
    if (LN_UNITS.has(tok.toLowerCase())) {
      recognized++;
      continue;
    }
    if (LN_QUANTITIES.has(tok)) {
      recognized++;
      continue;
    }
    if (FORMULA_RE.test(tok)) {
      recognized++;
      continue;
    }
    if (tok.length === 1 && /\p{Ll}/u.test(tok)) continue; // enumeration: (a),(b),b. (leftover non-unit single letters)
    return false; // an unrecognized word-token → not language-neutral
  }
  return recognized > 0; // require ≥1 recognized token (empty/marker-only ⇒ false)
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
 * @returns {{contentWords:number, exact:boolean, ratio:number, warn:boolean, languageNeutral?:boolean}}
 *   `languageNeutral:true` is present only when a would-be-exact verbatim-EN
 *   segment was demoted because every token is a formula/unit/pH symbol.
 */
export function detectResidue(enText, isText, opts = {}) {
  const { minTokens, warnThreshold, minWordLen } = { ...RESIDUE_DEFAULTS, ...opts };
  const enNorm = normalizeForComparison(enText);
  const isNorm = normalizeForComparison(isText);
  const contentWords = countContentWords(isNorm, minWordLen);
  const exact = enNorm === isNorm;
  // Language-neutral verbatim-EN (formula/unit/pH cell) is not a translation
  // failure — demote it so it never gates report.complete. Checked BEFORE the
  // content-word floor below: a short formula/unit cell (e.g. "(a) CrP; (b)
  // HgS") is genuinely exact but has too few content words to reach the floor
  // check, so the demotion would never fire if ordered after it. Runs on raw
  // enText (case-preserving); enNorm===isNorm here so either side is
  // equivalent.
  if (exact && isLanguageNeutral(enText)) {
    return { contentWords, exact: false, languageNeutral: true, ratio: 0, warn: false };
  }
  // No EN counterpart, or too few real words to judge -> never flag. The
  // content-word floor (not a raw token count) is what keeps number/unit cells
  // from false-positiving while still catching real English prose.
  if (!enNorm || contentWords < minTokens) {
    return { contentWords, exact: false, ratio: 0, warn: false };
  }
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
  const tolerated = entry.tolerated || [];
  const modules = { ...((report && report.modules) || {}) };
  if (exact.length === 0 && warnings.length === 0 && tolerated.length === 0) {
    delete modules[moduleId];
  } else {
    modules[moduleId] = {
      exact: [...exact],
      warnings: warnings.map((w) => ({ segmentId: w.segmentId, ratio: w.ratio })),
      tolerated: tolerated.map((t) => ({ segmentId: t.segmentId, reason: t.reason })),
    };
  }
  const ids = Object.keys(modules);
  return {
    track: (report && report.track) || null,
    generatedBy: 'cnxml-inject.js',
    summary: {
      modulesWithResidue: ids.filter((m) => modules[m].exact.length).length,
      exactResidues: ids.reduce((s, m) => s + modules[m].exact.length, 0),
      ratioWarnings: ids.reduce((s, m) => s + modules[m].warnings.length, 0),
      toleratedResidues: ids.reduce((s, m) => s + (modules[m].tolerated || []).length, 0),
    },
    modules,
  };
}
