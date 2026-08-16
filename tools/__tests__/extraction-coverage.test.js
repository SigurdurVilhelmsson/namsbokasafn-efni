import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  emittedElementIds,
  parseModuleDoc,
  checkLists,
  checkDuplicateSegIds,
  analyzeModule,
  altReachability,
  checkAltCoverage,
} from '../lib/extraction-coverage.js';

const TOOLS = path.resolve(import.meta.dirname, '..');

const doc = (contentInner) =>
  `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">` +
  `<content>${contentInner}</content></document>`;
const seg = (...ids) => ids.map((id) => `<!-- SEG:m:${id} -->\nx`).join('\n');

describe('emittedElementIds', () => {
  it('extracts the 3rd colon-component of each marker', () => {
    const ids = emittedElementIds(seg('item:L1-item-1', 'para:fs-1'));
    expect(ids.has('L1-item-1')).toBe(true);
    expect(ids.has('fs-1')).toBe(true);
  });
});

describe('checkLists', () => {
  it('R1: flags a list whose items are all dropped (0 of 4 emitted)', () => {
    const { content } = parseModuleDoc(
      doc(
        '<list id="L1"><item>monomers</item><item>polymers</item>' +
          '<item>water and polymers</item><item>none of the above</item></list>'
      )
    );
    const f = checkLists(content, emittedElementIds(seg('para:fs-stem')));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ listId: 'L1', items: 4, present: 0 });
    expect(f[0].missing).toContain('none of the above');
  });

  it('R2: flags a partial drop (3 of 4 emitted)', () => {
    const { content } = parseModuleDoc(
      doc('<list id="L1"><item>a</item><item>b</item><item>c</item><item>d</item></list>')
    );
    const f = checkLists(
      content,
      emittedElementIds(seg('item:L1-item-1', 'item:L1-item-2', 'item:L1-item-3'))
    );
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ items: 4, present: 3 });
  });

  it('G1: passes a fully-emitted list (6 of 6) — the m68710 id-orphan case', () => {
    const { content } = parseModuleDoc(
      doc(
        '<list id="S"><item>a</item><item>b</item><item>c</item>' +
          '<item>d</item><item>e</item><item>f</item></list>'
      )
    );
    const emitted = emittedElementIds(
      seg(
        'item:S-item-1',
        'item:S-item-2',
        'item:S-item-3',
        'item:S-item-4',
        'item:S-item-5',
        'item:S-item-6'
      )
    );
    expect(checkLists(content, emitted)).toHaveLength(0);
  });

  it('G3: passes items carrying their own ids', () => {
    const { content } = parseModuleDoc(
      doc('<list id="L1"><item id="own-1">a</item><item id="own-2">b</item></list>')
    );
    expect(checkLists(content, emittedElementIds(seg('item:own-1', 'item:own-2')))).toHaveLength(0);
  });

  it('skips an id-less list (cannot compute expected id -> no false flag)', () => {
    const { content } = parseModuleDoc(doc('<list><item>a</item><item>b</item></list>'));
    expect(checkLists(content, emittedElementIds(seg()))).toHaveLength(0);
  });

  // --- container & nesting edge cases (adversarial review, wf_72c60b9a) ---

  it('does NOT flag a list nested in a table <entry> (flattened into the entry segment, no -item-N emitted)', () => {
    const { content } = parseModuleDoc(
      doc(
        '<table id="T"><tgroup><tbody><row><entry>' +
          '<list id="EL"><item>RNA</item><item>DNA</item></list>' +
          '</entry></row></tbody></tgroup></table>'
      )
    );
    // The extractor emits one entry segment (auto-N), never EL-item-*.
    expect(checkLists(content, emittedElementIds(seg('entry:auto-1')))).toHaveLength(0);
  });

  it('does NOT flag an outer item whose only content is a nested list (extractor emits null for it)', () => {
    const { content } = parseModuleDoc(
      doc(
        '<list id="L"><item>lead text</item>' +
          '<item><list id="L2"><item>inner</item></list></item></list>'
      )
    );
    // Extractor emits L-item-1 (lead text) + L2-item-1 (inner), NOT L-item-2 (text-less).
    expect(
      checkLists(content, emittedElementIds(seg('item:L-item-1', 'item:L2-item-1')))
    ).toHaveLength(0);
  });

  it('preserves item numbering across a skipped text-less item (uses full index, not emitted index)', () => {
    const { content } = parseModuleDoc(
      doc(
        '<list id="L"><item>one</item>' +
          '<item><list id="L2"><item>x</item></list></item>' +
          '<item>three</item></list>'
      )
    );
    // three is the 3rd item -> L-item-3 (index counts the skipped item2). Present => no flag.
    const emitted = emittedElementIds(seg('item:L-item-1', 'item:L-item-3', 'item:L2-item-1'));
    expect(checkLists(content, emitted)).toHaveLength(0);
  });

  it('G2: isolates a dropped list from a clean sibling list (only the dropped one flags)', () => {
    const { content } = parseModuleDoc(
      doc(
        '<list id="A"><item>a1</item><item>a2</item></list>' +
          '<list id="B"><item>b1</item><item>b2</item></list>'
      )
    );
    const f = checkLists(content, emittedElementIds(seg('item:A-item-1', 'item:A-item-2')));
    expect(f).toHaveLength(1);
    expect(f[0].listId).toBe('B');
  });

  it('orphan-immune: an item with an inner <para id> is covered by item:S-item-N, never the inner id', () => {
    const { content } = parseModuleDoc(
      doc(
        '<list id="S"><item><para id="inner-1">write</para></item>' +
          '<item><para id="inner-2">each</para></item></list>'
      )
    );
    // inner-1/inner-2 are NOT emitted (the m68710 orphan shape); item:S-item-* ARE.
    expect(
      checkLists(content, emittedElementIds(seg('item:S-item-1', 'item:S-item-2')))
    ).toHaveLength(0);
  });
});

