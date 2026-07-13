/**
 * qaCheckService — mechanical QA the reviewer can't charm past.
 *
 * "Fluent-but-wrong" is the signature MTPE reviewer failure mode: smooth MT
 * output slips accuracy errors, number slips, and untranslated fragments past a
 * time-pressured reviewer. These checks are deterministic and engine-light:
 *
 *   - number-mismatch: a numeric value present in EN but missing from IS
 *     (tolerant of decimal-comma 3.5→3,5, thousands separators, and [[MATH:N]]).
 *   - en-residue: IS prose carrying English function words — the MT failure
 *     where a sentence comes back partly/wholly untranslated.
 *   - spelling: delegated to a pluggable engine (hunspell-is / GreynirCorrect),
 *     injected via `runChecks(..., { spellEngine })`. Absent engine = no
 *     spelling findings; QA disabled never breaks a save.
 *
 * Engine decision (Unit 4 pre-req) is the lead's; this interface lets it slot
 * in without touching callers. Findings are advisory — never a hard block.
 */

// ─── Text cleanup ─────────────────────────────────────────────────────

/** Remove [[MATH:N]] placeholders (their index is not content). */
function stripMath(text) {
  return text.replace(/\[\[MATH:\d+\]\]/g, ' ');
}

/**
 * Strip inline markers to their inner text (display text for pipe forms).
 * Also unwraps B4 id-anchored markers ([[term:]]/[[fn:]]/[[u:]]/[[em:]]) to
 * their display text (mirror of tools/generate-tm.js stripMarkers).
 */
function stripMarkers(text) {
  return (
    text
      .replace(/\[\[(?:link|xref|docref):([^\]|]*)\|[^\]]*\]\]/g, '$1')
      .replace(/ ?\[\[(?:xref|docref):[^\]]*\]\]/g, '')
      .replace(/\[\[(?:i|b|sub|sup):([^\]]*)\]\]/g, '$1')
      .replace(/\+\+([^+]+)\+\+/g, '$1')
      .replace(/\{\{([a-z]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, '$2')
      // B4 id-anchored markers: keep the display text (left of the pipe).
      // Placed AFTER the inline rule so nested [[sub:]] inside term text is
      // already unwrapped when this runs.
      .replace(/\[\[(?:term|fn|em):([^\]|]*)\|[^\]]*\]\]/g, '$1')
      .replace(/\[\[(?:term|fn|u):([^\]]*)\]\]/g, '$1')
  );
}

// ─── Number-consistency check ─────────────────────────────────────────

/**
 * Reduce a numeric token to a comparison key: digits only, with leading zeros
 * and separators removed. "3.5"→"35", "3,5"→"35", "1,000"→"1000",
 * "1 000"→"1000". A heuristic — collisions are acceptable for a warning.
 */
function numberKey(token) {
  return token.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
}

/** Extract numeric tokens (runs of digits with internal separators). */
function extractNumbers(text) {
  const cleaned = stripMath(stripMarkers(text));
  const matches = cleaned.match(/\d[\d.,   ]*\d|\d/g) || [];
  // Trim trailing separators a greedy match may have grabbed (e.g. "5." in "5.")
  return matches.map((m) => m.replace(/[.,   ]+$/, '')).filter(Boolean);
}

/**
 * Numbers present in EN but absent from IS (by comparison key).
 *
 * @param {string} enContent
 * @param {string} isContent
 * @returns {Array<{type:'number-mismatch', value:string, message:string}>}
 */
function checkNumbers(enContent, isContent) {
  if (!enContent || !isContent) return [];
  const isKeys = new Set(extractNumbers(isContent).map(numberKey));
  const findings = [];
  const reported = new Set();
  for (const token of extractNumbers(enContent)) {
    const key = numberKey(token);
    if (!key || reported.has(key)) continue;
    if (!isKeys.has(key)) {
      reported.add(key);
      findings.push({
        type: 'number-mismatch',
        value: token,
        message: `Talan „${token}“ úr ensku finnst ekki í þýðingunni`,
      });
    }
  }
  return findings;
}

// ─── Untranslated-EN-residue check ────────────────────────────────────

// English function words that essentially never occur in Icelandic prose.
const EN_FUNCTION_WORDS = new Set([
  'the',
  'and',
  'of',
  'is',
  'are',
  'was',
  'were',
  'with',
  'for',
  'this',
  'that',
  'these',
  'those',
  'which',
  'from',
  'have',
  'has',
  'will',
  'would',
  'should',
  'could',
  'their',
  'there',
  'when',
  'where',
  'what',
  'because',
  'between',
  'into',
  'than',
  'then',
  'they',
  'them',
  'been',
  'being',
  'about',
]);

/**
 * Flag IS prose that carries English function words (likely untranslated MT).
 * Requires ≥2 distinct function words to avoid false positives on loanwords.
 *
 * @param {string} isContent
 * @returns {Array<{type:'en-residue', words:string[], message:string}>}
 */
function checkEnResidue(isContent) {
  if (!isContent) return [];
  const prose = stripMath(stripMarkers(isContent));
  const found = new Set();
  for (const w of prose.toLowerCase().match(/[a-z]+/g) || []) {
    if (EN_FUNCTION_WORDS.has(w)) found.add(w);
  }
  if (found.size < 2) return [];
  const words = [...found];
  return [
    {
      type: 'en-residue',
      words,
      message: `Möguleg óþýdd enska: ${words.map((w) => `„${w}“`).join(', ')}`,
    },
  ];
}

// ─── Orchestration ────────────────────────────────────────────────────

/**
 * Run all QA checks on an EN/IS pair.
 *
 * @param {string} enContent
 * @param {string} isContent
 * @param {{ spellEngine?: (isText:string)=>Array }} [opts]
 *   spellEngine: optional; returns spelling findings for the IS text. Absent =
 *   spelling disabled (the engine decision is pending — see file header).
 * @returns {Array} typed findings
 */
function runChecks(enContent, isContent, { spellEngine } = {}) {
  const findings = [];
  findings.push(...checkNumbers(enContent, isContent));
  findings.push(...checkEnResidue(isContent));
  if (typeof spellEngine === 'function' && isContent) {
    try {
      for (const f of spellEngine(stripMath(stripMarkers(isContent))) || []) {
        findings.push({ type: 'spelling', ...f });
      }
    } catch {
      // A misbehaving engine must never break QA.
    }
  }
  return findings;
}

/**
 * Async variant: the engine-free checks plus an **async** spelling/grammar
 * engine (e.g. the Greynir sidecar) whose findings are awaited. A throwing or
 * slow engine degrades to the engine-free findings (engine handles its own
 * timeout); QA never breaks a caller.
 *
 * @param {string} enContent
 * @param {string} isContent
 * @param {{ spellEngine?: (isText:string)=>Promise<Array>|Array }} [opts]
 * @returns {Promise<Array>} typed findings
 */
async function runChecksAsync(enContent, isContent, { spellEngine } = {}) {
  const findings = [];
  findings.push(...checkNumbers(enContent, isContent));
  findings.push(...checkEnResidue(isContent));
  if (typeof spellEngine === 'function' && isContent) {
    try {
      const spell = await spellEngine(stripMath(stripMarkers(isContent)));
      for (const f of spell || []) {
        findings.push(f.type ? f : { type: 'spelling', ...f });
      }
    } catch {
      // A misbehaving engine must never break QA.
    }
  }
  return findings;
}

module.exports = {
  stripMarkers,
  stripMath,
  numberKey,
  extractNumbers,
  checkNumbers,
  checkEnResidue,
  runChecks,
  runChecksAsync,
};
