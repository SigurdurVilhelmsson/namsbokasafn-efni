/**
 * source-cnxml.js — read a module's READ-ONLY English source CNXML.
 *
 * Used by cnxml-render's main() and by the server's renderModule() to pass
 * `sourceCnxml` to renderCnxmlToHtml, so a para-title can be keyed on the
 * source (H3 item 1, docs/decisions/2026-11-08-h3-four-form-rulings-chemistry.md).
 * Resolves against this file, never process.cwd(): the server runs with
 * cwd=server/ (CLAUDE.md § "resolve resource paths against something intrinsic").
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SAFE_SEGMENT = /^[\w-]+$/;

/**
 * @param {string} book - Book slug, e.g. 'efnafraedi-2e'
 * @param {string} chapterDir - Source chapter directory, e.g. 'ch09' or 'appendices'
 * @param {string} moduleId - Module id, e.g. 'm68759'
 * @returns {string|null} The source CNXML, or null when there is none (or a segment is unsafe)
 */
export function loadSourceCnxml(book, chapterDir, moduleId) {
  if (![book, chapterDir, moduleId].every((s) => typeof s === 'string' && SAFE_SEGMENT.test(s))) {
    return null;
  }
  const file = path.join(REPO_ROOT, 'books', book, '01-source', chapterDir, `${moduleId}.cnxml`);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null;
}
