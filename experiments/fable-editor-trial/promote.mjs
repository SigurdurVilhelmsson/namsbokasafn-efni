#!/usr/bin/env node
/**
 * promote.mjs — copy a finished trial run from its records directory (outside the repository)
 * into `experiments/fable-editor-trial/runs/<runId>/`, with the run's ledger lines, so the
 * evidence is committed and citable (CLAUDE.md § Purpose). 0 ISK; writes nothing under books/.
 *
 *   node experiments/fable-editor-trial/promote.mjs --run <runId> --records <dir>
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { RECORD_FILES, runDirFor } from '../../tools/ai-review/records.js';
import { REPO_ROOT, TRIAL_DIR, TRIAL_RECORD } from './lib.mjs';
import { readJsonl } from './records-io.mjs';

const RUN_ID_RE = /^\d{8}T\d{6}Z-[0-9a-f]{8}$/;
const FILES = [...Object.values(RECORD_FILES), TRIAL_RECORD];

export function promote({
  runId,
  recordsDir,
  destRoot = path.join(REPO_ROOT, TRIAL_DIR, 'runs'),
  env = process.env,
}) {
  if (!RUN_ID_RE.test(runId ?? '')) throw new Error(`promote: not a run id: ${runId}`);
  if (!recordsDir || !path.isAbsolute(recordsDir))
    throw new Error('promote: --records must be absolute');
  const src = runDirFor(recordsDir, runId);
  if (!fs.existsSync(path.join(src, RECORD_FILES.runEnd))) {
    throw new Error(
      `promote: ${src} has no ${RECORD_FILES.runEnd}; the run has not ended (resume it first)`
    );
  }
  if (!fs.existsSync(path.join(src, TRIAL_RECORD))) {
    throw new Error(`promote: ${src} has no ${TRIAL_RECORD}; not a Fable trial run`);
  }
  const key = typeof env.ANTHROPIC_API_KEY === 'string' ? env.ANTHROPIC_API_KEY.trim() : '';
  const dest = path.join(destRoot, runId);
  fs.mkdirSync(dest, { recursive: true });
  const copied = [];
  for (const name of FILES) {
    const from = path.join(src, name);
    if (!fs.existsSync(from)) continue;
    const bytes = fs.readFileSync(from);
    if (key.length >= 8 && bytes.includes(key))
      throw new Error(`promote: ${name} holds the API key; refusing`);
    const to = path.join(dest, name);
    if (fs.existsSync(to) && !fs.readFileSync(to).equals(bytes)) {
      throw new Error(`promote: ${to} exists with different content; refusing to overwrite`);
    }
    fs.writeFileSync(to, bytes);
    copied.push(name);
  }
  const ledger = path.join(recordsDir, 'ledger.jsonl');
  if (fs.existsSync(ledger)) {
    const lines = readJsonl(ledger).filter((e) => e.runId === runId);
    fs.writeFileSync(
      path.join(dest, 'ledger.jsonl'),
      lines.map((e) => JSON.stringify(e)).join('\n') + '\n'
    );
    copied.push('ledger.jsonl');
  }
  return { dest, copied };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  process.exitCode = 1;
  try {
    const { values } = parseArgs({
      args: process.argv.slice(2),
      strict: true,
      options: { run: { type: 'string' }, records: { type: 'string' } },
    });
    const { dest, copied } = promote({ runId: values.run, recordsDir: values.records });
    process.stdout.write(
      `copied ${copied.join(', ')} to ${path.relative(REPO_ROOT, dest)}\n` +
        `next: node ${TRIAL_DIR}/compare.mjs report --run ${values.run}\n`
    );
    process.exitCode = 0;
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
  }
}
