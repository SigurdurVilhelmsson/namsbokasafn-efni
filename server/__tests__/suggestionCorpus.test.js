// server/__tests__/suggestionCorpus.test.js
//
// G1.23 PR1 Task 7: the spec's acceptance checks 1-3 (§9) over the committed layer 2
// (books/efnafraedi-2e/02-mt-revised, every chapter dir, chapter metadata included). The view's code
// (suggestionLogs, suggestion-placement) runs over the real corpus and is compared with the
// independent references.json, which was produced without loading any view code.
import { describe, it, expect, beforeAll, vi } from 'vitest';
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
      'experiments/ai-review-pilot/suggestion-view-references-2026-11-24/references.json'
    ),
    'utf8'
  )
);

const logs = require('../lib/suggestionLogs');
const { visibleGroups, placeGroup } = require('../public/js/suggestion-placement');
const { loadModuleForEditing } = require('../services/segmentParser');
const servedLayer = require('../lib/servedLayer');
const SV = require('../services/suggestionView');
const Database = require('better-sqlite3');

const BOOK = 'efnafraedi-2e';
const LAYER2 = path.join(repoRoot, 'books', BOOK, '02-mt-revised');

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
  sources: new Set(),
  modules: [],
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
      state.modules.push({ book: BOOK, chapter, moduleId });
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
      state.sources.add(data.isSource);
      const dropped0 = new Set(dropped.map((r) => r.opId));
      const groupsByChain = logs.keptGroups(log);
      for (const [key, chain] of log.chains) {
        const first = chain[0];
        // a duplicated id: not checked
        if ([...log.chains.keys()].some((k) => k !== key && k.startsWith(`${first.segmentId}#`))) {
          continue;
        }
        // Since Fable serving the served text is no longer what the AI read, so the replay starts
        // from the log's own base and the served text plays no part in it.
        const base = chain[0].before;
        // the view: accept every shown group, in order
        let text = base;
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
        // first `before` (the base text the AI read; the served text is Fable's now), never from the
        // first kept record's `before`: a chain that opens with a dropped record has a later first
        // kept `before` that already holds the dropped change (R9).
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

  it('check 2: no chemistry module is eligible, and the served text is not what the AI read', () => {
    // The corpus is chemistry's, and chemistry is served from the Fable layer. Task 9's rule: a
    // Fable-served book is offered no suggestions. A closed handle makes the check pure: nothing
    // but the layer rule can answer before a table is read.
    const closed = new Database(':memory:');
    closed.close();
    expect(state.modules.length).toBe(REF.totals.logs);
    const eligible = state.modules.filter((k) => SV.isEligible(closed, k).reason !== 'fable-layer');
    expect(eligible).toEqual([]);
    // Control: were the book served from the MT layer the same call would go on to read the
    // switch, and the closed handle throws. A module let through the layer rule would fail above.
    const spy = vi.spyOn(servedLayer, 'servedLayerFor').mockReturnValue('mt-output');
    try {
      expect(() => SV.isEligible(closed, state.modules[0])).toThrow(/not open/);
    } finally {
      spy.mockRestore();
    }
    // The reason the rule exists: every module is served from the Fable layer, not the MT the AI read.
    // Asserted on the layer itself, not on how many chains' texts differ from the MT: that count is a
    // property of Fable's edits and would move if they came closer to the MT (deferred minor 4).
    expect([...state.sources]).toEqual(['fable']);
  });

  it('check 3: accepting every shown group in order reproduces the kept chain, byte for byte', () => {
    expect(state.mismatches.slice(0, 5)).toEqual([]);
    expect(state.chainsChecked).toBeGreaterThan(2000);
    expect(state.openDropped).toBeGreaterThan(0);
  });
});
