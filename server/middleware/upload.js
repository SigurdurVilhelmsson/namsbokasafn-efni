/**
 * multer, with the file-size limit carried on the error it raises.
 *
 * multer reports an over-size file as a MulterError carrying a code and a field name, never the
 * limit it enforced, so the app's error handler (middleware/errorHandler.js) cannot say what the
 * limit was. Each upload route has its own: chapter import in books.js takes 10 MB, term import
 * in terminology.js 5 MB. Until 2026-10-24 the handler named "10MB" for both.
 *
 * createUpload() sets multer's limit and the error's from one value, so they cannot drift apart.
 * It refuses to build an upload without a limit: multer's default is no limit at all.
 */

const multer = require('multer');

/** An object literal or Object.create(null): nothing else spreads to exactly what it holds. */
function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * @param {object} options multer's options, plus `fileSize`: the largest file accepted, in bytes.
 *   Do not also pass `limits.fileSize`; `fileSize` is its one source. Any other `limits` must be a
 *   plain object.
 * @returns {{ single(field: string): Function, array(field: string, maxCount: number): Function }}
 */
function createUpload({ fileSize, ...options }) {
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0) {
    throw new TypeError(`createUpload: fileSize must be a positive whole number of bytes`);
  }
  // multer also takes `limits` as a function of the request. Spread below, a function, a Map or
  // any object that keeps its values off its own enumerable keys would add nothing and slip past
  // the fileSize check, so only a plain object (or none) is accepted.
  if (options.limits !== undefined && !isPlainObject(options.limits)) {
    throw new TypeError('createUpload: limits, when given, must be a plain object');
  }
  if (options.limits && 'fileSize' in options.limits) {
    throw new TypeError('createUpload: pass fileSize once, not also as limits.fileSize');
  }
  const upload = multer({ ...options, limits: { ...options.limits, fileSize } });

  const carryLimit = (middleware) =>
    function uploadWithLimit(req, res, next) {
      middleware(req, res, (err) => {
        if (err && err.code === 'LIMIT_FILE_SIZE') err.limitBytes = fileSize;
        next(err);
      });
    };

  return {
    single: (field) => carryLimit(upload.single(field)),
    array: (field, maxCount) => carryLimit(upload.array(field, maxCount)),
  };
}

module.exports = { createUpload };
