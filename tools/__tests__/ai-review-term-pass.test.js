/**
 * The term-pass CLI end to end, offline: a throwaway repository with a real copy of
 * chemistry ch02, a mock transport, then plan → preflight → run → apply (dry, report, write)
 * → verifyRevision. Design: docs/superpowers/specs/2026-10-27-ai-layer-runner-design.md.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  main,
  BOOK,
  CODE_PATHS,
  DEFAULT_MODEL,
  DEFAULT_EFFORT,
  DEFAULT_MAX_TOKENS,
  SDK_NONSTREAMING_MAX_TOKENS,
} from '../ai-review/term-pass.js';
import { TERM_PASS_RECORD } from '../ai-review/term-pass-apply.js';
import { listChapterUnits, verifyRevision } from '../lib/mt-layers.js';
import { makeGit } from '../ai-review/provenance.js';
import { loadPrompt, PROMPT_PATH } from '../ai-review/term-pass-request.js';
import { loadRulingSet } from '../ai-review/ruling-set.js';
import { readLedger } from '../ai-review/ledger.js';
import {
  REPO,
  RULING_SET_PATH,
  makeTempRepo,
  makeTempDir,
  removeTempDirs,
  mockTransport,
  scriptedAnswer,
  messageFor,
  TIO2_ID,
  AL_ID,
} from './helpers/term-pass-fixture.js';

const HARNESS = { harnessCommit: () => 'a'.repeat(40), harnessDirty: () => false };
let clock = Date.parse('2026-10-27T10:00:00Z');
const now = () => new Date((clock += 1000));

function setup() {
  const fx = makeTempRepo();
  const lines = [];
  const deps = (extra = {}) => ({
    repoRoot: fx.root,
    bookDir: fx.book,
    recordsDir: fx.records,
    git: makeGit({ cwd: fx.root }),
    codePaths: ['tools/ai-review/prompts'],
    stdout: (s) => lines.push(s),
    now,
    ...HARNESS,
    ...extra,
  });
  return { fx, lines, deps };
}

const scratch = () => makeTempDir('tp-out-');
afterAll(removeTempDirs);

describe('constants', () => {
  it('pins the book, the model, the effort and the token limits', () => {
    expect(BOOK).toBe('efnafraedi-2e');
    expect(DEFAULT_MODEL).toBe('claude-opus-5-5');
    expect(DEFAULT_EFFORT).toBe('high');
    expect(DEFAULT_MAX_TOKENS).toBe(16000);
    expect(SDK_NONSTREAMING_MAX_TOKENS).toBe(Math.floor((600 * 128000) / 3600));
  });

  it('covers the whole import closure of the CLI with CODE_PATHS', () => {
    const seen = new Set();
    const visit = (file) => {
      if (seen.has(file)) return;
      seen.add(file);
      // Comments are stripped first: a docstring may show an import it does not make.
      const src = fs
        .readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      // What LOADS with the CLI: static import/export-from in an ES module, require() in a
      // CommonJS (.cjs) one. A lazy require inside an ES-module function (api-translate.js's
      // guarded pipeline-status require) never runs here, so it is not followed.
      const re = file.endsWith('.cjs')
        ? /require\(\s*['"](\.[^'"]+)['"]\s*\)/g
        : /^\s*(?:import|export)\b[^;]*?\bfrom\s*['"](\.[^'"]+)['"]|^\s*import\s*['"](\.[^'"]+)['"]/gm;
      for (const m of src.matchAll(re)) {
        const target = path.resolve(path.dirname(file), m[1] ?? m[2]);
        const found = [target, `${target}.js`, `${target}.cjs`].find((f) => fs.existsSync(f));
        if (!found) throw new Error(`${file} imports ${m[1] ?? m[2]}, which does not resolve`);
        visit(found);
      }
    };
    visit(path.join(REPO, 'tools/ai-review/term-pass.js'));
    const rel = [...seen].map((f) => path.relative(REPO, f).split(path.sep).join('/'));
    expect(rel.length).toBeGreaterThan(10);
    const uncovered = rel.filter((f) => !CODE_PATHS.some((p) => f === p || f.startsWith(`${p}/`)));
    expect(uncovered).toEqual([]);
  });
});

describe('flags', () => {
  const { deps } = setup();

  it('refuses an unknown flag instead of ignoring it', async () => {
    await expect(main(['plan', '--chapter', 'ch02', '--book', 'x'], deps())).rejects.toThrow(
      /book/
    );
  });

  it('refuses a flag that does not apply to the command', async () => {
    await expect(main(['plan', '--chapter', 'ch02', '--yes'], deps())).rejects.toThrow(
      /does not apply/
    );
  });

  it('refuses an output path inside the repository, and --overwrite without --write', async () => {
    const d = deps();
    await expect(
      main(['plan', '--chapter', 'ch02', '--out', path.join(d.repoRoot, 'x.json')], d)
    ).rejects.toThrow(/outside/);
    await expect(
      main(['apply', '--chapter', 'ch02', '--run', 'r', '--overwrite'], d)
    ).rejects.toThrow(/--write/);
  });

  it('refuses a chapter the book does not have', async () => {
    await expect(main(['plan', '--chapter', 'ch99'], deps())).rejects.toThrow(/ch99/);
  });

  it('refuses another book directory', async () => {
    await expect(
      main(
        ['plan', '--chapter', 'ch02'],
        deps({ bookDir: path.join(os.tmpdir(), 'books', 'lifraen-efnafraedi') })
      )
    ).rejects.toThrow(/efnafraedi-2e/);
  });
});

describe('plan', () => {
  it('counts the work and writes the requests outside the repository', async () => {
    const { deps } = setup();
    const out = path.join(scratch(), 'plan.json');
    const r = await main(['plan', '--chapter', 'ch02', '--out', out], deps());
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].estimate.requests).toBeGreaterThan(0);
    const saved = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(
      saved.chapters[0].requests.some((q) =>
        q.presented.segments.some((s) => s.segmentId === TIO2_ID)
      )
    ).toBe(true);
  });
});

describe('run preflight', () => {
  it('refuses an interactive max_tokens the SDK would refuse, before spending', async () => {
    const { deps, fx } = setup();
    const t = mockTransport();
    await expect(
      main(
        ['run', '--chapter', 'ch02', '--mode', 'interactive', '--max-tokens', '30000', '--yes'],
        deps({ transport: t })
      )
    ).rejects.toThrow(/21333/);
    expect(t.calls.send + t.calls.countTokens).toBe(0);
    expect(fs.existsSync(path.join(fx.records, 'runs'))).toBe(false);
  });

  it('refuses a modified prompt', async () => {
    const { deps, fx } = setup();
    fs.appendFileSync(path.join(fx.root, PROMPT_PATH), '\nextra\n');
    await expect(
      main(
        ['run', '--chapter', 'ch02', '--mode', 'interactive', '--yes'],
        deps({ transport: mockTransport() })
      )
    ).rejects.toThrow(/modified/);
  });

  it('refuses when a layer-1 file differs from its blob at the layer-1 commit', async () => {
    const { deps, fx } = setup();
    const f = path.join(fx.book, '02-mt-output', 'ch02', 'm68693-segments.is.md');
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('gráar', 'gráir'));
    await expect(
      main(
        ['run', '--chapter', 'ch02', '--mode', 'interactive', '--yes'],
        deps({ transport: mockTransport() })
      )
    ).rejects.toThrow(/differs from its blob/);
  });

  it('refuses a layer-1 commit that does not exist', async () => {
    const { deps } = setup();
    await expect(
      main(
        [
          'run',
          '--chapter',
          'ch02',
          '--mode',
          'interactive',
          '--layer1-commit',
          'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
        ],
        deps({ transport: mockTransport() })
      )
    ).rejects.toThrow(/names no commit/);
  });

  it('sends nothing without --yes', async () => {
    const { deps, fx } = setup();
    const t = mockTransport();
    const r = await main(
      ['run', '--chapter', 'ch02', '--mode', 'interactive'],
      deps({ transport: t })
    );
    expect(r.sent).toBe(false);
    expect(r.layer1Commit).toBe(fx.commit);
    expect(t.calls.send).toBe(0);
    expect(fs.existsSync(path.join(fx.records, 'runs'))).toBe(false);
  });
});

describe('run → apply, interactive', () => {
  let S;
  let runId;
  beforeAll(async () => {
    S = setup();
    const r = await main(
      ['run', '--chapter', 'ch02', '--mode', 'interactive', '--yes'],
      S.deps({ transport: mockTransport() })
    );
    expect(r.results).toHaveLength(1);
    runId = r.results[0].runId;
  });

  it('ends complete and records the run beside the harness’s records', () => {
    const dir = path.join(S.fx.records, 'runs', runId);
    const tp = JSON.parse(fs.readFileSync(path.join(dir, TERM_PASS_RECORD), 'utf8'));
    expect(tp.layer1Commit).toBe(S.fx.commit);
    expect(tp.chapterDir).toBe('ch02');
    expect(tp.units.map((u) => u.stem)).toEqual(
      listChapterUnits({ bookDir: S.fx.book, chapterDir: 'ch02' })
    );
    const run = JSON.parse(fs.readFileSync(path.join(dir, 'run.json'), 'utf8'));
    expect(run.use).toBe('term-pass');
    expect(run.effort).toBe('high');
    const requests = fs.readFileSync(path.join(dir, 'requests.jsonl'), 'utf8').trim().split('\n');
    expect(requests).toHaveLength(tp.requestKeys.length);
  });

  it('settles every call in the ledger', () => {
    const entries = readLedger(path.join(S.fx.records, 'ledger.jsonl'));
    expect(entries.filter((e) => e.type === 'reserve').length).toBeGreaterThan(0);
  });

  it('applies dry: the scripted edits pass, the flag is kept, nothing is written', async () => {
    const r = await main(['apply', '--chapter', 'ch02', '--run', runId], S.deps());
    expect(r.result.counts.accepted).toBe(4);
    expect(r.result.counts.occurrencesChanged).toBe(1);
    expect(r.result.flags.filter((f) => f.segmentId === AL_ID).map((f) => f.kind)).toEqual([
      'needs-rewrite',
    ]);
    expect(fs.existsSync(path.join(S.fx.book, '02-mt-revised'))).toBe(false);
    expect(fs.existsSync(path.join(S.fx.records, 'applied'))).toBe(false);
  });

  it('writes a reviewer’s report outside the repository', async () => {
    const out = path.join(scratch(), 'report.md');
    await main(['apply', '--chapter', 'ch02', '--run', runId, '--report', out], S.deps());
    const md = fs.readFileSync(out, 'utf8');
    expect(md).toContain('Títanatómin eru grá og súrefnisatómin eru rauð');
    expect(md).toContain('needs-rewrite');
  });

  it('refuses when an input changed after the run', async () => {
    const f = path.join(S.fx.book, '02-for-mt', 'ch02', 'm68684-segments.en.md');
    const keep = fs.readFileSync(f);
    try {
      fs.appendFileSync(f, ' ');
      await expect(main(['apply', '--chapter', 'ch02', '--run', runId], S.deps())).rejects.toThrow(
        /stale-inputs/
      );
    } finally {
      fs.writeFileSync(f, keep);
    }
  });

  it('writes a complete chapter whose every unit verifies, then refuses to overwrite it', async () => {
    const r = await main(['apply', '--chapter', 'ch02', '--run', runId, '--write'], S.deps());
    const stems = listChapterUnits({ bookDir: S.fx.book, chapterDir: 'ch02' });
    expect(r.written.layer2.filter((p) => p.endsWith('-revision.json'))).toHaveLength(stems.length);
    const prompt = loadPrompt(path.join(S.fx.root, PROMPT_PATH));
    const rs = loadRulingSet(path.join(S.fx.root, RULING_SET_PATH));
    for (const stem of stems) {
      expect(
        verifyRevision({
          bookDir: S.fx.book,
          chapterDir: 'ch02',
          stem,
          current: {
            rulingSetSha256: rs.sha256,
            promptSha256: prompt.sha256,
            model: 'claude-opus-5-5',
          },
        }),
        stem
      ).toEqual([]);
    }
    const text = fs.readFileSync(
      path.join(S.fx.book, '02-mt-revised', 'ch02', 'm68693-segments.is.md'),
      'utf8'
    );
    expect(text).toContain('Títanatómin eru grá og súrefnisatómin eru rauð.');
    const original = fs.readFileSync(
      path.join(S.fx.book, '02-mt-output', 'ch02', 'm68693-segments.is.md'),
      'utf8'
    );
    expect(original).toContain('Títanfrumeindirnar eru gráar');
    for (const name of ['apply.json', 'gate.jsonl', 'flags.jsonl', 'senses.jsonl']) {
      expect(fs.existsSync(path.join(S.fx.records, 'applied', 'ch02', name)), name).toBe(true);
    }
    await expect(
      main(['apply', '--chapter', 'ch02', '--run', runId, '--write'], S.deps())
    ).rejects.toThrow(/already/);
  });
});

describe('an answer entry for a segment the request did not show', () => {
  it('is logged as dropped, and its op is rejected, never applied', async () => {
    const S = setup();
    let first = true;
    const answer = (body) => {
      const a = scriptedAnswer(body);
      if (first) {
        first = false;
        a.segments.push({
          id: 'm68684:para:not-shown',
          senses: [],
          ops: [
            { category: 'term', ruling: 'atom', sense: null, find: 'x', replace: 'y', reason: 'r' },
          ],
          flags: [],
        });
      }
      return a;
    };
    const r = await main(
      ['run', '--chapter', 'ch02', '--mode', 'interactive', '--yes'],
      S.deps({ transport: mockTransport({ answer }) })
    );
    const a = await main(['apply', '--chapter', 'ch02', '--run', r.results[0].runId], S.deps());
    expect(a.result.counts.entriesDropped).toBe(1);
    expect(
      a.result.gateLog.filter((g) => g.kind === 'dropped').map((g) => [g.segmentId, g.reason])
    ).toEqual([['m68684:para:not-shown', 'response-unknown-segment']]);
    const rej = a.result.gateLog.find(
      (g) => g.kind === 'op' && g.segmentId === 'm68684:para:not-shown'
    );
    expect(rej.verdict).toBe('rejected');
    expect(rej.reasons).toEqual(['response-unknown-segment']);
    expect(a.result.counts.accepted).toBe(4);
  });
});

describe('run → apply, batch', () => {
  it('runs one batch per chapter and applies the same edits', async () => {
    const S = setup();
    const r = await main(
      ['run', '--chapter', 'ch02', '--mode', 'batch', '--yes'],
      S.deps({ transport: mockTransport(), sleep: async () => {}, pollIntervalMs: 0 })
    );
    expect(r.results[0].status).toBe('complete');
    const a = await main(['apply', '--chapter', 'ch02', '--run', r.results[0].runId], S.deps());
    expect(a.result.counts.accepted).toBe(4);
  });

  it('resumes a batch whose polling stopped, and records who resumed it', async () => {
    const S = setup();
    const t = mockTransport({ batchStates: ['in_progress', 'ended'] });
    const extra = { transport: t, sleep: async () => {}, pollIntervalMs: 0 };
    const r = await main(
      ['run', '--chapter', 'ch02', '--mode', 'batch', '--yes', '--max-polls', '1'],
      S.deps(extra)
    );
    expect(r.results[0].status).toBe('pending');
    const runId = r.results[0].runId;
    const res = await main(['resume', '--run', runId], S.deps(extra));
    expect(res.status).toBe('complete');
    const run = JSON.parse(
      fs.readFileSync(path.join(S.fx.records, 'runs', runId, 'run.json'), 'utf8')
    );
    expect(run.resumes).toHaveLength(1);
    const a = await main(['apply', '--chapter', 'ch02', '--run', runId], S.deps());
    expect(a.result.counts.accepted).toBe(4);
  });
});

// The runner review (2026-10-27) found that term-pass.json was written in a `finally` after
// the harness returned, so a process killed while polling a paid batch left a run that
// neither resume nor apply could use; and that resume re-planned the requests from the
// current tree, so any change after the buy stranded the batch and its reservation.
describe('a run killed mid-flight stays resumable and applicable', () => {
  /** Whether each run directory under `records` holds term-pass.json right now. */
  const termPassOnDisk = (records) => {
    const runs = path.join(records, 'runs');
    return (fs.existsSync(runs) ? fs.readdirSync(runs) : []).map((id) =>
      fs.existsSync(path.join(runs, id, TERM_PASS_RECORD))
    );
  };

  it('a batch has term-pass.json on disk while it is still polling', async () => {
    const S = setup();
    const t = mockTransport({ batchStates: ['in_progress', 'ended'] });
    const seen = [];
    const getBatch = t.getBatch;
    t.getBatch = async (...a) => {
      seen.push(termPassOnDisk(S.fx.records));
      return getBatch(...a);
    };
    const r = await main(
      ['run', '--chapter', 'ch02', '--mode', 'batch', '--yes'],
      S.deps({ transport: t, sleep: async () => {}, pollIntervalMs: 0 })
    );
    expect(r.results[0].status).toBe('complete');
    expect(seen[0]).toEqual([true]);
  });

  it('an interactive run has term-pass.json on disk before its first send', async () => {
    const S = setup();
    const t = mockTransport();
    const seen = [];
    const send = t.send;
    t.send = async (...a) => {
      seen.push(termPassOnDisk(S.fx.records));
      return send(...a);
    };
    const r = await main(
      ['run', '--chapter', 'ch02', '--mode', 'interactive', '--yes'],
      S.deps({ transport: t })
    );
    expect(r.results[0].status).toBe('complete');
    expect(seen[0]).toEqual([true]);
  });

  it('resume collects a bought batch after the tree changed; apply is what refuses stale inputs', async () => {
    const S = setup();
    const t = mockTransport({ batchStates: ['in_progress', 'ended'] });
    const extra = { transport: t, sleep: async () => {}, pollIntervalMs: 0 };
    const r = await main(
      ['run', '--chapter', 'ch02', '--mode', 'batch', '--yes', '--max-polls', '1'],
      S.deps(extra)
    );
    expect(r.results[0].status).toBe('pending');
    const runId = r.results[0].runId;
    // A HAND REPAIR to a PRESENTED layer-1 segment (the reviewer's probe p5): it changes
    // the request body a re-plan would build, so the old resume refused here.
    const f = path.join(S.fx.book, '02-mt-output', 'ch02', 'm68693-segments.is.md');
    const keep = fs.readFileSync(f);
    try {
      const text = keep.toString('utf8');
      expect(text).toContain('„osseous“/Flickr)');
      fs.writeFileSync(f, text.replace('„osseous“/Flickr)', '„osseous“ / Flickr)'));
      const res = await main(['resume', '--run', runId], S.deps(extra));
      expect(res.status).toBe('complete');
      await expect(main(['apply', '--chapter', 'ch02', '--run', runId], S.deps())).rejects.toThrow(
        /stale-inputs/
      );
    } finally {
      fs.writeFileSync(f, keep);
    }
    // control: with the tree restored, the same run applies
    const a = await main(['apply', '--chapter', 'ch02', '--run', runId], S.deps());
    expect(a.result.counts.accepted).toBe(4);
  });

  it('resume checks run.json before term-pass.json, and names a missing term-pass.json', async () => {
    const S = setup();
    const extra = { transport: mockTransport(), sleep: async () => {}, pollIntervalMs: 0 };
    // an interactive run is not resumable, whatever else is missing
    const i = await main(
      ['run', '--chapter', 'ch02', '--mode', 'interactive', '--yes'],
      S.deps(extra)
    );
    const iDir = path.join(S.fx.records, 'runs', i.results[0].runId);
    fs.rmSync(path.join(iDir, TERM_PASS_RECORD));
    await expect(main(['resume', '--run', i.results[0].runId], S.deps(extra))).rejects.toThrow(
      /not a .* batch run/
    );
    // a pending batch whose term-pass.json is gone is refused by name
    const t = mockTransport({ batchStates: ['in_progress', 'ended'] });
    const b = await main(
      ['run', '--chapter', 'ch02', '--mode', 'batch', '--yes', '--max-polls', '1'],
      S.deps({ ...extra, transport: t })
    );
    const bDir = path.join(S.fx.records, 'runs', b.results[0].runId);
    fs.rmSync(path.join(bDir, TERM_PASS_RECORD));
    await expect(
      main(['resume', '--run', b.results[0].runId], S.deps({ ...extra, transport: t }))
    ).rejects.toThrow(/term-pass\.json/);
  });
});

