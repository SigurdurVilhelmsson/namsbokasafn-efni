import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

describe('getEditorialProgress', () => {
  it('is exported from segmentEditorService', () => {
    const service = require('../services/segmentEditorService');
    expect(typeof service.getEditorialProgress).toBe('function');
  });
});
