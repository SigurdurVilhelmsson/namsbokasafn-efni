/**
 * Reader for layer 2's change logs (G1.23 spec §5 and §6.1).
 *
 * `books/<book>/02-mt-revised/<chapterDir>/<module>-changes.jsonl` holds one record per accepted AI
 * term change; `<module>-revision.json` names the ruling set that gives each ruling its label.
 * Everything here is fail-soft: a bad log means no suggestions for that module and ONE warning
 * (`{ book, moduleId, reason }`, never text), and the reader never throws.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const log = require('./logger');
const { sha256Text } = require('./servedText');
const { chapterDir } = require('./chapterLabel');
const { applyOnce, hasMarker } = require('../public/js/suggestion-placement');

const DROPPED_CATEGORIES = Object.freeze(['agreement']);
const ORGANIC = 'lifraen-efnafraedi';
const STRING_KEYS = Object.freeze([
  'segmentId',
  'key',
  'opId',
  'rulingId',
  'category',
  'find',
  'replace',
  'before',
  'after',
  'beforeSha256',
  'afterSha256',
  'runId',
]);
const RECORD_KEYS = Object.freeze([...STRING_KEYS, 'module', 'occurrence', 'source'].sort());
const SAFE_NAME = /^[A-Za-z0-9_.-]+$/;

const DEFAULT_ROOTS = Object.freeze({
  booksRoot: path.resolve(__dirname, '../../books'),
  repoRoot: path.resolve(__dirname, '../..'),
});
let testRoots = null;

/**
 * Test-only: default roots used when readModuleLog gets none. `null` restores the defaults.
 * @param {{ booksRoot?: string, repoRoot?: string } | null} roots
 */
function _setTestRoots(roots) {
  testRoots = roots ? { ...DEFAULT_ROOTS, ...roots } : null;
}

// path + '\0' + sha256 -> Map(id -> { en, is })
const labelCache = new Map();

class BadLog extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

function loadLabels(repoRoot, rulingSet) {
  if (!rulingSet || typeof rulingSet.path !== 'string' || typeof rulingSet.sha256 !== 'string') {
    throw new BadLog('malformed');
  }
  const abs = path.resolve(repoRoot, rulingSet.path);
  const cacheKey = abs + '\0' + rulingSet.sha256;
  const hit = labelCache.get(cacheKey);
  if (hit) return hit;
  let bytes;
  try {
    bytes = fs.readFileSync(abs);
  } catch {
    throw new BadLog('malformed');
  }
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== rulingSet.sha256) {
    throw new BadLog('malformed');
  }
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new BadLog('malformed');
  }
  if (!parsed || !Array.isArray(parsed.rulings)) throw new BadLog('malformed');
  const labels = new Map();
  for (const r of parsed.rulings) {
    if (!r || typeof r.id !== 'string' || !Array.isArray(r.en) || typeof r.en[0] !== 'string') {
      throw new BadLog('malformed');
    }
    labels.set(r.id, { en: r.en[0], is: r.is });
  }
  labelCache.set(cacheKey, labels);
  return labels;
}

function validateRecord(rec, moduleId) {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return false;
  const keys = Object.keys(rec).sort();
  if (keys.length !== RECORD_KEYS.length || keys.some((k, i) => k !== RECORD_KEYS[i])) return false;
  if (rec.module !== moduleId) return false;
  if (rec.source !== 'ai' && rec.source !== 'rule') return false;
  if (!Number.isInteger(rec.occurrence) || rec.occurrence < 0) return false;
  if (STRING_KEYS.some((k) => typeof rec[k] !== 'string')) return false;
  if (sha256Text(rec.before) !== rec.beforeSha256) return false;
  if (sha256Text(rec.after) !== rec.afterSha256) return false;
  return applyOnce(rec.before, rec.find, rec.replace) === rec.after;
}

function parseLog(text, moduleId, labels) {
  const chains = new Map();
  for (const line of text.split('\n')) {
    if (line === '') continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      throw new BadLog('malformed');
    }
    if (!validateRecord(rec, moduleId) || !labels.has(rec.rulingId)) throw new BadLog('malformed');
    const ck = `${rec.segmentId}#${rec.occurrence}`;
    let chain = chains.get(ck);
    if (!chain) chains.set(ck, (chain = []));
    if (chain.length && chain[chain.length - 1].after !== rec.before) throw new BadLog('malformed');
    chain.push(rec);
  }
  return chains;
}

