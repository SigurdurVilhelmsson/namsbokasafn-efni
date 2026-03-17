/**
 * Tests for localizationSuggestions service
 *
 * Phase 4 of the testing audit: comprehensive tests for
 * pattern detection and DB-backed suggestion management.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const localizationSuggestions = require('../services/localizationSuggestions');

const { detectSuggestions } = localizationSuggestions;

// ---------------------------------------------------------------------------
// Pure pattern tests (no DB needed)
// ---------------------------------------------------------------------------

describe('detectSuggestions — pattern detection', () => {
  // Temperature conversions
  describe('temperature conversions', () => {
    it('converts °F notation to Celsius', () => {
      const results = detectSuggestions('Water boils at 212°F');
      const temp = results.find((r) => r.patternId === 'fahrenheit-to-celsius');
      expect(temp).toBeDefined();
      expect(temp.suggestedText).toBe('100.0 °C');
    });

    it('converts "F" with space notation to Celsius', () => {
      const results = detectSuggestions('Room temp is 72 F');
      const temp = results.find((r) => r.patternId === 'fahrenheit-to-celsius');
      expect(temp).toBeDefined();
      expect(temp.suggestedText).toBe('22.2 °C');
    });

    it('converts "Fahrenheit" word to Celsius', () => {
      const results = detectSuggestions('Set to 350 Fahrenheit');
      const temp = results.find((r) => r.patternId === 'fahrenheit-to-celsius');
      expect(temp).toBeDefined();
      expect(temp.suggestedText).toBe('176.7 °C');
    });
  });

  // Weight conversions
  describe('weight conversions', () => {
    it('converts pounds to kg', () => {
      const results = detectSuggestions('weighs 10 pounds');
      const w = results.find((r) => r.patternId === 'pounds-to-kg');
      expect(w).toBeDefined();
      expect(w.suggestedText).toBe('4.54 kg');
    });

    it('converts ounces to grams', () => {
      const results = detectSuggestions('8 oz of water');
      const w = results.find((r) => r.patternId === 'ounces-to-grams');
      expect(w).toBeDefined();
      expect(w.suggestedText).toBe('226.8 g');
    });

    it('converts lbs abbreviation to kg', () => {
      const results = detectSuggestions('5 lbs');
      const w = results.find((r) => r.patternId === 'pounds-to-kg');
      expect(w).toBeDefined();
      expect(w.suggestedText).toBe('2.27 kg');
    });
  });

  // Distance conversions
  describe('distance conversions', () => {
    it('converts miles to km', () => {
      const results = detectSuggestions('drove 100 miles');
      const d = results.find((r) => r.patternId === 'miles-to-km');
      expect(d).toBeDefined();
      expect(d.suggestedText).toBe('160.9 km');
    });

    it('converts feet to meters', () => {
      const results = detectSuggestions('6 feet tall');
      const d = results.find((r) => r.patternId === 'feet-to-meters');
      expect(d).toBeDefined();
      expect(d.suggestedText).toBe('1.83 m');
    });

    it('converts inches to cm', () => {
      const results = detectSuggestions('12 inches');
      const d = results.find((r) => r.patternId === 'inches-to-cm');
      expect(d).toBeDefined();
      expect(d.suggestedText).toBe('30.5 cm');
    });
  });

  // Volume conversions
  describe('volume conversions', () => {
    it('converts gallons to liters', () => {
      const results = detectSuggestions('5 gallons');
      const v = results.find((r) => r.patternId === 'gallons-to-liters');
      expect(v).toBeDefined();
      expect(v.suggestedText).toBe('18.93 L');
    });

    it('converts cups to mL', () => {
      const results = detectSuggestions('2 cups of water');
      const v = results.find((r) => r.patternId === 'cups-to-ml');
      expect(v).toBeDefined();
      expect(v.suggestedText).toBe('473 mL');
    });
  });

  // Agency references
  describe('agency references', () => {
    it('suggests Lyfjastofnun for FDA', () => {
      const results = detectSuggestions('approved by the FDA');
      const a = results.find((r) => r.patternId === 'us-fda');
      expect(a).toBeDefined();
      expect(a.suggestedText).toBe('Lyfjastofnun');
      expect(a.type).toBe('agency_reference');
    });

    it('suggests Umhverfisstofnun for EPA', () => {
      const results = detectSuggestions('EPA regulations');
      const a = results.find((r) => r.patternId === 'us-epa');
      expect(a).toBeDefined();
      expect(a.suggestedText).toBe('Umhverfisstofnun');
    });
  });

  // Currency
  describe('currency', () => {
    it('suggests ISK conversion for dollar amounts', () => {
      const results = detectSuggestions('costs $100');
      const c = results.find((r) => r.patternId === 'us-dollars');
      expect(c).toBeDefined();
      expect(c.type).toBe('currency');
      // ISK value is approximate, just verify it is present
      expect(c.suggestedText).toMatch(/kr\./);
    });
  });

  // detectSuggestions integration
  describe('detectSuggestions integration', () => {
    it('returns multiple suggestions sorted by position', () => {
      const content = 'It was 72°F and they drove 10 miles to buy 5 gallons of milk.';
      const results = detectSuggestions(content);
      expect(results.length).toBeGreaterThanOrEqual(3);
      // Verify sorted by position
      for (let i = 1; i < results.length; i++) {
        expect(results[i].position).toBeGreaterThanOrEqual(results[i - 1].position);
      }
    });

    it('skips content inside code blocks', () => {
      const content = '```\nThe temp is 212°F inside a code block\n```';
      const results = detectSuggestions(content);
      const temp = results.find((r) => r.patternId === 'fahrenheit-to-celsius');
      expect(temp).toBeUndefined();
    });

    it('returns empty array for empty content', () => {
      expect(detectSuggestions('')).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// DB-backed tests
// ---------------------------------------------------------------------------

describe('localizationSuggestions — DB operations', () => {
  let db;

  beforeAll(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE localization_suggestions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        section_id INTEGER NOT NULL,
        suggestion_type TEXT NOT NULL,
        original_text TEXT NOT NULL,
        suggested_text TEXT NOT NULL,
        context TEXT,
        line_number INTEGER,
        pattern_id TEXT,
        status TEXT DEFAULT 'pending',
        reviewer_modified_text TEXT,
        reviewed_by TEXT,
        reviewed_by_name TEXT,
        reviewed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    localizationSuggestions._setTestDb(db);
  });

  afterAll(() => {
    localizationSuggestions._setTestDb(null);
    db.close();
  });

  beforeEach(() => {
    db.exec('DELETE FROM localization_suggestions');
  });

  // Helper to seed a suggestion row
  function seed(overrides = {}) {
    const defaults = {
      section_id: 1,
      suggestion_type: 'unit_conversion',
      original_text: '212°F',
      suggested_text: '100.0 °C',
      context: 'Temperature conversion',
      line_number: 1,
      pattern_id: 'fahrenheit-to-celsius',
      status: 'pending',
    };
    const row = { ...defaults, ...overrides };
    const stmt = db.prepare(`
      INSERT INTO localization_suggestions
        (section_id, suggestion_type, original_text, suggested_text, context, line_number, pattern_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      row.section_id,
      row.suggestion_type,
      row.original_text,
      row.suggested_text,
      row.context,
      row.line_number,
      row.pattern_id,
      row.status
    );
    return info.lastInsertRowid;
  }

  // getSuggestions / getSuggestion
  describe('getSuggestions / getSuggestion', () => {
    it('returns all suggestions for a section', () => {
      seed({ section_id: 10 });
      seed({ section_id: 10, original_text: '5 lbs', suggested_text: '2.27 kg' });
      seed({ section_id: 99 }); // different section

      const results = localizationSuggestions.getSuggestions(10);
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.sectionId === 10)).toBe(true);
    });

    it('filters suggestions by status', () => {
      seed({ section_id: 20, status: 'pending' });
      seed({ section_id: 20, status: 'accepted' });
      seed({ section_id: 20, status: 'rejected' });

      const pending = localizationSuggestions.getSuggestions(20, 'pending');
      expect(pending).toHaveLength(1);
      expect(pending[0].status).toBe('pending');

      const accepted = localizationSuggestions.getSuggestions(20, 'accepted');
      expect(accepted).toHaveLength(1);
      expect(accepted[0].status).toBe('accepted');
    });

    it('getSuggestion returns single by ID, null for nonexistent', () => {
      const id = seed({ section_id: 30 });
      const s = localizationSuggestions.getSuggestion(id);
      expect(s).not.toBeNull();
      expect(s.id).toBe(id);
      expect(s.sectionId).toBe(30);

      const missing = localizationSuggestions.getSuggestion(999999);
      expect(missing).toBeNull();
    });
  });

  // accept / reject / modify
  describe('acceptSuggestion / rejectSuggestion / modifySuggestion', () => {
    it('acceptSuggestion sets status, reviewer, and timestamp', () => {
      const id = seed();
      const result = localizationSuggestions.acceptSuggestion(id, 'user-1', 'Alice');
      expect(result.status).toBe('accepted');
      expect(result.reviewedBy).toBe('user-1');
      expect(result.reviewedByName).toBe('Alice');
      expect(result.reviewedAt).toBeTruthy();
    });

    it('rejectSuggestion sets status to rejected', () => {
      const id = seed();
      const result = localizationSuggestions.rejectSuggestion(id, 'user-2', 'Bob');
      expect(result.status).toBe('rejected');
      expect(result.reviewedBy).toBe('user-2');
    });

    it('modifySuggestion sets status to modified and stores modified text', () => {
      const id = seed();
      const result = localizationSuggestions.modifySuggestion(
        id,
        '100 °C (exact)',
        'user-3',
        'Carol'
      );
      expect(result.status).toBe('modified');
      expect(result.reviewerModifiedText).toBe('100 °C (exact)');
      expect(result.reviewedBy).toBe('user-3');
    });

    it('formatSuggestion maps DB columns to camelCase', () => {
      const id = seed({ section_id: 42, pattern_id: 'miles-to-km', line_number: 7 });
      const s = localizationSuggestions.getSuggestion(id);
      // Verify camelCase mapping
      expect(s).toHaveProperty('sectionId', 42);
      expect(s).toHaveProperty('patternId', 'miles-to-km');
      expect(s).toHaveProperty('lineNumber', 7);
      expect(s).toHaveProperty('originalText');
      expect(s).toHaveProperty('suggestedText');
      expect(s).toHaveProperty('createdAt');
      // Should NOT have snake_case keys
      expect(s).not.toHaveProperty('section_id');
      expect(s).not.toHaveProperty('pattern_id');
    });
  });

  // bulkUpdateSuggestions
  describe('bulkUpdateSuggestions', () => {
    it('bulk accepts multiple suggestions', () => {
      const id1 = seed({ section_id: 50 });
      const id2 = seed({ section_id: 50 });

      const result = localizationSuggestions.bulkUpdateSuggestions(
        [id1, id2],
        'accept',
        'user-bulk',
        'BulkUser'
      );
      expect(result.success).toBe(true);
      expect(result.action).toBe('accept');

      const s1 = localizationSuggestions.getSuggestion(id1);
      const s2 = localizationSuggestions.getSuggestion(id2);
      expect(s1.status).toBe('accepted');
      expect(s2.status).toBe('accepted');
    });

    it('bulk reject only updates pending suggestions', () => {
      const idPending = seed({ section_id: 60, status: 'pending' });
      const idAccepted = seed({ section_id: 60, status: 'accepted' });

      localizationSuggestions.bulkUpdateSuggestions(
        [idPending, idAccepted],
        'reject',
        'user-x',
        'Xena'
      );

      const sp = localizationSuggestions.getSuggestion(idPending);
      const sa = localizationSuggestions.getSuggestion(idAccepted);
      expect(sp.status).toBe('rejected');
      // Already accepted — should NOT be changed to rejected
      expect(sa.status).toBe('accepted');
    });
  });

  // getSuggestionStats
  describe('getSuggestionStats', () => {
    it('returns correct counts by status', () => {
      seed({ section_id: 70, status: 'pending' });
      seed({ section_id: 70, status: 'pending' });
      seed({ section_id: 70, status: 'accepted' });
      seed({ section_id: 70, status: 'rejected' });
      seed({ section_id: 70, status: 'modified' });

      const stats = localizationSuggestions.getSuggestionStats(70);
      expect(stats.total).toBe(5);
      expect(stats.byStatus.pending).toBe(2);
      expect(stats.byStatus.accepted).toBe(1);
      expect(stats.byStatus.rejected).toBe(1);
      expect(stats.byStatus.modified).toBe(1);
    });

    it('returns counts by type', () => {
      seed({ section_id: 80, suggestion_type: 'unit_conversion' });
      seed({ section_id: 80, suggestion_type: 'unit_conversion' });
      seed({ section_id: 80, suggestion_type: 'agency_reference' });

      const stats = localizationSuggestions.getSuggestionStats(80);
      expect(stats.byType.unit_conversion).toBe(2);
      expect(stats.byType.agency_reference).toBe(1);
    });
  });

  // Error handling
  describe('error handling', () => {
    it('bulkUpdateSuggestions throws on invalid action', () => {
      expect(() => {
        localizationSuggestions.bulkUpdateSuggestions([1], 'invalid', 'u', 'n');
      }).toThrow('Invalid action');
    });

    it('getSuggestion returns null for nonexistent ID', () => {
      const result = localizationSuggestions.getSuggestion(888888);
      expect(result).toBeNull();
    });
  });
});
