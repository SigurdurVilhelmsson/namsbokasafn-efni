/**
 * Pure embed-resolution logic for tools/resolve-embeds.js.
 * Network is injected so the unit tests run offline.
 */

/**
 * Mirror of vefur's nginx `frame-src` CSP allowlist
 * (`../namsbokasafn-vefur/nginx-config-example.conf`: `frame-src https://www.youtube.com
 * https://phet.colorado.edu;`). Keyed on the RESOLVED URL's exact hostname — the same
 * hostname the CSP sees — not the looser forms `classifyKind` accepts (`youtube.com`
 * suffix, `youtu.be`).
 *
 * These two lists move together: widening one requires widening the other. Verified
 * against a census of all 98 resolved entries across both books' embed-mapping.json
 * (liffraedi-2e 51, edlisfraedi-2e 47) — every host is exactly one of these two.
 */
export const ALLOWED_EMBED_HOSTS = new Set(['www.youtube.com', 'phet.colorado.edu']);

/** Classify a resolved embed URL by host. */
export function classifyKind(url) {
  try {
    const host = new URL(url).hostname;
    if (host.endsWith('youtube.com') || host.endsWith('youtu.be')) return 'youtube';
    if (host.endsWith('phet.colorado.edu')) return 'phet';
    return 'other';
  } catch {
    return 'other';
  }
}

/**
 * Canonicalize YouTube watch/short URLs to the embeddable /embed/<id> form.
 * - youtube.com/watch?v=<id> (any variant host) → https://www.youtube.com/embed/<id>
 * - youtu.be/<id>            → https://www.youtube.com/embed/<id>
 * - Already /embed/ or non-YouTube: returned unchanged.
 * Preserves the `list=` query param (playlist context); drops tracking params.
 * @param {string} url
 * @returns {string}
 */
export function canonicalizeYouTube(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  const host = parsed.hostname;
  const isYouTubeHost =
    host === 'www.youtube.com' || host === 'youtube.com' || host === 'm.youtube.com';
  const isShortHost = host === 'youtu.be';

  if (!isYouTubeHost && !isShortHost) return url;

  // Already embed — strip non-allowlisted query params (keep list= for playlist context).
  if (isYouTubeHost && parsed.pathname.startsWith('/embed/')) {
    const list = parsed.searchParams.get('list');
    const clean = new URL(`${parsed.protocol}//${parsed.host}${parsed.pathname}`);
    if (list) clean.searchParams.set('list', list);
    return clean.toString();
  }

  let videoId;
  if (isYouTubeHost && parsed.pathname === '/watch') {
    videoId = parsed.searchParams.get('v');
  } else if (isShortHost) {
    // path is /<id>
    videoId = parsed.pathname.slice(1).split('/')[0];
  }

  if (!videoId) return url;

  const embedUrl = new URL(`https://www.youtube.com/embed/${videoId}`);
  const list = parsed.searchParams.get('list');
  if (list) embedUrl.searchParams.set('list', list);

  return embedUrl.toString();
}

/**
 * Find resolved (`status:'ok'`) mapping entries whose host is not on
 * ALLOWED_EMBED_HOSTS — vefur's CSP frame-src. Used by resolve-embeds.js to fail
 * loud at intake: a host outside the allowlist would render fine here and be
 * silently CSP-blocked in vefur production (an empty box, no test/build failure).
 * Non-ok entries (blocked/error) are skipped — those already get their own
 * "did not resolve to a framable target" report.
 * @param {Record<string,{resolved:string,kind:string,status:string}>} mapping
 * @returns {Array<{src:string, resolved:string, host:string|null}>}
 */
export function findOffAllowlistEmbeds(mapping) {
  const offenders = [];
  for (const [src, entry] of Object.entries(mapping)) {
    if (entry.status !== 'ok') continue;
    let host = null;
    try {
      host = new URL(entry.resolved).hostname;
    } catch {
      // unparseable resolved URL — also an offender, reported with host: null
    }
    if (!host || !ALLOWED_EMBED_HOSTS.has(host)) {
      offenders.push({ src, resolved: entry.resolved, host });
    }
  }
  return offenders;
}

/** A final target is framable unless it sends X-Frame-Options DENY/SAMEORIGIN. */
function isFramable(headers) {
  const xfo = (headers.get('x-frame-options') || '').toLowerCase();
  return !(xfo.includes('deny') || xfo.includes('sameorigin'));
}

/**
 * Resolve each /l/ src to its final URL + framing status.
 * @param {string[]} srcs - distinct original iframe srcs
 * @param {typeof globalThis.fetch} [fetchFn]
 * @returns {Promise<Record<string,{resolved:string,kind:string,status:string}>>}
 */
export async function resolveEmbeds(srcs, fetchFn = globalThis.fetch) {
  const out = {};
  for (const src of srcs) {
    // Hoisted so the catch block can emit the best URL we computed before the error.
    let canonical = src;
    try {
      const res = await fetchFn(src, { redirect: 'follow', method: 'GET' });
      let resolved = res.url || src;
      let headers = res.headers;
      let httpStatus = res.status;

      // Canonicalize watch?v= and youtu.be short URLs to /embed/ before deciding
      // framability — watch pages deny framing but /embed/ is designed to be framed.
      canonical = canonicalizeYouTube(resolved);
      if (canonical !== resolved) {
        // Only re-fetch when origin+pathname actually changed (watch→embed).
        // A query-only strip (e.g. ?si= removed) doesn't need a new request.
        const samePageCanonical =
          new URL(canonical).origin === new URL(resolved).origin &&
          new URL(canonical).pathname === new URL(resolved).pathname;
        if (!samePageCanonical) {
          // Re-fetch the embed URL to get accurate framing headers.
          const embedRes = await fetchFn(canonical, { redirect: 'follow', method: 'GET' });
          headers = embedRes.headers;
          httpStatus = embedRes.status;
        }
        resolved = canonical;
      }

      const status = httpStatus >= 400 ? 'error' : isFramable(headers) ? 'ok' : 'blocked';
      out[src] = { resolved, kind: classifyKind(resolved), status };
    } catch {
      out[src] = { resolved: canonical, kind: classifyKind(canonical), status: 'error' };
    }
  }
  return out;
}
