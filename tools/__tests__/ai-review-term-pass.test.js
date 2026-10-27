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
import { readLedger, reserve } from '../ai-review/ledger.js';
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
  TIO2_OPS,
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

// The runner review (2026-10-27, cli-ops medium): the outside-the-repository test compared
// path strings, so a symlink outside the repository that points into it admitted a write into
// the repository (it overwrote a READ-ONLY layer-1 file), and another checkout's books/ tree
// was admitted. The guard now judges where the write would land.
describe('--out and --report are judged by where the write would land', () => {
  const L1 = ['books', 'efnafraedi-2e', '02-mt-output', 'ch02', 'chapter-metadata-segments.is.md'];
  const linkTo = (target) => {
    const link = path.join(scratch(), 'link');
    fs.symlinkSync(target, link);
    return link;
  };

  it('refuses a path through a symlink outside the repository that points into it', async () => {
    const { deps, fx } = setup();
    const link = linkTo(fx.root);
    const layer1 = path.join(fx.root, ...L1);
    const before = fs.readFileSync(layer1);
    await expect(
      main(['plan', '--chapter', 'ch02', '--out', path.join(link, ...L1)], deps())
    ).rejects.toThrow(/outside the repository/);
    await expect(
      main(['plan', '--chapter', 'ch02', '--out', path.join(link, 'new.json')], deps())
    ).rejects.toThrow(/outside the repository/);
    expect(fs.readFileSync(layer1).equals(before)).toBe(true);
    expect(fx.sh(['status', '--porcelain', '--untracked-files=all'])).toBe('');
  });

  it('refuses a dangling symlink whose target would be created inside the repository', async () => {
    const { deps, fx } = setup();
    const leaf = path.join(scratch(), 'leaf.json');
    fs.symlinkSync(path.join(fx.root, 'planted.json'), leaf);
    await expect(main(['plan', '--chapter', 'ch02', '--out', leaf], deps())).rejects.toThrow(
      /resolves to nothing/
    );
    expect(fs.existsSync(path.join(fx.root, 'planted.json'))).toBe(false);
  });

  it('refuses a path into another tree through a books/ directory', async () => {
    const { deps } = setup();
    const other = path.join(scratch(), 'other-checkout', 'books', 'efnafraedi-2e', 'ch02');
    fs.mkdirSync(other, { recursive: true });
    const out = path.join(other, 'x.json');
    await expect(main(['plan', '--chapter', 'ch02', '--out', out], deps())).rejects.toThrow(
      /must not lie in a books\/ directory/
    );
    expect(fs.existsSync(out)).toBe(false);
  });

  it('--report through a symlink into the repository refuses too', async () => {
    const { deps, fx } = setup();
    const link = linkTo(fx.root);
    await expect(
      main(
        ['apply', '--chapter', 'ch02', '--run', 'no-such-run', '--report', path.join(link, 'r.md')],
        deps()
      )
    ).rejects.toThrow(/outside the repository/);
    expect(fs.existsSync(path.join(fx.root, 'r.md'))).toBe(false);
  });

  it('control: a plain scratch path, and a symlink to another scratch directory, still write', async () => {
    const { deps } = setup();
    const plain = path.join(scratch(), 'plan.json');
    await main(['plan', '--chapter', 'ch02', '--out', plain], deps());
    expect(JSON.parse(fs.readFileSync(plain, 'utf8')).book).toBe('efnafraedi-2e');
    const elsewhere = scratch();
    const link = linkTo(elsewhere);
    await main(['plan', '--chapter', 'ch02', '--out', path.join(link, 'via-link.json')], deps());
    expect(fs.existsSync(path.join(elsewhere, 'via-link.json'))).toBe(true);
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

// The runner review (2026-10-27, provenance-record medium): preflight compared only the input
// files present in the WORKING TREE with their blobs, so an input deleted from the tree, or
// added to it, went unseen, and a run recorded a layer1Commit whose tree held another unit set
// (apply at that commit then refused the run's own record as stale-inputs).
describe('preflight compares the chapter’s input listing with the layer-1 commit, both ways', () => {
  const preflightOnly = (S) =>
    main(['run', '--chapter', 'ch02', '--mode', 'batch'], S.deps({ transport: mockTransport() }));
  const inCh = (S, layer, name) => path.join(S.fx.book, layer, 'ch02', name);
  const missing = (rel) =>
    new RegExp(
      `${rel.replace(/[.]/g, '\\.')} is in commit [0-9a-f]+ but missing from the working tree`
    );

  it('control: a clean tree passes', async () => {
    const S = setup();
    const r = await preflightOnly(S);
    expect(r.sent).toBe(false);
    expect(r.layer1Commit).toBe(S.fx.commit);
  });

  it('refuses a whole module deleted from the tree (structure, layer 1, English)', async () => {
    const S = setup();
    fs.rmSync(inCh(S, '02-structure', 'm68693-structure.json'));
    fs.rmSync(inCh(S, '02-mt-output', 'm68693-segments.is.md'));
    fs.rmSync(inCh(S, '02-for-mt', 'm68693-segments.en.md'));
    await expect(preflightOnly(S)).rejects.toThrow(
      missing('02-mt-output/ch02/m68693-segments.is.md')
    );
  });

  it('refuses a deleted chapter-metadata layer-1 file', async () => {
    const S = setup();
    fs.rmSync(inCh(S, '02-mt-output', 'chapter-metadata-segments.is.md'));
    await expect(preflightOnly(S)).rejects.toThrow(
      missing('02-mt-output/ch02/chapter-metadata-segments.is.md')
    );
  });

  it('refuses a structure file deleted on its own', async () => {
    const S = setup();
    fs.rmSync(inCh(S, '02-structure', 'm68693-structure.json'));
    await expect(preflightOnly(S)).rejects.toThrow(
      missing('02-structure/ch02/m68693-structure.json')
    );
  });

  it('refuses an overlay committed at the layer-1 commit but deleted from the tree', async () => {
    const S = setup();
    const overlay = inCh(S, '02-mt-selected', 'm68693-selected.json');
    fs.mkdirSync(path.dirname(overlay), { recursive: true });
    fs.writeFileSync(overlay, '{}\n');
    S.fx.sh(['add', '--', overlay]);
    S.fx.sh(['commit', '-q', '-m', 'an overlay']);
    fs.rmSync(overlay);
    await expect(preflightOnly(S)).rejects.toThrow(
      missing('02-mt-selected/ch02/m68693-selected.json')
    );
  });

  it('refuses an extra untracked layer-1 file the commit does not have', async () => {
    const S = setup();
    fs.writeFileSync(
      inCh(S, '02-mt-output', 'm99999-segments.is.md'),
      '<!-- SEG:m99999:para:x -->\nx\n'
    );
    await expect(preflightOnly(S)).rejects.toThrow(
      /02-mt-output\/ch02\/m99999-segments\.is\.md is in the working tree but not in commit/
    );
  });
});

// The runner review (2026-10-27, spend-cap medium): the ledger lives in the checkout, so a
// linked git worktree had its own ledger and so its own USD 100. `run` refuses there; plan
// and apply spend nothing and stay allowed.
describe('run refuses from a linked git worktree; plan and apply do not', () => {
  function setupWorktree() {
    const S = setup();
    const wt = path.join(makeTempDir('tp-wt-'), 'wt');
    S.fx.sh(['worktree', 'add', '--detach', '-q', wt, 'HEAD']);
    const book = path.join(wt, 'books', 'efnafraedi-2e');
    const wtDeps = (extra = {}) =>
      S.deps({
        repoRoot: wt,
        bookDir: book,
        recordsDir: path.join(book, 'ai-review'),
        git: makeGit({ cwd: wt }),
        ...extra,
      });
    const remove = () => {
      try {
        S.fx.sh(['worktree', 'remove', '--force', wt]);
      } catch {
        // the fixture may already be gone; removeTempDirs deletes the directory anyway
      }
    };
    return { ...S, wt, wtBook: book, wtDeps, remove };
  }

  it('run --yes from a linked worktree refuses before sending or reserving anything', async () => {
    const W = setupWorktree();
    try {
      const t = mockTransport();
      await expect(
        main(
          ['run', '--chapter', 'ch02', '--mode', 'interactive', '--yes'],
          W.wtDeps({ transport: t })
        )
      ).rejects.toThrow(/linked-worktree/);
      expect(t.calls.send + t.calls.countTokens + t.calls.submitBatch).toBe(0);
      expect(fs.existsSync(path.join(W.wtBook, 'ai-review'))).toBe(false);
    } finally {
      W.remove();
    }
  });

  it('control: the same run from the main checkout sends and settles in its ledger', async () => {
    const W = setupWorktree();
    try {
      const t = mockTransport();
      const r = await main(
        ['run', '--chapter', 'ch02', '--mode', 'interactive', '--yes'],
        W.deps({ transport: t })
      );
      expect(r.results[0].status).toBe('complete');
      expect(t.calls.send).toBeGreaterThan(0);
      expect(readLedger(path.join(W.fx.records, 'ledger.jsonl')).length).toBeGreaterThan(0);
    } finally {
      W.remove();
    }
  });

  it('plan and apply (dry and --write) still work from a linked worktree', async () => {
    const W = setupWorktree();
    try {
      const out = path.join(scratch(), 'plan-wt.json');
      const p = await main(['plan', '--chapter', 'ch02', '--out', out], W.wtDeps());
      expect(p.rows[0].estimate.requests).toBeGreaterThan(0);
      // a run made in the main checkout, its records carried over as a commit would carry them
      const r = await main(
        ['run', '--chapter', 'ch02', '--mode', 'interactive', '--yes'],
        W.deps({ transport: mockTransport() })
      );
      const runId = r.results[0].runId;
      fs.cpSync(W.fx.records, path.join(W.wtBook, 'ai-review'), { recursive: true });
      const dry = await main(['apply', '--chapter', 'ch02', '--run', runId], W.wtDeps());
      expect(dry.result.counts.accepted).toBe(4);
      const w = await main(['apply', '--chapter', 'ch02', '--run', runId, '--write'], W.wtDeps());
      expect(w.result.coverage.complete).toBe(true);
      expect(fs.existsSync(path.join(W.wtBook, '02-mt-revised', 'ch02'))).toBe(true);
    } finally {
      W.remove();
    }
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

// The runner review (2026-10-27, cli-ops high + provenance-record medium): apply --write
// minted a complete layer-2 chapter from a run that reviewed nothing (stopped at the cap) or
// a sliver of the chapter (--limit), and no record said how much was never reviewed — so an
// unreviewed segment read exactly like one the model saw and left alone.
describe('apply measures coverage against the full plan, and --write refuses a partial chapter', () => {
  const coverageOf = (S) => {
    const out = S.lines.join('');
    const m = out.match(/coverage: (\d+) of (\d+) planned requests usable/);
    return m ? [Number(m[1]), Number(m[2])] : null;
  };

  it('a run stopped at the cap before sending anything covers nothing, and --write refuses', async () => {
    const S = setup();
    reserve({
      ledgerPath: path.join(S.fx.records, 'ledger.jsonl'),
      runId: 'someone-else',
      use: 'other-use',
      usd: 99.999,
      cap: 100,
      now,
    });
    const r = await main(
      ['run', '--chapter', 'ch02', '--mode', 'interactive', '--yes'],
      S.deps({ transport: mockTransport() })
    );
    expect(r.results[0].status).toBe('stopped-at-cap');
    const runId = r.results[0].runId;
    const dry = await main(['apply', '--chapter', 'ch02', '--run', runId], S.deps());
    expect(dry.result.coverage).toMatchObject({ requestsUsable: 0, complete: false });
    expect(dry.result.coverage.requestsPlanned).toBeGreaterThan(0);
    expect(coverageOf(S)[0]).toBe(0);
    await expect(
      main(['apply', '--chapter', 'ch02', '--run', runId, '--write'], S.deps())
    ).rejects.toThrow(/partial-coverage/);
    expect(fs.existsSync(path.join(S.fx.book, '02-mt-revised', 'ch02'))).toBe(false);
  });

  it('a --limit 1 run plans the whole chapter, covers one request, and --write refuses', async () => {
    const S = setup();
    const r = await main(
      ['run', '--chapter', 'ch02', '--mode', 'interactive', '--yes', '--limit', '1'],
      S.deps({ transport: mockTransport() })
    );
    const runId = r.results[0].runId;
    const tp = JSON.parse(
      fs.readFileSync(path.join(S.fx.records, 'runs', runId, TERM_PASS_RECORD), 'utf8')
    );
    expect(tp.requestKeys).toHaveLength(1);
    expect(tp.plannedRequestKeys.length).toBeGreaterThan(1);
    expect(tp.plannedRequestKeys).toContain(tp.requestKeys[0]);
    const dry = await main(['apply', '--chapter', 'ch02', '--run', runId], S.deps());
    expect(dry.result.coverage.requestsUsable).toBe(1);
    expect(dry.result.coverage.requestsMissing).toHaveLength(tp.plannedRequestKeys.length - 1);
    await expect(
      main(['apply', '--chapter', 'ch02', '--run', runId, '--write'], S.deps())
    ).rejects.toThrow(/partial-coverage/);
  });

  it('a truncated answer leaves its request uncovered, and --write refuses', async () => {
    const S = setup();
    const t = mockTransport();
    const send = t.send;
    t.send = async (body) => {
      if (t.calls.send === 0) {
        t.calls.send += 1;
        return messageFor(scriptedAnswer(body), { stopReason: 'max_tokens' });
      }
      return send(body);
    };
    const r = await main(
      ['run', '--chapter', 'ch02', '--mode', 'interactive', '--yes'],
      S.deps({ transport: t })
    );
    const runId = r.results[0].runId;
    const dry = await main(['apply', '--chapter', 'ch02', '--run', runId], S.deps());
    expect(dry.result.coverage.requestsMissing).toHaveLength(1);
    await expect(
      main(['apply', '--chapter', 'ch02', '--run', runId, '--write'], S.deps())
    ).rejects.toThrow(/partial-coverage/);
  });

  it('control: a full run covers every planned request, writes, and records the coverage', async () => {
    const S = setup();
    const r = await main(
      ['run', '--chapter', 'ch02', '--mode', 'interactive', '--yes'],
      S.deps({ transport: mockTransport() })
    );
    const runId = r.results[0].runId;
    const w = await main(['apply', '--chapter', 'ch02', '--run', runId, '--write'], S.deps());
    expect(w.result.coverage).toMatchObject({ requestsMissing: [], complete: true });
    expect(w.result.coverage.requestsUsable).toBe(w.result.coverage.requestsPlanned);
    const summary = JSON.parse(
      fs.readFileSync(path.join(S.fx.book, 'ai-review', 'applied', 'ch02', 'apply.json'), 'utf8')
    );
    expect(summary.coverage).toEqual(w.result.coverage);
  });

  it('refuses runs of one chapter that planned different requests', async () => {
    const S = setup();
    const run = () =>
      main(
        ['run', '--chapter', 'ch02', '--mode', 'interactive', '--yes'],
        S.deps({ transport: mockTransport() })
      );
    const a = (await run()).results[0].runId;
    const b = (await run()).results[0].runId;
    const f = path.join(S.fx.records, 'runs', b, TERM_PASS_RECORD);
    const tp = JSON.parse(fs.readFileSync(f, 'utf8'));
    tp.plannedRequestKeys = [...tp.plannedRequestKeys, 'ch02/m99999/r999'];
    fs.writeFileSync(f, JSON.stringify(tp));
    await expect(
      main(['apply', '--chapter', 'ch02', '--run', a, '--run', b], S.deps())
    ).rejects.toThrow(/mixed-runs/);
  });
});

// The same findings at apply level (layer2-integrity: the parser-side pre-fail was unpinned
// there too): through the CLI, with the real parser, gate and change records.
describe('apply withdraws a ruling the model flagged, and one whose op the parser converted', () => {
  const answerWith = (tio2) => (body) => {
    const a = scriptedAnswer(body);
    return {
      segments: a.segments.map((s) => (s.id === TIO2_ID ? { ...s, ...tio2 } : s)),
    };
  };
  async function applyWith(tio2) {
    const S = setup();
    const r = await main(
      ['run', '--chapter', 'ch02', '--mode', 'interactive', '--yes'],
      S.deps({ transport: mockTransport({ answer: answerWith(tio2) }) })
    );
    const a = await main(['apply', '--chapter', 'ch02', '--run', r.results[0].runId], S.deps());
    return a.result;
  }
  const tio2Changes = (result) =>
    result.units.flatMap((u) => u.changes).filter((ch) => ch.segmentId === TIO2_ID).length;

  for (const kind of ['compound-term', 'needs-rewrite', 'sense-unclear', 'target-other-sense']) {
    it(`a ${kind} flag on atom withdraws all four atom ops in that segment`, async () => {
      const result = await applyWith({ flags: [{ kind, ruling: 'atom', note: 'test' }] });
      expect(result.counts.rejectedByReason['flagged-no-edit']).toBe(4);
      expect(tio2Changes(result)).toBe(0);
      const logged = result.gateLog.filter((g) => g.kind === 'op' && g.segmentId === TIO2_ID);
      expect(logged.every((g) => g.by === 'runner' && g.flag === kind)).toBe(true);
    });
  }

  it('control: a mistranslation-suspected flag does not stop the term edits', async () => {
    const result = await applyWith({
      flags: [{ kind: 'mistranslation-suspected', ruling: 'atom', note: 'test' }],
    });
    expect(result.counts.accepted).toBe(4);
    expect(tio2Changes(result)).toBeGreaterThan(0);
  });

  it('an op the parser turns into a sense-unclear flag withdraws its siblings as group-incomplete', async () => {
    const result = await applyWith({
      ops: TIO2_OPS.map((o, i) => (i === 0 ? { ...o, sense: 'unclear' } : o)),
    });
    expect(result.counts.accepted).toBe(0);
    expect(result.counts.rejectedByReason['group-incomplete']).toBe(3);
    expect(tio2Changes(result)).toBe(0);
  });
});
