/**
 * Meeting Routes
 *
 * API endpoints for meeting agenda generation.
 *
 * Endpoints:
 *   GET  /api/meetings/agenda           Generate meeting agenda
 *   GET  /api/meetings/agenda/preview   Preview agenda items
 */

const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/requireAuth');
const assignmentStore = require('../services/assignmentStore');
const decisionStore = require('../services/decisionStore');
const terminologyService = require('../services/terminologyService');
const session = require('../services/session');
const { escapeHtml } = require('../services/htmlUtils');

/**
 * Collect BOARD_REVIEW issues from all sessions
 */
function collectBoardReviewIssues(book = null) {
  const sessions = session.listAllSessions();
  const issues = [];

  for (const sess of sessions) {
    const sessionData = session.getSession(sess.id);
    if (!sessionData) continue;

    if (book && sessionData.book !== book) continue;

    for (const issue of sessionData.issues) {
      if (issue.category === 'BOARD_REVIEW' && issue.status === 'pending') {
        issues.push({
          ...issue,
          sessionId: sess.id,
          book: sessionData.book,
          chapter: sessionData.chapter,
        });
      }
    }
  }

  return issues;
}

/**
 * GET /api/meetings/agenda
 * Generate a meeting agenda
 *
 * Query params:
 *   - book: Filter by book (optional)
 *   - format: 'json' | 'markdown' | 'html' (default: json)
 *   - includeProgress: Include progress summary (default: true)
 */
router.get('/agenda', requireAuth, async (req, res) => {
  const { book, format = 'json', includeProgress = 'true' } = req.query;

  try {
    const now = new Date();
    const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // 1. Get BOARD_REVIEW issues
    const boardReviewIssues = collectBoardReviewIssues(book);

    // 2. Get disputed terminology
    let disputedTerms = [];
    try {
      disputedTerms = terminologyService.getTermsForReview(book || null, 50);
    } catch (err) {
      console.error('Failed to get disputed terms:', err);
    }

    // 3. Get overdue assignments
    const allAssignments = book
      ? assignmentStore.getBookAssignments(book)
      : assignmentStore.getAllPendingAssignments();

    const overdueAssignments = allAssignments
      .filter((a) => {
        if (!a.dueDate) return false;
        return new Date(a.dueDate) < now;
      })
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    // 4. Get upcoming deadlines (next 7 days)
    const upcomingDeadlines = allAssignments
      .filter((a) => {
        if (!a.dueDate) return false;
        const dueDate = new Date(a.dueDate);
        return dueDate >= now && dueDate <= oneWeekFromNow;
      })
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    // 5. Get recent decisions (last 7 days)
    const recentDecisions = decisionStore.getRecentDecisions(20).filter((d) => {
      const decidedAt = new Date(d.decidedAt);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return decidedAt >= sevenDaysAgo;
    });

    // 6. Calculate progress summary
    let progressSummary = null;
    if (includeProgress === 'true') {
      const totalAssignments = allAssignments.length;
      // const completedToday = 0; // Would need activity log integration

      progressSummary = {
        totalPendingAssignments: totalAssignments,
        overdueCount: overdueAssignments.length,
        dueThisWeek: upcomingDeadlines.length,
        decisionsThisWeek: recentDecisions.length,
        boardReviewItems: boardReviewIssues.length,
        disputedTerms: disputedTerms.length,
      };
    }

    // Build agenda
    const agenda = {
      generatedAt: now.toISOString(),
      generatedBy: req.user.username,
      book: book || 'all',
      sections: [],
    };

    // Section 1: Urgent Items (Overdue)
    if (overdueAssignments.length > 0) {
      agenda.sections.push({
        title: 'Brýn mál - Tímafresti lokið',
        titleEn: 'Urgent - Overdue Items',
        priority: 1,
        items: overdueAssignments.map((a) => ({
          type: 'overdue_assignment',
          book: a.book,
          chapter: a.chapter,
          stage: a.stage,
          stageLabel: getStageLabel(a.stage),
          assignedTo: a.assignedTo,
          dueDate: a.dueDate,
          daysOverdue: Math.ceil((now - new Date(a.dueDate)) / (1000 * 60 * 60 * 24)),
        })),
      });
    }

    // Section 2: Board Review Issues
    if (boardReviewIssues.length > 0) {
      agenda.sections.push({
        title: 'Til umræðu - Staðfærsla og túlkun',
        titleEn: 'Discussion - Localization Decisions',
        priority: 2,
        items: boardReviewIssues.map((i) => ({
          type: 'board_review',
          id: i.id,
          book: i.book,
          chapter: i.chapter,
          description: i.description,
          context: i.context,
          suggestion: i.suggestion,
          sourceFile: i.sourceFile,
          line: i.line,
        })),
      });
    }

    // Section 3: Disputed Terminology
    if (disputedTerms.length > 0) {
      agenda.sections.push({
        title: 'Hugtök til úrlausnar',
        titleEn: 'Terminology for Resolution',
        priority: 3,
        items: disputedTerms.map((t) => ({
          type: 'disputed_term',
          id: t.id,
          english: t.english,
          icelandic: t.icelandic,
          status: t.status,
          category: t.category,
          notes: t.notes,
          disputeComment: t.disputeComment,
          proposedAlternative: t.proposedAlternative,
        })),
      });
    }

    // Section 4: Upcoming Deadlines
    if (upcomingDeadlines.length > 0) {
      agenda.sections.push({
        title: 'Væntanlegir skiladagar',
        titleEn: 'Upcoming Deadlines',
        priority: 4,
        items: upcomingDeadlines.map((a) => ({
          type: 'upcoming_deadline',
          book: a.book,
          chapter: a.chapter,
          stage: a.stage,
          stageLabel: getStageLabel(a.stage),
          assignedTo: a.assignedTo,
          dueDate: a.dueDate,
          daysUntil: Math.ceil((new Date(a.dueDate) - now) / (1000 * 60 * 60 * 24)),
        })),
      });
    }

    // Section 5: Recent Decisions (for reference)
    if (recentDecisions.length > 0) {
      agenda.sections.push({
        title: 'Nýlegar ákvarðanir til staðfestingar',
        titleEn: 'Recent Decisions for Confirmation',
        priority: 5,
        items: recentDecisions.map((d) => ({
          type: 'recent_decision',
          id: d.id,
          decisionType: d.type,
          englishTerm: d.englishTerm,
          icelandicTerm: d.icelandicTerm,
          rationale: d.rationale,
          decidedBy: d.decidedBy,
          decidedAt: d.decidedAt,
          book: d.book,
          chapter: d.chapter,
        })),
      });
    }

    // Add progress summary
    if (progressSummary) {
      agenda.summary = progressSummary;
    }

    // Format output
    if (format === 'markdown') {
      res.setHeader('Content-Type', 'text/markdown');
      res.send(generateMarkdownAgenda(agenda));
    } else if (format === 'html') {
      res.setHeader('Content-Type', 'text/html');
      res.send(generateHtmlAgenda(agenda));
    } else {
      res.json(agenda);
    }
  } catch (err) {
    console.error('Agenda generation error:', err);
    res.status(500).json({
      error: 'Failed to generate agenda',
      message: err.message,
    });
  }
});

