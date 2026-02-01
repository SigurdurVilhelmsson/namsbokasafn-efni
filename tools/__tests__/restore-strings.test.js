/**
 * Tests for restore-strings.js - Translation string restoration
 *
 * This tests the core parsing and restoration functions used in the translation pipeline.
 */

import { describe, it, expect } from 'vitest';
import {
  isMarkdownFormat,
  parseMarkdownStrings,
  cleanMTMangling,
  legacyToStructured,
} from '../restore-strings.js';

// ============================================================================
// isMarkdownFormat() - Format Detection
// ============================================================================

describe('isMarkdownFormat', () => {
  describe('English markers', () => {
    it('detects "# Translatable Strings" header', () => {
      const content = '# Translatable Strings\n\nSome content';
      expect(isMarkdownFormat(content)).toBe(true);
    });

    it('detects "## Frontmatter" section', () => {
      const content = '## Frontmatter\n\n**Title:** Test';
      expect(isMarkdownFormat(content)).toBe(true);
    });

    it('detects "## Tables" section', () => {
      const content = '## Tables\n\n### Table 1';
      expect(isMarkdownFormat(content)).toBe(true);
    });

    it('detects "## Figures" section', () => {
      const content = '## Figures\n\n### CNX_Chem_01_01';
      expect(isMarkdownFormat(content)).toBe(true);
    });
  });

  describe('Icelandic markers', () => {
    it('detects Icelandic header', () => {
      const content = '# Þýðanlegir strengir\n\nContent';
      expect(isMarkdownFormat(content)).toBe(true);
    });

    it('detects Icelandic sections', () => {
      expect(isMarkdownFormat('## Formáli\n\n**Titill:** Test')).toBe(true);
      expect(isMarkdownFormat('## Töflur\n\n### Tafla 1')).toBe(true);
      expect(isMarkdownFormat('## Myndir\n\n### CNX_Chem')).toBe(true);
    });
  });

  describe('Protected markers', () => {
    it('detects protected frontmatter marker', () => {
      const content = '## [[FRONTMATTER]]\n\n**[[TITLE]]:** Test';
      expect(isMarkdownFormat(content)).toBe(true);
    });

    it('detects protected tables marker', () => {
      const content = '## [[TABLES]]\n\n### [[TABLE:1]]';
      expect(isMarkdownFormat(content)).toBe(true);
    });

    it('detects protected figures marker', () => {
      const content = '## [[FIGURES]]\n\n### [[CNX_Chem]]';
      expect(isMarkdownFormat(content)).toBe(true);
    });
  });

  describe('negative cases', () => {
    it('returns false for legacy format', () => {
      const content = 'FRONTMATTER.TITLE=Some Title\nTABLE:1.TITLE=Table';
      expect(isMarkdownFormat(content)).toBe(false);
    });

    it('returns false for empty content', () => {
      expect(isMarkdownFormat('')).toBe(false);
    });

    it('returns false for plain text', () => {
      expect(isMarkdownFormat('Just some plain text')).toBe(false);
    });
  });
});

// ============================================================================
// cleanMTMangling() - MT Artifact Cleanup
// ============================================================================

describe('cleanMTMangling', () => {
  describe('escaped brackets', () => {
    it('cleans escaped double brackets', () => {
      expect(cleanMTMangling('\\[\\[TABLE:1\\]\\]')).toBe('[[TABLE:1]]');
    });

    it('cleans space-separated brackets', () => {
      expect(cleanMTMangling('[ [TABLE:1] ]')).toBe('[[TABLE:1]]');
    });

    it('preserves normal brackets', () => {
      expect(cleanMTMangling('[normal]')).toBe('[normal]');
    });
  });

  describe('escaped asterisks', () => {
    it('cleans escaped bold markers', () => {
      expect(cleanMTMangling('\\*\\*bold\\*\\*')).toBe('**bold**');
    });

    it('preserves normal asterisks', () => {
      expect(cleanMTMangling('*italic*')).toBe('*italic*');
    });
  });

  describe('combined artifacts', () => {
    it('cleans multiple artifact types', () => {
      const mangled = '\\[\\[TITLE\\]\\]: \\*\\*Test\\*\\*';
      const cleaned = cleanMTMangling(mangled);
      expect(cleaned).toBe('[[TITLE]]: **Test**');
    });
  });
});

// ============================================================================
// parseMarkdownStrings() - Structured Parsing
// ============================================================================

