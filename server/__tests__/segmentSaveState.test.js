/**
 * G1.1 client rules (spec §5.18, §5.10; T23's pure half), tested without a DOM.
 *
 * The DOM plumbing lives in segment-editor.js and is exercised by
 * server/e2e/served-base-client.spec.js. What lives here decides VALUES. E2E is
 * a separate CI job that `npm test` does not run, so a rule gated only there is
 * gated by nothing the authoritative suite sees (the figure-drafts precedent).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const S = require('../public/js/segment-save-state');
const serverDir = join(dirname(fileURLToPath(import.meta.url)), '..');

const H1 = 'a'.repeat(64);
const H2 = 'b'.repeat(64);
const H3 = 'c'.repeat(64);

/** The page's escapeHtml (htmlUtils.js), copied: that file wraps fetch at load. */
const esc = (t) =>
  String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
const unesc = (t) =>
  t
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/** What a browser hands back from serialized attributes: each value decoded. */
function elementFrom(html) {
  const attrs = {};
  for (const m of html.matchAll(/ ([a-z0-9-]+)="([^"]*)"/g)) attrs[m[1]] = unesc(m[2]);
  return { getAttribute: (n) => (n in attrs ? attrs[n] : null) };
}

const SEG = {
  segmentId: 'm1:para:fs-1',
  is: 'Hún sagði "já"\r\nog \'nei\' <b>',
  baseSha256: H1,
  occurrence: 0,
};

describe('row data attributes (§5.18): what the row renders is what the save reads', () => {
  it('reads back exactly what the row rendered, quote, apostrophe, newline and CR included', () => {
    const html = S.rowDataAttributeHtml(
      S.rowDataAttributes(SEG, { id: 7, contentSha256: H2 }, 9),
      esc
    );
    expect(html).not.toMatch(/[\r\n]/); // a raw CR would reach the reader as LF (HTML attribute parsing)
    expect(S.readRowValues(elementFrom(html))).toEqual({
      segmentId: 'm1:para:fs-1',
      is: SEG.is,
      baseSha256: H1,
      occurrence: 0,
      displayedEditId: 7,
      displayedEditSha256: H2,
      baseEditId: 9,
    });
  });

  it('control: a row showing the base reads a null displayed pair', () => {
    const html = S.rowDataAttributeHtml(S.rowDataAttributes(SEG, null, 0), esc);
    const row = S.readRowValues(elementFrom(html));
    expect([row.displayedEditId, row.displayedEditSha256, row.baseEditId]).toEqual([null, null, 0]);
  });

  it('a row served without a base (duplicated id, organic, no layer) renders no hash and reads null', () => {
    const noBase = { ...SEG };
    delete noBase.baseSha256;
    const attrs = S.rowDataAttributes(noBase, null, 0);
    expect('data-base-sha256' in attrs).toBe(false);
    expect(S.readRowValues(elementFrom(S.rowDataAttributeHtml(attrs, esc))).baseSha256).toBeNull();
    // Control: the same segment with its hash renders it.
    expect(S.rowDataAttributes(SEG, null, 0)['data-base-sha256']).toBe(H1);
  });

  it('a malformed hash is not rendered', () => {
    expect('data-base-sha256' in S.rowDataAttributes({ ...SEG, baseSha256: 'ABC' }, null, 0)).toBe(
      false
    );
  });

  it('readRowValues of no element is null', () => {
    expect(S.readRowValues(null)).toBeNull();
  });
});

