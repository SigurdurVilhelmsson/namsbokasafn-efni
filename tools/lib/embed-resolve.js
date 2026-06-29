/**
 * Pure embed-resolution logic for tools/resolve-embeds.js.
 * Network is injected so the unit tests run offline.
 */

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
    try {
      const res = await fetchFn(src, { redirect: 'follow', method: 'GET' });
      const resolved = res.url || src;
      const status =
        res.status >= 200 && res.status < 400 && isFramable(res.headers) ? 'ok' : 'blocked';
      out[src] = { resolved, kind: classifyKind(resolved), status };
    } catch {
      out[src] = { resolved: '', kind: 'other', status: 'error' };
    }
  }
  return out;
}
