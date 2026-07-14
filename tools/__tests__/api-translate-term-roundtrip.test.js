import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { stripTermFnToPaired, reattachIds, repairSegTags } from '../api-translate.js';

const SEG = (id, body) => `<!-- SEG:${id} -->\n${body}\n`;

describe('stripTermFnToPaired', () => {
  it('rewrites an id-anchored term to paired brackets and captures the id', () => {
    const input = SEG('m1:para:a', 'The [[term:viscosity|term-00001]] of a liquid.');
    const { wireText, segments } = stripTermFnToPaired(input);
    expect(wireText).toContain('[[term]]viscosity[[/term]]');
    expect(wireText).not.toContain('[[term:');
    expect(segments).toHaveLength(1);
    expect(segments[0].segId).toBe('m1:para:a');
    expect(segments[0].termIds).toEqual(['term-00001']);
    expect(segments[0].fnIds).toEqual([]);
    expect(segments[0].originalText).toContain('[[term:viscosity|term-00001]]');
  });

  it('captures a null id for the no-id variant', () => {
    const { segments } = stripTermFnToPaired(SEG('m1:para:b', 'A [[term:mól]] here.'));
    expect(segments[0].termIds).toEqual([null]);
  });

  it('rewrites footnotes and keeps term/fn ids separate', () => {
    const input = SEG('m1:para:c', 'X [[term:t|term-1]] Y [[fn:note|fs-id9]] Z');
    const { wireText, segments } = stripTermFnToPaired(input);
    expect(wireText).toContain('[[term]]t[[/term]]');
    expect(wireText).toContain('[[fn]]note[[/fn]]');
    expect(segments[0].termIds).toEqual(['term-1']);
    expect(segments[0].fnIds).toEqual(['fs-id9']);
  });

  it('preserves nested inline markers inside the term text', () => {
    const input = SEG(
      'm1:para:d',
      'The [[term:activation energy ([[i:E]][[sub:a]])|term-6]] matters.'
    );
    const { wireText, segments } = stripTermFnToPaired(input);
    expect(wireText).toContain('[[term]]activation energy ([[i:E]][[sub:a]])[[/term]]');
    expect(segments[0].termIds).toEqual(['term-6']);
  });

  it('captures ids per-segment in source order across multiple segments', () => {
    const input =
      SEG('m1:para:a', 'A [[term:one|id1]] B') +
      SEG('m1:para:b', 'C [[term:two|id2]] D [[term:three|id3]] E');
    const { segments } = stripTermFnToPaired(input);
    expect(segments.map((s) => s.segId)).toEqual(['m1:para:a', 'm1:para:b']);
    expect(segments[0].termIds).toEqual(['id1']);
    expect(segments[1].termIds).toEqual(['id2', 'id3']);
  });
});

