/**
 * The status page's per-person figures (GET /api/status/analytics → teamMetrics), moved out of the route into
 * lib/teamMetrics so they can be tested without the route's book scan. "Merkja sem lokið" presses
 * (`module_marked_done`, register §C222) are a line in the shared activity feed and never a per-person count:
 * [USER] ruled on 2026-11-17 that presses appear in the feed and stay out of these figures.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { teamMetricsFrom } = require('../lib/teamMetrics');

const NOW = new Date('2026-11-17T12:00:00Z');
let nextId = 1;
/** An activity row as activityLog.search returns it (parseRow's shape). */
const row = (type, username, createdAt = '2026-11-16 10:00:00') => ({
  id: nextId++,
  type,
  userId: username,
  username,
  book: 'efnafraedi-2e',
  chapter: '1',
  section: 'm68664',
  description: 'x',
  metadata: {},
  createdAt,
});

describe('teamMetricsFrom', () => {
  it('a press adds nothing: a user whose only rows are presses is absent', () => {
    expect(teamMetricsFrom([row('module_marked_done', 'p-a')], NOW)).toEqual([]);
  });

  it('control: a save still counts', () => {
    expect(teamMetricsFrom([row('segment_edit_saved', 'p-a')], NOW)[0]).toMatchObject({
      username: 'p-a',
      totalActions: 1,
      submissions: 1,
    });
  });

  it("a press beside a save leaves the save's figures as they were", () => {
    const [m] = teamMetricsFrom(
      [row('segment_edit_saved', 'p-a'), row('module_marked_done', 'p-a', '2026-11-16 11:00:00')],
      NOW
    );
    expect(m).toMatchObject({ totalActions: 1, submissions: 1, lastActive: '2026-11-16 10:00:00' });
  });

  it('rows older than 30 days are skipped, as before', () => {
    expect(teamMetricsFrom([row('segment_edit_saved', 'p-a', '2026-10-01 10:00:00')], NOW)).toEqual(
      []
    );
  });

  it('sorts by total actions, most first, as before', () => {
    const out = teamMetricsFrom(
      [
        row('segment_edit_saved', 'p-a'),
        row('segment_edit_saved', 'p-b'),
        row('segment_edit_approved', 'p-b'),
      ],
      NOW
    );
    expect(out.map((m) => [m.username, m.totalActions, m.approvals])).toEqual([
      ['p-b', 2, 1],
      ['p-a', 1, 0],
    ]);
  });
});
