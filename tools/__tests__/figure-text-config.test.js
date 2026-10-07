import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import {
  FIGURE_TEXT_CONFIG,
  loadFigureTextConfig,
  retiredFigureNames,
  loadRetiredFigures,
  normkey,
  COMPOSER_PIXEL_TABLES,
  composerTablesFingerprint,
} from '../lib/figure-text-config.js';

const { COMPOSER_VERSION, sidecarPath } = createRequire(import.meta.url)(
  '../lib/figure-text-sidecar.cjs'
);
const BOOKS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'books');
/** Does any book carry a COMMITTED sidecar for this basename? (the fingerprint's scope, G6) */
const committedSidecar = (b) =>
  fs.readdirSync(BOOKS).some((book) => fs.existsSync(sidecarPath(path.join(BOOKS, book), b)));

describe('figure-text-config (§C140 ㊵)', () => {
  it('points at the committed figure config', () => {
    expect(
      FIGURE_TEXT_CONFIG.endsWith(
        path.join('experiments', 'figure-text-translation', 'figure-text.config.json')
      )
    ).toBe(true);
    expect(Array.isArray(loadFigureTextConfig().editionPrecedence)).toBe(true);
  });

  it("the committed config carries its policy tables as plain objects (keptCopies, heldBlockValues: §C140 ㊾; anchorExclusions: §C140 '6' R-20; artworkEdits: §C140 '6' R-15a)", () => {
    const cfg = loadFigureTextConfig();
    for (const key of [
      'retiredFigures',
      'keptCopies',
      'artworkPins',
      'heldBlockValues',
      'anchorExclusions',
      'artworkEdits',
    ]) {
      const t = cfg[key];
      expect(t !== null && typeof t === 'object' && !Array.isArray(t), key).toBe(true);
    }
  });

  // §C140 ㊾ D5(a) — the doc string is where a later operator learns what a held value is and how
  // a change to one reaches readers. It must cite where values come from, and it must name the ONE
  // sanctioned route for a sidecar figure (the next COMPOSER_VERSION bump) without prescribing any
  // other: the register and the step-2 spec say never --force, and any other route needs a ruling.
  it('documents heldBlockValues: the value sheet, the COMPOSER_VERSION route, and no --force recipe', () => {
    const doc = loadFigureTextConfig()._heldBlockValues;
    expect(typeof doc).toBe('string');
    expect(doc).toContain('docs/handoffs/2026-10-03-step2-value-sheet.md');
    expect(doc).toContain('₀₁₂₃₄₅₆₇₈₉₊₋⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻');
    expect(doc).toMatch(/next COMPOSER_VERSION bump/);
    expect(doc).toMatch(/\[USER\] ruling/);
    expect(doc).not.toMatch(/--force/);
    expect(doc).toMatch(/COMPOSER_TABLES_PIN/);
  });

  // §C140 '6' M7 — a box that also holds another block's source line is a SHARED box, which
  // figcontainers lays out on the cell path (cls 'cell', why '+shared'), so heldplan's box-multiline
  // guard refuses a multi-line value only in an UNSHARED box. The operator-facing contract must say
  // so, or an operator concludes a value that compose plans and draws can never be applied.
  it('documents heldBlockValues: box-multiline refuses only an unshared box (M7)', () => {
    const doc = loadFigureTextConfig()._heldBlockValues;
    expect(doc).toMatch(/a multi-line block in an unshared box \(a shared box, §C140 '6' M7/);
  });

  // §C140 '6' R-20 — the doc string is where a later operator learns what an exclusion does and how a
  // change to one reaches readers: the ruling, M1 only, every block of the key, the same COMPOSER_VERSION
  // route as heldBlockValues, and no --force recipe.
  it('documents anchorExclusions: R-20, M1 only, the COMPOSER_VERSION route, and no --force recipe', () => {
    const doc = loadFigureTextConfig()._anchorExclusions;
    expect(typeof doc).toBe('string');
    expect(doc).toContain('R-20');
    expect(doc).toMatch(/turns off M1 and nothing else, for EVERY block that carries that key/);
    expect(doc).toMatch(/OUTSIDE renderHash and composedVersion/);
    expect(doc).toMatch(/next COMPOSER_VERSION bump/);
    expect(doc).toMatch(/\[USER\] ruling/);
    expect(doc).not.toMatch(/--force/);
    expect(doc).toMatch(/COMPOSER_TABLES_PIN/);
  });

  // §C140 '6' R-15a — the doc string is where an operator learns what an artwork edit is: the four ops,
  // where they are applied (figure-prepare.py, on the STAGED PDF), the coordinate frame, the same
  // COMPOSER_VERSION route as heldBlockValues, the pin that enforces it, and no --force recipe.
  it('documents artworkEdits: the four ops, figure-prepare.py, PDF page space, the COMPOSER_VERSION route, no --force', () => {
    const doc = loadFigureTextConfig()._artworkEdits;
    expect(typeof doc).toBe('string');
    for (const op of ['move-paths', 'move-edge', 'move-text', 'move-line-end'])
      expect(doc, op).toContain(op);
    expect(doc).toContain('figure-prepare.py');
    expect(doc).toContain('PDF page space');
    expect(doc).toMatch(/next COMPOSER_VERSION bump/);
    expect(doc).toMatch(/\[USER\] ruling/);
    expect(doc).toMatch(/COMPOSER_TABLES_PIN/);
    expect(doc).not.toMatch(/--force/);
    expect(doc).not.toMatch(/PROTOTYPE/i);
  });

  // §C140 '6' G6 — THE PIXEL-TABLE PIN. heldBlockValues, artworkEdits and anchorExclusions change a
  // figure's composed pixels while sitting OUTSIDE renderHash and composedVersion, so nothing marks a
  // figure stale when one of them changes. Their documented route for a figure WITH a sidecar is the
  // next COMPOSER_VERSION bump; this pin is what makes a change that skips that route go red. It
  // fingerprints only entries whose figure has a COMMITTED sidecar: a textless figure is recomposed on
  // every --stale run, so its entry legitimately changes without a bump.
  //
  // ▶ A RED HERE HAS EXACTLY TWO LEGAL RESPONSES:
  //   1. bump COMPOSER_VERSION (tools/lib/figure-text-sidecar.cjs) and add the new version's entry
  //      below, in the bump commit; or
  //   2. re-pin the SAME version, only when the change cannot alter a sidecar figure's composed pixels:
  //      an entry removed because its figure entered keptCopies or retiredFigures, an empty table
  //      added, or a figure newly bought (it is composed fresh with the current tables). Say which in
  //      the commit message; the diff of this table is what a reviewer reads.
  const COMPOSER_TABLES_PIN = {
    // '5' (§C140 '6' PR-A, G6): the tables as COMPOSER_VERSION '5' composes them; artworkEdits and
    // anchorExclusions are empty ('44136fa355b3678a' is the digest of {}).
    5: {
      heldBlockValues: '8217bf1ea07a317c',
      artworkEdits: '44136fa355b3678a',
      anchorExclusions: '44136fa355b3678a',
    },
  };

  it('COMPOSER_PIXEL_TABLES names the three pixel tables', () => {
    expect(COMPOSER_PIXEL_TABLES).toEqual(['heldBlockValues', 'artworkEdits', 'anchorExclusions']);
  });

  it('PIN: the committed pixel tables are the ones pinned for this COMPOSER_VERSION', () => {
    const pin = COMPOSER_TABLES_PIN[COMPOSER_VERSION];
    expect(pin, `add the '${COMPOSER_VERSION}' pin in the bump commit`).toBeDefined();
    const fp = composerTablesFingerprint(loadFigureTextConfig(), { hasSidecar: committedSidecar });
    for (const t of COMPOSER_PIXEL_TABLES) {
      expect(
        fp.tables[t],
        `${t} changed under COMPOSER_VERSION '${COMPOSER_VERSION}' — bump it, or re-pin only for a change that cannot alter a sidecar figure's pixels (see above)`
      ).toBe(pin[t]);
    }
  });

  it('NON-VACUITY: the scope holds the held figures WITH a sidecar and leaves out the textless ones', () => {
    const cfg = loadFigureTextConfig();
    const fp = composerTablesFingerprint(cfg, { hasSidecar: committedSidecar });
    const held = Object.keys(cfg.heldBlockValues).sort();
    expect(fp.scoped.heldBlockValues.length).toBeGreaterThan(0);
    expect(fp.scoped.heldBlockValues.length).toBeLessThan(held.length);
    expect(fp.scoped.heldBlockValues).toEqual(held.filter(committedSidecar));
  });

  describe('composerTablesFingerprint — controls', () => {
    const base = () => structuredClone(loadFigureTextConfig());
    const fpOf = (cfg) => composerTablesFingerprint(cfg, { hasSidecar: committedSidecar });
    const cfg0 = base();
    const held = Object.keys(cfg0.heldBlockValues);
    const withSidecar = held.find(committedSidecar);
    const textless = held.find((b) => !committedSidecar(b));
    // Lazily: computed at collection time, a missing helper would fail the whole file, not these cases.
    const fp0 = () => fpOf(cfg0);

    it('PRECONDITION: the committed table has a held figure with a sidecar and one without', () => {
      expect(withSidecar).toBeDefined();
      expect(textless).toBeDefined();
      expect(fp0().digest).toMatch(/^[0-9a-f]{16}$/);
    });

    it.each([
      [
        'heldBlockValues: a sidecar figure’s value',
        'heldBlockValues',
        (c) => {
          const e = c.heldBlockValues[withSidecar];
          e[Object.keys(e)[0]] += ' QZX';
        },
      ],
      [
        'artworkEdits: an entry for a sidecar figure',
        'artworkEdits',
        (c) => {
          c.artworkEdits = { [withSidecar]: [{ op: 'move-paths', dx: 1, select: [] }] };
        },
      ],
      [
        'anchorExclusions: an entry for a sidecar figure',
        'anchorExclusions',
        (c) => {
          c.anchorExclusions = { [withSidecar]: { 'a|b': 'QZX reason' } };
        },
      ],
    ])('a change in %s moves the digest and names its table', (_label, table, mutate) => {
      const c = base();
      mutate(c);
      const fp = fpOf(c);
      const f0 = fp0();
      expect(fp.digest).not.toBe(f0.digest);
      expect(COMPOSER_PIXEL_TABLES.filter((t) => fp.tables[t] !== f0.tables[t])).toEqual([table]);
    });

    it.each([
      [
        'a textless figure’s held value (recomposed on every --stale run)',
        (c) => {
          const e = c.heldBlockValues[textless];
          e[Object.keys(e)[0]] += ' QZX';
        },
      ],
      [
        'retiredFigures',
        (c) => {
          c.retiredFigures.CNX_QZX = 'x';
        },
      ],
      [
        '_README',
        (c) => {
          c._README += ' QZX';
        },
      ],
      [
        '_heldBlockValues',
        (c) => {
          c._heldBlockValues += ' QZX';
        },
      ],
      [
        '_artworkEdits',
        (c) => {
          c._artworkEdits += ' QZX';
        },
      ],
      [
        'an absent artworkEdits table (absent is {})',
        (c) => {
          delete c.artworkEdits;
        },
      ],
      [
        'the JSON key order of a table and of an entry',
        (c) => {
          c.heldBlockValues = Object.fromEntries(
            Object.entries(c.heldBlockValues)
              .reverse()
              .map(([k, v]) => [k, Object.fromEntries(Object.entries(v).reverse())])
          );
        },
      ],
    ])('CONTROL: %s does not move the digest', (_label, mutate) => {
      const c = base();
      mutate(c);
      expect(fpOf(c)).toEqual(fp0());
    });

    it('refuses to run without a hasSidecar predicate (the scope is not optional)', () => {
      expect(() => composerTablesFingerprint(cfg0)).toThrow(/hasSidecar/);
    });
  });

  it('reads the EXACT keys of retiredFigures', () => {
    const cfg = { retiredFigures: { CNX_A: 'r', cnx_b: 'r' } };
    expect([...retiredFigureNames(cfg)]).toEqual(['CNX_A', 'cnx_b']);
  });

  it('treats an absent table as empty', () => {
    expect(retiredFigureNames({}).size).toBe(0);
  });

  it.each([[null], [[]], ['CNX_A'], [5]])(
    'refuses a retiredFigures that is not an object: %j',
    (bad) => {
      expect(() => retiredFigureNames({ retiredFigures: bad })).toThrow(
        /retiredFigures must be an object/
      );
    }
  );

  it('loads the table from a given config path', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figcfg-'));
    try {
      const file = path.join(dir, 'figure-text.config.json');
      fs.writeFileSync(file, JSON.stringify({ retiredFigures: { CNX_Z: 'a reason' } }));
      expect([...loadRetiredFigures(file)]).toEqual(['CNX_Z']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // 🔴 THE SAME LITERAL TABLE AS experiments/figure-text-translation/test_sources.py. Two
  // implementations of one fold — sources._normkey and normkey here — are kept in agreement by
  // pinning both to it. Change both or neither.
  it.each([
    ['CNX_Chem_12_07_Cat Convert', 'cnxchem1207catconvert'],
    ['CNX_Chem_21_03_RadioDecay-e619', 'cnxchem2103radiodecaye619'],
    ['Figure 14_03_ICETable2_img', 'figure1403icetable2img'],
    ['CNX_Chem_08_02_sp3d_img', 'cnxchem0802sp3dimg'],
    ['Ö_Ð-þ²', 'öðþ²'],
  ])('normkey(%j) is %j, as sources._normkey', (input, want) => {
    expect(normkey(input)).toBe(want);
  });
});
