/**
 * Reports Routes
 *
 * API endpoints for progress reports.
 *
 * Endpoints:
 *   GET /api/reports              List available reports
 *   GET /api/reports/weekly       Get weekly report (current or specified week)
 *   GET /api/reports/comparison   Get this week vs last week comparison
 */

const express = require('express');
const router = express.Router();

const reportService = require('../services/reportService');
const { requireAuth } = require('../middleware/requireAuth');
const { requireRole, ROLES } = require('../middleware/requireRole');

/**
 * GET /api/reports
 * List available reports
 */
router.get('/', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  const { book = 'efnafraedi' } = req.query;

  try {
    const reports = reportService.getAvailableReports(book);
    res.json({ reports, book });
  } catch (err) {
    console.error('Error listing reports:', err);
    res.status(500).json({
      error: 'Failed to list reports',
      message: err.message
    });
  }
});

/**
 * GET /api/reports/weekly
 * Get weekly report
 */
router.get('/weekly', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  const { book = 'efnafraedi', weeksAgo = '0' } = req.query;

  try {
    const report = reportService.generateWeeklyReport(parseInt(weeksAgo), book);

    if (report.error) {
      return res.status(500).json({
        error: 'Failed to generate report',
        message: report.error
      });
    }

    res.json(report);
  } catch (err) {
    console.error('Error generating weekly report:', err);
    res.status(500).json({
      error: 'Failed to generate report',
      message: err.message
    });
  }
});

/**
 * GET /api/reports/comparison
 * Get this week vs last week comparison
 */
router.get('/comparison', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  const { book = 'efnafraedi' } = req.query;

  try {
    const comparison = reportService.generateWeeklyComparison(book);
    res.json(comparison);
  } catch (err) {
    console.error('Error generating comparison:', err);
    res.status(500).json({
      error: 'Failed to generate comparison',
      message: err.message
    });
  }
});

module.exports = router;
