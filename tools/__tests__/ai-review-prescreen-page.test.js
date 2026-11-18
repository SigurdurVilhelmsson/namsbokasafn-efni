/**
 * The private review page's data (c19; spec §8): only flagged rows, MT stem counts, path guards.
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildPageData, main, chapterDirOf } from '../ai-review/prescreen-page.js';
import { REPO_ROOT } from '../ai-review/config.js';

const vrow = (id, verdict, extra = {}) => ({
  id,
  english: `en-${id}`,
  icelandic: 'hvarfast',
  group: 'chemistry',
  verdict,
  kind: verdict === 'flag' ? 'wrong-sense' : null,
  reason: verdict === 'flag' ? 'why' : null,
  proposed: [],
  rightSenses: null,
  sentences: ['A sentence.'],
  ...extra,
});
const crow = (id, matches) => ({
  english: `en-${id}`,
  icelandic: 'hvarfast',
  alternatives: ['other'],
  ifRemoved: { text: 'next', domain: 'chemistry' },
  matchCount: matches.length,
  matches,
});
const seg = (n) => ({ chapter: 1, moduleId: 'm1', segmentId: `p:x:s${n}` });

describe('buildPageData', () => {
  const verdicts = {
    population: [
      vrow('r1', 'fine'),
      vrow('r2', 'flag', { proposed: ['bregðast'] }),
      vrow('r3', 'unjudged'),
    ],
  };
  const privateCensus = {
    rows: [crow('r1', [seg(1)]), crow('r2', [seg(1), seg(2), seg(3)]), crow('r3', [])],
  };
  const texts = {
    s1: 'Efnið hvarfast við sýru.',
    s2: 'Ekkert hér.',
    s3: 'Þau hvarfast og bregðast.',
  };
  const mtTextFor = (c, m, s) => texts[s.split(':')[2]] ?? null;
  const data = buildPageData({ verdicts, privateCensus, mtTextFor });

  it('keeps only flagged rows', () => {
    expect(data.rows.map((r) => r.id)).toEqual(['r2']);
  });
  it('counts a word present in 2 of 3 matching segments as 2', () => {
    expect(data.rows[0].mt.current).toBe(2);
  });
  it('counts each proposed word by its stem', () => {
    expect(data.rows[0].mt.proposed).toEqual({ bregðast: 1 });
  });
  it('carries the private evidence and says the count is a stem match', () => {
    expect(data.rows[0].alternatives).toEqual(['other']);
    expect(data.instrumentNote).toMatch(/stem match/);
  });
  it('fails closed on a flagged row missing from the census', () => {
    expect(() => buildPageData({ verdicts, privateCensus: { rows: [] }, mtTextFor })).toThrow(
      /not in the census/
    );
  });
});

describe('chapterDirOf', () => {
  it('follows ruling P1', () => {
    expect([chapterDirOf(1), chapterDirOf(0), chapterDirOf(-1)]).toEqual([
      'ch01',
      'ch00',
      'appendices',
    ]);
  });
});

describe('main path guards', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'page-'));
  const census = path.join(tmp, 'census.json');
  fs.writeFileSync(census, '{"rows":[]}');
  const v = 'experiments/terminology-consistency/results/x/prescreen-verdicts.json';
  const run = (args) => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = main(args);
    err.mockRestore();
    return code;
  };
  it('refuses an --out inside the repository', () => {
    expect(
      run(['--verdicts', v, '--census-private', census, '--out', path.join(REPO_ROOT, 'p.json')])
    ).toBe(1);
  });
  it('refuses a --census-private inside the repository', () => {
    const inside = path.join(REPO_ROOT, 'package.json');
    expect(
      run(['--verdicts', v, '--census-private', inside, '--out', path.join(tmp, 'o.json')])
    ).toBe(1);
  });
  it('refuses --verdicts outside the results directory', () => {
    expect(
      run([
        '--verdicts',
        'package.json',
        '--census-private',
        census,
        '--out',
        path.join(tmp, 'o.json'),
      ])
    ).toBe(1);
  });
  it('refuses an unknown flag', () => {
    expect(run(['--bogus', '1'])).toBe(1);
  });
});
