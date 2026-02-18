/**
 * Matecat API Service
 *
 * Integrates with Matecat's REST API for translation project management.
 * Supports both hosted (www.matecat.com) and self-hosted instances.
 *
 * API Documentation: https://guides.matecat.com/creating-and-checking-projects-via-api
 *
 * Key endpoints:
 *   POST /new     - Create a new translation project
 *   GET /status   - Check project status (ANALYZING, DONE, FAIL)
 *   GET /stats    - Get word counts and translation progress
 *   GET /url      - Get download URLs for translations
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Default configuration
const DEFAULT_CONFIG = {
  baseUrl: 'https://www.matecat.com',
  timeout: 30000,
};

/**
 * Matecat API Client
 */
class MatecatClient {
  /**
   * Create a new Matecat client
   * @param {object} options - Configuration options
   * @param {string} options.apiKey - Matecat API key (from user profile)
   * @param {string} [options.baseUrl] - Base URL (default: https://www.matecat.com)
   * @param {number} [options.timeout] - Request timeout in ms (default: 30000)
   */
  constructor(options = {}) {
    if (!options.apiKey) {
      throw new Error('Matecat API key is required');
    }

    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl || DEFAULT_CONFIG.baseUrl;
    this.timeout = options.timeout || DEFAULT_CONFIG.timeout;

    // Parse base URL
    const url = new URL(this.baseUrl);
    this.protocol = url.protocol === 'https:' ? https : http;
    this.hostname = url.hostname;
    this.port = url.port || (url.protocol === 'https:' ? 443 : 80);
    this.basePath = url.pathname.replace(/\/$/, '');
  }

  /**
   * Create a new translation project
   *
   * @param {object} options - Project options
   * @param {string|string[]} options.files - Path(s) to file(s) to translate
   * @param {string} options.sourceLang - Source language code (e.g., 'en-US')
   * @param {string} options.targetLang - Target language code (e.g., 'is-IS')
   * @param {string} [options.projectName] - Project name
   * @param {string} [options.subject] - Subject/domain (e.g., 'general', 'medical_pharmaceutical')
   * @param {string} [options.tmKey] - Translation Memory key
   * @param {boolean} [options.pretranslate] - Enable pre-translation from TM
   * @returns {Promise<object>} Project creation response
   */
  async createProject(options) {
    const {
      files,
      sourceLang,
      targetLang,
      projectName,
      subject = 'general',
      tmKey,
      pretranslate = false,
    } = options;

    if (!files || !sourceLang || !targetLang) {
      throw new Error('files, sourceLang, and targetLang are required');
    }

    const fileArray = Array.isArray(files) ? files : [files];

    // Build multipart form data
    const boundary = '----MatecatBoundary' + Date.now().toString(16);
    const parts = [];

    // Add project parameters
    parts.push(this._buildFormField('project_name', projectName || `Project_${Date.now()}`));
    parts.push(this._buildFormField('source_lang', sourceLang));
    parts.push(this._buildFormField('target_lang', targetLang));
    parts.push(this._buildFormField('subject', subject));

    if (tmKey) {
      parts.push(this._buildFormField('private_tm_key', tmKey));
    }

    if (pretranslate) {
      parts.push(this._buildFormField('pretranslate_100', '1'));
    }

    // Add files
    for (const filePath of fileArray) {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      const fileContent = fs.readFileSync(filePath);
      const fileName = path.basename(filePath);
      parts.push(this._buildFileField('files', fileName, fileContent));
    }

    // Build multipart body
    const bodyParts = [];
    for (const part of parts) {
      bodyParts.push(Buffer.from(`--${boundary}\r\n`));
      bodyParts.push(Buffer.from(part.header + '\r\n\r\n'));
      bodyParts.push(part.content);
      bodyParts.push(Buffer.from('\r\n'));
    }
    bodyParts.push(Buffer.from(`--${boundary}--\r\n`));
    const requestBody = Buffer.concat(bodyParts);

    return this._request('POST', '/api/new', requestBody, {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': requestBody.length,
    });
  }

  /**
   * Get project status
   *
   * @param {string} idProject - Project ID
   * @param {string} password - Project password
   * @returns {Promise<object>} Project status
   */
  async getStatus(idProject, password) {
    const params = new URLSearchParams({
      id_project: idProject,
      project_pass: password,
    });

    return this._request('GET', `/api/status?${params}`);
  }

