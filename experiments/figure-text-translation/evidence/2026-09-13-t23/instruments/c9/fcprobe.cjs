const { decimalSeparatorWarnings } = require('/home/siggi/dev/repos/namsbokasafn-efni/tools/lib/figure-consistency.cjs');
const fs = require('fs'), path = require('path');
const dir = '/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/figure-text';
let n = 0, w = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.is.json')).sort()) {
  const sc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  n += Object.keys(sc.blocks).length;
  for (const x of decimalSeparatorWarnings(sc.blocks)) w.push([sc.basename, x]);
}
console.log('sidecar values', n, 'warnings', w.length);
for (const x of w) console.log(JSON.stringify(x));
console.log('control 373.15 K ->', JSON.stringify(decimalSeparatorWarnings({ k: '373.15 K' })));
console.log('control two spaces no number ->', JSON.stringify(decimalSeparatorWarnings({ k: 'a  b' })));
