/**
 * Authentication Middleware
 *
 * Validates JWT tokens from cookies or Authorization header.
 * Attaches user info to req.user if authenticated.
 *
 * SECURITY NOTE: There is no bypass for testing. Tests should:
 * 1. Use proper JWT tokens from the auth service
 * 2. Run against a test database with test users
 * 3. Mock the auth middleware in unit tests if needed
 */

const { verifyToken, currentAccess } = require('../services/auth');

/**
 * Require authentication middleware
 *
 * Usage:
 *   router.get('/protected', requireAuth, (req, res) => {
 *     // req.user is available
 *   });
 */
function requireAuth(req, res, next) {
  // Check for token in cookie first, then Authorization header
  let token = req.cookies?.auth_token;

  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please log in to access this resource',
      loginUrl: '/api/auth/login',
    });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({
      error: 'Invalid or expired token',
      message: 'Please log in again',
      loginUrl: '/api/auth/login',
    });
  }

  // The role and books come from the account as it is now, not as it was when the token was
  // minted: services/auth.js currentAccess says why, and what a missing row means.
  const access = currentAccess(decoded);
  if (!access) {
    return res.status(401).json({
      error: 'Account deactivated',
      message: 'This account is no longer active',
      loginUrl: '/api/auth/login',
    });
  }

  // Attach user to request
  req.user = {
    id: decoded.sub,
    username: decoded.username,
    name: decoded.name,
    avatar: decoded.avatar,
    role: access.role,
    books: access.books,
  };

  next();
}

/**
 * Optional authentication middleware
 *
 * Attaches user info if authenticated, but doesn't require it.
 * Useful for endpoints that have different behavior for logged-in users.
 */
function optionalAuth(req, res, next) {
  let token = req.cookies?.auth_token;

  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (token) {
    const decoded = verifyToken(token);
    // A deactivated account is treated as signed out, like an invalid token.
    const access = decoded ? currentAccess(decoded) : null;
    if (access) {
      req.user = {
        id: decoded.sub,
        username: decoded.username,
        name: decoded.name,
        avatar: decoded.avatar,
        role: access.role,
        books: access.books,
      };
    }
  }

  next();
}

module.exports = { requireAuth, optionalAuth };
