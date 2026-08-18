import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { parseCollectionXml, organizeSourceFiles } from '../download-source.js';

const TMP = join(import.meta.dirname, '..', '..', '.tmp', 'test-source-downloader');

// §C93 G3's expected licence for every fixture below: the sibling book-config.json this file
// writes is always CC BY-NC-SA 4.0 (see beforeEach blocks). Kept as a named constant so the G3
// refusal test can swap it for the CC BY URL without duplicating the raw string.
const NCSA_LICENSE_URL = 'http://creativecommons.org/licenses/by-nc-sa/4.0/';

// Minimal collection.xml that mirrors OpenStax structure
const SAMPLE_COLLECTION_XML = `<?xml version="1.0" encoding="UTF-8"?>
<col:collection xmlns:col="http://cnx.rice.edu/collxml" xmlns:md="http://cnx.rice.edu/mdml">
  <col:metadata>
    <md:title>Test Chemistry Book</md:title>
    <md:license url="${NCSA_LICENSE_URL}">Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International</md:license>
  </col:metadata>
  <col:content>
    <col:module document="m00001"/>
    <col:subcollection>
      <md:title>Essential Ideas</md:title>
      <col:content>
        <col:module document="m68663"/>
        <col:module document="m68664"/>
        <col:module document="m68665"/>
      </col:content>
    </col:subcollection>
    <col:subcollection>
      <md:title>Atoms, Molecules, and Ions</md:title>
      <col:content>
        <col:module document="m68700"/>
        <col:module document="m68701"/>
      </col:content>
    </col:subcollection>
    <col:subcollection>
      <md:title>Composition of Substances</md:title>
      <col:content>
        <col:module document="m68710"/>
      </col:content>
    </col:subcollection>
    <col:module document="m99901"/>
    <col:module document="m99902"/>
  </col:content>
</col:collection>`;

// =====================================================================
// parseCollectionXml tests
// =====================================================================

describe('parseCollectionXml', () => {
  it('should extract chapters with correct module IDs', () => {
    const result = parseCollectionXml(SAMPLE_COLLECTION_XML);

    expect(result.chapters).toHaveLength(3);

    expect(result.chapters[0].chapter).toBe(1);
    expect(result.chapters[0].title).toBe('Essential Ideas');
    expect(result.chapters[0].modules).toEqual(['m68663', 'm68664', 'm68665']);

    expect(result.chapters[1].chapter).toBe(2);
    expect(result.chapters[1].title).toBe('Atoms, Molecules, and Ions');
    expect(result.chapters[1].modules).toEqual(['m68700', 'm68701']);

    expect(result.chapters[2].chapter).toBe(3);
    expect(result.chapters[2].title).toBe('Composition of Substances');
    expect(result.chapters[2].modules).toEqual(['m68710']);
  });

  it('should extract preface module', () => {
    const result = parseCollectionXml(SAMPLE_COLLECTION_XML);
    expect(result.preface).toBe('m00001');
  });

  it('should extract appendix modules', () => {
    const result = parseCollectionXml(SAMPLE_COLLECTION_XML);
    expect(result.appendixModules).toEqual(['m99901', 'm99902']);
  });

  it('should handle collection with no preface', () => {
    const xml = `<col:collection xmlns:col="http://cnx.rice.edu/collxml" xmlns:md="http://cnx.rice.edu/mdml">
      <col:content>
        <col:subcollection>
          <md:title>Chapter 1</md:title>
          <col:content><col:module document="m00010"/></col:content>
        </col:subcollection>
      </col:content>
    </col:collection>`;

    const result = parseCollectionXml(xml);
    expect(result.preface).toBeNull();
    expect(result.chapters).toHaveLength(1);
    expect(result.appendixModules).toEqual([]);
  });

  it('should handle collection with no appendices', () => {
    const xml = `<col:collection xmlns:col="http://cnx.rice.edu/collxml" xmlns:md="http://cnx.rice.edu/mdml">
      <col:content>
        <col:module document="m00001"/>
        <col:subcollection>
          <md:title>Chapter 1</md:title>
          <col:content><col:module document="m00010"/></col:content>
        </col:subcollection>
      </col:content>
    </col:collection>`;

    const result = parseCollectionXml(xml);
    expect(result.preface).toBe('m00001');
    expect(result.appendixModules).toEqual([]);
  });
});

