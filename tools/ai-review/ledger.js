/**
 * ledger.js — the append-only spend ledger that enforces the AI layer's cap.
 *
 * Design: docs/superpowers/specs/2026-10-26-ai-layer-scaffolding-design.md, Unit D.
 *
 * One JSONL file (production: `books/<slug>/ai-review/ledger.jsonl`) is shared by every
 * run and every use — the AI pass and the glossary pre-screen draw on one cap. Three
 * entry types, each `{ type, id, runId, use, usd, at }`, where `id` is the RESERVATION's
 * id on all three:
 *   - `reserve` — the worst case, written BEFORE a call or a batch;
 *   - `settle`  — the actual cost, written after (at most once per reservation);
 *   - `release` — the part of the reservation not spent (at most once; never more than
 *                 is open).
 * A reservation's open amount is `reserved − settled − released`, floored at 0. The cap
 * check sums every settlement plus every open amount, and refuses a reservation that
 * would take that total above the cap. Reaching the cap exactly is allowed.
 *
 * Fail-closed by construction:
 *   - a malformed or inconsistent line makes the ledger UNREADABLE rather than skipped —
 *     a silently skipped `reserve` or `settle` would under-count spend;
 *   - a reservation left open by a crash keeps counting until someone settles or
 *     releases it by hand, because the call it covered may have been billed;
 *   - check-and-append runs under an exclusive lock file, so two processes cannot both
 *     pass the check on the same headroom.
 *
 * Sums are taken in integer pico-USD (see pricing.js), so many small entries add up
 * exactly.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CAP_USD } from './config.js';
import { usdToPico, picoToUsd } from './pricing.js';

const ENTRY_TYPES = new Set(['reserve', 'settle', 'release']);
const LOCK_STALE_MS = 30_000;
const LOCK_WAIT_MS = 10_000;

/** Thrown when a reservation would take committed spend above the cap. */
export class CapExceededError extends Error {
  /**
   * @param {{ committedUsd: number, requestedUsd: number, capUsd: number }} info
   */
  constructor({ committedUsd, requestedUsd, capUsd }) {
    super(
      `ai-review cap: USD ${committedUsd} committed (settled + open reservations) + ` +
        `USD ${requestedUsd} requested would exceed the cap of USD ${capUsd}`
    );
    this.name = 'CapExceededError';
    this.code = 'CAP_EXCEEDED';
    this.committedUsd = committedUsd;
    this.requestedUsd = requestedUsd;
    this.capUsd = capUsd;
  }
}

function assertUsd(usd, what) {
  if (typeof usd !== 'number' || !Number.isFinite(usd) || usd < 0) {
    throw new Error(`ledger: ${what} must be a finite, non-negative number, got ${String(usd)}`);
  }
}

function assertName(value, what) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`ledger: ${what} must be a non-empty string`);
  }
}

function validCap(cap) {
  if (typeof cap !== 'number' || !Number.isFinite(cap) || cap <= 0) {
    throw new Error(`ledger: cap must be a positive number, got ${String(cap)}`);
  }
  if (cap > CAP_USD) {
    throw new Error(`ledger: cap USD ${cap} is above CAP_USD (${CAP_USD}); refusing to raise it`);
  }
  return cap;
}

/**
 * Read every entry. An absent ledger is empty; a malformed line refuses.
 * @param {string} ledgerPath
 * @returns {Array<{type: string, id: string, runId: string, use: string, usd: number, at?: string}>}
 */
export function readLedger(ledgerPath) {
  if (!fs.existsSync(ledgerPath)) return [];
  const lines = fs.readFileSync(ledgerPath, 'utf8').split('\n');
  const entries = [];
  lines.forEach((line, i) => {
    if (line === '') return;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      throw new Error(`ledger: malformed line ${i + 1} in ${ledgerPath} (not JSON); refusing`);
    }
    const ok =
      e &&
      typeof e === 'object' &&
      ENTRY_TYPES.has(e.type) &&
      typeof e.id === 'string' &&
      e.id !== '' &&
      typeof e.runId === 'string' &&
      typeof e.use === 'string' &&
      typeof e.usd === 'number' &&
      Number.isFinite(e.usd) &&
      e.usd >= 0;
    if (!ok) {
      throw new Error(`ledger: malformed line ${i + 1} in ${ledgerPath} (bad entry); refusing`);
    }
    entries.push(e);
  });
  // Consistency is part of well-formedness: a settle or release must follow its reserve.
  summarizeLedger(entries);
  return entries;
}

