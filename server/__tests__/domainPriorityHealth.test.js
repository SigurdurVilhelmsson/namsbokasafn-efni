/**
 * The reconcile verdict must reach a human (§C119).
 *
 * Migration 047 now records when its enforcement actually changed rows. That is
 * only half a guard: this repo's own rule is that a detector firing into a log
 * nobody reads is not a gate. So the verdict goes into /api/health, which
 * ./scripts/deploy.sh prints — and the deploy is exactly where the operator was
 * standing when the 2026-08-31 revert happened.
 *
 * The alarm is deliberately SHORT-LIVED and that is correct: 047 reverts on one
 * boot and finds nothing to change on the next, so the check goes not-ok on the
 * boot that did the damage and clears afterwards. That boot IS the deploy whose
 * output the operator reads.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { readDomainPriorityHealth, STATUS_REL } = require('../lib/domainPriorityHealth.js');

let root;
const write = (obj) => {
  fs.mkdirSync(path.join(root, 'pipeline-output'), { recursive: true });
  fs.writeFileSync(path.join(root, STATUS_REL), typeof obj === 'string' ? obj : JSON.stringify(obj));
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-health-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('readDomainPriorityHealth', () => {
  it('is ok when the last reconcile changed nothing', () => {
    write({ ran: '2026-09-04T00:00:00.000Z', reverted: [] });
    expect(readDomainPriorityHealth({ projectRoot: root }).ok).toBe(true);
  });

  // THE INCIDENT: this is the alarm that was missing on 2026-08-31.
  it('is NOT ok when the last reconcile overwrote live rows', () => {
    write({
      ran: '2026-08-31T06:29:00.000Z',
      reverted: [{ slug: 'lifraen-efnafraedi', before: ['chemistry'], after: ['chemistry', 'biology', 'physics'] }],
    });
    expect(readDomainPriorityHealth({ projectRoot: root }).ok).toBe(false);
  });

  it('names what it overwrote, so the operator can undo it deliberately', () => {
    write({
      ran: '2026-08-31T06:29:00.000Z',
      reverted: [{ slug: 'lifraen-efnafraedi', before: ['chemistry'], after: ['chemistry', 'biology'] }],
    });
    const h = readDomainPriorityHealth({ projectRoot: root });
    expect(h.message).toMatch(/lifraen-efnafraedi/);
  });

  // A box that has never booted with this code has nothing to report. It is ok,
  // but `ran: null` distinguishes it from a genuine clean run — an absence is
  // not an answer, so the payload says which it is.
  it('is ok but reports ran=null when no reconcile has been recorded', () => {
    const h = readDomainPriorityHealth({ projectRoot: root });
    expect({ ok: h.ok, ran: h.ran }).toEqual({ ok: true, ran: null });
  });

  // A broken detector must not report healthy — that is the failure mode this
  // whole entry exists because of.
  it('is NOT ok when the status file is unparseable', () => {
    write('{not json');
    expect(readDomainPriorityHealth({ projectRoot: root }).ok).toBe(false);
  });

  it('is NOT ok when the payload has no reverted array', () => {
    write({ ran: '2026-09-04T00:00:00.000Z' });
    expect(readDomainPriorityHealth({ projectRoot: root }).ok).toBe(false);
  });
});
