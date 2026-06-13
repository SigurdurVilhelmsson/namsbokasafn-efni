/**
 * greynirEngine — adapter to a GreynirCorrect proofreading sidecar.
 *
 * GreynirCorrect (Miðeind) is the best open Icelandic grammar/spelling checker,
 * but it is Python — so it runs as a small HTTP sidecar (see
 * server/greynir-sidecar/) and this module is the Node client.
 *
 * Sidecar contract:
 *   POST {GREYNIR_URL}/correct   body: { "text": "<is prose>" }
 *   200  { "corrections": [ { start, end, original, suggestions: [..],
 *                             code, message } ] }
 *
 * Gated behind GREYNIR_URL: with no URL configured (and no injected transport)
 * the engine is disabled and returns [] — the QA layer degrades to the
 * engine-free checks, and a save/proofread is never blocked by Greynir being
 * down or slow (short timeout, errors swallowed).
 *
 * Because GreynirCorrect doesn't distinguish "spelling" from "grammar" in a way
 * we surface differently, all findings carry `type` from the sidecar (default
 * 'grammar') and flow through qaCheckService as spell-engine findings.
 */
const log = require('../lib/logger');

const DEFAULT_TIMEOUT_MS = 4000;

/**
 * Default transport: POST text to the configured sidecar. Returns the parsed
 * `corrections` array, or throws on a non-OK response / network error.
 */
async function httpTransport(text, { url, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/correct`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Greynir sidecar ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.corrections) ? data.corrections : [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Map one sidecar correction to a qaCheckService finding.
 * @param {object} c
 * @returns {{type, word, span, suggestions, code, message}}
 */
function toFinding(c) {
  const suggestions = Array.isArray(c.suggestions) ? c.suggestions : [];
  const original = c.original || '';
  // The sidecar sets `type`; fall back to the GreynirCorrect code convention
  // (S* = spelling) so a correction without an explicit type is still classed.
  const isSpelling = c.type === 'spelling' || (c.code && String(c.code).startsWith('S'));
  return {
    type: isSpelling ? 'spelling' : 'grammar',
    word: original,
    span: c.start != null && c.end != null ? [c.start, c.end] : null,
    suggestions,
    code: c.code || null,
    message:
      c.message ||
      (suggestions.length
        ? `„${original}“ → ${suggestions.map((s) => `„${s}“`).join(', ')}`
        : `Máltækni-ábending: „${original}“`),
  };
}

/**
 * Is the engine configured (URL or an injected transport)?
 * @param {{ url?: string }} [opts]
 */
function isEnabled({ url = process.env.GREYNIR_URL } = {}) {
  return !!url;
}

/**
 * Check Icelandic prose via the sidecar. Async. Never throws — returns [] when
 * disabled, on timeout, or on any sidecar error (logged at debug/warn).
 *
 * @param {string} text
 * @param {{ url?, timeoutMs?, transport? }} [opts]
 *   transport: test seam — `(text, { url, timeoutMs }) => Promise<correction[]>`
 * @returns {Promise<Array>} findings
 */
async function check(text, opts = {}) {
  const url = opts.url ?? process.env.GREYNIR_URL;
  const transport = opts.transport || httpTransport;
  if (!text || (!url && !opts.transport)) return [];
  try {
    const corrections = await transport(text, {
      url,
      timeoutMs: opts.timeoutMs || DEFAULT_TIMEOUT_MS,
    });
    return (corrections || []).map(toFinding);
  } catch (err) {
    log.warn({ err: err.message }, 'Greynir proofreading unavailable — skipping');
    return [];
  }
}

module.exports = { check, toFinding, isEnabled, httpTransport };
