import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractInlineText } from '../cnxml-extract.js';
import { extractElements } from '../lib/cnxml-parser.js';

/**
 * C171 — `cnxml-extract.js`'s `if (text)` gate answers TWO questions with one
 * condition: "is there anything to translate?" and "is this para part of the
 * document?". When a para's inline text extracts empty, the para is not pushed
 * into `02-structure` at all — and `cnxml-inject.js` rebuilds the module FROM
 * that structure, so the para and everything inside it cannot be reconstructed.
 * `buildPara` carries the mirror gate (`if (!titleElement && !text) return null`),
 * so this is the repo's documented two-defects-one-per-side shape: fixing either
 * side alone changes nothing.
 *
 * 🔴 THESE TESTS PIN THE DEFECT, NOT THE DESIRED BEHAVIOUR. They exist so the
 * loss stays visible while it is deferred. **If one goes RED because the gate was
 * fixed, that is the fix landing — delete the matching entry from
 * `books/efnafraedi-2e/fidelity-allowlist.json` (m68818 / emphasis / -1) in the
 * SAME commit**, or the manifest keeps explaining away a discrepancy that no
 * longer occurs, which `classifyDiff`'s exact match would then report as drift.
 *
 * WHY IT WAS DEFERRED RATHER THAN FIXED — measured 2026-09-21 by DOM parse (not
 * regex) over all six books' `01-source`: 1,192 modules, **15,469 TOP-LEVEL
 * `<para>` elements** (the counting unit: a para not inside any container whose
 * own builder rebuilds its subtree). Positive control fired.
 *   - Exactly **ONE** is content-free, carries no block child, and holds an inline
 *     element: this para. A corpus-wide singleton, not a class.
 *   - 🔴 THE GATE IS NOT A SINGLETON, AND THAT IS THE ARGUMENT AGAINST FIXING IT
 *     HERE. `lifraen-efnafraedi` has **1,961** content-free paras of the same
 *     shape — `<link class="os-embed" url="#exercise/…"/>` — and they are equally
 *     absent from `02-structure`. They nevertheless REACH the injected output
 *     intact (measured on the 8 injected organic modules: 4→4, 41→41, 3→3, 0 lost)
 *     because they sit inside `<exercise><problem>`, which `buildExerciseDom`
 *     preserves wholesale rather than rebuilding from segments.
 *   - ▶ So pushing content-free paras into the structure to rescue ONE chemistry
 *     para would hand `buildExerciseDom`'s 1,961 organic paras a SECOND route into
 *     the output — the §C149 duplication shape, in a published book, to fix
 *     something no reader can see.
 * Reader impact of the deferral is zero: an empty `<emphasis/>` inside an empty
 * `<para>` renders nothing.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..', '..');
const extract = (cnxml) => extractInlineText(cnxml, new Map(), { math: 0, media: 0, table: 0 });

/** Elements that carry their own content and are extracted by their own path. */
const BLOCK_CHILD =
  /<(figure|media|list|equation|table|note|example|exercise|section|title|code|quote|preformat|problem|solution|commentary|rule|definition|footnote)\b/i;

describe('C171 — the empty-para gate', () => {
  it('yields no text for a para whose only child is a self-closing <emphasis/>', () => {
    expect(extract('<para id="x"><emphasis effect="italics"/></para>')).toBe('');
  });

  it('CONTROL: the PAIRED empty spelling of the same element does yield a marker', () => {
    // The two spellings of "an emphasis with no content" diverge, which is what
    // makes the self-closing one reach the gate as falsy. Keeps the mechanism
    // honest: the para is not dropped for being empty, but for extracting empty.
    expect(extract('<para id="x"><emphasis effect="italics"></emphasis></para>')).toBe('[[i:]]');
  });

  it('CONTROL: an ordinary para still extracts its text', () => {
    // Proves the instrument can see text at all; without it the first assertion
    // passes just as well against a wholly broken extractor.
    expect(extract('<para id="x">hello</para>')).toBe('hello');
  });

  it('chemistry carries exactly ONE such para, and it is m68818 fs-idp113461024', () => {
    // A corpus pin: a source refresh that introduces a second one must be seen,
    // because each needs its own allowlist entry or the manifest goes red.
    const srcDir = path.join(REPO, 'books', 'efnafraedi-2e', '01-source');
    const found = [];
    for (const ch of fs.readdirSync(srcDir)) {
      const chDir = path.join(srcDir, ch);
      if (!fs.statSync(chDir).isDirectory()) continue;
      for (const f of fs.readdirSync(chDir)) {
        if (!f.endsWith('.cnxml')) continue;
        const cnxml = fs.readFileSync(path.join(chDir, f), 'utf8');
        for (const para of extractElements(cnxml, 'para')) {
          const t = extract(para.content);
          if (t && t.trim()) continue;
          // A para wrapping a BLOCK child is not in this class: the child has its
          // own extraction path and its own structure node (a <media>'s alt is
          // extracted by §C88), so nothing is lost when the wrapper is not pushed.
          // Measured: dropping this clause admits three such wrappers in chemistry
          // (m68739 x2, m68843 x1), all `<para><media alt="..."/></para>`.
          if (BLOCK_CHILD.test(para.content)) continue;
          // Only a para carrying an inline element can move a fidelity tag count;
          // a bare <para/> loses nothing countable.
          if (!/<[a-zA-Z]/.test(para.content)) continue;
          found.push(`${f.replace('.cnxml', '')}:${para.id || '(no id)'}`);
        }
      }
    }
    expect(found).toEqual(['m68818:fs-idp113461024']);
  });
});
