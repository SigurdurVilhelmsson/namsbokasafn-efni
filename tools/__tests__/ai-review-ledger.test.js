/**
 * ai-review-ledger.test.js — the append-only spend ledger that enforces the cap
 * (Unit D, docs/superpowers/specs/2026-10-26-ai-layer-scaffolding-design.md).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import {
  readLedger,
  summarizeLedger,
  reserve,
  settle,
  release,
  settleAndRelease,
  CapExceededError,
} from '../ai-review/ledger.js';
import { CAP_USD } from '../ai-review/config.js';

const tmpDirs = [];
function ledgerPath() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-review-ledger-'));
  tmpDirs.push(d);
  return path.join(d, 'ledger.jsonl');
}
afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

const base = { runId: 'run-a', use: 'ai-pass' };

describe('summarizeLedger (pure)', () => {
  it('sums settlements and open reservations on a literal sequence', () => {
    const entries = [
      { type: 'reserve', id: 'r1', runId: 'a', use: 'ai-pass', usd: 10 },
      { type: 'settle', id: 'r1', runId: 'a', use: 'ai-pass', usd: 4 },
      { type: 'release', id: 'r1', runId: 'a', use: 'ai-pass', usd: 6 },
      { type: 'reserve', id: 'r2', runId: 'b', use: 'glossary-prescreen', usd: 7 },
      { type: 'reserve', id: 'r3', runId: 'b', use: 'glossary-prescreen', usd: 3 },
      { type: 'release', id: 'r3', runId: 'b', use: 'glossary-prescreen', usd: 3 },
    ];
    const s = summarizeLedger(entries);
    expect(s.settledUsd).toBe(4);
    expect(s.openUsd).toBe(7);
    expect(s.committedUsd).toBe(11);
    expect(s.reservations.get('r2').openUsd).toBe(7);
    expect(s.reservations.get('r1').openUsd).toBe(0);
  });

  it('never counts a negative open amount when actual exceeded the reservation', () => {
    const s = summarizeLedger([
      { type: 'reserve', id: 'r1', runId: 'a', use: 'u', usd: 1 },
      { type: 'settle', id: 'r1', runId: 'a', use: 'u', usd: 1.5 },
    ]);
    expect(s.openUsd).toBe(0);
    expect(s.committedUsd).toBe(1.5);
  });
});

describe('reserve / settle / release', () => {
  it('writes entries carrying type, id, runId, use and usd', () => {
    const p = ledgerPath();
    const { id } = reserve({ ledgerPath: p, ...base, usd: 2 });
    settleAndRelease({ ledgerPath: p, id, actualUsd: 0.5 });
    const entries = readLedger(p);
    expect(entries.map((e) => e.type)).toEqual(['reserve', 'settle', 'release']);
    for (const e of entries) {
      expect(e.id).toBe(id);
      expect(e.runId).toBe('run-a');
      expect(e.use).toBe('ai-pass');
      expect(typeof e.usd).toBe('number');
      expect(typeof e.at).toBe('string');
    }
    expect(entries.map((e) => e.usd)).toEqual([2, 0.5, 1.5]);
    const s = summarizeLedger(entries);
    expect(s.settledUsd).toBe(0.5);
    expect(s.openUsd).toBe(0);
  });

  it('counts open reservations against the cap', () => {
    const p = ledgerPath();
    reserve({ ledgerPath: p, ...base, usd: 60 });
    expect(() => reserve({ ledgerPath: p, ...base, usd: 41 })).toThrow(CapExceededError);
    // control: exactly reaching the cap is allowed
    expect(() => reserve({ ledgerPath: p, ...base, usd: 40 })).not.toThrow();
  });

  it('counts settlements against the cap, across runs and uses', () => {
    const p = ledgerPath();
    const { id } = reserve({ ledgerPath: p, runId: 'run-1', use: 'glossary-prescreen', usd: 50 });
    settle({ ledgerPath: p, id, usd: 50 });
    expect(() => reserve({ ledgerPath: p, runId: 'run-2', use: 'ai-pass', usd: 50 })).not.toThrow();
    let err;
    try {
      reserve({ ledgerPath: p, runId: 'run-3', use: 'ai-pass', usd: 0.01 });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(CapExceededError);
    expect(err.code).toBe('CAP_EXCEEDED');
  });

  it('frees a released reservation (control: before the release it refuses)', () => {
    const p = ledgerPath();
    const { id } = reserve({ ledgerPath: p, ...base, usd: 90 });
    expect(() => reserve({ ledgerPath: p, ...base, usd: 90 })).toThrow(CapExceededError);
    release({ ledgerPath: p, id, usd: 90 });
    expect(() => reserve({ ledgerPath: p, ...base, usd: 90 })).not.toThrow();
  });

  it('a refused reservation writes nothing', () => {
    const p = ledgerPath();
    reserve({ ledgerPath: p, ...base, usd: 99 });
    expect(() => reserve({ ledgerPath: p, ...base, usd: 2 })).toThrow(CapExceededError);
    expect(readLedger(p)).toHaveLength(1);
  });

  it('accepts a lower cap and refuses a higher one than CAP_USD', () => {
    const p = ledgerPath();
    expect(() => reserve({ ledgerPath: p, ...base, usd: 6, cap: 5 })).toThrow(CapExceededError);
    expect(() => reserve({ ledgerPath: p, ...base, usd: 1, cap: CAP_USD + 1 })).toThrow(/CAP_USD/);
  });

  it('refuses settling or releasing an unknown reservation', () => {
    const p = ledgerPath();
    expect(() => settle({ ledgerPath: p, id: 'nope', usd: 1 })).toThrow(/unknown reservation/);
    expect(() => release({ ledgerPath: p, id: 'nope', usd: 1 })).toThrow(/unknown reservation/);
  });

  it('refuses settling twice, and releasing more than is open', () => {
    const p = ledgerPath();
    const { id } = reserve({ ledgerPath: p, ...base, usd: 5 });
    settle({ ledgerPath: p, id, usd: 2 });
    expect(() => settle({ ledgerPath: p, id, usd: 2 })).toThrow(/already settled/);
    expect(() => release({ ledgerPath: p, id, usd: 4 })).toThrow(/more than is open/);
    release({ ledgerPath: p, id, usd: 3 });
    expect(() => release({ ledgerPath: p, id, usd: 0.001 })).toThrow(/already released/);
  });

  it('refuses a negative, NaN or non-number amount', () => {
    const p = ledgerPath();
    expect(() => reserve({ ledgerPath: p, ...base, usd: -1 })).toThrow();
    expect(() => reserve({ ledgerPath: p, ...base, usd: Number.NaN })).toThrow();
    expect(() => reserve({ ledgerPath: p, ...base, usd: '1' })).toThrow();
  });

  it('refuses to read a malformed ledger rather than skip a line', () => {
    const p = ledgerPath();
    reserve({ ledgerPath: p, ...base, usd: 1 });
    fs.appendFileSync(p, '{"type":"reserve","id":"x"\n');
    expect(() => readLedger(p)).toThrow(/malformed/);
    expect(() => reserve({ ledgerPath: p, ...base, usd: 1 })).toThrow(/malformed/);
  });

  it('refuses an entry of an unknown type', () => {
    const p = ledgerPath();
    fs.writeFileSync(p, '{"type":"refund","id":"x","runId":"a","use":"u","usd":1}\n');
    expect(() => readLedger(p)).toThrow(/malformed/);
  });

  it('sums many small amounts exactly', () => {
    const p = ledgerPath();
    for (let i = 0; i < 200; i++) {
      const { id } = reserve({ ledgerPath: p, ...base, usd: 0.0003 });
      settleAndRelease({ ledgerPath: p, id, actualUsd: 0.0001 });
    }
    const s = summarizeLedger(readLedger(p));
    expect(s.settledUsd).toBe(0.02);
    expect(s.openUsd).toBe(0);
  });

  it('settleAndRelease releases nothing when the actual meets or exceeds the reservation', () => {
    const p = ledgerPath();
    const { id } = reserve({ ledgerPath: p, ...base, usd: 1 });
    settleAndRelease({ ledgerPath: p, id, actualUsd: 1.2 });
    expect(readLedger(p).map((e) => e.type)).toEqual(['reserve', 'settle']);
  });

  it('reads an absent ledger as empty', () => {
    expect(readLedger(ledgerPath())).toEqual([]);
  });
});
