/**
 * Authentication Service
 *
 * Handles GitHub OAuth authentication and JWT session management.
 *
 * Flow:
 * 1. User clicks "Login with GitHub"
 * 2. Redirect to GitHub authorization
 * 3. User approves, GitHub redirects back with code
 * 4. Server exchanges code for access token
 * 5. Server checks GitHub org/team membership for role
 * 6. JWT issued for session (stored in httpOnly cookie)
 *
 * Role Mapping:
 * - GitHub org member → Viewer
 * - Team `contributors` → Contributor
 * - Team `editors` → Editor
 * - Team `book-{id}-head` → Head Editor for that book
 * - Org owner → Admin
 */

const jwt = require('jsonwebtoken');
const https = require('https');

// Configuration from environment
const CONFIG = {
  githubClientId: process.env.GITHUB_CLIENT_ID,
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET,
  githubOrg: process.env.GITHUB_ORG || 'namsbokasafn',
  jwtSecret: process.env.JWT_SECRET || 'development-secret-change-in-production',
  jwtExpiry: process.env.JWT_EXPIRY || '24h',
  callbackUrl: process.env.GITHUB_CALLBACK_URL || 'http://localhost:3000/api/auth/callback',
  // Comma-separated list of GitHub usernames with admin access (useful for org owners)
  adminUsers: (process.env.ADMIN_USERS || '').split(',').map(u => u.trim()).filter(Boolean)
};

// Role hierarchy
const ROLES = {
  ADMIN: 'admin',
  HEAD_EDITOR: 'head-editor',
  EDITOR: 'editor',
  CONTRIBUTOR: 'contributor',
  VIEWER: 'viewer'
};

const ROLE_HIERARCHY = {
  [ROLES.ADMIN]: 5,
  [ROLES.HEAD_EDITOR]: 4,
  [ROLES.EDITOR]: 3,
  [ROLES.CONTRIBUTOR]: 2,
  [ROLES.VIEWER]: 1
};

/**
 * Check if user has at least the required role
 */
function hasRole(userRole, requiredRole) {
  return (ROLE_HIERARCHY[userRole] || 0) >= (ROLE_HIERARCHY[requiredRole] || 0);
}

/**
 * Generate GitHub OAuth authorization URL
 */
function getAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: CONFIG.githubClientId,
    redirect_uri: CONFIG.callbackUrl,
    scope: 'read:user read:org',
    state
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

/**
 * Exchange authorization code for access token
 */
async function exchangeCodeForToken(code) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      client_id: CONFIG.githubClientId,
      client_secret: CONFIG.githubClientSecret,
      code
    });

    const options = {
      hostname: 'github.com',
      path: '/login/oauth/access_token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(json.error_description || json.error));
          } else {
            resolve(json.access_token);
          }
        } catch (e) {
          reject(new Error('Failed to parse GitHub response'));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Get GitHub user info
 */
async function getGitHubUser(accessToken) {
  return githubApiRequest('/user', accessToken);
}

/**
 * Check if user is member of the organization
 */
async function checkOrgMembership(accessToken, username) {
  try {
    await githubApiRequest(`/orgs/${CONFIG.githubOrg}/members/${username}`, accessToken);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Get user's teams in the organization
 */
async function getUserTeams(accessToken) {
  try {
    const teams = await githubApiRequest(`/user/teams`, accessToken);
    // Filter to only teams in our org
    return teams
      .filter(team => team.organization?.login === CONFIG.githubOrg)
      .map(team => team.slug);
  } catch (err) {
    return [];
  }
}

/**
 * Check if user is org owner
 */
async function isOrgOwner(accessToken, username) {
  try {
    const membership = await githubApiRequest(
      `/orgs/${CONFIG.githubOrg}/memberships/${username}`,
      accessToken
    );
    return membership.role === 'admin';
  } catch (err) {
    return false;
  }
}

/**
 * Determine user role based on org membership and teams
 */
async function determineUserRole(accessToken, username) {
  // Check explicit admin list first (for org owners, useful when API check fails)
  if (CONFIG.adminUsers.includes(username)) {
    return { role: ROLES.ADMIN, books: [] };
  }

  // Check if org member first
  const isMember = await checkOrgMembership(accessToken, username);
  if (!isMember) {
    return null; // Not a member, no access
  }

  // Check if org owner (admin)
  if (await isOrgOwner(accessToken, username)) {
    return { role: ROLES.ADMIN, books: [] };
  }

  // Get teams
  const teams = await getUserTeams(accessToken);

  // Check for head editor teams (book-{id}-head)
  const headEditorBooks = teams
    .filter(t => t.startsWith('book-') && t.endsWith('-head'))
    .map(t => t.replace('book-', '').replace('-head', ''));

  if (headEditorBooks.length > 0) {
    return { role: ROLES.HEAD_EDITOR, books: headEditorBooks };
  }

  // Check for editors team
  if (teams.includes('editors')) {
    return { role: ROLES.EDITOR, books: [] };
  }

  // Check for contributors team
  if (teams.includes('contributors')) {
    return { role: ROLES.CONTRIBUTOR, books: [] };
  }

  // Default: viewer (org member)
  return { role: ROLES.VIEWER, books: [] };
}

/**
 * GitHub API request helper
 */
function githubApiRequest(path, accessToken) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'namsbokasafn-pipeline'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 404) {
          reject(new Error('Not found'));
        } else if (res.statusCode === 204) {
          resolve(null); // No content (e.g., membership check success)
        } else if (res.statusCode >= 400) {
          try {
            const json = JSON.parse(data);
            reject(new Error(json.message || `HTTP ${res.statusCode}`));
          } catch {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        } else {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
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
    books: user.books || []
  };

  return jwt.sign(payload, CONFIG.jwtSecret, {
    expiresIn: CONFIG.jwtExpiry,
    issuer: 'namsbokasafn-pipeline'
  });
}

/**
 * Verify and decode JWT token
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, CONFIG.jwtSecret, {
      issuer: 'namsbokasafn-pipeline'
    });
  } catch (err) {
    return null;
  }
}

/**
 * Full authentication flow: code → token → user info → role → JWT
 */
async function authenticate(code) {
  // Exchange code for access token
  const accessToken = await exchangeCodeForToken(code);

  // Get user info
  const githubUser = await getGitHubUser(accessToken);

  // Determine role
  const roleInfo = await determineUserRole(accessToken, githubUser.login);

  if (!roleInfo) {
    throw new Error('User is not a member of the organization');
  }

  // Create user object
  const user = {
    id: githubUser.id,
    username: githubUser.login,
    name: githubUser.name || githubUser.login,
    email: githubUser.email,
    avatar: githubUser.avatar_url,
    role: roleInfo.role,
    books: roleInfo.books,
    githubAccessToken: accessToken // Store for API calls
  };

  // Create JWT
  const token = createToken(user);

  return { user, token };
}

/**
 * Check if authentication is properly configured
 */
function isConfigured() {
  return !!(CONFIG.githubClientId && CONFIG.githubClientSecret);
}

/**
 * Get configuration status (for debugging)
 */
function getConfigStatus() {
  return {
    configured: isConfigured(),
    hasClientId: !!CONFIG.githubClientId,
    hasClientSecret: !!CONFIG.githubClientSecret,
    org: CONFIG.githubOrg,
    callbackUrl: CONFIG.callbackUrl
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
  CONFIG
};
