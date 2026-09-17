import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import { extractSegments } from '../cnxml-extract.js';
import { buildCnxml } from '../cnxml-inject.js';
import { renderCnxmlToHtml } from '../cnxml-render.js';

/**
 * §C148 — does a translated figure CAPTION reach the injected CNXML and the
 * rendered page, whatever container the figure sits in?
 *
 * 🔴 THIS IS §C89'S SHAPE, FOR CAPTIONS, AND NO COUNT CAN SEE IT. When a caption
 * translation is dropped the ENGLISH caption is still present, so every tally of
 * `<caption>`/`<figcaption>` reconciles. Measured 2026-09-17 on the committed
 * chemistry `03-translated/mt-preview`: every captioned figure that is a direct
 * child of an `<example>` shipped English (31 of 31), while top-level (510) and
 * note-direct (83) captions were all translated. `buildExampleDom` and
 * `buildExerciseDom` preserve their figures in place and mark them handled, so
 * `buildFigure` skips them — and neither builder ever consumed
 * `ctx.figureCaptions`, which only the note builders read.
 *
 * The method is a sentinel: every caption segment's text is replaced with a
 * token that cannot have come from the source, and the token is then LOCATED,
 * keyed on the figure's own id on both sides — the `<caption>` of every
 * `<figure id>` copy in the injected CNXML, and the `<figcaption>` of every
 * `<figure id>` block in the rendered HTML (label span removed).
 *
 * ⚠️ Both checks compare the caption's WHOLE text to the token, not `includes`.
 * An adversarial review (2026-09-17) showed why: a mutant that APPENDS the
 * translation instead of replacing the English (drop the clear-out loop in
 * `applyFigureCaptionDom`) passed an `includes` check — readers would see both
 * languages in one caption, which is the very defect no count can see. And a
 * rendered check that searched ANY `<figcaption>` on the page could not see a
 * caption landing on the wrong figure. Exact, id-keyed matching counts the same
 * on the real corpus and goes red on both.
 *
 * Every caption is classified by its figure's SOURCE context (nearest
 * note/example/exercise ancestor; `/direct` or `/para` by the figure's own
 * parent), so the positions that already worked — `top` and `note/direct` —
 * are the built-in positive control: a harness that broke everything equally
 * cannot read as a pass.
 */

const BOOKS = join(process.cwd(), 'books');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (entry.endsWith('.cnxml')) out.push(p);
  }
  return out;
}

const parser = () => new DOMParser({ onError: () => {} });

/** Source context of a figure: `top`, or `<container>/<direct|para>`. */
function figureContext(fig) {
  for (let p = fig.parentNode; p; p = p.parentNode) {
    if (['example', 'exercise', 'note'].includes(p.nodeName)) {
      return `${p.nodeName}/${fig.parentNode.nodeName === 'para' ? 'para' : 'direct'}`;
    }
  }
  return 'top';
}

function directCaption(fig) {
  return Array.from(fig.childNodes).find((n) => n.nodeName === 'caption') || null;
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Visible caption text of every rendered `<figure id="figId">` block, with the
 * `Mynd N` label span removed; `null` for a block with no `<figcaption>`.
 * `\sid=` (not `\bid=`, which also matches `data-figure-id=`), and a quote-aware
 * attribute span rather than `[^>]*` (CLAUDE.md § a bare `>` is legal inside an
 * attribute value).
 */
function renderedCaptionTexts(html, figId) {
  const block = new RegExp(
    `<figure(?:[^>"]|"[^"]*")*\\sid="${escapeRegExp(figId)}"(?:[^>"]|"[^"]*")*>[\\s\\S]*?<\\/figure>`,
    'g'
  );
  return (html.match(block) || []).map((b) => {
    const m = b.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/);
    if (!m) return null;
    return m[1]
      .replace(/<span class="figure-label">[\s\S]*?<\/span>/, '')
      .replace(/<[^>]+>/g, '')
      .trim();
  });
}