describe('request bodies (§5.6, §5.18)', () => {
  const row = {
    segmentId: 's1',
    is: 'grunnur',
    baseSha256: H1,
    occurrence: 0,
    displayedEditId: 7,
    displayedEditSha256: H2,
    baseEditId: 9,
  };
  const wire = (b) => JSON.parse(JSON.stringify(b));

  it('the save body echoes the row, not a second copy of its values', () => {
    const assists = [S.assistItem('markup-wrap', 'toolbar', 5, { marker: '**' })];
    const body = wire(
      S.buildSaveBody({
        segmentId: 's1',
        row,
        editedContent: 'nýtt',
        category: '',
        editorNote: '',
        assists,
        clientActionId: 'act-1',
        clientActionTime: 42,
      })
    );
    expect(body).toEqual({
      segmentId: 's1',
      originalContent: 'grunnur',
      editedContent: 'nýtt',
      baseEditId: 9,
      baseSha256: H1,
      displayedEditId: 7,
      displayedEditSha256: H2,
      clientActionId: 'act-1',
      clientActionTime: 42,
      assists: [
        { itemType: 'markup-wrap', source: 'toolbar', clientTimeMs: 5, detail: { marker: '**' } },
      ],
      acceptedSuggestions: [], // always sent (G1.23), empty when no suggestion was accepted
    });
    expect('occurrence' in body).toBe(false); // not sent until G1.12 (b)
    expect('replayed' in body).toBe(false); // saveRetry adds it to a replay only
  });

  it('a row with no hash sends no baseSha256 key, so the server answers by its own order', () => {
    expect(
      'baseSha256' in
        wire(
          S.buildSaveBody({
            segmentId: 's1',
            row: { ...row, baseSha256: null },
            editedContent: 'x',
            assists: [],
          })
        )
    ).toBe(false);
  });

  it("the accept body attests the row's text; any origin but the keyboard stream is single", () => {
    const base = { segmentId: 's1', row, clientActionId: 'a', clientActionTime: 1 };
    expect(S.buildAcceptBody({ ...base, acceptOrigin: 'keyboard-stream' })).toEqual({
      segmentId: 's1',
      acceptedContent: 'grunnur',
      acceptOrigin: 'keyboard-stream',
      clientActionId: 'a',
      clientActionTime: 1,
    });
    expect(S.buildAcceptBody({ ...base, acceptOrigin: undefined }).acceptOrigin).toBe('single');
  });

  // Decision 36 (approved 2026-11-04, spec AMENDED 2026-11-04): only the SENT body is bounded, and only where it would
  // otherwise answer 413.
  const longText = 'ð'.repeat(10_000); // 20,000 UTF-8 bytes: the edit route's per-text cap, in two-byte letters
  const manyInserts = Array.from({ length: 60 }, (_, i) =>
    S.assistItem('repetition-insert', 'tm', i, {
      text: longText,
      book: 'b',
      chapter: 1,
      moduleId: 'm',
    })
  );

  it("the sent body stays under express.json's limit, keeps every item and the newest whole text", () => {
    const body = S.buildSaveBody({
      segmentId: 's1',
      row,
      editedContent: longText,
      assists: manyInserts,
      clientActionId: 'a',
      clientActionTime: 1,
    });
    expect(Buffer.byteLength(JSON.stringify(body), 'utf8')).toBeLessThanOrEqual(
      S.BODY_LIMIT_BYTES - S.BODY_HEADROOM_BYTES
    );
    expect(body.assists.map((a) => a.clientTimeMs)).toEqual(manyInserts.map((a) => a.clientTimeMs)); // every item
    expect(body.assists.at(-1).detail.text).toBe(longText); // never the newest
    expect(body.assists[0].detail).toEqual({
      book: 'b',
      chapter: 1,
      moduleId: 'm',
      textLength: 10_000,
      textDropped: true,
    });
    // Control: a list that fits is sent exactly as given.
    const few = manyInserts.slice(0, 3);
    expect(
      wire(S.buildSaveBody({ segmentId: 's1', row, editedContent: 'x', assists: few })).assists
    ).toEqual(wire(few));
  });

  it('a draft keeps every whole text, however long the list (§5.10, §14 call 18)', () => {
    expect(S.draftEntry({ text: 't', assists: manyInserts }).assists).toEqual(manyInserts);
    const round = S.parseDraftValue(
      S.buildDraftValue({ s1: { text: 't', assists: manyInserts } }, 1)
    );
    expect(round.entries.s1.assists.map((a) => a.detail.text)).toEqual(
      manyInserts.map(() => longText)
    );
    // Control: the same list in a save body does lose its oldest texts (the case above), so this one can fail.
    expect(
      S.buildSaveBody({ segmentId: 's1', row, editedContent: 't', assists: manyInserts }).assists[0]
        .detail.textDropped
    ).toBe(true);
  });
});

