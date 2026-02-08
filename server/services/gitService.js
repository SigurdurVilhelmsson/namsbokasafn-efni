/**
 * Git Service for Workflow Step Commits
 *
 * Handles git operations for committing workflow files at step transitions.
 * Admin-only feature that allows committing generated files to GitHub.
 */

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const glob = require('glob');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

// Step configuration: which folders and file patterns to commit
const STEP_CONFIG = {
  source: {
    folder: '02-for-mt',
    patterns: ['*.en.md', '*-equations.json', '*-figures.json', '*-strings.en.md'],
    excludePattern: /\([a-z]\)\./, // Exclude split files like 1-1(a).en.md
    label: 'EN Markdown undirbúningur',
  },
  'mt-upload': {
    folder: '02-mt-output',
    patterns: ['*.is.md'],
    excludePattern: /\([a-z]\)\./, // Exclude split files
    label: 'Vélþýðing',
  },
  'faithful-edit': {
    folder: '03-faithful',
    patterns: ['*.is.md'],
    excludePattern: null,
    label: 'Trú þýðing',
  },
  'tm-creation': {
    folder: 'tm',
    patterns: ['*.tmx'],
    excludePattern: null,
    label: 'Þýðingaminni',
  },
  localization: {
    folder: '04-localized',
    patterns: ['*.is.md'],
    excludePattern: null,
    label: 'Staðfærsla',
  },
  finalize: {
    folder: '05-publication',
    patterns: ['*'],
    excludePattern: null,
    label: 'Útgáfa',
  },
};

// Files and directories that should never be committed
const NEVER_COMMIT = [
  '.env',
  'credentials*',
  '*.bak',
  'node_modules',
  'pipeline-output',
  '.DS_Store',
];

/**
 * Get the chapter directory path for a step
 * @param {string} bookSlug - Book slug (e.g., 'efnafraedi')
 * @param {number|string} chapter - Chapter number
 * @param {string} stepId - Workflow step ID
 * @returns {string} Full path to chapter directory
 */
function getChapterDir(bookSlug, chapter, stepId) {
  const config = STEP_CONFIG[stepId];
  if (!config) {
    throw new Error(`Unknown step: ${stepId}`);
  }

  const chapterNum = parseInt(chapter, 10);
  const chapterDir = `ch${String(chapterNum).padStart(2, '0')}`;

  return path.join(PROJECT_ROOT, 'books', bookSlug, config.folder, chapterDir);
}

/**
 * Get files to commit for a workflow step
 * @param {string} bookSlug - Book slug
 * @param {number|string} chapter - Chapter number
 * @param {string} stepId - Workflow step ID
 * @returns {Object} { files: [], excluded: [], folder: '' }
 */
function getFilesToCommit(bookSlug, chapter, stepId) {
  const config = STEP_CONFIG[stepId];
  if (!config) {
    throw new Error(`Unknown step: ${stepId}`);
  }

  const chapterDir = getChapterDir(bookSlug, chapter, stepId);
  const relativePath = path.relative(PROJECT_ROOT, chapterDir);

  if (!fs.existsSync(chapterDir)) {
    return {
      files: [],
      excluded: [],
      folder: relativePath,
      error: 'Directory does not exist',
    };
  }

  const files = [];
  const excluded = [];

  for (const pattern of config.patterns) {
    const matches = glob.sync(path.join(chapterDir, pattern));

    for (const filePath of matches) {
      const filename = path.basename(filePath);
      const relPath = path.relative(PROJECT_ROOT, filePath);

      // Check exclusion pattern
      if (config.excludePattern && config.excludePattern.test(filename)) {
        excluded.push({
          path: relPath,
          filename,
          reason: 'Split file (excluded)',
        });
        continue;
      }

      // Check never-commit patterns
      let shouldExclude = false;
      for (const pattern of NEVER_COMMIT) {
        if (
          glob.sync(filePath, { nocase: true, matchBase: true }).length > 0 &&
          (filename.match(new RegExp(pattern.replace('*', '.*'))) ||
            filePath.includes(pattern.replace('*', '')))
        ) {
          shouldExclude = true;
          excluded.push({
            path: relPath,
            filename,
            reason: 'Security exclusion',
          });
          break;
        }
      }

      if (!shouldExclude) {
        const stat = fs.statSync(filePath);
        files.push({
          path: relPath,
          filename,
          size: stat.size,
          modified: stat.mtime.toISOString(),
        });
      }
    }
  }

  return {
    files,
    excluded,
    folder: relativePath,
    stepLabel: config.label,
  };
}

/**
 * Preview git changes for workflow files
 * @param {string} bookSlug - Book slug
 * @param {number|string} chapter - Chapter number
 * @param {string} stepId - Workflow step ID
 * @returns {Object} { hasChanges, stagedFiles, unstagedFiles, untrackedFiles }
 */