describe('checkDuplicateSegIds', () => {
  it('flags a source id that defines two elements in <content>', () => {
    const { content } = parseModuleDoc(doc('<para id="dup">a</para><para id="dup">b</para>'));
    const r = checkDuplicateSegIds(content, '');
    expect(r.sourceDup).toEqual([{ id: 'dup', count: 2 }]);
  });

  it('flags a raw seg marker that repeats (parseSegmentsMap would dedupe it)', () => {
    const { content } = parseModuleDoc(doc('<para id="a">x</para>'));
    const segText = '<!-- SEG:m:para:a -->\nx\n<!-- SEG:m:para:a -->\ny';
    const r = checkDuplicateSegIds(content, segText);
    expect(r.rawDup).toEqual([
      { segId: 'm:para:a', count: 2, kind: 'real', sampleA: 'x', sampleB: 'y' },
    ]);
  });

  it('reports nothing on a clean module', () => {
    const { content } = parseModuleDoc(doc('<para id="a">x</para>'));
    const r = checkDuplicateSegIds(content, '<!-- SEG:m:para:a -->\nx');
    expect(r.sourceDup).toHaveLength(0);
    expect(r.rawDup).toHaveLength(0);
  });
});

describe('analyzeModule', () => {
  it('aggregates list + dup findings and sets hasFindings', () => {
    const cnxml = doc('<list id="L1"><item>a</item><item>b</item></list>');
    const r = analyzeModule(cnxml, seg('para:other'));
    expect(r.listFindings).toHaveLength(1);
    expect(r.hasFindings).toBe(true);
  });

  it('hasFindings is false for a clean module', () => {
    const cnxml = doc('<list id="L1"><item>a</item></list>');
    const r = analyzeModule(cnxml, seg('item:L1-item-1'));
    expect(r.hasFindings).toBe(false);
  });
});

