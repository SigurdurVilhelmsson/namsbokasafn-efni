import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const consent = require('../lib/researchConsentText');
const {
  APPROVED_CONSENT_TEXTS,
  currentConsentText,
  isApprovedText,
  validateTexts,
  _setTestApprovedTexts,
} = consent;

// Every { version, sha256 } ever listed in APPROVED_CONSENT_TEXTS, appended in the SAME commit that lists it.
// Removing a version from the module then fails this file: a removal is a two-file change a reviewer sees.
// Remove one only after the read-only query in the module's header returns 0 on production (spec §5.14).
const EVER_LISTED = [];
const missingFrom = (ever, list) =>
  ever
    .filter((e) => !list.some((t) => t.version === e.version && t.sha256 === e.sha256))
    .map((e) => e.version);

const sha256Text = (s) => crypto.createHash('sha256').update(s).digest('hex');
const SEAM = '_setTestApprovedTexts';
const SERVER_DIR = path.join(__dirname, '..');
const MODULE_REL = 'lib/researchConsentText.js';

/** Relative paths of the .js files under root that name the seam, skipping dependencies and tests. */
function filesNamingSeam(root) {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.venv', '__tests__'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js') && fs.readFileSync(full, 'utf8').includes(SEAM)) {
        found.push(path.relative(root, full).split(path.sep).join('/'));
      }
    }
  };
  walk(root);
  return found.sort();
}

describe('researchConsentText', () => {
  afterEach(() => _setTestApprovedTexts(null));

  it('is empty until [USER] lists a text, and frozen (spec §5.14)', () => {
    expect([...APPROVED_CONSENT_TEXTS]).toEqual([]);
    expect(Object.isFrozen(APPROVED_CONSENT_TEXTS)).toBe(true);
    expect(currentConsentText()).toBeNull();
  });

  it('every entry is well formed', () => {
    expect(validateTexts(APPROVED_CONSENT_TEXTS)).toEqual([]);
    expect(
      validateTexts([
        { version: 'v1', sha256: 'abc' },
        { version: 'v1', sha256: 'a'.repeat(64) },
        { version: '', sha256: 'b'.repeat(64) },
      ])
    ).toEqual([
      'v1: sha256 is not 64 lowercase hex',
      'v1: version listed twice',
      '(empty): version is empty',
    ]);
  });

  it('never drops a version once listed (append-only)', () => {
    expect(missingFrom(EVER_LISTED, APPROVED_CONSENT_TEXTS)).toEqual([]);
    expect(missingFrom([{ version: 'v1', sha256: 'a'.repeat(64) }], [])).toEqual(['v1']);
  });

  it('the current text is the last entry; approval needs both version and hash', () => {
    const A = { version: 'prufa-1', sha256: sha256Text('texti 1') };
    const B = { version: 'prufa-2', sha256: sha256Text('texti 2') };
    _setTestApprovedTexts([A, B]);
    expect(currentConsentText()).toEqual(B);
    expect([
      isApprovedText(B.version, B.sha256),
      isApprovedText(A.version, A.sha256),
      isApprovedText(B.version, A.sha256),
      isApprovedText('x', B.sha256),
    ]).toEqual([true, true, false, false]);
    _setTestApprovedTexts(null);
    expect(currentConsentText()).toBeNull();
    expect(() => _setTestApprovedTexts([{ version: 'bad', sha256: 'x' }])).toThrow();
  });

  describe('the seam', () => {
    let tmp;
    afterEach(() => tmp && fs.rmSync(tmp, { recursive: true, force: true }));

    it('no file outside the tests names the approved-texts seam', () => {
      expect(filesNamingSeam(SERVER_DIR)).toEqual([MODULE_REL]);
    });

    it('control: the same walk finds a route that calls it', () => {
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'consent-seam-'));
      fs.mkdirSync(path.join(tmp, 'lib'));
      fs.mkdirSync(path.join(tmp, 'routes'));
      fs.copyFileSync(path.join(SERVER_DIR, MODULE_REL), path.join(tmp, MODULE_REL));
      fs.writeFileSync(
        path.join(tmp, 'routes/x.js'),
        `require('../lib/researchConsentText').${SEAM}([]);\n`
      );
      expect(filesNamingSeam(tmp)).toEqual([MODULE_REL, 'routes/x.js']);
    });
  });
});