/** Sentinel-sweep one book. Returns per-context {emitted, injected, rendered} and drops by name. */
function sweep(book) {
  const byContext = {};
  const dropped = [];
  let notFigure = 0;
  const refused = []; // §C145: modules the injector refuses — no reach verdict
  for (const f of walk(join(BOOKS, book, '01-source'))) {
    const src = readFileSync(f, 'utf8');
    const { segments, structure, equations, inlineAttrs } = extractSegments(src);
    const captions = segments.filter((s) => s.type === 'caption');
    if (!captions.length) continue;

    const srcFigures = new Map(
      Array.from(parser().parseFromString(src, 'text/xml').getElementsByTagName('figure')).map(
        (el) => [el.getAttribute('id'), el]
      )
    );
    const map = new Map(segments.map((s) => [s.id, s.text]));
    const probes = [];
    captions.forEach((s, i) => {
      const figId = s.id
        .split(':')
        .slice(2)
        .join(':')
        .replace(/-caption$/, '');
      const srcFig = srcFigures.get(figId);
      if (!srcFig) {
        notFigure++;
        return;
      }
      const token = `ZQXCAP${i}ZQX`;
      map.set(s.id, token);
      probes.push({ figId, token, context: figureContext(srcFig) });
    });

    let cnxml;
    try {
      cnxml = buildCnxml(structure, map, equations, src, {}, inlineAttrs).cnxml;
    } catch (err) {
      // §C145 ①: a module whose injected output carries a surviving bracket
      // marker is REFUSED, so it has no reach verdict — excluded by NAME, never
      // silently skipped. Narrow on purpose: any other failure is a real crash.
      if (!/Marker residue/.test(err.message)) throw err;
      refused.push(basename(f, '.cnxml'));
      continue;
    }
    const outFigures = Array.from(
      parser().parseFromString(cnxml, 'text/xml').getElementsByTagName('figure')
    );
    const rendered = renderCnxmlToHtml(cnxml, { bookSlug: book });
    const html = typeof rendered === 'string' ? rendered : rendered.html || '';

    for (const p of probes) {
      const t = (byContext[p.context] ||= { emitted: 0, injected: 0, rendered: 0 });
      t.emitted++;
      const copies = outFigures.filter((el) => el.getAttribute('id') === p.figId);
      const inCaption =
        copies.length > 0 &&
        copies.every((el) => (directCaption(el)?.textContent || '').trim() === p.token);
      if (inCaption) t.injected++;
      const pageCaptions = renderedCaptionTexts(html, p.figId);
      const inFigcaption = pageCaptions.length > 0 && pageCaptions.every((c) => c === p.token);
      if (inFigcaption) t.rendered++;
      if (!inCaption || !inFigcaption) {
        dropped.push(
          `${basename(f, '.cnxml')} ${p.figId} ${p.context}${inCaption ? ' (render)' : ''}`
        );
      }
    }
  }
  return { byContext, dropped: dropped.sort(), notFigure, refused: refused.sort() };
}

