/**
 * POST /api/analytics/event needs no sign-in, and what it stores is shown to admins on the
 * statistics tab of /admin. The route therefore holds the place fields (book, chapter, section)
 * to short plain text. The other half of the control, escaping where the values are displayed,
 * is pinned by adminAnalyticsEscaping.test.js.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const migration005 = require('../migrations/005-feedback');
const analytics = require('../services/analyticsService');
const router = require('../routes/analytics');

let db;

beforeEach(() => {
  db = new Database(':memory:');
  migration005.up(db);
  analytics._setTestDb(db);
});

afterEach(() => {
  analytics._setTestDb(null);
  db.close();
});

/** The route's final handler, found the way visitorSessions.test.js finds one. */
const postEvent = router.stack
  .find((l) => l.route && l.route.path === '/event' && l.route.methods.post)
  .route.stack.at(-1).handle;

function send(body) {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  postEvent({ body, cookies: {}, get: () => undefined }, res);
  return res;
}

const stored = () => analytics.getRecentEvents(50);

describe('POST /api/analytics/event: the place fields are short plain text', () => {
  it('stores an ordinary event unchanged (control: the route still accepts what the reader sends)', () => {
    const res = send({
      eventType: 'section_view',
      book: 'efnafraedi-2e',
      chapter: 3,
      section: '3-1-formula-mass',
    });
    expect(res.statusCode).toBe(200);
    expect(stored()).toHaveLength(1);
    expect(stored()[0]).toMatchObject({
      eventType: 'section_view',
      book: 'efnafraedi-2e',
      chapter: '3',
      section: '3-1-formula-mass',
    });
  });

  it('stores a chapter sent as a number as its digits, the appendices sentinel included', () => {
    // The column is text. A number bound as it came was kept as "3.0", which the admin page
    // showed as "K3.0" and which grouped apart from "3"; -1 came out as "K-1.0", not "Við.".
    send({ eventType: 'chapter_view', book: 'efnafraedi-2e', chapter: 3 });
    send({ eventType: 'chapter_view', book: 'efnafraedi-2e', chapter: -1 });
    expect(
      stored()
        .map((e) => e.chapter)
        .sort()
    ).toEqual(['-1', '3']);
  });

  it('accepts a chapter given as text', () => {
    expect(
      send({ eventType: 'chapter_view', book: 'efnafraedi-2e', chapter: 'appendices' }).statusCode
    ).toBe(200);
    expect(stored()).toHaveLength(1);
  });

  it('stores absent place fields as null, as before', () => {
    expect(send({ eventType: 'page_view' }).statusCode).toBe(200);
    expect(stored()[0]).toMatchObject({ book: null, chapter: null, section: null });
  });

  it.each([
    ['book', { book: '<img src=x onerror=alert(1)>' }],
    ['chapter', { chapter: '<b>1</b>' }],
    ['section', { section: '1-1"><script>alert(1)</script>' }],
    ['a closing bracket alone', { section: 'a>b' }],
    ['a control character', { book: 'efna\u0000fraedi' }],
    ['a line break', { section: '1-1\n2-2' }],
    ['an over-long value', { section: 'x'.repeat(201) }],
    ['an object', { book: { slug: 'efnafraedi-2e' } }],
    ['an array', { chapter: ['1'] }],
  ])('refuses %s and stores nothing', (_name, fields) => {
    const res = send({ eventType: 'page_view', ...fields });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Invalid event');
    expect(stored()).toHaveLength(0);
  });

  it('accepts a value of exactly the maximum length (the limit is the limit, not one below it)', () => {
    expect(send({ eventType: 'page_view', section: 'x'.repeat(200) }).statusCode).toBe(200);
  });

  it.each([
    ['null', null],
    ['an array', ['query']],
    ['a string', 'query'],
  ])('refuses metadata that is %s', (_name, metadata) => {
    const res = send({ eventType: 'search', metadata });
    expect(res.statusCode).toBe(400);
    expect(stored()).toHaveLength(0);
  });

  it('keeps a search query as free text: it is escaped where it is shown, not refused here', () => {
    const query = 'pH < 7 & "sýra"';
    expect(send({ eventType: 'search', metadata: { query } }).statusCode).toBe(200);
    expect(stored()[0].metadata.query).toBe(query);
  });
});
