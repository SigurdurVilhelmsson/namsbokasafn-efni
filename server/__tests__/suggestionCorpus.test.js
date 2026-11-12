// server/__tests__/suggestionCorpus.test.js
//
// G1.23 PR1 Task 7: the spec's acceptance checks 1-3 (§9) over the committed layer 2
// (books/efnafraedi-2e/02-mt-revised, every chapter dir, chapter metadata included). The view's code
// (suggestionLogs, suggestion-placement) runs over the real corpus and is compared with the
// independent references.json, which was produced without loading any view code.
import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const REF = JSON.parse(
  fs.readFileSync(
    path.join(
      repoRoot,
      'experiments/ai-review-pilot/suggestion-view-references-2026-11-12/references.json'
    ),
    'utf8'
  )
);

const logs = require('../lib/suggestionLogs');
const { visibleGroups, placeGroup } = require('../public/js/suggestion-placement');
const { loadModuleForEditing } = require('../services/segmentParser');
const { sha256Text } = require('../lib/servedText');

const BOOK = 'efnafraedi-2e';
const LAYER2 = path.join(repoRoot, 'books', BOOK, '02-mt-revised');

const cmpTuple = (a, b) =>
  a.chapter - b.chapter ||
  (a.module < b.module ? -1 : a.module > b.module ? 1 : 0) ||
  (a.segmentId < b.segmentId ? -1 : a.segmentId > b.segmentId ? 1 : 0) ||
  a.occurrence - b.occurrence;

/** Plain find-once replace, written here on purpose: not the view's applyOnce. */
function replaceOnce(text, find, replace) {
  const i = text.indexOf(find);
  if (i < 0) return null;
  return text.slice(0, i) + replace + text.slice(i + find.length);
}

const state = {
  nonOk: [],
  logsRead: 0,
  viewDropped: new Set(),
  failing: [],
  mismatches: [],
  chainsChecked: 0,
  openDropped: 0,
};

beforeAll(() => {
  for (const dirName of fs.readdirSync(LAYER2).sort()) {
    const chapter =
      dirName === 'appendices' ? -1 : /^ch(\d+)$/.test(dirName) ? Number(dirName.slice(2)) : NaN;
    if (Number.isNaN(chapter)) continue;
    const files = fs
      .readdirSync(path.join(LAYER2, dirName))
      .filter((f) => f.endsWith('-changes.jsonl'))
      .sort();
    for (const f of files) {
      const moduleId = f.slice(0, -'-changes.jsonl'.length);
      const log = logs.readModuleLog({ book: BOOK, chapter, moduleId });
      if (!log.ok) {
        state.nonOk.push(`${chapter}/${moduleId}:${log.reason}`);
        continue;
      }
      state.logsRead += 1;
      const { kept, dropped } = logs.dropFilter(log);
      for (const r of dropped) {
        state.viewDropped.add(`${r.module}|${r.segmentId}|${r.occurrence}|${r.opId}`);
      }
      const keptByChain = new Map();
      for (const r of kept) {
        const k = `${r.segmentId}#${r.occurrence}`;
        if (!keptByChain.has(k)) keptByChain.set(k, []);
        keptByChain.get(k).push(r);
      }
      const data = loadModuleForEditing(BOOK, chapter, moduleId);
      // occurrence = per-id ordinal in served order (servedVersions.countOccurrences)
      const seen = new Map();
      const served = new Map(); // "id#occ" -> is
      for (const seg of data.segments) {
        const n = seen.get(seg.segmentId) || 0;
        seen.set(seg.segmentId, n + 1);
        served.set(`${seg.segmentId}#${n}`, seg.is);
      }
      const dropped0 = new Set(dropped.map((r) => r.opId));
      const groupsByChain = logs.keptGroups(log);
      for (const [key, chain] of log.chains) {
        const first = chain[0];
        const ref = {
          chapter,
          module: moduleId,
          segmentId: first.segmentId,
          occurrence: first.occurrence,
        };
        const actual = logs.firstBeforeSha256(log, first.segmentId, first.occurrence);
        const is = served.get(key);
        if (is === undefined || sha256Text(is) !== actual) {
          state.failing.push(ref);
          continue;
        }
        if (seen.get(first.segmentId) > 1) continue; // duplicated id: not checked
        // the view: accept every shown group, in order
        let text = is;
        let remaining = groupsByChain.get(key) || [];
        for (;;) {
          const v = visibleGroups(text, remaining);
          if (!v.length) break;
          const placed = placeGroup(text, v[0].group);
          if (!placed.ok) {
            state.mismatches.push({ module: moduleId, key, reason: `place:${placed.reason}` });
            break;
          }
          text = placed.result;
          remaining = remaining.filter((g) => g !== v[0].group);
        }
        // Independent replay of the KEPT records, in record order. It starts from the FULL chain's
        // first `before` (the base text the AI read, which is also the served text), never from the
        // first kept record's `before`: a chain that opens with a dropped record has a later first
        // kept `before` that already holds the dropped change (R9).
        const base = chain[0].before;
        if (base !== is) {
          state.mismatches.push({ module: moduleId, key, reason: 'base differs from served' });
        }
        const list = keptByChain.get(key) || [];
        let expected = base;
        for (const r of list) {
          const next = replaceOnce(expected, r.find, r.replace);
          if (next === null) break;
          expected = next;
        }
        if (chain[0].opId && dropped0.has(chain[0].opId)) state.openDropped += 1;
        state.chainsChecked += 1;
        if (remaining.length) {
          state.mismatches.push({
            module: moduleId,
            key,
            reason: 'group never shown',
            groups: remaining.map((g) => g.key),
          });
        } else if (text !== expected) {
          state.mismatches.push({ module: moduleId, key, reason: 'text differs', text, expected });
        }
      }
    }
  }
});

describe('G1.23 acceptance checks 1-3 over committed layer 2', () => {
  it('every log reads ok, and the number read is the reference total', () => {
    expect(state.nonOk).toEqual([]);
    expect(state.logsRead).toBe(REF.totals.logs);
  });

  it('check 1: the dropped set equals the reference, as sets, both ways', () => {
    const ref = new Set(
      REF.droppedChanges.map((d) => `${d.module}|${d.segmentId}|${d.occurrence}|${d.opId}`)
    );
    const onlyInView = [...state.viewDropped].filter((k) => !ref.has(k)).sort();
    const onlyInReference = [...ref].filter((k) => !state.viewDropped.has(k)).sort();
    expect(onlyInView).toEqual([]);
    expect(onlyInReference).toEqual([]);
    expect(state.viewDropped.size).toBeGreaterThan(0);
    expect(state.viewDropped.size).toBe(REF.droppedChanges.length);
  });

  it('check 2: the chains failing integrity are exactly the reference ids', () => {
    const key = (d) => ({
      chapter: d.chapter,
      module: d.module,
      segmentId: d.segmentId,
      occurrence: d.occurrence,
    });
    expect([...state.failing].sort(cmpTuple)).toEqual(REF.integrityFailures.map(key));
  });

  it('check 3: accepting every shown group in order reproduces the kept chain, byte for byte', () => {
    expect(state.mismatches.slice(0, 5)).toEqual([]);
    expect(state.chainsChecked).toBeGreaterThan(2000);
    expect(state.openDropped).toBeGreaterThan(0);
  });
});
