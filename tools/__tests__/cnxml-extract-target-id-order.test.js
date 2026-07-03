import { describe, it, expect } from 'vitest';
import { extractSegments } from '../cnxml-extract.js';

// A figure cross-referenced by an EARLIER <link target-id="figZ"/> inside pA,
// with pB BETWEEN the reference and the figure's real definition. Correct order
// is pA, pB, figZ. Pre-fix, figZ's position resolves to the target-id reference
// (inside pA, BEFORE pB), so figZ is hoisted ahead of pB → pA, figZ, pB. The
// discriminating assertion is "pB before figZ": true only after the fix.
const CNXML = `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">
<title>Doc</title>
<content>
<section id="s1"><title>S1</title>
<para id="pA">As shown in <link target-id="figZ"/>, the trend holds.</para>
<para id="pB">Additional discussion appears in this paragraph.</para>
<figure id="figZ"><media id="mZ" alt="x"><image src="z.png" mime-type="image/png"/></media><caption>Cap</caption></figure>
</content>
</document>`;

function idsInOrder(structure) {
  const ids = [];
  const walk = (nodes) => {
    for (const n of nodes || []) {
      if (n.id) ids.push(n.id);
      if (n.content) walk(n.content);
    }
  };
  walk(structure.content);
  return ids;
}

describe('extract keeps a target-id-referenced element in document order (OC-A)', () => {
  it('does not hoist figZ ahead of pB via the earlier target-id reference', () => {
    const { structure } = extractSegments(CNXML);
    const ids = idsInOrder(structure);
    for (const id of ['pA', 'pB', 'figZ']) expect(ids).toContain(id);
    // The collision would put figZ (resolved to the target-id inside pA) before pB.
    expect(ids.indexOf('pB')).toBeLessThan(ids.indexOf('figZ'));
    // Full correct order:
    expect(ids.indexOf('pA')).toBeLessThan(ids.indexOf('pB'));
  });
});
