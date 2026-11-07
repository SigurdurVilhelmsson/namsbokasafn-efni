/**
 * researchEmission's research-only field readers and its assist-item claims (G1.2 PR3 Task 19; spec
 * §5.10, §5.18, §14 calls 17 and 18; plan decisions 43 and 50; Review Focus 29–32, 39).
 *
 * The readers never refuse: a malformed value becomes null (decision 43). claimAssistItems rebuilds
 * each item from known fields, computes the hashes itself and sets the claim from one table, checking
 * a repetition insert against the suggestion the server would offer now (concordanceService's
 * suggestionFor, the lookup the repetition panel reads). It never throws, and it looks the suggestion
 * up at most once per call.
 *
 * A real migrated database (SESSIONS_DB_PATH in a temp dir) and synthetic modules under a temp books
 * root; nothing under books/ or pipeline-output/ is read or written.
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath()/JWT config load at import.
const work = mkdtempSync(path.join(tmpdir(), 'research-emission-fields-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const REAL_BOOKS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'books');

const { runAllMigrations } = require('../services/migrationRunner');
const segmentParser = require('../services/segmentParser');
const concordance = require('../services/concordanceService');
const { writeModule } = require('./helpers/servedFixture');
const { sha256Text } = require('../lib/servedText');
const { buildItemRows } = require('../lib/researchFilter');
const logger = require('../lib/logger');

let E;
let root;

const AT = Object.freeze({
  book: 'efnafraedi-2e',
  chapter: 1,
  moduleId: 'm97001',
  segmentId: 'm97001:para:a',
});

beforeAll(() => {
  runAllMigrations();
  root = mkdtempSync(path.join(work, 'books-'));
  segmentParser._setTestBooksDir(root);
  writeModule(root, {
    book: 'efnafraedi-2e',
    chapterDir: 'ch01',
    moduleId: 'm97001',
    en: [
      ['m97001:para:a', 'Recurring sentence.'],
      ['m97001:para:b', 'Lonely sentence.'],
    ],
    mt: [['m97001:para:a', 'Endurtekin setning.']],
  });
  writeModule(root, {
    book: 'efnafraedi-2e',
    chapterDir: 'ch02',
    moduleId: 'm97009',
    en: [['m97009:para:r', 'Recurring sentence.']],
    faithful: [['m97009:para:r', 'Samþykkt þýðing.']],
  });
  concordance.indexModule('efnafraedi-2e', 2, 'm97009');
  E = require('../services/researchEmission');
});

afterAll(() => {
  segmentParser._setTestBooksDir(REAL_BOOKS);
  rmSync(work, { recursive: true, force: true });
});

// The client builds a repetition item from the server's own suggestion (PR1 Task 10: chapter: rep.suggestion.chapter),
// and tm_segments.chapter is TEXT, so the production shape carries chapter '2', a string. Build it the same way.
const offered = () =>
  concordance
    .findRepetitions('efnafraedi-2e', 1, 'm97001')
    .find((r) => r.segmentId === 'm97001:para:a').suggestion;
const rep = (text, over = {}) => {
  const s = offered();
  return {
    itemType: 'repetition-insert',
    source: 'tm',
    clientTimeMs: 5,
    detail: { text, book: s.book, chapter: s.chapter, moduleId: s.module_id },
    ...over,
  };
};

describe('readClientFields (spec §5.18; decision 43: never refuses)', () => {
  it('keeps well-formed values', () => {
    expect(
      E.readClientFields({
        clientActionId: 'act-1',
        clientActionTime: 1_700_000_000_000,
        replayed: true,
      })
    ).toEqual({ clientActionId: 'act-1', clientActionTime: 1_700_000_000_000, replayed: true });
  });
  it('turns every malformed value into null or false', () => {
    for (const body of [
      { clientActionId: '' },
      { clientActionId: 'x'.repeat(129) },
      { clientActionId: 7 },
      { clientActionTime: 1.5 },
      { clientActionTime: -1 },
      { clientActionTime: 2 ** 53 },
      { clientActionTime: '1700000000000' },
      { replayed: 'true' },
      { replayed: 1 },
      undefined,
      null,
    ]) {
      expect(E.readClientFields(body)).toEqual({
        clientActionId: null,
        clientActionTime: null,
        replayed: false,
      });
    }
    expect(E.readClientFields({ clientActionId: 'x'.repeat(128) }).clientActionId).toHaveLength(
      128
    ); // the bound
  });
});

it('readAcceptOrigin', () => {
  expect(
    ['single', 'keyboard-stream', 'mouse', undefined].map((v) =>
      E.readAcceptOrigin({ acceptOrigin: v })
    )
  ).toEqual(['single', 'keyboard-stream', null, null]);
});

it('readReviewedEditSha256', () => {
  const h = 'a'.repeat(64);
  expect(
    [h, h.toUpperCase(), h.slice(1), null, 5].map((v) =>
      E.readReviewedEditSha256({ reviewedEditSha256: v })
    )
  ).toEqual([h, null, null, null, null]);
});

describe('claimAssistItems (spec §5.10; decision 50)', () => {
  it('a real repetition insert is validated; a planted one, or one with no suggestion offered, is mismatch', () => {
    const { items } = E.claimAssistItems(
      [rep('Samþykkt þýðing.'), rep('Fölsuð endurtekning.')],
      AT
    );
    expect(items.map((i) => i.claim)).toEqual(['validated', 'mismatch']);
    const none = E.claimAssistItems([rep('Samþykkt þýðing.')], {
      ...AT,
      segmentId: 'm97001:para:b',
    });
    expect(none.items[0].claim).toBe('mismatch');
  });

  it('a client-sent claim is ignored', () => {
    expect(
      E.claimAssistItems([rep('Fölsuð endurtekning.', { claim: 'validated' })], AT).items[0].claim
    ).toBe('mismatch');
  });

  it('the source chapter arrives as the string the server stored, and is kept as a number', () => {
    expect(offered().chapter).toBe('2'); // the production shape: tm_segments.chapter is TEXT
    const viaClient = E.claimAssistItems([rep('Samþykkt þýðing.')], AT).items[0].detail.chapter;
    const numeric = E.claimAssistItems(
      [
        rep('Samþykkt þýðing.', {
          detail: {
            text: 'Samþykkt þýðing.',
            book: 'efnafraedi-2e',
            chapter: 2,
            moduleId: 'm97009',
          },
        }),
      ],
      AT
    ).items[0].detail.chapter; // the control
    const appendix = E.claimAssistItems([rep('x', { detail: { text: 'x', chapter: '-1' } })], AT)
      .items[0].detail.chapter;
    const junk = E.claimAssistItems([rep('x', { detail: { text: 'x', chapter: 'two' } })], AT)
      .items[0].detail.chapter;
    expect([viaClient, numeric, appendix, junk]).toEqual([2, 2, -1, null]);
  });

  it('the suggestion is looked up once per call, however many repetition items it holds', () => {
    const spy = vi.spyOn(concordance, 'suggestionFor');
    try {
      const { items } = E.claimAssistItems(
        [rep('Samþykkt þýðing.'), rep('Fölsuð.'), rep('Samþykkt þýðing.')],
        AT
      );
      expect(items.map((i) => i.claim)).toEqual(['validated', 'mismatch', 'validated']);
      expect(spy).toHaveBeenCalledTimes(1);
      E.claimAssistItems([rep('Samþykkt þýðing.')], AT); // control: a second call looks it up again
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
    }
  });

  it('no suggestion offered is a result too: it is looked up once per call, not once per item', () => {
    const spy = vi.spyOn(concordance, 'suggestionFor');
    try {
      const { items } = E.claimAssistItems([rep('Samþykkt þýðing.'), rep('Fölsuð.')], {
        ...AT,
        segmentId: 'm97001:para:b',
      });
      expect(items.map((i) => i.claim)).toEqual(['mismatch', 'mismatch']);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.results[0].value).toBeNull(); // control: the lookup really found nothing
    } finally {
      spy.mockRestore();
    }
  });

  it("the server computes the whole text's hash and keeps only known detail fields", () => {
    const [item] = E.claimAssistItems(
      [
        rep('Samþykkt þýðing.', {
          detail: {
            text: 'Samþykkt þýðing.',
            book: 'efnafraedi-2e',
            chapter: 2,
            moduleId: 'm97009',
            secret: 'SENTINEL',
          },
        }),
      ],
      AT
    ).items;
    expect(item).toEqual({
      itemType: 'repetition-insert',
      source: 'tm',
      clientTimeMs: 5,
      claim: 'validated',
      detail: {
        text: 'Samþykkt þýðing.',
        textSha256: sha256Text('Samþykkt þýðing.'),
        book: 'efnafraedi-2e',
        chapter: 2,
        moduleId: 'm97009',
      },
    });
    expect(JSON.stringify(item)).not.toContain('SENTINEL');
  });

  it('a text the sent body dropped (PR1 decision 36) is unverified; an over-long text is dropped here too', () => {
    const dropped = {
      itemType: 'repetition-insert',
      source: 'tm',
      clientTimeMs: 1,
      detail: {
        book: 'efnafraedi-2e',
        chapter: 2,
        moduleId: 'm97009',
        textLength: 9000,
        textDropped: true,
      },
    };
    const long = rep('x'.repeat(10_001));
    const { items } = E.claimAssistItems([dropped, long], AT);
    expect(items.map((i) => i.claim)).toEqual(['unverified', 'unverified']);
    expect(items[1].detail).toEqual({
      book: 'efnafraedi-2e',
      chapter: 2,
      moduleId: 'm97009',
      textLength: 10_001,
      textDropped: true,
    });
  });

  it('term insert, wrap and draft restore are unverified; a legacy draft says so', () => {
    const { items } = E.claimAssistItems(
      [
        {
          itemType: 'term-insert',
          source: 'termbase',
          clientTimeMs: 2,
          detail: { term: 'hugtak' },
        },
        { itemType: 'markup-wrap', source: 'keyboard', clientTimeMs: 3, detail: { marker: '*' } },
        {
          itemType: 'draft-restore',
          source: null,
          clientTimeMs: 4,
          detail: { text: 'gamalt', legacy: true },
        },
      ],
      AT
    );
    expect(items.map((i) => [i.itemType, i.claim])).toEqual([
      ['term-insert', 'unverified'],
      ['markup-wrap', 'unverified'],
      ['draft-restore', 'unverified'],
    ]);
    expect(items[0].detail).toEqual({ term: 'hugtak', termSha256: sha256Text('hugtak') });
    expect(items[2].detail).toEqual({
      text: 'gamalt',
      textSha256: sha256Text('gamalt'),
      legacy: true,
    });
  });

  it('before G1.23 a suggestion item is kept, with its fields, and marked mismatch', () => {
    const [item] = E.claimAssistItems(
      [
        {
          itemType: 'ai-suggestion',
          source: 'ai',
          clientTimeMs: 6,
          opId: 'op-1',
          occurrence: 0,
          category: 'terminology',
          runId: 'run-1',
          groupActionId: 'g-1',
          rulingId: 'r-1',
        },
      ],
      AT
    ).items;
    expect(item).toEqual({
      itemType: 'ai-suggestion',
      source: 'ai',
      clientTimeMs: 6,
      detail: {},
      claim: 'mismatch',
      opId: 'op-1',
      occurrence: 0,
      category: 'terminology',
      runId: 'run-1',
      groupActionId: 'g-1',
      rulingId: 'r-1',
      ruleId: null,
    });
  });

  it('an unknown item type is dropped and counted; a non-array list is one drop; null is none', () => {
    expect(
      E.claimAssistItems([{ itemType: 'magic-insert' }, rep('Samþykkt þýðing.')], AT)
    ).toMatchObject({ droppedCount: 1, items: [{ itemType: 'repetition-insert' }] });
    expect(E.claimAssistItems('nope', AT)).toEqual({ items: [], droppedCount: 1 });
    expect(E.claimAssistItems(null, AT)).toEqual({ items: [], droppedCount: 0 });
  });

  it('a source the type does not allow becomes null; the item stays', () => {
    expect(
      E.claimAssistItems(
        [{ itemType: 'term-insert', source: 'keyboard', detail: { term: 'x' } }],
        AT
      ).items[0].source
    ).toBeNull();
  });

  it('a check that throws gives unverified, never mismatch', () => {
    const spy = vi.spyOn(concordance, 'suggestionFor').mockImplementation(() => {
      throw new Error('boom');
    });
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    try {
      expect(E.claimAssistItems([rep('Samþykkt þýðing.')], AT).items[0].claim).toBe('unverified');
      expect(warn).toHaveBeenCalledWith(
        { errorCode: 'Error', itemType: 'repetition-insert' },
        'Assist claim check failed; marked unverified'
      );
    } finally {
      spy.mockRestore();
      warn.mockRestore();
    }
  });

  it('a check that throws a non-Error still gives unverified (claimAssistItems never throws)', () => {
    const spy = vi.spyOn(concordance, 'suggestionFor').mockImplementation(() => {
      throw null; // eslint-disable-line no-throw-literal
    });
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    try {
      expect(E.claimAssistItems([rep('Samþykkt þýðing.')], AT).items[0].claim).toBe('unverified');
      expect(warn.mock.calls[0][0]).toEqual({
        errorCode: 'unknown',
        itemType: 'repetition-insert',
      });
    } finally {
      spy.mockRestore();
      warn.mockRestore();
    }
  });

  it('a check that throws an object with a throwing code getter still gives unverified and never throws', () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error('hostile getter');
        },
      }
    );
    const spy = vi.spyOn(concordance, 'suggestionFor').mockImplementation(() => {
      throw hostile;
    });
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    try {
      let result;
      expect(() => {
        result = E.claimAssistItems([rep('Samþykkt þýðing.')], AT);
      }).not.toThrow();
      expect(result.items[0].claim).toBe('unverified');
      expect(warn.mock.calls[0][0]).toEqual({
        errorCode: 'unknown',
        itemType: 'repetition-insert',
      });
    } finally {
      spy.mockRestore();
      warn.mockRestore();
    }
  });

  it("every item is one record accepts (Task 10's buildItemRows does not throw on any of them)", () => {
    const { items } = E.claimAssistItems(
      [
        rep('Samþykkt þýðing.'),
        rep('Fölsuð.'),
        {
          itemType: 'term-insert',
          source: 'termbase',
          clientTimeMs: 2,
          detail: { term: 'hugtak' },
        },
        { itemType: 'markup-wrap', source: 'toolbar', clientTimeMs: 3, detail: { marker: '**' } },
        { itemType: 'draft-restore', source: null, clientTimeMs: 4, detail: { text: 't' } },
        { itemType: 'rule-suggestion', source: 'rule', clientTimeMs: 7, opId: 'o', ruleId: 'R1' },
      ],
      AT
    );
    expect(() => buildItemRows('edit-save', items)).not.toThrow();
    // control: buildItemRows does throw on an item record would refuse, so the line above can fail
    expect(() => buildItemRows('edit-save', [{ ...items[0], extra: 1 }])).toThrow();
  });
});

it("the server's item sources are the client's, for every type the client sends (one vocabulary, two runtimes)", () => {
  const client = require('../public/js/segment-save-state').ITEM_SOURCES;
  for (const [type, sources] of Object.entries(client)) {
    expect([...E.ITEM_SOURCES[type]].sort()).toEqual([...sources].sort());
  }
  expect(Object.keys(client).length).toBeGreaterThan(0); // control: the client table was found
});

it('clientActionId: an empty string reads as null, so distinct acts never share one dedupe key', () => {
  // record's dedupe index and the loss ledger's dedupe both key on client_action_id IS NOT NULL;
  // '' would collapse two acts into one. A one-character id is kept (the control).
  expect(E.readClientFields({ clientActionId: '' }).clientActionId).toBeNull();
  expect(E.readClientFields({ clientActionId: 'a' }).clientActionId).toBe('a');
});
