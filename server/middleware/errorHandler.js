/**
 * The app's last error handler: every error a route or middleware passes to next() ends here.
 *
 * It lived inline in index.js until 2026-10-24, when it moved here unchanged so a test can mount
 * the real one: index.js starts the server when it is required, so nothing can import it. The
 * test is __tests__/multerUploadRoutes.test.js, which needs this handler because a MulterError
 * carries a `code` and no `status`: without the two branches below, Express would answer every
 * over-size or unexpected-field upload with 500. __tests__/errorHandler.test.js calls it
 * directly, and __tests__/startup.test.js checks that index.js still mounts it, last.
 *
 * The 413 names the limit of the route that refused: middleware/upload.js carries it on the
 * error as `limitBytes`. An error without one gets no number rather than a guessed one. A multer
 * fileFilter refusal reaches the generic branch below; each route's filter gives its Error
 * `status: 400`, so the client gets a 400 carrying the filter's message rather than a generic 500.
 */

const log = require('../lib/logger');

const KB = 1024;
const MB = 1024 * KB;

/**
 * A byte count written exactly, never rounded: in MB when it is a whole or one-decimal number of
 * MB, else in KB when it is a whole number of KB, else in bytes. A rounded figure could name a
 * limit above the real one, and then a file under the stated limit would be refused.
 */
function exactSize(bytes) {
  // A one-decimal number of MB is a multiple of half an MB (10 = 2 x 5, and 5 shares no factor
  // with 2^20). The tests are integer remainders, exact for every safe integer; a float test
  // such as Number.isInteger((bytes / MB) * 10) misreads some counts above 2^51.
  if (bytes % (MB / 2) === 0) return `${bytes / MB} MB`;
  if (bytes % KB === 0) return `${bytes / KB} KB`;
  return `${bytes} bytes`;
}

/** "Uploaded file exceeds the size limit (5 MB)", or no number when the error carries none. */
function fileTooLargeMessage(limitBytes) {
  if (!Number.isSafeInteger(limitBytes) || limitBytes <= 0) {
    return 'Uploaded file exceeds the size limit';
  }
  return `Uploaded file exceeds the size limit (${exactSize(limitBytes)})`;
}

// Error handler (next is required by Express error handler signature)
function errorHandler(err, req, res, _next) {
  log.error({ err, method: req.method, path: req.path }, 'Unhandled request error');

  // Handle multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: 'File Too Large',
      message: fileTooLargeMessage(err.limitBytes),
    });
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      error: 'Invalid Upload',
      message: 'Unexpected field in upload',
    });
  }

  const statusCode = err.status || 500;
  // Only expose error details for client errors (4xx), never for server errors (5xx)
  const isClientError = statusCode >= 400 && statusCode < 500;
  res.status(statusCode).json({
    error: isClientError ? err.name || 'Error' : 'Internal Server Error',
    message: isClientError ? err.message || 'An error occurred' : 'An unexpected error occurred',
  });
}

module.exports = { errorHandler };