describe('reattachIds', () => {
  it('re-attaches ids by within-segment ordinal', () => {
    const { segments } = stripTermFnToPaired(
      SEG('m1:para:a', 'A [[term:one|id1]] B [[term:two|id2]] C')
    );
    // simulate MT: text between paired brackets translated, delimiters kept
    const wireOut = SEG('m1:para:a', 'Á [[term]]einn[[/term]] B [[term]]tveir[[/term]] C');
    const { text, mismatches } = reattachIds(wireOut, segments);
    expect(text).toContain('[[term:einn|id1]]');
    expect(text).toContain('[[term:tveir|id2]]');
    expect(mismatches).toEqual([]);
  });

  it('emits no-id form when the captured id was null', () => {
    const { segments } = stripTermFnToPaired(SEG('m1:para:b', 'A [[term:mól]] B'));
    const wireOut = SEG('m1:para:b', 'Á [[term]]mól[[/term]] B');
    const { text } = reattachIds(wireOut, segments);
    expect(text).toContain('[[term:mól]]');
    expect(text).not.toContain('[[term:mól|');
  });

  it('re-attaches footnotes independently of terms', () => {
    const { segments } = stripTermFnToPaired(
      SEG('m1:para:c', 'X [[term:t|term-1]] [[fn:note|fs-9]] Z')
    );
    const wireOut = SEG('m1:para:c', 'X [[term]]hugtak[[/term]] [[fn]]neðanmáls[[/fn]] Z');
    const { text, mismatches } = reattachIds(wireOut, segments);
    expect(text).toContain('[[term:hugtak|term-1]]');
    expect(text).toContain('[[fn:neðanmáls|fs-9]]');
    expect(mismatches).toEqual([]);
  });

  it('preserves nested markers in the translated term text', () => {
    const { segments } = stripTermFnToPaired(
      SEG('m1:para:d', 'The [[term:activation energy ([[i:E]][[sub:a]])|term-6]] x')
    );
    const wireOut = SEG('m1:para:d', 'The [[term]]virkjunarorka ([[i:E]][[sub:a]])[[/term]] x');
    const { text } = reattachIds(wireOut, segments);
    expect(text).toContain('[[term:virkjunarorka ([[i:E]][[sub:a]])|term-6]]');
  });

  it('degrades to original markers + records a mismatch when a paired marker is dropped', () => {
    const { segments } = stripTermFnToPaired(
      SEG('m1:para:e', 'A [[term:one|id1]] B [[term:two|id2]] C')
    );
    // simulate a dropped closing/opening: only ONE paired term survives
    const wireOut = SEG('m1:para:e', 'Á [[term]]einn[[/term]] B tveir C');
    const { text, mismatches } = reattachIds(wireOut, segments);
    // segment falls back to ORIGINAL (English, valid markers, correct ids)
    expect(text).toContain('[[term:one|id1]]');
    expect(text).toContain('[[term:two|id2]]');
    expect(mismatches).toEqual([{ segId: 'm1:para:e', type: 'term', expected: 2, got: 1 }]);
  });

  it('degrades a cross-type nested term-inside-fn segment to original + records a nested mismatch', () => {
    // stripTermFnToPaired's bracket-balancing is generic across types, so a
    // [[term:]] whose text sits inside a [[fn:]] round-trips into nested paired
    // form: [[fn]]...[[term]]...[[/term]]...[[/fn]]. termSpans/fnSpans are NOT
    // mutually disjoint here — the naive count-guard would see 1==1 for both
    // types and silently splice, corrupting output.
    const raw = SEG(
      'm1:para:f',
      'The [[fn:this refers to [[term:activation energy|term-1]] concept|fs-1]] here.'
    );
    const { segments } = stripTermFnToPaired(raw);
    // simulate MT: translate the visible words, keep the paired delimiters
    const wireOut = SEG(
      'm1:para:f',
      'The [[fn]]þetta vísar til [[term]]virkjunarorka[[/term]] hugtak[[/fn]] here.'
    );
    const { text, mismatches } = reattachIds(wireOut, segments);
    // whole segment falls back to ORIGINAL (English, valid nested markers, correct ids)
    expect(text).toContain('[[fn:this refers to [[term:activation energy|term-1]] concept|fs-1]]');
    expect(text).not.toContain('[[term]]');
    expect(text).not.toContain('[[/term]]');
    expect(mismatches.length).toBeGreaterThan(0);
    expect(mismatches.some((m) => m.segId === 'm1:para:f' && m.type === 'nested')).toBe(true);
  });

  it('degrades a cross-type nested fn-inside-term segment to original + records a nested mismatch', () => {
    // symmetric case: a [[fn:]] whose text sits inside a [[term:]]
    const raw = SEG(
      'm1:para:g',
      'The [[term:activation energy [[fn:see note|fs-2]] concept|term-2]] here.'
    );
    const { segments } = stripTermFnToPaired(raw);
    const wireOut = SEG(
      'm1:para:g',
      'The [[term]]virkjunarorka [[fn]]sjá athugasemd[[/fn]] hugtak[[/term]] here.'
    );
    const { text, mismatches } = reattachIds(wireOut, segments);
    expect(text).toContain('[[term:activation energy [[fn:see note|fs-2]] concept|term-2]]');
    expect(text).not.toContain('[[fn]]');
    expect(text).not.toContain('[[/fn]]');
    expect(mismatches.length).toBeGreaterThan(0);
    expect(mismatches.some((m) => m.segId === 'm1:para:g' && m.type === 'nested')).toBe(true);
  });

  it('degrades the whole segment + records only the mismatching type when term matches but fn is dropped', () => {
    const { segments } = stripTermFnToPaired(
      SEG('m1:para:h', 'A [[term:one|id1]] B [[fn:note|fs-9]] C')
    );
    // term paired markers survive intact; fn paired markers are dropped entirely
    const wireOut = SEG('m1:para:h', 'Á [[term]]einn[[/term]] B minnispunktur C');
    const { text, mismatches } = reattachIds(wireOut, segments);
    // only the fn type mismatches — term alone would have counted OK
    expect(mismatches).toEqual([{ segId: 'm1:para:h', type: 'fn', expected: 1, got: 0 }]);
    // but the WHOLE segment degrades, including the otherwise-fine term
    expect(text).toContain('[[term:one|id1]]');
    expect(text).toContain('[[fn:note|fs-9]]');
  });
});

