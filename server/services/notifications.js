/**
 * Notification Service
 *
 * Handles both email and in-app notifications for the editorial workflow.
 *
 * Email notifications require SMTP configuration via environment variables:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 *
 * If SMTP is not configured, notifications are logged to console and stored
 * in the database for in-app display.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Database path
const DB_PATH = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db');

// Notification types
const NOTIFICATION_TYPES = {
  REVIEW_SUBMITTED: 'review_submitted',
  REVIEW_APPROVED: 'review_approved',
  CHANGES_REQUESTED: 'changes_requested',
  // Hand-off notifications
  ASSIGNMENT_CREATED: 'assignment_created',
  ASSIGNMENT_HANDOFF: 'assignment_handoff',
  STAGE_COMPLETED: 'stage_completed',
  CHAPTER_KICKOFF: 'chapter_kickoff'
};

// Stage labels in Icelandic
const STAGE_LABELS = {
  enMarkdown: 'EN Markdown',
  mtOutput: 'Vélþýðing',
  linguisticReview: 'Málfarsskoðun',
  tmCreated: 'Þýðingaminni',
  publication: 'Útgáfa'
};

// Notification categories for preferences
const NOTIFICATION_CATEGORIES = {
  reviews: {
    label: 'Yfirferðir',
    description: 'Tilkynningar um yfirferðir (sendar, samþykktar, breytingar óskast)',
    types: ['review_submitted', 'review_approved', 'changes_requested']
  },
  assignments: {
    label: 'Úthlutanir',
    description: 'Tilkynningar um verkefnaúthlutanir og afhendingar',
    types: ['assignment_created', 'assignment_handoff', 'stage_completed', 'chapter_kickoff']
  },
  feedback: {
    label: 'Endurgjöf',
    description: 'Tilkynningar um endurgjöf frá lesendum',
    types: ['feedback_received']
  }
};

// Default preferences (all enabled)
const DEFAULT_PREFERENCES = {
  reviews: { inApp: true, email: true },
  assignments: { inApp: true, email: true },
  feedback: { inApp: true, email: true }
};

// Initialize database tables
function initDb() {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Create notifications table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link TEXT,
      metadata TEXT,
      read INTEGER DEFAULT 0,
      email_sent INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
    CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

    -- Notification preferences table
    CREATE TABLE IF NOT EXISTS notification_preferences (
      user_id TEXT PRIMARY KEY,
      preferences TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  return db;
}

const db = initDb();

// Prepared statements
const statements = {
  insertNotification: db.prepare(`
    INSERT INTO notifications (user_id, type, title, message, link, metadata, email_sent)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  getUnreadForUser: db.prepare(`
    SELECT * FROM notifications
    WHERE user_id = ? AND read = 0
    ORDER BY created_at DESC
    LIMIT ?
  `),
  getAllForUser: db.prepare(`
    SELECT * FROM notifications
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `),
  markAsRead: db.prepare(`
    UPDATE notifications SET read = 1 WHERE id = ?
  `),
  markAllAsRead: db.prepare(`
    UPDATE notifications SET read = 1 WHERE user_id = ?
  `),
  getUnreadCount: db.prepare(`
    SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0
  `),
  getAdminUserIds: db.prepare(`
    SELECT DISTINCT user_id FROM notifications WHERE user_id IN (
      SELECT user_id FROM notifications GROUP BY user_id
    )
  `),
  // Preferences statements
  getPreferences: db.prepare(`
    SELECT preferences FROM notification_preferences WHERE user_id = ?
  `),
  upsertPreferences: db.prepare(`
    INSERT INTO notification_preferences (user_id, preferences, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET preferences = excluded.preferences, updated_at = CURRENT_TIMESTAMP
  `)
};

/**
 * Get notification preferences for a user
 * Returns default preferences if user hasn't set any
 */
