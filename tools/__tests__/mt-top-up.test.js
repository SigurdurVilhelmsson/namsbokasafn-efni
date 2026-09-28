/**
 * §C183 — the segment TOP-UP: buy only the EN ids an existing IS file lacks, and splice
 * them in. These are the pure halves (plan, splice); the paid path is
 * api-translate-top-up.test.js.
 *
 * 🔴 THE PROPERTY THAT MATTERS: EVERY SEGMENT ALREADY IN THE IS IS BYTE-IDENTICAL
 * AFTERWARDS. `02-mt-output` holds hand repairs that exist nowhere else (memory
 * `mt-output-hand-repairs`: git is the only index), so a top-up that re-sends or
 * rewrites one silently reverts it. Hence the strongest form of the check: DELETE the
 * inserted chunks from the new text and you get the old text back, byte for byte.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { planTopUp, spliceTopUp } from '../lib/mt-top-up.js';

const require = createRequire(import.meta.url);
const { parseSegmentsMap } = require('../lib/seg-markers.cjs');

const seg = (id, text) => `<!-- SEG:m1:para:${id} -->\n${text}\n\n`;
const ids = (text) => [...parseSegmentsMap(text).keys()];
const id = (short) => `m1:para:${short}`;

/** Remove the recorded insertions from `text`, last first so offsets stay valid. */
function withoutInsertions(text, insertions) {
  let out = text;
  for (const { offset, chunk } of [...insertions].sort((a, b) => b.offset - a.offset)) {
    expect(out.slice(offset, offset + chunk.length)).toBe(chunk);
    out = out.slice(0, offset) + out.slice(offset + chunk.length);
  }
  return out;
}

const EN = seg('a', 'Alpha.') + seg('b', 'Bravo.') + seg('c', 'Charlie.') + seg('d', 'Delta.');

describe('planTopUp — which EN ids the IS lacks', () => {
  it('lists the missing ids in EN order', () => {
    const is = seg('a', 'Alfa.') + seg('c', 'Sjarli.');
    expect(planTopUp(EN, is).missing).toEqual([id('b'), id('d')]);
  });

  it('reports ids the IS carries and the EN no longer has', () => {
    const is = seg('a', 'Alfa.') + seg('x', 'Gamalt.');
    expect(planTopUp(EN, is).extra).toEqual([id('x')]);
  });

  it('puts exactly the missing EN segments on the wire, in EN order, with their EN text', () => {
    const is = seg('a', 'Alfa.') + seg('c', 'Sjarli.');
    const wire = parseSegmentsMap(planTopUp(EN, is).wireText);
    expect([...wire.entries()]).toEqual([
      [id('b'), 'Bravo.'],
      [id('d'), 'Delta.'],
    ]);
  });

  it('terminates the last wire segment even when the EN file ends without a newline', () => {
    const en = seg('a', 'Alpha.') + '<!-- SEG:m1:para:b -->\nBravo.';
    expect(planTopUp(en, seg('a', 'Alfa.')).wireText).toBe('<!-- SEG:m1:para:b -->\nBravo.\n\n');
  });

  it('plans nothing when the IS already carries every EN id', () => {
    const is = seg('a', '1') + seg('b', '2') + seg('c', '3') + seg('d', '4');
    const plan = planTopUp(EN, is);
    expect([plan.missing, plan.wireText]).toEqual([[], '']);
  });

  it('plans a duplicated missing EN id once', () => {
    const en = seg('a', 'Alpha.') + seg('b', 'Bravo.') + seg('b', 'Bravo.');
    expect(planTopUp(en, seg('a', 'Alfa.')).missing).toEqual([id('b')]);
  });
});

