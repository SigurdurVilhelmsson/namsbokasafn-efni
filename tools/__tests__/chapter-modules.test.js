/**
 * Tests for tools/lib/chapter-modules.js - Module mappings and chapter lookup
 *
 * Extracted from pipeline-runner.test.js alongside the code extraction.
 * Post D1 PR-B: getChapterModules requires a book with collection-order.json
 * (no chemistry fallback). Uses the real efnafraedi-2e collection.
 */

import { describe, it, expect } from 'vitest';
import { getChapterModules } from '../lib/chapter-modules.js';

const BOOK = 'efnafraedi-2e';

// ============================================================================
// getChapterModules() - Chapter Module Filtering
// ============================================================================

describe('getChapterModules', () => {
  describe('chapter 1', () => {
    it('returns modules for chapter 1', () => {
      const modules = getChapterModules(1, BOOK);
      expect(modules.length).toBeGreaterThan(0);
      expect(modules.every((m) => m.chapter === 1)).toBe(true);
    });

    it('puts intro section first', () => {
      const modules = getChapterModules(1, BOOK);
      expect(modules[0].section).toBe('intro');
    });

    it('sorts sections numerically after intro', () => {
      const modules = getChapterModules(1, BOOK);
      const sections = modules.map((m) => m.section);
      expect(sections[0]).toBe('intro');
      expect(sections[1]).toBe('1.1');
      expect(sections[2]).toBe('1.2');
    });
  });

  describe('chapter 5', () => {
    it('returns modules for chapter 5', () => {
      const modules = getChapterModules(5, BOOK);
      expect(modules.length).toBeGreaterThan(0);
      expect(modules.every((m) => m.chapter === 5)).toBe(true);
    });

    it('includes expected sections', () => {
      const modules = getChapterModules(5, BOOK);
      const sections = modules.map((m) => m.section);
      expect(sections).toContain('intro');
      expect(sections).toContain('5.1');
      expect(sections).toContain('5.2');
      expect(sections).toContain('5.3');
    });
  });

  describe('non-existent chapter', () => {
    it('returns empty array for chapter 99 of a valid book', () => {
      const modules = getChapterModules(99, BOOK);
      expect(modules).toEqual([]);
    });
  });

  describe('module structure', () => {
    it('each module has moduleId and info fields', () => {
      const modules = getChapterModules(1, BOOK);
      for (const mod of modules) {
        expect(mod).toHaveProperty('moduleId');
        expect(mod).toHaveProperty('chapter');
        expect(mod).toHaveProperty('section');
        expect(mod).toHaveProperty('title');
        expect(mod.moduleId).toMatch(/^m\d+$/);
      }
    });
  });

  describe('fail-loud (no chemistry fallback)', () => {
    it('throws when no collection-order resolves for the book', () => {
      expect(() => getChapterModules(1, 'no-such-book-xyz')).toThrow(/collection-order/);
    });

    it('throws when no --book was given', () => {
      expect(() => getChapterModules(1)).toThrow(/collection-order/);
    });
  });
});
