/**
 * Refuse a compressed request body before anything reads it (register §C200).
 *
 * Express 5's `express.json` / `express.urlencoded` (body-parser 2.x) inflate
 * `Content-Encoding: gzip | deflate | br` by default, and here they are mounted
 * globally, before any route or auth. So anyone could feed bytes to Node's
 * Brotli decoder, which had an out-of-bounds write: CVE-2026-111497
 * ("Node2Shell"), fixed in Node 22.23.4 / 24.22.1 / 26.12.1. The CORS branch
 * above the parsers does not stop it: with no Origin it only withholds the CORS
 * headers, and an Origin header is one line for any non-browser client.
 *
 * No browser compresses a request body, and nothing this server serves asks
 * one to, so the server has no reason to decode one at all. index.js also
 * passes `inflate: false` to both parsers, so the refusal survives this
 * middleware being moved below them.
 *
 * `identity` (in any case), an empty value and an absent header pass, as they
 * do in body-parser itself. Anything else — a single coding or a list — is
 * refused, since a list is still a compressed body.
 */

function refuseCompressedBodies(req, res, next) {
  const encoding = req.headers['content-encoding'];
  if (encoding && encoding.trim().toLowerCase() !== 'identity') {
    return res.status(415).json({
      error: 'Unsupported Media Type',
      message: 'Compressed request bodies are not accepted',
    });
  }
  next();
}

module.exports = { refuseCompressedBodies };
