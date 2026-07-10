import { describe, it, expect } from 'vitest';
import { loadModuleMap } from '../generate-index.js'; // export it in Step 3

describe('loadModuleMap book resolution', () => {
  it('resolves biology modules from the biology data file, not chemistry', () => {
    const map = loadModuleMap('liffraedi-2e');
    expect(map).not.toBeNull();
    expect([...map.keys()].some((id) => id.startsWith('m66'))).toBe(true);
  });
  it('fails loud when no data file matches the book', () => {
    expect(() => loadModuleMap('no-such-book')).toThrow(/no server\/data.*slug/i);
  });
});
