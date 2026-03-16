/**
 * Profile API Routes
 *
 * Lets authenticated users view and update their own profile fields
 * (display_name, school, subject, bio).
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/requireAuth');
const userService = require('../services/userService');

/**
 * GET /api/profile
 * Return the current user's full profile from the database.
 */
router.get('/', requireAuth, (req, res) => {
  const user = userService.findByProviderId(req.user.id);

  if (!user) {
    return res.status(404).json({
      error: 'Not found',
      message: 'User profile not found',
    });
  }

  res.json({
    id: user.id,
    displayName: user.display_name,
    email: user.email,
    role: user.role,
    school: user.school || '',
    subject: user.subject || '',
    bio: user.bio || '',
    bookAccess: user.bookAccess || [],
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at,
  });
});

/**
 * PUT /api/profile
 * Update the current user's own profile fields.
 * Only allows safe fields — cannot change role or active status.
 */
router.put('/', requireAuth, (req, res) => {
  const user = userService.findByProviderId(req.user.id);

  if (!user) {
    return res.status(404).json({
      error: 'Not found',
      message: 'User profile not found',
    });
  }

  const { displayName, school, subject, bio } = req.body;

  const updates = {};
  if (displayName !== undefined) {
    const trimmed = String(displayName).trim().slice(0, 200);
    if (!trimmed) {
      return res.status(400).json({
        error: 'Invalid value',
        message: 'Display name cannot be empty',
      });
    }
    updates.displayName = trimmed;
  }
  if (school !== undefined) updates.school = String(school).trim().slice(0, 200);
  if (subject !== undefined) updates.subject = String(subject).trim().slice(0, 200);
  if (bio !== undefined) updates.bio = String(bio).trim().slice(0, 1000);

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({
      error: 'No fields to update',
      message: 'Provide at least one of: displayName, school, subject, bio',
    });
  }

  const updated = userService.updateUser(user.id, updates, req.user.username);

  res.json({
    id: updated.id,
    displayName: updated.display_name,
    email: updated.email,
    role: updated.role,
    school: updated.school || '',
    subject: updated.subject || '',
    bio: updated.bio || '',
  });
});

module.exports = router;
