/**
 * middleware/upload.js: multer, with the file-size limit carried on the error it raises.
 *
 * Its routes are exercised over a real socket in multerUploadRoutes.test.js, where each 413 names
 * its route's limit. What that file cannot show is the refusal to build an upload with no limit:
 * multer's default is no limit at all, so a missing or mistyped fileSize must stop the server at
 * require time instead of serving an unlimited upload route.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createUpload } = require('../middleware/upload');
const multer = require('multer');

describe('createUpload', () => {
  for (const [label, fileSize] of [
    ['missing', undefined],
    ['zero', 0],
    ['negative', -1],
    ['fractional', 1.5],
    ['a string', '5mb'],
    ['infinite', Infinity],
  ]) {
    it(`refuses a fileSize that is ${label}`, () => {
      expect(() => createUpload({ storage: multer.memoryStorage(), fileSize })).toThrow(/fileSize/);
    });
  }

  it('builds single() and array() middleware for a positive whole number of bytes (the control)', () => {
    const upload = createUpload({ storage: multer.memoryStorage(), fileSize: 1024 });
    expect([typeof upload.single('file'), typeof upload.array('files', 2)]).toEqual([
      'function',
      'function',
    ]);
  });

  // multer takes a function here too; createUpload would spread it to nothing.
  for (const [label, limits] of [
    ['a function', () => ({ fileSize: 9 })],
    ['null', null],
    ['an array', []],
    ['a Map', new Map([['fileSize', 9]])],
    ['a class instance', new (class Limits {})()],
  ]) {
    it(`refuses limits that are ${label}`, () => {
      expect(() =>
        createUpload({ storage: multer.memoryStorage(), fileSize: 1024, limits })
      ).toThrow(/limits/);
    });
  }

  it('accepts other limits as a plain object (the control)', () => {
    expect(() =>
      createUpload({ storage: multer.memoryStorage(), fileSize: 1024, limits: { files: 1 } })
    ).not.toThrow();
  });

  it('refuses a limits.fileSize beside its own, so the limit has one source', () => {
    expect(() =>
      createUpload({ storage: multer.memoryStorage(), fileSize: 1024, limits: { fileSize: 9 } })
    ).toThrow(/fileSize/);
  });
});