// =====================================================================
// organizeSourceFiles tests
// =====================================================================

// §C93 G2's `.source-info.json` needs a `commitHash` distinct from the commit each fetch is
// "about to write" — real shapes, not mocks of the gate (a mocked gate is a gate by care).
const OLD_COMMIT = 'commit-old-0000000000000000000000000000000000';
const NEW_COMMIT = 'commit-new-1111111111111111111111111111111111';

describe('organizeSourceFiles', () => {
  const extractedDir = join(TMP, 'extracted');
  const sourceDir = join(TMP, 'source');

  // §C93 G2/G3/G4 note: every `organizeSourceFiles(...)` call in this describe block passes
  // `collectionXml: SAMPLE_COLLECTION_XML` (CC BY-NC-SA licence, matching book-config.json below)
  // and `newCommit: NEW_COMMIT` (differing from `.source-info.json`'s OLD_COMMIT). None of them
  // throw — so this whole block doubles as the PASSING CONTROL for G2 and G3, and (since every
  // written path here is on the closed allowlist with no localOrigin carve-out) for G4 too. The
  // dedicated refusal tests for G2/G3/G4 live in their own describe block below.
  beforeEach(() => {
    rmSync(TMP, { recursive: true, force: true });

    // §C93 G1 needs a sibling book-config.json beside sourceDir (`TMP/source`) with a
    // refreshable licence — sourceDir/.. is TMP, so this goes at TMP/book-config.json. Real
    // shape (`{ licence: { code, obtained } }`), not a mock of the gate: a mocked gate is a
    // gate by care.
    mkdirSync(TMP, { recursive: true });
    writeFileSync(
      join(TMP, 'book-config.json'),
      JSON.stringify({ licence: { code: 'CC BY-NC-SA 4.0', obtained: '2026-03-23' } })
    );

    // §C93 G2 needs a pre-existing `.source-info.json` *inside* sourceDir with a commitHash
    // that will differ from NEW_COMMIT below. sourceDir doesn't exist yet at this point in a
    // real run (organizeSourceFiles creates it after G1-G3), so this test creates it explicitly.
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(join(sourceDir, '.source-info.json'), JSON.stringify({ commitHash: OLD_COMMIT }));

    // Create mock extracted directory with modules
    const modules = [
      'm00001',
      'm68663',
      'm68664',
      'm68665',
      'm68700',
      'm68701',
      'm68710',
      'm99901',
      'm99902',
    ];
    for (const mod of modules) {
      const modDir = join(extractedDir, 'modules', mod);
      mkdirSync(modDir, { recursive: true });
      writeFileSync(
        join(modDir, 'index.cnxml'),
        `<document id="${mod}"><title>Module ${mod}</title></document>`
      );
    }

    // Create mock media files
    mkdirSync(join(extractedDir, 'media'), { recursive: true });
    writeFileSync(join(extractedDir, 'media', 'fig1.png'), 'fake-png');
    writeFileSync(join(extractedDir, 'media', 'fig2.jpg'), 'fake-jpg');
    writeFileSync(join(extractedDir, 'media', 'eq1.svg'), 'fake-svg');
  });

  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('should place modules in correct chapter directories', () => {
    const structure = parseCollectionXml(SAMPLE_COLLECTION_XML);
    const result = organizeSourceFiles({
      extractedDir,
      sourceDir,
      structure,
      verbose: false,
      collectionXml: SAMPLE_COLLECTION_XML,
      newCommit: NEW_COMMIT,
    });

    // Preface
    expect(existsSync(join(sourceDir, 'ch00', 'm00001.cnxml'))).toBe(true);

    // Chapter 1
    expect(existsSync(join(sourceDir, 'ch01', 'm68663.cnxml'))).toBe(true);
    expect(existsSync(join(sourceDir, 'ch01', 'm68664.cnxml'))).toBe(true);
    expect(existsSync(join(sourceDir, 'ch01', 'm68665.cnxml'))).toBe(true);

    // Chapter 2
    expect(existsSync(join(sourceDir, 'ch02', 'm68700.cnxml'))).toBe(true);
    expect(existsSync(join(sourceDir, 'ch02', 'm68701.cnxml'))).toBe(true);

    // Chapter 3
    expect(existsSync(join(sourceDir, 'ch03', 'm68710.cnxml'))).toBe(true);

    // Appendices
    expect(existsSync(join(sourceDir, 'appendices', 'm99901.cnxml'))).toBe(true);
    expect(existsSync(join(sourceDir, 'appendices', 'm99902.cnxml'))).toBe(true);

    expect(result.moduleCount).toBe(9);
  });

  it('should copy media files', () => {
    const structure = parseCollectionXml(SAMPLE_COLLECTION_XML);
    const result = organizeSourceFiles({
      extractedDir,
      sourceDir,
      structure,
      verbose: false,
      collectionXml: SAMPLE_COLLECTION_XML,
      newCommit: NEW_COMMIT,
    });

    expect(existsSync(join(sourceDir, 'media', 'fig1.png'))).toBe(true);
    expect(existsSync(join(sourceDir, 'media', 'fig2.jpg'))).toBe(true);
    expect(existsSync(join(sourceDir, 'media', 'eq1.svg'))).toBe(true);
    expect(result.mediaCount).toBe(3);
  });

  it('should warn about missing modules but continue', () => {
    // Remove one module from the extracted files
    rmSync(join(extractedDir, 'modules', 'm68665'), { recursive: true });

    const structure = parseCollectionXml(SAMPLE_COLLECTION_XML);
    const result = organizeSourceFiles({
      extractedDir,
      sourceDir,
      structure,
      verbose: false,
      collectionXml: SAMPLE_COLLECTION_XML,
      newCommit: NEW_COMMIT,
    });

    // Should still process all other modules
    expect(result.moduleCount).toBe(8);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('m68665');
    expect(result.warnings[0]).toContain('not found');
  });

  it('should preserve CNXML content in copied files', () => {
    const structure = parseCollectionXml(SAMPLE_COLLECTION_XML);
    organizeSourceFiles({
      extractedDir,
      sourceDir,
      structure,
      verbose: false,
      collectionXml: SAMPLE_COLLECTION_XML,
      newCommit: NEW_COMMIT,
    });

    const content = readFileSync(join(sourceDir, 'ch01', 'm68663.cnxml'), 'utf8');
    expect(content).toContain('<document id="m68663">');
    expect(content).toContain('<title>Module m68663</title>');
  });

  it('should handle empty media directory gracefully', () => {
    rmSync(join(extractedDir, 'media'), { recursive: true });

    const structure = parseCollectionXml(SAMPLE_COLLECTION_XML);
    const result = organizeSourceFiles({
      extractedDir,
      sourceDir,
      structure,
      verbose: false,
      collectionXml: SAMPLE_COLLECTION_XML,
      newCommit: NEW_COMMIT,
    });

    expect(result.mediaCount).toBe(0);
    expect(result.moduleCount).toBe(9);
  });

  it('refuses to overwrite a populated 01-source/ by default', () => {
    const structure = parseCollectionXml(SAMPLE_COLLECTION_XML);
    organizeSourceFiles({
      extractedDir,
      sourceDir,
      structure,
      verbose: false,
      collectionXml: SAMPLE_COLLECTION_XML,
      newCommit: NEW_COMMIT,
    }); // populate once

    expect(() =>
      organizeSourceFiles({
        extractedDir,
        sourceDir,
        structure,
        verbose: false,
        collectionXml: SAMPLE_COLLECTION_XML,
        newCommit: NEW_COMMIT,
      })
    ).toThrow(/Refusing to overwrite populated 01-source/);
  });

  it('allows overwrite when allowOverwrite:true', () => {
    const structure = parseCollectionXml(SAMPLE_COLLECTION_XML);
    organizeSourceFiles({
      extractedDir,
      sourceDir,
      structure,
      verbose: false,
      collectionXml: SAMPLE_COLLECTION_XML,
      newCommit: NEW_COMMIT,
    });

    const result = organizeSourceFiles({
      extractedDir,
      sourceDir,
      structure,
      verbose: false,
      allowOverwrite: true,
      collectionXml: SAMPLE_COLLECTION_XML,
      newCommit: NEW_COMMIT,
    });
    expect(result.moduleCount).toBe(9);
  });
});

