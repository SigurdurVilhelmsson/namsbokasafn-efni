import { parseArgs } from '../validate-chapter.js'; // already exported at validate-chapter.js:1238
import { describe, it, expect } from 'vitest';

describe('validate-chapter parseArgs — appendices', () => {
  it('captures "appendices" as chapter -1', () => {
    expect(parseArgs(['efnafraedi-2e', 'appendices']).chapter).toBe(-1);
  });
  it('captures bare "-1" as chapter -1 (not dropped as a flag)', () => {
    expect(parseArgs(['efnafraedi-2e', '-1']).chapter).toBe(-1);
  });
  it('numeric chapter unchanged', () => {
    expect(parseArgs(['efnafraedi-2e', '5']).chapter).toBe(5);
  });
  it('a real flag is still parsed as a flag', () => {
    expect(parseArgs(['efnafraedi-2e', '5', '--track', 'mt-preview']).track).toBe('mt-preview');
  });
  it('does not swallow an out-of-range negative like -5 as a chapter', () => {
    expect(parseArgs(['efnafraedi-2e', '-5']).chapter).toBe(null);
  });
  it('captures bare "-1" without eating the flag that follows', () => {
    const result = parseArgs(['efnafraedi-2e', '-1', '--track', 'mt-preview']);
    expect(result.chapter).toBe(-1);
    expect(result.track).toBe('mt-preview');
  });
});
