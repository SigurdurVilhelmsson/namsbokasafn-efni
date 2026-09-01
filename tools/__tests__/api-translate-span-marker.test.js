/**
 * `[[span:…|class]]` must survive the PAID MT leg (§C118, the fourth site).
 *
 * 🔴 WHAT WAS BROKEN, AND WHY EVERY EXISTING CHECK SAID IT WAS FINE.
 * §C118 ① taught that the span fix needed "THREE SITES, NOT THE TWO THAT LOOKED
 * OBVIOUS" — extract emits the marker, inject resolves it, and `span` had to join
 * inject's placeholder-protection allowlist. There is a FOURTH, and it is on the
 * leg that costs money: `api-translate.js` never added `span` to
 * `BRACKET_MARKER_TYPES` or `KNOWN_BRACKET_TYPES`, so `unwrapInventedMarkers`
 * classified every real `[[span:X|magenta-text]]` as a marker the MT had INVENTED
 * around a glossary word and stripped it — writing the CSS CLASS NAME into the
 * Icelandic as prose:
 *
 *     in : "([[span:X|magenta-text]]=F, Cl, Br, I)"
 *     out : "(X|magenta-text=F, Cl, Br, I)"       <- reader-visible
 *
 * `api-translate.js`'s own docstring on `KNOWN_BRACKET_TYPES` predicted exactly
 * this: "a set missing one of them EATS A REAL MARKER … narrowing it destroys
 * content." The set was never narrowed; the pipeline WIDENED underneath it, which
 * is the same thing and has no diff to notice.
 *
 * 🔴 WHY THE EXISTING DRIFT GUARD COULD NOT SEE IT — the transferable part.
 * `api-translate-invented-markers.test.js` asserts
 * `for (const t of BRACKET_MARKER_TYPES) expect(KNOWN_BRACKET_TYPES.has(t))`.
 * That is a SUBSET relation between two sets that derive from one token — with
 * `span` absent from BOTH, it holds trivially and stays green. A gate whose two
 * sides derive from one token cannot see damage to its own anchor. And
 * `bracketMarkerDelta` iterates the same list, so the marker-conservation check
 * was blind to span loss for the same reason: the tally had no column for it.
 *
 * ▶ SO THE LOAD-BEARING TEST HERE IS NOT "span is in the set". It is the CORPUS
 * ANCHOR below: every bracket type our own extractor actually emits into
 * `02-for-mt` must be in `KNOWN_BRACKET_TYPES`. That is the PROPERTY the two
 * enumerations were standing in for, it is anchored on the opposite side from the
 * thing it checks, and it fails automatically the next time the pipeline learns a
 * marker the MT leg has not been told about. An enumeration wrong twice should
 * become a checked property.
 *
 * ⚠️ `span-marker-roundtrip.test.js` covers extract -> inject and has ZERO MT
 * coverage, which is precisely the gap this file closes.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  BRACKET_MARKER_TYPES,
  KNOWN_BRACKET_TYPES,
  unwrapInventedMarkers,
  bracketMarkerDelta,
} from '../api-translate.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const KEPT_BOOKS = ['efnafraedi-2e', 'lifraen-efnafraedi'];

/** Every `[[type` token in a text, however the marker ends (`:`, `|` or `]]`). */
function bracketTypesIn(text) {
  const out = new Set();
  for (const m of String(text).matchAll(/\[\[([A-Za-z][\w-]*)(?=[:|\]])/g)) out.add(m[1]);
  return out;
}

/** All committed EN segment files for the two kept books (never the .backup.* files). */
function enSegmentFiles() {
  const files = [];
  for (const book of KEPT_BOOKS) {
    const root = path.join(REPO_ROOT, 'books', book, '02-for-mt');
    if (!fs.existsSync(root)) continue;
    for (const ch of fs.readdirSync(root)) {
      const dir = path.join(root, ch);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const f of fs.readdirSync(dir)) {
        if (f.endsWith('.en.md') && !f.includes('.backup.')) files.push(path.join(dir, f));
      }
    }
  }
  return files;
}

