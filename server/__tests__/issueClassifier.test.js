/**
 * Issue Classifier Tests
 *
 * Tests issue classification, auto-fix, escalation, and tier logic.
 * No DB dependencies — all pure functions.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  ISSUE_CATEGORIES,
  SIMPLE_TIERS,
  classifyIssues,
  applyAutoFixes,
  getSimpleTier,
  calculateEscalationLevel,
} = require('../services/issueClassifier');

// ─── Constants shape ────────────────────────────────────────────────

describe('ISSUE_CATEGORIES constants', () => {
  it('has all 4 category keys', () => {
    expect(Object.keys(ISSUE_CATEGORIES)).toEqual(
      expect.arrayContaining(['AUTO_FIX', 'EDITOR_CONFIRM', 'BOARD_REVIEW', 'BLOCKED'])
    );
    expect(Object.keys(ISSUE_CATEGORIES)).toHaveLength(4);
  });

  it('each category has required fields', () => {
    for (const [, cat] of Object.entries(ISSUE_CATEGORIES)) {
      expect(cat).toHaveProperty('name');
      expect(cat).toHaveProperty('description');
      expect(cat).toHaveProperty('action');
      expect(cat).toHaveProperty('patterns');
      expect(Array.isArray(cat.patterns)).toBe(true);
    }
  });
});

describe('SIMPLE_TIERS constants', () => {
  it('has QUICK_FIX and TEAM_DISCUSSION', () => {
    expect(SIMPLE_TIERS).toHaveProperty('QUICK_FIX');
    expect(SIMPLE_TIERS).toHaveProperty('TEAM_DISCUSSION');
  });
});

// ─── classifyIssues ─────────────────────────────────────────────────

describe('classifyIssues', () => {
  it('detects trailing whitespace as AUTO_FIX', async () => {
    const issues = await classifyIssues('hello   \nworld');
    const trailing = issues.find((i) => i.patternId === 'trailing-space');
    expect(trailing).toBeDefined();
    expect(trailing.category).toBe('AUTO_FIX');
  });

  it('detects double spaces as AUTO_FIX', async () => {
    const issues = await classifyIssues('hello  world');
    const doubleSpace = issues.find((i) => i.patternId === 'double-space');
    expect(doubleSpace).toBeDefined();
    expect(doubleSpace.category).toBe('AUTO_FIX');
  });

  it('detects CRLF line endings as AUTO_FIX', async () => {
    const issues = await classifyIssues('line one\r\nline two');
    const crlf = issues.find((i) => i.patternId === 'crlf-to-lf');
    expect(crlf).toBeDefined();
    expect(crlf.category).toBe('AUTO_FIX');
  });

  it('detects common typos as AUTO_FIX', async () => {
    const issues = await classifyIssues('teh cat sat on adn mat');
    const typos = issues.filter((i) => i.patternId === 'common-typo-english');
    expect(typos.length).toBeGreaterThanOrEqual(2);
    expect(typos[0].category).toBe('AUTO_FIX');
  });

  it('detects Fahrenheit temperature as BOARD_REVIEW', async () => {
    const issues = await classifyIssues('The temperature was 98.6 °F today');
    const fahrenheit = issues.find((i) => i.patternId === 'fahrenheit-to-celsius');
    expect(fahrenheit).toBeDefined();
    expect(fahrenheit.category).toBe('BOARD_REVIEW');
  });

  it('detects US agency references as BOARD_REVIEW', async () => {
    const issues = await classifyIssues('The FDA approved the drug');
    const agency = issues.find((i) => i.patternId === 'us-specific-reference');
    expect(agency).toBeDefined();
    expect(agency.category).toBe('BOARD_REVIEW');
  });

  it('detects dollar amounts as BOARD_REVIEW', async () => {
    const issues = await classifyIssues('The cost was $1,200.50');
    const dollar = issues.find((i) => i.patternId === 'dollar-amount');
    expect(dollar).toBeDefined();
    expect(dollar.category).toBe('BOARD_REVIEW');
  });

  it('skipLocalization: true skips BOARD_REVIEW patterns', async () => {
    const issues = await classifyIssues('The FDA approved 98.6 °F', {
      skipLocalization: true,
    });
    const boardReview = issues.filter((i) => i.category === 'BOARD_REVIEW');
    expect(boardReview).toHaveLength(0);
  });

  it('empty content returns empty array', async () => {
    const issues = await classifyIssues('');
    expect(issues).toEqual([]);
  });
});

// ─── applyAutoFixes ─────────────────────────────────────────────────

describe('applyAutoFixes', () => {
  it('strips double spaces', async () => {
    const content = 'hello  world';
    const issues = await classifyIssues(content);
    const result = applyAutoFixes(content, issues);
    expect(result.content).toBe('hello world');
    expect(result.fixesApplied).toBeGreaterThanOrEqual(1);
  });

  it('normalizes CRLF to LF', async () => {
    const content = 'line one\r\nline two\r\n';
    const issues = await classifyIssues(content);
    const result = applyAutoFixes(content, issues);
    expect(result.content).toBe('line one\nline two\n');
  });

  it('returns fixesApplied count and leaves non-auto-fix content unchanged', async () => {
    const content = 'The FDA said  hello';
    const issues = await classifyIssues(content);
    const result = applyAutoFixes(content, issues);
    // Double space fixed, but FDA reference is BOARD_REVIEW (not auto-fixed)
    expect(result.fixesApplied).toBeGreaterThanOrEqual(1);
    expect(result.content).toContain('FDA');
  });
});

// ─── getSimpleTier ──────────────────────────────────────────────────

describe('getSimpleTier', () => {
  it('maps AUTO_FIX to QUICK_FIX', () => {
    expect(getSimpleTier('AUTO_FIX')).toBe('QUICK_FIX');
  });

  it('maps BOARD_REVIEW to TEAM_DISCUSSION', () => {
    expect(getSimpleTier('BOARD_REVIEW')).toBe('TEAM_DISCUSSION');
  });
});

// ─── calculateEscalationLevel ───────────────────────────────────────

describe('calculateEscalationLevel', () => {
  it('returns null level for recent date', () => {
    const now = new Date();
    const result = calculateEscalationLevel(now, 'reviewPending');
    expect(result.level).toBeNull();
  });

  it('returns warning level for date 5 days ago', () => {
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    const result = calculateEscalationLevel(fiveDaysAgo, 'reviewPending');
    expect(result.level).toBe('warning');
  });

  it('returns critical level for date 7+ days ago', () => {
    const eightDaysAgo = new Date();
    eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);
    const result = calculateEscalationLevel(eightDaysAgo, 'reviewPending');
    expect(result.level).toBe('critical');
    expect(result.shouldEscalate).toBe(true);
  });
});

// ─── isInCodeBlock (tested via classifyIssues) ──────────────────────

describe('code block exclusion', () => {
  it('does not flag double spaces inside code blocks', async () => {
    const content = 'normal text\n```\ncode  with  spaces\n```\nmore text';
    const issues = await classifyIssues(content);
    const doubleSpaces = issues.filter((i) => i.patternId === 'double-space');
    // Double spaces inside code block should be excluded (excludeInCode: true)
    // Only spaces outside the code block should be flagged
    for (const issue of doubleSpaces) {
      // Verify none of the flagged positions fall inside the code block
      const codeStart = content.indexOf('```\ncode');
      const codeEnd = content.indexOf('\n```\nmore');
      expect(issue.position < codeStart || issue.position > codeEnd).toBe(true);
    }
  });
});