/**
 * GET /api/meetings/agenda/preview
 * Quick preview of agenda item counts
 */
router.get('/agenda/preview', requireAuth, (req, res) => {
  const { book } = req.query;

  try {
    const now = new Date();
    const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Count items
    const boardReviewCount = collectBoardReviewIssues(book).length;

    let disputedCount = 0;
    try {
      disputedCount = terminologyService.getTermsForReview(book || null, 100).length;
    } catch (err) {
      console.error('Failed to count disputed terms:', err);
    }

    const allAssignments = book
      ? assignmentStore.getBookAssignments(book)
      : assignmentStore.getAllPendingAssignments();

    const overdueCount = allAssignments.filter((a) => {
      if (!a.dueDate) return false;
      return new Date(a.dueDate) < now;
    }).length;

    const upcomingCount = allAssignments.filter((a) => {
      if (!a.dueDate) return false;
      const dueDate = new Date(a.dueDate);
      return dueDate >= now && dueDate <= oneWeekFromNow;
    }).length;

    const recentDecisionsCount = decisionStore.getRecentDecisions(20).filter((d) => {
      const decidedAt = new Date(d.decidedAt);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return decidedAt >= sevenDaysAgo;
    }).length;

    const totalItems = boardReviewCount + disputedCount + overdueCount + upcomingCount;

    res.json({
      totalItems,
      urgentItems: overdueCount,
      sections: {
        overdue: overdueCount,
        boardReview: boardReviewCount,
        disputedTerms: disputedCount,
        upcomingDeadlines: upcomingCount,
        recentDecisions: recentDecisionsCount,
      },
      recommendation: totalItems > 0 ? `${totalItems} atriði til umræðu` : 'Engin atriði í bið',
      lastUpdated: now.toISOString(),
    });
  } catch (err) {
    console.error('Agenda preview error:', err);
    res.status(500).json({
      error: 'Failed to preview agenda',
      message: err.message,
    });
  }
});

