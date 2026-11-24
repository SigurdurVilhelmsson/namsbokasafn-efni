#!/usr/bin/env node
/**
 * promote-fable-layer.js — write `books/efnafraedi-2e/02-mt-fable/` from the committed Fable
 * editor trial runs. The layer is exactly the runs' output: this tool never edits text, and it
 * refuses to overwrite a file whose bytes differ. Spec:
 * docs/superpowers/specs/2026-11-24-fable-layer-serving-design.md §6.2.
 *
 *   node tools/promote-fable-layer.js [--chapter chNN]... [--dry-run]
 *
 * Which run supplies each chapter (and any module that was re-sent) is the chooser table
 * `experiments/fable-editor-trial/layer-sources.json`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { buildRows } from '../experiments/fable-editor-trial/compare.mjs';
import { REPO_ROOT, TRIAL_DIR, BOOK_DIR } from '../experiments/fable-editor-trial/lib.mjs';
import { LAYER_DIRS, resolveSafeDestination, readSelectedKeys } from './lib/mt-layers.js';
import { buildFableUnit, serializeProvenance } from './lib/fable-layer.js';

const SOURCES_FILE = path.join(REPO_ROOT, TRIAL_DIR, 'layer-sources.json');
const SOURCES_FORMAT = 'fable-layer-sources/1';
const WRITER = 'tools/promote-fable-layer.js';

const fail = (msg) => {
  throw new Error(`promote-fable-layer: ${msg}`);
};

/** @returns {{format: string, chapters: Record<string,string>, modules: Record<string,{run: string, reason: string}>}} */
export function readSources(file = SOURCES_FILE) {
  const s = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (s.format !== SOURCES_FORMAT) fail(`${file}: format is not ${SOURCES_FORMAT}`);
  return s;
}

const gitHead = () =>
  execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();

/** Load one run through buildRows and refuse anything that is not a complete run of the chapter. */
function loadRun({ trialRoot, runId, bookDir, chapterDir, cache }) {
  const hit = cache.get(runId);
  if (hit) return hit;
  const built = buildRows({ trialRoot, runId, bookDir });
  if (built.chapterDir !== chapterDir) {
    fail(`run ${runId} is for ${built.chapterDir}, not ${chapterDir}`);
  }
  if (built.runEnd?.status !== 'complete') {
    fail(`run ${runId} did not complete (status ${built.runEnd?.status ?? 'missing'})`);
  }
  cache.set(runId, built);
  return built;
}

const requestKeysFor = (trial, stem) =>
  trial.requests.filter((r) => r.stem === stem).map((r) => r.key);

function planUnit({ built, stem, chapterDir, runs, bookDir, writtenBy, runId }) {
  const entry = built.units.find((u) => u.unit.stem === stem);
  if (!entry) fail(`${chapterDir}/${stem}: not in run ${runId}`);
  const rows = built.rows
    .filter((r) => r.stem === stem)
    .map((r) => {
      const req = built.trial.requests.find((q) => q.stem === stem && q.keys.includes(r.key));
      return { ...r, requestKey: req?.key };
    });
  const unanswered = rows.filter((r) => r.status === 'unanswered');
  if (unanswered.length) {
    fail(`${chapterDir}/${stem}: ${unanswered.length} segment(s) unanswered in run ${runId}`);
  }
  const pin = built.trial.units.find((u) => u.stem === stem);
  const runMeta = {
    model: built.run.model,
    effort: built.run.effort,
    max_tokens: built.run.max_tokens,
    prompts: built.run.prompts,
    anthropicVersion: built.run.anthropicVersion,
    harnessCommit: built.run.harnessCommit,
    rulingSet: built.run.rulingSet ?? built.trial.rulingSet,
  };
  return buildFableUnit({
    chapterDir,
    unit: entry.unit,
    rows,
    feBodies: entry.feBodies,
    runs,
    runMeta,
    selectedKeys: readSelectedKeys({ bookDir, chapterDir, stem }),
    base: {
      layer1Sha256: pin.layer1Sha256,
      overlaySha256: pin.overlaySha256,
      enSha256: pin.enSha256,
      layer1Commit: built.trial.layer1Commit,
    },
    writtenBy,
  });
}

/**
 * Build (and, unless `dryRun`, write) the Fable layer.
 *
 * @param {{chapters?: string[], dryRun?: boolean, bookDir?: string, trialRoot?: string,
 *   sources?: object, writtenBy?: {tool: string, commit: string}}} [opts]
 * @returns {{written: string[], unchanged: string[], counts: Record<string, object>}}
 */
