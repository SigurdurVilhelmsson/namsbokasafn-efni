/**
 * Register §C141 ①: `GET /api/books/:bookId/download?type=en-md` must deliver
 * the English segment files.
 *
 * The route sampled the first `.md` file and refused with 409 when it held the
 * `<!-- SEG:` marker and not the `{{SEG:` one, saying the files were "not
 * protected for machine translation" and that a protect step would run by
 * itself. The only tool that wrote `{{SEG:` is archived, so every segment file
 * is in the `<!-- SEG:` form and the download could only fail. The books page
 * reaches it from its "download EN markdown" button.
 *
 * The first block was red before the fix. The second block is the control: it
 * shows the fixture's current segment files are in the form the guard refused
 * (so the red cases were red for that cause), and that a download type the guard
 * never covered behaves the same before and after.
 *
 * The fixture chapter used to hold legacy split parts, named
 * `…-segments(b).en.md`, left by the archived protect step (register §C225).
 * For a while the route left them out of the en-md download by name (#709).
 * The 49 files were removed from the tree on 2026-11-17 and the filter went
 * with them; one block below pins that the route no longer carries it.
 *
 * The last block runs the books page's own `downloadBookMarkdown`, taken from
 * `views/books.html` as text (cf. booksActivityRefusal.test.js). Its confirm
 * dialog said the download came "without running the protect step" and pointed
 * to a "↓ Sækja EN" button that the page does not have.
 *
 * Reads the real `efnafraedi-2e` tree, read-only, as books-routes.test.js does:
 * the route's books directory is a module constant with no test redirect.
 *
 * Harness idiom: handler extracted from the router stack; `res` is a
 * PassThrough so the archive can pipe into it (cf. books-routes.test.js).
 */
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PassThrough } from 'stream';
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

// auth.js throws at load time if JWT_SECRET is unset.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BOOK = 'efnafraedi-2e';
const CHAPTER_DIR = 'ch01';
const chapterPath = path.join(__dirname, '..', '..', 'books', BOOK, '02-for-mt', CHAPTER_DIR);

const router = require('../routes/books');
const downloadHandler = router.stack
  .find((l) => l.route && l.route.path === '/:bookId/download' && l.route.methods.get)
  .route.stack.at(-1).handle;

/**
 * Invoke the download handler. Settles when the handler answers with JSON (a
 * refusal) or when the piped archive ends (a download).
 *
 * @param {object} query
 * @returns {Promise<{status:number, headers:object, body:object|null, zip:Buffer|null}>}
 */
function download(query) {
  const res = new PassThrough();
  const chunks = [];
  const headers = {};

  res.statusCode = 200;
  res.status = function (c) {
    this.statusCode = c;
    return this;
  };
  res.headersSent = false;
  res.setHeader = function (name, value) {
    headers[name] = value;
  };
  res.on('data', (c) => chunks.push(c));

  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    res.on('end', () =>
      settle({ status: res.statusCode, headers, body: null, zip: Buffer.concat(chunks) })
    );
    res.json = function (body) {
      res.headersSent = true;
      settle({ status: res.statusCode, headers, body, zip: null });
    };
    res.on('error', (err) => {
      if (!settled) reject(err);
    });
    Promise.resolve(downloadHandler({ params: { bookId: BOOK }, query }, res)).catch((err) => {
      if (!settled) reject(err);
    });
  });
}

/**
 * Entry names from a ZIP's central directory, without a zip dependency (the
 * same reader as books-routes.test.js).
 *
 * @param {Buffer} buf raw ZIP bytes
 * @returns {string[]} archive-relative entry names
 */
function zipEntryNames(buf) {
  const EOCD_SIG = 0x06054b50;
  const CD_SIG = 0x02014b50;
  if (!buf || buf.length < 22) throw new Error(`not a ZIP: ${buf ? buf.length : 0} bytes`);

  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error('not a ZIP: no End Of Central Directory record');

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const names = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== CD_SIG) throw new Error(`corrupt central directory at ${p}`);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    names.push(buf.subarray(p + 46, p + 46 + nameLen).toString('utf-8'));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

const mdFiles = readdirSync(chapterPath).filter((f) => f.endsWith('.md'));

