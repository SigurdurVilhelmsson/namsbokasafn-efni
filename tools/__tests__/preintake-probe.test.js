import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { probeDir } from '../preintake-probe.js';

let dir;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-'));
  fs.mkdirSync(path.join(dir, 'ch01'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'ch01', 'm1.cnxml'),
    '<document><link class="os-embed" url="#e/1"/><para><term>t</term></para></document>'
  );
  fs.writeFileSync(
    path.join(dir, 'ch01', 'm2.cnxml'),
    '<document><para>clean <emphasis>x</emphasis></para></document>'
  );
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('probeDir', () => {
  it('walks .cnxml recursively and aggregates to a NO-GO on os-embed', () => {
    const r = probeDir(dir, { noteTypeLabels: {} });
    expect(r.agg.fileCount).toBe(2);
    expect(r.checks.osEmbed.count).toBe(1);
    expect(r.checks.glossary.status).toBe('warn'); // term present, no glossary
    expect(r.verdict).toBe('NO-GO');
  });
});
