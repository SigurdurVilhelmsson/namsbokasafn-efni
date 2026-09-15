import { localizeNumbersInMathML } from '/home/siggi/dev/repos/namsbokasafn-efni/tools/lib/mathml-to-latex.js';
for (const v of ['1,000,000', '10,000', '100,000', '1,000', '26.98', '1.008', '2,400', '10,744', '12,345.67', '1,234,567.8', '.625', '4.', '1,2']) {
  console.log(JSON.stringify(v), '->', localizeNumbersInMathML(`<m:mn>${v}</m:mn>`));
}