describe('altReachability — the four positions cnxml-extract never visits (§C81 shortfall)', () => {
  const wrap = (inner) => `<document><content>${inner}</content></document>`;
  const reach = (inner) => altReachability(parseModuleDoc(wrap(inner)).content);

  it('counts a figure-wrapped media as reachable', () => {
    const r = reach('<figure id="f1"><media alt="mynd"><image src="a.png"/></media></figure>');
    expect(r).toMatchObject({ reachable: 1, unreachable: 0 });
  });

  it('counts a media in a table entry, outside a figure, as unreachable', () => {
    const r = reach(
      '<table><row><entry><media alt="mynd"><image src="a.png"/></media></entry></row></table>'
    );
    expect(r.unreachable).toBe(1);
    expect(r.unreachableByReason['entry-not-in-figure']).toBe(1);
  });

  it('counts a figure-wrapped media INSIDE a table entry as reachable', () => {
    // The predicate is "in an entry AND not in a figure" — the figure wrapper rescues it.
    const r = reach(
      '<table><row><entry><figure id="f1"><media alt="mynd"><image src="a.png"/></media></figure></entry></row></table>'
    );
    expect(r).toMatchObject({ reachable: 1, unreachable: 0 });
  });

  for (const parent of ['example', 'problem', 'solution', 'note']) {
    it(`counts a bare media directly in <${parent}> as unreachable`, () => {
      const r = reach(
        `<${parent} id="x"><media alt="mynd"><image src="a.png"/></media></${parent}>`
      );
      expect(r.unreachable).toBe(1);
      expect(r.unreachableByReason[`bare-media-in-${parent}`]).toBe(1);
    });

    it(`counts a FIGURE-wrapped media in <${parent}> as reachable`, () => {
      const r = reach(
        `<${parent} id="x"><figure id="f1"><media alt="mynd"><image src="a.png"/></media></figure></${parent}>`
      );
      expect(r).toMatchObject({ reachable: 1, unreachable: 0 });
    });
  }

  it('ignores media with no alt and media with an empty alt', () => {
    const r = reach(
      '<figure id="f1"><media><image src="a.png"/></media></figure><figure id="f2"><media alt=""><image src="b.png"/></media></figure>'
    );
    expect(r).toMatchObject({ reachable: 0, unreachable: 0 });
  });

  it('reads alt from a child <image> when the <media> carries none', () => {
    const r = reach('<figure id="f1"><media><image src="a.png" alt="mynd"/></media></figure>');
    expect(r.reachable).toBe(1);
  });

  it('is not fooled by an INDIRECT example parent', () => {
    // Only a DIRECT <media> child of these containers is unreachable; one wrapped
    // in a <para> reaches the extractor through the para's inline-media flatten.
    const r = reach(
      '<example id="e1"><para id="p1"><media alt="mynd"><image src="a.png"/></media></para></example>'
    );
    expect(r).toMatchObject({ reachable: 1, unreachable: 0 });
  });
});

describe('checkAltCoverage — three numbers, gates on one', () => {
  const wrap = (inner) => `<document><content>${inner}</content></document>`;
  const SRC = wrap(
    '<figure id="f1"><media alt="fyrsta"><image src="a.png"/></media></figure>' +
      '<figure id="f2"><media alt="önnur"><image src="b.png"/></media></figure>' +
      '<example id="e1"><media alt="ónáanleg"><image src="c.png"/></media></example>'
  );

  it('passes when every reachable alt was emitted, and reports the unreached', () => {
    const seg = '<!-- SEG:m1:alt:f1-alt -->\nfyrsta\n\n<!-- SEG:m1:alt:f2-alt -->\nönnur\n';
    const r = checkAltCoverage(parseModuleDoc(SRC).content, seg);
    expect(r).toMatchObject({ reached: 2, expected: 2, unreached: 1, ok: true });
  });

  it('fails when a reachable alt was dropped', () => {
    const seg = '<!-- SEG:m1:alt:f1-alt -->\nfyrsta\n';
    const r = checkAltCoverage(parseModuleDoc(SRC).content, seg);
    expect(r).toMatchObject({ reached: 1, expected: 2, ok: false });
  });

  it('fails when MORE alt segments were emitted than the source has reachable alts', () => {
    // The duplicate-emission direction §C81 Task 10 closed. Equality, not >=.
    const seg =
      '<!-- SEG:m1:alt:f1-alt -->\nfyrsta\n\n<!-- SEG:m1:alt:f2-alt -->\nönnur\n\n<!-- SEG:m1:alt:media-0-alt -->\nafrit\n';
    const r = checkAltCoverage(parseModuleDoc(SRC).content, seg);
    expect(r).toMatchObject({ reached: 3, expected: 2, ok: false });
  });

  it('reports the examined count even on a figure-less module, so a pass is not vacuous', () => {
    const r = checkAltCoverage(
      parseModuleDoc(wrap('<para id="p1">engar myndir</para>')).content,
      ''
    );
    expect(r).toMatchObject({ reached: 0, expected: 0, unreached: 0, ok: true });
  });
});

