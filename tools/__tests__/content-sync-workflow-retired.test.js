/**
 * No GitHub workflow syncs content to the reader.
 *
 * WHY THIS EXISTS: [USER] retired `.github/workflows/sync-content.yml` on 2026-11-08
 * (docs/decisions/2026-11-08-editing-gates-and-housekeeping-answers.md, answer 8; register §C11 ①).
 * It never succeeded once, because the repository has no `VEFUR_DEPLOY_TOKEN` secret, and armed it
 * would have run a bare all-books sync on every push touching `05-publication/`. CLAUDE.md
 * § Content delivery says not to re-create it; this test makes that checkable.
 *
 * It looks for what such a workflow needs, not for its old file name: the vefur sync script, or the
 * token it would check vefur out with. The control is that the directory holds workflows at all, so
 * a moved or renamed directory cannot pass by being empty.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORKFLOW_DIR = path.join(REPO_ROOT, '.github', 'workflows');

const workflows = fs
  .readdirSync(WORKFLOW_DIR)
  .filter((f) => /\.ya?ml$/.test(f))
  .map((f) => ({ file: f, text: fs.readFileSync(path.join(WORKFLOW_DIR, f), 'utf8') }));

describe('the content-sync workflow stays retired', () => {
  it('control: the workflow directory holds the gating workflows', () => {
    expect(workflows.map((w) => w.file)).toEqual(expect.arrayContaining(['lint.yml', 'test.yml']));
  });

  it('no workflow runs the vefur sync script', () => {
    expect(workflows.filter((w) => /sync-content\.js/.test(w.text)).map((w) => w.file)).toEqual([]);
  });

  it('no workflow reads a vefur deploy token', () => {
    expect(workflows.filter((w) => /VEFUR_DEPLOY_TOKEN/.test(w.text)).map((w) => w.file)).toEqual(
      []
    );
  });
});
