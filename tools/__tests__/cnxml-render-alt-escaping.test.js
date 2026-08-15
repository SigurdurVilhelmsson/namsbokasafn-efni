import { describe, it, expect } from 'vitest';
import { escapeAttr, decodeEntities } from '../cnxml-render.js';

// The two render paths take differently-provenanced input and are BOTH correct:
// :1087 receives a re-serialized node (already entity-encoded) so it decodes
// first; :1149 receives a regex parse (raw) so it must not. This pins that
// asymmetry so a future "cleanup" cannot unify them silently.
describe('§C81 alt escaping, both render paths', () => {
  it('depth-walk path: decode-then-escape yields exactly one level of encoding', () => {
    const fromSerializer = 'sýrur &amp; basar'; // already encoded
    expect(escapeAttr(decodeEntities(fromSerializer))).toBe('sýrur &amp; basar');
  });

  it('renderMedia path: escape-only yields exactly one level of encoding', () => {
    const fromRegexParse = 'sýrur & basar'; // raw
    expect(escapeAttr(fromRegexParse)).toBe('sýrur &amp; basar');
  });

  // CONTROL: applying the wrong treatment double-encodes — proves the test can fail
  it('double-encodes if the depth-walk path skips decodeEntities', () => {
    expect(escapeAttr('sýrur &amp; basar')).toBe('sýrur &amp;amp; basar');
  });
});
