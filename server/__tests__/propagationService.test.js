import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const svc = require('../services/propagationService');

describe('classifyOccurrence', () => {
  const P = 'Sýra og basi'; // propagated text

  it('eligible: no edit, current text differs', () => {
    expect(svc.classifyOccurrence(P, { currentIs: '', existingEdit: null })).toBe('eligible');
    expect(svc.classifyOccurrence(P, { currentIs: 'eitthvað annað', existingEdit: null })).toBe(
      'eligible'
    );
  });

  it('already-matches: no edit, current text equals propagated', () => {
    expect(svc.classifyOccurrence(P, { currentIs: P, existingEdit: null })).toBe('already-matches');
  });

  it('already-matches: existing edit equals propagated', () => {
    expect(
      svc.classifyOccurrence(P, {
        currentIs: 'x',
        existingEdit: { edited_content: P, status: 'pending' },
      })
    ).toBe('already-matches');
  });

  it('conflict: existing edit differs (pending)', () => {
    expect(
      svc.classifyOccurrence(P, {
        currentIs: 'x',
        existingEdit: { edited_content: 'önnur þýðing', status: 'pending' },
      })
    ).toBe('conflict');
  });

  it('conflict: existing edit differs (applied)', () => {
    expect(
      svc.classifyOccurrence(P, {
        currentIs: 'x',
        existingEdit: { edited_content: 'önnur', status: 'applied' },
      })
    ).toBe('conflict');
  });
});
