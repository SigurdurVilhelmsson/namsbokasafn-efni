/**
 * G1.23 PR3 client wiring (spec §4, §7), static pins. PRESENCE ONLY: the drawing rule is
 * suggestionPlacement.test.js (drawSuggestions, withSentinels, fromSentinels), and the behaviour in a
 * browser is server/e2e/suggestion-view.spec.js (Task 5).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const serverDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(serverDir, 'public', 'js', 'segment-editor.js'), 'utf-8');
const html = readFileSync(join(serverDir, 'views', 'segment-editor.html'), 'utf-8');
const strings = readFileSync(join(serverDir, 'public', 'js', 'ui-strings.js'), 'utf-8');
const fnBody = (name, next) => {
  const start = src.indexOf(`function ${name}(`);
  const end = src.indexOf(`function ${next}(`, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
};
/** Named function declarations in a slice (fnBody's slice holds its own). */
const declarations = (slice) => (slice.match(/(?:^|\n)\s*(?:async )?function \w+\(/g) || []).length;

describe('the row draws its suggestions (spec §4)', () => {
  it('renderSegmentRow draws suggestions through suggestionDisplay', () => {
    expect(fnBody('renderSegmentRow', 'eligibilityView')).toContain('suggestionDisplay(');
  });

  it('the ruling lines sit in their own container, only on rows that have suggestions', () => {
    const row = fnBody('renderSegmentRow', 'eligibilityView');
    expect(row).toMatch(
      /seg\.suggestions\s*\?\s*`<div class="sugg-rulings" id="sugg-\$\{cssId\(seg\.segmentId\)\}">/
    );
  });

  it('a group key reaches an onclick only through an escaped data attribute', () => {
    expect(src).toContain('this.dataset.groupKey');
    expect(src).toMatch(/data-group-key="\$\{escapeHtml\(/);
    // No onclick interpolates a template value that holds a key.
    expect(src).not.toMatch(/onclick="[^"]*\$\{[^}]*(?:groupKey|\.key\b)[^}]*\}/);
  });

  it('the accept button reads the segment id from its row, so only rows carry data-segment-id', () => {
    const button = fnBody('suggestionAcceptButton', 'suggestionSwapHtml');
    expect(button).toContain(
      "onclick=\"acceptSuggestionGroup(this.closest('tr').dataset.segmentId,"
    );
    expect(button).not.toContain('data-segment-id');
  });

  it('the buttons appear only where the row offers editing (spec §7: who can act)', () => {
    const row = fnBody('renderSegmentRow', 'eligibilityView');
    expect(row).toContain('const canEdit = segmentEditAllowed(latestEdit);');
    expect(row).toMatch(
      /suggestionDisplay\(seg, displayIs, paneAssists\(seg\.segmentId\), \{\s*controls: canEdit,?\s*\}\)/
    );
    expect(fnBody('refreshSuggestionView', 'acceptSuggestionGroup')).toContain(
      'segmentEditAllowed('
    );
    expect(fnBody('acceptSuggestionGroup', 'renderSegmentRow')).toContain('segmentEditAllowed(');
  });

  it('every pane preview goes through the one helper, never the bare renderer', () => {
    const bare = /innerHTML = renderMarkdownPreview\((?:textarea|ta)\.value\)/;
    // Control: the detector matches the shape the four preview sites had before PR3.
    expect('previewEl.innerHTML = renderMarkdownPreview(textarea.value);').toMatch(bare);
    expect('previewEl.innerHTML = renderMarkdownPreview(ta.value);').toMatch(bare);
    expect(src).not.toMatch(bare);
    expect(src).toContain('innerHTML = panePreviewHtml(');
  });
});

describe('the redraw runs where a pane changes its text or its assists (context §3)', () => {
  it('installDraft redraws after it installs the text and the assists', () => {
    const body = fnBody('installDraft', 'getEffectiveRole');
    expect(body).toContain('refreshSuggestionView(segId)');
    expect(body.indexOf('refreshSuggestionView(')).toBeGreaterThan(body.indexOf('paneState.set('));
  });

  it('closeEditPanel redraws after clearing the pane, so the groups come back', () => {
    const body = fnBody('closeEditPanel', 'revertEdit');
    expect(body.indexOf('refreshSuggestionView(segmentId)')).toBeGreaterThan(
      body.indexOf('clearPaneState(segmentId)')
    );
  });

  it('revertEdit and the Escape close redraw too', () => {
    expect(fnBody('revertEdit', 'validateSegmentEdit')).toContain(
      'refreshSuggestionView(segmentId)'
    );
    expect(src).toMatch(/clearPaneState\(segId\);\s*refreshSuggestionView\(segId\);/);
  });

  it('the debounced input handler redraws', () => {
    const open = fnBody('openEditPanel', 'closeEditPanel');
    expect(open).toMatch(/setTimeout\(\(\) => \{[^}]*refreshSuggestionView\(segmentId\);/);
  });
});

describe('Nota stays on the screen (spec §4, §7)', () => {
  it('acceptSuggestionGroup never calls loadModule, reloadIfOpen or fetch', () => {
    const body = fnBody('acceptSuggestionGroup', 'renderSegmentRow');
    for (const call of ['loadModule(', 'reloadIfOpen(', 'fetch', 'fetchJson(', 'renderSegments(']) {
      expect(body).not.toContain(call);
    }
    expect(body).toContain('addAssist('); // control
    expect(body).toContain('segmentSaveState.suggestionItems(');
    expect(body).toContain('suggestionPlacement.placeGroup(');
  });

  it('acceptSuggestionGroup is reachable from the page', () => {
    expect(src).toContain('window.acceptSuggestionGroup = acceptSuggestionGroup;');
  });

  it('saveEdit sends acceptedFromAssists beside the assists', () => {
    const save = fnBody('saveEdit', 'latestEditIdForSegment');
    expect(save).toMatch(
      /acceptedSuggestions:\s*segmentSaveState\.acceptedFromAssists\(\s*paneAssists\(segmentId\),\s*editedContent,/
    );
  });
});

describe('function order (controller ruling R12)', () => {
  it('suggestionDisplay, refreshSuggestionView and acceptSuggestionGroup are contiguous, in that order', () => {
    expect(declarations(fnBody('suggestionDisplay', 'refreshSuggestionView'))).toBe(1);
    expect(declarations(fnBody('refreshSuggestionView', 'acceptSuggestionGroup'))).toBe(1);
    expect(declarations(fnBody('acceptSuggestionGroup', 'renderSegmentRow'))).toBe(1);
  });
});

describe('the page and its strings', () => {
  it('segment-editor.html loads suggestion-placement.js before segment-editor.js', () => {
    const placement = html.indexOf('<script src="/js/suggestion-placement.js"></script>');
    const editor = html.indexOf('<script src="/js/segment-editor.js"></script>');
    expect(placement).toBeGreaterThan(-1);
    expect(editor).toBeGreaterThan(-1); // control
    expect(placement).toBeLessThan(editor);
  });

  it('UI.suggestions carries the display strings verbatim', () => {
    const UI = new Function(`${strings}; return UI;`)();
    expect(UI.suggestions.nota).toBe('✓ Nota');
    expect(UI.suggestions.notaBadar).toBe('✓ Nota báðar');
    expect(UI.suggestions.notaAllar(4)).toBe('✓ Nota allar (4)');
    expect(UI.suggestions.notaTitle).toBe('Nota tillögu');
    expect(UI.suggestions.tag).toBe('GG');
    expect(UI.suggestions.tagTitle).toBe('Tillaga gervigreindar');
  });

  it('the one-change accept button is named Nota tillögu by title AND aria-label (R20)', () => {
    expect(src).toMatch(
      /title="\$\{escapeHtml\(UI\.suggestions\.notaTitle\)\}" aria-label="\$\{escapeHtml\(UI\.suggestions\.notaTitle\)\}"/
    );
  });
});

describe('Hafna rejects a group in place (Task 4)', () => {
  const reject = () => fnBody('rejectSuggestionGroup', 'suggestionDisplay');

  it('rejectSuggestionGroup redraws in place and never reloads', () => {
    expect(reject()).toContain('refreshSuggestionView(');
    for (const call of ['loadModule(', 'reloadIfOpen(', 'renderSegments(']) {
      expect(reject()).not.toContain(call);
    }
  });

  it('rejectSuggestionGroup returns early on the same segmentEditAllowed guard as accept', () => {
    expect(reject()).toContain('segmentEditAllowed(');
  });

  it('rejectSuggestionGroup never writes a textarea or closes a pane', () => {
    expect(reject()).toContain('fetchJson('); // control: the slice is the real body
    expect(reject()).not.toMatch(/\.value\s*=/);
    expect(reject()).not.toContain('closeEditPanel(');
  });

  it('refreshSuggestionView never assigns a textarea value', () => {
    const body = fnBody('refreshSuggestionView', 'acceptSuggestionGroup');
    expect(body).toContain('innerHTML'); // control
    expect(body).not.toMatch(/\.value\s*=/);
  });

  it('treats only 404 SUGGESTION_UNKNOWN as done, and alerts on any other failure', () => {
    expect(reject()).toContain(
      "err.status === 404 && err.data && err.data.error === 'SUGGESTION_UNKNOWN'"
    );
    expect(reject()).toContain('alert(UI.suggestions.rejectFailed)');
  });

  it('removes the group from moduleData and never deletes seg.suggestions', () => {
    expect(reject()).toContain('.suggestions.groups =');
    expect(reject()).not.toMatch(/delete\s+\w+\.suggestions\b/);
    expect(reject()).not.toMatch(/\.suggestions\s*=/);
  });

  it('refuses a second request for a group already in flight', () => {
    expect(reject()).toContain('rejectsInFlight.has(');
    expect(reject()).toContain('rejectsInFlight.delete(');
  });

  it('the reject button is named Hafna tillögu and uses the escaped key, in the swap and on the ruling line', () => {
    const button = fnBody('suggestionRejectButton', 'suggestionSwapHtml');
    expect(button).toContain('aria-label="${escapeHtml(UI.suggestions.hafnaTitle)}"');
    expect(button).toContain('this.dataset.groupKey');
    expect(button).not.toMatch(/rejectSuggestionGroup\([^)]*\$\{/);
    expect(fnBody('suggestionSwapHtml', 'suggestionRulingHtml')).toContain(
      'suggestionRejectButton(group, UI.suggestions.hafna, true)'
    );
    const ruling = fnBody('suggestionRulingHtml', 'suggestionDisplay');
    expect(ruling).toContain('suggestionRejectButton(group, rejectText, false)');
    expect(ruling).toContain('UI.suggestions.hafnaBadum');
    expect(ruling).toContain('UI.suggestions.hafnaOllum(n)');
  });

  it('the preview draws no Hafna (controls false reaches no button)', () => {
    expect(fnBody('panePreviewHtml', 'suggestionTagHtml')).toContain('controls: false');
    expect(fnBody('suggestionSwapHtml', 'suggestionRulingHtml')).toContain('else if (controls)');
  });

  it('exports both on window', () => {
    expect(src).toContain('window.rejectSuggestionGroup = rejectSuggestionGroup;');
    expect(src).toContain('window.refreshSuggestionView = refreshSuggestionView;');
    expect(src).toContain('window.acceptSuggestionGroup = acceptSuggestionGroup;'); // control
  });

  it('UI.suggestions carries the Hafna strings verbatim', () => {
    const UI = new Function(`${strings}; return UI;`)();
    expect(UI.suggestions.hafna).toBe('✗ Hafna');
    expect(UI.suggestions.hafnaBadum).toBe('✗ Hafna báðum');
    expect(UI.suggestions.hafnaOllum(3)).toBe('✗ Hafna öllum (3)');
    expect(UI.suggestions.hafnaTitle).toBe('Hafna tillögu');
    expect(UI.suggestions.rejectFailed).toBe('Ekki tókst að hafna tillögunni. Reyndu aftur.');
  });
});