// Helper functions

function getStageLabel(stage) {
  const labels = {
    enMarkdown: 'EN Markdown',
    mtOutput: 'Vélþýðing',
    linguisticReview: 'Málfarsskoðun',
    tmCreated: 'Þýðingaminni',
    publication: 'Útgáfa',
  };
  return labels[stage] || stage;
}

function generateMarkdownAgenda(agenda) {
  let md = `# Fundaráætlun\n\n`;
  md += `**Dagsetning:** ${new Date(agenda.generatedAt).toLocaleDateString('is-IS')}\n`;
  md += `**Búið til af:** ${agenda.generatedBy}\n`;
  if (agenda.book !== 'all') {
    md += `**Bók:** ${agenda.book}\n`;
  }
  md += '\n---\n\n';

  // Summary
  if (agenda.summary) {
    md += `## Yfirlit\n\n`;
    md += `- Verkefni í bið: ${agenda.summary.totalPendingAssignments}\n`;
    md += `- Tímafrestir liðnir: ${agenda.summary.overdueCount}\n`;
    md += `- Á döfinni þessa viku: ${agenda.summary.dueThisWeek}\n`;
    md += `- Atriði til umræðu: ${agenda.summary.boardReviewItems}\n`;
    md += `- Hugtök til úrlausnar: ${agenda.summary.disputedTerms}\n`;
    md += '\n---\n\n';
  }

  // Sections
  for (const section of agenda.sections) {
    md += `## ${section.title}\n\n`;

    if (section.items.length === 0) {
      md += `*Engin atriði*\n\n`;
      continue;
    }

    for (const item of section.items) {
      if (item.type === 'overdue_assignment') {
        md += `### ${item.book} kafli ${item.chapter} - ${item.stageLabel}\n`;
        md += `- **Ábyrgðaraðili:** ${item.assignedTo}\n`;
        md += `- **Skiladagur:** ${new Date(item.dueDate).toLocaleDateString('is-IS')}\n`;
        md += `- **Seinkun:** ${item.daysOverdue} dagar\n\n`;
      } else if (item.type === 'board_review') {
        md += `### ${item.book} kafli ${item.chapter}\n`;
        md += `**Lýsing:** ${item.description}\n\n`;
        if (item.context) md += `> ${item.context}\n\n`;
        if (item.suggestion) md += `**Tillaga:** ${item.suggestion}\n\n`;
      } else if (item.type === 'disputed_term') {
        md += `### ${item.english} → ${item.icelandic}\n`;
        md += `- **Flokkur:** ${item.category || 'Ekki tilgreint'}\n`;
        md += `- **Staða:** ${item.status}\n`;
        if (item.notes) md += `- **Athugasemdir:** ${item.notes}\n`;
        if (item.disputeComment) md += `- **Mótmæli:** ${item.disputeComment}\n`;
        if (item.proposedAlternative) md += `- **Tillaga:** ${item.proposedAlternative}\n`;
        md += '\n';
      } else if (item.type === 'upcoming_deadline') {
        md += `- **${item.book} K${item.chapter}** - ${item.stageLabel} (${item.assignedTo}) - ${item.daysUntil} dagar\n`;
      } else if (item.type === 'recent_decision') {
        md += `- **${item.englishTerm}** → ${item.icelandicTerm} *(${item.decidedBy})*\n`;
      }
    }

    md += '\n---\n\n';
  }

  return md;
}