function getPreferences(userId) {
  const row = statements.getPreferences.get(userId);
  if (row && row.preferences) {
    try {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(row.preferences) };
    } catch (e) {
      console.error('Error parsing preferences:', e);
    }
  }
  return { ...DEFAULT_PREFERENCES };
}

/**
 * Set notification preferences for a user
 */
function setPreferences(userId, preferences) {
  const merged = { ...DEFAULT_PREFERENCES, ...preferences };
  statements.upsertPreferences.run(userId, JSON.stringify(merged));
  return merged;
}

/**
 * Check if a notification type is enabled for a user
 * @param {string} userId - User ID
 * @param {string} type - Notification type
 * @param {string} channel - 'inApp' or 'email'
 * @returns {boolean}
 */
function isNotificationEnabled(userId, type, channel = 'inApp') {
  const prefs = getPreferences(userId);

  // Find which category this type belongs to
  for (const [category, config] of Object.entries(NOTIFICATION_CATEGORIES)) {
    if (config.types.includes(type)) {
      return prefs[category]?.[channel] !== false;
    }
  }

  // Unknown type - default to enabled
  return true;
}

/**
 * Check if email is configured
 */
function isEmailConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/**
 * Send email notification
 * Returns true if sent, false if not configured
 */
async function sendEmail(to, subject, htmlBody, textBody) {
  if (!isEmailConfigured()) {
    console.log('[Notification] Email not configured, skipping email to:', to);
    console.log('[Notification] Subject:', subject);
    return false;
  }

  try {
    // Dynamically import nodemailer only when needed
    const nodemailer = require('nodemailer');

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text: textBody,
      html: htmlBody
    });

    console.log('[Notification] Email sent to:', to);
    return true;
  } catch (err) {
    console.error('[Notification] Email failed:', err.message);
    return false;
  }
}

/**
 * Create a notification (in-app + optional email)
 * Respects user's notification preferences
 */
async function createNotification(options) {
  const {
    userId,
    userEmail,
    type,
    title,
    message,
    link,
    metadata = {},
    skipPreferenceCheck = false // For system/admin notifications
  } = options;

  // Check if in-app notification is enabled for this user
  const inAppEnabled = skipPreferenceCheck || isNotificationEnabled(userId, type, 'inApp');
  const emailEnabled = skipPreferenceCheck || isNotificationEnabled(userId, type, 'email');

  let notificationId = null;
  let emailSent = false;

  // Store in database if in-app is enabled
  if (inAppEnabled) {
    const result = statements.insertNotification.run(
      userId,
      type,
      title,
      message,
      link || null,
      JSON.stringify(metadata),
      0 // email_sent = false initially
    );
    notificationId = result.lastInsertRowid;
  }

  // Try to send email if enabled and we have an email address
  if (emailEnabled && userEmail) {
    const htmlBody = generateEmailHtml(title, message, link);
    const textBody = `${title}\n\n${message}\n\n${link ? `View: ${link}` : ''}`;

    emailSent = await sendEmail(userEmail, title, htmlBody, textBody);

    if (emailSent && notificationId) {
      // Update email_sent flag
      db.prepare('UPDATE notifications SET email_sent = 1 WHERE id = ?').run(notificationId);
    }
  }

  return {
    id: notificationId,
    emailSent,
    skipped: !inAppEnabled && !emailSent
  };
}

/**
 * Generate HTML email body
 */