describe('assist items (§5.10)', () => {
  it('builds each client item type from its own sources, and refuses another', () => {
    expect(S.assistItem('term-insert', 'termbase', 3, { term: 'hugtak' })).toEqual({
      itemType: 'term-insert',
      source: 'termbase',
      clientTimeMs: 3,
      detail: { term: 'hugtak' },
    });
    expect(() => S.assistItem('term-insert', 'toolbar', 3, {})).toThrow(TypeError);
    expect(S.assistItem('ai-suggestion', 'ai', 3, {})).toEqual({
      itemType: 'ai-suggestion',
      source: 'ai',
      clientTimeMs: 3,
      detail: {},
    });
    expect(() => S.assistItem('ai-suggestion', 'tm', 3, {})).toThrow(TypeError); // control: still source-checked
    expect(() => S.assistItem('rule-suggestion', 'rule', 3, {})).toThrow(TypeError); // server-only type
  });

  it('ITEM_SOURCES is exactly the four client types', () => {
    expect(S.ITEM_SOURCES).toEqual({
      'repetition-insert': ['tm'],
      'term-insert': ['termbase'],
      'markup-wrap': ['toolbar', 'keyboard'],
      'ai-suggestion': ['ai'],
    });
  });

  it('boundAssists keeps every item and drops the oldest whole texts first, never the newest', () => {
    const big = 'x'.repeat(60);
    const items = [
      S.assistItem('repetition-insert', 'tm', 1, {
        text: big,
        book: 'b',
        chapter: 1,
        moduleId: 'm',
      }),
      S.assistItem('markup-wrap', 'toolbar', 2, { marker: '**' }),
      S.assistItem('repetition-insert', 'tm', 3, {
        text: big,
        book: 'b',
        chapter: 1,
        moduleId: 'm',
      }),
    ];
    const out = S.boundAssists(items, 250);
    expect(out.map((i) => i.itemType)).toEqual([
      'repetition-insert',
      'markup-wrap',
      'repetition-insert',
    ]);
    expect(out[0].detail).toEqual({
      book: 'b',
      chapter: 1,
      moduleId: 'm',
      textLength: 60,
      textDropped: true,
    });
    expect(out[2].detail.text).toBe(big);
    expect(items[0].detail.text).toBe(big); // the caller's list is not changed
    // Control: under the limit nothing is dropped.
    expect(S.boundAssists(items, 10_000)).toEqual(items);
  });

  it("boundAssists counts UTF-8 bytes, which is what express.json's limit counts, not characters", () => {
    const items = [
      S.assistItem('repetition-insert', 'tm', 1, {
        text: 'ð'.repeat(100),
        book: 'b',
        chapter: 1,
        moduleId: 'm',
      }),
      S.assistItem('repetition-insert', 'tm', 2, {
        text: 'x',
        book: 'b',
        chapter: 1,
        moduleId: 'm',
      }),
    ];
    const chars = JSON.stringify(items).length;
    const bytes = Buffer.byteLength(JSON.stringify(items), 'utf8');
    expect(bytes - chars).toBe(100); // 'ð' is two bytes
    // A budget between the two: a character count would keep the old text; the byte count drops it.
    expect(S.boundAssists(items, chars + 50)[0].detail.textDropped).toBe(true);
    // Control: a budget of the byte length keeps everything.
    expect(S.boundAssists(items, bytes)).toEqual(items);
  });
});

