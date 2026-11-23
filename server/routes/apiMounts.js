/**
 * Every `/api/*` router, with the prefix index.js mounts it at, in mount order.
 *
 * One list for two readers: index.js mounts from it, and the route census
 * (server/__tests__/editorScopeCensus.test.js, G1.13 spec §6.1) walks it. A router mounted here is
 * therefore one the census sees; a router mounted in index.js some other way is one it would not,
 * which is why the census also checks that index.js requires no route module but this one and
 * views.js.
 *
 * Rate limiters stay in index.js, ahead of the loop that mounts these.
 */

/** @type {ReadonlyArray<{ prefix: string, router: import('express').Router }>} */
const API_MOUNTS = Object.freeze(
  [
    // Authentication & user management
    { prefix: '/api/auth', router: require('./auth') },
    { prefix: '/api/profile', router: require('./profile') },

    // Editorial workflow
    { prefix: '/api/segment-editor', router: require('./segment-editor') },
    { prefix: '/api/localization-editor', router: require('./localization-editor') },
    { prefix: '/api/terminology', router: require('./terminology') },
    { prefix: '/api/book-glossary', router: require('./book-glossary') },
    { prefix: '/api/suggestions', router: require('./suggestions') },

    // Administration & status
    { prefix: '/api/status', router: require('./status') },
    { prefix: '/api/admin', router: require('./admin') },
    { prefix: '/api/books', router: require('./books') },
    { prefix: '/api/tm', router: require('./tm') },
    { prefix: '/api/sections', router: require('./sections') },
    { prefix: '/api/my-work', router: require('./my-work') },

    // Pipeline (inject/render for apply-and-render flow)
    { prefix: '/api/pipeline', router: require('./pipeline') },
    { prefix: '/api/pipeline-status', router: require('./pipeline-status') },
    { prefix: '/api/publication', router: require('./publication') },

    // Support
    { prefix: '/api/notifications', router: require('./notifications') },
    { prefix: '/api/research', router: require('./research') },
    { prefix: '/api/activity', router: require('./activity') },
    { prefix: '/api/feedback', router: require('./feedback') },
    { prefix: '/api/analytics', router: require('./analytics') },
  ].map((mount) => Object.freeze(mount))
);

module.exports = { API_MOUNTS };
