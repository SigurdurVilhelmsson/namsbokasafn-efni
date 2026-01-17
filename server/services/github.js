/**
 * GitHub API Service
 *
 * Handles GitHub API interactions for:
 * - Creating pull requests
 * - Reading/writing files
 * - Managing branches
 * - Checking PR status
 *
 * All writes go through PRs for review and approval.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  owner: process.env.GITHUB_REPO_OWNER || 'namsbokasafn',
  repo: process.env.GITHUB_REPO_NAME || 'namsbokasafn-efni',
  baseBranch: process.env.GITHUB_BASE_BRANCH || 'main',
  apiVersion: '2022-11-28'
};

/**
 * GitHub API Client
 */
class GitHubClient {
  constructor(accessToken) {
    if (!accessToken) {
      throw new Error('GitHub access token required');
    }
    this.accessToken = accessToken;
  }

  /**
   * Get repository info
   */
  async getRepo() {
    return this.request('GET', `/repos/${CONFIG.owner}/${CONFIG.repo}`);
  }

  /**
   * Get file contents
   */
  async getFile(filePath, ref = CONFIG.baseBranch) {
    const encodedPath = encodeURIComponent(filePath).replace(/%2F/g, '/');
    try {
      const result = await this.request(
        'GET',
        `/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${encodedPath}?ref=${ref}`
      );

      if (result.content) {
        result.decodedContent = Buffer.from(result.content, 'base64').toString('utf-8');
      }

      return result;
    } catch (err) {
      if (err.message.includes('404')) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Create or update a file in a branch
   */
  async createOrUpdateFile(filePath, content, message, branch, sha = null) {
    const encodedPath = encodeURIComponent(filePath).replace(/%2F/g, '/');
    const encodedContent = Buffer.from(content).toString('base64');

    const body = {
      message,
      content: encodedContent,
      branch
    };

    if (sha) {
      body.sha = sha;
    }

    return this.request(
      'PUT',
      `/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${encodedPath}`,
      body
    );
  }

  /**
   * Get a branch
   */
  async getBranch(branchName) {
    try {
      return await this.request(
        'GET',
        `/repos/${CONFIG.owner}/${CONFIG.repo}/branches/${branchName}`
      );
    } catch (err) {
      if (err.message.includes('404')) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Create a branch from base
   */
  async createBranch(branchName, baseBranch = CONFIG.baseBranch) {
    // Get the SHA of the base branch
    const baseRef = await this.request(
      'GET',
      `/repos/${CONFIG.owner}/${CONFIG.repo}/git/ref/heads/${baseBranch}`
    );

    // Create new branch
    return this.request(
      'POST',
      `/repos/${CONFIG.owner}/${CONFIG.repo}/git/refs`,
      {
        ref: `refs/heads/${branchName}`,
        sha: baseRef.object.sha
      }
    );
  }

  /**
   * Create a pull request
   */
  async createPullRequest(options) {
    const { title, body, head, base = CONFIG.baseBranch, draft = false } = options;

    return this.request(
      'POST',
      `/repos/${CONFIG.owner}/${CONFIG.repo}/pulls`,
      {
        title,
        body,
        head,
        base,
        draft
      }
    );
  }

  /**
   * Get pull request status
   */
  async getPullRequest(prNumber) {
    return this.request(
      'GET',
      `/repos/${CONFIG.owner}/${CONFIG.repo}/pulls/${prNumber}`
    );
  }

  /**
   * List pull requests
   */
  async listPullRequests(state = 'open') {
    return this.request(
      'GET',
      `/repos/${CONFIG.owner}/${CONFIG.repo}/pulls?state=${state}`
    );
  }

  /**
   * Add labels to a PR
   */
  async addLabels(prNumber, labels) {
    return this.request(
      'POST',
      `/repos/${CONFIG.owner}/${CONFIG.repo}/issues/${prNumber}/labels`,
      { labels }
    );
  }

  /**
   * Request reviewers for a PR
   */
  async requestReviewers(prNumber, reviewers) {
    return this.request(
      'POST',
      `/repos/${CONFIG.owner}/${CONFIG.repo}/pulls/${prNumber}/requested_reviewers`,
      { reviewers }
    );
  }

  /**
   * Get PR review status
   */
  async getPullRequestReviews(prNumber) {
    return this.request(
      'GET',
      `/repos/${CONFIG.owner}/${CONFIG.repo}/pulls/${prNumber}/reviews`
    );
  }

  /**
   * Check if PR is mergeable
   */
  async checkMergeable(prNumber) {
    const pr = await this.getPullRequest(prNumber);
    return {
      mergeable: pr.mergeable,
      mergeableState: pr.mergeable_state,
      merged: pr.merged,
      state: pr.state
    };
  }

  /**
   * Make an API request to GitHub
   */
  request(method, endpoint, body = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: endpoint,
        method,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': CONFIG.apiVersion,
          'User-Agent': 'namsbokasafn-pipeline'
        }
      };

      if (body) {
        options.headers['Content-Type'] = 'application/json';
      }

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 400) {
            let errorMessage = 'GitHub API error: ' + res.statusCode;
            try {
              const errorJson = JSON.parse(data);
              errorMessage = errorJson.message || errorMessage;
            } catch (e) {
              // Use default error message
            }
            reject(new Error(errorMessage));
          } else if (res.statusCode === 204) {
            resolve(null);
          } else {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              resolve(data);
            }
          }
        });
      });

      req.on('error', reject);

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }
}

