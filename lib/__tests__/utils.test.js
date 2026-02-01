/**
 * Tests for shared utility functions
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  parseArgs,
  validateChapter,
  ensureDirectory,
  padChapter,
  formatSection,
  readJsonFile,
  writeJsonFile,
  createBackup,
} from '../utils.js';

describe('parseArgs', () => {
  it('should parse boolean flags', () => {
    const schema = { flags: ['verbose', 'help', 'h'] };
    const result = parseArgs(['--verbose', '-h'], schema);

    expect(result.verbose).toBe(true);
    expect(result.h).toBe(true);
    expect(result.help).toBe(false);
  });

  it('should parse options with values', () => {
    const schema = {
      options: {
        output: { alias: 'o', default: null },
        chapter: { type: 'number' },
      },
    };
    const result = parseArgs(['--output', 'file.md', '--chapter', '5'], schema);

    expect(result.output).toBe('file.md');
    expect(result.chapter).toBe(5);
  });

  it('should handle aliases', () => {
    const schema = {
      options: {
        output: { alias: 'o', default: null },
      },
    };
    const result = parseArgs(['-o', 'output.txt'], schema);

    expect(result.output).toBe('output.txt');
  });

  it('should collect positional arguments', () => {
    const schema = { positional: ['input', 'output'] };
    const result = parseArgs(['input.txt', 'output.txt'], schema);

    expect(result.input).toBe('input.txt');
    expect(result.output).toBe('output.txt');
    expect(result._positional).toEqual(['input.txt', 'output.txt']);
  });

  it('should use default values', () => {
    const schema = {
      options: {
        output: { default: 'default.txt' },
      },
    };
    const result = parseArgs([], schema);

    expect(result.output).toBe('default.txt');
  });
});

describe('validateChapter', () => {
  it('should validate valid chapter numbers', () => {
    expect(validateChapter(1)).toEqual({ valid: true, chapter: 1 });
    expect(validateChapter(21)).toEqual({ valid: true, chapter: 21 });
    expect(validateChapter('5')).toEqual({ valid: true, chapter: 5 });
  });

  it('should reject invalid chapter numbers', () => {
    expect(validateChapter(0).valid).toBe(false);
    expect(validateChapter(22).valid).toBe(false);
    expect(validateChapter(-1).valid).toBe(false);
    expect(validateChapter('abc').valid).toBe(false);
  });

  it('should respect custom max', () => {
    expect(validateChapter(25, 30)).toEqual({ valid: true, chapter: 25 });
    expect(validateChapter(25, 20).valid).toBe(false);
  });
});

describe('padChapter', () => {
  it('should pad single digit chapters', () => {
    expect(padChapter(1)).toBe('01');
    expect(padChapter(9)).toBe('09');
  });

  it('should not pad double digit chapters', () => {
    expect(padChapter(10)).toBe('10');
    expect(padChapter(21)).toBe('21');
  });
});

describe('formatSection', () => {
  it('should format regular sections', () => {
    expect(formatSection(1, 1)).toBe('1-1');
    expect(formatSection(5, 3)).toBe('5-3');
  });

  it('should format intro sections', () => {
    expect(formatSection(1, 'intro')).toBe('1-intro');
    expect(formatSection(5, 'intro')).toBe('5-intro');
  });
});

describe('file operations', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true });
  });

  describe('ensureDirectory', () => {
    it('should create nested directories', () => {
      const nestedDir = path.join(tempDir, 'a', 'b', 'c');
      ensureDirectory(nestedDir);
      expect(fs.existsSync(nestedDir)).toBe(true);
    });

    it('should return true for existing directories', () => {
      expect(ensureDirectory(tempDir)).toBe(true);
    });
  });

  describe('readJsonFile', () => {
    it('should read valid JSON files', () => {
      const jsonPath = path.join(tempDir, 'test.json');
      fs.writeFileSync(jsonPath, '{"key": "value"}');

      const result = readJsonFile(jsonPath);
      expect(result).toEqual({ key: 'value' });
    });

    it('should return null for missing files', () => {
      const result = readJsonFile(path.join(tempDir, 'missing.json'));
      expect(result).toBeNull();
    });

    it('should return null for invalid JSON', () => {
      const jsonPath = path.join(tempDir, 'invalid.json');
      fs.writeFileSync(jsonPath, 'not json');

      const result = readJsonFile(jsonPath);
      expect(result).toBeNull();
    });
  });

  describe('writeJsonFile', () => {
    it('should write formatted JSON', () => {
      const jsonPath = path.join(tempDir, 'output.json');
      writeJsonFile(jsonPath, { key: 'value' });

      const content = fs.readFileSync(jsonPath, 'utf-8');
      expect(content).toBe('{\n  "key": "value"\n}\n');
    });

    it('should create parent directories', () => {
      const jsonPath = path.join(tempDir, 'nested', 'output.json');
      writeJsonFile(jsonPath, { test: true });

      expect(fs.existsSync(jsonPath)).toBe(true);
    });
  });

  describe('createBackup', () => {
    it('should create timestamped backup', () => {
      const filePath = path.join(tempDir, 'original.txt');
      fs.writeFileSync(filePath, 'original content');

      const backupPath = createBackup(filePath);

      expect(backupPath).not.toBeNull();
      expect(fs.existsSync(backupPath)).toBe(true);
      expect(backupPath).toMatch(/\.bak$/);
      expect(fs.readFileSync(backupPath, 'utf-8')).toBe('original content');
    });

    it('should return null for missing files', () => {
      const result = createBackup(path.join(tempDir, 'missing.txt'));
      expect(result).toBeNull();
    });
  });
});
