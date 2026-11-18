/**
 * Merging recorded pre-screen runs into one verdict per population row, and the committed
 * verdicts file and report (c19; spec §8). Pure: synthetic records, no I/O.
 */
import { describe, it, expect } from 'vitest';
import {
  VERDICTS_SCHEMA,
  checkRuns,
  mergeVerdicts,
  resendIds,
  buildVerdicts,
  assertPublishable,
  stopReasons,
  renderReport,
} from '../ai-review/prescreen-collect.js';

const item = (id, kind, extra = {}) => ({
  id,
  english: `en-${id}`,
  icelandic: `is-${id}`,
  kind,
  ...extra,
  sentences: [`The en-${id} sentence.`],
});
const ITEMS = [
  item('r001', 'population'),
  item('r002', 'control', { name: 'balanced', expected: 'flag' }),
  item('r003', 'population'),
  item('r004', 'physicsBiology'),
  item('r005', 'control', { name: 'atom', expected: 'fine' }),
];
const prescreen = (runId, over = {}) => ({
  schema: 'c19-prescreen/1',
  runId,
  phase: 'full',
  model: 'claude-fable-5-2',
  effort: 'high',
  maxTokens: 16000,
  excluded: { ruled: 1, fallback: 2 },
  census: { path: 'experiments/c.json', sha256: 'c'.repeat(64) },
  rulingSet: { path: 'experiments/r.json', sha256: 'e'.repeat(64) },
  prompt: { path: 'tools/ai-review/prompts/p.md', sha256: 'a'.repeat(64) },
  includePhysicsBiology: true,
  items: ITEMS,
  requests: [
    { key: 'g001', ids: ['r001', 'r002', 'r003'] },
    { key: 'g002', ids: ['r004', 'r005'] },
  ],
  ...over,
});
const run = (runId, over) => ({ runId, prescreen: prescreen(runId, over) });
const fine = {
  verdict: 'fine',
  kind: null,
  reason: 'Right sense.',
  proposed: [],
  rightSenses: null,
};
const flag = {
  verdict: 'flag',
  kind: 'wrong-sense',
  reason: 'Another sense.',
  proposed: ['annað'],
  rightSenses: null,
};
const read = (runId, entries) => ({ runId, verdicts: new Map(entries) });

describe('checkRuns', () => {
  it('returns the shared model, prompt, census and items of consistent runs', () => {
    const base = checkRuns([run('A'), run('B', { requests: [{ key: 'g003', ids: ['r001'] }] })]);
    expect([base.model, base.prompt.sha256, base.census.sha256, base.items.length]).toEqual([
      'claude-fable-5-2',
      'a'.repeat(64),
      'c'.repeat(64),
      5,
    ]);
  });

  it('refuses runs on different models', () => {
    expect(() => checkRuns([run('A'), run('B', { model: 'claude-opus-5-5' })])).toThrow(/model/);
  });

  it('refuses runs with different prompts', () => {
    expect(() =>
      checkRuns([run('A'), run('B', { prompt: { path: 'p', sha256: 'b'.repeat(64) } })])
    ).toThrow(/prompt/);
  });

  it('refuses full runs whose item ids name different pairs', () => {
    const swapped = ITEMS.map((it) => (it.id === 'r003' ? { ...it, icelandic: 'annað' } : it));
    expect(() => checkRuns([run('A'), run('B', { items: swapped })])).toThrow(/r003/);
  });

  it('refuses a pilot run', () => {
    expect(() => checkRuns([run('A', { phase: 'pilot' })])).toThrow(/pilot/);
  });

  it('refuses resend runs without a full run', () => {
    expect(() => checkRuns([run('A', { phase: 'resend', items: [ITEMS[0]] })])).toThrow(/full/);
  });

  it('refuses a resend item that differs from the full run item of the same id', () => {
    const other = { ...ITEMS[0], sentences: ['Another sentence.'] };
    expect(() => checkRuns([run('A'), run('B', { phase: 'resend', items: [other] })])).toThrow(
      /r001/
    );
  });
});

describe('mergeVerdicts', () => {
  it('takes a later answer for an id the earlier run left unjudged', () => {
    const merged = mergeVerdicts([read('A', [['r002', fine]]), read('B', [['r001', flag]])]);
    expect([merged.get('r001').runId, merged.get('r001').verdict]).toEqual(['B', 'flag']);
  });

  it('refuses an id answered in two runs, naming both', () => {
    expect(() => mergeVerdicts([read('B', [['r001', flag]]), read('A', [['r001', fine]])])).toThrow(
      /r001.*A.*B/
    );
  });
});

