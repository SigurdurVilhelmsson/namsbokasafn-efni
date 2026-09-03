/**
 * Figure-review HTTP surface (task 7).
 *
 * Two layers, deliberately:
 *  1. buildFigurePayload — the object shape the editor card is written against.
 *  2. the three route handlers, pulled off the router stack and invoked against a
 *     real temp DB + a mini book fixture (the idiom acceptanceRoutes.test.js uses
 *     on this same router). E2E covers the browser; these bind the decisions E2E
 *     cannot see — a figure with no sidecar, a figure with no DB row, an
 *     unregistered book, and a basename that reaches the filesystem.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Set BEFORE any service is required: resolveDbPath() reads this.
const work = mkdtempSync(path.join(tmpdir(), 'fig-routes-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const { buildFigurePayload } = require('../services/figureReviewService');

// The route wiring is exercised by E2E; this pins the PAYLOAD SHAPE the client
// depends on, which is where a silent contract break would land.
//
// ⚠️ Imported from the SERVICE, not the router. `server/routes/segment-editor.js`
// ends in `module.exports = router`, so exporting a helper from there would hang a
// property off an Express router and force this unit test to load the router's
// auth middleware and database wiring just to check an object shape.
describe('buildFigurePayload', () => {
  const fig = { effectiveState: 'mt-preview', blocks: { k: '373.15 K' }, note: null };
  it('exposes effectiveState, not the stored state', () => {
    const p = buildFigurePayload('CNX_T', { ...fig, state: 'approved' }, '');
    expect(p.effectiveState).toBe('mt-preview');
    expect(p.state).toBeUndefined();
  });
  it('carries advisory warnings alongside the blocks', () => {
    const p = buildFigurePayload('CNX_T', fig, '');
    expect(p.warnings.decimal).toHaveLength(1);
    expect(p.warnings.decimal[0].suggested).toBe('373,15 K');
  });
  it('returns an empty warning set rather than omitting the key', () => {
    const p = buildFigurePayload('CNX_T', { ...fig, blocks: { k: 'Suðumark' } }, '');
    expect(p.warnings).toEqual({ decimal: [], caption: [] });
  });
});

// =====================================================================
// Route handlers
// =====================================================================

const BOOK = 'efnafraedi-2e'; // real slug: migration 049 pre-seeds registered_books
const MODULE = 'm99001';
const TRANSLATED = 'CNX_Fig_Translated'; // has a sidecar
const PLAIN = 'CNX_Fig_Plain'; // no sidecar -> must be SKIPPED (Ruling I)
const OFF_MODULE = 'CNX_Fig_Elsewhere'; // regex-valid, not in this module

// Icelandic caption prose. 'Celsíus' here vs 'Selsíus' in the figure block is the
// near-variant captionDivergence exists to catch, so a caption warning appearing
// proves referenceText was really sourced from the module — an empty reference
// yields [] and would look identical to "no divergence".
const CAPTION_IS = 'Mynd 1. Celsíus kvarðinn og suðumark vatns.';

const EDITOR = { id: 'u-ed1', username: 'editor1', role: 'editor', books: [] };

let svc;
let segmentParser;
let realBooksDir;
let getFiguresH, postBlockH, postStateH;
let getFiguresLayer, postBlockLayer, postStateLayer;
let booksDir;

function invoke(h, req) {
  let resolveResult;
  const done = new Promise((resolve) => {
    resolveResult = resolve;
  });
  const res = {
    statusCode: 200,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(body) {
      resolveResult({ status: this.statusCode, body });
    },
  };
  return Promise.resolve(h(req, res)).then(() => done);
}

const req = (o = {}) => ({
  chapterNum: 1,
  user: EDITOR,
  body: {},
  ...o,
  params: { book: BOOK, chapter: '1', moduleId: MODULE, ...(o.params || {}) },
});

function writeSidecarFixture(blocks) {
  const dir = path.join(booksDir, BOOK, 'figure-text');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, `${TRANSLATED}.is.json`),
    JSON.stringify({ version: 1, basename: TRANSLATED, blocks }, null, 1)
  );
  // ⚠️ OFF_MODULE gets a sidecar TOO, on purpose. Without one, a request naming
  // it is refused for the wrong reason ("no translated text") and the
  // module-membership check can be deleted with every test still green —
  // measured: that mutation survived until this sidecar existed.
  writeFileSync(
    path.join(dir, `${OFF_MODULE}.is.json`),
    JSON.stringify({ version: 1, basename: OFF_MODULE, blocks: { k: 'Texti' } }, null, 1)
  );
}

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();

  svc = require('../services/figureReviewService');
  segmentParser = require('../services/segmentParser');
  realBooksDir = segmentParser.BOOKS_DIR;
  booksDir = path.join(work, 'books');

  // Structure: two figures, one nested a level down so the walk is exercised.
  mkdirSync(path.join(booksDir, BOOK, '02-structure/ch01'), { recursive: true });
  writeFileSync(
    path.join(booksDir, BOOK, '02-structure/ch01', `${MODULE}-structure.json`),
    JSON.stringify({
      moduleId: MODULE,
      content: [
        {
          type: 'figure',
          id: TRANSLATED,
          caption: { segmentId: `${MODULE}:caption:${TRANSLATED}-caption` },
          media: { id: 'fs-a', src: `../../media/${TRANSLATED}.jpg` },
        },
        {
          type: 'section',
          content: [
            {
              type: 'figure',
              id: PLAIN,
              caption: { segmentId: `${MODULE}:caption:${PLAIN}-caption` },
              media: { id: 'fs-b', src: `../../media/${PLAIN}.png` },
            },
          ],
        },
      ],
    })
  );

  const seg = (id, text) => `<!-- SEG:${MODULE}:caption:${id} -->\n${text}\n`;
  mkdirSync(path.join(booksDir, BOOK, '02-for-mt/ch01'), { recursive: true });
  mkdirSync(path.join(booksDir, BOOK, '02-mt-output/ch01'), { recursive: true });
  writeFileSync(
    path.join(booksDir, BOOK, '02-for-mt/ch01', `${MODULE}-segments.en.md`),
    seg(`${TRANSLATED}-caption`, 'Figure 1. The Celsius scale.')
  );
  writeFileSync(
    path.join(booksDir, BOOK, '02-mt-output/ch01', `${MODULE}-segments.is.md`),
    seg(`${TRANSLATED}-caption`, CAPTION_IS)
  );

  segmentParser._setTestBooksDir(booksDir);
  require('../services/segmentEditorService')._setTestBooksDir(booksDir);

  const router = require('../routes/segment-editor');
  const find = (p, method) =>
    router.stack.find((l) => l.route && l.route.path === p && l.route.methods[method]);
  getFiguresLayer = find('/:book/:chapter/:moduleId/figures', 'get');
  postBlockLayer = find('/:book/:chapter/:moduleId/figures/:basename/block', 'post');
  postStateLayer = find('/:book/:chapter/:moduleId/figures/:basename/state', 'post');
  getFiguresH = getFiguresLayer.route.stack.at(-1).handle;
  postBlockH = postBlockLayer.route.stack.at(-1).handle;
  postStateH = postStateLayer.route.stack.at(-1).handle;
});

afterAll(() => {
  segmentParser._setTestBooksDir(realBooksDir);
  require('../services/segmentEditorService')._setTestBooksDir(realBooksDir);
  rmSync(work, { recursive: true, force: true });
});

beforeEach(() => {
  const db = svc.getDb();
  db.exec('DELETE FROM figure_review; DELETE FROM figure_block_edit;');
  writeSidecarFixture({ Celsius: 'Selsíus', Boiling: 'Suðumark 373.15 K' });
});

describe('route registration', () => {
  it('all three routes are registered', () => {
    expect(getFiguresLayer).toBeTruthy();
    expect(postBlockLayer).toBeTruthy();
    expect(postStateLayer).toBeTruthy();
  });

  it('every route carries validateModule — moduleId reaches path.join too', () => {
    const { validateModule } = require('../middleware/validateParams');
    for (const layer of [getFiguresLayer, postBlockLayer, postStateLayer]) {
      expect(layer.route.stack.map((l) => l.handle)).toContain(validateModule);
    }
  });

  // Invoke the gate at its known index rather than sweeping the chain:
  // validateBookChapter calls next() on a valid book and would never resolve.
  it("the read route's requireRole gate FIRES: viewer -> 403", async () => {
    expect(getFiguresLayer.route.stack).toHaveLength(5);
    const out = await invoke(getFiguresLayer.route.stack[1].handle, {
      params: { book: BOOK, chapter: '1', moduleId: MODULE },
      user: { id: 'v1', username: 'v', role: 'viewer' },
    });
    expect(out.status).toBe(403);
  });

  it("both write routes' requireBookAccess gate FIRES: viewer -> 403", async () => {
    for (const layer of [postBlockLayer, postStateLayer]) {
      expect(layer.route.stack).toHaveLength(5);
      const out = await invoke(layer.route.stack[2].handle, {
        params: { book: BOOK, chapter: '1', moduleId: MODULE },
        user: { id: 'v1', username: 'v', role: 'viewer' },
      });
      expect(out.status).toBe(403);
    }
  });

  it('the state enums the route validates match the live CHECK constraint', () => {
    // Two enumerations of one truth: the migration's CHECK and the route's 400
    // guard. Anchored on the DB schema rather than on a second list in prose, so
    // adding a state to the migration and not to the route goes red.
    const sql = svc
      .getDb()
      .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='figure_review'`)
      .get().sql;
    const listIn = (col) =>
      sql
        .match(new RegExp(`${col}\\s+IN\\s*\\(([^)]*)\\)`))[1]
        .split(',')
        .map((x) => x.trim().replace(/^'|'$/g, ''));
    expect(svc.FIGURE_STATES).toEqual(listIn('state'));
    expect(svc.FIGURE_FLAG_KINDS).toEqual(listIn('flag_kind'));
  });
});

describe('GET /figures', () => {
  it('lists the figure that has a sidecar and SKIPS the one that does not', async () => {
    const out = await invoke(getFiguresH, req());
    expect(out.status).toBe(200);
    // Non-empty is the positive control: a harness that listed nothing at all
    // would otherwise pass the "skips PLAIN" half trivially.
    expect(out.body.figures.map((f) => f.basename)).toEqual([TRANSLATED]);
  });

  it('a figure with NO figure_review row reports mt-preview, not null', async () => {
    const db = svc.getDb();
    expect(
      db.prepare('SELECT COUNT(*) c FROM figure_review').get().c // precondition: no row
    ).toBe(0);
    const out = await invoke(getFiguresH, req());
    expect(out.body.figures[0].effectiveState).toBe('mt-preview');
    expect(out.body.figures[0].blocks.Celsius).toBe('Selsíus');
  });

  it("sources captionDivergence's reference from the module's own Icelandic caption", async () => {
    const out = await invoke(getFiguresH, req());
    const w = out.body.figures[0].warnings;
    expect(w.caption.map((c) => c.figureText)).toEqual(['Selsíus']);
    expect(w.caption[0].note).toContain('Celsíus');
    expect(w.decimal.map((d) => d.suggested)).toEqual(['Suðumark 373,15 K']);
  });

  it('an unregistered book is a clean 404, not a 500', async () => {
    // ⚠️ NOT a real slug: migration 049 registers all six, so any of them would
    // pass the lookup and this would assert nothing. book_id is a live foreign
    // key, so an unregistered slug reaching a write would THROW — hence 404.
    const out = await invoke(getFiguresH, req({ params: { book: 'engin-bok' } }));
    expect(out.status).toBe(404);
    expect(out.body.error).toContain('not registered');
  });

  it('a module with no structure file yields an empty list, not an error', async () => {
    const out = await invoke(getFiguresH, req({ params: { moduleId: 'm99999' } }));
    expect(out.status).toBe(200);
    expect(out.body.figures).toEqual([]);
  });
});

describe('POST /figures/:basename/block', () => {
  it('rejects a traversing basename before any filesystem access', async () => {
    const out = await invoke(
      postBlockH,
      req({
        params: { basename: '../../../etc/passwd' },
        body: { blockKey: 'Celsius', isText: 'x' },
      })
    );
    expect(out.status).toBe(400);
    // The REASON matters: every later guard also refuses this name, so a bare
    // status check cannot tell the syntactic guard from an incidental miss.
    expect(out.body.error).toContain('Invalid figure basename');
    expect(svc.getDb().prepare('SELECT COUNT(*) c FROM figure_block_edit').get().c).toBe(0);
  });

  it('rejects a translated figure that belongs to no figure in THIS module', async () => {
    // OFF_MODULE has a sidecar, so this can only be refused by the
    // module-membership check.
    const out = await invoke(
      postBlockH,
      req({ params: { basename: OFF_MODULE }, body: { blockKey: 'k', isText: 'x' } })
    );
    expect(out.status).toBe(404);
    expect(out.body.error).toContain(`No such figure in ${MODULE}`);
    expect(svc.getDb().prepare('SELECT COUNT(*) c FROM figure_block_edit').get().c).toBe(0);
  });

  it('saves an edit that then overlays the MT text on the next GET', async () => {
    const out = await invoke(
      postBlockH,
      req({ params: { basename: TRANSLATED }, body: { blockKey: 'Celsius', isText: 'Celsíus' } })
    );
    expect(out.body).toEqual({ ok: true });
    const after = await invoke(getFiguresH, req());
    expect(after.body.figures[0].blocks.Celsius).toBe('Celsíus');
  });

  it('requires a blockKey', async () => {
    const out = await invoke(
      postBlockH,
      req({ params: { basename: TRANSLATED }, body: { isText: 'x' } })
    );
    expect(out.status).toBe(400);
  });
});

describe('POST /figures/:basename/state', () => {
  it('approves a figure that has no figure_review row yet', async () => {
    // Day one: the row does not exist, and setState() is an UPDATE. Without the
    // route minting the row first this returns mt-preview and writes nothing.
    const out = await invoke(
      postStateH,
      req({ params: { basename: TRANSLATED }, body: { state: 'approved' } })
    );
    expect(out.status).toBe(200);
    expect(out.body).toEqual({ ok: true, effectiveState: 'approved' });
    expect(svc.getDb().prepare('SELECT COUNT(*) c FROM figure_review').get().c).toBe(1);
  });

  it('writes the committed sidecar so the renderer sees the approval', async () => {
    await invoke(
      postStateH,
      req({ params: { basename: TRANSLATED }, body: { state: 'approved' } })
    );
    const p = path.join(booksDir, BOOK, 'figure-text', `${TRANSLATED}.is.json`);
    expect(existsSync(p)).toBe(true);
    expect(JSON.parse(readFileSync(p, 'utf-8')).state).toBe('approved');
  });

  it('records the module the figure was reviewed under', async () => {
    await invoke(
      postStateH,
      req({ params: { basename: TRANSLATED }, body: { state: 'approved' } })
    );
    const row = svc.getDb().prepare('SELECT chapter, module_id FROM figure_review').get();
    expect(row).toEqual({ chapter: 1, module_id: MODULE });
  });

  it('an edit AFTER approval sends the figure back to mt-preview', async () => {
    await invoke(
      postStateH,
      req({ params: { basename: TRANSLATED }, body: { state: 'approved' } })
    );
    await invoke(
      postBlockH,
      req({ params: { basename: TRANSLATED }, body: { blockKey: 'Celsius', isText: 'Celsíus' } })
    );
    const after = await invoke(getFiguresH, req());
    expect(after.body.figures[0].effectiveState).toBe('mt-preview');
  });

  it('rejects a state the CHECK constraint would reject, as a 400 not a 500', async () => {
    const out = await invoke(
      postStateH,
      req({ params: { basename: TRANSLATED }, body: { state: 'ship-it' } })
    );
    expect(out.status).toBe(400);
  });

  it('rejects an unknown flagKind as a 400', async () => {
    const out = await invoke(
      postStateH,
      req({ params: { basename: TRANSLATED }, body: { state: 'flagged', flagKind: 'vibes' } })
    );
    expect(out.status).toBe(400);
  });

  it('refuses to approve a translated figure from another module', async () => {
    // The harm this prevents: a figure_review row carrying THIS route's
    // chapter/module_id for a figure that lives somewhere else.
    const out = await invoke(
      postStateH,
      req({ params: { basename: OFF_MODULE }, body: { state: 'approved' } })
    );
    expect(out.status).toBe(404);
    expect(out.body.error).toContain(`No such figure in ${MODULE}`);
    expect(svc.getDb().prepare('SELECT COUNT(*) c FROM figure_review').get().c).toBe(0);
  });

  it('a figure with no sidecar cannot be approved', async () => {
    const out = await invoke(
      postStateH,
      req({ params: { basename: PLAIN }, body: { state: 'approved' } })
    );
    expect(out.status).toBe(404);
  });
});
