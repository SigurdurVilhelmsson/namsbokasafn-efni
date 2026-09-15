/**
 * §C140 ⑨ parity — the review panel's decimal suggestion (`tools/lib/figure-consistency.cjs`,
 * `decimalSeparatorWarnings`) against the composer's rule R3 (`experiments/figure-text-translation/
 * numloc.py`) on the ONE shape the panel handles: a label that is exactly one plain decimal.
 *
 * Two implementations of one convention, in two languages. This file is a JS PIN on literals
 * COPIED from the Python side, not a shared fixture: PLAIN_DECIMAL is the subset of
 * `test_numloc.py`'s fixture (c9-appendix.md B1 rows + B2 values) whose input matches
 * /^\d+\.\d+$/ as a WHOLE string; the second element is R3's output there, i.e. what the Python
 * test asserts. Generated from that fixture ONCE as a literal — never parsed at test time, and no
 * Python test reads this literal. ⚠️ So nothing makes the two sides agree: a change to R3 in
 * `numloc.py` made in step with `test_numloc.py` leaves this file green, and PLAIN_DECIMAL must
 * be RE-COPIED BY HAND whenever R3 changes (final review 2026-09-15; on that day `numloc.localize`
 * matched all 173 pairs).
 *
 * Deliberately NOT in the subset: inputs with edge spaces (`0.00 `, ` 0.000`; the panel splits
 * and re-joins on whitespace), negatives (`–0.062`), and everything with a unit, thousands group,
 * tuple or fragment — the panel does not claim those shapes, and the last test pins that boundary.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const CONSISTENCY_MODULE = '../lib/figure-consistency.cjs';

const require = createRequire(import.meta.url);
const { decimalSeparatorWarnings } = require(CONSISTENCY_MODULE);

const PLAIN_DECIMAL = [
  ['1.008', '1,008'],
  ['12.01', '12,01'],
  ['16.00', '16,00'],
  ['22.99', '22,99'],
  ['26.98', '26,98'],
  ['32.06', '32,06'],
  ['35.45', '35,45'],
  ['0.5', '0,5'],
  ['1.5', '1,5'],
  ['2.5', '2,5'],
  ['3.5', '3,5'],
  ['4.5', '4,5'],
  ['1.0023', '1,0023'],
  ['4.383', '4,383'],
  ['421.23', '421,23'],
  ['5.3853', '5,3853'],
  ['64.77', '64,77'],
  ['0.008020', '0,008020'],
  ['192.00', '192,00'],
  ['342.14', '342,14'],
  ['53.96', '53,96'],
  ['96.18', '96,18'],
  ['108.09', '108,09'],
  ['180.15', '180,15'],
  ['64.00', '64,00'],
  ['8.064', '8,064'],
  ['106.35', '106,35'],
  ['119.37', '119,37'],
  ['14.007', '14,007'],
  ['24.02', '24,02'],
  ['32.00', '32,00'],
  ['5.040', '5,040'],
  ['75.07', '75,07'],
  ['58.44', '58,44'],
  ['1.0', '1,0'],
  ['2.0', '2,0'],
  ['3.0', '3,0'],
  ['0.74', '0,74'],
  ['36.0', '36,0'],
  ['46.4', '46,4'],
  ['56.7', '56,7'],
  ['67.1', '67,1'],
  ['77.5', '77,5'],
  ['88.0', '88,0'],
  ['0.02', '0,02'],
  ['0.04', '0,04'],
  ['0.06', '0,06'],
  ['0.08', '0,08'],
  ['0.1', '0,1'],
  ['0.12', '0,12'],
  ['0.14', '0,14'],
  ['0.16', '0,16'],
  ['0.18', '0,18'],
  ['0.22', '0,22'],
  ['0.31', '0,31'],
  ['1.07', '1,07'],
  ['16.1', '16,1'],
  ['0.00', '0,00'],
  ['0.010', '0,010'],
  ['0.0208', '0,0208'],
  ['0.0417', '0,0417'],
  ['0.0625', '0,0625'],
  ['0.0833', '0,0833'],
  ['0.125', '0,125'],
  ['0.250', '0,250'],
  ['0.500', '0,500'],
  ['1.000', '1,000'],
  ['12.00', '12,00'],
  ['18.00', '18,00'],
  ['24.00', '24,00'],
  ['6.00', '6,00'],
  ['0.000', '0,000'],
  ['0.200', '0,200'],
  ['0.400', '0,400'],
  ['0.600', '0,600'],
  ['0.00160', '0,00160'],
  ['0.00175', '0,00175'],
  ['0.00909', '0,00909'],
  ['0.0108', '0,0108'],
  ['0.0115', '0,0115'],
  ['0.0117', '0,0117'],
  ['0.0135', '0,0135'],
  ['0.0190', '0,0190'],
  ['0.0231', '0,0231'],
  ['0.0243', '0,0243'],
  ['0.0260', '0,0260'],
  ['0.0330', '0,0330'],
  ['0.0468', '0,0468'],
  ['0.10', '0,10'],
  ['0.640', '0,640'],
  ['0.15', '0,15'],
  ['1.00', '1,00'],
  ['0.534', '0,534'],
  ['0.50', '0,50'],
  ['0.033', '0,033'],
  ['12.5', '12,5'],
  ['4.003', '4,003'],
  ['6.94', '6,94'],
  ['9.012', '9,012'],
  ['10.81', '10,81'],
  ['14.01', '14,01'],
  ['19.00', '19,00'],
  ['20.18', '20,18'],
  ['24.31', '24,31'],
  ['28.09', '28,09'],
  ['30.97', '30,97'],
  ['39.10', '39,10'],
  ['39.95', '39,95'],
  ['40.08', '40,08'],
  ['44.96', '44,96'],
  ['47.87', '47,87'],
  ['50.94', '50,94'],
  ['52.00', '52,00'],
  ['54.94', '54,94'],
  ['55.85', '55,85'],
  ['58.69', '58,69'],
  ['58.93', '58,93'],
  ['63.55', '63,55'],
  ['65.38', '65,38'],
  ['69.72', '69,72'],
  ['72.63', '72,63'],
  ['74.92', '74,92'],
  ['78.97', '78,97'],
  ['79.90', '79,90'],
  ['83.80', '83,80'],
  ['85.47', '85,47'],
  ['87.62', '87,62'],
  ['88.91', '88,91'],
  ['91.22', '91,22'],
  ['92.91', '92,91'],
  ['95.95', '95,95'],
  ['101.1', '101,1'],
  ['102.9', '102,9'],
  ['106.4', '106,4'],
  ['107.9', '107,9'],
  ['112.4', '112,4'],
  ['114.8', '114,8'],
  ['118.7', '118,7'],
  ['121.8', '121,8'],
  ['126.9', '126,9'],
  ['127.6', '127,6'],
  ['131.3', '131,3'],
  ['132.9', '132,9'],
  ['137.3', '137,3'],
  ['138.9', '138,9'],
  ['140.1', '140,1'],
  ['140.9', '140,9'],
  ['144.2', '144,2'],
  ['150.4', '150,4'],
  ['152.0', '152,0'],
  ['157.3', '157,3'],
  ['158.9', '158,9'],
  ['162.5', '162,5'],
  ['164.9', '164,9'],
  ['167.3', '167,3'],
  ['168.9', '168,9'],
  ['173.1', '173,1'],
  ['175.0', '175,0'],
  ['178.5', '178,5'],
  ['180.9', '180,9'],
  ['183.8', '183,8'],
  ['186.2', '186,2'],
  ['190.2', '190,2'],
  ['192.2', '192,2'],
  ['195.1', '195,1'],
  ['197.0', '197,0'],
  ['200.6', '200,6'],
  ['204.4', '204,4'],
  ['207.2', '207,2'],
  ['209.0', '209,0'],
  ['231.0', '231,0'],
  ['232.0', '232,0'],
  ['238.0', '238,0'],
];

describe('decimal-comma parity: figure-consistency.cjs vs numloc.py (R3)', () => {
  it('NON-VACUITY the fixture is the whole plain-decimal subset (96 B1 lines + 77 B2 values)', () => {
    expect(PLAIN_DECIMAL).toHaveLength(173);
    expect(new Set(PLAIN_DECIMAL.map(([input]) => input)).size).toBe(173);
  });

  it('suggests exactly the Python R3 output for every plain-decimal census string', () => {
    const mismatches = [];
    for (const [input, expected] of PLAIN_DECIMAL) {
      const w = decimalSeparatorWarnings({ k: input });
      const ok =
        w.length === 1 &&
        w[0].blockKey === 'k' &&
        w[0].current === input &&
        w[0].suggested === expected;
      if (!ok) mismatches.push({ input, expected, got: w });
    }
    expect(mismatches).toEqual([]);
  });

  it('BOUNDARY a thousands group is outside the panel: 1,000,000 gets no suggestion (R3 draws 1.000.000)', () => {
    expect(decimalSeparatorWarnings({ k: '1,000,000' })).toEqual([]);
  });
});
