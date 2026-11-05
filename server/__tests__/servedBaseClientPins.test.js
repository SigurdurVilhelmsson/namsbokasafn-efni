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
