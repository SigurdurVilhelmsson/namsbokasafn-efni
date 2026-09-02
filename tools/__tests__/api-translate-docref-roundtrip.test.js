/**
 * `[[docref:text|doc#target]]` must reach the paid MT as TRANSLATABLE PROSE
 * (§C118 ⑯ — the fifth site, and the second one on the leg that costs money).
 *
 * 🔴 WHAT IS BROKEN, AND WHY EVERY EXISTING CHECK SAID IT WAS FINE.
 * A segment whose entire content is one `[[docref:…|…]]` marker comes back from
 * Málstaður VERBATIM. Measured on the 2026-09-01 paid run, organic ch03 m00038:
 * 36 of 36 — a SATURATED rate, so it is a CATEGORY, not a sample. These are the
 * chapter's key-term index labels, so the failure is reader-visible English
 * inside an Icelandic chapter; `05-publication/mt-preview/chapters/03/
 * 3-key-terms.html` carries all 36 English anchors today.
 *
 * Nothing saw it, and each instrument was right to be silent:
 *   - `validateMarkers` compares SEG COUNTS ONLY.
 *   - `bracketMarkerDelta` counts `[[docref:` on BOTH sides; an untranslated
 *     marker is still a marker, so the tally cancels to `{}`.
 *   - the residue check saw 2 of the 36 — an 18x understatement, so its count is
 *     never the exposure.
 *   - inject and render are innocent: they carry the English through faithfully.
 * ▶ A COUNT CANNOT SEE A SUBSTITUTION THAT DID NOT HAPPEN. Every assertion below
 *   that matters compares VALUES.
 *
 * 🔴 THE MECHANISM IS NOT "THE API TREATS BRACKETS AS OPAQUE" — that premise is
 * false and there is a counter-example in the SAME run: `[[span:Strategy|
 * red-text]]` came back `[[span:Aðferð|red-text]]`, translated, class preserved.
 * So opacity is model behaviour we do not control, and the fix has to be
 * structural rather than a hope.
 *
 * ✅ THE CONTROL WAS ALREADY IN THE CORPUS, which is what makes this a finding
 * rather than a suspicion. `term` has the IDENTICAL shape — prose `|` opaque-id —
 * and differs in exactly one way: it rides the wire in paired
 * `[[term]]text[[/term]]` form. Measured over the same run, by value:
 *     term   piped, inline : 1/39 and 0/20 English survived  -> translates
 *     docref piped, whole  : 36/36 English survived          -> never translates
 *     docref BARE (no `|`) : 5/5 English survived            -> CORRECT
 * The third row is the negative control and it is load-bearing: in a bare
 * `[[docref:m00164]]` the sole field IS the document id, and translating it
 * would be the defect. So the rewrite is gated on a TOP-LEVEL `|`, which
 * inverts term/fn's convention (a term with no id is still rewritten).
 *
 * ⚠️ THE GATE MUST BE DEPTH-AWARE. 116 corpus docrefs carry a nested marker in
 * their link text (`[[docref:acetal, R[[sub:2]]C(OR′)[[sub:2]]|m00221#term-00001]]`).
 * A naive `[^\]]*` predicate classifies ALL 116 as bare — silently exempting
 * exactly the markers this fix exists to rewrite — while the total marker count
 * matches perfectly. That is why the corpus anchor at the bottom asserts on the
 * VALUE that reaches the wire and not on a tally.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { stripTermFnToPaired, reattachIds, translateChunk } from '../api-translate.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const KEPT_BOOKS = ['efnafraedi-2e', 'lifraen-efnafraedi'];

const SEG = (id, body) => `<!-- SEG:${id} -->\n${body}\n`;

// ─── Unit: the wire rewrite ───────────────────────────────────────────────

describe('stripTermFnToPaired — docref (§C118 ⑯)', () => {
  it('rewrites an id-anchored docref to paired brackets and captures the id', () => {
    const input = SEG('m00038:item:list-00001-item-1', '[[docref:alcohol|m00032#term-00006]]');
    const { wireText, segments } = stripTermFnToPaired(input);
    expect(wireText).toContain('[[docref]]alcohol[[/docref]]');
    expect(wireText).not.toContain('[[docref:');
    expect(segments[0].docrefIds).toEqual(['m00032#term-00006']);
  });

  it('leaves a BARE docref opaque — its only field IS the document reference', () => {
    // Positive control in the SAME assertion: the piped sibling MUST be
    // rewritten, so a blanket "rewrite nothing" cannot satisfy this test.
    const input = SEG(
      'm1:para:a',
      'See [[docref:m00164]] and [[docref:alkane|m00033#term-00001]].'
    );
    const { wireText, segments } = stripTermFnToPaired(input);
    expect(wireText).toContain('[[docref:m00164]]'); // bare: untouched
    expect(wireText).toContain('[[docref]]alkane[[/docref]]'); // piped: rewritten
    expect(segments[0].docrefIds).toEqual(['m00033#term-00001']); // only the piped one
  });

  it('rewrites a docref whose link text carries nested markers (depth-aware)', () => {
    const input = SEG(
      'm1:item:x',
      '[[docref:acetal, R[[sub:2]]C(OR′)[[sub:2]]|m00221#term-00001]]'
    );
    const { wireText, segments } = stripTermFnToPaired(input);
    expect(wireText).toContain('[[docref]]acetal, R[[sub:2]]C(OR′)[[sub:2]][[/docref]]');
    expect(segments[0].docrefIds).toEqual(['m00221#term-00001']);
  });

  it('keeps term, fn and docref ids in separate fields', () => {
    const input = SEG('m1:para:c', 'X [[term:t|term-1]] Y [[fn:n|fs-9]] Z [[docref:d|m1#t1]]');
    const { segments } = stripTermFnToPaired(input);
    expect(segments[0].termIds).toEqual(['term-1']);
    expect(segments[0].fnIds).toEqual(['fs-9']);
    expect(segments[0].docrefIds).toEqual(['m1#t1']);
  });
});

// ─── Unit: the return leg ─────────────────────────────────────────────────

describe('reattachIds — docref (§C118 ⑯)', () => {
  it('restores on-disk form with the TRANSLATED link text', () => {
    const { segments } = stripTermFnToPaired(
      SEG('m00038:item:list-00001-item-1', '[[docref:alcohol|m00032#term-00006]]')
    );
    const wireOut = SEG('m00038:item:list-00001-item-1', '[[docref]]alkóhól[[/docref]]');
    const { text, mismatches } = reattachIds(wireOut, segments);
    expect(text).toContain('[[docref:alkóhól|m00032#term-00006]]');
    expect(mismatches).toEqual([]);
  });

  it('re-attaches ids by within-segment ordinal across two docrefs', () => {
    const { segments } = stripTermFnToPaired(
      SEG('m1:para:a', 'A [[docref:one|m1#a]] B [[docref:two|m2#b]] C')
    );
    const wireOut = SEG('m1:para:a', 'Á [[docref]]einn[[/docref]] B [[docref]]tveir[[/docref]] C');
    const { text } = reattachIds(wireOut, segments);
    expect(text).toContain('[[docref:einn|m1#a]]');
    expect(text).toContain('[[docref:tveir|m2#b]]');
  });

  it('degrades to the original + records a docref mismatch when a delimiter is dropped', () => {
    const { segments } = stripTermFnToPaired(
      SEG('m1:para:e', 'A [[docref:one|m1#a]] B [[docref:two|m2#b]] C')
    );
    const wireOut = SEG('m1:para:e', 'Á [[docref]]einn[[/docref]] B tveir C');
    const { text, mismatches } = reattachIds(wireOut, segments);
    expect(text).toContain('[[docref:one|m1#a]]');
    expect(text).toContain('[[docref:two|m2#b]]');
    expect(mismatches).toEqual([{ segId: 'm1:para:e', type: 'docref', expected: 2, got: 1 }]);
  });

  it('degrades a cross-type nested term-inside-docref segment with a nested mismatch', () => {
    // The corpus holds 0 of these today (measured over 40,405 segments, with a
    // detector proven to fire on synthetic input). The guard exists because the
    // splice assumes mutually disjoint spans and corrupts SILENTLY when they are
    // not — a count-guard cannot see it, since each type's count still matches.
    const raw = SEG('m1:para:f', 'The [[docref:see [[term:alkane|term-1]] here|m1#t1]] x');
    const { segments } = stripTermFnToPaired(raw);
    const wireOut = SEG('m1:para:f', 'The [[docref]]sjá [[term]]alkan[[/term]] hér[[/docref]] x');
    const { text, mismatches } = reattachIds(wireOut, segments);
    expect(text).toContain('[[docref:see [[term:alkane|term-1]] here|m1#t1]]');
    expect(text).not.toContain('[[docref]]');
    expect(mismatches.some((m) => m.segId === 'm1:para:f' && m.type === 'nested')).toBe(true);
  });
});

// ─── The chunk round trip, with a stub wire ───────────────────────────────

describe('translateChunk sends docref prose to the API and returns it id-anchored', () => {
  it('the wire carries paired form; the id never rides it', async () => {
    const seen = {};
    const fakeClient = {
      async translateAuto(text) {
        seen.text = text;
        return {
          text: text.replace('[[docref]]alcohol[[/docref]]', '[[docref]]alkóhól[[/docref]]'),
          usage: 1,
        };
      },
    };
    const chunk = SEG('m00038:item:list-00001-item-1', '[[docref:alcohol|m00032#term-00006]]');
    const res = await translateChunk(fakeClient, chunk, null, false, 'm00038');
    expect(seen.text).toContain('[[docref]]alcohol[[/docref]]');
    expect(seen.text).not.toContain('m00032#term-00006'); // the id did NOT ride the wire
    expect(res.text).toContain('[[docref:alkóhól|m00032#term-00006]]');
    expect(res.mismatches).toEqual([]);
  });
});

// ─── The fail-loud backstop ───────────────────────────────────────────────

describe('translateModule refuses to write a wire-only [[docref]] (Finding A.2, docref twin)', () => {
  // The term/fn half of this guard has existed since B4-D11. Widening the paired
  // rewrite WITHOUT widening the guard would ship a §C118-shaped hole: a
  // colon-less [[docref]] that reattachIds failed to re-anchor reaches disk,
  // where cnxml-inject.js recognises only the colon form and would drop the
  // link entirely — and NO mismatch is recorded on the lookup-miss path, so the
  // run would exit 0 and mark the chapter complete.
  it('throws instead of writing when a colon-less docref survives to write', async () => {
    const { translateModule } = await import('../api-translate.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c118-docref-leak-'));
    const inPath = path.join(dir, 'm68664-segments.en.md');
    const outPath = path.join(dir, 'm68664-segments.is.md');
    fs.writeFileSync(inPath, SEG('m68664:item:1', '[[docref:alcohol|m00032#term-00006]]'));
    const fakeClient = {
      async translateAuto(text) {
        // Mangle the SEG id beyond repairSegTags' reach, so reattachIds' lookup
        // misses and the paired wire form passes through untouched.
        let out = text.replace('<!-- SEG:m68664:item:1 -->', '<!-- SEG:m99999:item:1 -->');
        out = out.replace('[[docref]]alcohol[[/docref]]', '[[docref]]alkóhól[[/docref]]');
        return { text: out, usage: 1 };
      },
    };
    await expect(translateModule(fakeClient, inPath, outPath, null, false)).rejects.toThrow(
      /m68664/
    );
    expect(fs.existsSync(outPath)).toBe(false);
  });
});

// ─── The corpus anchor ────────────────────────────────────────────────────

/** Every `*-segments.en.md` the tool actually reads, for the two kept books. */
function keptBookSegmentFiles() {
  const out = [];
  for (const book of KEPT_BOOKS) {
    const root = path.join(REPO_ROOT, 'books', book, '02-for-mt');
    if (!fs.existsSync(root)) continue;
    for (const chapter of fs.readdirSync(root)) {
      const dir = path.join(root, chapter);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const f of fs.readdirSync(dir)) {
        // Mirrors discoverModules' m\d+ filter plus the two explicitly
        // discovered non-module units; excludes the 12,026 .backup.* files,
        // which the tool never reads and which hold a different vintage.
        if (/^(m\d+|exercises|chapter-metadata)-segments\.en\.md$/.test(f)) {
          out.push(path.join(dir, f));
        }
      }
    }
  }
  return out;
}

