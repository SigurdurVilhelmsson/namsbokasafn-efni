/**
 * Tests for tools/lib/chapter-modules.js - Module mappings and chapter lookup
 *
 * Extracted from pipeline-runner.test.js alongside the code extraction.
 */

import { describe, it, expect } from 'vitest';
import { getChapterModules, CHEMISTRY_2E_MODULES } from '../lib/chapter-modules.js';

// ============================================================================
// CHEMISTRY_2E_MODULES - Data Integrity
// ============================================================================

describe('CHEMISTRY_2E_MODULES', () => {
  it('contains expected module entries', () => {
    expect(Object.keys(CHEMISTRY_2E_MODULES).length).toBeGreaterThan(30);
  });

  it('has valid module IDs (m##### format)', () => {
    for (const moduleId of Object.keys(CHEMISTRY_2E_MODULES)) {
      expect(moduleId).toMatch(/^m\d{5}$/);
    }
  });

  it('each module has required fields', () => {
    for (const info of Object.values(CHEMISTRY_2E_MODULES)) {
      expect(info).toHaveProperty('chapter');
      expect(info).toHaveProperty('section');
      expect(info).toHaveProperty('title');
      expect(typeof info.chapter).toBe('number');
      expect(typeof info.section).toBe('string');
      expect(typeof info.title).toBe('string');
    }
  });

  it('has modules for chapters 1-5', () => {
    const chapters = new Set(Object.values(CHEMISTRY_2E_MODULES).map((m) => m.chapter));
    expect(chapters.has(1)).toBe(true);
    expect(chapters.has(2)).toBe(true);
    expect(chapters.has(3)).toBe(true);
    expect(chapters.has(4)).toBe(true);
    expect(chapters.has(5)).toBe(true);
  });

  it('has intro section for each chapter', () => {
    const chaptersWithIntro = new Set(
      Object.values(CHEMISTRY_2E_MODULES)
        .filter((m) => m.section === 'intro')
        .map((m) => m.chapter)
    );
    expect(chaptersWithIntro.has(1)).toBe(true);
    expect(chaptersWithIntro.has(2)).toBe(true);
    expect(chaptersWithIntro.has(3)).toBe(true);
  });
});

// ============================================================================
// getChapterModules() - Chapter Module Filtering
// ============================================================================

describe('getChapterModules', () => {
  describe('chapter 1', () => {
    it('returns modules for chapter 1', () => {
      const modules = getChapterModules(1);
      expect(modules.length).toBeGreaterThan(0);
      expect(modules.every((m) => m.chapter === 1)).toBe(true);
    });

    it('puts intro section first', () => {
      const modules = getChapterModules(1);
      expect(modules[0].section).toBe('intro');
    });

    it('sorts sections numerically after intro', () => {
      const modules = getChapterModules(1);
      const sections = modules.map((m) => m.section);
      expect(sections[0]).toBe('intro');
      expect(sections[1]).toBe('1.1');
      expect(sections[2]).toBe('1.2');
    });
  });

  describe('chapter 5', () => {
    it('returns modules for chapter 5', () => {
      const modules = getChapterModules(5);
      expect(modules.length).toBeGreaterThan(0);
      expect(modules.every((m) => m.chapter === 5)).toBe(true);
    });

    it('includes expected sections', () => {
      const modules = getChapterModules(5);
      const sections = modules.map((m) => m.section);
      expect(sections).toContain('intro');
      expect(sections).toContain('5.1');
      expect(sections).toContain('5.2');
      expect(sections).toContain('5.3');
    });
  });

  describe('non-existent chapter', () => {
    it('returns empty array for chapter 99', () => {
      const modules = getChapterModules(99);
      expect(modules).toEqual([]);
    });
  });

  describe('module structure', () => {
    it('each module has moduleId and info fields', () => {
      const modules = getChapterModules(1);
      for (const mod of modules) {
        expect(mod).toHaveProperty('moduleId');
        expect(mod).toHaveProperty('chapter');
        expect(mod).toHaveProperty('section');
        expect(mod).toHaveProperty('title');
        expect(mod.moduleId).toMatch(/^m\d+$/);
      }
    });
  });
});
