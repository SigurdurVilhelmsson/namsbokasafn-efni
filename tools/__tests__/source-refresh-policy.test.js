import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const policy = require('../lib/source-refresh-policy.cjs');

/** Build a throwaway book dir: <tmp>/<slug>/01-source, with a sibling book-config.json. */
function makeBook(licence) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'c93-'));
  const bookDir = path.join(root, 'somebook');
  const sourceDir = path.join(bookDir, '01-source');
  fs.mkdirSync(sourceDir, { recursive: true });
  if (licence !== undefined) {
    fs.writeFileSync(
      path.join(bookDir, 'book-config.json'),
      JSON.stringify({ licence: { code: licence, obtained: '2026-03-23' } })
    );
  }
  return sourceDir;
}

describe('§C93 G1 — the book gate', () => {
  it('PASSES the refreshable licence (the control that makes the refusals mean something)', () => {
    expect(() => policy.assertRefreshable(makeBook('CC BY-NC-SA 4.0'))).not.toThrow();
  });

  it('REFUSES CC BY — the irrevocable copies', () => {
    expect(() => policy.assertRefreshable(makeBook('CC BY 4.0'))).toThrow(/CC BY 4\.0/);
  });

  it('REFUSES an absent book-config.json (fails closed, not open)', () => {
    expect(() => policy.assertRefreshable(makeBook(undefined))).toThrow();
  });

  it('REFUSES an unrecognised licence string rather than guessing', () => {
    expect(() => policy.assertRefreshable(makeBook('CC0'))).toThrow();
  });

  it('REFUSES a near-miss that a looser matcher would accept', () => {
    // Same licence, different spelling. An allowlist must NOT normalise.
    expect(() => policy.assertRefreshable(makeBook('cc by-nc-sa 4.0'))).toThrow();
    expect(() => policy.assertRefreshable(makeBook('CC BY-NC-SA 4.0 '))).toThrow();
  });

  it('🔴 HAS ARITY 1 — the machine-checkable form of "no flag overrides it"', () => {
    expect(policy.assertRefreshable.length).toBe(1);
  });

  it('🔴 exports no escape hatch', () => {
    // Deliberately an ALLOWLIST (exact set), not a denylist regex over names: a denylist
    // fails OPEN on any escape hatch whose name it didn't anticipate (skipGate, devMode,
    // __unsafe, ...) — which is exactly the failure mode §C93 exists to rule out. A regex
    // here also collides with the mandated export `assertWritePathAllowed`, which legitimately
    // contains "Allow". Do not "helpfully" relax this back to a pattern.
    expect(Object.keys(policy).sort()).toEqual([
      'REFRESHABLE',
      'assertRefreshable',
      'assertWritePathAllowed',
    ]);
  });
});

describe('§C93 G4 — the write-set gate', () => {
  const ALLOWED = [
    'ch01/m00001.cnxml',
    'ch28/m00309.cnxml',
    'appendices/m00226.cnxml',
    'media/OChem_01_05_001.jpg',
    '.source-info.json',
    '.source-manifest.json',
    'collection-order.json',
  ];
  const FORBIDDEN = [
    'docx/ch00/preface.docx',
    'exercises/11-03-OC-P06.json',
    'ch00/../../evil.txt',
    'notes.txt',
  ];

  it('allows every path on the closed write allowlist', () => {
    for (const p of ALLOWED) expect(() => policy.assertWritePathAllowed(p, [])).not.toThrow();
  });

  it('🔴 REFUSES docx/ and exercises/ — outside every hash gate, unrestorable by refetch', () => {
    for (const p of FORBIDDEN) expect(() => policy.assertWritePathAllowed(p, [])).toThrow();
  });

  it('REFUSES a localOrigin path even though its directory is allowlisted', () => {
    const local = [
      { path: 'ch00/m68662.cnxml', reason: 're-authored from a CC BY-era Word export' },
    ];
    expect(() => policy.assertWritePathAllowed('ch00/m68662.cnxml', local)).toThrow(/m68662/);
    // control: its neighbour in the same directory is still writable
    expect(() => policy.assertWritePathAllowed('ch00/m68663.cnxml', local)).not.toThrow();
  });

  it('honours a localOrigin DIRECTORY prefix', () => {
    const local = [{ path: 'media/', reason: 'hand-curated' }];
    expect(() => policy.assertWritePathAllowed('media/x.jpg', local)).toThrow();
    expect(() => policy.assertWritePathAllowed('ch01/m1.cnxml', local)).not.toThrow();
  });
});
