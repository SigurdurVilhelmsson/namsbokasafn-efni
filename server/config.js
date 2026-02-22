/**
 * Server Configuration
 *
 * Validates required environment variables and provides runtime configuration.
 * This file MUST be imported before the server starts to ensure all required
 * secrets are available.
 */

/**
 * Required environment variables for production
 * The server will refuse to start if these are not set when NODE_ENV=production
 */
const REQUIRED_PRODUCTION_SECRETS = ['JWT_SECRET', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'];

/**
 * Validate that all required secrets are set
 * @throws {Error} If any required secret is missing in production
 */
function validateSecrets() {
  const isProduction = process.env.NODE_ENV === 'production';
  const missing = [];

  for (const key of REQUIRED_PRODUCTION_SECRETS) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    const message = `Missing required environment variables: ${missing.join(', ')}`;

    if (isProduction) {
      console.error('\n═══════════════════════════════════════════════════════════');
      console.error('FATAL: Server cannot start - missing required secrets');
      console.error('═══════════════════════════════════════════════════════════');
      console.error(message);
      console.error('\nSet these environment variables before starting the server.');
      console.error('═══════════════════════════════════════════════════════════\n');
      process.exit(1);
    } else {
      console.warn('\n⚠️  Warning: ' + message);
      console.warn('   This would be a fatal error in production (NODE_ENV=production).\n');
    }
  }

  // Validate JWT_SECRET strength in production
  if (isProduction && process.env.JWT_SECRET) {
    if (process.env.JWT_SECRET.length < 32) {
      console.error('FATAL: JWT_SECRET must be at least 32 characters in production');
      process.exit(1);
    }
    if (process.env.JWT_SECRET === 'development-secret-change-in-production') {
      console.error('FATAL: JWT_SECRET is set to the default development value');
      process.exit(1);
    }
  }
}

/**
 * Server configuration object
 */
const config = {
  // Server settings
  port: parseInt(process.env.PORT, 10) || 3000,
  host: ['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(process.env.HOST)
    ? process.env.HOST
    : 'localhost',
  nodeEnv: process.env.NODE_ENV || 'development',

  // Security settings
  isProduction: process.env.NODE_ENV === 'production',

  // Rate limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX, 10) || 500,
    authMaxRequests: parseInt(process.env.RATE_LIMIT_AUTH_MAX, 10) || 10,
  },

  // CORS
  corsOrigins: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : [],
};

/**
 * Valid book identifiers used across route files for parameter validation.
 * Add new books here as they are registered for translation.
 */
const VALID_BOOKS = ['efnafraedi', 'liffraedi'];

module.exports = {
  validateSecrets,
  config,
  REQUIRED_PRODUCTION_SECRETS,
  VALID_BOOKS,
};
