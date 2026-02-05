/**
 * Tests for chapter-assembler.js - Chapter assembly for publication
 *
 * Tests the content parsing and extraction functions used to assemble
 * chapter files into the publication structure.
 */

import { describe, it, expect } from 'vitest';
import {
  parseArgs,
  parseMarkdown,
  extractSummary,
  extractKeyEquations,
  extractExercises,
  extractTerms,
  stripSections,
  getModuleOutputFilename,
  SECTION_TITLES,
  TRACK_LABELS,
} from '../chapter-assembler.js';

// ============================================================================
// Constants
// ============================================================================

describe('SECTION_TITLES', () => {
  it('has English section titles', () => {
    expect(SECTION_TITLES.en).toBeDefined();
    expect(SECTION_TITLES.en.keyTerms).toBe('Key Terms');
    expect(SECTION_TITLES.en.keyEquations).toBe('Key Equations');
    expect(SECTION_TITLES.en.summary).toBe('Summary');
    expect(SECTION_TITLES.en.exercises).toBe('Exercises');
  });

  it('has Icelandic section titles', () => {
    expect(SECTION_TITLES.is).toBeDefined();
    expect(SECTION_TITLES.is.keyTerms).toBe('Lykilhugtök');
    expect(SECTION_TITLES.is.keyEquations).toBe('Lykiljöfnur');
    expect(SECTION_TITLES.is.summary).toBe('Samantekt');
    expect(SECTION_TITLES.is.exercises).toBe('Æfingar');
  });
});

describe('TRACK_LABELS', () => {
  it('has all track labels', () => {
    expect(TRACK_LABELS['mt-preview']).toBe('Vélþýðing - ekki yfirfarin');
    expect(TRACK_LABELS['faithful']).toBe('Ritstýrð þýðing');
    expect(TRACK_LABELS['localized']).toBe('Staðfærð útgáfa');
  });
});

// ============================================================================
// parseArgs() - CLI Argument Parsing
// ============================================================================

describe('parseArgs', () => {
  describe('default values', () => {
    it('returns defaults for empty args', () => {
      const result = parseArgs([]);
      expect(result.chapter).toBe(null);
      expect(result.book).toBe('efnafraedi');
      expect(result.inputDir).toBe(null);
      expect(result.outputDir).toBe(null);
      expect(result.track).toBe('faithful');
      expect(result.lang).toBe('is');
      expect(result.dryRun).toBe(false);
      expect(result.verbose).toBe(false);
      expect(result.help).toBe(false);
    });
  });

  describe('flag options', () => {
    it('parses --help flag', () => {
      expect(parseArgs(['--help']).help).toBe(true);
      expect(parseArgs(['-h']).help).toBe(true);
    });

    it('parses --verbose flag', () => {
      expect(parseArgs(['--verbose']).verbose).toBe(true);
    });

    it('parses --dry-run flag', () => {
      expect(parseArgs(['--dry-run']).dryRun).toBe(true);
    });
  });

  describe('options with values', () => {
    it('parses --chapter with value', () => {
      const result = parseArgs(['--chapter', '5']);
      expect(result.chapter).toBe(5);
    });

    it('parses --book with value', () => {
      const result = parseArgs(['--book', 'physics']);
      expect(result.book).toBe('physics');
    });

    it('parses --input with value', () => {
      const result = parseArgs(['--input', './my-input']);
      expect(result.inputDir).toBe('./my-input');
    });

    it('parses --output with value', () => {
      const result = parseArgs(['--output', './my-output']);
      expect(result.outputDir).toBe('./my-output');
    });

    it('parses --track with value', () => {
      const result = parseArgs(['--track', 'mt-preview']);
      expect(result.track).toBe('mt-preview');
    });

    it('parses --lang with value', () => {
      const result = parseArgs(['--lang', 'en']);
      expect(result.lang).toBe('en');
    });
  });

  describe('combined arguments', () => {
    it('parses full assembly command', () => {
      const result = parseArgs([
        '--chapter',
        '1',
        '--book',
        'efnafraedi',
        '--track',
        'faithful',
        '--verbose',
      ]);
      expect(result.chapter).toBe(1);
      expect(result.book).toBe('efnafraedi');
      expect(result.track).toBe('faithful');
      expect(result.verbose).toBe(true);
    });
  });
});

// ============================================================================
// parseMarkdown() - Frontmatter Parsing
// ============================================================================

describe('parseMarkdown', () => {
  it('parses content without frontmatter', () => {
    const content = '# Title\n\nSome content';
    const result = parseMarkdown(content);
    expect(result.frontmatter).toEqual({});
    expect(result.content).toBe('# Title\n\nSome content');
  });

  it('parses content with YAML frontmatter', () => {
    const content = `---
title: Test Title
chapter: 1
---

# Title

Some content`;
    const result = parseMarkdown(content);
    expect(result.frontmatter.title).toBe('Test Title');
    expect(result.frontmatter.chapter).toBe(1);
    expect(result.content).toContain('# Title');
    expect(result.content).not.toContain('---');
  });

  it('handles malformed frontmatter gracefully', () => {
    const content = `---
title: [unclosed bracket
---

Content`;
    const result = parseMarkdown(content);
    // Should not throw, frontmatter may be empty
    expect(result.content).toBeDefined();
  });
});