function generateHtmlAgenda(agenda) {
  let html = `<!DOCTYPE html>
<html lang="is">
<head>
  <meta charset="UTF-8">
  <title>Fundaráætlun - ${new Date(agenda.generatedAt).toLocaleDateString('is-IS')}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 2rem auto; padding: 1rem; line-height: 1.6; }
    h1 { color: #1e40af; border-bottom: 2px solid #3b82f6; padding-bottom: 0.5rem; }
    h2 { color: #1e40af; margin-top: 2rem; }
    h3 { color: #374151; }
    .meta { color: #6b7280; font-size: 0.875rem; margin-bottom: 2rem; }
    .summary { background: #f3f4f6; padding: 1rem; border-radius: 0.5rem; margin-bottom: 2rem; }
    .summary ul { margin: 0; padding-left: 1.5rem; }
    .urgent { border-left: 4px solid #dc2626; padding-left: 1rem; }
    .discussion { border-left: 4px solid #f59e0b; padding-left: 1rem; }
    .term { background: #fef3c7; padding: 0.5rem; border-radius: 0.25rem; margin-bottom: 0.5rem; }
    .deadline { background: #dbeafe; padding: 0.5rem; border-radius: 0.25rem; margin-bottom: 0.5rem; }
    .decision { background: #dcfce7; padding: 0.5rem; border-radius: 0.25rem; margin-bottom: 0.5rem; }
    blockquote { background: #f9fafb; border-left: 3px solid #d1d5db; padding: 0.5rem 1rem; margin: 0.5rem 0; }
    @media print { body { max-width: none; } }
  </style>
</head>
<body>
  <h1>Fundaráætlun</h1>
  <div class="meta">
    <p><strong>Dagsetning:</strong> ${new Date(agenda.generatedAt).toLocaleDateString('is-IS')}</p>
    <p><strong>Búið til af:</strong> ${agenda.generatedBy}</p>
    ${agenda.book !== 'all' ? `<p><strong>Bók:</strong> ${agenda.book}</p>` : ''}
  </div>
`;

  // Summary
  if (agenda.summary) {
    html += `
  <div class="summary">
    <h2>Yfirlit</h2>
    <ul>
      <li>Verkefni í bið: <strong>${agenda.summary.totalPendingAssignments}</strong></li>
      <li>Tímafrestir liðnir: <strong>${agenda.summary.overdueCount}</strong></li>
      <li>Á döfinni þessa viku: <strong>${agenda.summary.dueThisWeek}</strong></li>
      <li>Atriði til umræðu: <strong>${agenda.summary.boardReviewItems}</strong></li>
      <li>Hugtök til úrlausnar: <strong>${agenda.summary.disputedTerms}</strong></li>
    </ul>
  </div>
`;
  }

  // Sections
  for (const section of agenda.sections) {
    const sectionClass =
      section.priority === 1 ? 'urgent' : section.priority === 2 ? 'discussion' : '';
    html += `<div class="${sectionClass}"><h2>${escapeHtml(section.title)}</h2>`;

    if (section.items.length === 0) {
      html += `<p><em>Engin atriði</em></p>`;
    } else {
      for (const item of section.items) {
        if (item.type === 'overdue_assignment') {
          html += `
          <div class="deadline">
            <h3>${item.book} kafli ${item.chapter} - ${item.stageLabel}</h3>
            <p><strong>Ábyrgðaraðili:</strong> ${escapeHtml(item.assignedTo)}</p>
            <p><strong>Skiladagur:</strong> ${new Date(item.dueDate).toLocaleDateString('is-IS')}</p>
            <p><strong>Seinkun:</strong> ${item.daysOverdue} dagar</p>
          </div>`;
        } else if (item.type === 'board_review') {
          html += `
          <div class="term">
            <h3>${item.book} kafli ${item.chapter}</h3>
            <p><strong>Lýsing:</strong> ${escapeHtml(item.description)}</p>
            ${item.context ? `<blockquote>${escapeHtml(item.context)}</blockquote>` : ''}
            ${item.suggestion ? `<p><strong>Tillaga:</strong> ${escapeHtml(item.suggestion)}</p>` : ''}
          </div>`;
        } else if (item.type === 'disputed_term') {
          html += `
          <div class="term">
            <h3>${escapeHtml(item.english)} → ${escapeHtml(item.icelandic)}</h3>
            <p><strong>Flokkur:</strong> ${item.category || 'Ekki tilgreint'} | <strong>Staða:</strong> ${item.status}</p>
            ${item.notes ? `<p><strong>Athugasemdir:</strong> ${escapeHtml(item.notes)}</p>` : ''}
            ${item.disputeComment ? `<p><strong>Mótmæli:</strong> ${escapeHtml(item.disputeComment)}</p>` : ''}
          </div>`;
        } else if (item.type === 'upcoming_deadline') {
          html += `
          <div class="deadline">
            <strong>${item.book} K${item.chapter}</strong> - ${item.stageLabel} (${escapeHtml(item.assignedTo)}) - ${item.daysUntil} dagar eftir
          </div>`;
        } else if (item.type === 'recent_decision') {
          html += `
          <div class="decision">
            <strong>${escapeHtml(item.englishTerm || '')}</strong> → ${escapeHtml(item.icelandicTerm || '')} <em>(${escapeHtml(item.decidedBy)})</em>
          </div>`;
        }
      }
    }

    html += `</div>`;
  }

  html += `
</body>
</html>`;

  return html;
}

module.exports = router;