describe('drafts (§5.18)', () => {
  const wrap = S.assistItem('markup-wrap', 'toolbar', 5, { marker: '**' });

  it('writes version 2, with the ts tabGuard reads, and a drafts mirror a pre-deploy page reads', () => {
    const value = S.buildDraftValue(
      { s1: { text: 'texti', baseSha256: H1, occurrence: 0, assists: [wrap] } },
      1000
    );
    expect(value).toEqual({
      v: 2,
      ts: 1000,
      segments: {
        s1: { text: 'texti', baseSha256: H1, occurrence: 0, assists: [wrap], refused: null },
      },
      drafts: { s1: 'texti' },
    });
    expect(S.parseDraftValue(JSON.parse(JSON.stringify(value)))).toEqual({
      legacy: false,
      entries: value.segments,
    });
  });

  it("reads today's {ts, drafts} as legacy entries with no base", () => {
    expect(S.parseDraftValue({ ts: 1, drafts: { s1: 'gamalt' } })).toEqual({
      legacy: true,
      entries: {
        s1: {
          text: 'gamalt',
          baseSha256: null,
          occurrence: null,
          assists: [],
          refused: null,
          legacy: true,
        },
      },
    });
  });

  it('reads neither an unknown version nor a shapeless value', () => {
    expect(S.parseDraftValue({ v: 3, ts: 1, segments: {} })).toBeNull();
    expect(S.parseDraftValue({ ts: 1 })).toBeNull();
    expect(S.parseDraftValue('texti')).toBeNull();
  });

  it('a restore re-installs the assists, then adds draft-restore with the text it put in place', () => {
    const entry = S.draftEntry({ text: 'texti', baseSha256: H1, occurrence: 0, assists: [wrap] });
    expect(S.restoredAssists(entry, 7000)).toEqual([
      wrap,
      { itemType: 'draft-restore', source: null, clientTimeMs: 7000, detail: { text: 'texti' } },
    ]);
  });

  it('a legacy restore is unverified and says so; a version-2 restore makes no claim', () => {
    const legacy = S.parseDraftValue({ ts: 1, drafts: { s1: 'gamalt' } }).entries.s1;
    expect(S.draftRestoreItem(legacy, 9)).toEqual({
      itemType: 'draft-restore',
      source: null,
      clientTimeMs: 9,
      claim: 'unverified',
      detail: { legacy: true, text: 'gamalt' },
    });
    expect('claim' in S.draftRestoreItem(S.draftEntry({ text: 'nýtt' }), 9)).toBe(false);
  });

  it('mergeDraftValues: the newest draft wins, and a kept text in an older draft is not lost (Review Focus 24)', () => {
    const kept = {
      text: 'kept',
      baseSha256: H1,
      occurrence: 0,
      assists: [wrap],
      refused: 'STALE_BASE',
    };
    const older = S.buildDraftValue(
      { s1: kept, s2: { text: 'old typing', baseSha256: H1, occurrence: 0, assists: [] } },
      1000
    );
    const newer = S.buildDraftValue(
      { s3: { text: 'other tab', baseSha256: H2, occurrence: 0, assists: [] } },
      2000
    );
    const merged = S.mergeDraftValues([older, newer]); // storage order is not time order
    expect(Object.keys(merged.entries).sort()).toEqual(['s1', 's3']);
    expect(merged.entries.s1).toEqual(S.draftEntry(kept));
    expect(merged.entries.s3).toEqual(
      S.draftEntry({ text: 'other tab', baseSha256: H2, occurrence: 0, assists: [] })
    );
    // Control: an older UNREFUSED text is not carried; the newest draft holds the typing, as today's restore reads it.
    expect(merged.entries.s2).toBeUndefined();
    // The newest draft's own text for a kept segment wins, and keeps the older refusal (as mergeRestoreSources does).
    const both = S.mergeDraftValues([
      older,
      S.buildDraftValue(
        { s1: { text: 'newer', baseSha256: H2, occurrence: 0, assists: [] } },
        3000
      ),
    ]);
    expect(both.entries.s1).toEqual({
      ...S.draftEntry({ text: 'newer', baseSha256: H2, occurrence: 0, assists: [] }),
      refused: 'STALE_BASE',
    });
    expect(S.mergeDraftValues([])).toBeNull();
    expect(S.mergeDraftValues([{ ts: 5 }, 'texti', null])).toBeNull(); // nothing parseable
  });
});

