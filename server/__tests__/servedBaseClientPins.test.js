/**
 * G1.1 client wiring (spec §5.18), static pins. PRESENCE ONLY: the behaviour
 * (a declined re-render, the bodies sent) is server/e2e/served-base-client.spec.js,
 * and the value rules are segmentSaveState.test.js.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const serverDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(serverDir, 'public', 'js', 'segment-editor.js'), 'utf-8');
const fnBody = (name, next) => {
  const start = src.indexOf(`function ${name}(`);
  const end = src.indexOf(`function ${next}(`, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
};

describe('the save and the accept read the row, not moduleData (§5.18, T23)', () => {
  it('rows render the served values as data- attributes', () => {
    const row = fnBody('renderSegmentRow', 'eligibilityView');
    expect(row).toContain('segmentSaveState.rowDataAttributes(');
    expect(row).toMatch(/id="row-\$\{cssId\(seg\.segmentId\)\}"\$\{rowAttrs\}/);
  });

  it('saveEdit builds its body from the row', () => {
    const save = fnBody('saveEdit', 'latestEditIdForSegment');
    expect(save).toContain('rowValues(segmentId)');
    expect(save).toContain('segmentSaveState.buildSaveBody(');
    expect(save).not.toMatch(/originalContent:\s*seg\.is/);
    expect(save).not.toMatch(/editedContent === seg\.is/);
    expect(save).toContain('applySaveEcho(segmentId, saveResult)');
  });

  it("acceptSegment attests the row's text and passes its origin", () => {
    const acc = fnBody('acceptSegment', 'acceptSegmentAndAdvance');
    expect(acc).toContain('segmentSaveState.buildAcceptBody(');
    expect(acc).not.toMatch(/acceptedContent:\s*seg\.is/);
    expect(src).toContain("acceptSegmentAndAdvance(cur.segmentId, 'keyboard-stream')");
    expect(src).toMatch(/onclick="acceptSegmentAndAdvance\('\$\{seg\.segmentId\}', 'single'\)"/);
  });

  it('approve, reject and discuss send the hash of the edit the reviewer sees', () => {
    expect(fnBody('reviewEdit', 'unapproveEdit')).toMatch(
      /reviewedEditSha256:\s*reviewedEditSha256For\(editId\)/
    );
  });
});

describe('assists are recorded at their three sites and sent (§5.10)', () => {
  it('each site adds its own item type to the pane that received it', () => {
    expect(fnBody('insertRepetition', 'highlightQuery')).toMatch(
      /addAssist\(\s*segmentId,[\s\S]*'repetition-insert',\s*'tm'/
    );
    expect(fnBody('insertTermFromLookup', 'wrapSelection')).toMatch(
      /addAssist\(\s*ta\._segmentId,[\s\S]*'term-insert',\s*'termbase'/
    );
    expect(fnBody('wrapSelection', 'waitFor')).toMatch(
      /'markup-wrap',\s*source === 'keyboard' \? 'keyboard' : 'toolbar'/
    );
    expect(src).toMatch(/wrapSelection\(taId, '\*\*', '\*\*', 'keyboard'\)/);
  });

  it("saveEdit sends the pane's list and clears it on success", () => {
    const save = fnBody('saveEdit', 'latestEditIdForSegment');
    expect(save).toMatch(/assists:\s*paneAssists\(segmentId\)/);
    expect(save).toContain('clearPaneState(segmentId)');
  });
});

describe('drafts are version 2 and a restore re-installs assists (§5.18)', () => {
  it("saveDraft writes through buildDraftValue with the pane's base and assists", () => {
    const save = fnBody('saveDraft', 'clearDraft');
    expect(save).toContain('segmentSaveState.draftEntry(');
    expect(save).toMatch(/writeDraft\(/);
    expect(src).toContain('segmentSaveState.buildDraftValue(');
  });

  it('restoreDraft reads every draft under the prefix, parses either format, and installs through installDraft', () => {
    const restore = fnBody('restoreDraft', 'installDraft');
    expect(restore).toContain('draftValuesUnder(prefix)'); // not only findNewestDraft: Review Focus 24
    expect(restore).toContain('segmentSaveState.mergeDraftValues(');
    expect(restore).toMatch(/installDraft\([^)]*addRestoreItem: true/);
    expect(src).toContain('segmentSaveState.restoredAssists(');
  });
});

describe('a refused save keeps the text (index decision 12)', () => {
  it('saveEdit keeps the text on a kept code and never sends a DUPLICATE_ID pane', () => {
    const save = fnBody('saveEdit', 'latestEditIdForSegment');
    expect(save).toMatch(/segmentSaveState\.keepsText\(err\.code\)/);
    expect(save).toMatch(/keepText\(\s*segmentId,\s*segmentSaveState\.refusedEntry\(/);
    expect(save).toMatch(/refused === 'DUPLICATE_ID'[\s\S]*return;/);
  });

  it('every notice a restored pane can show has its own wording key', () => {
    const require = createRequire(import.meta.url);
    const { NOTICE_CODES } = require('../public/js/segment-save-state');
    for (const code of NOTICE_CODES)
      expect(src).toMatch(new RegExp(`${code}: UI\\.draftNotice\\.\\w+`));
  });

  it('the Back button keeps kept texts, and a re-render carries them', () => {
    expect(fnBody('clearDraft', 'startDraftTimer')).toContain('keptEntries()');
    expect(fnBody('renderSegments', 'baselineTextFor')).toContain('reinstallHeldDrafts()');
  });

  it('a refused save is never propagated: the guard sits between the save and the preview (decision 32)', () => {
    expect(fnBody('propagateSegment', 'reviewEdit')).toMatch(
      /await saveEdit\(segmentId\)[\s\S]*heldDrafts\.has\(segmentId\)[\s\S]*return;[\s\S]*propagation-preview/
    );
  });
});

describe('a 409 to a replay comes back (index decision 12)', () => {
  it('segment saves park a refused replay and the editor takes it', () => {
    expect(src).toMatch(
      /setKeyPolicy\('seg:', \{[^}]*parkRefused: true[^}]*onParked: onSaveParked/
    );
    expect(fnBody('restoreDraft', 'installDraft')).toMatch(/takeParked\(parkedPrefix\(\)\)/);
    expect(fnBody('onSaveParked', 'reinstallHeldDrafts')).toMatch(
      /takeParked\(item\.key, \{ exact: true \}\)/
    );
  });
});

describe('a serve whose opening was not recorded (spec §5.4; PR2)', () => {
  // The catch's code without its comments: its comment names what it does NOT call (clearDraft), which must not
  // satisfy or trip a pin (measured on the Step 3 text: unstripped, the no-discard pin fails on that comment).
  const catchCode = () =>
    fnBody('loadModule', 'loadTermData')
      .split('} catch (err) {')[1]
      .replace(/\/\/[^\n]*/g, '');
  const DISCARD =
    /loadModule\(|fetchJson\(|clearDraft|clearDraftsByPrefix|localStorage|heldDrafts\.(clear|delete)|paneState\.(clear|delete)/;
  it("loadModule's error path names OPENING_UNRECORDED, shows its own text and returns to the module list", () => {
    const load = fnBody('loadModule', 'loadTermData');
    expect(load).toMatch(
      /err\.status === 503 && err\.data && err\.data\.error === 'OPENING_UNRECORDED'/
    );
    expect(load).toContain('UI.segmentEditor.openingUnrecorded');
    expect(load).toMatch(/getElementById\('module-selector'\)\.style\.display = 'block'/);
    // control: the generic text is still there, so the slice is loadModule's catch
    expect(load).toContain('UI.common.errorLoading + err.message');
  });
  it('a reload from an open pane: its texts go into the draft, then the editor leaves the unit (T6)', () => {
    const c = catchCode();
    expect(c).toContain("const pane = document.getElementById('editor-container');");
    const start = c.indexOf("if (unrecorded && pane.style.display !== 'none') {");
    expect(start).toBeGreaterThan(-1);
    const branch = c.slice(start, c.indexOf('alert(', start));
    // Exactly these two statements, in this order: leaveModule empties dirtyEdits and heldDrafts, which saveDraft
    // reads. Nothing else, so nothing drops a text before saveDraft writes it (the behaviour is the E2E's).
    const body = branch.slice(branch.indexOf('{') + 1, branch.lastIndexOf('}'));
    expect(body.replace(/\s+/g, ' ').trim()).toBe('saveDraft(); leaveModule();');
    // control: neither runs outside the branch, so a first load and every other error keep today's path
    expect(c.slice(0, start)).not.toMatch(/saveDraft|leaveModule|dirtyEdits\.clear|'none'/);
  });
  it('the error path retries nothing and discards no draft', () => {
    const c = catchCode();
    expect(c).toBeTruthy();
    expect(c).not.toMatch(DISCARD);
    // control: the pin fires on a planted discard (alert( is in the catch before Step 3 and after it)
    expect(c.replace('alert(', 'clearDraft(); alert(')).toMatch(DISCARD);
  });
});