describe('the en-md download delivers the segment files (§C141 ①)', () => {
  it('answers 200 for a chapter', async () => {
    expect((await download({ chapter: '1', type: 'en-md' })).status).toBe(200);
  });

  it('answers with no refusal body for a chapter', async () => {
    expect((await download({ chapter: '1', type: 'en-md' })).body).toBeNull();
  });

  it('names the ZIP after the book, the chapter and the type', async () => {
    const r = await download({ chapter: '1', type: 'en-md' });
    expect(r.headers['Content-Disposition']).toContain(`${BOOK}-K1-en-md.zip`);
  });

  it('answers 200 for the appendices', async () => {
    expect((await download({ chapter: 'appendices', type: 'en-md' })).status).toBe(200);
  });

  it('answers 200 for the default type, which is en-md', async () => {
    expect((await download({ chapter: '1' })).status).toBe(200);
  });
});

// The route used to skip legacy split parts (`…-segments(b).en.md`) by name for
// en-md (#709, register §C225). Those 49 files were removed from the tree on
// 2026-11-17, which left the filter with nothing to act on, so it was removed
// too. `tools/__tests__/no-split-parts-in-for-mt.test.js` pins that none is in
// the tree. The first case was red while the filter was in the route.
describe('the route carries no split-part filter (§C225)', () => {
  const routeSource = readFileSync(path.join(__dirname, '..', 'routes', 'books.js'), 'utf-8');

  it('does not use isSplitPart', () => {
    expect(routeSource).not.toContain('isSplitPart');
  });

  it('writes one archive entry per .md file in the chapter directory', async () => {
    const r = await download({ chapter: '1', type: 'en-md' });
    expect(zipEntryNames(r.zip).sort()).toEqual(mdFiles.map((f) => `${CHAPTER_DIR}/${f}`).sort());
  });
});

describe('control', () => {
  it('the fixture chapter has segment files', () => {
    expect(mdFiles.length).toBeGreaterThan(0);
  });

  it('every current segment file is in the form the guard refused: <!-- SEG: and no {{SEG:', () => {
    const current = mdFiles.filter((f) => !/\([a-z]\)\.en\.md$/.test(f));
    const forms = current.map((f) => {
      const text = readFileSync(path.join(chapterPath, f), 'utf-8');
      return { comment: /<!--\s*SEG:/.test(text), mustache: /\{\{SEG:/.test(text) };
    });
    expect(forms.every((x) => x.comment && !x.mustache)).toBe(true);
  });

  it('a type the guard never covered still downloads', async () => {
    expect((await download({ chapter: '1', type: 'pub-mt-preview' })).status).toBe(200);
  });

  it('an unknown type is still refused', async () => {
    expect((await download({ chapter: '1', type: 'nonsense' })).status).toBe(400);
  });
});

describe("the books page's dialog before the en-md download", () => {
  const html = readFileSync(path.join(__dirname, '..', 'views', 'books.html'), 'utf-8');
  const fnSource = html.match(/function downloadBookMarkdown\(slug\) \{[\s\S]*?\n {6}\}\n/)[0];

  /**
   * Run the page's function with a stubbed `confirm` and `window`.
   *
   * @param {boolean} answer what the reader answers in the dialog
   * @returns {{message: string, href: string|null}}
   */
  function run(answer) {
    const seen = { message: null };
    const win = { location: { href: null } };
    const confirmStub = (message) => {
      seen.message = message;
      return answer;
    };
    const fn = new Function('confirm', 'window', `${fnSource}; return downloadBookMarkdown;`)(
      confirmStub,
      win
    );
    fn(BOOK);
    return { message: seen.message, href: win.location.href };
  }

  it('does not mention a protect step', () => {
    expect(run(true).message).not.toMatch(/vernd/i);
  });

  it('does not point to a "Sækja EN" button', () => {
    expect(run(true).message).not.toContain('Sækja EN');
  });

  it('says what is downloaded: the whole book as one ZIP file', () => {
    expect(run(true).message).toContain('í einni ZIP-skrá');
  });

  it('control: still asks before downloading', () => {
    expect(run(true).message).toContain('Halda áfram?');
  });

  it('control: goes to the en-md download when the reader agrees', () => {
    expect(run(true).href).toBe(`/api/books/${BOOK}/download?type=en-md`);
  });

  it('control: goes nowhere when the reader cancels', () => {
    expect(run(false).href).toBeNull();
  });
});