describe('kept texts (index decision 12)', () => {
  const row = { is: 'grunnur', baseSha256: H1, occurrence: 0 };
  const ALL = [
    'STALE_BASE',
    'STALE_DISPLAYED',
    'BASE_MISSING',
    'DUPLICATE_ID',
    'BOOK_NOT_MINTED',
    'NO_LAYER',
    'conflict',
    'STALE_CONTENT',
    'EDIT_EXISTS',
    undefined,
  ];

  it('keeps the text for exactly the refusal codes, not for a live conflict', () => {
    expect(ALL.filter((c) => S.keepsText(c))).toEqual([
      'STALE_BASE',
      'STALE_DISPLAYED',
      'BASE_MISSING',
      'DUPLICATE_ID',
      'BOOK_NOT_MINTED',
      'NO_LAYER',
    ]);
  });

  it('a refused entry holds the base the save was sent with, its occurrence, its assists and the code', () => {
    const assists = [S.assistItem('markup-wrap', 'keyboard', 1, { marker: '*' })];
    const e = S.refusedEntry({ text: 'typed', row, assists, code: 'STALE_BASE' });
    expect(e).toEqual({
      text: 'typed',
      baseSha256: H1,
      occurrence: 0,
      assists,
      refused: 'STALE_BASE',
    });
    expect(e.assists).not.toBe(assists);
  });

  it('turns a parked replay into an entry; a pre-deploy body has no base; an accept body is none', () => {
    const body = (b) => ({
      key: 'seg:b/1/m:s1',
      body: JSON.stringify(b),
      status: 409,
      code: 'BASE_MISSING',
    });
    expect(S.entryFromParked(body({ segmentId: 's1', editedContent: 'typed' }))).toEqual({
      segmentId: 's1',
      entry: {
        text: 'typed',
        baseSha256: null,
        occurrence: null,
        assists: [],
        refused: 'BASE_MISSING',
      },
    });
    expect(S.entryFromParked(body({ segmentId: 's1', acceptedContent: 'x' }))).toBeNull();
    expect(S.entryFromParked({ key: 'k', body: '{not json', code: 'conflict' })).toBeNull();
  });

  // PR1 review C17: a save body carries no occurrence until G1.12 (b) (plan § What the client sends), so a parked
  // entry has none, and the pane takes the row's (installDraft: entry.occurrence !== null ? … : row.occurrence).
  it('a parked save names no occurrence: the save body sends none, so the row supplies it', () => {
    const sent = S.buildSaveBody({
      segmentId: 's1',
      row: { is: 'grunnur', baseSha256: H1, occurrence: 2, baseEditId: 0 },
      editedContent: 'typed',
      assists: [],
    });
    expect('occurrence' in sent).toBe(false); // the contract: not sent
    const parked = (b) => ({ key: 'seg:b/1/m:s1', body: JSON.stringify(b), code: 'STALE_BASE' });
    expect(S.entryFromParked(parked(sent)).entry.occurrence).toBeNull();
    // A body that names one anyway is not a save body: its occurrence is not read either. Control: its base is.
    const odd = S.entryFromParked(parked({ ...sent, occurrence: 3 })).entry;
    expect(odd.occurrence).toBeNull();
    expect(odd.baseSha256).toBe(H1);
  });

  it('a parked replay that exhausted its retries (5xx or network) is a kept text with the generic notice (decision 28)', () => {
    const typed = JSON.stringify({ segmentId: 's1', editedContent: 'typed', baseSha256: H1 });
    // No code (a body that was not JSON, or named none): kept, and the notice is the generic one.
    const none = S.entryFromParked({ key: 'seg:b/1/m:s1', body: typed, status: 502, code: null });
    expect(none.entry).toEqual({
      text: 'typed',
      baseSha256: H1,
      occurrence: null,
      assists: [],
      refused: 'REFUSED',
    });
    expect(S.noticeFor(none.entry, H1)).toBe('REFUSED');
    // Network failures exhausted it (status null, no code, [USER]'s later answer): the same kept text and notice.
    const net = S.entryFromParked({ key: 'seg:b/1/m:s1', body: typed, status: null, code: null });
    expect(net.entry).toEqual(none.entry);
    expect(S.noticeFor(net.entry, H1)).toBe('REFUSED');
    // A server error string as the code is not a refusal code either: the same generic notice.
    const named = S.entryFromParked({
      key: 'seg:b/1/m:s1',
      body: typed,
      status: 503,
      code: 'unavailable',
    });
    expect(S.noticeFor(named.entry, H1)).toBe('REFUSED');
    // Control: a parked refusal code keeps its own notice.
    const stale = S.entryFromParked({
      key: 'seg:b/1/m:s1',
      body: typed,
      status: 409,
      code: 'STALE_BASE',
    });
    expect(S.noticeFor(stale.entry, H1)).toBe('STALE_BASE');
  });

  it('a draft entry wins over a parked one for the same segment, and keeps the parked refusal', () => {
    const fromDraft = {
      legacy: false,
      entries: { s1: S.draftEntry({ text: 'newer', baseSha256: H2 }) },
    };
    const parked = [
      {
        key: 'seg:b/1/m:s1',
        body: JSON.stringify({ segmentId: 's1', editedContent: 'older', baseSha256: H1 }),
        code: 'conflict',
      },
      {
        key: 'seg:b/1/m:s2',
        body: JSON.stringify({ segmentId: 's2', editedContent: 'other' }),
        code: 'STALE_BASE',
      },
    ];
    const out = S.mergeRestoreSources(fromDraft, parked);
    expect(out.s1).toEqual({
      text: 'newer',
      baseSha256: H2,
      occurrence: null,
      assists: [],
      refused: 'conflict',
    });
    expect(out.s2.text).toBe('other');
  });

  it('chooses the notice by code when refused, else by comparing bases; a legacy draft gets none', () => {
    const e = (over) => S.draftEntry({ text: 't', baseSha256: H1, ...over });
    expect(S.noticeFor(e({}), H2)).toBe('STALE_BASE');
    expect(S.noticeFor(e({}), H1)).toBeNull(); // control: same base, no notice
    expect(S.noticeFor(e({ refused: 'DUPLICATE_ID' }), H1)).toBe('DUPLICATE_ID');
    expect(S.noticeFor(e({ refused: 'conflict' }), H1)).toBe('REFUSED');
    expect(S.noticeFor(S.parseDraftValue({ ts: 1, drafts: { s: 't' } }).entries.s, H2)).toBeNull();
  });
});

