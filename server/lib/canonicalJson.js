// server/lib/canonicalJson.js — JSON with object keys sorted at every depth (spec §5.13).
// Arrays keep their order. Used so a flag snapshot has one byte form per set of values.

/**
 * @param {*} value A JSON-able value.
 * @returns {string} JSON.stringify output with sorted object keys.
 */
function canonicalJson(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, sortKeys(v[k])])
    );
  }
  return v;
}

module.exports = { canonicalJson };