  /**
   * Get job statistics (word counts, translation progress)
   *
   * @param {string} idJob - Job ID
   * @param {string} password - Job password
   * @returns {Promise<object>} Job statistics
   */
  async getStats(idJob, password) {
    const params = new URLSearchParams({
      id_job: idJob,
      project_pass: password,
    });

    return this._request('GET', `/api/stats?${params}`);
  }

  /**
   * Get download URLs for a job
   *
   * @param {string} idJob - Job ID
   * @param {string} password - Job password
   * @returns {Promise<object>} Download URLs (original, translation, xliff)
   */
  async getUrls(idJob, password) {
    const params = new URLSearchParams({
      id_job: idJob,
      password: password,
    });

    return this._request('GET', `/api/url?${params}`);
  }

  /**
   * Download translated file
   *
   * @param {string} idJob - Job ID
   * @param {string} password - Job password
   * @param {string} outputPath - Path to save the downloaded file
   * @param {string} [type='translation'] - Type: 'original', 'translation', or 'xliff'
   * @returns {Promise<string>} Path to downloaded file
   */
  async downloadTranslation(idJob, password, outputPath, type = 'translation') {
    const urls = await this.getUrls(idJob, password);

    let downloadUrl;
    switch (type) {
      case 'original':
        downloadUrl = urls.original_download;
        break;
      case 'xliff':
        downloadUrl = urls.xliff_download;
        break;
      case 'translation':
      default:
        downloadUrl = urls.translation_download;
    }

    if (!downloadUrl) {
      throw new Error(`Download URL not available for type: ${type}`);
    }

    return this._downloadFile(downloadUrl, outputPath);
  }

  /**
   * Poll project status until complete or failed
   *
   * @param {string} idProject - Project ID
   * @param {string} password - Project password
   * @param {object} [options] - Polling options
   * @param {number} [options.interval=5000] - Poll interval in ms
   * @param {number} [options.timeout=3600000] - Max wait time in ms (default: 1 hour)
   * @param {function} [options.onProgress] - Progress callback (status) => void
   * @returns {Promise<object>} Final status
   */
  async pollUntilDone(idProject, password, options = {}) {
    const { interval = 5000, timeout = 3600000, onProgress } = options;

    const startTime = Date.now();

    for (;;) {
      const status = await this.getStatus(idProject, password);

      if (onProgress) {
        onProgress(status);
      }

      // Check if analysis is complete
      if (status.status === 'DONE') {
        return status;
      }

      if (status.status === 'FAIL') {
        throw new Error(`Project analysis failed: ${status.message || 'Unknown error'}`);
      }

      // Check timeout
      if (Date.now() - startTime > timeout) {
        throw new Error(`Polling timeout after ${timeout}ms`);
      }

      // Wait before next poll
      await this._sleep(interval);
    }
  }

  /**
   * Poll job until translation is complete
   *
   * @param {string} idJob - Job ID
   * @param {string} password - Job password
   * @param {object} [options] - Polling options
   * @param {number} [options.interval=10000] - Poll interval in ms
   * @param {number} [options.timeout=86400000] - Max wait time in ms (default: 24 hours)
   * @param {function} [options.onProgress] - Progress callback (stats) => void
   * @returns {Promise<object>} Final stats
   */
  async pollJobUntilComplete(idJob, password, options = {}) {
    const { interval = 10000, timeout = 86400000, onProgress } = options;

    const startTime = Date.now();

    for (;;) {
      const stats = await this.getStats(idJob, password);

      if (onProgress) {
        onProgress(stats);
      }

      // Check if translation is complete (all words translated or approved)
      const total = stats.TOTAL || 0;
      const translated = (stats.TRANSLATED || 0) + (stats.APPROVED || 0);

      if (total > 0 && translated >= total) {
        return stats;
      }

      // Check timeout
      if (Date.now() - startTime > timeout) {
        throw new Error(`Polling timeout after ${timeout}ms`);
      }

      // Wait before next poll
      await this._sleep(interval);
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  _buildFormField(name, value) {
    return {
      header: `Content-Disposition: form-data; name="${name}"`,
      content: Buffer.from(String(value)),
    };
  }

  _buildFileField(name, filename, content) {
    const mimeType = this._getMimeType(filename);
    return {
      header: `Content-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${mimeType}`,
      content: Buffer.isBuffer(content) ? content : Buffer.from(content),
    };
  }

  _getMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.xliff': 'application/xliff+xml',
      '.xlf': 'application/xliff+xml',
      '.xml': 'application/xml',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.txt': 'text/plain',
      '.html': 'text/html',
      '.htm': 'text/html',
      '.json': 'application/json',
      '.md': 'text/markdown',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  _request(method, endpoint, body = null, additionalHeaders = {}) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.hostname,
        port: this.port,
        path: this.basePath + endpoint,
        method,
        timeout: this.timeout,
        headers: {
          'x-matecat-key': this.apiKey,
          Accept: 'application/json',
          ...additionalHeaders,
        },
      };

      const req = this.protocol.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => (data += chunk));

