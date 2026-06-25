/**
 * glossary-term.js — shared helper for extracting a glossary headword from a
 * CNXML `<definition>`'s `<term>` element.
 *
 * The headword text must tolerate inline markup. OpenStax wraps physical-quantity
 * symbols in `<emphasis effect="italics">` and sometimes carries a `<m:math>`
 * block plus a `[[math:N]]` placeholder, e.g.:
 *
 *   <term>varmi (<emphasis effect="italics">q</emphasis>) (e. heat (q))</term>
 *   <term>entalpía (<emphasis effect="italics">H</emphasis>) (e. enthalpy (h))</term>
 *   <term>staðalbrunaentalpía (ΔHc°) <m:math>…</m:math> (e. standard enthalpy … [[math:132]])</term>
 *
 * A naive `<term>([^<]+)</term>` match silently drops every term that contains
 * markup (65 such terms in efnafraedi-2e). This strips markup the same way the
 * `<meaning>` extraction already does, but removes `<m:math>` blocks and
 * `[[math:N]]` placeholders first so their inner text doesn't leak into the
 * headword.
 */

/**
 * Extract clean headword text from a `<definition>` body. Returns null if there
 * is no `<term>` or it reduces to empty.
 * @param {string} defContent - inner XML of a `<definition>` element
 * @returns {string|null}
 */
export function extractTermText(defContent) {
  const m = defContent.match(/<term>([\s\S]*?)<\/term>/);
  if (!m) return null;
  const text = m[1]
    .replace(/<m:math[\s\S]*?<\/m:math>/g, '') // drop MathML symbol blocks (with content)
    .replace(/\[\[math:\d+\]\]/g, '') // drop math placeholders
    .replace(/<[^>]+>/g, '') // strip remaining inline markup (emphasis/sub/sup)
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}