const CLI = path.join(TOOLS, 'verify-extraction-coverage.js');

/** Run the CLI, returning { code, stdout }. Never throws on a non-zero exit. */
function runCli(cliArgs) {
  try {
    const stdout = execFileSync('node', [CLI, ...cliArgs], {
      cwd: path.resolve(TOOLS, '..'),
      encoding: 'utf8',
    });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status, stdout: e.stdout || '' };
  }
}

/** Seed a hermetic book tree under a temp --root: { 'ch01/mX': {cnxml, seg} }. */
function seedBook(slug, modules) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'covgate-'));
  for (const [rel, { cnxml, seg: segText }] of Object.entries(modules)) {
    const [dir, mod] = rel.split('/');
    mkdirSync(path.join(root, 'books', slug, '01-source', dir), { recursive: true });
    mkdirSync(path.join(root, 'books', slug, '02-for-mt', dir), { recursive: true });
    writeFileSync(path.join(root, 'books', slug, '01-source', dir, `${mod}.cnxml`), cnxml);
    writeFileSync(
      path.join(root, 'books', slug, '02-for-mt', dir, `${mod}-segments.en.md`),
      segText
    );
  }
  return root;
}

describe('verify-extraction-coverage CLI', () => {
  it('CLI source has no filesystem write calls (read-only invariant)', () => {
    const src = readFileSync(CLI, 'utf8');
    expect(src).not.toMatch(
      /\b(writeFileSync|appendFileSync|rmSync|unlinkSync|mkdirSync|renameSync)\b/
    );
    expect(src).not.toMatch(/fs\.(write|append|mkdir|rm|unlink|rename|copy|truncate)/);
  });

  it('runs end-to-end on the real biology corpus and emits valid JSON (survives future fixes)', () => {
    const { code, stdout } = runCli(['--book', 'liffraedi-2e', '--chapter', '3', '--json']);
    expect([0, 1]).toContain(code);
    const report = JSON.parse(stdout); // full payload flushed (process.exitCode, not process.exit)
    expect(report.summary).toBeDefined();
    expect(report.book).toBe('liffraedi-2e');
  });

  it('exits 1 and flags a dropped option list (hermetic --root)', () => {
    const root = seedBook('covtest', {
      'ch01/mDrop': {
        cnxml: doc('<list id="L1"><item>a</item><item>b</item><item>c</item><item>d</item></list>'),
        seg: seg('para:stem'),
      },
    });
    try {
      const { code, stdout } = runCli(['--book', 'covtest', '--root', root, '--json']);
      expect(code).toBe(1);
      const report = JSON.parse(stdout);
      expect(report.modules.mDrop.listFindings[0]).toMatchObject({ listId: 'L1', present: 0 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('exits 0 on a clean module (hermetic --root)', () => {
    const root = seedBook('covtest', {
      'ch01/mClean': {
        cnxml: doc('<list id="L1"><item>a</item><item>b</item></list>'),
        seg: seg('item:L1-item-1', 'item:L1-item-2'),
      },
    });
    try {
      const { code, stdout } = runCli(['--book', 'covtest', '--root', root, '--json']);
      expect(code).toBe(0);
      expect(JSON.parse(stdout).summary.modulesWithFindings).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('exits 1 and reports a duplicate seg-id (hermetic --root)', () => {
    const root = seedBook('covtest', {
      'ch01/mDup': {
        cnxml: doc('<para id="a">x</para>'),
        seg: '<!-- SEG:mDup:para:a -->\nx\n<!-- SEG:mDup:para:a -->\ny',
      },
    });
    try {
      const { code, stdout } = runCli(['--book', 'covtest', '--root', root, '--json']);
      expect(code).toBe(1);
      expect(JSON.parse(stdout).modules.mDup.dupFindings.rawDup[0].segId).toBe('mDup:para:a');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('separates a real dup from a benign dup within the same module (mixed --root)', () => {
    const root = seedBook('covtest', {
      'ch01/mMix': {
        cnxml: doc('<para id="bng">same</para><para id="rl">alpha</para>'),
        seg:
          '<!-- SEG:mMix:para:bng -->\nsame\n<!-- SEG:mMix:para:bng -->\nsame\n' +
          '<!-- SEG:mMix:para:rl -->\nalpha\n<!-- SEG:mMix:para:rl -->\nbeta gamma',
      },
    });
    try {
      const { code, stdout } = runCli(['--book', 'covtest', '--root', root, '--json']);
      expect(code).toBe(1); // the real dup fails the gate
      const report = JSON.parse(stdout);
      expect(report.summary.duplicateSegIds).toBe(1); // only the real dup counted
      expect(report.summary.benignDuplicateSegIds).toBe(1); // the benign dup tallied separately

      // Human-mode print loop: the real dup gets a finding line, the benign one doesn't.
      const human = runCli(['--book', 'covtest', '--root', root]);
      expect(human.stdout).toContain('mMix:para:rl');
      expect(human.stdout).not.toContain('mMix:para:bng');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('isolates a malformed cnxml: records the parse error and still checks the rest of the batch', () => {
    const root = seedBook('covtest', {
      'ch01/mBad': { cnxml: '<document><content><para id="x">unclosed', seg: seg('para:x') },
      'ch01/mDrop': {
        cnxml: doc('<list id="L1"><item>a</item><item>b</item></list>'),
        seg: seg('para:stem'),
      },
    });
    try {
      const { code, stdout } = runCli(['--book', 'covtest', '--root', root, '--json']);
      expect(code).toBe(1); // batch not aborted
      const report = JSON.parse(stdout);
      expect(report.modules.mDrop.listFindings).toHaveLength(1); // the good-but-dropped module still checked
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails loud when 01-source is absent (no false green)', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'covgate-'));
    mkdirSync(path.join(root, 'books', 'covtest', '02-for-mt', 'ch01'), { recursive: true });
    writeFileSync(
      path.join(root, 'books', 'covtest', '02-for-mt', 'ch01', 'mX-segments.en.md'),
      seg('item:L1-item-1')
    );
    try {
      const { code } = runCli(['--book', 'covtest', '--root', root]);
      expect(code).toBe(1); // absent 01-source is loud, not a silent clean pass
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('writes nothing under the target book tree (read-only, mtime unchanged)', () => {
    const root = seedBook('covtest', {
      'ch01/mDrop': {
        cnxml: doc('<list id="L1"><item>a</item><item>b</item></list>'),
        seg: seg('para:stem'),
      },
    });
    const target = path.join(root, 'books', 'covtest');
    const before = statSync(path.join(target, '01-source', 'ch01', 'mDrop.cnxml')).mtimeMs;
    try {
      runCli(['--book', 'covtest', '--root', root, '--json']);
      const after = statSync(path.join(target, '01-source', 'ch01', 'mDrop.cnxml')).mtimeMs;
      expect(after).toBe(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
