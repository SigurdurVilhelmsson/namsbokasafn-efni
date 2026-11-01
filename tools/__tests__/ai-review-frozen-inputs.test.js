/**
 * The AI term pass's frozen inputs (docs/decisions/2026-11-01-ai-term-pass-prompt-freeze.md).
 *
 * The full run sends exactly this prompt and this ruling set. The runner's preflight requires both
 * to be tracked and clean but accepts any content, so this test is what makes an edit to either
 * one fail. To change either before the full run, write a new decision record that unfreezes it,
 * then update the pins here. The run's other parameters are pinned where they are defined:
 * model, effort and max tokens in ai-review-term-pass.test.js, segments and characters per request
 * in ai-review-term-pass-request.test.js.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PROMPT_PATH, loadPrompt } from '../ai-review/term-pass-request.js';
import { DEFAULT_RULING_SET } from '../ai-review/term-pass.js';
import { loadRulingSet } from '../ai-review/ruling-set.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RECORD = 'docs/decisions/2026-11-01-ai-term-pass-prompt-freeze.md';
const PLAN_SUMMARY = 'experiments/ai-review-pilot/prompt-freeze-2026-11-01/plan-summary.json';
const FROZEN = Object.freeze({
  prompt: {
    path: 'tools/ai-review/prompts/term-pass-v2.md',
    sha256: '7f9b1b3518bb6454d799a03d3a53b490376f37d2e25a6c4a89e42f6c299e559b',
  },
  rulingSet: {
    path: 'experiments/terminology-consistency/results/2026-11-02/ruling-set-2026-11-02.json',
    sha256: '0aa33690ca829be4baa4da2b34fbea1455517d426e939c3544b3a86b3049c3bd',
  },
});

const fileSha = (rel) =>
  crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(REPO, rel)))
    .digest('hex');
const unfreeze = (what) =>
  `${what} changed after the freeze: write a record that unfreezes it (see ${RECORD}), then update this pin`;

describe('the frozen prompt', () => {
  it('is the prompt the runner reads', () => {
    expect(PROMPT_PATH, unfreeze('the prompt path')).toBe(FROZEN.prompt.path);
  });

  it('has the frozen bytes', () => {
    expect(fileSha(FROZEN.prompt.path), unfreeze('the prompt')).toBe(FROZEN.prompt.sha256);
  });

  it('is what a run records: loadPrompt hashes the same bytes', () => {
    expect(loadPrompt(path.join(REPO, FROZEN.prompt.path)).sha256).toBe(FROZEN.prompt.sha256);
  });
});

describe('the frozen ruling set', () => {
  it('is the set the runner reads by default', () => {
    expect(DEFAULT_RULING_SET, unfreeze('the default ruling set')).toBe(FROZEN.rulingSet.path);
  });

  it('has the frozen bytes', () => {
    expect(fileSha(FROZEN.rulingSet.path), unfreeze('the ruling set')).toBe(
      FROZEN.rulingSet.sha256
    );
  });

  it('is what a run records: loadRulingSet hashes the same bytes', () => {
    expect(loadRulingSet(path.join(REPO, FROZEN.rulingSet.path)).sha256).toBe(
      FROZEN.rulingSet.sha256
    );
  });
});

describe('the freeze evidence', () => {
  it('the record exists', () => {
    expect(fs.existsSync(path.join(REPO, RECORD))).toBe(true);
  });

  it('the committed plan summary read exactly the frozen inputs', () => {
    const s = JSON.parse(fs.readFileSync(path.join(REPO, PLAN_SUMMARY), 'utf8'));
    expect([s.prompt, s.rulingSet]).toEqual([FROZEN.prompt, FROZEN.rulingSet]);
    const digests = s.chapters.flatMap((c) => c.requests);
    expect(digests.length).toBe(s.totals.requests);
  });
});