describe('§C148 — a translated figure caption reaches the injected CNXML AND the rendered page', () => {
  it('chemistry: every caption reaches the CNXML; every module-page caption reaches the page', () => {
    // 🔴 THE BEFORE/AFTER IS THE POINT (emitted / injected / rendered):
    //                    before §C148          after §C148
    //   top              510 / 510 / 510       510 / 510 / 510   ← control
    //   note/direct       83 /  83 /  83        83 /  83 /  83   ← control
    //   example/direct    31 /   0 /   0        31 /  31 /  31
    //   exercise/para      1 /   0 /   0         1 /   1 /   0   ← see below
    // A bare "reached > 0" passes on BOTH sides, which is how 31 English captions
    // survived every gate. The totals are pinned so a change in either direction
    // goes red and says which context moved.
    const r = sweep('efnafraedi-2e');
    expect(r.byContext).toEqual({
      top: { emitted: 510, injected: 510, rendered: 510 },
      'note/direct': { emitted: 83, injected: 83, rendered: 83 },
      'example/direct': { emitted: 31, injected: 31, rendered: 31 },
      'exercise/para': { emitted: 1, injected: 1, rendered: 0 },
    });
    // ⚠️ THE ONE "rendered 0" IS NOT THIS FIX'S LEG, AND IT IS PINNED BY NAME SO IT
    // CANNOT HIDE A REAL DROP. m68764's figure is inside an END-OF-CHAPTER exercise,
    // and eoc exercises are not on the module page at all — they render in the
    // chapter rollup (`10-exercises.html`), which `renderCnxmlToHtml` never builds.
    // There, `renderPara` emits the para-nested figure INLINE with its CNXML
    // `<caption>` passed through raw (not a `<figcaption>`), and the caption prose
    // has ALSO leaked into the paragraph text (register "C13 follow-up 2"). Both
    // are render/extract-side and logged as §C149; neither is the inject defect
    // this test pins.
    expect(r.dropped).toEqual(['m68764 CNX_Chem_10_02_Needlefloa exercise/para (render)']);
    // §C145: chemistry refuses no module — the control for organic's one.
    expect(r.refused).toEqual([]);
    expect(r.notFigure).toBe(0);
  }, 600_000);

  it('organic: every caption reaches the CNXML and the page — 3 latent example captions included', () => {
    // 🔴 THE SECOND BOOK FOUND WHAT THE COMMITTED-OUTPUT CENSUS COULD NOT.
    //                    before §C148          after §C148
    //   top              457 / 457 / 457       457 / 457 / 457   ← control
    //   note/direct        1 /   1 /   1         1 /   1 /   1   ← control
    //   example/direct     3 /   0 /   0         3 /   3 /   3
    // The census over `03-translated/mt-preview` reported organic clean ("0 in
    // examples") because only ch03 is injected there; m00136, m00137 and m00142
    // sit in chapters that never were. Measuring from `01-source` is what makes a
    // latent drop visible before it is paid for.
    //
    // ⚠️ ORGANIC'S note/direct "CONTROL" DOES NOT EXERCISE buildNoteDom. Its one
    // instance, m00001 `fig-dedication`, sits in `<note class="dedication-page"
    // id="note-00001">` — class BEFORE id — so buildNoteDom's id-first open-tag
    // regex misses, the note goes through buildGenericElement, the figure is
    // emitted after `</note>`, and buildFigure writes its caption. Chemistry's 83
    // are the only real control on the note path (logged: §C151).
    // 🔴 §C145 (2026-09-17) — `top` READ 457 UNTIL THE INJECTOR LEARNED TO REFUSE
    // A SURVIVING MARKER. 457 − m00061's 3 = 454. The module is REFUSED, not
    // dropped: it carries `[[docref:specific rotation, [[[i:α]]][[sub:D]]|…]]`,
    // whose inner `[[i:α]]` resolves to `<emphasis>α</emphasis>` and leaves a
    // LITERAL `]` in the docref payload, so the docref is never converted and
    // reaches the output as residue (§C115's class; the superseded whole-token
    // gate could not see it). It is LATENT — m00061 has no Icelandic translation,
    // so a real inject refuses it earlier; only this sweep, which injects every
    // module's own English, reaches it.
    // ▶ The subtraction is written out and `refused` is pinned BY NAME, so a
    // second refusing module goes red and says which, instead of quietly
    // shrinking the denominator.
    const r = sweep('lifraen-efnafraedi');
    expect(r.refused).toEqual(['m00061']);
    expect(r.byContext).toEqual({
      top: { emitted: 454, injected: 454, rendered: 454 },
      'note/direct': { emitted: 1, injected: 1, rendered: 1 },
      'example/direct': { emitted: 3, injected: 3, rendered: 3 },
    });
    expect(r.dropped).toEqual([]);
    expect(r.notFigure).toBe(0);
  }, 600_000);
});
