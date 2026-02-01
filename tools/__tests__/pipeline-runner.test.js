/**
 * Tests for pipeline-runner.js - Pipeline orchestration
 *
 * Tests the pure functions used in the translation pipeline runner.
 */

import { describe, it, expect } from 'vitest';
import {
  parseArgs,
  getChapterModules,
  CHEMISTRY_2E_MODULES,
  getProjectRoot,
} from '../pipeline-runner.js';

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
// parseArgs() - CLI Argument Parsing
// ============================================================================

describe('parseArgs', () => {
  describe('default values', () => {
    it('returns defaults for empty args', () => {
      const result = parseArgs([]);
      expect(result.input).toBe(null);
      expect(result.outputDir).toBe('./pipeline-output');
      expect(result.book).toBe(null);
      expect(result.skipXliff).toBe(false);
      expect(result.skipProtect).toBe(false);
      expect(result.skipSplit).toBe(false);
      expect(result.verbose).toBe(false);
      expect(result.help).toBe(false);
      expect(result.listModules).toBe(false);
      expect(result.chapter).toBe(null);
      expect(result.assemble).toBe(false);
      expect(result.assembleTrack).toBe('faithful');
      expect(result.assembleOnly).toBe(false);
    });
  });

  describe('positional input', () => {
    it('parses module ID as input', () => {
      const result = parseArgs(['m68690']);
      expect(result.input).toBe('m68690');
    });

    it('parses file path as input', () => {
      const result = parseArgs(['./source/chapter.cnxml']);
      expect(result.input).toBe('./source/chapter.cnxml');
    });
  });

  describe('flag options', () => {
    it('parses -h flag', () => {
      const result = parseArgs(['-h']);
      expect(result.help).toBe(true);
    });

    it('parses --help flag', () => {
      const result = parseArgs(['--help']);
      expect(result.help).toBe(true);
    });

    it('parses --verbose flag', () => {
      const result = parseArgs(['--verbose']);
      expect(result.verbose).toBe(true);
    });

    it('parses --skip-xliff flag', () => {
      const result = parseArgs(['--skip-xliff']);
      expect(result.skipXliff).toBe(true);
    });

    it('parses --skip-protect flag', () => {
      const result = parseArgs(['--skip-protect']);
      expect(result.skipProtect).toBe(true);
    });

    it('parses --skip-split flag', () => {
      const result = parseArgs(['--skip-split']);
      expect(result.skipSplit).toBe(true);
    });

    it('parses --list-modules flag', () => {
      const result = parseArgs(['--list-modules']);
      expect(result.listModules).toBe(true);
    });

    it('parses --assemble flag', () => {
      const result = parseArgs(['--assemble']);
      expect(result.assemble).toBe(true);
    });

    it('parses --assemble-only flag', () => {
      const result = parseArgs(['--assemble-only']);
      expect(result.assembleOnly).toBe(true);
      expect(result.assemble).toBe(true); // Sets both
    });
  });

  describe('options with values', () => {
    it('parses --output-dir with value', () => {
      const result = parseArgs(['--output-dir', './custom-output']);
      expect(result.outputDir).toBe('./custom-output');
    });

    it('parses --book with value', () => {
      const result = parseArgs(['--book', 'efnafraedi']);
      expect(result.book).toBe('efnafraedi');
    });

    it('parses --chapter with numeric value', () => {
      const result = parseArgs(['--chapter', '5']);
      expect(result.chapter).toBe(5);
    });

    it('parses --assemble-track with value', () => {
      const result = parseArgs(['--assemble-track', 'mt-preview']);
      expect(result.assembleTrack).toBe('mt-preview');
    });
  });

  describe('combined arguments', () => {
    it('parses full conversion command', () => {
      const result = parseArgs([
        'm68690',
        '--output-dir',
        './output',
        '--book',
        'efnafraedi',
        '--verbose',
      ]);
      expect(result.input).toBe('m68690');
      expect(result.outputDir).toBe('./output');
      expect(result.book).toBe('efnafraedi');
      expect(result.verbose).toBe(true);
    });

    it('parses chapter mode with assembly', () => {
      const result = parseArgs([
        '--chapter',
        '1',
        '--book',
        'efnafraedi',
        '--assemble',
        '--assemble-track',
        'faithful',
      ]);
      expect(result.chapter).toBe(1);
      expect(result.book).toBe('efnafraedi');
      expect(result.assemble).toBe(true);
      expect(result.assembleTrack).toBe('faithful');
    });

    it('parses assembly-only mode', () => {
      const result = parseArgs([
        '--chapter',
        '5',
        '--assemble-only',
        '--assemble-track',
        'mt-preview',
      ]);
      expect(result.chapter).toBe(5);
      expect(result.assembleOnly).toBe(true);
      expect(result.assemble).toBe(true);
      expect(result.assembleTrack).toBe('mt-preview');
    });
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

// ============================================================================
// getProjectRoot() - Project Root Detection
// ============================================================================

describe('getProjectRoot', () => {
  it('returns a valid directory path', () => {
    const root = getProjectRoot();
    expect(typeof root).toBe('string');
    expect(root.length).toBeGreaterThan(0);
  });

  it('returns path containing tools directory', () => {
    const root = getProjectRoot();
    // Should find the project root which contains tools/
    expect(root).toContain('namsbokasafn-efni');
  });
});