describe("the save response's echo, kept on the row (G1.21, §5.18)", () => {
  // The save route's response fields (Task 14; plan decision 15). A rename changes this file and the module, nowhere else.
  it('an in-flight save sets the base, the displayed pair and the conflict token', () => {
    expect(
      S.echoAttributeUpdates(
        { editId: 12, baseSha256: H1, displayedEditId: 12, displayedEditSha256: H3 },
        9
      )
    ).toEqual([
      ['data-base-sha256', H1],
      ['data-displayed-edit-id', '12'],
      ['data-displayed-edit-sha256', H3],
      ['data-base-edit-id', '12'],
    ]);
  });

  // PR1 review C21: the conflict token never moves backwards. A save answered with an editId below the row's
  // keeps the row's, or the next save would send the lower one and meet a spurious conflict.
  it('the conflict token keeps the higher of the row and the answer', () => {
    expect(
      S.echoAttributeUpdates(
        { editId: 5, baseSha256: H1, displayedEditId: 5, displayedEditSha256: H3 },
        9
      )
    ).toEqual([
      ['data-base-sha256', H1],
      ['data-displayed-edit-id', '5'],
      ['data-displayed-edit-sha256', H3],
      ['data-base-edit-id', '9'],
    ]);
  });

  it('a withdraw clears the displayed pair', () => {
    expect(
      S.echoAttributeUpdates(
        { baseSha256: H1, displayedEditId: null, displayedEditSha256: null },
        9
      )
    ).toEqual([
      ['data-base-sha256', H1],
      ['data-displayed-edit-id', null],
      ['data-displayed-edit-sha256', null],
    ]);
  });

  it("control: a response without the fields (today's) changes nothing", () => {
    expect(S.echoAttributeUpdates({ success: true, updated: false }, 9)).toEqual([]);
    // Today's save route answers with editId too (routes/segment-editor.js, res.json after the save), and Task 9
    // reads it before Task 14 adds the echo fields: the conflict token moves only with the displayed pair.
    expect(
      S.echoAttributeUpdates(
        { success: true, editId: 12, updated: false, termWarnings: [], qaFindings: [] },
        9
      )
    ).toEqual([]);
  });
});

describe('client action ids (§5.9)', () => {
  it('uses randomUUID where it exists, else a random string', () => {
    expect(S.newClientActionId({ randomUUID: () => 'uuid-1' })).toBe('uuid-1');
    const a = S.newClientActionId(undefined);
    expect(a).toMatch(/^[a-z0-9-]{12,}$/);
    expect(S.newClientActionId(undefined)).not.toBe(a);
  });
});

describe('the editor page loads the module before segment-editor.js', () => {
  it('has the script tag, in order', () => {
    const html = readFileSync(join(serverDir, 'views', 'segment-editor.html'), 'utf-8');
    const mod = html.indexOf('<script src="/js/segment-save-state.js"></script>');
    expect(mod).toBeGreaterThan(-1);
    expect(mod).toBeLessThan(html.indexOf('<script src="/js/segment-editor.js"></script>'));
  });
});

