/**
 * book-licences.cjs — per-book licence for export tools.
 *
 * Item 17 (2026-07-21): book-config.json is now the CANONICAL licence datum.
 * getBookLicence reads books/<slug>/book-config.json's `licence` block; there
 * is no inline map. Source of truth for the values:
 * docs/provenance/openstax-cnxml-licence-provenance.md §1.
 *
 * getBookLicence THROWS when a book has no licence — a book enters the export
 * path deliberately, licence-first: add a `"licence": { "code", "obtained" }`
 * block to its book-config after checking the provenance doc. (stjornufraedi /
 * testbook carry none and therefore throw, unchanged.)
 */
'use strict';

const fs = require('fs');
const path = require('path');

// Books root: intrinsic (__dirname), never process.cwd() — the server runs cwd=server/.
// tools/lib/../../books == repo-root/books.
const REPO_ROOT = path.join(__dirname, '..', '..');

/**
 * @param {string} slug
 * @returns {{licence: string, obtained: string}}
 */
function getBookLicence(slug) {
  const configPath = path.join(REPO_ROOT, 'books', slug, 'book-config.json');
  let raw;
  try {
    raw = fs.readFileSync(configPath, 'utf-8');
  } catch {
    throw new Error(
      `No book-config.json for book "${slug}" (${configPath}) — cannot resolve its licence. ` +
        'Onboard licence-first; see docs/provenance/openstax-cnxml-licence-provenance.md'
    );
  }
  const cfg = JSON.parse(raw);
  const code = cfg.licence && cfg.licence.code;
  const obtained = cfg.licence && cfg.licence.obtained;
  if (!code || !obtained) {
    throw new Error(
      `No licence recorded for book "${slug}" in ${configPath} — add a ` +
        '`"licence": { "code": …, "obtained": … }` block after checking ' +
        'docs/provenance/openstax-cnxml-licence-provenance.md'
    );
  }
  return { licence: code, obtained };
}

module.exports = { getBookLicence };
