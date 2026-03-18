import { describe, it, expect } from 'vitest';
import {
  normalizeUnicode,
  repairSegTags,
  loadEnvFile,
  discoverModules,
  validateMarkers,
  bookToDomain,
  loadGlossary,
} from '../api-translate.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ─── normalizeUnicode ───────────────────────────────────────────────

describe('normalizeUnicode', () => {
  it('converts Unicode subscript digits to ~N~ format', () => {
    expect(normalizeUnicode('H₂O')).toBe('H~2~O');
    expect(normalizeUnicode('CO₂')).toBe('CO~2~');
    expect(normalizeUnicode('C₆H₁₂O₆')).toBe('C~6~H~12~O~6~');
  });

  it('converts Unicode superscript digits to ^N^ format', () => {
    expect(normalizeUnicode('10⁵')).toBe('10^5^');
    expect(normalizeUnicode('x²')).toBe('x^2^');
    expect(normalizeUnicode('10⁻⁶')).toBe('10^-6^');
  });

  it('converts subscript operators', () => {
    expect(normalizeUnicode('A₊B₋')).toBe('A~+~B~-~');
  });

  it('converts superscript operators', () => {
    expect(normalizeUnicode('x⁺y⁻')).toBe('x^+^y^-^');
  });

  it('groups mixed subscript digits and operators', () => {
    expect(normalizeUnicode('A₁₊₂')).toBe('A~1+2~');
  });

  it('leaves normal text unchanged', () => {
    expect(normalizeUnicode('Hello world')).toBe('Hello world');
  });

  it('leaves existing ~N~ and ^N^ markers unchanged', () => {
    expect(normalizeUnicode('H~2~O and 10^5^')).toBe('H~2~O and 10^5^');
  });

  it('handles mixed content with markers and Unicode', () => {
    expect(normalizeUnicode('<!-- SEG:m68674:para:1 --> H₂O is [[MATH:1]] 10⁵ kg')).toBe(
      '<!-- SEG:m68674:para:1 --> H~2~O is [[MATH:1]] 10^5^ kg'
    );
  });

  it('groups consecutive subscript digits', () => {
    expect(normalizeUnicode('x₁₂₃')).toBe('x~123~');
  });

  it('groups consecutive superscript digits', () => {
    expect(normalizeUnicode('x¹²³')).toBe('x^123^');
  });
});

// ─── loadEnvFile ────────────────────────────────────────────────────

describe('loadEnvFile', () => {
  it('parses KEY=VALUE lines from .env content', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-test-'));
    const envPath = path.join(tmpDir, '.env');
    fs.writeFileSync(envPath, 'FOO=bar\nBAZ=qux\n');
    const vars = loadEnvFile(envPath);
    expect(vars).toEqual({ FOO: 'bar', BAZ: 'qux' });
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('skips comments and empty lines', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-test-'));
    const envPath = path.join(tmpDir, '.env');
    fs.writeFileSync(envPath, '# comment\n\nKEY=value\n  \n');
    const vars = loadEnvFile(envPath);
    expect(vars).toEqual({ KEY: 'value' });
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('strips surrounding quotes from values', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-test-'));
    const envPath = path.join(tmpDir, '.env');
    fs.writeFileSync(envPath, 'KEY="quoted value"\nKEY2=\'single\'\n');
    const vars = loadEnvFile(envPath);
    expect(vars).toEqual({ KEY: 'quoted value', KEY2: 'single' });
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns empty object for missing file', () => {
    expect(loadEnvFile('/nonexistent/.env')).toEqual({});
  });
});

// ─── discoverModules ────────────────────────────────────────────────

describe('discoverModules', () => {
  it('finds primary .en.md files and excludes splits', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'discover-'));
    fs.writeFileSync(path.join(tmpDir, 'm68664-segments.en.md'), 'content');
    fs.writeFileSync(path.join(tmpDir, 'm68667-segments.en.md'), 'content');
    fs.writeFileSync(path.join(tmpDir, 'm68667-segments(b).en.md'), 'split');
    fs.writeFileSync(path.join(tmpDir, 'm68664-segments-links.json'), '{}');

    const modules = discoverModules(tmpDir);
    expect(modules).toHaveLength(2);
    expect(modules.map((m) => m.moduleId)).toEqual(['m68664', 'm68667']);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns empty array for nonexistent directory', () => {
    expect(discoverModules('/nonexistent')).toEqual([]);
  });
});

// ─── validateMarkers ────────────────────────────────────────────────

describe('validateMarkers', () => {
  it('returns true when marker counts match', () => {
    const input = '<!-- SEG:a:b:1 --> text\n\n<!-- SEG:a:b:2 --> more';
    const output = '<!-- SEG:a:b:1 --> texti\n\n<!-- SEG:a:b:2 --> meira';
    expect(validateMarkers(input, output)).toBe(true);
  });

  it('returns false when output has fewer markers', () => {
    const input = '<!-- SEG:a:b:1 --> text\n\n<!-- SEG:a:b:2 --> more';
    const output = '<!-- SEG:a:b:1 --> texti';
    expect(validateMarkers(input, output)).toBe(false);
  });
});

// ─── bookToDomain ───────────────────────────────────────────────────

