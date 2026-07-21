/**
 * Item 17 — efni book-config licence ↔ vefur book.ts derivativeLicence agreement.
 * Mirrors css-contract.test.js: skip when the sister repo is absent; VEFUR_CONTRACT=1
 * turns absence into a hard failure. Normalises the format gap
 * ('CC BY 4.0' ↔ 'CC-BY-4.0') before comparing.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { getBookLicence } = require('../lib/book-licences.cjs');

const VEFUR_BOOK_TS = path.resolve(__dirname, '../../../namsbokasafn-vefur/src/lib/types/book.ts');

// The provenanced books efni stamps and vefur displays (both derive from provenance §1).
const PROVENANCED = [
  'efnafraedi-2e',
  'liffraedi-2e',
  'orverufraedi',
  'edlisfraedi-2e',
  'lifraen-efnafraedi',
];

const normalise = (code) => code.replace(/[\s-]/g, '').toUpperCase(); // 'CC BY 4.0' & 'CC-BY-4.0' -> 'CCBY4.0'

function readVefurLicences() {
  const src = fs.readFileSync(VEFUR_BOOK_TS, 'utf-8');
  const map = {};
  const re = /bookKey:\s*'([^']+)'[\s\S]*?derivativeLicence:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(src)) !== null) map[m[1]] = m[2];
  return map;
}

describe('licence agreement: efni book-config ↔ vefur book.ts', () => {
  const vefurExists = fs.existsSync(VEFUR_BOOK_TS);
  const requireVefur = process.env.VEFUR_CONTRACT === '1';

  if (requireVefur) {
    it('VEFUR_CONTRACT=1 requires vefur book.ts to be present', () => {
      expect(vefurExists, `VEFUR_CONTRACT=1 but vefur book.ts not found at ${VEFUR_BOOK_TS}`).toBe(
        true
      );
    });
  }

  it.skipIf(!vefurExists)('parses at least the provenanced books from vefur book.ts', () => {
    const vefur = readVefurLicences();
    for (const slug of PROVENANCED) {
      expect(vefur[slug], `vefur book.ts has no derivativeLicence for ${slug}`).toBeTruthy();
    }
  });

  it.skipIf(!vefurExists)('every provenanced book agrees after format normalisation', () => {
    const vefur = readVefurLicences();
    for (const slug of PROVENANCED) {
      const efni = getBookLicence(slug).licence;
      expect(
        normalise(efni),
        `licence disagreement for ${slug}: efni="${efni}" vefur="${vefur[slug]}"`
      ).toBe(normalise(vefur[slug]));
    }
  });
});