/**
 * Pure summary of a ledger's entries.
 * @param {Array<{type: string, id: string, runId: string, use: string, usd: number}>} entries
 * @returns {{ settledUsd: number, openUsd: number, committedUsd: number,
 *   reservations: Map<string, {runId: string, use: string, reservedUsd: number, settledUsd: number,
 *   releasedUsd: number, openUsd: number, settled: boolean, released: boolean}> }}
 */
export function summarizeLedger(entries) {
  const res = new Map();
  for (const e of entries) {
    if (e.type === 'reserve') {
      if (res.has(e.id)) throw new Error(`ledger: malformed — reservation ${e.id} reserved twice`);
      res.set(e.id, {
        runId: e.runId,
        use: e.use,
        reserved: usdToPico(e.usd),
        settledP: 0,
        releasedP: 0,
        settled: false,
        released: false,
      });
      continue;
    }
    const r = res.get(e.id);
    if (!r) throw new Error(`ledger: malformed — ${e.type} for unknown reservation ${e.id}`);
    if (e.type === 'settle') {
      r.settledP += usdToPico(e.usd);
      r.settled = true;
    } else {
      r.releasedP += usdToPico(e.usd);
      r.released = true;
    }
  }
  let settledP = 0;
  let openP = 0;
  const reservations = new Map();
  for (const [id, r] of res) {
    const open = Math.max(0, r.reserved - r.settledP - r.releasedP);
    settledP += r.settledP;
    openP += open;
    reservations.set(id, {
      runId: r.runId,
      use: r.use,
      reservedUsd: picoToUsd(r.reserved),
      settledUsd: picoToUsd(r.settledP),
      releasedUsd: picoToUsd(r.releasedP),
      openUsd: picoToUsd(open),
      settled: r.settled,
      released: r.released,
    });
  }
  return {
    settledUsd: picoToUsd(settledP),
    openUsd: picoToUsd(openP),
    committedUsd: picoToUsd(settledP + openP),
    reservations,
  };
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Run `fn` holding an exclusive lock file beside the ledger. */
function withLock(ledgerPath, fn) {
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  const lockPath = `${ledgerPath}.lock`;
  const deadline = Date.now() + LOCK_WAIT_MS;
  let fd;
  for (;;) {
    try {
      fd = fs.openSync(lockPath, 'wx');
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let age;
      try {
        age = Date.now() - fs.statSync(lockPath).mtimeMs;
      } catch (e2) {
        if (e2.code === 'ENOENT') continue;
        throw e2;
      }
      if (age > LOCK_STALE_MS) {
        fs.rmSync(lockPath, { force: true });
        continue;
      }
      if (Date.now() > deadline) {
        throw new Error(`ledger: lock ${lockPath} is held by another process; try again`);
      }
      sleepSync(25);
    }
  }
  try {
    return fn();
  } finally {
    fs.closeSync(fd);
    fs.rmSync(lockPath, { force: true });
  }
}

function entryLine(type, id, r, usd, now) {
  return (
    JSON.stringify({ type, id, runId: r.runId, use: r.use, usd, at: now().toISOString() }) + '\n'
  );
}

/**
 * Reserve a worst case against the cap.
 * @param {{ ledgerPath: string, runId: string, use: string, usd: number, cap?: number,
 *   now?: () => Date }} args
 * @returns {{ id: string, committedUsd: number }} the reservation id and the committed
 *   total including it
 * @throws {CapExceededError} when the reservation would cross the cap (nothing is written)
 */
export function reserve({ ledgerPath, runId, use, usd, cap = CAP_USD, now = () => new Date() }) {
  assertName(runId, 'runId');
  assertName(use, 'use');
  assertUsd(usd, 'usd');
  const capUsd = validCap(cap);
  return withLock(ledgerPath, () => {
    const { committedUsd } = summarizeLedger(readLedger(ledgerPath));
    const after = usdToPico(committedUsd) + usdToPico(usd);
    if (after > usdToPico(capUsd)) {
      throw new CapExceededError({ committedUsd, requestedUsd: usd, capUsd });
    }
    const id = `res-${crypto.randomUUID()}`;
    fs.appendFileSync(ledgerPath, entryLine('reserve', id, { runId, use }, usd, now));
    return { id, committedUsd: picoToUsd(after) };
  });
}

function reservationOf(ledgerPath, id) {
  const r = summarizeLedger(readLedger(ledgerPath)).reservations.get(id);
  if (!r) throw new Error(`ledger: unknown reservation ${id}`);
  return r;
}

/**
 * Record the actual cost against a reservation (once).
 * @param {{ ledgerPath: string, id: string, usd: number, now?: () => Date }} args
 */
export function settle({ ledgerPath, id, usd, now = () => new Date() }) {
  assertUsd(usd, 'usd');
  withLock(ledgerPath, () => {
    const r = reservationOf(ledgerPath, id);
    if (r.settled) throw new Error(`ledger: reservation ${id} is already settled`);
    fs.appendFileSync(ledgerPath, entryLine('settle', id, r, usd, now));
  });
}

/**
 * Release the unspent part of a reservation (once; never more than is open).
 * @param {{ ledgerPath: string, id: string, usd: number, now?: () => Date }} args
 */
export function release({ ledgerPath, id, usd, now = () => new Date() }) {
  assertUsd(usd, 'usd');
  withLock(ledgerPath, () => {
    const r = reservationOf(ledgerPath, id);
    if (r.released) throw new Error(`ledger: reservation ${id} is already released`);
    if (usdToPico(usd) > usdToPico(r.openUsd)) {
      throw new Error(
        `ledger: releasing USD ${usd} from ${id} is more than is open (USD ${r.openUsd})`
      );
    }
    fs.appendFileSync(ledgerPath, entryLine('release', id, r, usd, now));
  });
}

/**
 * Settle the actual cost and release the rest of the reservation, in one append.
 * Releases nothing when the actual meets or exceeds the reservation.
 * @param {{ ledgerPath: string, id: string, actualUsd: number, now?: () => Date }} args
 */
export function settleAndRelease({ ledgerPath, id, actualUsd, now = () => new Date() }) {
  assertUsd(actualUsd, 'actualUsd');
  withLock(ledgerPath, () => {
    const r = reservationOf(ledgerPath, id);
    if (r.settled) throw new Error(`ledger: reservation ${id} is already settled`);
    if (r.released) throw new Error(`ledger: reservation ${id} is already released`);
    const rest = usdToPico(r.openUsd) - usdToPico(actualUsd);
    let text = entryLine('settle', id, r, actualUsd, now);
    if (rest > 0) text += entryLine('release', id, r, picoToUsd(rest), now);
    fs.appendFileSync(ledgerPath, text);
  });
}

/**
 * Release a whole reservation (a call that failed before it could be billed).
 * @param {{ ledgerPath: string, id: string, now?: () => Date }} args
 */
export function releaseAll({ ledgerPath, id, now = () => new Date() }) {
  withLock(ledgerPath, () => {
    const r = reservationOf(ledgerPath, id);
    if (r.released) throw new Error(`ledger: reservation ${id} is already released`);
    fs.appendFileSync(ledgerPath, entryLine('release', id, r, r.openUsd, now));
  });
}

/**
 * The state of one reservation, or null when the ledger does not hold it.
 * @param {string} ledgerPath
 * @param {string} id
 */
export function reservationState(ledgerPath, id) {
  return summarizeLedger(readLedger(ledgerPath)).reservations.get(id) ?? null;
}