// =====================================================================
// §C93 G1 — the licence-keyed book gate, wired into organizeSourceFiles
// =====================================================================

describe('organizeSourceFiles — §C93 G1 licence gate', () => {
  const CCBY_ROOT = join(TMP, 'ccby-book');
  const ccbyExtractedDir = join(CCBY_ROOT, 'extracted');
  const ccbySourceDir = join(CCBY_ROOT, '01-source');

  beforeEach(() => {
    rmSync(CCBY_ROOT, { recursive: true, force: true });

    // A CC BY book — the irrevocable copies §C93 exists to protect. sourceDir/.. is CCBY_ROOT,
    // so the sibling config goes there.
    mkdirSync(CCBY_ROOT, { recursive: true });
    writeFileSync(
      join(CCBY_ROOT, 'book-config.json'),
      JSON.stringify({ licence: { code: 'CC BY 4.0', obtained: '2026-01-19' } })
    );

    const modDir = join(ccbyExtractedDir, 'modules', 'm00001');
    mkdirSync(modDir, { recursive: true });
    writeFileSync(join(modDir, 'index.cnxml'), '<document id="m00001"><title>M</title></document>');
  });

  afterEach(() => {
    rmSync(CCBY_ROOT, { recursive: true, force: true });
  });

  it('🔴 REFUSES a CC BY book even on a fresh, empty 01-source/ (no populated-dir loophole)', () => {
    const structure = parseCollectionXml(SAMPLE_COLLECTION_XML);
    expect(() =>
      organizeSourceFiles({
        extractedDir: ccbyExtractedDir,
        sourceDir: ccbySourceDir,
        structure,
        verbose: false,
      })
    ).toThrow(/CC BY 4\.0/);
    // control: G1 refused before any write happened
    expect(existsSync(join(ccbySourceDir, 'ch00', 'm00001.cnxml'))).toBe(false);
  });

  it('🔴 --allow-overwrite-source CANNOT reach a CC BY book — G1 runs unconditionally', () => {
    const structure = parseCollectionXml(SAMPLE_COLLECTION_XML);
    expect(() =>
      organizeSourceFiles({
        extractedDir: ccbyExtractedDir,
        sourceDir: ccbySourceDir,
        structure,
        verbose: false,
        allowOverwrite: true,
      })
    ).toThrow(/CC BY 4\.0/);
    expect(existsSync(join(ccbySourceDir, 'ch00', 'm00001.cnxml'))).toBe(false);
  });
});

