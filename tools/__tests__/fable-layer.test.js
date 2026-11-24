import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { parseLayerFile, FABLE_SCHEMA } from '../lib/mt-layers.js';
import { feLayerText } from '../../experiments/fable-editor-trial/compare.mjs';
import { buildFableUnit } from '../lib/fable-layer.js';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

const TEXT_A =
  '<!-- SEG:m100:para:p1 -->\nAlfa eitt.\n\n<!-- SEG:m100:para:p2 -->\nBeta tvö.\n\n' +
  '<!-- SEG:m100:para:p1 -->\nAlfa eitt.\n';
const TEXT_B = '<!-- SEG:m200:para:q1 -->\nGamma.\n\n<!-- SEG:m200:para:q2 -->\nDelta.\n';

function makeUnit(stem, text, edits, statuses) {
  const parsed = parseLayerFile(text);
  const feBodies = new Map();
  const rows = parsed.records.map((r) => {
    const edited = edits[r.key];
    const status = statuses[r.key] ?? 'unchanged';
    if (status === 'edited') feBodies.set(r.key, edited);
    return {
      stem,
      key: r.key,
      segmentId: r.segmentId,
      en: 'en',
      mt: r.body,
      tp: r.body,
      fe: status === 'edited' ? edited : r.body,
      hu: null,
      status,
      tags:
        status === 'edited' ? (r.key === 'm100:para:p2' ? ['meaning', 'style'] : ['style']) : [],
      proposed: edited ?? null,
      markerProblem: status === 'refused-markers' ? 'lost marker' : null,
      requestKey: `ch01/${stem}/001`,
    };
  });
  return { unit: { stem, base: { parsed } }, rows, feBodies };
}

const A = makeUnit(
  'm100',
  TEXT_A,
  {
    'm100:para:p1#1': 'Alfa eitt, lagað.',
    'm100:para:p2': 'Beta tvö, lagað.',
    'm100:para:p1': 'X [[i:y]]',
  },
  { 'm100:para:p1#1': 'edited', 'm100:para:p2': 'edited', 'm100:para:p1': 'refused-markers' }
);
const B = makeUnit('m200', TEXT_B, {}, {});

const runs = [
  { runId: 'r1', used: true, requestKeys: ['ch01/m100/001', 'ch01/m200/001'] },
  { runId: 'r0', used: false, reason: 'older', requestKeys: ['ch01/m100/001'] },
];
const runMeta = {
  model: 'fable-x',
  effort: 'high',
  max_tokens: 1000,
  prompts: [{ path: 'p.md', sha256: 'a'.repeat(64) }],
  anthropicVersion: '2023-06-01',
  harnessCommit: 'abc123',
  rulingSet: { path: 'r.json', sha256: 'b'.repeat(64) },
};
const base = {
  layer1Sha256: 'c'.repeat(64),
  layer1Commit: 'def456',
  overlaySha256: null,
  enSha256: 'd'.repeat(64),
};

const args = (u, selectedKeys = []) => ({
  chapterDir: 'ch01',
  unit: u.unit,
  rows: u.rows,
  feBodies: u.feBodies,
  runs,
  runMeta,
  selectedKeys,
  base,
  writtenBy: 'test',
});
const build = (u, selectedKeys = []) => buildFableUnit(args(u, selectedKeys));

const lineObjs = (o) => o.tagsJsonl.trim().split('\n').map(JSON.parse);

