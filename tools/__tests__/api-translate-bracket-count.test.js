import { describe, it, expect } from 'vitest';
import { countBracketMarkers, bracketMarkerDelta, formatBracketDelta } from '../api-translate.js';

describe('countBracketMarkers', () => {
  it('tallies each inline bracket type, including nested and payload-bearing', () => {
    const t =
      'A [[i:x]] and [[sub:2]] and [[link:t|http://e]] and [[term:mól|term-1]] and [[i:[[sub:g]]]]';
    const c = countBracketMarkers(t);
    expect(c.i).toBe(2); // [[i:x]] and the outer [[i:[[sub:g]]]]
    expect(c.sub).toBe(2); // [[sub:2]] and the nested [[sub:g]]
    expect(c.link).toBe(1);
    expect(c.term).toBe(1);
    expect(c.b).toBe(0);
  });

  // Final review m6 (widened): the opaque/escape marker family introduced
  // for os-embed exercise fields (item 9/D3, tools/lib/exercise-html.js)
  // rides the same [[type:…]] bracket dialect through the MT API — the B3
  // producer-side delta report should cover them too, not just the
  // long-standing prose inline markers.
  it('tallies the opaque/escape marker family (MEDIA, lb, rb)', () => {
    const t = 'before [[MEDIA:0]] middle [[lb:]]x[[rb:]] after [[MEDIA:1]]';
    const c = countBracketMarkers(t);
    expect(c.MEDIA).toBe(2);
    expect(c.lb).toBe(1);
    expect(c.rb).toBe(1);
  });
});

describe('bracketMarkerDelta', () => {
  it('reports only types whose output count differs from input', () => {
    const input = 'x [[i:a]] [[i:b]] [[link:t|u]]';
    const output = 'x [[i:a]]'; // dropped one [[i:]] and the [[link:]]
    expect(bracketMarkerDelta(input, output)).toEqual({ i: -1, link: -1 });
  });

  it('is empty for a clean round-trip', () => {
    const s = 'x [[i:a]] [[sub:2]]';
    expect(bracketMarkerDelta(s, s)).toEqual({});
  });
});

describe('formatBracketDelta', () => {
  it('renders a one-line note for a non-empty delta', () => {
    expect(formatBracketDelta('m66438', { link: -1, i: -2 })).toBe(
      'm66438: bracket-marker delta (output vs input) — link -1, i -2'
    );
  });
  it('returns null for an empty delta', () => {
    expect(formatBracketDelta('m1', {})).toBeNull();
  });
});
