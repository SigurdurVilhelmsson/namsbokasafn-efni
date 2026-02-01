/**
 * Tests for shared constants
 */

import { describe, it, expect } from 'vitest';
import {
  CHEMISTRY_2E_MODULES,
  VALID_TRACKS,
  TRACK_LABELS,
  getModulesForChapter,
  getModuleInfo,
  listChapters,
} from '../constants.js';

describe('CHEMISTRY_2E_MODULES', () => {
  it('should have the correct structure', () => {
    const module = CHEMISTRY_2E_MODULES['m68664'];
    expect(module).toBeDefined();
    expect(module.chapter).toBe(1);
    expect(module.section).toBe('1.1');
    expect(module.title).toBe('Chemistry in Context');
  });

  it('should include intro modules', () => {
    const intro = CHEMISTRY_2E_MODULES['m68663'];
    expect(intro.section).toBe('intro');
  });
});

describe('VALID_TRACKS', () => {
  it('should include all valid publication tracks', () => {
    expect(VALID_TRACKS).toContain('mt-preview');
    expect(VALID_TRACKS).toContain('faithful');
    expect(VALID_TRACKS).toContain('localized');
    expect(VALID_TRACKS).toHaveLength(3);
  });
});

describe('TRACK_LABELS', () => {
  it('should have labels for all valid tracks', () => {
    for (const track of VALID_TRACKS) {
      expect(TRACK_LABELS[track]).toBeDefined();
      expect(typeof TRACK_LABELS[track]).toBe('string');
    }
  });
});

describe('getModulesForChapter', () => {
  it('should return all modules for a chapter', () => {
    const chapter1 = getModulesForChapter(1);
    const moduleIds = Object.keys(chapter1);

    expect(moduleIds.length).toBeGreaterThan(0);

    for (const [id, info] of Object.entries(chapter1)) {
      expect(info.chapter).toBe(1);
      expect(id).toMatch(/^m\d+$/);
    }
  });

  it('should return empty object for non-existent chapter', () => {
    const chapter99 = getModulesForChapter(99);
    expect(Object.keys(chapter99)).toHaveLength(0);
  });
});

describe('getModuleInfo', () => {
  it('should return module info for valid ID', () => {
    const info = getModuleInfo('m68664');
    expect(info).not.toBeNull();
    expect(info.chapter).toBe(1);
  });

  it('should return null for invalid ID', () => {
    const info = getModuleInfo('invalid');
    expect(info).toBeNull();
  });
});

describe('listChapters', () => {
  it('should return sorted array of chapter numbers', () => {
    const chapters = listChapters();

    expect(Array.isArray(chapters)).toBe(true);
    expect(chapters.length).toBeGreaterThan(0);

    // Check it's sorted
    for (let i = 1; i < chapters.length; i++) {
      expect(chapters[i]).toBeGreaterThan(chapters[i - 1]);
    }
  });

  it('should include known chapters', () => {
    const chapters = listChapters();
    expect(chapters).toContain(1);
    expect(chapters).toContain(5);
  });
});
