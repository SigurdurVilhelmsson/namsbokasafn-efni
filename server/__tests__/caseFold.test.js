import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { foldString, foldChar } = require('../lib/caseFold');

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const iuEq = (a, b) => new RegExp(`^${esc(a)}$`, 'iu').test(b);

/** Closure of a code point under per-character toLowerCase/toUpperCase. */
function candidates(ch) {
  const seen = new Set([ch]);
  const queue = [ch];
  while (queue.length) {
    const c = queue.pop();
    for (const next of [c.toLowerCase(), c.toUpperCase()]) {
      if ([...next].length !== 1 || seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return [...seen];
}

describe('caseFold', () => {
  it('is length-stable for every code point', () => {
    const bad = [];
    for (let cp = 0; cp <= 0x10ffff; cp++) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      const ch = String.fromCodePoint(cp);
      if (foldChar(ch).length !== ch.length) bad.push(cp.toString(16));
    }
    expect(bad).toEqual([]);
  });

  it('agrees with /iu on every code point and its case-closure', () => {
    // O(n) — NOT all pairs. Compare each code point only against its own
    // lower/upper closure, which is where every /iu equivalence lives.
    const bad = [];
    for (let cp = 0; cp <= 0x10ffff; cp++) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      const ch = String.fromCodePoint(cp);
      for (const other of candidates(ch)) {
        if (other === ch) continue;
        const foldSame = foldChar(ch) === foldChar(other);
        if (foldSame !== iuEq(ch, other)) {
          bad.push(`U+${cp.toString(16)} vs U+${other.codePointAt(0).toString(16)}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('leaves U+0130 alone — the only length-changing lowercase in Unicode', () => {
    expect('İ'.toLowerCase().length).toBe(2); // the hazard
    expect(foldChar('İ')).toBe('İ'); // the guard
    expect(iuEq('İ', 'i')).toBe(false); // and /iu agrees
  });

  it('is context-free, so Final_Sigma cannot apply', () => {
    expect('ΟΣ'.toLowerCase()).toBe('ος'); // whole-string lowercase: wrong
    expect(foldString('ΟΣ')).toBe(foldString('οσ')); // per-char: right
    expect(/σ/iu.test('ΟΣ')).toBe(true); // and matches /iu
  });

  it('folds the documented divergent pairs', () => {
    for (const [a, b] of [
      ['µ', 'μ'], // MICRO SIGN vs GREEK SMALL MU
      ['ſ', 's'], // LONG S
      ['ς', 'σ'], // FINAL SIGMA vs SIGMA
      ['ϕ', 'φ'], // PHI SYMBOL vs PHI
    ]) {
      expect(foldChar(a)).toBe(foldChar(b));
    }
  });

  it('preserves indices, so automaton offsets map onto the original string', () => {
    const s = 'The MASS of the Sample';
    expect(foldString(s).length).toBe(s.length);
    expect(foldString(s).indexOf('mass')).toBe(s.indexOf('MASS'));
  });

  it('agrees with an independently-built union-find over case relations, in both directions', () => {
    // The two sweeps above only ever compare a code point against members of its OWN
    // lower/upper closure (candidates(), a forward BFS anchored at that one code
    // point). A code point reachable only as a toUpperCase()/toLowerCase() *result* —
    // never as a BFS source — never appears in anyone else's closure, so a merge
    // across two such closures is invisible to both sweeps above. That is exactly the
    // shape of the U+0345/U+1FBE bug caseFold's derivation had to fix: two
    // "source-only" nodes in one /iu class, each anchoring its own forward BFS,
    // independently picked different fold targets, and neither sweep above would
    // have caught it, because neither ever compares 0345 against 1FBE directly.
    //
    // This check is built without calling foldChar or candidates() during graph
    // construction, so it cannot share their blind spot: a single GLOBAL union-find
    // pass over every code point's toLowerCase/toUpperCase relation (undirected, and
    // gated by the /iu oracle so a raw case-relation that ISN'T /iu-equivalent, e.g.
    // "ı" case-maps toward "I" but /ı/iu does not match "I", doesn't wrongly pull
    // unrelated letters into one class). Then it checks BOTH directions: members of
    // one component must fold identically (catches under-merge, the U+1FBE shape),
    // and no two DIFFERENT components may collide on the same folded value (catches
    // over-merge).
    const parent = new Map();
    function find(x) {
      if (!parent.has(x)) parent.set(x, x);
      let root = x;
      while (parent.get(root) !== root) root = parent.get(root);
      let cur = x;
      while (parent.get(cur) !== root) {
        const next = parent.get(cur);
        parent.set(cur, root);
        cur = next;
      }
      return root;
    }
    function union(a, b) {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
    }

    for (let cp = 0; cp <= 0x10ffff; cp++) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      const ch = String.fromCodePoint(cp);
      find(ch);
      for (const cand of [ch.toLowerCase(), ch.toUpperCase()]) {
        if (cand === ch || [...cand].length !== 1) continue;
        if (iuEq(ch, cand)) union(ch, cand);
      }
    }

    const groups = new Map();
    for (const ch of parent.keys()) {
      const root = find(ch);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(ch);
    }

    const bad = [];
    const foldToRoot = new Map();
    let componentsGt1 = 0;
    let pairs = 0;

    for (const members of groups.values()) {
      const root = find(members[0]);
      // Direction 2: two DIFFERENT components must not collide on the same fold.
      for (const ch of members) {
        const f = foldChar(ch);
        const owner = foldToRoot.get(f);
        if (owner === undefined) {
          foldToRoot.set(f, root);
        } else if (owner !== root) {
          bad.push(`over-merge: U+${ch.codePointAt(0).toString(16)} folds into another component`);
        }
      }
      if (members.length <= 1) continue;
      componentsGt1++;
      // Direction 1: every member of ONE component must fold identically.
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          pairs++;
          const a = members[i];
          const b = members[j];
          if (foldChar(a) !== foldChar(b)) {
            bad.push(
              `under-merge: U+${a.codePointAt(0).toString(16)} vs U+${b.codePointAt(0).toString(16)} (same component, different fold)`
            );
          }
        }
      }
    }

    expect(bad).toEqual([]);
    // Sanity guard against a vacuous graph (e.g. a construction bug that never
    // unions anything, which would make direction 1 trivially pass on singletons).
    expect(componentsGt1).toBeGreaterThan(0);
    expect(pairs).toBeGreaterThan(0);
  });
});
