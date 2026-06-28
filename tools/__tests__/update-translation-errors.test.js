import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { updateTranslationErrors } from '../lib/update-translation-errors.js';

// A minimal CNXML module. Same tag structure in source/translated => "perfect".
const SOURCE =
  '<document><title>Water</title><para id="p1"><emphasis>solid</emphasis></para></document>';
const PERFECT =
  '<document><title>Vatn</title><para id="p1"><emphasis>fast</emphasis></para></document>';
// Drops the <emphasis> => one discrepancy.
const DISCREPANT = '<document><title>Vatn</title><para id="p1">fast</para></document>';

describe('updateTranslationErrors', () => {
  let bookDir;

  /** Write a source module, and optionally its translated counterpart. */
  function writeModule(chapter, moduleId, translatedCnxml, track = 'mt-preview') {
    const src = path.join(bookDir, '01-source', chapter, `${moduleId}.cnxml`);
    fs.mkdirSync(path.dirname(src), { recursive: true });
    fs.writeFileSync(src, SOURCE);
    if (translatedCnxml) {
      const trans = path.join(bookDir, '03-translated', track, chapter, `${moduleId}.cnxml`);
      fs.mkdirSync(path.dirname(trans), { recursive: true });
      fs.writeFileSync(trans, translatedCnxml);
    }
  }

  function readManifest() {
    return JSON.parse(fs.readFileSync(path.join(bookDir, 'translation-errors.json'), 'utf8'));
  }

  beforeEach(() => {
    bookDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upd-trans-err-'));
  });

  afterEach(() => {
    fs.rmSync(bookDir, { recursive: true, force: true });
  });

  it('counts un-injected source modules as skipped, not dropped', () => {
    writeModule('ch01', 'm1', PERFECT);
    writeModule('ch01', 'm2', PERFECT);
    writeModule('ch01', 'm3', null); // un-injected: source exists, no translated file

    updateTranslationErrors(bookDir);
    const summary = readManifest().tracks['mt-preview'].summary;

    expect(summary.totalSourceModules).toBe(3);
    expect(summary.totalChecked).toBe(2);
    expect(summary.skippedUntranslated).toBe(1);
  });

  it('keeps totalChecked + skippedUntranslated === totalSourceModules', () => {
    writeModule('ch01', 'm1', PERFECT);
    writeModule('ch01', 'm2', null);
    writeModule('ch02', 'm3', DISCREPANT);
    writeModule('ch02', 'm4', null);

    updateTranslationErrors(bookDir);
    const s = readManifest().tracks['mt-preview'].summary;

    expect(s.totalChecked + s.skippedUntranslated).toBe(s.totalSourceModules);
    expect(s.totalSourceModules).toBe(4);
  });

  it('marks a track non-green when modules are skipped, even with zero discrepancies', () => {
    writeModule('ch01', 'm1', PERFECT); // perfect, no discrepancy
    writeModule('ch01', 'm2', null); // but one un-injected module remains

    updateTranslationErrors(bookDir);
    expect(readManifest().tracks['mt-preview'].summary.green).toBe(false);
  });

  it('marks a track green when every source module is checked and perfect', () => {
    writeModule('ch01', 'm1', PERFECT);
    writeModule('ch01', 'm2', PERFECT);

    updateTranslationErrors(bookDir);
    const s = readManifest().tracks['mt-preview'].summary;

    expect(s.skippedUntranslated).toBe(0);
    expect(s.green).toBe(true);
  });

  it('preserves another track section instead of clobbering it', () => {
    writeModule('ch01', 'm1', PERFECT, 'mt-preview');
    updateTranslationErrors(bookDir, { track: 'mt-preview' });

    // A later faithful inject must not wipe the mt-preview record.
    writeModule('ch01', 'm1', PERFECT, 'faithful');
    updateTranslationErrors(bookDir, { track: 'faithful' });

    const manifest = readManifest();
    expect(manifest.tracks['mt-preview']).toBeDefined();
    expect(manifest.tracks['faithful']).toBeDefined();
    expect(manifest.tracks['mt-preview'].summary.totalChecked).toBe(1);
  });

  it('tolerates a legacy flat-shape manifest without crashing', () => {
    // The committed manifests are the old flat shape (summary/modules at top level).
    fs.writeFileSync(
      path.join(bookDir, 'translation-errors.json'),
      JSON.stringify({ summary: { totalChecked: 9, perfect: 9 }, modules: [] })
    );
    writeModule('ch01', 'm1', PERFECT);

    expect(() => updateTranslationErrors(bookDir)).not.toThrow();
    const manifest = readManifest();
    expect(manifest.tracks['mt-preview'].summary.totalChecked).toBe(1);
  });

  it('records the producing track and tool', () => {
    writeModule('ch01', 'm1', PERFECT);
    updateTranslationErrors(bookDir, { track: 'mt-preview', tool: 'cnxml-inject' });

    const section = readManifest().tracks['mt-preview'];
    expect(section.tool).toBe('cnxml-inject');
  });

  it('preserves the { perfect, withDiscrepancies, totalDiscrepancies } return shape', () => {
    writeModule('ch01', 'm1', PERFECT);
    writeModule('ch01', 'm2', DISCREPANT);

    const result = updateTranslationErrors(bookDir);
    expect(result).toMatchObject({
      perfect: 1,
      withDiscrepancies: 1,
      totalDiscrepancies: 1,
    });
  });
});
