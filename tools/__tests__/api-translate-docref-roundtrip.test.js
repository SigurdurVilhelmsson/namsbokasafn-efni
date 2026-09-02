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
    // ⚠️ INLINE fixture on purpose: since §C118 ⑲ a WHOLE-SEGMENT marker rides
    // the wire bare, so a whole-segment fixture would exercise the other path.
    const input = SEG('m1:p:a', 'See [[docref:alcohol|m00032#term-00006]] for details.');
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
    // ⚠️ INLINE fixture on purpose: since §C118 ⑲ a WHOLE-SEGMENT marker rides
    // the wire bare, so a whole-segment fixture would exercise the other path.
    const input = SEG(
      'm1:item:x',
      'An [[docref:acetal, R[[sub:2]]C(OR′)[[sub:2]]|m00221#term-00001]] group.'
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
      SEG('m1:p:b', 'See [[docref:alcohol|m00032#term-00006]] for details.')
    );
    const wireOut = SEG('m1:p:b', 'Sjá [[docref]]alkóhól[[/docref]] nánar.');
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

// ─── The payload guard: a model-authored inner must not corrupt the id ────

describe('reattachIds refuses a docref payload that would corrupt the document id', () => {
  // Before §C118 ⑯ no docref payload was ever model-authored — the marker rode
  // the wire opaque and came back verbatim, 36 of 36. The paired rewrite makes
  // 704 of them model output, and `docref`'s `|` is STRUCTURAL: `cnxml-inject.js`
  // splits on it to build `document=`. `term`/`fn` are immune because inject's
  // id character class excludes `|`, so docref inherited the wire mechanism
  // without that backstop. Measured, both shapes reach a bogus cross-reference
  // with every other guard green — count matches (1 span, 1 id), delta cancels
  // to {}, and the marker IS consumed at inject so the residue gate sees nothing.
  it('degrades when the model returns an EMPTY span', () => {
    const { segments } = stripTermFnToPaired(
      SEG('m1:item:1', 'See [[docref:alcohol|m00032#term-00006]] here.')
    );
    const { text, mismatches } = reattachIds(
      SEG('m1:item:1', 'Sjá [[docref]][[/docref]] hér.'),
      segments
    );
    // Would otherwise have written `[[docref:|m00032#term-00006]]`, which inject
    // resolves to `<link document="|m00032" target-id="term-00006"/>`.
    expect(text).toContain('[[docref:alcohol|m00032#term-00006]]');
    expect(text).not.toContain('[[docref:|');
    expect(mismatches).toEqual([
      { segId: 'm1:item:1', type: 'docref-payload', expected: 0, got: 1 },
    ]);
  });

  it('degrades when the model puts a bare `|` inside the translated text', () => {
    const { segments } = stripTermFnToPaired(
      SEG('m1:item:2', 'See [[docref:alcohol|m00032#term-00006]] here.')
    );
    const { text, mismatches } = reattachIds(
      SEG('m1:item:2', 'Sjá [[docref]]al|kóhól[[/docref]] hér.'),
      segments
    );
    // Would otherwise have written `[[docref:al|kóhól|m00032#term-00006]]`, which
    // inject splits at the FIRST pipe: `<link document="kóhól|m00032" …>al</link>`.
    expect(text).toContain('[[docref:alcohol|m00032#term-00006]]');
    expect(mismatches.some((m) => m.type === 'docref-payload')).toBe(true);
  });

  it('does NOT degrade an ordinary translation, nor a nested-marker payload', () => {
    // The control. Without it, "degrade on a bad payload" is satisfiable by
    // degrading everything, which would silently restore the original defect.
    const { segments } = stripTermFnToPaired(
      SEG('m1:item:3', 'An [[docref:acetal, R[[sub:2]]C|m00221#term-00001]] group.')
    );
    const { text, mismatches } = reattachIds(
      SEG('m1:item:3', 'Einn [[docref]]asetal, R[[sub:2]]C[[/docref]] hópur.'),
      segments
    );
    expect(text).toContain('[[docref:asetal, R[[sub:2]]C|m00221#term-00001]]');
    expect(mismatches).toEqual([]);
  });

  it('leaves term/fn payloads unguarded — their pipe is not structural at inject', () => {
    // Scoped to PAIRED_REQUIRES_ID on purpose: a term legitimately has no id,
    // and inject's term id class excludes `|`, so the same payload is harmless.
    const { segments } = stripTermFnToPaired(SEG('m1:para:4', 'A [[term:one|term-1]] B'));
    const { mismatches } = reattachIds(SEG('m1:para:4', 'Á [[term]]ei|nn[[/term]] B'), segments);
    expect(mismatches).toEqual([]);
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
    const chunk = SEG('m1:p:c', 'See [[docref:alcohol|m00032#term-00006]] for details.');
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
    // Inline: a whole-segment marker now rides bare, so it can never produce the
    // colon-less wire token this guard exists to catch.
    fs.writeFileSync(
      inPath,
      SEG('m68664:item:1', 'See [[docref:alcohol|m00032#term-00006]] here.')
    );
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

/**
 * Every `*-segments.en.md` the tool actually reads, for the two kept books.
 *
 * ⚠️ THROWS on a missing book root rather than skipping it. A `continue` here
 * was measured to let the whole of efnafraedi-2e drop out of the sweep with
 * every non-vacuity guard still satisfied by lifraen-efnafraedi alone — a
 * silently halved population reading as a full pass.
 */
function keptBookSegmentFiles() {
  const out = [];
  for (const book of KEPT_BOOKS) {
    const root = path.join(REPO_ROOT, 'books', book, '02-for-mt');
    if (!fs.existsSync(root)) throw new Error(`corpus anchor: missing book root ${root}`);
    const before = out.length;
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
    // Per-book floor: a book present but EMPTY is the same silent halving.
    if (out.length - before < 100) {
      throw new Error(`corpus anchor: ${book} contributed only ${out.length - before} files`);
    }
  }
  return out;
}

/** Colon-form docrefs whose whole payload is a bare document reference. */
function countBareDocrefs(text) {
  let n = 0;
  for (const m of text.matchAll(/\[\[docref:([^\n]*?)\]\]/g)) {
    if (BARE_DOCREF_PAYLOAD.test(m[1])) n++;
  }
  return n;
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
 *
 * 🔴 THAT SAFETY PROPERTY IS ONLY TRUE BECAUSE `[` IS EXCLUDED, AND IT WAS NOT
 * UNTIL AN ADVERSARIAL REVIEW MEASURED IT. The target-id class was `[^\]|]+`,
 * which excludes `]` and `|` but ALLOWS `[` — so a prose docref whose link text
 * happened to begin `m<digits>#` and carried a nested marker truncated to
 * something that MATCHED, and the detector returned a false GREEN for a marker
 * that never reached the model:
 *     `[[docref:m00164#see [[i:this]] table|m00221#term-00001]]`
 *          truncates to  `m00164#see [[i:this`  -> matched the old shape
 * 0 corpus instances today, so this was latent — but the sentence above states
 * the property ABSOLUTELY, and a future reader would rely on it once the corpus
 * moved. ▶ A DOCSTRING ASSERTING A SAFETY PROPERTY IS A CLAIM, NOT A GUARANTEE;
 * the exact counter-example is pinned as a test below, so the claim is now
 * checked rather than asserted.
 */
const BARE_DOCREF_PAYLOAD = /^m\d+(#[^\]|[]+)?$/;

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

  it('a truncated capture cannot pass the bare-shape test — the false-GREEN case', () => {
    // The docstring above claims the truncation is safe in one direction only.
    // That was FALSE while the target-id class allowed `[`: this prose docref,
    // truncated at the nested marker, matched the bare shape and the detector
    // reported clean for a marker that never reached the model. 0 corpus
    // instances, so it is the claim being pinned, not a live defect.
    const leak = '[[docref:m00164#see [[i:this]] table|m00221#term-00001]]';
    expect(leakedProseDocrefs(`x ${leak} y`).length).toBe(1);
    // Control, same command: the shapes that MUST still read clean.
    expect(leakedProseDocrefs('x [[docref:m00164#term-00006]] y')).toEqual([]);
  });

  it('every prose docref becomes a paired span AND every bare one survives, count for count', () => {
    const files = keptBookSegmentFiles();
    let paired = 0;
    let wholeBare = 0;
    let bareOnDisk = 0;
    let bareOnWire = 0;
    const leaks = [];
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      if (!text.includes('[[docref:')) continue;
      const { wireText, segments } = stripTermFnToPaired(text);
      for (const s of segments) {
        paired += s.docrefIds.length;
        if (s.wholeSegment && s.wholeSegment.type === 'docref') wholeBare++;
      }
      bareOnDisk += countBareDocrefs(text);
      bareOnWire += countBareDocrefs(wireText);
      for (const payload of leakedProseDocrefs(wireText)) {
        leaks.push(`${path.relative(REPO_ROOT, file)}: [[docref:${payload}]]`);
      }
    }
    // Non-vacuity for the whole sweep, computed over the corpus rather than
    // over the firing set, so neither guard can die with the thing it guards.
    // ⚠️ The exact SPLIT, not a threshold: §C118 ⑲ moved 532 of the 704 prose
    // docrefs from paired to bare, and a `> 500` floor silently accepted that
    // shift when it happened. An equality states the whole population.
    expect(files.length).toBeGreaterThan(100);
    expect(paired).toBe(172); // inline — still paired on the wire
    expect(wholeBare).toBe(532); // whole-segment — bare on the wire (⑲)
    expect(paired + wholeBare).toBe(704); // every prose docref, accounted for
    expect(bareOnDisk).toBeGreaterThan(50);

    // `leaks` catches UNDER-rewriting: a prose docref still colon-form on the
    // wire. It is structurally blind to OVER-rewriting, because a wrongly
    // rewritten bare docref leaves the inspected set entirely — and the
    // identity round-trip below cannot see it either, since a bare marker
    // captured with a null id reattaches byte-identically. So the gate needs
    // its own conservation law, in the other direction:
    expect(bareOnWire).toBe(bareOnDisk);
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
    // A silent `return` here would turn the ONLY test that runs the real
    // translateModule over real corpus into a green no-op — measured: with the
    // fix reverted and this file merely RENAMED, the run went 12 red -> 11 red
    // and this test reported PASS against fully defective code.
    expect(fs.existsSync(inPath)).toBe(true);
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

// ─── §C118 ⑲ — a WHOLE-SEGMENT marker rides the wire as BARE TEXT ──────────

/**
 * 🔴 WHY THIS EXISTS: ⑯'s PAIRED FORM CAUSED A NEW READER-VISIBLE DEFECT.
 * Two paid re-buys of organic ch03 m00038 came back with ~30 INVENTED `[[b:]]`
 * markers across the same two summary paragraphs (`b +29`, then `b +31`), while
 * the run before ⑯ shipped was clean at `b 21 = 21`. The English is
 * BYTE-IDENTICAL across all three runs — the wire form is the only variable.
 * The module is ONE chunk, so 36 consecutive `[[docref]]term[[/docref]]` index
 * items ride in the same request as the prose, and the model copies the pattern.
 *
 * ▶ IT IS THE PAIRED SYNTAX, NOT THE WHOLE-SEGMENT SHAPE, AND TWO CONTROLS SAY SO:
 *   · the clean run's wire ALSO carried 36 whole-segment docrefs and 6
 *     whole-segment bolds — in colon form — and invented nothing;
 *   · m00038's two whole-segment `[[span:Strategy|red-text]]` markers TRANSLATED
 *     INSIDE THEMSELVES in that same clean run (`Aðferð`, `Lausn`).
 * So a whole-segment marker is inert as a primer; the paired delimiters are not.
 *
 * ▶ THE FIX: when a segment's entire body is one marker of a paired type, send
 * the PAYLOAD ALONE and re-wrap the whole body on return. Placement is
 * unambiguous by construction — the segment IS the marker — and it removes
 * marker syntax from the wire for 532 of the 704, leaving no pattern to copy.
 * Evidence it still translates was already paid for: probe T1.22's control
 * segment 4 was a bare one-word segment, `alcohol` -> `alkóhól`.
 *
 * ⚠️ STRUCTURAL, NOT `docref`-SPECIFIC. Any PAIRED_WIRE_TYPES marker that is the
 * whole body goes bare. Today the corpus holds 532 docref and 0 term/fn; the
 * rule must not need editing when that changes. And it CANNOT touch the 2,304
 * whole-segment `[[MEDIA:]]`, 679 `[[MATH:]]` or 2 `[[TABLE:]]` — those are
 * opaque placeholders, and they are safe only because they are not paired types.
 */
describe('whole-segment paired markers ride the wire BARE (§C118 ⑲)', () => {
  it('sends the payload alone, captures no paired id, and re-wraps on return', () => {
    const input = SEG('m00038:item:1', '[[docref:alcohol|m00032#term-00006]]');
    const { wireText, segments } = stripTermFnToPaired(input);
    expect(wireText).toContain('\nalcohol\n'); // bare — no marker syntax at all
    expect(wireText).not.toContain('[[docref');
    expect(segments[0].wholeSegment).toEqual({ type: 'docref', id: 'm00032#term-00006' });
    expect(segments[0].docrefIds).toEqual([]); // no paired span for the count guard
    const { text, mismatches } = reattachIds(SEG('m00038:item:1', 'alkóhól'), segments);
    expect(text).toContain('[[docref:alkóhól|m00032#term-00006]]');
    expect(mismatches).toEqual([]);
  });

  it('an identity wire round-trips byte-exact', () => {
    const input =
      SEG('m1:i:1', '[[docref:alcohol|m1#t1]]') + SEG('m1:p:2', 'A [[term:x|t2]] here.');
    const { wireText, segments } = stripTermFnToPaired(input);
    expect(reattachIds(wireText, segments).text).toBe(input);
  });

  it('a segment with TWO markers is NOT whole-segment — it stays paired', () => {
    const input = SEG('m1:p:3', '[[docref:one|m1#a]] [[docref:two|m2#b]]');
    const { wireText, segments } = stripTermFnToPaired(input);
    expect(segments[0].wholeSegment).toBe(null);
    expect(wireText).toContain('[[docref]]one[[/docref]]');
    expect(segments[0].docrefIds).toEqual(['m1#a', 'm2#b']);
  });

  it('a BARE whole-segment docref stays opaque — it is a document id, not prose', () => {
    const input = SEG('m1:p:4', '[[docref:m00164]]');
    const { wireText, segments } = stripTermFnToPaired(input);
    expect(wireText).toContain('[[docref:m00164]]');
    expect(segments[0].wholeSegment).toBe(null);
  });

  it('leaves an opaque whole-segment placeholder completely alone', () => {
    // The control that matters most: MEDIA/MATH/TABLE are 2,985 whole-segment
    // markers corpus-wide and sending one bare would put a bare integer on the
    // wire as prose. They are safe because they are not paired types — assert it.
    const input = SEG('m1:p:5', '[[MEDIA:50]]') + SEG('m1:p:6', '[[MATH:75]]');
    const { wireText, segments } = stripTermFnToPaired(input);
    expect(wireText).toContain('[[MEDIA:50]]');
    expect(wireText).toContain('[[MATH:75]]');
    expect(segments.every((s) => s.wholeSegment === null)).toBe(true);
  });

  it('carries a nested payload through bare and back', () => {
    const input = SEG('m1:p:7', '[[docref:acetal, R[[sub:2]]C|m00221#term-00001]]');
    const { wireText, segments } = stripTermFnToPaired(input);
    expect(wireText).toContain('\nacetal, R[[sub:2]]C\n');
    const { text } = reattachIds(SEG('m1:p:7', 'asetal, R[[sub:2]]C'), segments);
    expect(text).toContain('[[docref:asetal, R[[sub:2]]C|m00221#term-00001]]');
  });

  it('tolerates whitespace the model adds around the returned body', () => {
    const { segments } = stripTermFnToPaired(SEG('m1:p:8', '[[docref:alcohol|m1#t1]]'));
    const { text } = reattachIds('<!-- SEG:m1:p:8 -->\n   alkóhól  \n\n', segments);
    expect(text).toContain('[[docref:alkóhól|m1#t1]]');
    expect(text).not.toContain('[[docref:   alk');
  });

  it('DEGRADES when the model returns an empty body', () => {
    const input = SEG('m1:p:9', '[[docref:alcohol|m1#t1]]');
    const { segments } = stripTermFnToPaired(input);
    const { text, mismatches } = reattachIds(SEG('m1:p:9', ''), segments);
    expect(text).toContain('[[docref:alcohol|m1#t1]]'); // original restored
    expect(mismatches.some((m) => m.type === 'docref-payload')).toBe(true);
  });

  it('DEGRADES when the returned body carries a bare `|` that would split the id', () => {
    const input = SEG('m1:p:10', '[[docref:alcohol|m1#t1]]');
    const { segments } = stripTermFnToPaired(input);
    const { text, mismatches } = reattachIds(SEG('m1:p:10', 'al|kóhól'), segments);
    expect(text).toContain('[[docref:alcohol|m1#t1]]');
    expect(mismatches.some((m) => m.type === 'docref-payload')).toBe(true);
  });

  it('CORPUS ANCHOR — m00038 puts all 36 index labels on the wire as bare text', () => {
    const p = path.join(REPO_ROOT, 'books/lifraen-efnafraedi/02-for-mt/ch03/m00038-segments.en.md');
    expect(fs.existsSync(p)).toBe(true);
    const en = fs.readFileSync(p, 'utf8');
    const { wireText, segments } = stripTermFnToPaired(en);
    const whole = segments.filter((s) => s.wholeSegment);
    expect(whole).toHaveLength(36); // the exact population that primed the bolding
    expect(wireText).not.toContain('[[docref]]'); // no paired spans left
    expect(wireText).not.toContain('[[docref:'); // and no colon form either
    // Controls: the module's other whole-segment markers must be UNTOUCHED, or
    // this rule is stripping things it was never meant to reach.
    expect(wireText).toContain('[[span:Strategy|red-text]]');
    expect((wireText.match(/\[\[b:/g) || []).length).toBe((en.match(/\[\[b:/g) || []).length);
    // And the whole file round-trips byte-exact through an identity wire.
    expect(reattachIds(wireText, segments).text).toBe(en);
  });

  it('CORPUS ANCHOR — 532 whole-segment docrefs go bare, the inline ones stay paired', () => {
    let whole = 0;
    let paired = 0;
    let damaged = 0;
    for (const file of keptBookSegmentFiles()) {
      const text = fs.readFileSync(file, 'utf8');
      if (!text.includes('[[docref:')) continue;
      const { wireText, segments } = stripTermFnToPaired(text);
      for (const s of segments) {
        if (s.wholeSegment) whole++;
        paired += s.docrefIds.length;
      }
      if (reattachIds(wireText, segments).text !== text) damaged++;
    }
    expect(whole).toBe(532);
    expect(paired).toBe(172); // 704 - 532, the inline ones still paired
    expect(damaged).toBe(0); // identity round-trip is lossless corpus-wide
  });
});
