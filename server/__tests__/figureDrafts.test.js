/**
 * Figure-card unsaved-edit preservation — the DECISION, tested without a DOM.
 *
 * The defect this guards: saving one figure block re-fetches and rebuilds every
 * card from the server payload, so text typed into a SIBLING block was destroyed
 * silently. Silent loss of editorial input is the one thing this application
 * exists to prevent.
 *
 * ⚠️ E2E does not run under `npm test` — it is a separate CI job (see
 * figureCardClientPins.test.js's header) — so the browser proof in
 * server/e2e/figure-review.spec.js is gated by nothing the authoritative suite
 * runs. That is why the rule lives in a pure function here: the DOM plumbing is
 * exercised in the browser, but WHICH VALUES SURVIVE is decided by code this
 * file can execute.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  unsavedFigureEdits,
  figDraftKey,
  figDraftPrefix,
  FIG_DRAFT_PREFIX,
} = require('../public/js/figure-drafts');

/** A server payload shaped like GET …/figures returns it. */
function serverFigures() {
  return [
    { basename: 'FigA', blocks: { one: 'server one', two: 'server two' } },
    { basename: 'FigB', blocks: { three: 'server three' } },
  ];
}

describe('unsavedFigureEdits', () => {
  it('preserves a sibling block the editor typed into but did not save', () => {
    // The reported defect, stated as a value: FigA/two was rebuilt from the
    // server and the typing vanished.
    const live = { FigA: { blocks: { one: 'server one', two: 'TYPED' } } };
    const out = unsavedFigureEdits(serverFigures(), live, { basename: 'FigA', blockKey: 'one' });
    expect(out.FigA.blocks).toEqual({ two: 'TYPED' });
  });

  it('does not preserve a block whose live value already equals the server value', () => {
    // The ordinary case after a clean rebuild — everything matches, so nothing
    // is "unsaved" and no block may be marked as such.
    const live = { FigA: { blocks: { one: 'server one', two: 'server two' } } };
    expect(unsavedFigureEdits(serverFigures(), live, null)).toEqual({});
  });

  it('lets the server win for the block just saved, even when the values differ', () => {
    // The server may normalise what it stored. Re-applying the pre-save DOM
    // value would silently undo the save the editor just watched succeed.
    const live = { FigA: { blocks: { one: 'what I typed' } } };
    const out = unsavedFigureEdits(serverFigures(), live, { basename: 'FigA', blockKey: 'one' });
    expect(out).toEqual({});
  });

  it('scopes the just-saved exemption to its own figure', () => {
    // Same block key in two figures must not cross-cancel.
    const figs = [
      { basename: 'FigA', blocks: { one: 'server one' } },
      { basename: 'FigB', blocks: { one: 'server one' } },
    ];
    const live = { FigA: { blocks: { one: 'X' } }, FigB: { blocks: { one: 'X' } } };
    const out = unsavedFigureEdits(figs, live, { basename: 'FigA', blockKey: 'one' });
    expect(out).toEqual({ FigB: { blocks: { one: 'X' } } });
  });

  it('drops a figure the server no longer returns', () => {
    // Re-applying into a card that no longer exists would resurrect text for a
    // figure the open module does not have.
    const live = { Gone: { blocks: { x: 'TYPED' } } };
    expect(unsavedFigureEdits(serverFigures(), live, null)).toEqual({});
  });

  it('drops a block the server no longer returns', () => {
    const live = { FigA: { blocks: { removed: 'TYPED' } } };
    expect(unsavedFigureEdits(serverFigures(), live, null)).toEqual({});
  });

  it('preserves a typed note', () => {
    // Same loss class as a block: the note input is rebuilt empty on every save.
    const live = { FigA: { blocks: {}, note: 'athugasemd' } };
    expect(unsavedFigureEdits(serverFigures(), live, null)).toEqual({
      FigA: { note: 'athugasemd' },
    });
  });

  it('does not preserve an untouched empty note', () => {
    const live = { FigA: { blocks: {}, note: '' } };
    expect(unsavedFigureEdits(serverFigures(), live, null)).toEqual({});
  });
});

describe('draft keys', () => {
  it('scopes a draft to book, chapter, module and tab', () => {
    const key = figDraftKey('bok', 3, 'm1', 'tab7');
    expect(key).toBe(`${FIG_DRAFT_PREFIX}bok/3/m1:tab7`);
  });

  it('makes the prefix a prefix of the key, so a sweep finds every tab', () => {
    // The two are built independently; if they drift, drafts leak forever.
    expect(figDraftKey('bok', 3, 'm1', 'tab7').startsWith(figDraftPrefix('bok', 3, 'm1'))).toBe(
      true
    );
  });

  it('does not match a different module', () => {
    expect(figDraftKey('bok', 3, 'm1', 't').startsWith(figDraftPrefix('bok', 3, 'm2'))).toBe(false);
  });
});

/**
 * 🔴 CROSS-SIDE, AND BEHAVIOURAL ON PURPOSE.
 *
 * tabGuard sweeps stale drafts by a hardcoded prefix list. A third draft
 * namespace that is not in that list is never cleaned up — the drafts live in
 * the reader's localStorage forever, and NOTHING fails. Asserting the literal
 * `'fig-draft:'` appears in tabGuard's array would be the list-vs-list shape
 * CLAUDE.md warns about: two sides derived from one token, blind to damage.
 *
 * So this runs the REAL sweep over a REAL key built from the exported constant,
 * and asserts the CONSEQUENCE — the stale key is gone. It carries its own
 * control: a fresh key of the same prefix must SURVIVE, so a sweep that simply
 * cleared everything could not pass.
 */
describe('tabGuard cleans up figure drafts', () => {
  let store;
  const savedGlobals = {};

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
      savedGlobals[name] = globalThis[name];
      globalThis[name] = value;
    }
  });

  afterEach(() => {
    for (const name of Object.keys(savedGlobals)) globalThis[name] = savedGlobals[name];
    delete require.cache[require.resolve('../public/js/tabGuard')];
  });

  it('removes a figure draft older than the retention window, and keeps a fresh one', () => {
    const EIGHT_DAYS = 8 * 24 * 60 * 60 * 1000;
    const stale = `${FIG_DRAFT_PREFIX}bok/3/m1:oldtab`;
    const fresh = `${FIG_DRAFT_PREFIX}bok/3/m1:newtab`;
    store.set(stale, JSON.stringify({ ts: Date.now() - EIGHT_DAYS, figures: {} }));
    store.set(fresh, JSON.stringify({ ts: Date.now(), figures: {} }));

    delete require.cache[require.resolve('../public/js/tabGuard')];
    require('../public/js/tabGuard'); // runs cleanupStaleDrafts() on load

    expect(store.has(stale)).toBe(false); // swept
    expect(store.has(fresh)).toBe(true); // control: the sweep is age-based, not a wipe
  });
});
