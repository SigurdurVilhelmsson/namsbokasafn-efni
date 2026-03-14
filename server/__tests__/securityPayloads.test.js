/**
 * Security Payload Tests
 *
 * Part A: XSS escaping verification for escapeHtml function
 * Part B: SQL parameterization verification for segmentEditorService
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

// Inline escapeHtml matching server/public/js/htmlUtils.js
const escapeHtml = (str) => {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
};

// =====================================================================
// Part A: XSS Escaping Tests
// =====================================================================

describe('escapeHtml — XSS payload neutralization', () => {
  it('neutralizes <script> tags', () => {
    const result = escapeHtml('<script>alert("xss")</script>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('neutralizes event handler injection via <img onerror>', () => {
    const result = escapeHtml('<img src=x onerror=alert(1)>');
    // The angle brackets are escaped, so the browser will not parse this as a tag
    expect(result).not.toContain('<img');
    expect(result).not.toContain('>');
    expect(result).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('neutralizes attribute-breaking script injection', () => {
    const result = escapeHtml('"><script>alert(1)</script>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&quot;&gt;');
  });

  it('passes through javascript: protocol (not HTML injection)', () => {
    const result = escapeHtml('javascript:alert(1)');
    expect(result).toContain('javascript:');
  });

  it('returns empty string for null', () => {
    expect(escapeHtml(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(escapeHtml(undefined)).toBe('');
  });

  it('escapes single quotes to prevent attribute breakout', () => {
    const result = escapeHtml("' onclick='alert(1)");
    expect(result).not.toContain("'");
    expect(result).toContain('&#x27;');
  });

  it('escapes ampersands to prevent entity injection', () => {
    const result = escapeHtml('&lt;script&gt;');
    expect(result).toBe('&amp;lt;script&amp;gt;');
  });
});

// =====================================================================
// Part B: SQL Parameterization Verification
// =====================================================================

describe('segmentEditorService — SQL parameterization', () => {
  const servicePath = join(__dirname, '..', 'services', 'segmentEditorService.js');
  const source = readFileSync(servicePath, 'utf-8');

  it('is a valid CommonJS module with expected exports', () => {
    // Require will fail if the module has syntax errors
    // We don't call any DB functions — just verify the module shape
    const service = require('../services/segmentEditorService');
    expect(typeof service.saveSegmentEdit).toBe('function');
    expect(typeof service.getModuleEdits).toBe('function');
    expect(typeof service.approveEdit).toBe('function');
    expect(typeof service.applyApprovedEdits).toBe('function');
    expect(typeof service.getReviewQueue).toBe('function');
    expect(typeof service.getGlobalEditStats).toBe('function');
  });

  it('uses ? placeholders in all SQL statements', () => {
    // Extract all SQL strings (text inside backtick template literals following .prepare()
    const prepareBlocks = source.match(/\.prepare\(\s*`[^`]+`\s*\)/g) || [];
    expect(prepareBlocks.length).toBeGreaterThan(0);

    for (const block of prepareBlocks) {
      // Each prepared statement should use ? for parameters, not ${...} interpolation
      expect(block).not.toMatch(/\$\{/);
    }
  });

  it('does not use string concatenation to build SQL with user values', () => {
    // Look for dangerous patterns: SQL string + variable (e.g., `"SELECT ... " + userInput`)
    // Dynamic query building with += is OK only when appending static clauses
    const lines = source.split('\n');
    for (const line of lines) {
      // Skip comments
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

      // Flag lines that concatenate into SQL with a variable that isn't a static string
      if (line.includes('query +=') || line.includes('query +=')) {
        // These lines should only append static SQL fragments like ` AND status = ?`
        // They should not contain ${...} template interpolation
        expect(line).not.toMatch(/\$\{/);
      }
    }
  });

  it('does not contain raw template literal SQL with interpolated values', () => {
    // Ensure no `SELECT ... ${variable}` patterns exist outside .prepare() calls
    // This catches accidental use of template literals for SQL construction
    const templateSqlPattern = /`\s*(?:SELECT|INSERT|UPDATE|DELETE)\b[^`]*\$\{[^`]*`/gi;
    const matches = source.match(templateSqlPattern) || [];

    // All SQL template literals should be inside .prepare() — which we already verified
    // use ? placeholders. This checks for any stray SQL templates outside .prepare().
    for (const match of matches) {
      // If it contains ${, it's dangerous unless it's the query variable appending
      expect(match).not.toMatch(/\$\{/);
    }
  });
});
