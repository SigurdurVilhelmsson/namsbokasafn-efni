import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  FIGURE_TEXT_CONFIG,
  loadFigureTextConfig,
  retiredFigureNames,
  loadRetiredFigures,
  normkey,
} from '../lib/figure-text-config.js';

describe('figure-text-config (§C140 ㊵)', () => {
  it('points at the committed figure config', () => {
    expect(
      FIGURE_TEXT_CONFIG.endsWith(
        path.join('experiments', 'figure-text-translation', 'figure-text.config.json')
      )
    ).toBe(true);
    expect(Array.isArray(loadFigureTextConfig().editionPrecedence)).toBe(true);
  });

  it('the committed config carries its policy tables as plain objects (keptCopies, heldBlockValues: §C140 ㊾)', () => {
    const cfg = loadFigureTextConfig();
    for (const key of ['retiredFigures', 'keptCopies', 'artworkPins', 'heldBlockValues']) {
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
