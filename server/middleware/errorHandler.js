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
 * Two known gaps were kept as they were, because the move changes no behaviour: the 413 message
 * names 10MB for every route, though terminology's upload limit is 5 MB; and a multer fileFilter
 * refusal is a plain Error with no status, so it reaches the client as a generic 500.
 */

const log = require('../lib/logger');

// Error handler (next is required by Express error handler signature)
function errorHandler(err, req, res, _next) {
  log.error({ err, method: req.method, path: req.path }, 'Unhandled request error');

  // Handle multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: 'File Too Large',
      message: 'Uploaded file exceeds size limit (10MB)',
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