function previewChanges(bookSlug, chapter, stepId) {
  const { files, excluded, folder, stepLabel } = getFilesToCommit(bookSlug, chapter, stepId);

  if (files.length === 0) {
    return {
      hasChanges: false,
      files: [],
      excluded,
      folder,
      stepLabel,
      message: 'No files found to commit',
    };
  }

  // Get git status for these specific files
  try {
    // Check git status
    const statusOutput = execFileSync('git', ['status', '--porcelain'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
    });

    const statusLines = statusOutput.split('\n').filter((l) => l.trim());
    const filesWithStatus = files.map((file) => {
      const statusLine = statusLines.find((l) => l.includes(file.path));
      let status = 'unchanged';

      if (statusLine) {
        const statusCode = statusLine.substring(0, 2);
        if (statusCode.includes('?')) status = 'untracked';
        else if (statusCode.includes('M')) status = 'modified';
        else if (statusCode.includes('A')) status = 'staged';
        else if (statusCode.includes('D')) status = 'deleted';
      }

      return { ...file, status };
    });

    const changedFiles = filesWithStatus.filter((f) => f.status !== 'unchanged');

    return {
      hasChanges: changedFiles.length > 0,
      files: filesWithStatus,
      changedCount: changedFiles.length,
      excluded,
      folder,
      stepLabel,
    };
  } catch (err) {
    return {
      hasChanges: false,
      files,
      excluded,
      folder,
      stepLabel,
      error: err.message,
    };
  }
}

/**
 * Commit workflow files to git
 * @param {Object} options
 * @param {string} options.bookSlug - Book slug
 * @param {number|string} options.chapter - Chapter number
 * @param {string} options.stepId - Workflow step ID
 * @param {Object} options.user - User object { id, username, name }
 * @param {string} [options.message] - Custom commit message
 * @returns {Object} { success, sha, filesCommitted, error? }
 */
function commitWorkflowFiles({ bookSlug, chapter, stepId, user, message }) {
  const preview = previewChanges(bookSlug, chapter, stepId);

  if (!preview.hasChanges) {
    return {
      success: false,
      error: 'No changes to commit',
      filesCommitted: 0,
    };
  }

  const filesToAdd = preview.files.filter((f) => f.status !== 'unchanged').map((f) => f.path);

  if (filesToAdd.length === 0) {
    return {
      success: false,
      error: 'No modified files to commit',
      filesCommitted: 0,
    };
  }

  // Build commit message
  const config = STEP_CONFIG[stepId];
  const commitMessage =
    message ||
    `feat(${bookSlug}): ${config.label} complete - chapter ${chapter}

Files: ${filesToAdd.length} file(s)
Step: ${stepId}
Completed by: ${user.username}`;

  try {
    // Stage specific files
    for (const file of filesToAdd) {
      execFileSync('git', ['add', file], {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
      });
    }

    // Create commit
    execFileSync('git', ['commit', '-m', commitMessage], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: user.name || user.username,
        GIT_AUTHOR_EMAIL: `${user.id}@users.noreply.github.com`,
        GIT_COMMITTER_NAME: user.name || user.username,
        GIT_COMMITTER_EMAIL: `${user.id}@users.noreply.github.com`,
      },
    });

    // Get the commit SHA
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
    }).trim();

    return {
      success: true,
      sha,
      filesCommitted: filesToAdd.length,
      files: filesToAdd,
      message: commitMessage,
    };
  } catch (err) {
    // Try to unstage files if commit failed
    try {
      execFileSync('git', ['reset', 'HEAD'], { cwd: PROJECT_ROOT });
    } catch (resetErr) {
      // Ignore reset errors
    }

    return {
      success: false,
      error: `Git commit failed: ${err.message}`,
      filesCommitted: 0,
    };
  }
}

/**
 * Push changes to remote
 * @returns {Object} { success, error? }
 */
function pushChanges() {
  try {
    execFileSync('git', ['push', 'origin', 'HEAD'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
    });

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: `Git push failed: ${err.message}`,
      suggestion: 'You may need to run `git push origin HEAD` manually',
    };
  }
}

/**
 * Commit and push workflow files
 * @param {Object} options - Same as commitWorkflowFiles
 * @param {boolean} options.push - Whether to push after commit
 * @returns {Object} { success, sha, pushed, filesCommitted, error? }
 */
function commitAndPush(options) {
  const commitResult = commitWorkflowFiles(options);

  if (!commitResult.success) {
    return commitResult;
  }

  if (options.push) {
    const pushResult = pushChanges();
    return {
      ...commitResult,
      pushed: pushResult.success,
      pushError: pushResult.error,
      pushSuggestion: pushResult.suggestion,
    };
  }

  return {
    ...commitResult,
    pushed: false,
  };
}

/**
 * Get step labels for display
 * @returns {Object} Map of stepId to label
 */
function getStepLabels() {
  const labels = {};
  for (const [stepId, config] of Object.entries(STEP_CONFIG)) {
    labels[stepId] = config.label;
  }
  return labels;
}

module.exports = {
  getFilesToCommit,
  previewChanges,
  commitWorkflowFiles,
  pushChanges,
  commitAndPush,
  getStepLabels,
  STEP_CONFIG,
};
