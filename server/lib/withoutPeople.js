/**
 * Reads that a guest gets without the people in them ([USER] 2026-11-14, answers 6 and 7).
 *
 * A sign-in that matches no account is a visit: a `viewer` session (CLAUDE.md § Auth), so anyone in the school
 * tenant, students included. A route that asks only for a sign-in is open to them. Where such a route's answer
 * carries who did the work (a name, an account id, an e-mail address, a discussion), the content stays and the
 * people are left out for anyone below the editor role.
 */

const { ROLES, ROLE_HIERARCHY } = require('../constants');

/** Whether this session is below the editor role. No session, or a role this file does not know, is below. */
function isBelowEditor(user) {
  const level = ROLE_HIERARCHY[user && user.role] || 0;
  return level < ROLE_HIERARCHY[ROLES.EDITOR];
}

/** A deep copy of `value` in which no object, at any depth, holds one of `keys`. */
function withoutKeys(value, keys) {
  if (Array.isArray(value)) return value.map((item) => withoutKeys(item, keys));
  if (value === null || typeof value !== 'object') return value;
  const copy = {};
  for (const [key, inner] of Object.entries(value)) {
    if (!keys.includes(key)) copy[key] = withoutKeys(inner, keys);
  }
  return copy;
}

module.exports = { isBelowEditor, withoutKeys };
