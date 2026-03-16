/**
 * Auth helpers for E2E tests.
 *
 * Generates JWT tokens and injects them as httpOnly cookies
 * so tests can authenticate without the GitHub OAuth flow.
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = 'test-secret-for-e2e-not-production';
const JWT_ISSUER = 'namsbokasafn-pipeline';

/**
 * Default user IDs per role — distinct IDs are essential because
 * approveEdit() blocks self-approval (editor_id == reviewerId).
 */
const DEFAULT_USER_IDS = {
  admin: 99999,
  'head-editor': 99998,
  editor: 99997,
  viewer: 99995,
};

/**
 * Create a JWT token for a test user with the given role.
 * @param {'admin'|'head-editor'|'editor'|'viewer'} role
 * @param {number} [userId] - Override the default user ID for this role
 * @returns {string} Signed JWT
 */
function getTestToken(role = 'admin', userId) {
  const sub = userId ?? DEFAULT_USER_IDS[role] ?? 99999;
  return jwt.sign(
    {
      sub,
      username: `test-${role}`,
      name: `Test ${role.charAt(0).toUpperCase() + role.slice(1)}`,
      avatar: '',
      role,
      books: role === 'head-editor' ? ['efnafraedi-2e'] : [],
    },
    JWT_SECRET,
    { issuer: JWT_ISSUER, expiresIn: '1h' }
  );
}

/**
 * Inject an auth cookie into the browser context so subsequent
 * navigations are authenticated.
 * @param {import('@playwright/test').Page} page
 * @param {'admin'|'head-editor'|'editor'|'viewer'} role
 * @param {number} [userId] - Override the default user ID for this role
 */
async function loginAs(page, role = 'admin', userId) {
  const token = getTestToken(role, userId);
  await page.context().addCookies([
    {
      name: 'auth_token',
      value: token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
    },
  ]);
}

module.exports = { getTestToken, loginAs, DEFAULT_USER_IDS };