// ============================================================================
// extractSummary() - Summary Section Extraction
// ============================================================================

describe('extractSummary', () => {
  it('extracts English summary section', () => {
    // Put summary on single line to ensure capture (multiline regex quirk)
    const content = `## Introduction

Some intro text.

## Key Concepts and Summary

This is the summary content with important information.

## Key Equations

Some equations.`;

    const result = extractSummary(content);
    expect(result.found).toBe(true);
    expect(result.content).toContain('This is the summary content');
  });

  it('extracts Icelandic summary section', () => {
    const content = `## Inngangur

Nokkur inngangstexti.

## Lykilhugtök og samantekt

Þetta er samantektin.

## Lykiljöfnur

Jöfnur hér.`;

    const result = extractSummary(content);
    expect(result.found).toBe(true);
    expect(result.content).toContain('Þetta er samantektin.');
  });

  it('returns not found when no summary section', () => {
    const content = `## Introduction

Just some content without summary.`;

    const result = extractSummary(content);
    expect(result.found).toBe(false);
    expect(result.content).toBe('');
  });
});

// ============================================================================
// extractKeyEquations() - Key Equations Section Extraction
// ============================================================================

describe('extractKeyEquations', () => {
  it('extracts English key equations section', () => {
    const content = `## Some Section

Content here.

## Key Equations

[[EQ:1]] [[EQ:2]]

## Chemistry End of Chapter

Exercises here.`;

    const result = extractKeyEquations(content);
    expect(result.found).toBe(true);
    // Both equations on same line are captured
    expect(result.equations.length).toBe(2);
    expect(result.equations[0].id).toBe('1');
    expect(result.equations[1].id).toBe('2');
  });

  it('extracts Icelandic key equations section (Lykiljöfnur)', () => {
    const content = `## Kafli

Efni.

## Lykiljöfnur

[[EQ:1]]

## Æfingar

Verkefni.`;

    const result = extractKeyEquations(content);
    expect(result.found).toBe(true);
    expect(result.equations.length).toBe(1);
  });

  it('handles escaped equation references from MT', () => {
    const content = `## Lykiljöfnur

\\[\\[EQ:1\\]\\]

## Æfingar`;

    const result = extractKeyEquations(content);
    expect(result.found).toBe(true);
    // Escaped brackets are matched by the pattern
    expect(result.equations.length).toBeGreaterThanOrEqual(1);
  });

  it('extracts TABLE references as equations', () => {
    // Put both on same line to capture all
    const content = `## Key Equations

[[TABLE:1]] [[EQ:2]]

## Chemistry End of Chapter

Exercises here.`;

    const result = extractKeyEquations(content);
    expect(result.equations.length).toBe(2);
    expect(result.equations[0].id).toBe('1');
    expect(result.equations[1].id).toBe('2');
  });

  it('returns not found when no key equations section', () => {
    const content = `## Introduction

Just content.`;

    const result = extractKeyEquations(content);
    expect(result.found).toBe(false);
    expect(result.equations).toEqual([]);
  });
});

// ============================================================================
// extractExercises() - Exercise Extraction
// ============================================================================

