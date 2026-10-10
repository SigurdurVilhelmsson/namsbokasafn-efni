/**
 * gloss-case.js — the case of the English gloss "(e. …)" that inject writes
 * after a translated term (§C191 ①).
 *
 * 🔴 THE SOURCE'S CASE IS RIGHT EVERYWHERE BUT ONE PLACE. Measured 2026-10-09
 * over chemistry's EN segments: all 106 capitalised glossary terms and all 169
 * capitalised mid-sentence inline terms are genuine — names, symbols, acronyms
 * (Aufbau, Hund’s rule, pH, VSEPR, Δoct). Lowercasing the whole gloss, which is
 * what inject did, destroyed every one of them. The single exception is an
 * inline term that OPENS A SENTENCE ("Matter is…"), where a capital may be an
 * accident of position; that case alone is decided here.
 *
 * Everything is derived from the read-only EN source (02-for-mt, generated from
 * 01-source), never from a translated string — no editor edit can change it.
 */

/**
 * Does the text BEFORE a term end a sentence (or is it empty)? Takes the
 * marker-stripped EN text preceding the term in its segment.
 * @param {string} before
 * @returns {boolean}
 */
export function isSentenceInitial(before) {
  const t = String(before ?? '').trim();
  return t === '' || /[.!?:]["”’)]?$/.test(t);
}

/**
 * The gloss for a SENTENCE-INITIAL inline term.
 *
 * 1. The module's own glossary twin, if it has one, gives the dictionary case
 *    (`Matter` → `matter`; `Charles’s law` stays).
 * 2. Otherwise, lowercase the FIRST CHARACTER ONLY — so a symbol later in the
 *    term survives (`Standard entropies (S°)`) — and only when the module writes
 *    that first word, so lowered, somewhere (case-sensitive, whole word). An
 *    acronym-led term (`IUPAC`) can never qualify: `iUPAC` is not written. That evidence is what separates `Alcohols` from
 *    `Millikan`; measured over the 47 twinless chemistry cases it lowercased 37,
 *    wrongly lowercased 0 names, and kept 1 capital (`Oxyanions`). Book-wide
 *    evidence lowercased `Lewis`, which is why the scope is the module.
 * 3. Otherwise keep the source.
 *
 * @param {string} term - the gloss text, markers stripped, case intact
 * @param {{twin: string|null, moduleText: string}} ctx
 *   twin — the module glossary term matching case-insensitively, or null;
 *   moduleText — the module's EN text, markers stripped
 * @returns {string}
 */
export function sentenceInitialGlossCase(term, { twin, moduleText }) {
  if (twin) return twin;
  const lead = term.match(/^\s*/)[0];
  const body = term.slice(lead.length);
  const firstWord = body.split(/[\s(,]/)[0];
  if (!firstWord) return term;
  const lowered = firstWord[0].toLowerCase() + firstWord.slice(1);
  const escaped = lowered.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const evidence = new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, 'u');
  if (!evidence.test(moduleText || '')) return term;
  return lead + body[0].toLowerCase() + body.slice(1);
}