describe('buildFableUnit', () => {
  it('serves the feLayerText bytes', () => {
    expect(build(A).segmentsText).toBe(feLayerText(A.unit.base.parsed, A.feBodies));
  });
  it('gives a refused-markers row no tags line', () => {
    expect(lineObjs(build(A)).map((l) => l.key)).toEqual(['m100:para:p2', 'm100:para:p1#1']);
  });
  it('serves a refused-markers row its base text', () => {
    expect(build(A).segmentsText).toContain('<!-- SEG:m100:para:p1 -->\nAlfa eitt.\n');
  });
  it('writes the before text of an edited row as row.mt', () => {
    expect(lineObjs(build(A))[0].before).toBe('Beta tvö.');
  });
  it('hashes before and after of an edited row', () => {
    const l = lineObjs(build(A))[0];
    expect([l.beforeSha256, l.afterSha256]).toEqual([sha('Beta tvö.'), sha('Beta tvö, lagað.')]);
  });
  it('carries the tags as given', () => {
    expect(lineObjs(build(A))[0].tags).toEqual(['meaning', 'style']);
  });
  it('orders the tags line fields', () => {
    expect(Object.keys(lineObjs(build(A))[0])).toEqual([
      'key',
      'segmentId',
      'occurrence',
      'tags',
      'before',
      'beforeSha256',
      'afterSha256',
      'run',
      'requestKey',
      'rerequested',
    ]);
  });
  it('numbers occurrences from 0', () => {
    expect(lineObjs(build(A)).map((l) => l.occurrence)).toEqual([0, 1]);
  });
  it('names the used run holding the request', () => {
    expect(lineObjs(build(A))[0].run).toBe('r1');
  });
  it('marks rerequested exactly for selected keys', () => {
    expect(lineObjs(build(A, ['m100:para:p2'])).map((l) => l.rerequested)).toEqual([true, false]);
  });
  it('lists rerequested segment ids in provenance', () => {
    expect(build(A, ['m100:para:p2']).provenance.rerequested).toEqual(['m100:para:p2']);
  });
  it('counts segments, changes, meaning and refusals', () => {
    expect(build(A).provenance.counts).toEqual({
      segments: 3,
      changed: 2,
      meaning: 1,
      refusedMarkers: 1,
    });
  });
  it('hashes the returned strings', () => {
    const o = build(A);
    expect(o.provenance.files).toEqual({
      segmentsSha256: sha(o.segmentsText),
      tagsSha256: sha(o.tagsJsonl),
    });
  });
  it('is deterministic', () => {
    expect(build(A, ['m100:para:p2'])).toEqual(build(A, ['m100:para:p2']));
  });
  it('gives an unedited unit an empty tags file', () => {
    expect(build(B).tagsJsonl).toBe('');
  });
  it('lists an unedited selected segment in provenance.rerequested', () => {
    const o = build(A, ['m100:para:p1']);
    expect(o.provenance.rerequested).toEqual(['m100:para:p1']);
  });
  it('lists selected segment ids in document order, once each', () => {
    const o = build(A, ['m100:para:p2', 'm100:para:p1#1', 'm100:para:p1']);
    expect(o.provenance.rerequested).toEqual(['m100:para:p1', 'm100:para:p2']);
  });
  it('refuses a selected key that is not in the unit', () => {
    expect(() => build(A, ['m100:para:zzz'])).toThrow(/m100:para:zzz/);
  });
  it('refuses an edited row whose key is not in the unit', () => {
    const rows = [...A.rows, { ...A.rows[1], key: 'm100:para:stale' }];
    expect(() => buildFableUnit({ ...args(A), rows })).toThrow(/m100:para:stale/);
  });
  it('refuses an edited row with no requestKey', () => {
    const rows = A.rows.map((r) =>
      r.key === 'm100:para:p2' ? { ...r, requestKey: undefined } : r
    );
    expect(() => buildFableUnit({ ...args(A), rows })).toThrow(/requestKey/);
  });
  it('refuses an edited row whose request no used run holds', () => {
    const rows = A.rows.map((r) =>
      r.key === 'm100:para:p2' ? { ...r, requestKey: 'ch01/m100/099' } : r
    );
    expect(() => buildFableUnit({ ...args(A), rows })).toThrow(/ch01\/m100\/099/);
  });
  for (const field of ['model', 'effort', 'max_tokens', 'harnessCommit', 'anthropicVersion']) {
    it(`refuses runMeta without ${field}`, () => {
      const m = { ...runMeta, [field]: undefined };
      expect(() => buildFableUnit({ ...args(A), runMeta: m })).toThrow(new RegExp(field));
    });
  }
  it('refuses runMeta without a prompt', () => {
    const m = { ...runMeta, prompts: [] };
    expect(() => buildFableUnit({ ...args(A), runMeta: m })).toThrow(/prompt/);
  });
  it('refuses runMeta with more than one prompt', () => {
    const m = {
      ...runMeta,
      prompts: [...runMeta.prompts, { path: 'q.md', sha256: 'b'.repeat(64) }],
    };
    expect(() => buildFableUnit({ ...args(A), runMeta: m })).toThrow(/exactly one prompt/);
  });
  it('refuses runMeta without rulingSet', () => {
    const m = { ...runMeta, rulingSet: undefined };
    expect(() => buildFableUnit({ ...args(A), runMeta: m })).toThrow(/rulingSet/);
  });
  it('stamps format, module and base', () => {
    const p = build(B).provenance;
    expect([p.format, p.module, p.base]).toEqual([FABLE_SCHEMA, 'm200', base]);
  });
});
