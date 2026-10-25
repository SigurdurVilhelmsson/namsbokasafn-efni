/**
 * The app's last error handler (middleware/errorHandler.js), called directly.
 *
 * Its generic branch has a security job: an error with no status, or a 5xx, must not show its
 * message to the client, because that message can be internal text (an SQLite error, a file
 * path). A 4xx passes its name and message through on purpose; that case is the control, so a
 * handler that hid everything could not pass. The two multer branches are checked with multer's
 * own MulterError here, and over a real socket in multerUploadRoutes.test.js.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { errorHandler } = require('../middleware/errorHandler');
const { MulterError } = require('multer');

const SECRET = 'SQLITE_CONSTRAINT at /srv/app/pipeline-output/sessions.db';

/** Run the handler on `err` and return what it sent. */
function handle(err) {
  const sent = {};
  const res = {
    status(code) {
      sent.status = code;
      return this;
    },
    json(body) {
      sent.body = body;
      return this;
    },
  };
  errorHandler(err, { method: 'POST', path: '/api/probe' }, res, () => {
    sent.calledNext = true;
  });
  return sent;
}

describe('errorHandler', () => {
  it('is an Express error handler: four parameters', () => {
    expect(errorHandler.length).toBe(4);
  });

  it('answers an error with no status with a 500 that hides its message', () => {
    expect(handle(new Error(SECRET))).toEqual({
      status: 500,
      body: { error: 'Internal Server Error', message: 'An unexpected error occurred' },
    });
  });

  it('hides the message of a 5xx that carries its own status', () => {
    const err = Object.assign(new Error(SECRET), { status: 503 });
    expect(JSON.stringify(handle(err))).not.toContain('SQLITE');
  });

  it('passes a 4xx through with its name and message (the control)', () => {
    const err = Object.assign(new Error('Ógild bók'), { status: 404, name: 'NotFoundError' });
    expect(handle(err)).toEqual({
      status: 404,
      body: { error: 'NotFoundError', message: 'Ógild bók' },
    });
  });

  it("answers multer's LIMIT_FILE_SIZE with 413, naming the limit the error carries", () => {
    // middleware/upload.js stamps each route's own limit on the error.
    const err = Object.assign(new MulterError('LIMIT_FILE_SIZE', 'file'), {
      limitBytes: 5 * 1024 * 1024,
    });
    expect(handle(err)).toEqual({
      status: 413,
      body: { error: 'File Too Large', message: 'Uploaded file exceeds the size limit (5 MB)' },
    });
  });

  // Each limit is written exactly; none is rounded, so none can read as larger than it is.
  for (const [limitBytes, shown] of [
    [10 * 1024 * 1024, '10 MB'],
    [1.5 * 1024 * 1024, '1.5 MB'],
    [2.75 * 1024 * 1024, '2816 KB'], // not "2.8 MB", which is above the limit
    [100 * 1024, '100 KB'],
    [1_500_000, '1500000 bytes'], // not "1.4 MB", nor a whole number of KB
    // A float test of "one decimal of MB" reads this as 2147483648.3 MB; it is not.
    [2 ** 51 + 314573, '2251799813999821 bytes'],
  ]) {
    it(`writes a limit of ${limitBytes} bytes as "${shown}"`, () => {
      const err = Object.assign(new MulterError('LIMIT_FILE_SIZE', 'file'), { limitBytes });
      expect(handle(err).body.message).toBe(`Uploaded file exceeds the size limit (${shown})`);
    });
  }

  it('names no number when the error carries no limit, rather than guess one', () => {
    expect(handle(new MulterError('LIMIT_FILE_SIZE', 'file'))).toEqual({
      status: 413,
      body: { error: 'File Too Large', message: 'Uploaded file exceeds the size limit' },
    });
  });

  it("answers multer's LIMIT_UNEXPECTED_FILE with 400", () => {
    expect(handle(new MulterError('LIMIT_UNEXPECTED_FILE', 'files'))).toEqual({
      status: 400,
      body: { error: 'Invalid Upload', message: 'Unexpected field in upload' },
    });
  });

  it('ends the request itself: it never passes the error on', () => {
    expect(handle(new Error(SECRET)).calledNext).toBeUndefined();
  });
});
