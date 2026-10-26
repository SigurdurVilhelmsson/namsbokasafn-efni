/**
 * config.js — the AI layer's cap, default records location and API-key source.
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
