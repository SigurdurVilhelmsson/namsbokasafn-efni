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

  it("answers multer's LIMIT_FILE_SIZE with 413", () => {
    // The message is not pinned: it says 10MB on every route, a known gap (terminology's
    // limit is 5 MB), and fixing it must not turn this test red.
    const { status, body } = handle(new MulterError('LIMIT_FILE_SIZE', 'file'));
    expect([status, body.error]).toEqual([413, 'File Too Large']);
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
