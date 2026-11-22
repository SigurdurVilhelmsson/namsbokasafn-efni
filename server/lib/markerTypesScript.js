/**
 * GET /js/marker-types.js — the bracket-marker taxonomy for the browser, built from its one owner,
 * `tools/lib/marker-types.json`, at request time: no copy, no build step (G1.11; spec
 * docs/superpowers/specs/2026-11-21-c248-g111-toolbar-dialect-and-marker-gate-design.md §4.1).
 *
 * The editor pages load it before marker-integrity.js, which reads `window.markerTypes`.
 * `server/` reading `tools/` is the permitted direction (CLAUDE.md, known gap E-2 is the reverse).
 */
const TAXONOMY = require('../../tools/lib/marker-types.json');

const BODY = 'window.markerTypes = ' + JSON.stringify(TAXONOMY) + ';\n';

/** Express handler: the taxonomy as a script that sets `window.markerTypes`. */
function markerTypesScript(req, res) {
  res.type('application/javascript').set('Cache-Control', 'no-cache').send(BODY);
}

module.exports = { markerTypesScript };
