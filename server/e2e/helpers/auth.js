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
 * Create a JWT token for a test user with the given role.
 * @param {'admin'|'head-editor'|'editor'|'contributor'|'viewer'} role
 * @returns {string} Signed JWT
 */
function getTestToken(role = 'admin') {
  return jwt.sign(
    {
      sub: 99999,
      username: `test-${role}`,
      name: `Test ${role.charAt(0).toUpperCase() + role.slice(1)}`,
      avatar: '',
      role,
      books: role === 'head-editor' ? ['efnafraedi'] : [],
    },
    JWT_SECRET,
    { issuer: JWT_ISSUER, expiresIn: '1h' }
  );
}

/**
 * Inject an auth cookie into the browser context so subsequent
 * navigations are authenticated.
 * @param {import('@playwright/test').Page} page
 * @param {'admin'|'head-editor'|'editor'|'contributor'|'viewer'} role
 */
async function loginAs(page, role = 'admin') {
  const token = getTestToken(role);
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

module.exports = { getTestToken, loginAs };
