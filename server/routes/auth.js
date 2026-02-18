/**
 * Authentication Routes
 *
 * Handles GitHub OAuth flow and session management.
 *
 * Endpoints:
 *   GET  /api/auth/login          Redirect to GitHub authorization
 *   GET  /api/auth/callback       Handle GitHub OAuth callback
 *   GET  /api/auth/me             Get current user info
 *   POST /api/auth/logout         Clear authentication
 *   GET  /api/auth/status         Check auth configuration status
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

const auth = require('../services/auth');
const { optionalAuth } = require('../middleware/requireAuth');

// State tokens for CSRF protection (in production, use Redis or similar)
const stateTokens = new Map();

// Clean up expired state tokens every 5 minutes
setInterval(
  () => {
    const now = Date.now();
    for (const [token, data] of stateTokens) {
      if (now - data.created > 10 * 60 * 1000) {
        // 10 minute expiry
        stateTokens.delete(token);
      }
    }
  },
  5 * 60 * 1000
);

/**
 * GET /api/auth/status
 * Check if authentication is configured
 */
router.get('/status', (req, res) => {
  res.json(auth.getConfigStatus());
});

/**
 * GET /api/auth/login
 * Redirect to GitHub authorization
 *
 * Query params:
 *   - redirect: URL to redirect to after login (default: /)
 */
router.get('/login', (req, res) => {
  if (!auth.isConfigured()) {
    return res.status(503).json({
      error: 'Authentication not configured',
      message:
        'GitHub OAuth credentials are not set. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables.',
    });
  }

  // Generate state token for CSRF protection
  const state = uuidv4();
  stateTokens.set(state, {
    created: Date.now(),
    redirect: req.query.redirect || '/',
  });

  // Redirect to GitHub
  const authUrl = auth.getAuthUrl(state);
  res.redirect(authUrl);
});

/**
 * GET /api/auth/callback
 * Handle GitHub OAuth callback
 *
 * Query params:
 *   - code: Authorization code from GitHub
 *   - state: State token for CSRF verification
 */
router.get('/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  // Handle GitHub error
  if (error) {
    return res.status(400).json({
      error: 'GitHub authorization failed',
      message: error_description || error,
    });
  }

  // Verify state token
  if (!state || !stateTokens.has(state)) {
    return res.status(400).json({
      error: 'Invalid state token',
      message: 'CSRF verification failed. Please try logging in again.',
    });
  }

  const stateData = stateTokens.get(state);
  stateTokens.delete(state);

  if (!code) {
    return res.status(400).json({
      error: 'Missing authorization code',
      message: 'No authorization code received from GitHub',
    });
  }

  try {
    // Complete authentication
    const { user, token } = await auth.authenticate(code);

    // Set JWT as httpOnly cookie
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: '/',
    });

    // Redirect to original destination, with cache-bust param so nav.js refreshes
    const base = stateData.redirect || '/';
    const redirectUrl = base + (base.includes('?') ? '&' : '?') + 'loggedIn=1';

    // If this looks like an API request, return JSON instead
    if (req.headers.accept?.includes('application/json')) {
      return res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          avatar: user.avatar,
          role: user.role,
          books: user.books,
        },
        redirect: redirectUrl,
      });
    }

    // For browser requests, redirect
    res.redirect(redirectUrl);
  } catch (err) {
    console.error('Authentication error:', err);
    res.status(401).json({
      error: 'Authentication failed',
      message: err.message,
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', optionalAuth, (req, res) => {
  if (!req.user) {
    return res.json({
      authenticated: false,
      loginUrl: '/api/auth/login',
    });
  }

  res.json({
    authenticated: true,
    user: {
      id: req.user.id,
      username: req.user.username,
      name: req.user.name,
      avatar: req.user.avatar,
      role: req.user.role,
      books: req.user.books,
    },
  });
});

/**
 * POST /api/auth/logout
 * Clear authentication
 */
router.post('/logout', (req, res) => {
  res.clearCookie('auth_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });

  res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

/**
 * GET /api/auth/roles
 * List available roles (for documentation)
 */
router.get('/roles', (req, res) => {
  res.json({
    roles: [
      { name: 'admin', description: 'Full system access, org owners' },
      { name: 'head-editor', description: 'Manage assigned books, approve content' },
      { name: 'editor', description: 'Review and approve content' },
      { name: 'contributor', description: 'Upload translations, report issues' },
      { name: 'viewer', description: 'View status, download published content' },
    ],
    note: 'Roles are determined by GitHub organization and team membership',
  });
});

module.exports = router;
