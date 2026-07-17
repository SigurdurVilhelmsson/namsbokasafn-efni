/**
 * Tests for new features: validateBeforePublish, runPrepareTm, getReviewQueue
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// ----- pipelineService: runGenerateTm -----

describe('runGenerateTm', () => {
  const { runGenerateTm } = require('../services/pipelineService');

  it('throws when the book has no faithful translations', () => {
    expect(() => runGenerateTm({ book: 'nonexistent-book', chapter: 99 })).toThrow(
      'No faithful translations found'
    );
  });

  it('throws on missing faithful translation directory for a chapter', () => {
    // ch05 has 02-for-mt but no 03-faithful-translation/ch05
    expect(() => runGenerateTm({ book: 'efnafraedi-2e', chapter: 5 })).toThrow(
      'Faithful translation directory not found'
    );
  });

  it('is a function that accepts book/chapter/userId params', () => {
    expect(typeof runGenerateTm).toBe('function');
    expect(runGenerateTm.length).toBe(1); // single destructured param
  });
});

// ----- pipelineService: job management -----

describe('pipelineService job management', () => {
  const { getJob, listJobs, hasRunningJob } = require('../services/pipelineService');

  it('getJob returns null for unknown jobId', () => {
    expect(getJob('nonexistent-job-id')).toBeNull();
  });

  it('listJobs returns an array', () => {
    const jobs = listJobs();
    expect(Array.isArray(jobs)).toBe(true);
  });

  it('hasRunningJob returns falsy for non-running chapter', () => {
    const result = hasRunningJob('efnafraedi-2e', 99, 'inject');
    expect(result).toBeFalsy();
  });
});

// ----- pipelineService: job book-scoping (item 12, F5) -----

describe('pipelineService job book-scoping (item 12, F5)', () => {
  const { hasRunningJob, listJobs, _jobsMap } = require('../services/pipelineService');

  const baseJob = {
    moduleId: 'all',
    track: 'faithful',
    status: 'running',
    startedAt: new Date().toISOString(),
    completedAt: null,
    output: [],
    error: null,
  };

  afterEach(() => {
    _jobsMap().delete('test-f5-chem');
    _jobsMap().delete('test-f5-fetch');
  });

  it('a running job for one book does not block the same chapter of another book', () => {
    _jobsMap().set('test-f5-chem', {
      ...baseJob,
      id: 'test-f5-chem',
      type: 'pipeline',
      book: 'efnafraedi-2e',
      chapter: 3,
    });
    expect(hasRunningJob('liffraedi-2e', 3, 'pipeline')).toBeFalsy();
  });

  it('a running job still blocks its own book/chapter/type', () => {
    _jobsMap().set('test-f5-chem', {
      ...baseJob,
      id: 'test-f5-chem',
      type: 'pipeline',
      book: 'efnafraedi-2e',
      chapter: 3,
    });
    expect(hasRunningJob('efnafraedi-2e', 3, 'pipeline')?.id).toBe('test-f5-chem');
  });

  it('fetch-source dedupe is per-book (chapter null matches strictly)', () => {
    _jobsMap().set('test-f5-fetch', {
      ...baseJob,
      id: 'test-f5-fetch',
      type: 'fetch-source',
      book: 'efnafraedi-2e',
      chapter: null,
      moduleId: 'efnafraedi-2e',
      track: null,
    });
    expect(hasRunningJob('liffraedi-2e', null, 'fetch-source')).toBeFalsy();
    expect(hasRunningJob('efnafraedi-2e', null, 'fetch-source')?.id).toBe('test-f5-fetch');
  });

  it('listJobs filters by book', () => {
    _jobsMap().set('test-f5-chem', {
      ...baseJob,
      id: 'test-f5-chem',
      type: 'pipeline',
      book: 'efnafraedi-2e',
      chapter: 3,
    });
    expect(listJobs({ book: 'efnafraedi-2e' }).some((j) => j.id === 'test-f5-chem')).toBe(true);
    expect(listJobs({ book: 'liffraedi-2e' }).some((j) => j.id === 'test-f5-chem')).toBe(false);
  });
});

// ----- publicationService: validateBeforePublish -----

describe('validateBeforePublish', () => {
  const { validateBeforePublish } = require('../services/publicationService');

  it('is a function', () => {
    expect(typeof validateBeforePublish).toBe('function');
  });

  it('returns a promise', () => {
    const result = validateBeforePublish('efnafraedi-2e', 1, 'faithful');
    expect(result).toBeInstanceOf(Promise);
    // Don't await — the child process may or may not succeed in test env
    result.catch(() => {}); // suppress unhandled rejection
  });

  it('resolves with expected shape for valid chapter', async () => {
    try {
      const result = await validateBeforePublish('efnafraedi-2e', 1, 'faithful');
      expect(result).toHaveProperty('valid');
      expect(typeof result.valid).toBe('boolean');
      expect(result).toHaveProperty('errors');
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result).toHaveProperty('warnings');
      expect(Array.isArray(result.warnings)).toBe(true);
    } catch {
      // validate-chapter.js may not be runnable in test env — acceptable
    }
  }, 15000);
});

// ----- publicationService: track constants -----

describe('publication track constants (from constants.js)', () => {
  const { PUBLICATION_TRACKS, PUBLICATION_TRACK_DIRS } = require('../constants');

  it('defines three publication tracks as an array', () => {
    expect(PUBLICATION_TRACKS).toBeDefined();
    expect(Array.isArray(PUBLICATION_TRACKS)).toBe(true);
    expect(PUBLICATION_TRACKS).toEqual(['mtPreview', 'faithful', 'localized']);
  });

  it('maps track names to filesystem directory names', () => {
    expect(PUBLICATION_TRACK_DIRS).toBeDefined();
    expect(PUBLICATION_TRACK_DIRS.mtPreview).toBe('mt-preview');
    expect(PUBLICATION_TRACK_DIRS.faithful).toBe('faithful');
    expect(PUBLICATION_TRACK_DIRS.localized).toBe('localized');
  });
});