describe('bookToDomain', () => {
  it('maps efnafraedi to chemistry', () => {
    expect(bookToDomain('efnafraedi-2e')).toBe('chemistry');
  });

  it('maps liffraedi to biology', () => {
    expect(bookToDomain('liffraedi-2e')).toBe('biology');
  });

  it('maps orverufraedi to microbiology', () => {
    expect(bookToDomain('orverufraedi')).toBe('microbiology');
  });

  it('returns generic for unknown books', () => {
    expect(bookToDomain('unknown-book')).toBe('science');
  });
});

// ─── loadGlossary ───────────────────────────────────────────────────

describe('loadGlossary', () => {
  it('loads approved terms and formats as API glossary', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glossary-'));
    const glossary = {
      terms: [
        { english: 'atom', icelandic: 'atóm', status: 'approved' },
        { english: 'ion', icelandic: 'jón', status: 'proposed' },
        { english: 'acid', icelandic: 'sýra', status: 'approved' },
      ],
    };
    fs.writeFileSync(path.join(tmpDir, 'glossary-unified.json'), JSON.stringify(glossary));

    const result = loadGlossary(tmpDir, 'chemistry');
    expect(result.terms).toHaveLength(2);
    expect(result.terms[0]).toEqual({ sourceWord: 'atom', targetWord: 'atóm' });
    expect(result.domain).toBe('chemistry');
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns null when glossary file is missing', () => {
    expect(loadGlossary('/nonexistent', 'chemistry')).toBeNull();
  });

  it('returns null when no approved terms exist', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glossary-'));
    const glossary = {
      terms: [{ english: 'ion', icelandic: 'jón', status: 'proposed' }],
    };
    fs.writeFileSync(path.join(tmpDir, 'glossary-unified.json'), JSON.stringify(glossary));

    const result = loadGlossary(tmpDir, 'chemistry');
    expect(result).toBeNull();
    fs.rmSync(tmpDir, { recursive: true });
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────────

describe('validateMarkers edge cases', () => {
  it('rejects truncated output (3 markers → 1)', () => {
    const input = '<!-- SEG:a:b:1 --> hello\n\n<!-- SEG:a:b:2 --> world\n\n<!-- SEG:a:b:3 --> end';
    const truncated = '<!-- SEG:a:b:1 --> hæ';
    expect(validateMarkers(input, truncated)).toBe(false);
  });

  it('accepts output with same marker count', () => {
    const input = '<!-- SEG:a:b:1 --> hello\n\n<!-- SEG:a:b:2 --> world';
    const output = '<!-- SEG:a:b:1 --> hæ\n\n<!-- SEG:a:b:2 --> heimur';
    expect(validateMarkers(input, output)).toBe(true);
  });

  it('handles input with zero markers', () => {
    expect(validateMarkers('no markers here', 'engin merki hér')).toBe(true);
  });
});

describe('skip-existing logic', () => {
  it('discoverModules finds files that need translation vs already done', () => {
    const inputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'input-'));
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'output-'));

    // Two modules in input
    fs.writeFileSync(path.join(inputDir, 'm68664-segments.en.md'), 'content');
    fs.writeFileSync(path.join(inputDir, 'm68667-segments.en.md'), 'content');

    // One already translated
    fs.writeFileSync(path.join(outputDir, 'm68664-segments.is.md'), 'translated');

    const modules = discoverModules(inputDir);
    const needsTranslation = modules.filter((m) => {
      const outputPath = path.join(outputDir, m.filename.replace('.en.md', '.is.md'));
      return !fs.existsSync(outputPath);
    });

    expect(modules).toHaveLength(2);
    expect(needsTranslation).toHaveLength(1);
    expect(needsTranslation[0].moduleId).toBe('m68667');

    fs.rmSync(inputDir, { recursive: true });
    fs.rmSync(outputDir, { recursive: true });
  });
});

// ─── SEG Tag Repair ─────────────────────────────────────────────────

describe('repairSegTags', () => {
  it('fixes hyphenated module IDs in SEG tags', () => {
    const input = '<!-- SEG:m68683:para:1 --> Hello\n\n<!-- SEG:m68683:para:2 --> World';
    const output = '<!-- SEG:m6-8683:para:1 --> Hæ\n\n<!-- SEG:m68683:para:2 --> Heimur';
    expect(repairSegTags(input, output)).toBe(
      '<!-- SEG:m68683:para:1 --> Hæ\n\n<!-- SEG:m68683:para:2 --> Heimur'
    );
  });

  it('leaves correct SEG tags unchanged', () => {
    const input = '<!-- SEG:m68664:title:auto-1 --> Hello';
    const output = '<!-- SEG:m68664:title:auto-1 --> Hæ';
    expect(repairSegTags(input, output)).toBe(output);
  });

  it('handles multiple corrupted tags', () => {
    const input = '<!-- SEG:m68683:a:1 -->\n<!-- SEG:m68683:b:2 -->';
    const output = '<!-- SEG:m6-8683:a:1 -->\n<!-- SEG:m-68683:b:2 -->';
    const result = repairSegTags(input, output);
    expect(result).toContain('<!-- SEG:m68683:a:1 -->');
    expect(result).toContain('<!-- SEG:m68683:b:2 -->');
  });

  it('does not modify tags that cannot be matched', () => {
    const input = '<!-- SEG:m68664:para:1 --> Hello';
    const output = '<!-- SEG:m99999:para:1 --> Hæ';
    expect(repairSegTags(input, output)).toBe(output);
  });
});
