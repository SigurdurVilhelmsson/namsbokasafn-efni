import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { parseCollectionXml, organizeSourceFiles } from '../download-source.js';

const TMP = join(import.meta.dirname, '..', '..', '.tmp', 'test-source-downloader');

// Minimal collection.xml that mirrors OpenStax structure
const SAMPLE_COLLECTION_XML = `<?xml version="1.0" encoding="UTF-8"?>
<col:collection xmlns:col="http://cnx.rice.edu/collxml" xmlns:md="http://cnx.rice.edu/mdml">
  <col:metadata>
    <md:title>Test Chemistry Book</md:title>
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

describe('organizeSourceFiles', () => {
  const extractedDir = join(TMP, 'extracted');
  const sourceDir = join(TMP, 'source');

  beforeEach(() => {
    rmSync(TMP, { recursive: true, force: true });

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
    const result = organizeSourceFiles({ extractedDir, sourceDir, structure, verbose: false });

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
    const result = organizeSourceFiles({ extractedDir, sourceDir, structure, verbose: false });

    expect(existsSync(join(sourceDir, 'media', 'fig1.png'))).toBe(true);
    expect(existsSync(join(sourceDir, 'media', 'fig2.jpg'))).toBe(true);
    expect(existsSync(join(sourceDir, 'media', 'eq1.svg'))).toBe(true);
    expect(result.mediaCount).toBe(3);
  });

  it('should warn about missing modules but continue', () => {
    // Remove one module from the extracted files
    rmSync(join(extractedDir, 'modules', 'm68665'), { recursive: true });

    const structure = parseCollectionXml(SAMPLE_COLLECTION_XML);
    const result = organizeSourceFiles({ extractedDir, sourceDir, structure, verbose: false });

    // Should still process all other modules
    expect(result.moduleCount).toBe(8);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('m68665');
    expect(result.warnings[0]).toContain('not found');
  });

  it('should preserve CNXML content in copied files', () => {
    const structure = parseCollectionXml(SAMPLE_COLLECTION_XML);
    organizeSourceFiles({ extractedDir, sourceDir, structure, verbose: false });

    const content = readFileSync(join(sourceDir, 'ch01', 'm68663.cnxml'), 'utf8');
    expect(content).toContain('<document id="m68663">');
    expect(content).toContain('<title>Module m68663</title>');
  });

  it('should handle empty media directory gracefully', () => {
    rmSync(join(extractedDir, 'media'), { recursive: true });

    const structure = parseCollectionXml(SAMPLE_COLLECTION_XML);
    const result = organizeSourceFiles({ extractedDir, sourceDir, structure, verbose: false });

    expect(result.mediaCount).toBe(0);
    expect(result.moduleCount).toBe(9);
  });
});
