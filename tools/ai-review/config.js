/**
 * config.js — the AI layer's cap, records location (and its safe shapes) and API-key
 * source.
 *
 * Design: docs/superpowers/specs/2026-10-26-ai-layer-scaffolding-design.md, Unit D.
 *
 * `CAP_USD` is an ENFORCEABLE VALUE: [USER] capped all paid AI calls (the AI pass and
 * the glossary pre-screen together) at USD 100 on 2026-10-26
 * (docs/decisions/2026-10-26-pre-s-week-ai-layer-answers.md). It lives here, once, and
 * `tools/__tests__/ai-review-config.test.js` pins it. Prose elsewhere points here.
 *
 * The API key is read from `process.env.ANTHROPIC_API_KEY`, else from the repo-root,
 * git-ignored `.env` (via `loadEnvFile`, the parser `tools/api-translate.js` already
 * uses for the Málstaður key). This module never writes the key anywhere and never
 * puts it in an error message.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from '../api-translate.js';

/** Total paid AI spend permitted across every use sharing one ledger, in USD. */
export const CAP_USD = 100;

/** Repo root, resolved from this file (never from `process.cwd()`). */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The repo-root `.env` (git-ignored). */
export const DEFAULT_ENV_FILE = path.join(REPO_ROOT, '.env');

/** Default milliseconds between batch polls. */
export const DEFAULT_POLL_INTERVAL_MS = 60_000;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Books that must never be translated by any tool (CLAUDE.md § Organic Chemistry:
 * OpenStax has not authorised a translation, [USER] ruling 2026-09-23).
 */
const NOT_TRANSLATED = new Set(['lifraen-efnafraedi']);

/**
 * Refuse anything that is not a plain book slug, and refuse a book that is not
 * translated.
 * @param {string} slug
 * @returns {string} the slug
 */
export function assertBookSlug(slug) {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    throw new Error(`ai-review: not a book slug: ${JSON.stringify(slug)}`);
  }
  if (NOT_TRANSLATED.has(slug)) {
    throw new Error(
      `ai-review: ${slug} is not translated (OpenStax has not authorised it; CLAUDE.md § Organic)`
    );
  }
  return slug;
}

/**
 * The production records directory for a book: `books/<slug>/ai-review/`.
 * @param {string} slug
 * @returns {string} absolute path
 */
export function defaultRecordsDir(slug) {
  return path.join(REPO_ROOT, 'books', assertBookSlug(slug), 'ai-review');
}

/** The file name of the spend ledger inside a records directory. */
export const LEDGER_FILE = 'ledger.jsonl';

/**
 * Admit a records directory only in one of its SAFE shapes, and return it normalised:
 *   - an ABSOLUTE path (a relative one would resolve against `process.cwd()`, so two
 *     working directories would write two record trees and keep two ledgers, i.e. two
 *     caps — the server alone runs with cwd=`server/`);
 *   - inside the repository, exactly `books/<slug>/ai-review` for a translated book
 *     (`defaultRecordsDir`). Nothing else in the repository qualifies, so no record or
 *     ledger can land in a READ-ONLY `01-source/` or `02-mt-output/`, or anywhere else
 *     in the tree;
 *   - outside the repository, a directory with no `books` component (a scratch or test
 *     run), or one whose last `books` component is followed by exactly `<slug>/ai-review`
 *     — the repo-root test cannot see another checkout's book tree (a sibling worktree,
 *     the main checkout, a copy), so this rule is what keeps those READ-ONLY too.
 * The shapes are listed, not the dangers; a path that is none of them refuses.
 *
 * @param {unknown} dir
 * @param {string} [what] name used in the error message
 * @returns {string} the normalised absolute path
 */
export function assertRecordsDir(dir, what = 'recordsDir') {
  if (typeof dir !== 'string' || dir === '' || !path.isAbsolute(dir)) {
    throw new Error(
      `ai-review: ${what} must be an absolute path (a relative one resolves against the ` +
        `working directory), got ${JSON.stringify(dir)}`
    );
  }
  const resolved = path.resolve(dir);
  const rel = path.relative(REPO_ROOT, resolved);
  const outside = rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);
  const parts = outside ? resolved.split(path.sep).filter(Boolean) : rel.split(path.sep);
  const books = outside ? parts.lastIndexOf('books') : 0;
  if (outside && books === -1) return resolved;
  const tail = parts.slice(books);
  if (
    (!outside && rel === '') ||
    tail.length !== 3 ||
    tail[0] !== 'books' ||
    tail[2] !== 'ai-review'
  ) {
    throw new Error(
      `ai-review: a ${what} ${outside ? 'through a books/ directory' : 'inside the repository'} ` +
        `must be books/<slug>/ai-review, got ${JSON.stringify(outside ? resolved : rel)}`
    );
  }
  assertBookSlug(tail[1]);
  return resolved;
}

/**
 * Admit a ledger path only as `<a safe records directory>/ledger.jsonl` (absolute).
 * @param {unknown} ledgerPath
 * @returns {string} the normalised absolute path
 */
export function assertLedgerPath(ledgerPath) {
  if (typeof ledgerPath !== 'string' || ledgerPath === '' || !path.isAbsolute(ledgerPath)) {
    throw new Error(
      `ai-review: ledgerPath must be an absolute path (a relative one would give each ` +
        `working directory its own cap), got ${JSON.stringify(ledgerPath)}`
    );
  }
  const resolved = path.resolve(ledgerPath);
  if (path.basename(resolved) !== LEDGER_FILE) {
    throw new Error(`ai-review: ledgerPath must name a file called ${LEDGER_FILE}`);
  }
  assertRecordsDir(path.dirname(resolved), 'ledger directory');
  return resolved;
}

/**
 * Resolve the Anthropic API key: the environment first, then the `.env` file.
 * Both sources are injectable so a test never reads the real `.env`.
 *
 * @param {{ env?: Record<string, string|undefined>, envFile?: string }} [opts]
 * @returns {string} the key (never logged, never written)
 * @throws {Error} when neither source carries a non-empty key
 */
export function resolveApiKey({ env = process.env, envFile = DEFAULT_ENV_FILE } = {}) {
  const fromEnv = typeof env.ANTHROPIC_API_KEY === 'string' ? env.ANTHROPIC_API_KEY.trim() : '';
  if (fromEnv) return fromEnv;
  const vars = loadEnvFile(envFile);
  const fromFile = typeof vars.ANTHROPIC_API_KEY === 'string' ? vars.ANTHROPIC_API_KEY.trim() : '';
  if (fromFile) return fromFile;
  throw new Error(
    'ai-review: no Anthropic API key. Set ANTHROPIC_API_KEY in the environment, or put ' +
      `ANTHROPIC_API_KEY=… in the git-ignored .env at ${envFile}. Refusing to run without one.`
  );
}