describe('resendIds', () => {
  it('names the unjudged population and physics-biology ids, never a control', () => {
    const base = checkRuns([run('A')]);
    const merged = mergeVerdicts([read('A', [['r003', fine]])]);
    expect(resendIds({ base, merged, runs: [run('A')] })).toEqual({
      send: ['r001', 'r004'],
      resentBefore: [],
    });
  });

  it('re-sends an id once: one a resend run already sent stays unjudged', () => {
    const runs = [
      run('A'),
      {
        ...run('B', {
          phase: 'resend',
          items: [ITEMS[0]],
          requests: [{ key: 'r001', ids: ['r001'] }],
        }),
        sentKeys: ['r001'],
      },
    ];
    const base = checkRuns(runs);
    const merged = mergeVerdicts([read('A', [['r003', fine]]), read('B', [])]);
    expect(resendIds({ base, merged, runs })).toEqual({
      send: ['r004'],
      resentBefore: ['r001'],
    });
  });

  it('an id a stopped resend run planned but never sent (requests.jsonl) can still be sent', () => {
    // The resend run planned r001 and r004 and stopped at the cap after sending r001.
    const runs = [
      run('A'),
      {
        ...run('B', {
          phase: 'resend',
          items: [ITEMS[0], ITEMS[3]],
          requests: [
            { key: 'r001', ids: ['r001'] },
            { key: 'r004', ids: ['r004'] },
          ],
        }),
        sentKeys: ['r001'],
      },
    ];
    const base = checkRuns(runs);
    const merged = mergeVerdicts([read('A', [['r003', fine]]), read('B', [])]);
    expect(resendIds({ base, merged, runs })).toEqual({
      send: ['r004'],
      resentBefore: ['r001'],
    });
  });

  it('without a record of what was sent, counts every planned id as sent (never twice)', () => {
    const runs = [
      run('A'),
      run('B', { phase: 'resend', items: [ITEMS[0]], requests: [{ key: 'r001', ids: ['r001'] }] }),
    ];
    const base = checkRuns(runs);
    const merged = mergeVerdicts([read('A', [['r003', fine]]), read('B', [])]);
    expect(resendIds({ base, merged, runs }).resentBefore).toEqual(['r001']);
  });
});

describe('buildVerdicts', () => {
  const base = checkRuns([run('A')]);
  const merged = mergeVerdicts([
    read('A', [
      ['r001', flag],
      ['r002', flag],
      ['r005', fine],
    ]),
  ]);
  const doc = buildVerdicts({ base, merged, runIds: ['A'] });

  it('carries the schema, runs, model, prompt and exclusion counts', () => {
    expect([doc.schema, doc.runs, doc.model, doc.prompt, doc.excluded]).toEqual([
      VERDICTS_SCHEMA,
      ['A'],
      'claude-fable-5-2',
      { path: 'tools/ai-review/prompts/p.md', sha256: 'a'.repeat(64) },
      { ruled: 1, fallback: 2 },
    ]);
  });

  it('holds one row per population id, with a verdict or unjudged', () => {
    expect(doc.population.map((r) => [r.id, r.group, r.verdict])).toEqual([
      ['r001', 'chemistry', 'flag'],
      ['r003', 'chemistry', 'unjudged'],
      ['r004', 'physicsBiology', 'unjudged'],
    ]);
  });

  it("copies the model's flag, and gives an unjudged row nulls", () => {
    expect([doc.population[0], doc.population[1]]).toEqual([
      {
        id: 'r001',
        english: 'en-r001',
        icelandic: 'is-r001',
        group: 'chemistry',
        verdict: 'flag',
        kind: 'wrong-sense',
        reason: 'Another sense.',
        proposed: ['annað'],
        rightSenses: null,
        sentences: ['The en-r001 sentence.'],
      },
      {
        id: 'r003',
        english: 'en-r003',
        icelandic: 'is-r003',
        group: 'chemistry',
        verdict: 'unjudged',
        kind: null,
        reason: null,
        proposed: [],
        rightSenses: null,
        sentences: ['The en-r003 sentence.'],
      },
    ]);
  });

  it('judges the controls with judgeControls', () => {
    expect(doc.controls).toEqual({
      pass: true,
      results: [
        { id: 'r002', name: 'balanced', expected: 'flag', got: 'flag', ok: true },
        { id: 'r005', name: 'atom', expected: 'fine', got: 'fine', ok: true },
      ],
    });
  });
});