describe('translateChunk round-trip (mocked client)', () => {
  // import translateChunk lazily since it is not exported yet in Task 1/2
  it('sends paired form to the API and returns id-anchored translated markers', async () => {
    const { translateChunk } = await import('../api-translate.js');
    const seen = {};
    const fakeClient = {
      async translateAuto(text) {
        seen.text = text;
        // API translates the word between paired brackets, keeps delimiters + SEG
        const out = text.replace('[[term]]viscosity[[/term]]', '[[term]]seigja[[/term]]');
        return { text: out, usage: 1 };
      },
    };
    const chunk = '<!-- SEG:m1:para:a -->\nThe [[term:viscosity|term-00001]] of a liquid.\n';
    const res = await translateChunk(fakeClient, chunk, null, false, 'm1');
    expect(seen.text).toContain('[[term]]viscosity[[/term]]'); // API saw paired form
    expect(seen.text).not.toContain('[[term:'); // id did NOT ride the wire
    expect(res.text).toContain('[[term:seigja|term-00001]]'); // returned id-anchored + translated
    expect(res.mismatches).toEqual([]);
  });
});

describe('translateModule surfaces reattach mismatches', () => {
  it('returns mismatches from a chunk whose paired marker was dropped', async () => {
    const { translateModule } = await import('../api-translate.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b4d11-'));
    const inPath = path.join(dir, 'm9-segments.en.md');
    const outPath = path.join(dir, 'm9-segments.is.md');
    fs.writeFileSync(inPath, '<!-- SEG:m9:para:a -->\nA [[term:one|id1]] and [[term:two|id2]].\n');
    const fakeClient = {
      async translateAuto(text) {
        // drop the first closing delimiter → only 1 paired term parses vs 2 ids → count-guard trips
        return { text: text.replace('[[/term]]', ''), usage: 1 };
      },
    };
    const res = await translateModule(fakeClient, inPath, outPath, null, false);
    expect(res.mismatches.length).toBeGreaterThan(0);
    // on-disk output degraded that segment to original (valid markers, correct ids)
    const written = fs.readFileSync(outPath, 'utf8');
    expect(written).toContain('[[term:one|id1]]');
  });
});

