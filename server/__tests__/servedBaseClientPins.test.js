/**
 * G1.1 client wiring (spec §5.18), static pins. PRESENCE ONLY: the behaviour
 * (a declined re-render, the bodies sent) is server/e2e/served-base-client.spec.js,
 * and the value rules are segmentSaveState.test.js.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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