describe('assertPublishable', () => {
  const base = checkRuns([run('A')]);
  const doc = buildVerdicts({ base, merged: new Map(), runIds: ['A'] });
  const census = ITEMS.map(({ english, icelandic }) => ({ english, icelandic }));

  it('passes rows whose pairs the reduced census holds', () => {
    expect(() => assertPublishable(doc, census)).not.toThrow();
  });

  it('refuses a row whose pair the reduced census does not hold', () => {
    expect(() => assertPublishable(doc, census.slice(1))).toThrow(/en-r001/);
  });

  it('refuses an alternatives or ifRemoved field anywhere', () => {
    const leaky = { ...doc, population: [{ ...doc.population[0], ifRemoved: { text: 'x' } }] };
    expect(() => assertPublishable(leaky, census)).toThrow(/ifRemoved/);
  });
});

describe('stopReasons', () => {
  const base = checkRuns([run('A')]);

  it('names unjudged rows, control misses and runs that did not end complete', () => {
    const doc = buildVerdicts({ base, merged: new Map(), runIds: ['A'] });
    const reasons = stopReasons(doc, [{ runId: 'A', status: 'complete-over-reservation' }]);
    expect([
      reasons.some((r) => /3 population rows are unjudged/.test(r)),
      reasons.some((r) => /2 controls/.test(r)),
      reasons.some((r) => /A ended complete-over-reservation/.test(r)),
    ]).toEqual([true, true, true]);
  });

  it('is empty when every row is judged, every control passes and every run is complete', () => {
    const merged = mergeVerdicts([
      read('A', [
        ['r001', fine],
        ['r002', flag],
        ['r003', fine],
        ['r004', fine],
        ['r005', fine],
      ]),
    ]);
    const doc = buildVerdicts({ base, merged, runIds: ['A'] });
    expect(stopReasons(doc, [{ runId: 'A', status: 'complete' }])).toEqual([]);
  });
});

describe('renderReport', () => {
  const base = checkRuns([run('A')]);
  const merged = mergeVerdicts([
    read('A', [
      ['r001', flag],
      ['r002', { ...fine, reason: 'Looks | right\nto me.' }],
      ['r003', fine],
    ]),
  ]);
  const doc = buildVerdicts({ base, merged, runIds: ['A'] });
  const text = renderReport({
    doc,
    merged,
    runs: [
      {
        runId: 'A',
        phase: 'full',
        split: null,
        model: 'claude-fable-5-2',
        effort: 'high',
        status: 'complete',
        totalUsd: 1.234567,
      },
    ],
    iskRate: 140,
    iskRateSource: 'Central Bank of Iceland mid rate, 2026-11-18',
  });

  it('puts a control miss above everything else', () => {
    expect(text.indexOf('## Control misses')).toBeLessThan(text.indexOf('## Verdicts'));
  });

  it("holds the control table with the model's reason, escaped for a table cell", () => {
    expect(text).toMatch(
      /^\| r002 \| balanced \| flag \| fine \| FAIL \| Looks \\\| right to me\. \|$/m
    );
  });

  it('gives each run its model, effort and cost in USD and ISK, with the rate source', () => {
    expect(text).toMatch(
      /^- `A` \(full\): claude-fable-5-2, effort high, ended complete: USD 1\.234567 = ISK 173$/m
    );
  });

  it('names the ISK rate and its source', () => {
    expect(text).toMatch(/140 ISK per USD; source: Central Bank of Iceland mid rate, 2026-11-18/);
  });

  it('counts the verdicts by group', () => {
    expect(text).toMatch(/^\| chemistry \| 1 \| 1 \| 0 \| 2 \|$/m);
  });

  it('counts the flag kinds', () => {
    expect(text).toMatch(/^\| wrong-sense \| 1 \|$/m);
  });

  it('lists the unjudged rows as open', () => {
    expect(text).toMatch(/^- `r004` en-r004 → is-r004$/m);
  });

  it('gives the exclusion counts and the prompt sha256', () => {
    expect([/^\| fallback \| 2 \|$/m.test(text), text.includes('a'.repeat(64))]).toEqual([
      true,
      true,
    ]);
  });
});
