/**
 * Tests for tmService — debounced, fire-and-forget TMX regeneration.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const tmService = require('../services/tmService');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

describe('tmService', () => {
  afterEach(() => {
    tmService._setRunner(); // restore default spawn runner
  });

  describe('regenerateTm', () => {
    it('returns the exit code on success', async () => {
      tmService._setRunner(() => Promise.resolve({ code: 0, stderr: '' }));
      await expect(tmService.regenerateTm('bookX')).resolves.toBe(0);
    });

    it('returns the non-zero exit code without throwing', async () => {
      tmService._setRunner(() => Promise.resolve({ code: 1, stderr: 'no faithful content' }));
      await expect(tmService.regenerateTm('bookX')).resolves.toBe(1);
    });

    it('returns null (never throws) when the runner fails to spawn', async () => {
      tmService._setRunner(() => Promise.reject(new Error('spawn ENOENT')));
      await expect(tmService.regenerateTm('bookX')).resolves.toBeNull();
    });
  });

  describe('scheduleTmRegen', () => {
    let calls;

    beforeEach(() => {
      calls = [];
      tmService._setRunner((book) => {
        calls.push(book);
        return Promise.resolve({ code: 0, stderr: '' });
      });
    });

    it('debounces rapid calls for the same book into one run', async () => {
      tmService.scheduleTmRegen('bookA', { delay: 20 });
      tmService.scheduleTmRegen('bookA', { delay: 20 });
      tmService.scheduleTmRegen('bookA', { delay: 20 });
      expect(tmService._pendingBooks()).toEqual(['bookA']);
      await wait(60);
      expect(calls).toEqual(['bookA']);
      expect(tmService._pendingBooks()).toEqual([]);
    });

    it('regenerates each book independently', async () => {
      tmService.scheduleTmRegen('bookA', { delay: 20 });
      tmService.scheduleTmRegen('bookB', { delay: 20 });
      await wait(60);
      expect(calls.sort()).toEqual(['bookA', 'bookB']);
    });
  });
});
