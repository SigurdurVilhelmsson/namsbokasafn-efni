/**
 * Authentication Service
 *
 * Handles Microsoft Entra ID (Azure AD) OAuth authentication and JWT session management.
 *
 * Flow:
 * 1. User clicks "Login with Microsoft"
 * 2. Redirect to Microsoft Entra authorization
 * 3. User approves, Microsoft redirects back with code
 * 4. Server exchanges code for access token
 * 5. Server fetches user profile via Microsoft Graph
 * 6. JWT issued for session (stored in httpOnly cookie)
 *
 * Role Mapping:
 * - ADMIN_USERS env var → Admin (matched by email)
 * - Database role → whatever the admin assigned
 * - Auto-created users → Viewer
 */

const jwt = require('jsonwebtoken');
const https = require('https');
const userService = require('./userService');
const { ROLES } = require('../constants');

// Enforce JWT_SECRET in all environments
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

// Configuration from environment (internal only - not exported)
const CONFIG = {
  msClientId: process.env.MS_CLIENT_ID,
  msClientSecret: process.env.MS_CLIENT_SECRET,
  msTenantId: process.env.MS_TENANT_ID || 'common',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiry: process.env.JWT_EXPIRY || '24h',
  callbackUrl:
    process.env.MS_CALLBACK_URL ||
    process.env.CALLBACK_URL ||
    'http://localhost:3000/api/auth/callback',
  // Comma-separated list of Microsoft emails with admin access
  adminUsers: (process.env.ADMIN_USERS || '')
    .split(',')
    .map((u) => u.trim().toLowerCase())
    .filter(Boolean),
};

// ROLES imported from constants.js (single source of truth)
const { ROLE_HIERARCHY } = require('../constants');

/**
 * Check if user has at least the required role
 */
function hasRole(userRole, requiredRole) {
  return (ROLE_HIERARCHY[userRole] || 0) >= (ROLE_HIERARCHY[requiredRole] || 0);
}

/**
 * Generate Microsoft Entra authorization URL
 */
function getAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: CONFIG.msClientId,
    redirect_uri: CONFIG.callbackUrl,
    response_type: 'code',
    scope: 'openid profile email User.Read',
    state,
    response_mode: 'query',
  });
  return `https://login.microsoftonline.com/${CONFIG.msTenantId}/oauth2/v2.0/authorize?${params}`;
}

/**
 * Exchange authorization code for access token
 */
async function exchangeCodeForToken(code) {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      client_id: CONFIG.msClientId,
      client_secret: CONFIG.msClientSecret,
      code,
      redirect_uri: CONFIG.callbackUrl,
      grant_type: 'authorization_code',
      scope: 'openid profile email User.Read',
    }).toString();

    const options = {
      hostname: 'login.microsoftonline.com',
      path: `/${CONFIG.msTenantId}/oauth2/v2.0/token`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(json.error_description || json.error));
          } else {
            resolve(json.access_token);
          }
        } catch {
          reject(new Error('Failed to parse Microsoft token response'));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Get Microsoft user info via Microsoft Graph API
 */
async function getMicrosoftUser(accessToken) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'graph.microsoft.com',
      path: '/v1.0/me',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 400) {
          try {
            const json = JSON.parse(data);
            reject(new Error(json.error?.message || `Microsoft Graph error: ${res.statusCode}`));
          } catch {
            reject(new Error(`Microsoft Graph error: ${res.statusCode}`));
          }
        } else {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error('Failed to parse Microsoft Graph response'));
          }
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * Determine user role based on in-app user database
 */
