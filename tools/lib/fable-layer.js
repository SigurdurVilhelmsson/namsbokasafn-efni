/**
 * fable-layer.js — build one unit's three `02-mt-fable` files from a trial run's answers.
 *
 * Pure: no file is read or written. The caller (the writer CLI) reads the runs, passes the
 * values in, and writes the returned strings. Spec:
 * docs/superpowers/specs/2026-11-24-fable-layer-serving-design.md §6.1.
 */
import crypto from 'node:crypto';
import { FABLE_SCHEMA } from './mt-layers.js';
import { feLayerText } from '../../experiments/fable-editor-trial/compare.mjs';

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

/**
 * @param {object} p
 * @param {string} p.chapterDir  e.g. `ch01`
 * @param {string} [p.book]  book slug (default `efnafraedi-2e`)
 * @param {{stem: string, base: {parsed: object}}} p.unit  a `readPinnedInputs` unit
 * @param {Array<object>} p.rows  the unit's `buildRows` rows; a row may carry the
 *   `requestKey` of the request that sent it (the caller attaches it)
 * @param {Map<string,string>} p.feBodies  occurrence key → Fable's accepted text
 * @param {Array<{runId: string, used: boolean, reason?: string, requestKeys: string[]}>} p.runs
 * @param {object} p.runMeta  the used run's `run.json` fields plus the trial's `rulingSet`
 * @param {Iterable<string>} p.selectedKeys  occurrence keys re-requested for this unit
 * @param {{layer1Sha256: string, layer1Commit: string, overlaySha256: string|null,
 *   enSha256: string}} p.base  the pinned base, from the term-pass run record
 * @param {string} p.writtenBy
 * @returns {{segmentsText: string, tagsJsonl: string, provenance: object}}
 */
export function buildFableUnit({
  chapterDir,
  book = 'efnafraedi-2e',
  unit,
  rows,
  feBodies,
  runs,
  runMeta,
  selectedKeys,
  base,
  writtenBy,
}) {
  const parsed = unit.base.parsed;
  const occurrenceOf = new Map(parsed.records.map((r) => [r.key, r.occurrence]));
  const selected = new Set(selectedKeys);
  for (const k of selected) {
    if (!occurrenceOf.has(k)) {
      throw new Error(`fable-layer: ${unit.stem}: selected key ${k} is not in the unit`);
    }
  }
  for (const f of ['model', 'effort', 'max_tokens', 'harnessCommit', 'anthropicVersion']) {
    if (runMeta[f] === undefined || runMeta[f] === null || runMeta[f] === '') {
      throw new Error(`fable-layer: runMeta.${f} is missing`);
    }
  }
  const prompt = runMeta.prompts?.[0];
  if (!prompt?.path || !prompt?.sha256) {
    throw new Error('fable-layer: runMeta.prompts[0] (path, sha256) is missing');
  }
  if (!runMeta.rulingSet) throw new Error('fable-layer: runMeta.rulingSet is missing');
  const runOfRequest = (row) => {
    if (!row.requestKey) {
      throw new Error(`fable-layer: edited row ${row.key} has no requestKey`);
    }
    const run = runs.find((r) => r.used && r.requestKeys.includes(row.requestKey));
    if (!run) {
      throw new Error(
        `fable-layer: edited row ${row.key}: no used run holds request ${row.requestKey}`
      );
    }
    return run.runId;
  };

  const segmentsText = feLayerText(parsed, feBodies);

  const lines = rows
    .filter((row) => row.status === 'edited')
    .map((row) => {
      if (!occurrenceOf.has(row.key)) {
        throw new Error(`fable-layer: ${unit.stem}: edited row key ${row.key} is not in the unit`);
      }
      return row;
    })
    .map((row) => ({
      key: row.key,
      segmentId: row.segmentId,
      occurrence: occurrenceOf.get(row.key),
      tags: row.tags,
      before: row.mt,
      beforeSha256: sha256(row.mt),
      afterSha256: sha256(row.fe),
      run: runOfRequest(row),
      requestKey: row.requestKey,
      rerequested: selected.has(row.key),
    }));
  const tagsJsonl = lines.map((l) => JSON.stringify(l)).join('\n') + (lines.length ? '\n' : '');

  const provenance = {
    format: FABLE_SCHEMA,
    book,
    chapter: chapterDir,
    module: unit.stem,
    runs,
    model: runMeta.model,
    effort: runMeta.effort,
    max_tokens: runMeta.max_tokens,
    prompt: { path: prompt.path, sha256: prompt.sha256 },
    rulingSet: runMeta.rulingSet,
    harnessCommit: runMeta.harnessCommit,
    anthropicVersion: runMeta.anthropicVersion,
    base: {
      layer1Sha256: base.layer1Sha256,
      layer1Commit: base.layer1Commit,
      overlaySha256: base.overlaySha256,
      enSha256: base.enSha256,
    },
    rerequested: [
      ...new Set(parsed.records.filter((r) => selected.has(r.key)).map((r) => r.segmentId)),
    ],
    counts: {
      segments: parsed.records.length,
      changed: lines.length,
      meaning: lines.filter((l) => l.tags.includes('meaning')).length,
      refusedMarkers: rows.filter((r) => r.status === 'refused-markers').length,
    },
    files: { segmentsSha256: sha256(segmentsText), tagsSha256: sha256(tagsJsonl) },
    writtenBy,
  };
  return { segmentsText, tagsJsonl, provenance };
}

/** Serialise provenance as the layer file holds it. */
export const serializeProvenance = (provenance) => JSON.stringify(provenance, null, 2) + '\n';