/**
 * A `[[docref:` that is still colon-form on the wire is legitimate ONLY when its
 * whole payload is a bare document reference.
 *
 * ⚠️ This predicate is deliberately NOT a second copy of the production
 * depth-scan — two implementations of one rule disagree, and the disagreement
 * would be invisible here. It asserts on the VALUE SHAPE instead: a module id,
 * optionally `#target`. The non-greedy `[^\n]*?` truncates on a nested marker,
 * and that is safe in the only direction that matters — a truncated capture can
 * only FAIL the bare-shape test, never pass it. So the check can report a false
 * red, never a false green.
 */
const BARE_DOCREF_PAYLOAD = /^m\d+(#[^\]|]+)?$/;

function leakedProseDocrefs(wireText) {
  const bad = [];
  for (const m of wireText.matchAll(/\[\[docref:([^\n]*?)\]\]/g)) {
    if (!BARE_DOCREF_PAYLOAD.test(m[1])) bad.push(m[1]);
  }
  return bad;
}

describe('CORPUS ANCHOR — no prose docref rides the wire opaque (§C118 ⑯)', () => {
  it('the leak detector fires on a synthetic prose docref and passes a bare one', () => {
    // The instrument control. Without it, a corpus sweep that found nothing
    // would be indistinguishable from a detector that cannot see anything.
    expect(leakedProseDocrefs('x [[docref:alcohol|m00032#term-00006]] y')).toEqual([
      'alcohol|m00032#term-00006',
    ]);
    expect(leakedProseDocrefs('x [[docref:acetal, R[[sub:2]]C|m1#t1]] y').length).toBe(1);
    expect(leakedProseDocrefs('x [[docref:m00164]] [[docref:m68674#fs-id1]] y')).toEqual([]);
  });

  it('every prose docref in the kept books becomes a paired wire span', () => {
    const files = keptBookSegmentFiles();
    let paired = 0;
    let bare = 0;
    const leaks = [];
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      if (!text.includes('[[docref:')) continue;
      const { wireText, segments } = stripTermFnToPaired(text);
      for (const s of segments) paired += s.docrefIds.length;
      bare += (wireText.match(/\[\[docref:/g) || []).length;
      for (const payload of leakedProseDocrefs(wireText)) {
        leaks.push(`${path.relative(REPO_ROOT, file)}: [[docref:${payload}]]`);
      }
    }
    // Non-vacuity, BOTH populations — computed over the whole corpus rather
    // than over the firing set, so neither guard can die with the thing it
    // guards. A repaired corpus must not read as a passing sweep.
    expect(files.length).toBeGreaterThan(100);
    expect(paired).toBeGreaterThan(500); // the prose docrefs the fix exists for
    expect(bare).toBeGreaterThan(50); // the bare ones it must NOT touch
    expect(leaks).toEqual([]);
  });

  it('the wire rewrite is lossless — an identity MT round-trips the corpus byte-exact', () => {
    // The other half of the anchor: proving prose reaches the model is worth
    // nothing if the return leg mangles it. An identity wire is free, needs no
    // network, and makes any loss provably OURS rather than the model's.
    const files = keptBookSegmentFiles();
    const damaged = [];
    let checked = 0;
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      if (!text.includes('[[docref:')) continue;
      const { wireText, segments } = stripTermFnToPaired(text);
      const { text: back, mismatches } = reattachIds(wireText, segments);
      checked++;
      if (back !== text || mismatches.length > 0) {
        damaged.push(`${path.relative(REPO_ROOT, file)} (${mismatches.length} mismatches)`);
      }
    }
    expect(checked).toBeGreaterThan(50); // non-vacuity: the sweep really ran
    expect(damaged).toEqual([]);
  });
});

// ─── End to end on the real module, with an OPAQUE stub wire ──────────────

describe('END TO END — m00038 through translateModule with an opaque-model stub', () => {
  /**
   * Models what the paid API measurably DOES: translate bare prose, leave
   * `[[type:…]]` tokens alone. "Translation" is uppercasing, so a link text that
   * never became bare prose is VISIBLY untranslated in the output.
   *
   * ⚠️ An IDENTITY wire cannot settle this question — byte-identity is satisfied
   * BY THE BUG. The pass condition has to be that the text CHANGED.
   */
  const opaqueClient = {
    async translateAuto(text) {
      const out = text
        .split(/(<!-- SEG:\S+ -->|\[\[[^\]]*\]\])/)
        .map((part, i) => (i % 2 === 1 ? part : part.toUpperCase()))
        .join('');
      return { text: out, usage: { units: text.length, cost: 0 } };
    },
  };

  it('all 36 key-term docref labels reach the model, with term as the positive control', async () => {
    const { translateModule } = await import('../api-translate.js');
    const inPath = path.join(
      REPO_ROOT,
      'books/lifraen-efnafraedi/02-for-mt/ch03/m00038-segments.en.md'
    );
    if (!fs.existsSync(inPath)) return; // corpus not present — nothing to assert
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c118-docref-e2e-'));
    const outPath = path.join(dir, 'm00038-segments.is.md');

    await translateModule(opaqueClient, inPath, outPath, null, false);
    const written = fs.readFileSync(outPath, 'utf8');

    const reached = (marker) => {
      // A link text REACHED the model iff it came back uppercased.
      const bodies = [...written.matchAll(new RegExp(`\\[\\[${marker}:([^\\n|]*)\\|`, 'g'))].map(
        (m) => m[1]
      );
      return {
        total: bodies.length,
        translated: bodies.filter((b) => /[A-Z]/.test(b) && b === b.toUpperCase()).length,
      };
    };

    const docref = reached('docref');
    const term = reached('term');
    expect(docref.total).toBe(36); // the population, pinned
    expect(docref.translated).toBe(36); // THE DEFECT: 0 before this fix
    expect(term.total).toBeGreaterThan(0); // control is non-vacuous
    expect(term.translated).toBe(term.total); // control still works
    // And nothing leaked to disk in wire form.
    expect(written).not.toContain('[[docref]]');
    expect(written).not.toContain('[[/docref]]');
  });
});
