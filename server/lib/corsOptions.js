/**
 * CORS for Ritstjóri (Skerfur plan G1.19).
 *
 * 🔴 CREDENTIALS ARE NOT ALLOWED FOR ANY CROSS-ORIGIN CALLER. The reader (namsbokasafn.is) is
 * SAME-SITE with Ritstjóri (ritstjorn.namsbokasafn.is): one registrable domain. So the
 * SameSite=Lax session cookie travels with a reader page's credentialed request, and with
 * `credentials: true` CORS then let that page READ the reply. Any script on a reader page,
 * a third-party one or an injected one, could act as whichever editor was signed in. The
 * reader needs no credentials: its only call is the analytics beacon, which reads no reply
 * and which [USER] has ruled to remove. (A JSON beacon needs a preflight, and a credentialed
 * preflight now fails, so the beacon stops counting. That is expected.)
 *
 * Ritstjóri's own pages are same-origin, so CORS does not apply to them and nothing here
 * changes them. The origin rules are unchanged: the reader's domain and its subdomains,
 * the local dev servers outside production, and CORS_ORIGIN.
 */

const READER_ORIGINS = ['https://namsbokasafn.is', 'https://www.namsbokasafn.is'];
const LOCAL_DEV_ORIGINS = [
  'http://localhost:5173', // Vite dev server
  'http://localhost:4173', // Vite preview
  'http://localhost:3000', // Local dev
];
const READER_SUBDOMAIN = /^https:\/\/[\w-]+\.namsbokasafn\.is$/;

/**
 * @param {{env?: string, extra?: string}} [opts] env is NODE_ENV; extra is CORS_ORIGIN
 * @returns {string[]}
 */
function allowedOrigins({ env = process.env.NODE_ENV, extra = process.env.CORS_ORIGIN } = {}) {
  const origins = [...READER_ORIGINS];
  if (env !== 'production') origins.push(...LOCAL_DEV_ORIGINS);
  if (extra) {
    origins.push(
      ...extra
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    );
  }
  return origins;
}

/**
 * Options for the `cors` middleware.
 * @param {{env?: string, extra?: string, onBlocked?: (origin: string) => void}} [opts]
 */
function corsOptions({
  env = process.env.NODE_ENV,
  extra = process.env.CORS_ORIGIN,
  onBlocked,
} = {}) {
  const origins = allowedOrigins({ env, extra });
  return {
    origin: (origin, callback) => {
      // In production, a request with no origin gets no CORS headers (curl, extensions, etc.)
      if (!origin) return callback(null, env !== 'production');
      if (origins.includes(origin) || READER_SUBDOMAIN.test(origin)) return callback(null, true);
      if (typeof onBlocked === 'function') onBlocked(origin);
      return callback(null, false);
    },
    // `credentials` is deliberately left unset: see the header.
  };
}

module.exports = { corsOptions, allowedOrigins };
