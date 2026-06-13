/**
 * Tests for buildEditDecisionNotification — the author-notification builder
 * for segment-edit decisions (Unit 5.1). Pure (no DB).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const notifications = require('../services/notifications');

const edit = {
  id: 7,
  editor_id: '42',
  book: 'efnafraedi-2e',
  chapter: 3,
  module_id: 'm68699',
  segment_id: 'm68699:para:p1',
};

describe('buildEditDecisionNotification', () => {
  it('builds an approval notification addressed to the edit author', () => {
    const n = notifications.buildEditDecisionNotification(edit, 'approved', '99', 'Ritstjóri');
    expect(n).not.toBeNull();
    expect(n.userId).toBe('42');
    expect(n.type).toBe('edit_approved');
    expect(n.link).toContain('module=m68699');
    expect(n.metadata.editId).toBe(7);
  });

  it('uses the right type for reject and discuss', () => {
    expect(notifications.buildEditDecisionNotification(edit, 'rejected', '99', 'R').type).toBe(
      'edit_rejected'
    );
    expect(notifications.buildEditDecisionNotification(edit, 'discuss', '99', 'R').type).toBe(
      'edit_discuss'
    );
  });

  it('includes a reviewer note in the message when provided', () => {
    const n = notifications.buildEditDecisionNotification(
      edit,
      'rejected',
      '99',
      'R',
      'Sjá hugtök'
    );
    expect(n.message).toContain('Sjá hugtök');
  });

  it('skips when the reviewer is the edit author (self-decision)', () => {
    // editor_id is '42' (string); reviewer 42 (number) — must still match.
    expect(notifications.buildEditDecisionNotification(edit, 'approved', 42, 'Self')).toBeNull();
  });

  it('returns null for an unknown decision', () => {
    expect(notifications.buildEditDecisionNotification(edit, 'bogus', '99', 'R')).toBeNull();
  });

  it('returns null when the edit has no author', () => {
    expect(
      notifications.buildEditDecisionNotification(
        { ...edit, editor_id: null },
        'approved',
        '99',
        'R'
      )
    ).toBeNull();
  });
});

describe('notifyEditDecision', () => {
  it('resolves to { skipped } on a self-decision without touching the DB', async () => {
    await expect(notifications.notifyEditDecision(edit, 'approved', '42', 'Self')).resolves.toEqual(
      {
        skipped: true,
      }
    );
  });
});
