/**
 * source-cnxml.test.js — loadSourceCnxml reads a module's READ-ONLY English
 * source from books/<book>/01-source/, for source-keyed rendering (H3 item 1).
 *
 * Both renderers call it: cnxml-render's main() and the server's renderModule(),
 * which runs with cwd=server/. So it must resolve against the repo, never the cwd
 * (CLAUDE.md § "resolve resource paths against something intrinsic").
 */

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSourceCnxml } from '../lib/source-cnxml.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('loadSourceCnxml', () => {
  it("reads a module's English source from 01-source", () => {
    expect(loadSourceCnxml('efnafraedi-2e', 'ch09', 'm68759')).toContain('id="fs-idp8228960"');
  });

  it('returns null when the module has no source file', () => {
    expect(loadSourceCnxml('efnafraedi-2e', 'ch01', 'm00000')).toBeNull();
  });

  it('returns null for a module id that tries to leave the source tree', () => {
    expect(loadSourceCnxml('efnafraedi-2e', 'ch09', '../ch10/m68761')).toBeNull();
  });

  it('resolves against the repo, not the working directory', () => {
    const cwd = process.cwd();
    try {
      process.chdir(path.join(REPO_ROOT, 'server'));
      expect(loadSourceCnxml('efnafraedi-2e', 'ch09', 'm68759')).toContain('id="fs-idp8228960"');
    } finally {
      process.chdir(cwd);
    }
  });
});
