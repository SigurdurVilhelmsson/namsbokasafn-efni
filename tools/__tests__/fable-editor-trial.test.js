/**
 * The Fable editor trial (experiments/fable-editor-trial/, plan
 * docs/plans/2026-11-14-fable-editor-trial-plan.md): the pure helpers, the requests built from the
 * real ch10 inputs, and one end-to-end run → promote → report on a mock transport. No test reaches
 * the network, and nothing is written under books/ (checked by the last block).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { validateRequestBody } from '../ai-review/harness.js';
import { loadRulingSet } from '../ai-review/ruling-set.js';
import {
  REPO_ROOT,
  MODEL,
  PROMPT_PATH,
  RULING_SET_PATH,
  DEFAULT_EFFORT,
  DEFAULT_MAX_TOKENS,
  DEFAULT_CHAR_BUDGET,
  markerSignature,
  markerProblem,
  parseAnswer,
  chunkSegments,
  isLaterRepeatsRemoved,
  chooseSample,
  blindItems,
  scoreBlind,
  editDistance,
  chrF,
  readable,
  readPinnedInputs,
  buildRequests,
} from '../../experiments/fable-editor-trial/lib.mjs';
import {
  main,
  parseCli,
  assertOutsideRepo,
} from '../../experiments/fable-editor-trial/run-trial.mjs';
import { promote } from '../../experiments/fable-editor-trial/promote.mjs';
import { report, score } from '../../experiments/fable-editor-trial/compare.mjs';

const tmpDirs = [];
const tmp = (name) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `fable-trial-${name}-`));
  tmpDirs.push(d);
  return d;
};
beforeEach(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('network forbidden in tests');
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

const ok = (edits) => ({
  outcome: 'succeeded',
  response: { content: [{ type: 'text', text: JSON.stringify({ edits }) }] },
});

describe('markers', () => {
  it('lets the words inside a term change but not its id', () => {
    expect(
      markerProblem(
        'um [[term:millikrafta|term-00001]] hér',
        'um [[term:millikrafti|term-00001]] hér'
      )
    ).toBeNull();
    expect(
      markerProblem('[[term:millikrafta|term-00001]]', '[[term:millikrafta|term-00002]]')
    ).toMatch(/term\|term-00002 \+1/);
  });
  it('freezes the body of MATH, xref, sub and sup', () => {
    expect(markerProblem('H[[sub:2]]O', 'H[[sub:3]]O')).not.toBeNull();
    expect(markerProblem('sjá [[xref:fig-1]]', 'sjá [[xref:fig-2]]')).not.toBeNull();
    expect(markerProblem('[[MATH:3]] er', 'er [[MATH:3]]')).toBeNull(); // moving is fine
  });
  it('counts a dropped or added marker', () => {
    expect(markerProblem('a [[i:aq]] b', 'a aq b')).toBe('i -1');
    expect(markerProblem('a b', 'a [[b:b]]')).toBe('b +1');
  });
  it('reads nested markers innermost first and counts stray brackets', () => {
    expect(markerSignature('[[link:[[i:x]] y|http://a]]')).toEqual(['i', 'link|http://a']);
    expect(markerSignature('a [[ b')).toEqual(['residue×1']);
  });
});

describe('parseAnswer', () => {
  it('keeps known keys once, trims, filters unknown tags', () => {
    const a = parseAnswer(
      ok([
        { key: 'k1', text: ' nýtt ', tags: ['grammar', 'nonsense', 'grammar'] },
        { key: 'k1', text: 'aftur', tags: [] },
        { key: 'zz', text: 'x', tags: [] },
        { key: 'k2', text: '  ', tags: [] },
      ]),
      ['k1', 'k2']
    );
    expect(a.usable).toBe(true);
    expect(a.edits).toEqual([{ key: 'k1', text: 'nýtt', tags: ['grammar'] }]);
    expect(a.problems).toHaveLength(3);
  });
  it('refuses a missing, failed or non-JSON answer', () => {
    expect(parseAnswer(undefined, []).usable).toBe(false);
    expect(parseAnswer({ outcome: 'refused' }, []).usable).toBe(false);
    expect(
      parseAnswer(
        { outcome: 'succeeded', response: { content: [{ type: 'text', text: '{' }] } },
        []
      ).usable
    ).toBe(false);
    expect(parseAnswer(ok(undefined), []).usable).toBe(false);
  });
});

describe('chunkSegments', () => {
  it('splits at the budget and never leaves an empty chunk', () => {
    const segs = ['aaaa', 'bbbb', 'cc', 'dddddddddd'].map((is, i) => ({ key: `k${i}`, is }));
    expect(chunkSegments(segs, 8).map((c) => c.map((s) => s.key))).toEqual([
      ['k0', 'k1'],
      ['k2'],
      ['k3'],
    ]);
  });
});

describe('isLaterRepeatsRemoved', () => {
  const marker = (id) => `<!-- SEG:m1:para:${id} -->`;
  it('accepts the removal of a later repeat of an id', () => {
    const then = `${marker('a')}\nOne\n\n${marker('b')}\nTwo\n\n${marker('a')}\nOne again\n`;
    const now = `${marker('a')}\nOne\n\n${marker('b')}\nTwo\n`;
    expect(isLaterRepeatsRemoved(then, now)).toBe(true);
  });
  it('refuses any other change', () => {
    const then = `${marker('a')}\nOne\n\n${marker('b')}\nTwo\n`;
    expect(isLaterRepeatsRemoved(then, `${marker('a')}\nOne!\n\n${marker('b')}\nTwo\n`)).toBe(
      false
    );
    expect(isLaterRepeatsRemoved(then, `${marker('a')}\nOne\n`)).toBe(false);
  });
});

describe('metrics', () => {
  it('editDistance counts code points', () => {
    expect(editDistance('kött', 'kött')).toBe(0);
    expect(editDistance('kött', 'kótt')).toBe(1);
    expect(editDistance('', 'ab')).toBe(2);
  });
  it('chrF is 100 for identical text and lower for different text', () => {
    expect(chrF('vatnið sýður', 'vatnið sýður')).toBeCloseTo(100, 5);
    expect(chrF('vatnið sýður', 'vatn frýs')).toBeLessThan(60);
  });
  it('readable turns markers into plain text', () => {
    expect(readable('H[[sub:2]]O og [[term:vatn|term-1]] [[MATH:2]]')).toBe(
      'H<sub>2</sub>O og **vatn** [formúla 2]'
    );
  });
});

describe('blind ranking', () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({
    key: `k${i}`,
    segmentId: `m1:${i % 3 ? 'para' : 'title'}:${i}`,
    en: `en ${i}`,
    mt: `mt ${i}`,
    tp: i % 2 ? `tp ${i}` : `mt ${i}`,
    fe: i % 5 === 0 ? `mt ${i}` : `fe ${i}`,
  }));
  it('samples only rows FE changed, half where TP changed too, reproducibly', () => {
    const s = chooseSample(rows, { size: 10, seed: 'run-x' });
    expect(s).toHaveLength(10);
    expect(s.every((r) => r.fe !== r.mt)).toBe(true);
    expect(s.filter((r) => r.tp !== r.mt)).toHaveLength(5);
    expect(chooseSample(rows, { size: 10, seed: 'run-x' }).map((r) => r.key)).toEqual(
      s.map((r) => r.key)
    );
  });
  it('merges identical versions under one letter and scores ranks back to conditions', () => {
    const sample = [
      { key: 'a', en: 'e', mt: 'X', tp: 'X', fe: 'Y' },
      { key: 'b', en: 'e', mt: 'X', tp: 'Z', fe: 'Y' },
    ];
    const { items, key } = blindItems(sample, { seed: 's' });
    expect(items[0].versions).toHaveLength(2);
    expect(items[1].versions).toHaveLength(3);
    // Rank FE first everywhere, accept only FE.
    const rowFor = (k) => {
      const ranks = {};
      const acc = {};
      let next = 2;
      for (const [letter, conds] of Object.entries(k.letters)) {
        ranks[letter] = conds.includes('FE') ? 1 : next++;
        acc[letter] = conds.includes('FE') ? 'y' : 'n';
      }
      const r = (l) => ranks[l] ?? '-';
      const a = (l) => acc[l] ?? '-';
      return [k.item, r('A'), r('B'), r('C'), a('A'), a('B'), a('C')].join(',');
    };
    const csv = ['item,rank_A,rank_B,rank_C,accept_A,accept_B,accept_C', ...key.map(rowFor)].join(
      '\n'
    );
    const res = scoreBlind(csv, key);
    expect(res.answered).toBe(2);
    expect(res.summary.FE).toMatchObject({ rated: 2, meanRank: 1, rankedFirst: 2, acceptRate: 1 });
    expect(res.summary.MT.acceptRate).toBe(0);
    expect(res.summary.TP.rated).toBe(2);
  });
});

describe('the CLI guard rails', () => {
  it('refuses a cap above the shared ceiling and resume outside batch mode', () => {
    expect(() => parseCli(['--cap-usd', '101'])).toThrow(/cap-usd/);
    expect(() => parseCli(['--resume', 'x'])).toThrow(/batch/);
    expect(() => parseCli(['--bogus'])).toThrow();
  });
  it('refuses a records directory inside the repository or a relative one', () => {
    expect(() => assertOutsideRepo(path.join(REPO_ROOT, 'pipeline-output', 'x'))).toThrow(
      /outside/
    );
    expect(() => assertOutsideRepo('records')).toThrow(/absolute/);
    expect(assertOutsideRepo(os.tmpdir())).toBe(path.resolve(os.tmpdir()));
  });
});

// ── The real ch10 inputs ────────────────────────────────────────────────────────────────────

const booksStatus = () =>
  execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--', 'books/'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });

/**
 * CI checks out at depth 1, so the term pass's layer-1 commit is not there to `git show`
 * (measured on PR #686's first push). The tests below that are not about the English drift read
 * the "then" English as the English now: with no repeats left in it, the G1.12 check passes
 * trivially, which is all those tests need. The drift check itself is unit-tested above on
 * fixtures, and against the real history in the next block wherever the commit is present.
 */