describe('spliceTopUp — the existing IS survives byte for byte', () => {
  const IS = seg('a', 'Alfa.') + seg('c', 'Sjarli.');
  const RESPONSE = seg('b', 'Bravó.') + seg('d', 'Delta á íslensku.');

  it('deleting the inserted chunks gives back the old IS exactly', () => {
    const { text, insertions } = spliceTopUp(EN, IS, RESPONSE);
    expect(withoutInsertions(text, insertions)).toBe(IS);
  });

  it('places each new segment after its EN predecessor', () => {
    expect(ids(spliceTopUp(EN, IS, RESPONSE).text)).toEqual([id('a'), id('b'), id('c'), id('d')]);
  });

  it('carries the response text for the new ids and the old text for the rest', () => {
    const got = parseSegmentsMap(spliceTopUp(EN, IS, RESPONSE).text);
    expect(Object.fromEntries(got)).toEqual({
      [id('a')]: 'Alfa.',
      [id('b')]: 'Bravó.',
      [id('c')]: 'Sjarli.',
      [id('d')]: 'Delta á íslensku.',
    });
  });

  it('inserts before the first IS segment when no EN predecessor is in the IS', () => {
    const is = seg('b', 'Bravó.') + seg('c', 'Sjarli.') + seg('d', 'Delta.');
    const { text, insertions } = spliceTopUp(EN, is, seg('a', 'Alfa.'));
    expect([ids(text)[0], withoutInsertions(text, insertions)]).toEqual([id('a'), is]);
  });

  it('keeps consecutive new segments in EN order after one anchor', () => {
    const is = seg('a', 'Alfa.') + seg('d', 'Delta.');
    const { text } = spliceTopUp(EN, is, seg('c', 'Sjarli.') + seg('b', 'Bravó.'));
    expect(ids(text)).toEqual([id('a'), id('b'), id('c'), id('d')]);
  });

  // The committed IS files END WITHOUT A NEWLINE (m68865 ends "—" then EOF). Appending a
  // marker there naively glues `<!-- SEG:` onto the last segment's text — the 2026-09-27
  // hand-repair script failed on exactly this file shape.
  it('appends after an IS that ends without a newline, without gluing the marker on', () => {
    const is = seg('a', 'Alfa.') + seg('b', 'Bravó.') + '<!-- SEG:m1:para:c -->\nSjarli.';
    const { text, insertions } = spliceTopUp(EN, is, seg('d', 'Delta.'));
    expect(text).toBe(`${is}\n\n<!-- SEG:m1:para:d -->\nDelta.`);
    expect(withoutInsertions(text, insertions)).toBe(is);
  });

  it('appends after an IS that ends with a blank line, keeping that ending', () => {
    const is = seg('a', 'Alfa.') + seg('b', 'Bravó.') + seg('c', 'Sjarli.');
    expect(spliceTopUp(EN, is, seg('d', 'Delta.')).text).toBe(is + seg('d', 'Delta.'));
  });

  // The corpus carries BENIGN duplicate seg-ids (seg-markers.cjs, campaign item #15), and
  // parseSegmentsMap's first-wins policy would hide a second copy of the new segment.
  it('inserts a new segment once even when its anchor id is duplicated in the IS', () => {
    const is = seg('a', 'Alfa.') + seg('a', 'Alfa.') + seg('c', 'Sjarli.') + seg('d', 'Delta.');
    const { text } = spliceTopUp(EN, is, seg('b', 'Bravó.'));
    expect(text.split('SEG:m1:para:b ').length - 1).toBe(1);
  });

  it('refuses a response that lacks a planned id', () => {
    expect(() => spliceTopUp(EN, IS, seg('b', 'Bravó.'))).toThrow(/m1:para:d/);
  });

  it('refuses a response that carries an id the IS already has', () => {
    expect(() => spliceTopUp(EN, IS, RESPONSE + seg('a', 'Önnur alfa.'))).toThrow(/m1:para:a/);
  });

  it('refuses when the IS carries an id the EN no longer has — that is drift, not a top-up', () => {
    const is = IS + seg('x', 'Gamalt.');
    expect(() => spliceTopUp(EN, is, RESPONSE)).toThrow(/m1:para:x/);
  });

  it('refuses an IS with no segments — that is a full translation, not a top-up', () => {
    const everything = seg('a', '1') + seg('b', '2') + seg('c', '3') + seg('d', '4');
    expect(() => spliceTopUp(EN, '', everything)).toThrow(/no segments/);
  });
});
