/**
 * Brainstorm-stage probe for the §C82 Plan C ctx loader.
 *
 * QUESTION: when the loader gives a Tier-0/Tier-1 check nothing but scope keys,
 * does the check fail LOUD (SKIPPED) or QUIET (PASS over nothing)?
 *
 * The distinction decides the loader's failure posture, and it cannot be read
 * off `runCheck`: that wrapper converts `PASS + examined 0` to SKIPPED, so a
 * quiet check and a self-guarding one look identical through it. Arm 1 calls
 * `check.run()` DIRECTLY to bypass the backstop; arm 2 goes through runCheck.
 *
 * A saturated result (all SKIPPED) is a category, not a result — arm 3 is a
 * POSITIVE CONTROL proving the probe can produce a non-SKIPPED verdict at all.
 * Without it, a broken probe and a clean sweep are the same output.
 */
const REPO = '/home/siggi/dev/repos/namsbokasafn-efni';
await import(REPO + '/tools/lib/remt-checks-glossary.js');
await import(REPO + '/tools/lib/remt-checks-extract.js');
const { REGISTRY, runCheck } = await import(REPO + '/tools/lib/remt-battery.js');
const fs = await import('node:fs');

const scope = { book: 'lifraen-efnafraedi', chapter: '1', module: 'm00033' };
const t01 = [...REGISTRY.entries()].filter(([, c]) => c.tier === 0 || c.tier === 1);

console.log('ARM 1 — raw check.run(), backstop bypassed');
for (const [id, c] of t01) {
  let v, ex;
  try { const r = await c.run({ ...scope }); v = r.verdict; ex = r.examined; }
  catch (e) { v = 'THREW'; ex = String(e.message).slice(0, 50); }
  console.log(`  ${id.padEnd(4)} tier${c.tier} ${c.blocking ? 'BLOCKING' : 'advisory'} -> ${v} examined=${ex}`);
}

console.log('\nARM 2 — through runCheck (backstop active)');
for (const [id, c] of t01) {
  const r = await runCheck(c, { ...scope });
  console.log(`  ${id.padEnd(4)} -> ${r.verdict} examined=${r.examined}`);
}

console.log('\nARM 3 — POSITIVE CONTROL: real glossary supplied to G1-G3');
const gp = REPO + '/books/lifraen-efnafraedi/glossary/glossary-unified.json';
const glossary = JSON.parse(fs.readFileSync(gp, 'utf8'));
for (const id of ['G1', 'G2', 'G3']) {
  const r = await REGISTRY.get(id).run({ book: 'lifraen-efnafraedi', glossary });
  console.log(`  ${id} -> ${r.verdict} examined=${r.examined} findings=${(r.findings || []).length}`);
}
console.log('\nIf ARM 3 shows only SKIPPED, ARM 1 proves nothing — the probe itself is broken.');