/**
 * tabGuard keys its newest-draft lookup and its 7-day sweep on `ts`. This runs
 * the REAL tabGuard over REAL values built by buildDraftValue and asserts the
 * CONSEQUENCE (the figureDrafts.test.js idiom), with a fresh value as control.
 */
describe('tabGuard reads and sweeps a version-2 segment draft', () => {
  let store;
  const saved = {};
  beforeEach(() => {
    store = new Map();
    const localStorage = {
      get length() {
        return store.size;
      },
      key: (i) => [...store.keys()][i] ?? null,
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    };
    for (const [name, value] of [
      ['localStorage', localStorage],
      ['window', { addEventListener() {} }],
      ['document', { addEventListener() {} }],
      ['BroadcastChannel', undefined],
    ]) {
      saved[name] = globalThis[name];
      globalThis[name] = value;
    }
  });
  afterEach(() => {
    for (const name of Object.keys(saved)) globalThis[name] = saved[name];
    delete require.cache[require.resolve('../public/js/tabGuard')];
  });

  it('sweeps a stale one, keeps a fresh one, and finds the newest', () => {
    const prefix = 'seg-draft:bok/3/m1:';
    const EIGHT_DAYS = 8 * 24 * 60 * 60 * 1000;
    store.set(
      prefix + 'old',
      JSON.stringify(S.buildDraftValue({ s1: { text: 'gamalt' } }, Date.now() - EIGHT_DAYS))
    );
    store.set(
      prefix + 'legacy',
      JSON.stringify({ ts: Date.now() - 1000, drafts: { s1: 'eldra' } })
    );
    store.set(
      prefix + 'new',
      JSON.stringify(S.buildDraftValue({ s1: { text: 'nýtt' } }, Date.now()))
    );
    delete require.cache[require.resolve('../public/js/tabGuard')];
    require('../public/js/tabGuard'); // runs cleanupStaleDrafts() on load
    expect(store.has(prefix + 'old')).toBe(false);
    expect(store.has(prefix + 'new')).toBe(true);
    const found = globalThis.window.tabGuard.findNewestDraft(prefix);
    expect(found.key).toBe(prefix + 'new');
    expect(S.parseDraftValue(found.data).entries.s1.text).toBe('nýtt');
  });
});