function generateEmailHtml(title, message, link) {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const fullLink = link ? (link.startsWith('http') ? link : `${baseUrl}${link}`) : null;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2563eb; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px; }
    .footer { margin-top: 20px; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 20px;">Námsbókasafn</h1>
    </div>
    <div class="content">
      <h2 style="margin-top: 0;">${escapeHtml(title)}</h2>
      <p>${escapeHtml(message)}</p>
      ${fullLink ? `<a href="${fullLink}" class="button">Skoða</a>` : ''}
    </div>
    <div class="footer">
      <p>Þetta er sjálfvirk tilkynning frá Námsbókasafni.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Notify admins when a review is submitted
 */
async function notifyReviewSubmitted(review, adminUsers) {
  const results = [];

  for (const admin of adminUsers) {
    const result = await createNotification({
      userId: admin.id,
      userEmail: admin.email,
      type: NOTIFICATION_TYPES.REVIEW_SUBMITTED,
      title: 'Ný yfirferð í bið',
      message: `${review.submittedByUsername} sendi ${review.book} / ${review.chapter} / ${review.section} til yfirferðar.`,
      link: `/reviews`,
      metadata: {
        reviewId: review.id,
        book: review.book,
        chapter: review.chapter,
        section: review.section,
        submittedBy: review.submittedByUsername
      }
    });
    results.push(result);
  }

  return results;
}

/**
 * Notify editor when their review is approved
 */
async function notifyReviewApproved(review, editor) {
  return createNotification({
    userId: editor.id,
    userEmail: editor.email,
    type: NOTIFICATION_TYPES.REVIEW_APPROVED,
    title: 'Þýðing samþykkt',
    message: `Þýðingin þín á ${review.book} / ${review.chapter} / ${review.section} hefur verið samþykkt af ${review.reviewedByUsername}.`,
    link: `/editor?book=${review.book}&chapter=${review.chapter}&section=${review.section}`,
    metadata: {
      reviewId: review.id,
      book: review.book,
      chapter: review.chapter,
      section: review.section,
      approvedBy: review.reviewedByUsername
    }
  });
}

/**
 * Notify editor when changes are requested
 */
async function notifyChangesRequested(review, editor, notes) {
  return createNotification({
    userId: editor.id,
    userEmail: editor.email,
    type: NOTIFICATION_TYPES.CHANGES_REQUESTED,
    title: 'Breytingar óskast',
    message: `${review.reviewedByUsername} óskar eftir breytingum á ${review.book} / ${review.chapter} / ${review.section}.\n\nAthugasemdir: ${notes}`,
    link: `/editor?book=${review.book}&chapter=${review.chapter}&section=${review.section}`,
    metadata: {
      reviewId: review.id,
      book: review.book,
      chapter: review.chapter,
      section: review.section,
      reviewedBy: review.reviewedByUsername,
      notes
    }
  });
}

// ============================================================================
// HAND-OFF NOTIFICATIONS
// ============================================================================

/**
 * Notify user when they are assigned a task
 *
 * @param {object} assignment - Assignment details
 * @param {object} assignee - User being assigned { id, email, username }
 * @param {string} assignedByUsername - Who made the assignment
 */
async function notifyAssignmentCreated(assignment, assignee, assignedByUsername) {
  const stageLabel = STAGE_LABELS[assignment.stage] || assignment.stage;
  const dueDate = assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString('is-IS') : null;

  return createNotification({
    userId: assignee.id,
    userEmail: assignee.email,
    type: NOTIFICATION_TYPES.ASSIGNMENT_CREATED,
    title: 'Nýtt verkefni úthlutað',
    message: `${assignedByUsername} úthlutaði þér verkefninu "${stageLabel}" fyrir ${assignment.book} kafla ${assignment.chapter}.${dueDate ? ` Skiladagur: ${dueDate}` : ''}`,
    link: `/editor?book=${assignment.book}&chapter=${assignment.chapter}`,
    metadata: {
      assignmentId: assignment.id,
      book: assignment.book,
      chapter: assignment.chapter,
      stage: assignment.stage,
      stageLabel,
      assignedBy: assignedByUsername,
      dueDate: assignment.dueDate
    }
  });
}

/**
 * Notify next assignee when work is handed off to them
 *
 * @param {object} completedAssignment - The assignment that was completed
 * @param {object} nextAssignment - The next stage assignment
 * @param {object} nextAssignee - User receiving the hand-off { id, email, username }
 * @param {string} completedByUsername - Who completed the previous stage
 */
async function notifyHandoff(completedAssignment, nextAssignment, nextAssignee, completedByUsername) {
  const completedStageLabel = STAGE_LABELS[completedAssignment.stage] || completedAssignment.stage;
  const nextStageLabel = STAGE_LABELS[nextAssignment.stage] || nextAssignment.stage;
  const dueDate = nextAssignment.dueDate ? new Date(nextAssignment.dueDate).toLocaleDateString('is-IS') : null;

  return createNotification({
    userId: nextAssignee.id,
    userEmail: nextAssignee.email,
    type: NOTIFICATION_TYPES.ASSIGNMENT_HANDOFF,
    title: 'Verkefni tilbúið fyrir þig',
    message: `${completedByUsername} kláraði "${completedStageLabel}" fyrir ${completedAssignment.book} kafla ${completedAssignment.chapter}. Þú getur nú hafist handa við "${nextStageLabel}".${dueDate ? ` Skiladagur: ${dueDate}` : ''}`,
    link: `/editor?book=${nextAssignment.book}&chapter=${nextAssignment.chapter}`,
    metadata: {
      completedAssignmentId: completedAssignment.id,
      nextAssignmentId: nextAssignment.id,
      book: completedAssignment.book,
      chapter: completedAssignment.chapter,
      completedStage: completedAssignment.stage,
      nextStage: nextAssignment.stage,
      completedBy: completedByUsername,
      dueDate: nextAssignment.dueDate
    }
  });
}

/**
 * Notify admin/lead when a stage is completed
 *
 * @param {object} assignment - The completed assignment
 * @param {object} admin - Admin/lead to notify { id, email, username }
 * @param {string} completedByUsername - Who completed the stage
 */
async function notifyStageCompleted(assignment, admin, completedByUsername) {
  const stageLabel = STAGE_LABELS[assignment.stage] || assignment.stage;

  return createNotification({
    userId: admin.id,
    userEmail: admin.email,
    type: NOTIFICATION_TYPES.STAGE_COMPLETED,
    title: 'Stig lokið',
    message: `${completedByUsername} kláraði "${stageLabel}" fyrir ${assignment.book} kafla ${assignment.chapter}.`,
    link: `/assignments?book=${assignment.book}`,
    metadata: {
      assignmentId: assignment.id,
      book: assignment.book,
      chapter: assignment.chapter,
      stage: assignment.stage,
      stageLabel,
      completedBy: completedByUsername
    }
  });
}

/**
 * Notify all assignees when a chapter is kicked off
 *
 * @param {string} book - Book slug
 * @param {number} chapter - Chapter number
 * @param {object[]} assignments - Array of assignments with assignees
 * @param {string} kickedOffByUsername - Who initiated the kickoff
 */
async function notifyChapterKickoff(book, chapter, assignments, kickedOffByUsername) {
  const results = [];

  for (const assignment of assignments) {
    if (!assignment.assignee) continue;

    const stageLabel = STAGE_LABELS[assignment.stage] || assignment.stage;
    const dueDate = assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString('is-IS') : null;

    const result = await createNotification({
      userId: assignment.assignee.id,
      userEmail: assignment.assignee.email,
      type: NOTIFICATION_TYPES.CHAPTER_KICKOFF,
      title: 'Kafli hafinn',
      message: `${kickedOffByUsername} hóf vinnu á ${book} kafla ${chapter}. Þér var úthlutað "${stageLabel}".${dueDate ? ` Skiladagur: ${dueDate}` : ''}`,
      link: `/editor?book=${book}&chapter=${chapter}`,
      metadata: {
        book,
        chapter,
        stage: assignment.stage,
        stageLabel,
        kickedOffBy: kickedOffByUsername,
        dueDate: assignment.dueDate
      }
    });

    results.push(result);
  }

  return results;
}

/**
 * Notify admins when feedback is received
 * Sends email to ADMIN_EMAIL if configured
 */
async function notifyFeedbackReceived(feedback, typeLabel) {
  const adminEmail = process.env.ADMIN_EMAIL;

  if (!adminEmail) {
    console.log('[Notification] ADMIN_EMAIL not configured, skipping feedback notification');
    return { emailSent: false };
  }

  // Build location string
  const location = [feedback.book, feedback.chapter, feedback.section]
    .filter(Boolean)
    .join(' / ') || 'Ekki tilgreint';

  const title = `Ný endurgjöf: ${typeLabel}`;
  const message = `
Tegund: ${typeLabel}
Staðsetning: ${location}
${feedback.userName ? `Nafn: ${feedback.userName}` : ''}
${feedback.userEmail ? `Netfang: ${feedback.userEmail}` : ''}

Skilaboð:
${feedback.message}
  `.trim();

  // Generate HTML email
  const htmlBody = generateFeedbackEmailHtml(feedback, typeLabel, location);
  const textBody = message;

  // Send email directly (not through createNotification since this is for admin)
  const emailSent = await sendEmail(adminEmail, title, htmlBody, textBody);

  // Also store as in-app notification
  const notificationResult = await createNotification({
    userId: 'admin',
    type: 'feedback_received',
    title,
    message: `${typeLabel}: ${feedback.message.substring(0, 100)}${feedback.message.length > 100 ? '...' : ''}`,
    link: '/admin/feedback',
    metadata: {
      feedbackId: feedback.id,
      type: feedback.type,
      book: feedback.book,
      chapter: feedback.chapter
    }
  });

  return { emailSent, notificationId: notificationResult.id };
}

/**
 * Generate HTML email for feedback notification
 */
function generateFeedbackEmailHtml(feedback, typeLabel, location) {
  const baseUrl = process.env.BASE_URL || 'https://ritstjorn.namsbokasafn.is';

  // Priority color based on type
  const priorityColors = {
    technical_issue: '#dc2626', // red
    translation_error: '#f59e0b', // amber
    improvement: '#2563eb', // blue
    other: '#6b7280' // gray
  };
  const priorityColor = priorityColors[feedback.type] || '#6b7280';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: ${priorityColor}; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; }
    .message-box { background: white; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px; margin: 16px 0; }
    .meta { font-size: 14px; color: #6b7280; }
    .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px; }
    .footer { padding: 16px 20px; font-size: 12px; color: #6b7280; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 20px;">Ný endurgjöf móttekin</h1>
      <p style="margin: 8px 0 0 0; opacity: 0.9;">${escapeHtml(typeLabel)}</p>
    </div>
    <div class="content">
      <div class="meta">
        <p><strong>Staðsetning:</strong> ${escapeHtml(location)}</p>
        ${feedback.userName ? `<p><strong>Nafn:</strong> ${escapeHtml(feedback.userName)}</p>` : ''}
        ${feedback.userEmail ? `<p><strong>Netfang:</strong> ${escapeHtml(feedback.userEmail)}</p>` : ''}
      </div>
      <div class="message-box">
        <p style="margin: 0; white-space: pre-wrap;">${escapeHtml(feedback.message)}</p>
      </div>
      <a href="${baseUrl}/admin/feedback" class="button">Skoða í stjórnborði</a>
    </div>
    <div class="footer">
      <p style="margin: 0;">Þetta er sjálfvirk tilkynning frá Námsbókasafni.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Get unread notifications for a user
 */
function getUnreadNotifications(userId, limit = 20) {
  const rows = statements.getUnreadForUser.all(userId, limit);
  return rows.map(parseNotificationRow);
}

/**
 * Get all notifications for a user
 */
function getAllNotifications(userId, limit = 50) {
  const rows = statements.getAllForUser.all(userId, limit);
  return rows.map(parseNotificationRow);
}

/**
 * Get unread count for a user
 */
function getUnreadCount(userId) {
  const result = statements.getUnreadCount.get(userId);
  return result.count;
}

/**
 * Mark notification as read
 */
function markAsRead(notificationId) {
  statements.markAsRead.run(notificationId);
}

/**
 * Mark all notifications as read for a user
 */
function markAllAsRead(userId) {
  statements.markAllAsRead.run(userId);
}

/**
 * Parse notification row from database
 */
function parseNotificationRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    message: row.message,
    link: row.link,
    metadata: row.metadata ? JSON.parse(row.metadata) : {},
    read: row.read === 1,
    emailSent: row.email_sent === 1,
    createdAt: row.created_at
  };
}

