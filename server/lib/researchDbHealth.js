/**
 * The research file's health, as /api/health reports it (G1.2, spec §5.20).
 *
 * The endpoint is unauthenticated (server/index.js, the /api/health handler), so this reports a
 * REASON and never a count: a count of anything here would tell the world that someone consented
 * or withdrew. Nothing else is returned either: the result has exactly the keys `ok` and `reason`.
 *
 * Precedence of reasons (decision 37):
 *   1. the in-memory consent-lookup flag, or an unreadable research_consent -> 'consent-unavailable'
 *   2. the research path equal to the editorial path, or anything unreadable -> 'unavailable'
 *   3. the research file absent: 'missing' only if a consented row exists (the file is then owed),
 *      otherwise 'unavailable'
 *   4. a user_version other than RESEARCH_SCHEMA_VERSION -> 'unavailable'
 * Both files are opened read-only and must exist; nothing here ever creates or writes either.
 */
const fs = require('fs');
const Database = require('better-sqlite3');
const { RESEARCH_SCHEMA_VERSION } = require('./researchSchema');
const { BUSY_TIMEOUT_MS } = require('../services/researchDb');

/**
 * @param {{ editorialPath: string, researchPath: string, consentLookupFailing: boolean }} args
 * @returns {{ ok: boolean, reason: null | 'consent-unavailable' | 'missing' | 'unavailable' }}
 */
function readResearchDbHealth({ editorialPath, researchPath, consentLookupFailing } = {}) {
  const unavailable = { ok: false, reason: 'unavailable' };
  if (consentLookupFailing) return { ok: false, reason: 'consent-unavailable' };
  let editorial = null;
  let research = null;
  try {
    if (!editorialPath || !researchPath || editorialPath === researchPath) return unavailable;
    let consented;
    try {
      editorial = new Database(editorialPath, { readonly: true, fileMustExist: true });
      consented =
        editorial
          .prepare("SELECT 1 FROM research_consent WHERE decision = 'consented' LIMIT 1")
          .get() !== undefined;
    } catch {
      return { ok: false, reason: 'consent-unavailable' };
    }
    if (!fs.existsSync(researchPath))
      return consented ? { ok: false, reason: 'missing' } : unavailable;
    research = new Database(researchPath, {
      readonly: true,
      fileMustExist: true,
      timeout: BUSY_TIMEOUT_MS,
    });
    const version = Number(research.pragma('user_version', { simple: true }));
    return version === RESEARCH_SCHEMA_VERSION ? { ok: true, reason: null } : unavailable;
  } catch {
    return unavailable;
  } finally {
    for (const h of [editorial, research]) {
      try {
        if (h) h.close();
      } catch {
        // closing must never change the verdict
      }
    }
  }
}

module.exports = { readResearchDbHealth };
