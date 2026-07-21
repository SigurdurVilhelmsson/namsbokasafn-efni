'use strict';
/**
 * Árnastofnun added-terms seed serializers (item 21 PR-B). Pure functions over
 * the getAddedTerms() row shape.
 *
 * The CSV carries a formula-injection guard because this file is opened in
 * Árnastofnun's spreadsheet — an EXTERNAL destination (unlike the internal
 * glossary/corpus exports). Do NOT reuse this to harden routes/terminology.js's
 * shared csvEscapeField (would break the glossary export's byte-exact pins).
 */

const SEED_COLUMNS = [
  'english',
  'pos',
  'definition_en',
  'icelandic',
  'definition_is',
  'alternatives',
  'subject',
  'notes',
  'source',
  'submission_type',
  'existing_idordabanki_term',
  'existing_idordabanki_id',
  'proposed_by',
  'approved_by',
  'approved_at',
];

const TOOL = 'terminology-added-terms-export';
const VERSION = '1.0';
const PROVENANCE_NOTE =
  "The project's approved, project-authored Icelandic terms that are not present in " +
  'Íðorðabankinn as such, offered as a submission seed. Each row is either a new translation ' +
  '(no known Íðorðabankinn entry for the concept) or a new alternative (an additional Icelandic ' +
  'rendering for a concept Íðorðabankinn already holds — see existing_idordabanki_term / ' +
  'existing_idordabanki_id, which may be blank when the existing term was imported without an ' +
  'Íðorðabankinn id). Classification is best-effort: a concept is treated as already in ' +
  'Íðorðabankinn when the project holds a sibling term either fetched from Íðorðabankinn or ' +
  "imported from a source known to be in it; 'new-translation' means 'no such known sibling in " +
  "our data', not a guarantee of absence.";

/**
 * CSV field escape. First a formula-injection guard (prefix an apostrophe to a
 * field beginning with = + - @ or tab/CR — the OWASP mitigation), then RFC-4180
 * quoting (quote fields with comma/quote/CR/LF; double inner quotes).
 * @param {*} value
 * @returns {string}
 */
function csvSeedField(value) {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function rowToCells(row) {
  return [
    row.english,
    row.pos || '',
    row.definitionEn || '',
    row.icelandic,
    row.definitionIs || '',
    (row.alternatives || []).join('; '),
    (row.subjects || []).join('; '),
    row.notes || '',
    row.source,
    row.submissionType,
    row.existingIdordabankiTerm || '',
    row.existingIdordabankiId || '',
    row.proposedBy || '',
    row.approvedBy || '',
    row.approvedAt || '',
  ];
}

/**
 * @param {Array<object>} rows getAddedTerms() rows
 * @returns {string} CSV (header + one row each; header-only when empty)
 */
function serializeSeedCsv(rows) {
  const lines = [SEED_COLUMNS.join(',')];
  for (const row of rows) lines.push(rowToCells(row).map(csvSeedField).join(','));
  return lines.join('\n') + '\n';
}

function seedStats(rows) {
  return {
    total: rows.length,
    newTranslation: rows.filter((r) => r.submissionType === 'new-translation').length,
    newAlternative: rows.filter((r) => r.submissionType === 'new-alternative').length,
  };
}

/**
 * @param {Array<object>} rows getAddedTerms() rows
 * @param {{date?: Date}} [opts]
 * @returns {string} pretty JSON doc + trailing newline
 */
function serializeSeedJson(rows, opts = {}) {
  const doc = {
    generated: (opts.date || new Date()).toISOString(),
    tool: TOOL,
    version: VERSION,
    provenance_note: PROVENANCE_NOTE,
    stats: seedStats(rows),
    terms: rows.map((r) => ({
      english: r.english,
      pos: r.pos || null,
      definition_en: r.definitionEn || null,
      icelandic: r.icelandic,
      definition_is: r.definitionIs || null,
      alternatives: r.alternatives || [],
      subjects: r.subjects || [],
      notes: r.notes || null,
      source: r.source,
      submission_type: r.submissionType,
      existing_idordabanki_term: r.existingIdordabankiTerm || null,
      existing_idordabanki_id: r.existingIdordabankiId || null,
      proposed_by: r.proposedBy || null,
      approved_by: r.approvedBy || null,
      approved_at: r.approvedAt || null,
    })),
  };
  return JSON.stringify(doc, null, 2) + '\n';
}

module.exports = {
  SEED_COLUMNS,
  csvSeedField,
  serializeSeedCsv,
  serializeSeedJson,
  PROVENANCE_NOTE,
};
