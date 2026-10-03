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

  it('the committed config carries its policy tables as plain objects (keptCopies: §C140 ㊾)', () => {
    const cfg = loadFigureTextConfig();
    for (const key of ['retiredFigures', 'keptCopies', 'artworkPins']) {
      const t = cfg[key];
      expect(t !== null && typeof t === 'object' && !Array.isArray(t)).toBe(true);
    }
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