describe('AI suggestion items (G1.23)', () => {
  const group = {
    key: 'k1',
    segmentId: 's1',
    occurrence: 0,
    rulingId: 'ruling-7',
    source: 'x',
    label: { en: 'a', is: 'b' },
    changes: [
      {
        opId: 'op1',
        occurrence: 0,
        find: 'a',
        replace: 'hugtak',
        category: 'term',
        runId: 'run1',
        chainIndex: 0,
      },
      {
        opId: 'op2',
        occurrence: 0,
        find: 'b',
        replace: 'orð',
        category: 'term',
        runId: 'run1',
        chainIndex: 1,
      },
    ],
  };
  const byOp = { op1: group.changes[0], op2: group.changes[1] };

  it('suggestionItems gives one item per change, sharing the group action id', () => {
    const items = S.suggestionItems(group, 'ga1', 55);
    expect(items).toEqual([
      {
        itemType: 'ai-suggestion',
        source: 'ai',
        clientTimeMs: 55,
        detail: {},
        opId: 'op1',
        occurrence: 0,
        category: 'term',
        runId: 'run1',
        rulingId: 'ruling-7',
        groupActionId: 'ga1',
      },
      expect.objectContaining({ opId: 'op2', groupActionId: 'ga1', rulingId: 'ruling-7' }),
    ]);
  });

  it('suggestionItems of a group with no changes is empty', () => {
    expect(S.suggestionItems({ rulingId: 'r', changes: [] }, 'g', 1)).toEqual([]);
  });

  it('acceptedFromAssists keeps an op whose replace is in the saved text and drops one typed away', () => {
    const items = S.suggestionItems(group, 'ga1', 1);
    expect(S.acceptedFromAssists(items, 'Þetta hugtak og orð.', byOp)).toEqual([
      { opId: 'op1', occurrence: 0 },
      { opId: 'op2', occurrence: 0 },
    ]);
    expect(S.acceptedFromAssists(items, 'Þetta hugtak.', byOp)).toEqual([
      { opId: 'op1', occurrence: 0 },
    ]);
    expect(S.acceptedFromAssists(items, 'ekkert', byOp)).toEqual([]);
  });

  it('acceptedFromAssists reads a Map too, drops an op with no change, and ignores other item types', () => {
    const items = S.suggestionItems(group, 'ga1', 1).concat([
      S.assistItem('term-insert', 'termbase', 2, { term: 'hugtak' }),
    ]);
    const map = new Map([['op1', group.changes[0]]]);
    expect(S.acceptedFromAssists(items, 'hugtak orð', map)).toEqual([
      { opId: 'op1', occurrence: 0 },
    ]);
    expect(S.acceptedFromAssists(items, 'hugtak orð', {})).toEqual([]);
    expect(S.acceptedFromAssists(null, 'hugtak', byOp)).toEqual([]);
  });

  it('acceptedFromAssists is distinct by opId (first wins), and drops entries the server would refuse', () => {
    const one = S.suggestionItems(group, 'ga1', 1)[0];
    const dup = Object.assign({}, one, { occurrence: 3 });
    expect(S.acceptedFromAssists([one, dup], 'hugtak', byOp)).toEqual([
      { opId: 'op1', occurrence: 0 },
    ]);
    const badOcc = Object.assign({}, one, { occurrence: -1 });
    const badId = Object.assign({}, one, { opId: '' });
    const longId = 'o'.repeat(129);
    const longItem = Object.assign({}, one, { opId: longId });
    const withLong = Object.assign({}, byOp, { [longId]: group.changes[0] });
    expect(S.acceptedFromAssists([badOcc, badId, longItem], 'hugtak', withLong)).toEqual([]);
    expect(S.acceptedFromAssists([one], 'hugtak', byOp)).toHaveLength(1); // control: a good item passes
  });

  it('acceptedFromAssists caps the list at 500', () => {
    const items = [];
    const changes = {};
    for (let n = 0; n < 505; n++) {
      items.push(Object.assign({}, S.suggestionItems(group, 'g', 1)[0], { opId: 'o' + n }));
      changes['o' + n] = { replace: 'x' };
    }
    expect(S.acceptedFromAssists(items, 'x', changes)).toHaveLength(500);
  });

  it('a restored draft keeps its ai-suggestion items, so acceptedFromAssists still finds them', () => {
    const items = S.suggestionItems(group, 'ga1', 1);
    const value = JSON.parse(
      JSON.stringify(
        S.buildDraftValue(
          { s1: { text: 'hugtak', baseSha256: H1, occurrence: 0, assists: items } },
          5
        )
      )
    );
    const entry = S.parseDraftValue(value).entries.s1;
    const restored = S.restoredAssists(entry, 9);
    expect(restored.slice(0, 2)).toEqual(items);
    expect(restored[0].opId).toBe('op1');
    expect(restored[0].groupActionId).toBe('ga1');
    expect(S.acceptedFromAssists(restored, 'hugtak', byOp)).toEqual([
      { opId: 'op1', occurrence: 0 },
    ]);
  });

  it('buildSaveBody sends acceptedSuggestions beside assists, never inside it', () => {
    const items = S.suggestionItems(group, 'ga1', 1);
    const accepted = [{ opId: 'op1', occurrence: 0 }];
    const body = S.buildSaveBody({
      segmentId: 's1',
      row: { is: 'x', baseSha256: H1 },
      editedContent: 'hugtak',
      assists: items,
      acceptedSuggestions: accepted,
      clientActionId: 'c1',
      clientActionTime: 2,
    });
    expect(body.acceptedSuggestions).toEqual(accepted);
    expect(body.assists).toHaveLength(2);
    expect(JSON.stringify(body.assists)).not.toContain('acceptedSuggestions');
    const none = S.buildSaveBody({
      segmentId: 's1',
      row: {},
      editedContent: 't',
      acceptedSuggestions: 'junk',
    });
    expect(none.acceptedSuggestions).toEqual([]); // control: absent or malformed is []
    expect(
      S.buildSaveBody({ segmentId: 's1', row: {}, editedContent: 't' }).acceptedSuggestions
    ).toEqual([]);
  });
});
