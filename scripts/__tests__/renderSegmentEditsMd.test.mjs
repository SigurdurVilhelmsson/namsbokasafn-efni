import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tmp;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c16-md-'));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

function edit(over = {}) {
  return {
    id: 1,
    book: 'efnafraedi-2e',
    chapter: 3,
    module_id: 'm68700',
    segment_id: 'm68700:para:fs-id1',
    original_content: 'gömul vélþýðing',
    edited_content: 'leiðrétt af ritstjóra',
    editor_id: 'u1',
    editor_username: 'Sigurður',
    status: 'approved',
    category: null,
    editor_note: null,
    reviewer_note: null,
    context: { en: 'Water is polar.', mtAtSnapshot: 'gömul vélþýðing' },
    ...over,
  };
}

function snapshotWith(edits) {
  return {
    schema: 1,
    takenAt: '2026-07-30T09:00:00.000Z',
    book: 'efnafraedi-2e',
    mainCommit: 'abc1234',
    modules: ['m68700'],
    edits,
  };
}

async function render(snapshot) {
  const { renderSnapshotMarkdown } = await import('../render-segment-edits-md.js');
  return renderSnapshotMarkdown(snapshot);
}

describe('renderSnapshotMarkdown', () => {
  it('carries the provenance a hand re-application has to trust — which commit it was taken against', async () => {
    expect(await render(snapshotWith([edit()]))).toContain('abc1234');
  });

  it("shows the editor's text, the English, and the MT it replaced — all three, or the edit cannot be judged", async () => {
    const md = await render(snapshotWith([edit()]));
    expect(md).toContain('Water is polar.');
    expect(md).toContain('gömul vélþýðing');
    expect(md).toContain('leiðrétt af ritstjóra');
  });

  it('groups by module, naming it — the hand pass works one module at a time', async () => {
    const md = await render(
      snapshotWith([edit(), edit({ id: 2, module_id: 'm68699', chapter: 3 })])
    );
    expect(md).toContain('## m68699');
    expect(md).toContain('## m68700');
  });

  it('marks a rejected edit as NOT for re-application — restoring it would resurrect work a head editor turned down', async () => {
    const md = await render(snapshotWith([edit({ status: 'rejected' })]));
    expect(md).toMatch(/EKKI endurnýta/i);
  });

  it('flags retired markup, because the editor must fix the format while re-applying by hand', async () => {
    const md = await render(
      snapshotWith([edit({ edited_content: '{{i}}skáletrað{{/i}}' })])
    );
    expect(md).toContain('curly-emphasis');
  });

  it('counts what is re-usable separately from what is skipped, so the size of the job is visible up front', async () => {
    const md = await render(
      snapshotWith([edit(), edit({ id: 2, status: 'rejected' }), edit({ id: 3, status: 'pending' })])
    );
    expect(md).toMatch(/2\b[^\n]*endurnýt/i);
  });

  it('survives a segment whose EN or MT context was never captured', async () => {
    const md = await render(snapshotWith([edit({ context: { en: '', mtAtSnapshot: '' } })]));
    expect(md).toContain('leiðrétt af ritstjóra');
  });

  it('preserves the editor and reviewer notes — they are why the edit was made', async () => {
    const md = await render(
      snapshotWith([edit({ editor_note: 'samræmi við orðalista', reviewer_note: 'sammála' })])
    );
    expect(md).toContain('samræmi við orðalista');
    expect(md).toContain('sammála');
  });
});
