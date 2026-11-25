/**
 * The editor's labels on a Fable-served unit (serving spec, dated note of 2026-11-25; wording approved by
 * [USER] 2026-11-25, option A). Every string is pinned byte for byte, and the MT wording other books still
 * show is pinned beside it as the control. The client must reach these strings through one helper that
 * picks them only when the unit is served from the Fable layer.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicJs = join(__dirname, '..', 'public', 'js');
const UI = new Function(`${readFileSync(join(publicJs, 'ui-strings.js'), 'utf-8')}; return UI;`)();
const client = readFileSync(join(publicJs, 'segment-editor.js'), 'utf-8');

describe('the approved Fable-unit labels, byte for byte', () => {
  const F = UI.fableLabels;

  it('the accept button and its tooltip', () => {
    expect(F.acceptButton).toBe('Staðfesta upphafstexta');
    expect(F.acceptTooltip).toBe(
      'Staðfesta að upphafstextinn sé réttur eins og hann er (Ctrl+Shift+Enter)'
    );
  });

  it('the contested-edit notices', () => {
    expect(F.contestedRejected).toBe('Breytingu var hafnað — upphafstextinn stendur óbreyttur.');
    expect(F.contestedSuperseded).toBe(
      'Fyrri breyting var dregin til baka — upphafstextinn stendur óbreyttur.'
    );
  });

  it('the rows-still-waiting notice ends with the new button name, with number agreement kept', () => {
    expect(F.noneLeftContested(1)).toBe(
      'Engir ósnertir bútar eftir — 1 bútur með fyrri breytingu bíður staðfestingar. ' +
        'Smelltu á „Staðfesta upphafstexta" í þeim röðum.'
    );
    expect(F.noneLeftContested(3)).toBe(
      'Engir ósnertir bútar eftir — 3 bútar með fyrri breytingu bíða staðfestingar. ' +
        'Smelltu á „Staðfesta upphafstexta" í þeim röðum.'
    );
    expect(F.noneLeftContested(11)).toContain('11 bútar með fyrri breytingu bíða');
    expect(F.noneLeftContested(21)).toContain('21 bútur með fyrri breytingu bíður');
  });

  it('the unchanged-text notices', () => {
    expect(F.unchangedNothingSaved).toBe(
      'Textinn er óbreyttur — engin breyting er vistuð og flokkur/athugasemd fylgja ekki með.\n\n' +
        'Ef upphafstextinn er réttur eins og hann er, notaðu „Staðfesta upphafstexta".'
    );
    expect(F.unchangedWithdrawConfirm).toBe(
      'Textinn er aftur eins og upprunalega — breytingin í bið verður dregin til baka og ' +
        'flokkur/athugasemd falla niður.\n\n' +
        'Ef upphafstextinn er réttur eins og hann er, notaðu „Staðfesta upphafstexta".\n\nHalda áfram?'
    );
  });

  it('the revert tooltip and the legend', () => {
    expect(F.revertTooltip).toBe('Endurstilla bútinn í síðast vistaða útgáfu (eða upphafstextann)');
    expect(F.sourceTypes).toBe(
      'Upphafstexti = vélþýðing yfirfarin af gervigreind · Yfirlesið = mannlegur yfirlestur lokinn · ' +
        'Staðfærð = aðlöguð að Íslandi'
    );
  });

  it('no Fable-unit label mentions MT or vélþýðing except the legend, which says what the text is', () => {
    for (const [k, v] of Object.entries(F)) {
      const text = typeof v === 'function' ? v(2) : v;
      if (k === 'sourceTypes') continue;
      expect(text, k).not.toMatch(/\bMT\b|vélþýð/);
    }
  });
});

describe('the MT wording other books show is unchanged (control)', () => {
  it('keeps every MT string', () => {
    expect(UI.acceptance.acceptButton).toBe('Staðfesta MT');
    expect(UI.acceptance.acceptTooltip).toBe(
      'Staðfesta að vélþýðingin sé rétt eins og hún er (Ctrl+Shift+Enter)'
    );
    expect(UI.acceptance.contestedRejected).toBe(
      'Breytingu var hafnað — vélþýðingin stendur óbreytt.'
    );
    expect(UI.acceptance.noneLeftContested(2)).toBe(
      'Engir ósnertir bútar eftir — 2 bútar með fyrri breytingu bíða staðfestingar. ' +
        'Smelltu á „Staðfesta MT" í þeim röðum.'
    );
    expect(UI.segmentEditor.revertTooltip).toBe(
      'Endurstilla bútinn í síðast vistaða útgáfu (eða vélþýðingu)'
    );
    expect(UI.tooltips.sourceTypes).toBe(
      'MT = óyfirfarin vélþýðing · Yfirlesið = mannlegur yfirlestur lokinn · Staðfærð = aðlöguð að Íslandi'
    );
  });
});

describe('the client reaches the labels only through the layer-aware helper', () => {
  it('defines editorLabels(), which picks UI.fableLabels for a Fable-served unit', () => {
    expect(client).toMatch(/function editorLabels\(\)/);
    expect(client).toMatch(/moduleData\s*&&\s*moduleData\.isSource\s*===\s*'fable'/);
    expect(client).toMatch(/UI\.fableLabels/);
  });

  it('reads none of the eight strings directly any more', () => {
    for (const ref of [
      'UI.acceptance.acceptButton',
      'UI.acceptance.acceptTooltip',
      'UI.acceptance.contestedRejected',
      'UI.acceptance.contestedSuperseded',
      'UI.acceptance.noneLeftContested',
      'UI.acceptance.unchangedNothingSaved',
      'UI.acceptance.unchangedWithdrawConfirm',
      'UI.segmentEditor.revertTooltip',
      'UI.tooltips.sourceTypes',
    ]) {
      const outsideHelper = client.replace(/function editorLabels\(\)\s*\{[\s\S]*?\n  \}/, '');
      expect(outsideHelper.includes(ref), ref).toBe(false);
    }
  });
});
