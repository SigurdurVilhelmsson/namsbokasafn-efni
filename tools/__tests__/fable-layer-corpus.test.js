import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { parseLayerFile, readBase, LAYER_DIRS, FABLE_SCHEMA } from '../lib/mt-layers.js';

const require = createRequire(import.meta.url);
const { listStudyUnits } = require('../../server/lib/studyUnits.js');

const REPO = path.resolve(import.meta.dirname, '..', '..');
const BOOKS_DIR = path.join(REPO, 'books');
const BOOK_DIR = path.join(BOOKS_DIR, 'efnafraedi-2e');
const LAYER = path.join(BOOK_DIR, LAYER_DIRS.fable);
const TRIAL = path.join(REPO, 'experiments', 'fable-editor-trial');

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

/** Every unit of the committed layer, with the paths of its three files. */
function readLayer() {
  const units = [];
  if (!fs.existsSync(LAYER)) return units;
  for (const chapterDir of fs.readdirSync(LAYER)) {
    const names = fs.readdirSync(path.join(LAYER, chapterDir));
    const stems = names
      .filter((n) => n.endsWith('-fable.json'))
      .map((n) => n.slice(0, -'-fable.json'.length))
      .sort();
    for (const stem of stems) {
      const p = (suffix) => path.join(LAYER, chapterDir, `${stem}-${suffix}`);
      units.push({
        chapterDir,
        stem,
        unit: `${chapterDir}/${stem}`,
        segmentsFile: p('segments.is.md'),
        provenanceFile: p('fable.json'),
        tagsFile: p('tags.jsonl'),
      });
    }
  }
  return units;
}

const layer = readLayer();
const readTags = (u) =>
  fs
    .readFileSync(u.tagsFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
const baseBodies = (u) =>
  new Map(
    readBase({ bookDir: BOOK_DIR, chapterDir: u.chapterDir, stem: u.stem }).parsed.records.map(
      (r) => [r.key, r.body]
    )
  );

describe('the committed 02-mt-fable layer', () => {
  it('has exactly the study units', () => {
    const expected = listStudyUnits({ book: 'efnafraedi-2e', booksDir: BOOKS_DIR })
      .map((u) => u.unit)
      .sort();
    expect(layer.map((u) => u.unit).sort()).toEqual(expected);
  });

  it('has the three files for every unit', () => {
    const missing = layer.flatMap((u) =>
      [u.segmentsFile, u.provenanceFile, u.tagsFile].filter((f) => !fs.existsSync(f))
    );
    expect(layer.length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  it('has provenance whose file hashes match the files on disk', () => {
    const bad = layer.filter((u) => {
      const prov = readJson(u.provenanceFile);
      return (
        prov.files.segmentsSha256 !== sha256(fs.readFileSync(u.segmentsFile)) ||
        prov.files.tagsSha256 !== sha256(fs.readFileSync(u.tagsFile))
      );
    });
    expect(bad.map((u) => u.unit)).toEqual([]);
  });

  it('has provenance in the mt-fable/1 format', () => {
    const bad = layer.filter((u) => readJson(u.provenanceFile).format !== FABLE_SCHEMA);
    expect(bad.map((u) => u.unit)).toEqual([]);
    expect(FABLE_SCHEMA).toBe('mt-fable/1');
  });

  it('has no tags line without a run and a requestKey', () => {
    const bad = layer.flatMap((u) =>
      readTags(u)
        .filter((t) => !t.run || !t.requestKey)
        .map((t) => `${u.unit} ${t.key}`)
    );
    expect(bad).toEqual([]);
  });

  it('serves the base text for every segment with no tags line', () => {
    const offenders = [];
    for (const u of layer) {
      const tagged = new Set(readTags(u).map((t) => t.key));
      const fable = parseLayerFile(fs.readFileSync(u.segmentsFile, 'utf8'));
      const bodies = baseBodies(u);
      expect(fable.records.map((r) => r.key)).toEqual([...bodies.keys()]);
      for (const r of fable.records) {
        if (!tagged.has(r.key) && r.body !== bodies.get(r.key))
          offenders.push(`${u.unit} ${r.key}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('has tags lines whose beforeSha256 is the base body hash at their occurrence', () => {
    const offenders = [];
    let checked = 0;
    for (const u of layer) {
      const bodies = baseBodies(u);
      for (const t of readTags(u)) {
        checked += 1;
        const body = bodies.get(t.key);
        if (body === undefined || t.beforeSha256 !== sha256(body))
          offenders.push(`${u.unit} ${t.key}`);
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it('records as re-requested exactly the ids the selected overlays hold', () => {
    const expected = [];
    for (const [ch, stem] of [
      ['ch08', 'm68744'],
      ['ch21', 'm68852'],
      ['ch21', 'm68856'],
    ]) {
      const overlay = readJson(
        path.join(BOOK_DIR, LAYER_DIRS.selected, ch, `${stem}-selected.json`)
      );
      expected.push(...overlay.entries.map((e) => e.segmentId));
    }
    const actual = layer.flatMap((u) => readJson(u.provenanceFile).rerequested);
    expect(expected).toHaveLength(8);
    expect(actual.sort()).toEqual([...new Set(expected)].sort());
  });

  it('counts as refused exactly what the chosen runs report as refused-markers', () => {
    const sources = readJson(path.join(TRIAL, 'layer-sources.json'));
    const chosen = new Set([
      ...Object.values(sources.chapters),
      ...Object.values(sources.modules ?? {}).map((m) => m.run),
    ]);
    const fromRuns = [...chosen].reduce(
      (sum, runId) =>
        sum +
        (readJson(path.join(TRIAL, 'results', runId, 'metrics.json')).status['refused-markers'] ??
          0),
      0
    );
    const fromLayer = layer.reduce(
      (sum, u) => sum + readJson(u.provenanceFile).counts.refusedMarkers,
      0
    );
    expect(fromLayer).toBe(fromRuns);
  });

  it("serves, at every tags line, a body whose hash is the line's afterSha256", () => {
    const offenders = [];
    let checked = 0;
    for (const u of layer) {
      const served = new Map(
        parseLayerFile(fs.readFileSync(u.segmentsFile, 'utf8')).records.map((r) => [r.key, r.body])
      );
      for (const t of readTags(u)) {
        checked += 1;
        const body = served.get(t.key);
        if (body === undefined || sha256(body) !== t.afterSha256)
          offenders.push(`${u.unit} ${t.key}`);
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it('has no tags line whose before and after hashes are equal', () => {
    let checked = 0;
    const offenders = [];
    for (const u of layer) {
      for (const t of readTags(u)) {
        checked += 1;
        if (t.beforeSha256 === t.afterSha256) offenders.push(`${u.unit} ${t.key}`);
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it("serves each unit's text byte-identical to the used run's committed fe-layer file", () => {
    const offenders = [];
    let checked = 0;
    for (const u of layer) {
      const used = readJson(u.provenanceFile).runs.find((r) => r.used);
      const fe = path.join(TRIAL, 'results', used.runId, 'fe-layer', `${u.stem}-segments.is.md`);
      checked += 1;
      if (!fs.existsSync(fe) || !fs.readFileSync(u.segmentsFile).equals(fs.readFileSync(fe)))
        offenders.push(u.unit);
    }
    expect(checked).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
