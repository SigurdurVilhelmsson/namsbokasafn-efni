/**
 * cnxml-render-media-dom.test.js — characterization for the appendices image drop (Task 4, A3).
 *
 * ROOT CAUSE (confirmed by systematic diagnosis):
 *   The drop of CNX_Chem_00_AA_PeriodicPU_img.jpg is INTENTIONAL.
 *   Module m68859 is listed in book-config.json specialModules as "periodic-table".
 *   cnxml-render.js main() replaces the entire <main> content with a link to the
 *   custom interactive periodic table at /efnafraedi-2e/lotukerfi — the static
 *   image is deliberately absent from the published HTML.
 *
 *   renderCnxmlToHtml() correctly emits the <img> (render path is not the bug).
 *   The fidelity CHECK falsely flags it as a drop because it has no awareness of
 *   intentional interactive replacements.
 *
 * FIX: add knownIntentionalImageDrops to checkChapter so the invariant is adjusted
 * for modules whose static images are replaced by custom interactive elements.
 * The driver computes the adjustment from book-config specialModules.
 */

import { describe, it, expect } from 'vitest';
import { checkChapter } from '../cnxml-render-fidelity-check.js';
import { renderCnxmlToHtml } from '../cnxml-render.js';

// m68859: one <figure><media><image> at top level of appendix <content>
const M68859_CNXML = `<document xmlns="http://cnx.rice.edu/cnxml" class="appendix">
<title>Lotukerfið</title>
<metadata xmlns:md="http://cnx.rice.edu/mdml">
  <md:content-id>m68859</md:content-id>
</metadata>
<content>
<figure id="fs-idm379479808">
<media id="fs-idp64991424" alt="The Periodic Table of Elements is shown.">
<image mime-type="image/jpeg" src="../../media/CNX_Chem_00_AA_PeriodicPU_img.jpg"/>
</media></figure>
</content>
</document>`;

// The published HTML for m68859: static image is replaced by interactive link.
// No <img> tag — this is intentional (see commit 594428cf).
const M68859_HTML = `<html><body><main>
<div style="text-align: center; padding: 2rem;">
  <h2>Gagnavirkt lotukerfi frumefna</h2>
  <a href="/efnafraedi-2e/lotukerfi" class="periodic-table-link">Opna gagnavirka lotukerfið</a>
</div>
</main></body></html>`;

// ─── Render-path characterization ────────────────────────────────────────────

describe('appendices image — renderCnxmlToHtml render path', () => {
  it('renderCnxmlToHtml DOES render the image — render path is not the bug', () => {
    const { html } = renderCnxmlToHtml(M68859_CNXML, {
      lang: 'is',
      chapter: 'appendices',
      bookSlug: 'efnafraedi-2e',
      moduleId: 'm68859',
      moduleSections: {},
    });
    // renderCnxmlToHtml emits the <img> correctly.
    // The image disappears only because cnxml-render.js main() overwrites <main>
    // for modules listed as "periodic-table" in book-config specialModules.
    expect(html).toContain('CNX_Chem_00_AA_PeriodicPU_img.jpg');
  });
});

// ─── Fidelity-check invariant: intentional replacement allowlist ──────────────

describe('checkChapter — known intentional replacement (periodic-table module)', () => {
  it('flags cross-stage-drop WITHOUT the intentional-drop adjustment — the false positive', () => {
    // Without the allowlist the invariant correctly detects the gap (CNXML has 1
    // image, HTML has 0) but it is a FALSE POSITIVE: the absence is intentional.
    const findings = checkChapter({ cnxml: [M68859_CNXML], html: [M68859_HTML] });
    const imageDrop = findings.find((f) => f.type === 'cross-stage-drop' && f.unit === 'image');
    expect(imageDrop).toBeDefined();
    expect(imageDrop.dropped).toBe(1);
  });

  it('clears the cross-stage-drop WITH knownIntentionalImageDrops=1 — the fix', () => {
    // After the fix: passing knownIntentionalImageDrops=1 tells the checker that
    // 1 CNXML image is intentionally absent from HTML (periodic table replaced by
    // /efnafraedi-2e/lotukerfi interactive element). The finding is suppressed.
    const findings = checkChapter({ cnxml: [M68859_CNXML], html: [M68859_HTML] }, null, {
      knownIntentionalImageDrops: 1,
    });
    const imageDrop = findings.find((f) => f.type === 'cross-stage-drop' && f.unit === 'image');
    expect(imageDrop).toBeUndefined();
  });
});