export function promoteFableLayer({
  chapters,
  dryRun = false,
  bookDir = BOOK_DIR,
  trialRoot = path.join(REPO_ROOT, TRIAL_DIR),
  sources = readSources(),
  writtenBy,
} = {}) {
  const wanted = chapters?.length ? chapters : Object.keys(sources.chapters);
  for (const c of wanted) if (!sources.chapters[c]) fail(`${c}: no run in the chooser table`);
  const by = writtenBy ?? { tool: WRITER, commit: gitHead() };
  const cache = new Map();
  const files = [];
  const counts = {};

  for (const chapterDir of wanted) {
    const runId = sources.chapters[chapterDir];
    const built = loadRun({ trialRoot, runId, bookDir, chapterDir, cache });
    const c = (counts[chapterDir] = { units: 0, segments: 0, changed: 0, meaning: 0 });
    for (const { unit } of built.units) {
      const stem = unit.stem;
      const override = sources.modules?.[`${chapterDir}/${stem}`];
      let src = built;
      let useId = runId;
      let runs = [{ runId, used: true, requestKeys: requestKeysFor(built.trial, stem) }];
      if (override) {
        src = loadRun({ trialRoot, runId: override.run, bookDir, chapterDir, cache });
        useId = override.run;
        runs = [
          {
            runId,
            used: false,
            reason: override.reason,
            requestKeys: requestKeysFor(built.trial, stem),
          },
          { runId: useId, used: true, requestKeys: requestKeysFor(src.trial, stem) },
        ];
      }
      const out = planUnit({
        built: src,
        stem,
        chapterDir,
        runs,
        bookDir,
        writtenBy: by,
        runId: useId,
      });
      const feFile = path.join(trialRoot, 'results', useId, 'fe-layer', `${stem}-segments.is.md`);
      if (!fs.existsSync(feFile) || fs.readFileSync(feFile, 'utf8') !== out.segmentsText) {
        fail(`${chapterDir}/${stem}: rebuilt text differs from ${feFile}`);
      }
      const dir = path.join(bookDir, LAYER_DIRS.fable, chapterDir);
      const add = (suffix, content) =>
        files.push({
          path: resolveSafeDestination({
            bookDir,
            chapterDir,
            filePath: path.join(dir, `${stem}-${suffix}`),
          }),
          content,
        });
      add('segments.is.md', out.segmentsText);
      add('fable.json', serializeProvenance(out.provenance));
      add('tags.jsonl', out.tagsJsonl);
      c.units += 1;
      c.segments += out.provenance.counts.segments;
      c.changed += out.provenance.counts.changed;
      c.meaning += out.provenance.counts.meaning;
    }
  }

  // Check every target before writing any: one refusal leaves the tree untouched.
  const written = [];
  const unchanged = [];
  for (const f of files) {
    if (fs.existsSync(f.path)) {
      if (fs.readFileSync(f.path, 'utf8') !== f.content) {
        fail(`${f.path} exists with different bytes; the layer is never overwritten`);
      }
      unchanged.push(f.path);
    } else written.push(f.path);
  }
  if (!dryRun) {
    const todo = new Set(written);
    for (const f of files) {
      if (!todo.has(f.path)) continue;
      fs.mkdirSync(path.dirname(f.path), { recursive: true });
      fs.writeFileSync(f.path, f.content, { flag: 'wx' });
    }
  }
  return { written, unchanged, counts };
}

function main(argv) {
  process.exitCode = 1;
  try {
    const { values } = parseArgs({
      args: argv,
      options: {
        chapter: { type: 'string', multiple: true },
        'dry-run': { type: 'boolean', default: false },
      },
      strict: true,
    });
    const res = promoteFableLayer({ chapters: values.chapter, dryRun: values['dry-run'] });
    for (const [ch, c] of Object.entries(res.counts)) {
      console.log(
        `${ch}: ${c.units} units, ${c.segments} segments, ${c.changed} changed, ${c.meaning} meaning`
      );
    }
    console.log(
      `${values['dry-run'] ? 'would write' : 'wrote'} ${res.written.length} file(s); ${res.unchanged.length} unchanged`
    );
    process.exitCode = 0;
  } catch (err) {
    console.error(err.message);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