function determineUserRole(msUser) {
  const email = (msUser.mail || msUser.userPrincipalName || '').toLowerCase();

  // Check explicit admin list first (matched by email)
  if (email && CONFIG.adminUsers.includes(email)) {
    // Upsert into DB so admin appears in users table
    if (userService.isUserTableReady()) {
      const dbUser = userService.upsertFromProvider(msUser, {
        autoCreate: true,
        defaultRole: ROLES.ADMIN,
      });
      if (dbUser && dbUser.role !== ROLES.ADMIN) {
        userService.updateUser(dbUser.id, { role: ROLES.ADMIN });
      }
      return { role: ROLES.ADMIN, books: [], source: 'admin-list', dbUserId: dbUser?.id };
    }
    return { role: ROLES.ADMIN, books: [], source: 'admin-list' };
  }

  // Check in-app user database
  if (userService.isUserTableReady()) {
    // Try to find existing user by provider ID or email
    let dbUser = userService.findByProviderId(msUser.id);
    if (!dbUser && email) {
      dbUser = userService.findByEmail(email);
      // If found by email, update their provider_id for future lookups
      if (dbUser) {
        userService.updateProviderInfo(dbUser.id, msUser.id, email);
      }
    }

    if (dbUser) {
      if (!dbUser.is_active) {
        return null; // User deactivated
      }

      const headEditorBooks = userService.getHeadEditorBooks(dbUser);

      return {
        role: dbUser.role,
        books: headEditorBooks,
        source: 'database',
        dbUserId: dbUser.id,
      };
    }

    // User not in database — auto-create or deny
    if (process.env.AUTO_CREATE_USERS !== 'false') {
      dbUser = userService.upsertFromProvider(msUser, { autoCreate: true });
      if (dbUser) {
        return {
          role: dbUser.role,
          books: [],
          source: 'database-new',
          dbUserId: dbUser.id,
        };
      }
    }

    // If AUTO_CREATE_USERS=false and user not in database, deny access
    if (process.env.AUTO_CREATE_USERS === 'false') {
      return null;
    }
  }

  // No database available — deny by default (no legacy fallback like GitHub org/teams)
  return null;
}

/**
 * Create JWT token for authenticated user
 */
function createToken(user) {
  const payload = {
    sub: user.id,
    username: user.username,
    name: user.name,
    avatar: user.avatar,
    role: user.role,
    books: user.books || [],
  };

  return jwt.sign(payload, CONFIG.jwtSecret, {
    expiresIn: CONFIG.jwtExpiry,
    issuer: 'namsbokasafn-pipeline',
  });
}

/**
 * Verify and decode JWT token
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, CONFIG.jwtSecret, {
      issuer: 'namsbokasafn-pipeline',
    });
  } catch {
    return null;
  }
}

/**
 * Full authentication flow: code → token → user info → role → JWT
 */
async function authenticate(code) {
  // Exchange code for access token
  const accessToken = await exchangeCodeForToken(code);

  // Get user info from Microsoft Graph
  const msUser = await getMicrosoftUser(accessToken);

  // Determine role
  const roleInfo = determineUserRole(msUser);

  if (!roleInfo) {
    throw new Error('User is not authorized. Contact an administrator to request access.');
  }

  // Update last login if using database
  if (roleInfo.dbUserId) {
    userService.updateLastLogin(roleInfo.dbUserId);
  }

  // Create user object
  const email = msUser.mail || msUser.userPrincipalName || '';
  const user = {
    id: msUser.id,
    username: email,
    name: msUser.displayName || email,
    email,
    avatar: null, // Microsoft Graph photo requires separate binary fetch — not worth it for 5 users
    role: roleInfo.role,
    books: roleInfo.books,
    roleSource: roleInfo.source,
    dbUserId: roleInfo.dbUserId,
  };

  // Create JWT
  const token = createToken(user);

  return { user, token };
}

/**
 * Check if authentication is properly configured
 */
function isConfigured() {
  return !!(CONFIG.msClientId && CONFIG.msClientSecret && CONFIG.msTenantId);
}

/**
 * Get configuration status (for debugging)
 */
function getConfigStatus() {
  return {
    configured: isConfigured(),
    provider: 'microsoft',
    hasClientId: !!CONFIG.msClientId,
    hasClientSecret: !!CONFIG.msClientSecret,
    hasTenantId: !!CONFIG.msTenantId,
    callbackUrl: CONFIG.callbackUrl,
  };
}

module.exports = {
  // Auth functions
  getAuthUrl,
  authenticate,
  verifyToken,
  createToken,

  // Role helpers
  ROLES,
  hasRole,

  // Configuration
  isConfigured,
  getConfigStatus,
};