describe('leaving a unit: Back and the OPENING_UNRECORDED branch share leaveModule (PR2 review U1-U5, U13-U15)', () => {
  // The body without its comments, which name what it does not call (saveDraft, clearDraft).
  const leaveCode = () => {
    const start = src.indexOf('function leaveModule(');
    const end = src.indexOf('// BACK BUTTON', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return src.slice(start, end).replace(/\/\/[^\n]*/g, '');
  };
  const WRITES =
    /saveDraft|writeDraft|clearDraft|clearDraftsByPrefix|localStorage|loadModule\(|fetchJson\(/;
  it('it closes every pane and leaves nothing in memory that belongs to the unit', () => {
    const body = leaveCode();
    const steps = [
      "querySelectorAll('.edit-panel.active')",
      "classList.remove('active')",
      "classList.remove('editing')",
      'dirtyEdits.clear();',
      'heldDrafts.clear();',
      'paneState.clear();',
      'clearInterval(draftTimer)',
      'tabGuard.release();',
      "getElementById('editor-container').style.display = 'none';",
      "getElementById('save-status-bar').style.display = 'none';",
      'moduleData = null;',
      'cursorSegmentId = null;',
    ];
    expect(steps.filter((s) => !body.includes(s))).toEqual([]);
  });
  it('it writes nothing to storage: the caller decides what the draft keeps', () => {
    const body = leaveCode();
    expect(body).not.toMatch(WRITES);
    // control: the pin fires on a planted write
    expect(body.replace('dirtyEdits.clear();', 'saveDraft(); dirtyEdits.clear();')).toMatch(WRITES);
  });
  it('Back discards first (clearDraft keeps only refused texts), then leaves', () => {
    const start = src.indexOf("getElementById('btn-back').addEventListener('click'");
    const end = src.indexOf('// CONCORDANCE SEARCH WIRING', start);
    expect(start).toBeGreaterThan(-1);
    const back = src.slice(start, end).replace(/\/\/[^\n]*/g, '');
    expect(back.indexOf('clearDraft();')).toBeGreaterThan(-1);
    expect(back.indexOf('clearDraft();')).toBeLessThan(back.indexOf('leaveModule();'));
  });
});