describe('parseMarkdownStrings', () => {
  describe('frontmatter parsing', () => {
    it('parses English frontmatter title', () => {
      const content = `## Frontmatter

**Title:** Introduction to Chemistry

---`;
      const result = parseMarkdownStrings(content);
      expect(result.frontmatter.title).toBe('Introduction to Chemistry');
    });

    it('parses Icelandic frontmatter title', () => {
      const content = `## Formáli

**Titill:** Inngangur að efnafræði

---`;
      const result = parseMarkdownStrings(content);
      expect(result.frontmatter.title).toBe('Inngangur að efnafræði');
    });

    it('parses protected frontmatter marker', () => {
      const content = `## [[FRONTMATTER]]

**[[TITLE]]:** Introduction to Chemistry

---`;
      const result = parseMarkdownStrings(content);
      expect(result.frontmatter.title).toBe('Introduction to Chemistry');
    });
  });

  describe('tables parsing', () => {
    it('parses table with title', () => {
      const content = `## Tables

### Table 1

**Title:** Specific Heat Capacities

---`;
      const result = parseMarkdownStrings(content);
      expect(result.tables['TABLE:1']).toBeDefined();
      expect(result.tables['TABLE:1'].title).toBe('Specific Heat Capacities');
    });

    it('parses table with summary', () => {
      const content = `## Tables

### Table 1

**Title:** Heat Capacities
**Summary:** This table lists specific heat capacities of common substances.

---`;
      const result = parseMarkdownStrings(content);
      expect(result.tables['TABLE:1'].summary).toContain('specific heat capacities');
    });

    it('parses multiple tables', () => {
      const content = `## Tables

### Table 1

**Title:** First Table

### Table 2

**Title:** Second Table

---`;
      const result = parseMarkdownStrings(content);
      expect(result.tables['TABLE:1'].title).toBe('First Table');
      expect(result.tables['TABLE:2'].title).toBe('Second Table');
    });

    it('parses protected table markers', () => {
      const content = `## [[TABLES]]

### [[TABLE:1]]

**[[TITLE]]:** Specific Heats

---`;
      const result = parseMarkdownStrings(content);
      expect(result.tables['TABLE:1'].title).toBe('Specific Heats');
    });

    it('parses Icelandic table markers', () => {
      const content = `## Töflur

### Tafla 1

**Titill:** Sértækni eðlisvarma

---`;
      const result = parseMarkdownStrings(content);
      expect(result.tables['TABLE:1'].title).toBe('Sértækni eðlisvarma');
    });
  });

  describe('figures parsing', () => {
    it('parses figure with caption and alt text', () => {
      const content = `## Figures

### CNX_Chem_05_01_Heat

**Caption:** Heat transfer between systems.
**Alt text:** Diagram showing heat flow.

---`;
      const result = parseMarkdownStrings(content);
      expect(result.figures['CNX_Chem_05_01_Heat']).toBeDefined();
      expect(result.figures['CNX_Chem_05_01_Heat'].captionIs).toContain('Heat transfer');
      expect(result.figures['CNX_Chem_05_01_Heat'].altTextIs).toContain('heat flow');
    });

    it('parses protected figure markers', () => {
      const content = `## [[FIGURES]]

### [[CNX_Chem_05_01_Test]]

**[[CAPTION]]:** Test caption

---`;
      const result = parseMarkdownStrings(content);
      expect(result.figures['CNX_Chem_05_01_Test'].captionIs).toBe('Test caption');
    });
  });

  describe('empty and missing sections', () => {
    it('returns empty object for missing frontmatter', () => {
      const content = `## Tables

### Table 1
**Title:** Test`;
      const result = parseMarkdownStrings(content);
      expect(result.frontmatter).toEqual({});
    });

    it('returns empty objects for empty content', () => {
      const result = parseMarkdownStrings('');
      expect(result.frontmatter).toEqual({});
      expect(result.tables).toEqual({});
      expect(result.figures).toEqual({});
    });
  });

  describe('MT artifact handling', () => {
    it('cleans MT artifacts before parsing', () => {
      const content = `## \\[\\[FRONTMATTER\\]\\]

\\*\\*\\[\\[TITLE\\]\\]:\\*\\* Test Title

---`;
      // cleanMTMangling is called internally
      const result = parseMarkdownStrings(content);
      expect(result.frontmatter.title).toBe('Test Title');
    });
  });
});

// ============================================================================
// legacyToStructured() - Legacy Format Conversion
// ============================================================================

describe('legacyToStructured', () => {
  it('converts frontmatter title', () => {
    const legacy = new Map([['FRONTMATTER:title', 'Introduction']]);
    const result = legacyToStructured(legacy);
    expect(result.frontmatter.title).toBe('Introduction');
  });

  it('converts table data', () => {
    const legacy = new Map([
      ['TABLE:1:title', 'Heat Capacities'],
      ['TABLE:1:summary', 'A summary of heat values'],
    ]);
    const result = legacyToStructured(legacy);
    expect(result.tables['TABLE:1'].title).toBe('Heat Capacities');
    expect(result.tables['TABLE:1'].summary).toBe('A summary of heat values');
  });

  it('converts multiple tables', () => {
    const legacy = new Map([
      ['TABLE:1:title', 'First'],
      ['TABLE:2:title', 'Second'],
    ]);
    const result = legacyToStructured(legacy);
    expect(Object.keys(result.tables)).toHaveLength(2);
  });

  it('handles mixed content', () => {
    const legacy = new Map([
      ['FRONTMATTER:title', 'Chapter 1'],
      ['TABLE:1:title', 'Data Table'],
    ]);
    const result = legacyToStructured(legacy);
    expect(result.frontmatter.title).toBe('Chapter 1');
    expect(result.tables['TABLE:1'].title).toBe('Data Table');
  });

  it('returns empty structure for empty Map', () => {
    const result = legacyToStructured(new Map());
    expect(result).toEqual({
      frontmatter: {},
      tables: {},
      figures: {},
    });
  });

  it('handles unknown keys gracefully', () => {
    const legacy = new Map([['UNKNOWN:key', 'value']]);
    const result = legacyToStructured(legacy);
    // Should not throw, just ignore unknown keys
    expect(result.frontmatter).toEqual({});
    expect(result.tables).toEqual({});
    expect(result.figures).toEqual({});
  });
});
