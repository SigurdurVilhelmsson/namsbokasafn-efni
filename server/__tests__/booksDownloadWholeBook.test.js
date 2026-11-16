/**
 * `GET /api/books/:bookId/download` with no `chapter` downloads the whole book.
 * It must include the appendices.
 *
 * The whole-book branch walked only directories named `chNN` (the source-side
 * convention) or `NN` (the publication convention). `appendices` has the same
 * name in both and matches neither test, so a whole-book ZIP held every chapter
 * and no appendices, for every download type. Asking for the appendices alone
 * always worked.
 *
 * The en-md case expects exactly the CURRENT appendix segment files. The
 * appendices directory also holds a legacy split part (`…-segments(b).en.md`,
 * register §C225), and the en-md download leaves those out by name since #709.
 * So the case is red on two causes: the appendices missing, or the split part
 * delivered. A control shows the directory does hold a split part.
 *
 * Reads the real `efnafraedi-2e` tree, read-only, as booksDownloadEnMd.test.js
 * does: the route's books directory is a module constant with no test redirect.
 *
 * Harness idiom: handler extracted from the router stack; `res` is a
 * PassThrough so the archive can pipe into it (cf. books-routes.test.js).
 */
import { readdirSync } from 'fs';
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
const booksRoot = path.join(__dirname, '..', '..', 'books', BOOK);

const { isSplitPart } = require('../services/splitFileUtils');
const router = require('../routes/books');
const downloadHandler = router.stack
  .find((l) => l.route && l.route.path === '/:bookId/download' && l.route.methods.get)
  .route.stack.at(-1).handle;

/**
 * Invoke the download handler and collect the piped archive.
 *
 * @param {object} query
 * @returns {Promise<Buffer>} raw ZIP bytes
 */
function downloadZip(query) {
  const res = new PassThrough();
  const chunks = [];

  res.statusCode = 200;
  res.status = function (c) {
    this.statusCode = c;
    return this;
  };
  res.headersSent = false;
  res.setHeader = function () {};
  res.on('data', (c) => chunks.push(c));

  return new Promise((resolve, reject) => {
    res.on('end', () => resolve(Buffer.concat(chunks)));
    res.json = (body) => reject(new Error(`refused: ${JSON.stringify(body)}`));
    res.on('error', reject);
    Promise.resolve(downloadHandler({ params: { bookId: BOOK }, query }, res)).catch(reject);
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

const appendixFiles = (dir, ext) =>
  readdirSync(path.join(booksRoot, dir, 'appendices')).filter((f) => f.endsWith(ext));
const inAppendices = (entries) => entries.filter((e) => e.startsWith('appendices/')).sort();

describe('the whole-book download includes the appendices', () => {
  it('delivers exactly the current appendix segment files for en-md', async () => {
    const entries = zipEntryNames(await downloadZip({ type: 'en-md' }));
    const current = appendixFiles('02-for-mt', '.md').filter((f) => !isSplitPart(f));
    expect(inAppendices(entries)).toEqual(current.map((f) => `appendices/${f}`).sort());
  }, 120000);

  it('delivers exactly the appendix pages for a publication type', async () => {
    const entries = zipEntryNames(await downloadZip({ type: 'pub-mt-preview' }));
    const expected = appendixFiles('05-publication/mt-preview/chapters', '.html');
    expect(inAppendices(entries)).toEqual(expected.map((f) => `appendices/${f}`).sort());
  }, 120000);

  it('still delivers the chapters', async () => {
    const entries = zipEntryNames(await downloadZip({ type: 'en-md' }));
    expect(entries.some((e) => e.startsWith('ch01/'))).toBe(true);
  }, 120000);
});

describe('control', () => {
  it('the book has current appendix segment files to deliver', () => {
    const current = appendixFiles('02-for-mt', '.md').filter((f) => !isSplitPart(f));
    expect(current.length).toBeGreaterThan(0);
  });

  it('the appendices directory holds a split part for en-md to leave out', () => {
    expect(appendixFiles('02-for-mt', '.md').filter(isSplitPart).length).toBeGreaterThan(0);
  });

  it('the book has appendix pages to deliver', () => {
    expect(appendixFiles('05-publication/mt-preview/chapters', '.html').length).toBeGreaterThan(0);
  });

  it('the appendices alone already downloaded', async () => {
    const entries = zipEntryNames(await downloadZip({ chapter: 'appendices', type: 'en-md' }));
    expect(inAppendices(entries).length).toBeGreaterThan(0);
  });
});
