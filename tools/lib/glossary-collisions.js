// tools/lib/glossary-collisions.js
/**
 * C18 — detect unresolved term competitions in a glossary term list.
 *
 * A "competition" is one English headword with two or more DISTINCT approved
 * Icelandic translations. It matters because both consumers of the glossary
 * resolve it badly and silently:
 *   - buildGlossaryMap (tools/lib/math-label-substitute.js) writes every term
 *     into a Map keyed on lowercase English, so the last row wins — array
 *     order decides which word is substituted.
 *   - formatGlossary (tools/lib/malstadur-api.js) emits one pair per row, so
 *     it sends Málstaður both atom→frumeind AND atom→atóm in one request.
 *
 * This module ONLY reports. It never chooses a term: choosing is editorial
 * work owned by register C14 (2), and a deterministic-but-arbitrary tiebreak
 * is still an unreviewed editorial decision (register C18).
 *
 * Pure — no I/O, no logging, no process.cwd().
 */

/**
 * @param {Array<{english?:string, icelandic?:string, status?:string}>} terms
 * @param {{approvedOnly?: boolean}} [opts] approvedOnly mirrors the caller's
 *   own filter; pass false when `terms` has already been filtered.
 * @returns {{competitions: Array<{english:string, candidates:string[], chosen:string}>,
 *            commaLists: Array<{english:string, value:string, parts:string[]}>}}
 */
export function findGlossaryCollisions(terms, { approvedOnly = true } = {}) {
  const list = Array.isArray(terms) ? terms : [];
  const filtered = approvedOnly ? list.filter((t) => t && t.status === 'approved') : list;

  const byKey = new Map(); // lowercased english -> Icelandic values, in input order
  const commaLists = [];

  for (const t of filtered) {
    if (!t) continue;
    // Same blank-side filter both consumers already apply, so the detector
    // never reports a competition its consumer would not have had.
    const en = typeof t.english === 'string' ? t.english.trim() : '';
    const is = typeof t.icelandic === 'string' ? t.icelandic.trim() : '';
    if (!en || !is) continue;

    const key = en.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(is);

    if (is.includes(',')) {
      commaLists.push({
        english: key,
        value: is,
        parts: is
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
    }
  }

  const competitions = [];
  for (const [english, values] of byKey) {
    const candidates = [...new Set(values)];
    if (candidates.length < 2) continue;
    // `chosen` mirrors buildGlossaryMap's last-write-wins EXACTLY. It records
    // the status quo so the report describes reality; it does not propose a
    // change. If this ever diverges from what the Map returns, the report
    // becomes confidently wrong, which is worse than silence.
    competitions.push({ english, candidates, chosen: values[values.length - 1] });
  }

  return { competitions, commaLists };
}

const MAX_LISTED = 5;

/**
 * Operator-facing report. Pure — returns the string, never prints it, so the
 * inject and fidelity-check paths cannot drift into two different formats.
 *
 * @param {string} bookLabel
 * @param {{competitions?: Array<object>, commaLists?: Array<object>}} collisions
 * @returns {string|null} null when there is nothing to report
 */
export function formatCollisionReport(bookLabel, collisions) {
  const competitions = (collisions && collisions.competitions) || [];
  const commaLists = (collisions && collisions.commaLists) || [];
  if (competitions.length === 0 && commaLists.length === 0) return null;

  const lines = [];

  if (competitions.length > 0) {
    // Both numbers are stated on purpose. The total is what exists in the data
    // and what the baseline must carry; the unmasked count is what currently
    // reaches readers. Printing only the second would make math-label-map.json
    // look like a fix rather than a coincidence.
    const unmasked = competitions.filter((c) => c.masked !== true).length;
    lines.push(
      `⚠️  glossary (${bookLabel}): ${competitions.length} English key(s) have more than one approved Icelandic term.`
    );
    lines.push(
      `    ${unmasked} not covered by math-label-map.json — for those, row order decides which term readers see.`
    );
    for (const c of competitions.slice(0, MAX_LISTED)) {
      lines.push(`      ${c.english} → ${c.candidates.join(' | ')}   (using: ${c.chosen})`);
    }
    if (competitions.length > MAX_LISTED) {
      lines.push(`      … ${competitions.length - MAX_LISTED} more`);
    }
  }

  if (commaLists.length > 0) {
    lines.push(
      `⚠️  glossary (${bookLabel}): ${commaLists.length} Icelandic value(s) are comma-separated lists, not single terms.`
    );
    for (const c of commaLists.slice(0, MAX_LISTED)) {
      lines.push(`      ${c.english} → "${c.value}"`);
    }
    if (commaLists.length > MAX_LISTED) {
      lines.push(`      … ${commaLists.length - MAX_LISTED} more`);
    }
  }

  lines.push(`    Full list: npm run validate:glossary -- --book ${bookLabel}`);
  return lines.join('\n');
}
