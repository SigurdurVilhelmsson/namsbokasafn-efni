/**
 * Structured Logger
 *
 * Wraps pino for structured JSON logging in production and
 * pretty-printed output in development.
 *
 * Usage:
 *   const log = require('../lib/logger');
 *   log.info('Server started');
 *   log.info({ book, chapter }, 'Processing chapter');
 *   log.error({ err }, 'Failed to load module');
 *   log.warn('Deprecated endpoint called');
 *
 * Log levels: fatal, error, warn, info, debug, trace
 * Default: 'info' in production, 'debug' in development
 */

const pino = require('pino');

const isProduction = process.env.NODE_ENV === 'production';
const level = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

const transport = isProduction
  ? undefined // JSON to stdout in production
  : {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    };

const logger = pino({
  level,
  transport,
  // Redact sensitive fields from logs
  redact: {
    paths: ['req.headers.cookie', 'req.headers.authorization'],
    censor: '[REDACTED]',
  },
});

module.exports = logger;