describe('the MT leg must not eat a real [[span:…]] marker', () => {
  it('🔴 unwrapInventedMarkers leaves a real span marker byte-identical', () => {
    const s = '([[span:X|magenta-text]]=F, Cl, Br, I)';
    const { text, unwrapped } = unwrapInventedMarkers(s);
    expect(text).toBe(s);
    expect(unwrapped).toEqual([]);
    // The class name must NOT leak into the prose — that is the reader-visible half.
    expect(text).not.toContain('X|magenta-text=');
  });

  it('🔴 …including the nested form the real corpus carries', () => {
    const s = '[[span:OPO[[sub:3]][[sup:2−]]|magenta-text]]';
    const { text, unwrapped } = unwrapInventedMarkers(s);
    expect(text).toBe(s);
    expect(unwrapped).toEqual([]);
  });

  it('🔴 CONTROL — a genuinely INVENTED marker is still unwrapped', () => {
    // Without this, "span survives" would also be satisfied by disabling the
    // feature entirely. §C67 class 3: the MT fuses the glossary field with the
    // bracket syntax and emits [[<lemma>:<inflected form>]].
    const { text, unwrapped } = unwrapInventedMarkers('Þetta er [[sameind:Sameindin]] okkar.');
    expect(text).toBe('Þetta er Sameindin okkar.');
    expect(unwrapped).toEqual([{ type: 'sameind', inner: 'Sameindin' }]);
  });

  it('🔴 bracketMarkerDelta can SEE a lost span — the tally needs a column for it', () => {
    const input = 'a [[span:X|magenta-text]] b [[i:y]] c';
    const lost = 'a X b [[i:y]] c';
    const delta = bracketMarkerDelta(input, lost);
    expect(delta.span).toBe(-1);
    // Control: an untouched round-trip must report no span movement at all.
    expect(bracketMarkerDelta(input, input).span ?? 0).toBe(0);
  });

  it('span is in BOTH sets — destruction and blindness are two different defects', () => {
    expect(KNOWN_BRACKET_TYPES.has('span')).toBe(true); // stops the destruction
    expect(BRACKET_MARKER_TYPES).toContain('span'); // stops the blindness
  });
});

describe('🔴 THE CORPUS ANCHOR — the property the two enumerations stand in for', () => {
  // Anchored on the OPPOSITE side from the thing being checked: what the extractor
  // actually emitted, not another list maintained by hand beside it.
  const files = enSegmentFiles();

  it('the corpus is non-empty and carries span markers — or this whole block is vacuous', () => {
    expect(files.length).toBeGreaterThan(100);
    const withSpan = files.filter((f) => fs.readFileSync(f, 'utf8').includes('[[span:'));
    expect(withSpan.length).toBeGreaterThan(0);
  });

  it('every bracket type in the committed EN corpus is in KNOWN_BRACKET_TYPES', () => {
    const seen = new Map(); // type -> an example file
    for (const f of files) {
      for (const t of bracketTypesIn(fs.readFileSync(f, 'utf8'))) {
        if (!seen.has(t)) seen.set(t, path.relative(REPO_ROOT, f));
      }
    }
    expect(seen.size).toBeGreaterThan(5); // the instrument found something
    const unknown = [...seen.entries()].filter(([t]) => !KNOWN_BRACKET_TYPES.has(t));
    expect(unknown.map(([t, f]) => `${t} (e.g. ${f})`)).toEqual([]);
  });
});

describe('END TO END — the real ch03 corpus through the real MT return path', () => {
  // The MT is stood in for by IDENTITY: the wire returns exactly what it was sent.
  // Any span that goes missing is therefore OUR pipeline's doing, never the model's.
  const dir = path.join(REPO_ROOT, 'books', 'lifraen-efnafraedi', '02-for-mt', 'ch03');

  it('all 31 organic ch03 span markers survive, and 0 class names leak', () => {
    const files = fs
      .readdirSync(dir)
      .filter((f) => /^m\d+-segments\.en\.md$/.test(f))
      .map((f) => path.join(dir, f));
    expect(files.length).toBeGreaterThan(0);

    let emitted = 0;
    let survived = 0;
    let classesOutsideAMarker = 0;
    for (const f of files) {
      const en = fs.readFileSync(f, 'utf8');
      emitted += (en.match(/\[\[span:/g) || []).length;
      const { text } = unwrapInventedMarkers(en); // the step that destroyed them
      survived += (text.match(/\[\[span:/g) || []).length;

      // The reader-visible half. Every class name must still be CLOSED by its own
      // marker (`|magenta-text]]`); one that is not has leaked into the prose,
      // which is exactly what `(X|magenta-text=F, Cl, Br, I)` was.
      const CLS = /\|(?:magenta|red|cyan|green|gray|yellow|purple)-text/g;
      const closed = /\|(?:magenta|red|cyan|green|gray|yellow|purple)-text\]\]/g;
      classesOutsideAMarker += (text.match(CLS) || []).length - (text.match(closed) || []).length;

      // Identity in, identity out: the EN corpus is OUR OWN output, so nothing in
      // it was invented and nothing may be unwrapped. Any difference is our bug.
      expect(text).toBe(en);
      expect(bracketMarkerDelta(en, text).span ?? 0).toBe(0);
    }

    expect(emitted).toBe(31); // pins the population; 0 would make the rest vacuous
    expect(survived).toBe(31);
    expect(classesOutsideAMarker).toBe(0);
  });
});