// =====================================================================
// §C93 G2, G3, G4 — the gates built in Tasks 2-3 but, until this task, wired nowhere
// =====================================================================
//
// The whole `describe('organizeSourceFiles', ...)` block above is the PASSING CONTROL for all
// three: every case there flows through G2 (vintage) and G3 (licence-identity) and G4
// (write-set) without throwing. These three tests exercise each gate's REFUSAL path through the
// real wiring — a book that is otherwise entirely legitimate (refreshable licence, real
// extracted modules) except for the one condition the gate under test exists to catch.

describe('organizeSourceFiles — §C93 G2/G3/G4, newly wired', () => {
  const G234_ROOT = join(TMP, 'g234-book');
  const g234ExtractedDir = join(G234_ROOT, 'extracted');
  const g234SourceDir = join(G234_ROOT, 'source');
  const CCBY_LICENSE_URL = 'http://creativecommons.org/licenses/by/4.0/';

  beforeEach(() => {
    rmSync(G234_ROOT, { recursive: true, force: true });

    mkdirSync(G234_ROOT, { recursive: true });
    writeFileSync(
      join(G234_ROOT, 'book-config.json'),
      JSON.stringify({ licence: { code: 'CC BY-NC-SA 4.0', obtained: '2026-03-23' } })
    );

    // ONE module per write loop, and one media file — deliberately minimal. `organizeSourceFiles`
    // skips any module with no extracted `index.cnxml` (it only pushes a warning), so planting
    // exactly one reachable file per loop makes each G4 test order-independent: there is only
    // ever one write attempt per loop, and it is the one the test carves out.
    //
    // Write order is preface -> chapters -> appendices -> media, which is what lets each test
    // below use the PRECEDING stages' successful writes as its positive control. Without that,
    // "the file is absent" is equally consistent with an earlier gate having refused first.
    for (const moduleId of ['m00001', 'm68663', 'm99901']) {
      const modDir = join(g234ExtractedDir, 'modules', moduleId);
      mkdirSync(modDir, { recursive: true });
      writeFileSync(
        join(modDir, 'index.cnxml'),
        `<document id="${moduleId}"><title>M</title></document>`
      );
    }
    mkdirSync(join(g234ExtractedDir, 'media'), { recursive: true });
    writeFileSync(join(g234ExtractedDir, 'media', 'fig1.png'), 'fake-png');
  });

  /** Plant a valid `.source-info.json` (so G2 passes) plus a v2 manifest carving out `relPath`. */
  function plantCarveOut(relPath) {
    mkdirSync(g234SourceDir, { recursive: true });
    writeFileSync(
      join(g234SourceDir, '.source-info.json'),
      JSON.stringify({ commitHash: OLD_COMMIT })
    );
    writeFileSync(
      join(g234SourceDir, '.source-manifest.json'),
      JSON.stringify({
        version: 2,
        book: 'g234-book',
        algorithm: 'sha256',
        localOrigin: [{ path: relPath, reason: 'test carve-out' }],
        files: {},
      })
    );
  }

  /** Run the real wiring with every gate-relevant input supplied. */
  function organize(overrides = {}) {
    return organizeSourceFiles({
      extractedDir: g234ExtractedDir,
      sourceDir: g234SourceDir,
      structure: parseCollectionXml(SAMPLE_COLLECTION_XML),
      verbose: false,
      collectionXml: SAMPLE_COLLECTION_XML,
      newCommit: NEW_COMMIT,
      ...overrides,
    });
  }

  afterEach(() => {
    rmSync(G234_ROOT, { recursive: true, force: true });
  });

  // ⚠️ AMENDED 2026-08-17 after whole-branch review. This case used to plant NOTHING and expect
  // a G2 refusal — which pinned a REGRESSION: `.source-info.json` is written by main() AFTER
  // organizeSourceFiles returns, so "no record and no bytes" is a book's FIRST fetch, and
  // refusing it deadlocked intake permanently with no flag to help. The refusal is still correct
  // for "record lost, bytes present", which is what this fixture now builds, and the first-fetch
  // path gets its own passing case immediately below.
  it('🔴 G2 REFUSES when the record is gone but CNXML is present — "record lost", not a first fetch', () => {
    mkdirSync(join(g234SourceDir, 'ch01'), { recursive: true });
    writeFileSync(join(g234SourceDir, 'ch01', 'm68663.cnxml'), '<document id="m68663"/>');
    expect(() => organize()).toThrow(/§C93 G2 REFUSED/);
    // control: refused before the preface was written
    expect(existsSync(join(g234SourceDir, 'ch00', 'm00001.cnxml'))).toBe(false);
  });

  it('✅ A FIRST FETCH SUCCEEDS — empty 01-source, no record: G2 has nothing to supersede', () => {
    // The state bookRegistration.createBookDirectories() leaves: the dir exists, holds a README
    // and nothing else. Before the fix this threw §C93 G2 REFUSED and no new book could ever be
    // fetched — a regression against the merge base that killed both admin fetch endpoints for
    // their only reachable input.
    mkdirSync(g234SourceDir, { recursive: true });
    writeFileSync(join(g234SourceDir, 'README.md'), '# source goes here');
    const result = organize();
    expect(result.moduleCount).toBe(3);
    expect(existsSync(join(g234SourceDir, 'ch00', 'm00001.cnxml'))).toBe(true);
  });

  it('🔴 …and a first fetch is still fully gated: G1 refuses a CC BY book with an empty dir', () => {
    // The load-bearing half of the fix. Skipping G2 on a first fetch must not skip anything
    // else, so the same empty-directory state must still refuse for a CC BY book.
    mkdirSync(g234SourceDir, { recursive: true });
    writeFileSync(
      join(G234_ROOT, 'book-config.json'),
      JSON.stringify({ licence: { code: 'CC BY 4.0', obtained: '2026-01-19' } })
    );
    expect(() => organize()).toThrow(/§C93 G1 REFUSED/);
    expect(existsSync(join(g234SourceDir, 'ch00', 'm00001.cnxml'))).toBe(false);
  });

  it('🔴 …and G3 still runs on a first fetch: a flipped upstream licence refuses', () => {
    mkdirSync(g234SourceDir, { recursive: true });
    const flipped = SAMPLE_COLLECTION_XML.replace(NCSA_LICENSE_URL, CCBY_LICENSE_URL);
    expect(() => organize({ collectionXml: flipped })).toThrow(/§C93 G3 REFUSED/);
    expect(existsSync(join(g234SourceDir, 'ch00', 'm00001.cnxml'))).toBe(false);
  });

  it('🔴 G3 REFUSES when the freshly-fetched collection licence differs from the recorded one', () => {
    mkdirSync(g234SourceDir, { recursive: true });
    writeFileSync(
      join(g234SourceDir, '.source-info.json'),
      JSON.stringify({ commitHash: OLD_COMMIT })
    );
    // Same book structure, but the *fetched* collection.xml now carries the CC BY url instead
    // of the CC BY-NC-SA one book-config.json records — the NC-SA→CC BY self-poisoning
    // direction G3 exists to catch.
    const flippedCollectionXml = SAMPLE_COLLECTION_XML.replace(NCSA_LICENSE_URL, CCBY_LICENSE_URL);
    const structure = parseCollectionXml(SAMPLE_COLLECTION_XML);
    expect(() =>
      organizeSourceFiles({
        extractedDir: g234ExtractedDir,
        sourceDir: g234SourceDir,
        structure,
        verbose: false,
        collectionXml: flippedCollectionXml,
        newCommit: NEW_COMMIT,
      })
    ).toThrow(/§C93 G3 REFUSED/);
    expect(existsSync(join(g234SourceDir, 'ch00', 'm00001.cnxml'))).toBe(false);
  });

  it('🔴 G4 REFUSES a write path declared localOrigin in a v2 manifest', () => {
    mkdirSync(g234SourceDir, { recursive: true });
    writeFileSync(
      join(g234SourceDir, '.source-info.json'),
      JSON.stringify({ commitHash: OLD_COMMIT })
    );
    // A v2 manifest carving out the preface module — G1-G3 all pass; only G4 stands between
    // this write and disk.
    writeFileSync(
      join(g234SourceDir, '.source-manifest.json'),
      JSON.stringify({
        version: 2,
        book: 'g234-book',
        algorithm: 'sha256',
        localOrigin: [{ path: 'ch00/m00001.cnxml', reason: 'test carve-out' }],
        files: {},
      })
    );
    const structure = parseCollectionXml(SAMPLE_COLLECTION_XML);
    expect(() =>
      organizeSourceFiles({
        extractedDir: g234ExtractedDir,
        sourceDir: g234SourceDir,
        structure,
        verbose: false,
        collectionXml: SAMPLE_COLLECTION_XML,
        newCommit: NEW_COMMIT,
      })
    ).toThrow(/§C93 G4 REFUSED.*localOrigin/);
    expect(existsSync(join(g234SourceDir, 'ch00', 'm00001.cnxml'))).toBe(false);
  });

  // -------------------------------------------------------------------------------------
  // G4's OTHER THREE call sites. Added 2026-08-17 by Task 7 Step 4's mutation run, which
  // measured that only the preface site above was load-bearing: deleting the chapters,
  // appendices or media call individually left all 4,791 tests GREEN. The chapters loop is
  // where essentially every write in a real refresh happens, so G4's only covered site was
  // its least consequential one.
  //
  // Each test carves out exactly one path and asserts the PRECEDING stages wrote — that
  // positive control is what distinguishes "this loop's gate refused" from "something
  // earlier refused and this file never got a turn", which the absence assertion alone
  // cannot tell apart.
  // -------------------------------------------------------------------------------------

  it('🔴 G4 REFUSES a carved-out CHAPTER module — the loop that does nearly every real write', () => {
    plantCarveOut('ch01/m68663.cnxml');
    expect(() => organize()).toThrow(/§C93 G4 REFUSED.*localOrigin/);
    expect(existsSync(join(g234SourceDir, 'ch01', 'm68663.cnxml'))).toBe(false);
    // positive control: the preface, which is NOT carved out, was written first
    expect(existsSync(join(g234SourceDir, 'ch00', 'm00001.cnxml'))).toBe(true);
  });

  it('🔴 G4 REFUSES a carved-out APPENDIX module', () => {
    plantCarveOut('appendices/m99901.cnxml');
    expect(() => organize()).toThrow(/§C93 G4 REFUSED.*localOrigin/);
    expect(existsSync(join(g234SourceDir, 'appendices', 'm99901.cnxml'))).toBe(false);
    // positive control: both earlier loops ran to completion
    expect(existsSync(join(g234SourceDir, 'ch00', 'm00001.cnxml'))).toBe(true);
    expect(existsSync(join(g234SourceDir, 'ch01', 'm68663.cnxml'))).toBe(true);
  });

  it('🔴 G4 REFUSES a carved-out MEDIA file — the erratum case, invisible to any CNXML diff', () => {
    plantCarveOut('media/fig1.png');
    expect(() => organize()).toThrow(/§C93 G4 REFUSED.*localOrigin/);
    expect(existsSync(join(g234SourceDir, 'media', 'fig1.png'))).toBe(false);
    // positive control: all three module loops ran to completion
    expect(existsSync(join(g234SourceDir, 'ch00', 'm00001.cnxml'))).toBe(true);
    expect(existsSync(join(g234SourceDir, 'ch01', 'm68663.cnxml'))).toBe(true);
    expect(existsSync(join(g234SourceDir, 'appendices', 'm99901.cnxml'))).toBe(true);
  });

  // -------------------------------------------------------------------------------------
  // G2's absent-input path. Measured 2026-08-17: `undefined`, `null` and `''` ALL passed G2,
  // because its only test involving `newCommit` was the equality comparison and
  // `'<sha>' === undefined` is false — so an absent sha read as "the vintage advanced".
  // G3 already failed closed on the same inputs; this makes the two symmetric.
  // -------------------------------------------------------------------------------------

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['the empty string', ''],
  ])('🔴 G2 REFUSES when newCommit is %s — an absent sha is not permission', (_label, value) => {
    mkdirSync(g234SourceDir, { recursive: true });
    writeFileSync(
      join(g234SourceDir, '.source-info.json'),
      JSON.stringify({ commitHash: OLD_COMMIT })
    );
    expect(() => organize({ newCommit: value })).toThrow(/§C93 G2 REFUSED/);
    expect(existsSync(join(g234SourceDir, 'ch00', 'm00001.cnxml'))).toBe(false);
  });

  it('✅ CONTROL: the same fixture with a real, advancing sha writes every position', () => {
    mkdirSync(g234SourceDir, { recursive: true });
    writeFileSync(
      join(g234SourceDir, '.source-info.json'),
      JSON.stringify({ commitHash: OLD_COMMIT })
    );
    // No carve-out, correct licence, advancing vintage: all four gates pass and all four
    // write loops run. Without this row, every assertion above is consistent with a fixture
    // that simply cannot write anything.
    const result = organize();
    expect(result.moduleCount).toBe(3);
    expect(result.mediaCount).toBe(1);
    expect(existsSync(join(g234SourceDir, 'ch00', 'm00001.cnxml'))).toBe(true);
    expect(existsSync(join(g234SourceDir, 'ch01', 'm68663.cnxml'))).toBe(true);
    expect(existsSync(join(g234SourceDir, 'appendices', 'm99901.cnxml'))).toBe(true);
    expect(existsSync(join(g234SourceDir, 'media', 'fig1.png'))).toBe(true);
  });
});