/**
 * Notify user when they're assigned access to a book
 *
 * @param {number} userId - User ID
 * @param {string} bookSlug - Book slug
 * @param {string} role - Assigned role (head-editor, editor, contributor)
 * @param {string} assignedByUsername - Username of who assigned the access
 */
async function notifyBookAccessAssigned(userId, bookSlug, role, assignedByUsername) {
  const baseUrl = process.env.BASE_URL || 'https://ritstjorn.namsbokasafn.is';

  // Role labels in Icelandic
  const roleLabels = {
    'head-editor': 'aðalritstjóri',
    'editor': 'ritstjóri',
    'contributor': 'þýðandi',
    'viewer': 'lesandi'
  };

  const roleLabel = roleLabels[role] || role;
  const title = 'Nýr aðgangur að bók';
  const message = `${assignedByUsername} hefur úthlutað þér sem ${roleLabel} fyrir ${bookSlug}`;

  // Create in-app notification
  const result = await createNotification({
    userId: String(userId),
    type: 'book_access_assigned',
    title,
    message,
    link: '/workflow',
    metadata: {
      bookSlug,
      role,
      assignedBy: assignedByUsername
    }
  });

  // Try to send email notification if configured
  if (isEmailConfigured()) {
    try {
      // Get user email - need to import userService dynamically to avoid circular deps
      const userService = require('./userService');
      const user = userService.findById(userId);

      if (user && user.email) {
        const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2563eb; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; }
    .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px; }
    .footer { padding: 16px 20px; font-size: 12px; color: #6b7280; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 20px;">Nýr aðgangur að bók</h1>
    </div>
    <div class="content">
      <p>Þér hefur verið úthlutað sem <strong>${roleLabel}</strong> fyrir bókina <strong>${bookSlug}</strong>.</p>
      <p>Úthlutað af: ${assignedByUsername}</p>
      <a href="${baseUrl}/workflow" class="button">Opna verkflæði</a>
    </div>
    <div class="footer">
      <p style="margin: 0;">Þetta er sjálfvirk tilkynning frá Námsbókasafni.</p>
    </div>
  </div>
</body>
</html>
        `.trim();

        const textBody = `Nýr aðgangur að bók\n\nÞér hefur verið úthlutað sem ${roleLabel} fyrir bókina ${bookSlug}.\nÚthlutað af: ${assignedByUsername}\n\nOpna verkflæði: ${baseUrl}/workflow`;

        await sendEmail(user.email, title, htmlBody, textBody);
        result.emailSent = true;
      }
    } catch (emailErr) {
      console.error('Failed to send book access email:', emailErr.message);
    }
  }

  return result;
}

module.exports = {
  NOTIFICATION_TYPES,
  NOTIFICATION_CATEGORIES,
  DEFAULT_PREFERENCES,
  STAGE_LABELS,
  isEmailConfigured,
  createNotification,
  // Review notifications
  notifyReviewSubmitted,
  notifyReviewApproved,
  notifyChangesRequested,
  notifyFeedbackReceived,
  // Hand-off notifications
  notifyAssignmentCreated,
  notifyHandoff,
  notifyStageCompleted,
  notifyChapterKickoff,
  // Book access notifications
  notifyBookAccessAssigned,
  // Notification retrieval
  getUnreadNotifications,
  getAllNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  // Preferences
  getPreferences,
  setPreferences,
  isNotificationEnabled
};