const NO_HISTORY = {
  gitShow: (_commit, repoRel) => fs.readFileSync(path.join(REPO_ROOT, repoRel), 'utf8'),
};
const LAYER1_COMMIT = '0093d8da4620a2041e583d3f84d39e9b49f055a2';
const hasCommit = (() => {
  try {
    execFileSync('git', ['cat-file', '-e', `${LAYER1_COMMIT}^{commit}`], {
      cwd: REPO_ROOT,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
})();

describe('ch10 English drift against the real history', () => {
  // Skipped in a shallow clone (CI), where the commit cannot be read; it runs in any full clone,
  // which is where the paid run happens, and the runner refuses there if this would fail.
  it.skipIf(!hasCommit)('is only the G1.12 removal of later repeats, in five modules', () => {
    const { enDrift } = readPinnedInputs('ch10');
    expect(enDrift.map((d) => d.stem)).toEqual(['m68761', 'm68764', 'm68768', 'm68769', 'm68773']);
  });
});

describe('ch10 requests', () => {
  it('match the term-pass inputs and pass the harness body check', () => {
    const { inputs } = readPinnedInputs('ch10', NO_HISTORY);
    const prompt = fs.readFileSync(path.join(REPO_ROOT, PROMPT_PATH), 'utf8');
    const reqs = buildRequests({
      chapterDir: 'ch10',
      inputs,
      rulingSet: loadRulingSet(RULING_SET_PATH),
      prompt,
    });
    expect(reqs.length).toBeGreaterThan(0);
    const keys = reqs.flatMap((r) => r.keys.map((k) => `${r.stem}/${k}`));
    expect(new Set(keys).size).toBe(keys.length);
    for (const r of reqs) {
      expect(r.isChars).toBeLessThanOrEqual(
        Math.max(DEFAULT_CHAR_BUDGET, r.isChars === 0 ? 0 : r.isChars)
      );
      expect(
        validateRequestBody(r.body, {
          model: MODEL,
          effort: DEFAULT_EFFORT,
          maxTokens: DEFAULT_MAX_TOKENS,
        })
      ).toEqual([]);
      const doc = JSON.parse(r.body.messages[0].content);
      expect(doc.segments.map((s) => s.key)).toEqual(r.keys);
    }
  });
});

// ── End to end on a mock transport ──────────────────────────────────────────────────────────

/** A mock transport that edits the first segment of every request (changes its first word). */
function mockTransport() {
  let version = null;
  const reply = (body) => {
    const doc = JSON.parse(body.messages[0].content);
    const s = doc.segments.find((x) => /^\p{L}{3,}/u.test(x.is));
    const edits = s
      ? [{ key: s.key, text: s.is.replace(/^\p{L}+/u, 'Prófun'), tags: ['fluency'] }]
      : [];
    return {
      id: 'msg_mock',
      type: 'message',
      role: 'assistant',
      model: MODEL,
      content: [{ type: 'text', text: JSON.stringify({ edits }) }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 1000, output_tokens: 100 },
    };
  };
  return {
    anthropicVersion: () => version,
    sdk: () => ({ name: '@anthropic-ai/sdk', version: 'mock' }),
    async countTokens() {
      version = '2026-10-21';
      return { input_tokens: 1000 };
    },
    async send(body) {
      version = '2026-10-21';
      return reply(body);
    },
  };
}

describe('run → promote → report → score on a mock transport', () => {
  it('writes records outside the repo, promotes them, and builds the comparison without touching books/', async () => {
    const before = booksStatus();
    const records = tmp('records');
    const trialRoot = tmp('root');
    const out = [];
    const git = (args) => {
      if (args[0] === 'ls-files') return 'tracked\0';
      if (args[0] === 'status') return '';
      throw new Error(`unexpected git ${args.join(' ')}`);
    };
    const code = await main(['--module', 'm68760', '--records', records, '--yes'], {
      stdout: { write: (s) => out.push(s) },
      git,
      inputOptions: NO_HISTORY,
      transport: mockTransport(),
      harness: {
        harnessCommit: () => 'c'.repeat(40),
        harnessDirty: () => false,
        sleep: async () => {},
      },
    });
    const text = out.join('');
    expect(code, text).toBe(0);
    const runId = /run (\S+): complete/.exec(text)[1];

    const { copied } = promote({
      runId,
      recordsDir: records,
      destRoot: path.join(trialRoot, 'runs'),
      env: {},
    });
    expect(copied).toEqual(
      expect.arrayContaining(['run.json', 'responses.jsonl', 'fable-editor.json', 'ledger.jsonl'])
    );
    // Promoting again with the same bytes is fine.
    expect(() =>
      promote({ runId, recordsDir: records, destRoot: path.join(trialRoot, 'runs'), env: {} })
    ).not.toThrow();

    const r = report({ trialRoot, runId, sampleSize: 4, inputOptions: NO_HISTORY });
    const resDir = path.join(trialRoot, 'results', runId);
    for (const f of [
      'report.md',
      'metrics.json',
      'segments.jsonl',
      'blind-sheet.md',
      'blind-answers.csv',
      'blind-key.b64',
    ]) {
      expect(fs.existsSync(path.join(resDir, f)), f).toBe(true);
    }
    const rows = fs
      .readFileSync(path.join(resDir, 'segments.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    expect(rows.filter((x) => x.status === 'edited')).toHaveLength(1);
    expect(
      fs.readFileSync(path.join(resDir, 'fe-layer', 'm68760-segments.is.md'), 'utf8')
    ).toContain('Prófun');
    expect(r.sampled).toBe(1);

    const csv = fs
      .readFileSync(path.join(resDir, 'blind-answers.csv'), 'utf8')
      .replace(/^1,,/m, '1,1,')
      .replace(/^1,1,,/m, '1,1,2,');
    const answers = path.join(trialRoot, 'answers.csv');
    fs.writeFileSync(answers, csv);
    const res = score({ trialRoot, runId, answersFile: answers });
    expect(res.answered).toBe(1);

    expect(booksStatus()).toBe(before);
  });

  it('refuses to promote an unfinished run or a file holding the key', () => {
    const records = tmp('records2');
    const runId = '20261114T000000Z-0123abcd';
    const src = path.join(records, 'runs', runId);
    fs.mkdirSync(src, { recursive: true });
    expect(() => promote({ runId, recordsDir: records, destRoot: tmp('d'), env: {} })).toThrow(
      /has not ended/
    );
    fs.writeFileSync(path.join(src, 'run-end.json'), '{}');
    fs.writeFileSync(path.join(src, 'fable-editor.json'), '{}');
    fs.writeFileSync(path.join(src, 'run.json'), '{"k":"sk-ant-secret-123"}');
    expect(() =>
      promote({
        runId,
        recordsDir: records,
        destRoot: tmp('d2'),
        env: { ANTHROPIC_API_KEY: 'sk-ant-secret-123' },
      })
    ).toThrow(/API key/);
  });
});