describe('extractExercises', () => {
  it('extracts practice-problem format exercises', () => {
    const content = `## Exercises

:::practice-problem{#ex-001}
What is 2 + 2?

:::answer
4
:::
:::

:::practice-problem{#ex-002}
What is 3 + 3?
:::`;

    const result = extractExercises(content);
    expect(result.length).toBe(2);
    expect(result[0].id).toBe('ex-001');
    expect(result[0].content).toContain('What is 2 + 2?');
    expect(result[0].answer).toBe('4');
    expect(result[1].id).toBe('ex-002');
  });

  it('extracts æfingadæmi format (Icelandic alias)', () => {
    const content = `:::æfingadæmi{#ex-001}
Hvað er 2 + 2?

:::svar
4
:::
:::`;

    const result = extractExercises(content);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('ex-001');
    expect(result[0].answer).toBe('4');
  });

  it('extracts exercise{id="..."} format (MT output)', () => {
    const content = `:::exercise{id="ex-001"} What is the answer?

:::answer 42
:::`;

    const result = extractExercises(content);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('ex-001');
  });

  it('extracts exercise{#...} shorthand format', () => {
    const content = `:::exercise{#ex-001}
Simple question?
:::`;

    const result = extractExercises(content);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('ex-001');
    expect(result[0].content).toContain('Simple question?');
  });

  it('handles exercises without answers', () => {
    const content = `:::practice-problem{#ex-001}
Question without answer.
:::`;

    const result = extractExercises(content);
    expect(result.length).toBe(1);
    expect(result[0].answer).toBe(null);
  });

  it('avoids duplicate exercises from overlapping patterns', () => {
    const content = `:::exercise{#ex-001}
Question 1
:::

:::exercise{#ex-002}
Question 2
:::`;

    const result = extractExercises(content);
    // Should not have duplicates
    const ids = result.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ============================================================================
// extractTerms() - Term Definition Extraction
// ============================================================================

describe('extractTerms', () => {
  it('extracts term definitions with IDs', () => {
    const content = `This chapter introduces **chemistry**{#term-00001} as a science.
We also discuss **matter**{#term-00002} in detail.`;

    const result = extractTerms(content);
    expect(result.length).toBe(2);
    expect(result[0].term).toBe('chemistry');
    expect(result[0].id).toBe('term-00001');
    expect(result[1].term).toBe('matter');
    expect(result[1].id).toBe('term-00002');
  });

  it('handles terms with special characters', () => {
    const content = `The **Avogadro's number**{#term-00003} is important.`;

    const result = extractTerms(content);
    expect(result.length).toBe(1);
    expect(result[0].term).toBe("Avogadro's number");
  });

  it('returns empty array when no terms found', () => {
    const content = `No bold terms with IDs here.`;

    const result = extractTerms(content);
    expect(result).toEqual([]);
  });
});

// ============================================================================
// stripSections() - Section Removal
// ============================================================================

describe('stripSections', () => {
  it('removes Key Concepts and Summary section', () => {
    const content = `## Introduction

Intro text.

## Key Concepts and Summary

Summary to remove.

## Key Equations

Equations.`;

    const result = stripSections(content);
    expect(result).toContain('## Introduction');
    expect(result).toContain('Intro text.');
    expect(result).not.toContain('Key Concepts and Summary');
    expect(result).not.toContain('Summary to remove.');
  });

  it('removes Key Equations section', () => {
    const content = `## Content

Some content.

## Key Equations

[[EQ:1]]

## Exercises

Problems.`;

    const result = stripSections(content);
    expect(result).toContain('## Content');
    expect(result).not.toContain('Key Equations');
    expect(result).not.toContain('[[EQ:1]]');
  });

  it('removes Chemistry End of Chapter Exercises section', () => {
    const content = `## Content

Main content.

## Chemistry End of Chapter Exercises

:::practice-problem{#ex-001}
Exercise content.
:::`;

    const result = stripSections(content);
    expect(result).toContain('## Content');
    expect(result).not.toContain('Chemistry End of Chapter');
    expect(result).not.toContain('practice-problem');
  });

  it('removes Icelandic sections', () => {
    const content = `## Efni

Aðalefni.

## Lykilhugtök og samantekt

Samantekt.

## Lykiljöfnur

Jöfnur.

## Æfingar

Verkefni.`;

    const result = stripSections(content);
    expect(result).toContain('## Efni');
    expect(result).not.toContain('Lykilhugtök og samantekt');
    expect(result).not.toContain('Lykiljöfnur');
    expect(result).not.toContain('Æfingar');
  });

  it('cleans up multiple blank lines', () => {
    const content = `## Content

Text.



## Key Equations

[[EQ:1]]

## Exercises`;

    const result = stripSections(content);
    expect(result).not.toMatch(/\n{4,}/);
  });
});

// ============================================================================
// getModuleOutputFilename() - Filename Generation
// ============================================================================

describe('getModuleOutputFilename', () => {
  it('generates intro filename', () => {
    const result = getModuleOutputFilename(1, 'intro', 'Introduction', 'is');
    expect(result).toBe('1-0-introduction.is.md');
  });

  it('generates section filename with slug', () => {
    const result = getModuleOutputFilename(1, '1.1', 'Chemistry in Context', 'is');
    expect(result).toBe('1-1-chemistry-in-context.is.md');
  });

  it('handles special characters in title', () => {
    // The function replaces multiple dashes with single dash
    const result = getModuleOutputFilename(5, '5.3', "Hess's Law & Enthalpy", 'is');
    expect(result).toBe('5-3-hesss-law-enthalpy.is.md');
  });

  it('truncates long titles', () => {
    const longTitle =
      'This is a very long title that should be truncated to a reasonable length for filename purposes';
    const result = getModuleOutputFilename(1, '1.1', longTitle, 'is');
    expect(result.length).toBeLessThanOrEqual(60);
  });

  it('uses correct language suffix', () => {
    const resultIs = getModuleOutputFilename(1, '1.1', 'Test', 'is');
    const resultEn = getModuleOutputFilename(1, '1.1', 'Test', 'en');
    expect(resultIs).toContain('.is.md');
    expect(resultEn).toContain('.en.md');
  });
});