// The runner review (2026-10-27): a chapter whose every response was truncated or refused
// still ended 'complete', so the next chapter was sent (spend-cap, high); and a run that did
// not end complete exited 0 like one that did (cli-ops, medium).
describe('run stops before the next chapter when a chapter answered unusably, and says so in its exit code', () => {
  function setupTwo() {
    const fx = makeTempRepo({ chapters: ['ch01', 'ch02'] });
    const lines = [];
    const deps = (extra = {}) => ({
      repoRoot: fx.root,
      bookDir: fx.book,
      recordsDir: fx.records,
      git: makeGit({ cwd: fx.root }),
      codePaths: ['tools/ai-review/prompts'],
      stdout: (s) => lines.push(s),
      now,
      ...HARNESS,
      ...extra,
    });
    return { fx, lines, deps };
  }
  const answering = (stopReason) => {
    const t = mockTransport();
    t.send = async (body) => {
      t.calls.send += 1;
      return messageFor(scriptedAnswer(body), { stopReason });
    };
    return t;
  };
  const TWO = ['run', '--chapter', 'ch01', '--chapter', 'ch02', '--mode', 'interactive', '--yes'];

  it('refused answers: ch01 ends complete with no usable response, so ch02 is never sent', async () => {
    const S = setupTwo();
    const r = await main(TWO, S.deps({ transport: answering('refusal') }));
    expect(r.results.map((x) => x.chapterDir)).toEqual(['ch01']);
    expect(r.results[0].status).toBe('complete');
    expect(r.results[0].counts.refusal).toBeGreaterThan(0);
    expect(r.exitCode).toBe(2);
    const out = S.lines.join('');
    expect(out).toMatch(/ch01: .*refusal [1-9]/);
    expect(out).toMatch(/stopping/);
  });

  it('truncated answers stop the run too, and exit 2', async () => {
    const S = setupTwo();
    const r = await main(TWO, S.deps({ transport: answering('max_tokens') }));
    expect(r.results.map((x) => x.chapterDir)).toEqual(['ch01']);
    expect(r.exitCode).toBe(2);
    expect(S.lines.join('')).toMatch(/truncated [1-9]/);
  });

  it('control: good answers send both chapters and exit 0', async () => {
    const S = setupTwo();
    const r = await main(TWO, S.deps({ transport: mockTransport() }));
    expect(r.results.map((x) => [x.chapterDir, x.status])).toEqual([
      ['ch01', 'complete'],
      ['ch02', 'complete'],
    ]);
    expect(r.exitCode).toBe(0);
  });

  it('a batch left pending exits 2 from run and from resume, and 0 once resume completes', async () => {
    const S = setup();
    const t = mockTransport({ batchStates: ['in_progress', 'in_progress', 'ended'] });
    const extra = { transport: t, sleep: async () => {}, pollIntervalMs: 0 };
    const r = await main(
      ['run', '--chapter', 'ch02', '--mode', 'batch', '--yes', '--max-polls', '1'],
      S.deps(extra)
    );
    expect(r.results[0].status).toBe('pending');
    expect(r.exitCode).toBe(2);
    const runId = r.results[0].runId;
    const again = await main(['resume', '--run', runId, '--max-polls', '1'], S.deps(extra));
    expect(again.status).toBe('pending');
    expect(again.exitCode).toBe(2);
    const done = await main(['resume', '--run', runId], S.deps(extra));
    expect(done.status).toBe('complete');
    expect(done.exitCode).toBe(0);
  });
});
