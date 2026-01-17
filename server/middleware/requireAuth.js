/**
 * Authentication Middleware
 *
 * Validates JWT tokens from cookies or Authorization header.
 * Attaches user info to req.user if authenticated.
 */

const { verifyToken } = require('../services/auth');

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
      loginUrl: '/api/auth/login'
    });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({
      error: 'Invalid or expired token',
      message: 'Please log in again',
      loginUrl: '/api/auth/login'
    });
  }

  // Attach user to request
  req.user = {
    id: decoded.sub,
    username: decoded.username,
    name: decoded.name,
    avatar: decoded.avatar,
    role: decoded.role,
    books: decoded.books || []
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
    if (decoded) {
      req.user = {
        id: decoded.sub,
        username: decoded.username,
        name: decoded.name,
        avatar: decoded.avatar,
        role: decoded.role,
        books: decoded.books || []
      };
    }
  }

  next();
}

module.exports = { requireAuth, optionalAuth };