        res.on('end', () => {
          try {
            const json = JSON.parse(data);

            if (res.statusCode >= 400) {
              const error = new Error(json.message || json.error || `HTTP ${res.statusCode}`);
              error.statusCode = res.statusCode;
              error.response = json;
              reject(error);
            } else {
              resolve(json);
            }
          } catch (e) {
            if (res.statusCode >= 400) {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            } else {
              resolve(data);
            }
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (body) {
        req.write(body);
      }

      req.end();
    });
  }

  _downloadFile(url, outputPath) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const protocol = parsedUrl.protocol === 'https:' ? https : http;

      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const file = fs.createWriteStream(outputPath);

      protocol
        .get(url, (response) => {
          if (response.statusCode === 301 || response.statusCode === 302) {
            // Handle redirect
            this._downloadFile(response.headers.location, outputPath).then(resolve).catch(reject);
            return;
          }

          if (response.statusCode !== 200) {
            reject(new Error(`Download failed: HTTP ${response.statusCode}`));
            return;
          }

          response.pipe(file);

          file.on('finish', () => {
            file.close();
            resolve(outputPath);
          });

          file.on('error', (err) => {
            fs.unlink(outputPath, () => {}); // Delete partial file
            reject(err);
          });
        })
        .on('error', (err) => {
          fs.unlink(outputPath, () => {}); // Delete partial file
          reject(err);
        });
    });
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Convenience Functions (for use without instantiating client)
// ============================================================================

/**
 * Create a Matecat client from environment variables
 * @returns {MatecatClient}
 */
function createClientFromEnv() {
  const apiKey = process.env.MATECAT_API_KEY;
  const baseUrl = process.env.MATECAT_BASE_URL;

  if (!apiKey) {
    throw new Error('MATECAT_API_KEY environment variable is required');
  }

  return new MatecatClient({
    apiKey,
    baseUrl: baseUrl || undefined,
  });
}

/**
 * Quick project creation helper
 *
 * @param {string} xliffPath - Path to XLIFF file
 * @param {string} sourceLang - Source language (e.g., 'en-US')
 * @param {string} targetLang - Target language (e.g., 'is-IS')
 * @param {object} [options] - Additional options
 * @returns {Promise<object>} Project info with id, password, and jobs
 */
async function createTranslationProject(xliffPath, sourceLang, targetLang, options = {}) {
  const client = options.client || createClientFromEnv();

  const result = await client.createProject({
    files: xliffPath,
    sourceLang,
    targetLang,
    projectName: options.projectName,
    subject: options.subject,
    tmKey: options.tmKey,
    pretranslate: options.pretranslate,
  });

  return {
    id: result.id_project,
    password: result.project_pass,
    jobs: result.jobs || [],
    analyzeUrl: result.analyze_url,
    raw: result,
  };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  MatecatClient,
  createClientFromEnv,
  createTranslationProject,

  // Language code helpers
  LANGUAGE_CODES: {
    ENGLISH_US: 'en-US',
    ENGLISH_UK: 'en-GB',
    ICELANDIC: 'is-IS',
    DANISH: 'da-DK',
    NORWEGIAN: 'nb-NO',
    SWEDISH: 'sv-SE',
    GERMAN: 'de-DE',
    FRENCH: 'fr-FR',
    SPANISH: 'es-ES',
  },

  // Subject codes
  SUBJECTS: {
    GENERAL: 'general',
    LEGAL: 'legal_documents_contracts',
    MEDICAL: 'medical_pharmaceutical',
    TECHNICAL: 'technical_documentation',
    MARKETING: 'marketing_advertising',
    EDUCATION: 'education_training',
    SCIENCE: 'science',
  },
};