/**
 * Create a sync PR for approved content
 *
 * @param {object} options - PR options
 * @param {string} options.accessToken - GitHub access token
 * @param {string} options.book - Book identifier
 * @param {number} options.chapter - Chapter number
 * @param {object[]} options.files - Files to include [{path, content}]
 * @param {string} options.username - User creating the PR
 * @returns {Promise<object>} PR info
 */
async function createSyncPR(options) {
  const { accessToken, book, chapter, files, username, description } = options;

  const client = new GitHubClient(accessToken);

  // Generate branch name
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const branchName = `sync/${book}/ch${String(chapter).padStart(2, '0')}/${timestamp}`;

  // Create branch
  await client.createBranch(branchName);

  // Add files to branch
  for (const file of files) {
    // Check if file exists to get SHA
    const existing = await client.getFile(file.path, branchName);

    await client.createOrUpdateFile(
      file.path,
      file.content,
      `Update ${path.basename(file.path)}`,
      branchName,
      existing?.sha
    );
  }

  // Create PR
  const prBody = `## Translation Sync: ${book} Chapter ${chapter}

### Files Updated
${files.map(f => '- `' + f.path + '`').join('\n')}

### Description
${description || 'Syncing approved translations from pipeline.'}

### Checklist
- [ ] Content has been reviewed (Pass 1 complete)
- [ ] Terminology is consistent with glossary
- [ ] No untranslated content remains

---
Created by: @${username}
Via: Pipeline Automation System
`;

  const pr = await client.createPullRequest({
    title: `[Sync] ${book} Chapter ${chapter} translations`,
    body: prBody,
    head: branchName,
    base: CONFIG.baseBranch
  });

  // Add labels
  try {
    await client.addLabels(pr.number, ['translation', 'sync', book]);
  } catch (e) {
    // Labels might not exist, continue
  }

  return {
    number: pr.number,
    url: pr.html_url,
    branch: branchName,
    state: pr.state,
    createdAt: pr.created_at
  };
}

/**
 * Check configuration status
 */
function isConfigured() {
  return !!(CONFIG.owner && CONFIG.repo);
}

function getConfigStatus() {
  return {
    configured: isConfigured(),
    owner: CONFIG.owner,
    repo: CONFIG.repo,
    baseBranch: CONFIG.baseBranch
  };
}

module.exports = {
  GitHubClient,
  createSyncPR,
  isConfigured,
  getConfigStatus,
  CONFIG
};
