import { describe, it, expect } from 'vitest';
import {
  normalizeUnicode,
  repairSegTags,
  filterGlossaryForText,
  SHORT_HEADWORD_MAX_LEN,
  loadEnvFile,
  discoverModules,
  validateMarkers,
  countInlineMarkers,
  normalizeSegMarkers,
  bookToDomain,
  loadGlossary,
  splitAtSegBoundaries,
  assertNoControlChars,
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

// ─── inline-marker detection & normalization ────────────────────────

describe('countInlineMarkers', () => {
  it('returns 0 when every marker starts its own line', () => {
    const text = '<!-- SEG:m1:title:t -->\nTitle\n\n<!-- SEG:m1:para:p -->\nBody';
    expect(countInlineMarkers(text)).toBe(0);
  });

  it('counts a marker the API glued onto the previous segment text', () => {
    const text = '<!-- SEG:m1:note-title:t -->\nCounting Molecules<!-- SEG:m1:para:p -->\nBody';
    expect(countInlineMarkers(text)).toBe(1);
  });

  it('ignores a marker at the very start of the file', () => {
    expect(countInlineMarkers('<!-- SEG:m1:title:t -->\nTitle')).toBe(0);
  });
});

describe('normalizeSegMarkers', () => {
  it('is a no-op for well-formed output', () => {
    const text = '<!-- SEG:m1:title:t -->\nTitle\n\n<!-- SEG:m1:para:p -->\nBody';
    const { text: out, fixed } = normalizeSegMarkers(text);
    expect(fixed).toBe(0);
    expect(out).toBe(text);
  });

  it('moves a glued marker onto its own line without losing content or markers', () => {
    const text = '<!-- SEG:m1:note-title:t -->\nCounting Molecules<!-- SEG:m1:para:p -->\nBody';
    const { text: out, fixed } = normalizeSegMarkers(text);
    expect(fixed).toBe(1);
    // marker count preserved
    expect(validateMarkers(text, out)).toBe(true);
    // no inline markers remain
    expect(countInlineMarkers(out)).toBe(0);
    // pre-marker content is preserved as the note-title's content
    expect(out).toContain('Counting Molecules\n\n<!-- SEG:m1:para:p -->');
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

  it('repairs a suffix match when digit overlap is ≥80%', () => {
    // original module digits "686671" (6), corrupted drops one → "68667" (5):
    // 5/6 ≈ 0.83, and "686671" contains "68667" → repair via suffix.
    const input = '<!-- SEG:m686671:para:fs-idX --> Hello';
    const output = '<!-- SEG:m68667:para:fs-idX --> Hæ';
    expect(repairSegTags(input, output)).toBe('<!-- SEG:m686671:para:fs-idX --> Hæ');
  });

  it('does NOT repair a suffix match when digit overlap is <80% (F23)', () => {
    // corrupted module "m6" shares only a single digit with "m68667" (1/5=0.2);
    // the suffix matches but the modules are unrelated — leave it untouched.
    const input = '<!-- SEG:m68667:para:fs-idX --> Hello';
    const output = '<!-- SEG:m6:para:fs-idX --> Hæ';
    expect(repairSegTags(input, output)).toBe(output);
  });
});

// ─── Glossary Filtering ─────────────────────────────────────────────

describe('filterGlossaryForText', () => {
  const fullGlossary = {
    domain: 'chemistry',
    sourceLanguage: 'en',
    targetLanguage: 'is',
    terms: [
      { sourceWord: 'molecule', targetWord: 'sameind' },
      { sourceWord: 'atom', targetWord: 'atóm' },
      { sourceWord: 'acid', targetWord: 'sýra' },
      { sourceWord: 'electronegativity', targetWord: 'rafneikvæðni' },
      { sourceWord: 'stoichiometry', targetWord: 'hlutfallaefnafræði' },
    ],
  };

  it('keeps only terms found in the text', () => {
    const text = 'The molecule bonds with an acid to form a compound.';
    const filtered = filterGlossaryForText(fullGlossary, text);
    expect(filtered.terms).toHaveLength(2);
    expect(filtered.terms.map((t) => t.sourceWord)).toEqual(['molecule', 'acid']);
  });

  it('matches case-insensitively', () => {
    const text = 'ELECTRONEGATIVITY increases across a period.';
    const filtered = filterGlossaryForText(fullGlossary, text);
    expect(filtered.terms).toHaveLength(1);
    expect(filtered.terms[0].sourceWord).toBe('electronegativity');
  });

  it('returns null when no terms match', () => {
    const text = 'The weather is nice today.';
    expect(filterGlossaryForText(fullGlossary, text)).toBeNull();
  });

  it('returns null for null glossary', () => {
    expect(filterGlossaryForText(null, 'some text')).toBeNull();
  });

  it('preserves glossary metadata', () => {
    const text = 'An atom has a nucleus.';
    const filtered = filterGlossaryForText(fullGlossary, text);
    expect(filtered.domain).toBe('chemistry');
    expect(filtered.sourceLanguage).toBe('en');
    expect(filtered.targetLanguage).toBe('is');
  });
});

// ─── splitAtSegBoundaries ──────────────────────────────────────────

/**
 * §C82 L142 / §C116 — the short-headword matching rule.
 *
 * The defect: `filterGlossaryForText` was `lowerText.includes(sourceWord.toLowerCase())`, so
 * `As → arsen` reached the paid MT wherever the letters *as* appeared AT ALL. Measured over
 * efnafraedi-2e's 4.00M chars of `02-for-mt`: `Ti → títan` was sent for 218 of 219 files and
 * `Se → selen` for 219 of 219; the rule below takes them to 9 and 21. Whole-corpus term-file
 * pairs on the wire drop 37,311 → 27,549 (26.2%) with no long headword changing at all.
 */
describe('filterGlossaryForText — short headwords are case-sensitive and word-bounded', () => {
  const G = (...pairs) => ({
    domain: 'chemistry',
    terms: pairs.map(([sourceWord, targetWord]) => ({ sourceWord, targetWord })),
  });
  const hits = (glossary, text) => {
    const f = filterGlossaryForText(glossary, text);
    return f ? f.terms.map((t) => t.sourceWord) : [];
  };

  it('does NOT send an element symbol for a lowercase English word — the founding defect', () => {
    // "as" and "at" are ordinary English; `As`/`At` are arsenic and astatine.
    expect(hits(G(['As', 'arsen'], ['At', 'astat']), 'Water, as we saw at the start.')).toEqual([]);
  });

  it('DOES send it when the symbol genuinely appears — the positive control', () => {
    // Without this, the test above passes for a rule that matches nothing at all.
    expect(hits(G(['As', 'arsen'], ['At', 'astat']), 'The sample contained As and At.')).toEqual([
      'As',
      'At',
    ]);
  });

  it('does not fire on a symbol embedded in a longer token', () => {
    // `Cl` inside NaCl is part of a formula, not a standalone label.
    expect(hits(G(['Cl', 'klór']), 'Dissolve NaCl in water.')).toEqual([]);
    expect(hits(G(['Cl', 'klór']), 'Cl is a halogen.')).toEqual(['Cl']); // control
  });

  it('does not fire on letters buried inside ordinary words', () => {
    // `Ti` was reaching 218 of 219 corpus files this way (multiplication, ratio, …).
    expect(
      hits(G(['Ti', 'títan'], ['Se', 'selen'], ['ic', 'sýrukær']), 'The ratio increases.')
    ).toEqual([]);
  });

  it('keeps lowercase short units, which are legitimate and word-bounded', () => {
    expect(
      hits(G(['kg', 'kíló'], ['pH', 'sýrustig'], ['nm', 'nanómetri']), 'Add 5 kg; the pH was 7.')
    ).toEqual(['kg', 'pH']);
  });

  it('leaves LONG headwords on the historical substring path — inflections still match', () => {
    // `\bbond\b` would not match "bonds". Widening the strict rule would DROP useful terms,
    // which is the opposite failure from the one being fixed.
    expect(
      hits(G(['bond', 'tengi'], ['molecule', 'sameind']), 'Covalent bonds between molecules.')
    ).toEqual(['bond', 'molecule']);
  });

  it('is case-INSENSITIVE for long headwords, as before', () => {
    expect(hits(G(['acid', 'sýra']), 'ACID rain.')).toEqual(['acid']);
  });

  it('🔴 still matches a wrong-sense HOMOGRAPH — matching is not the whole defect', () => {
    // `is → lófalægur` really is the English word "is", so no matching rule can exclude it.
    // These are removed from the concept model instead (§C116). Pinning it here so a future
    // reader does not assume this rule covers them.
    expect(hits(G(['is', 'lófalægur'], ['no', 'blóð-']), 'There is no change.')).toEqual([
      'is',
      'no',
    ]);
  });

  it('the boundary is a LENGTH, and it is asserted rather than left implicit', () => {
    expect(SHORT_HEADWORD_MAX_LEN).toBe(3);
    // 3 chars → strict: "arc" must not match inside "search".
    expect(hits(G(['arc', 'bogi']), 'We search for it.')).toEqual([]);
    expect(hits(G(['arc', 'bogi']), 'The arc is bright.')).toEqual(['arc']); // control
    // 4 chars → historical substring path: "atom" still matches inside "atoms".
    expect(hits(G(['atom', 'atóm']), 'Two atoms bond.')).toEqual(['atom']);
  });

  it('word boundaries use Unicode lookarounds, not \\b — an accented neighbour is not a boundary', () => {
    // `\b` is ASCII-only, so it would treat í as a non-word char and fire mid-word.
    expect(hits(G(['ml', 'millilítri']), 'Bættu við 5 mlítrum.')).toEqual([]);
    expect(hits(G(['ml', 'millilítri']), 'Add 5 ml of water.')).toEqual(['ml']); // control
  });

  it('a headword carrying regex metacharacters is escaped, not compiled as a pattern', () => {
    expect(() => hits(G(['a.c', 'x'], ['(b', 'y']), 'abc (b')).not.toThrow();
    expect(hits(G(['a.c', 'x']), 'abc')).toEqual([]); // '.' must be literal
  });
});

describe('splitAtSegBoundaries', () => {
  it('returns single chunk when under max size', () => {
    const input = '<!-- SEG:m1:title:a -->\nTitle\n\n<!-- SEG:m1:para:b -->\nParagraph\n';
    const chunks = splitAtSegBoundaries(input, 10000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(input);
  });

  it('splits into multiple chunks at SEG boundaries', () => {
    const seg1 = '<!-- SEG:m1:title:a -->\nTitle text here\n\n';
    const seg2 = '<!-- SEG:m1:para:b -->\nParagraph one here\n\n';
    const seg3 = '<!-- SEG:m1:para:c -->\nParagraph two here\n\n';
    const input = seg1 + seg2 + seg3;

    // Max 60 chars — forces split (each seg is ~40 chars)
    const chunks = splitAtSegBoundaries(input, 60);
    expect(chunks.length).toBeGreaterThanOrEqual(2);

    // Verify all segments are preserved
    const reassembled = chunks.join('');
    expect(reassembled).toBe(input);
  });

  it('never splits mid-segment', () => {
    const seg1 = '<!-- SEG:m1:title:a -->\n' + 'A'.repeat(100) + '\n\n';
    const seg2 = '<!-- SEG:m1:para:b -->\n' + 'B'.repeat(100) + '\n\n';
    const input = seg1 + seg2;

    // Max 50 chars — each segment is >100, but can't split within them
    const chunks = splitAtSegBoundaries(input, 50);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toContain('SEG:m1:title:a');
    expect(chunks[1]).toContain('SEG:m1:para:b');
  });

  it('preserves total segment count after reassembly', () => {
    const segs = [];
    for (let i = 0; i < 10; i++) {
      segs.push(`<!-- SEG:m1:para:seg-${i} -->\nContent ${i}\n\n`);
    }
    const input = segs.join('');
    const chunks = splitAtSegBoundaries(input, 100);

    const reassembled = chunks.join('');
    const inputCount = (input.match(/<!-- SEG:/g) || []).length;
    const outputCount = (reassembled.match(/<!-- SEG:/g) || []).length;
    expect(outputCount).toBe(inputCount);
  });
});

// ─── assertNoControlChars ───────────────────
// Guards the MT boundary: the Malstadur API has been observed returning the
// degree sign (U+00B0) corrupted as a NUL byte (sometimes NUL + literal "b0").
// NUL and other C0 control chars are invalid in XML/HTML and silently corrupt
// content three stages downstream, so we fail loud at the producer.

describe('assertNoControlChars', () => {
  it('throws when text contains a NUL byte', () => {
    expect(() => assertNoControlChars('\u0000b0 = 87 kJ', 'm68831')).toThrow(/control char/i);
  });

  it('throws when text contains another C0 control char (e.g. 0x1F)', () => {
    expect(() => assertNoControlChars('A\u001fB', 'chunk 1')).toThrow(/control char/i);
  });

  it('includes the label in the thrown error', () => {
    expect(() => assertNoControlChars('x\u0000y', 'ch18/m68831')).toThrow(/ch18\/m68831/);
  });

  it('passes clean text through unchanged (returns the text)', () => {
    const clean = 'ΔH° = 87 kJ; við 26 °C';
    expect(assertNoControlChars(clean, 'm68831')).toBe(clean);
  });

  it('allows tab, newline and carriage return (valid whitespace)', () => {
    const text = 'line1\n\tindented\r\nline2';
    expect(() => assertNoControlChars(text, 'ws')).not.toThrow();
  });
});