// ─── Finding A: repairSegTags must run BEFORE reattachIds ─────────────────
//
// reattachIds looks up captured term/fn ids by the SEG id that rode the wire.
// If the API mangles a numeric SEG id (e.g. m68683 -> m6-8683) on a
// term-bearing segment, and reattachIds runs first, its lookup misses (the
// mangled id isn't in the map) and it passes the segment through UNCHANGED —
// leaking colon-less paired [[term]]...[[/term]] wire form into the on-disk
// output, with no mismatch recorded. repairSegTags exists precisely to fix
// this class of mangle; it must run first so reattachIds sees a clean id.
describe('translateChunk reorders repairSegTags before reattachIds (Finding A.1)', () => {
  it('repairs a mangled numeric SEG id before reattaching term ids — no colon-less leak', async () => {
    const { translateChunk } = await import('../api-translate.js');
    const chunk = '<!-- SEG:m68683:para:x -->\nThe [[term:viscosity|term-00001]] of a liquid.\n';
    const fakeClient = {
      async translateAuto(text) {
        // Málstaður occasionally inserts a hyphen into a numeric module id —
        // this exact mangle is what repairSegTags's Strategy 1 repairs (see
        // 'fixes hyphenated module IDs in SEG tags' in api-translate.test.js).
        let out = text.replace('<!-- SEG:m68683:para:x -->', '<!-- SEG:m6-8683:para:x -->');
        out = out.replace('[[term]]viscosity[[/term]]', '[[term]]seigja[[/term]]');
        return { text: out, usage: 1 };
      },
    };
    const res = await translateChunk(fakeClient, chunk, null, false, 'm68683');

    // Correctly re-attached, id preserved.
    expect(res.text).toContain('[[term:seigja|term-00001]]');
    // No leaked wire-only (colon-less) paired form.
    expect(res.text).not.toContain('[[term]]');
    expect(res.text).not.toContain('[[/term]]');
    // SEG id repaired back to the clean, original form.
    expect(res.text).toContain('<!-- SEG:m68683:para:x -->');
    expect(res.text).not.toContain('m6-8683');
    // repairSegTags fixed the id before reattachIds ran, so no mismatch.
    expect(res.mismatches).toEqual([]);
  });
});

// ─── Finding A.2: leak-guard backstop in translateModule ──────────────────
//
// The reorder (A.1) closes the common case, but a SEG-id mangle that
// repairSegTags itself cannot repair would still cause reattachIds to miss —
// leaking a colon-less [[term]]/[[fn]] wire token all the way to disk.
// translateModule must refuse to write in that case instead of silently
// producing a format cnxml-inject.js cannot parse (inject only recognizes
// the colon form [[term:...|id]]).
describe('translateModule leak guard refuses to write a wire-only paired marker (Finding A.2)', () => {
  const mangledInput = '<!-- SEG:m68664:para:1 -->\nA [[term:one|id1]].\n';
  const mangledOutput = '<!-- SEG:m99999:para:1 -->\nA [[term]]einn[[/term]].\n';

  it('precondition: repairSegTags cannot repair this SEG-id mangle', () => {
    // Same shape as the existing 'does not modify tags that cannot be
    // matched' case in api-translate.test.js: same suffix, but the module id
    // shares no digits with the original, so neither repair strategy fires.
    expect(repairSegTags(mangledInput, mangledOutput)).toBe(mangledOutput);
  });

  it('throws instead of writing when a wire-only paired marker survives to write', async () => {
    const { translateModule } = await import('../api-translate.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b4d11-leak-'));
    const inPath = path.join(dir, 'm68664-segments.en.md');
    const outPath = path.join(dir, 'm68664-segments.is.md');
    fs.writeFileSync(inPath, mangledInput);
    const fakeClient = {
      async translateAuto(text) {
        let out = text.replace('<!-- SEG:m68664:para:1 -->', '<!-- SEG:m99999:para:1 -->');
        out = out.replace('[[term]]one[[/term]]', '[[term]]einn[[/term]]');
        return { text: out, usage: 1 };
      },
    };

    await expect(translateModule(fakeClient, inPath, outPath, null, false)).rejects.toThrow(
      /m68664/
    );
    expect(fs.existsSync(outPath)).toBe(false);
  });
});

// ─── T4: mismatch-bearing chapters must not be reported complete ──────────
describe('computeCompleteChapters (T4 — mismatch chapters excluded from completion)', () => {
  it('excludes a chapter that reported a mismatch even though its module "succeeded"', async () => {
    const { computeCompleteChapters } = await import('../api-translate.js');
    const succeeded = new Set(['ch01', 'ch02']);
    const failed = new Set();
    const mismatched = new Set(['ch02']);
    expect(computeCompleteChapters(succeeded, failed, mismatched)).toEqual(['ch01']);
  });

  it('mirrors the existing failedChapters exclusion (both filters combine)', async () => {
    const { computeCompleteChapters } = await import('../api-translate.js');
    const succeeded = new Set(['ch01', 'ch02', 'ch03']);
    const failed = new Set(['ch02']);
    const mismatched = new Set(['ch03']);
    expect(computeCompleteChapters(succeeded, failed, mismatched)).toEqual(['ch01']);
  });
});