/**
 * Read one module's change log. Never throws.
 * @param {{ book: string, chapter: number, moduleId: string }} id
 * @param {{ booksRoot?: string, repoRoot?: string }} [opts]
 * @returns {{ ok: true, chains: Map<string, object[]>, labels: Map<string, {en: string, is: string}> }
 *   | { ok: false, reason: 'absent' | 'malformed' | 'unreadable' }}
 */
function readModuleLog({ book, chapter, moduleId }, opts = {}) {
  if (book === ORGANIC) return { ok: false, reason: 'absent' };
  if (
    typeof book !== 'string' ||
    typeof moduleId !== 'string' ||
    !SAFE_NAME.test(book) ||
    !SAFE_NAME.test(moduleId) ||
    !Number.isInteger(chapter)
  ) {
    return { ok: false, reason: 'absent' };
  }
  const roots = { ...DEFAULT_ROOTS, ...(testRoots || {}), ...opts };
  const dir = path.join(roots.booksRoot, book, '02-mt-revised', chapterDir(chapter));
  let reason;
  try {
    let text;
    try {
      text = fs.readFileSync(path.join(dir, `${moduleId}-changes.jsonl`), 'utf8');
    } catch (err) {
      if (err && err.code === 'ENOENT') return { ok: false, reason: 'absent' };
      throw new BadLog('unreadable');
    }
    let revision;
    try {
      revision = JSON.parse(fs.readFileSync(path.join(dir, `${moduleId}-revision.json`), 'utf8'));
    } catch {
      throw new BadLog('malformed');
    }
    if (!revision || typeof revision !== 'object') throw new BadLog('malformed');
    const labels = loadLabels(roots.repoRoot, revision.rulingSet);
    const chains = parseLog(text, moduleId, labels);
    return { ok: true, chains, labels };
  } catch (err) {
    reason = err instanceof BadLog ? err.reason : 'unreadable';
  }
  log.warn({ book, moduleId, reason }, 'suggestion log unusable; no suggestions for this module');
  return { ok: false, reason };
}

/**
 * Drop every record of a (segmentId, rulingId) group, over all occurrences, that holds a record
 * whose category is in DROPPED_CATEGORIES.
 * @returns {{ kept: object[], dropped: object[] }}
 */
function dropFilter(logResult) {
  const kept = [];
  const dropped = [];
  const doomed = new Set();
  for (const chain of logResult.chains.values()) {
    for (const r of chain) {
      if (DROPPED_CATEGORIES.includes(r.category)) doomed.add(`${r.segmentId}\0${r.rulingId}`);
    }
  }
  for (const chain of logResult.chains.values()) {
    for (const r of chain) {
      (doomed.has(`${r.segmentId}\0${r.rulingId}`) ? dropped : kept).push(r);
    }
  }
  return { kept, dropped };
}

/**
 * The kept records grouped per (segmentId, occurrence, rulingId); groups with a marker token in any
 * find or replace are left out.
 * @returns {Map<string, object[]>} keyed "<segmentId>#<occurrence>", groups by first chainIndex
 */
function keptGroups(logResult) {
  const keptSet = new Set(dropFilter(logResult).kept);
  const out = new Map();
  for (const [ck, chain] of logResult.chains) {
    const byRuling = new Map();
    chain.forEach((r, chainIndex) => {
      if (!keptSet.has(r)) return;
      let g = byRuling.get(r.rulingId);
      if (!g) {
        g = {
          key: `${r.segmentId}#${r.occurrence}|${r.rulingId}`,
          segmentId: r.segmentId,
          occurrence: r.occurrence,
          rulingId: r.rulingId,
          source: r.source,
          label: logResult.labels.get(r.rulingId),
          changes: [],
        };
        byRuling.set(r.rulingId, g);
      }
      g.changes.push({
        opId: r.opId,
        occurrence: r.occurrence,
        find: r.find,
        replace: r.replace,
        category: r.category,
        runId: r.runId,
        chainIndex,
      });
    });
    const groups = [...byRuling.values()].filter(
      (g) => !g.changes.some((c) => hasMarker(c.find) || hasMarker(c.replace))
    );
    if (groups.length) out.set(ck, groups);
  }
  return out;
}

/** The first record's beforeSha256 in a chain, before the drop; null for an unknown chain. */
function firstBeforeSha256(logResult, segmentId, occurrence) {
  const chain = logResult.chains.get(`${segmentId}#${occurrence}`);
  return chain && chain.length ? chain[0].beforeSha256 : null;
}

module.exports = {
  DROPPED_CATEGORIES,
  readModuleLog,
  dropFilter,
  keptGroups,
  firstBeforeSha256,
  _setTestRoots,
};
