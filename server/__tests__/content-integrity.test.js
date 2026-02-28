/**
 * Content Integrity Round-Trip Tests
 *
 * Verifies that content survives parseSegments -> assembleSegments -> parseSegments
 * without corruption. These are pure function tests — no DB or filesystem.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { parseSegments, assembleSegments } = require('../services/segmentParser');

/**
 * Helper: verify content round-trips through parse -> assemble -> reparse.
 */
function roundTrip(segmentId, content) {
  const input = [{ segmentId, content }];
  const assembled = assembleSegments(input);
  const reparsed = parseSegments(assembled);
  expect(reparsed).toHaveLength(1);
  expect(reparsed[0].segmentId).toBe(segmentId);
  return reparsed[0].content;
}

describe('Content integrity round-trip', () => {
  const SEG_ID = 'm68663:para:fs-id001';

  it('Icelandic characters (thorn, eth, ae, o-umlaut) survive round-trip', () => {
    const content = 'Þetta er efnafræði. Ísland hefur ð og æ og ö í stafrófi sínu.';
    expect(roundTrip(SEG_ID, content)).toBe(content);
  });

  it('inline markup (__term__, **bold**) preserved exactly', () => {
    const content = 'Þetta er __hugtak__ og **feitletrað** orð í setningu.';
    expect(roundTrip(SEG_ID, content)).toBe(content);
  });

  it('math placeholders ([[MATH:N]]) preserved', () => {
    const content = 'Jafnan [[MATH:1]] sýnir að [[MATH:2]] er rétt.';
    expect(roundTrip(SEG_ID, content)).toBe(content);
  });

  it('XML-sensitive characters (<, >, &, quotes) preserved', () => {
    const content = 'Ef x < 5 og y > 3 þá er x & y = "satt" og \'gilt\'.';
    expect(roundTrip(SEG_ID, content)).toBe(content);
  });

  it('multi-paragraph content (double newlines) preserved', () => {
    const content = 'Fyrsta efnisgrein um efnafræði.\n\nÖnnur efnisgrein um frumeindir.';
    expect(roundTrip(SEG_ID, content)).toBe(content);
  });

  it('empty segment content preserved', () => {
    const content = '';
    expect(roundTrip(SEG_ID, content)).toBe(content);
  });

  it('very long segment content (near 10,000 chars) preserved', () => {
    const base = 'Þetta er löng setning sem er endurtekin til að prófa hámarkslengd efnis. ';
    const content = base.repeat(130).trim(); // ~9750 chars
    expect(content.length).toBeGreaterThan(9000);
    expect(roundTrip(SEG_ID, content)).toBe(content);
  });

  it('mixed content (Icelandic + markup + math) round-trips', () => {
    const content =
      'Efnafræðin notar __frumeind__ og **rafeind** í jöfnunni [[MATH:1]] þar sem ö < æ & ð > þ.';
    expect(roundTrip(SEG_ID, content)).toBe(content);
  });
});
