// server/__tests__/helpers/retentionPlant.cjs
/**
 * Plants one row in every strip and delete table of SCOPE (G1.15(b) plan Task 5), for the editorial retention tests.
 *
 * Every person column gets its own value, absent from users: text `Planted Person <tag><n>`, an integer above 900000, except the
 * three integer columns with a FOREIGN KEY to users.id (user_book_access, user_chapter_assignments, chapter_assignments),
 * which point at one planted account. Every time column of the row gets the same time, `at` (text) or `atMs` (`*_ms`).
 * Parent rows (a book, a chapter, a section, a headword, a feedback, an edit) are planted first so foreign keys hold.
 * Rows are written by SQL: this is test data, and the write-API rule binds production code.
 */
const { SCOPE } = require('../../lib/editorialRetentionScope');

const AT = '2028-06-01 10:11:12';
const AT_MS = Date.UTC(2028, 5, 1, 10, 11, 12);

function insert(db, table, row) {
  const cols = Object.keys(row);
  const sql = `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
  return Number(db.prepare(sql).run(...cols.map((c) => row[c])).lastInsertRowid);
}

/**
 * @param {import('better-sqlite3').Database} db a database every migration built
 * @param {{ at?: string, atMs?: number, tag?: string }} [o]
 * @returns {{ names: string[], ints: number[], rows: Record<string, number>, accountId: number, bookId: number }}
 */
function plantAll(db, { at = AT, atMs = AT_MS, tag = 'A' } = {}) {
  let n = 0;
  const base = tag.charCodeAt(0) * 1000; // so two plantings (tags) never share a value
  const names = [];
  const ints = [];
  const accountId = insert(db, 'users', {
    provider_id: `planted-account-${tag}`,
    provider_username: `planted-account-${tag}`,
    display_name: `Planted Account ${tag}`,
    role: 'editor',
    is_active: 1,
  });
  // The integer person columns with a FOREIGN KEY to users.id point at the planted account.
  const ACCOUNT_FK_ALL = new Set([
    'user_book_access.user_id',
    'user_chapter_assignments.user_id',
    'chapter_assignments.assigned_to',
    'chapter_assignments.assigned_by',
  ]);

  /** A row of SCOPE table `t`: its person columns and its time columns filled, then `extra`. */
  const scoped = (t, extra = {}) => {
    const row = {};
    for (const c of SCOPE[t].times) row[c] = /_ms$/.test(c) ? atMs : at;
    for (const p of SCOPE[t].person) {
      if (p.timeCol) row[p.timeCol] = /_ms$/.test(p.timeCol) ? atMs : at;
      if (ACCOUNT_FK_ALL.has(`${t}.${p.col}`)) row[p.col] = accountId;
      else if (p.type === 'integer') ints.push((row[p.col] = 900000 + base + ++n));
      else names.push((row[p.col] = `Planted Person ${tag}${++n}`));
    }
    return { ...row, ...extra };
  };

  const rows = {};
  const book = `planted-book-${tag.toLowerCase()}`;
  rows.registered_books = insert(
    db,
    'registered_books',
    scoped('registered_books', { slug: book, title_is: 'x' })
  );
  const bookId = rows.registered_books;
  const chapterId = insert(db, 'book_chapters', { book_id: bookId, chapter_num: 1 });
  rows.book_sections = insert(
    db,
    'book_sections',
    scoped('book_sections', {
      book_id: bookId,
      chapter_id: chapterId,
      chapter_num: 1,
      section_num: '1.1',
    })
  );
  const headwordId = insert(db, 'terminology_headwords', { english: `planted-word-${tag}` });
  const seg = { book, chapter: 1, module_id: 'm90001', segment_id: `s-${tag}` };

  rows.segment_edits = insert(
    db,
    'segment_edits',
    scoped('segment_edits', {
      ...seg,
      original_content: 'a',
      edited_content: 'b',
      status: 'approved',
    })
  );
  rows.segment_discussions = insert(
    db,
    'segment_discussions',
    scoped('segment_discussions', { segment_edit_id: rows.segment_edits, comment: 'c' })
  );
  rows.segment_acceptances = insert(
    db,
    'segment_acceptances',
    scoped('segment_acceptances', { ...seg, accepted_content: 'b', status: 'active' })
  );
  rows.module_reviews = insert(
    db,
    'module_reviews',
    scoped('module_reviews', { book, chapter: 1, module_id: 'm90001', status: 'approved' })
  );
  rows.localization_edits = insert(
    db,
    'localization_edits',
    scoped('localization_edits', { ...seg, previous_content: 'a', new_content: 'b' })
  );
  rows.localization_pending_edits = insert(
    db,
    'localization_pending_edits',
    scoped('localization_pending_edits', {
      ...seg,
      original_content: 'a',
      edited_content: 'b',
      status: 'approved',
    })
  );
  rows.localization_suggestions = insert(
    db,
    'localization_suggestions',
    scoped('localization_suggestions', {
      section_id: rows.book_sections,
      suggestion_type: 'unit',
      original_text: 'a',
      suggested_text: 'b',
    })
  );
  const ruling = { ...seg, occurrence: 0, op_id: `op-${tag}`, ruling_id: 'r1' };
  rows.suggestion_rejections = insert(
    db,
    'suggestion_rejections',
    scoped('suggestion_rejections', ruling)
  );
  rows.suggestion_left_open = insert(
    db,
    'suggestion_left_open',
    scoped('suggestion_left_open', {
      ...ruling,
      finishing_act: 'approval',
      finishing_kind: 'segment_edit',
      finishing_id: rows.segment_edits,
      shown_at_finish: 0,
    })
  );
  rows.content_versions = insert(
    db,
    'content_versions',
    scoped('content_versions', { ...seg, content: 'b', version: 1, track: 'faithful' })
  );
  rows.figure_block_edit = insert(
    db,
    'figure_block_edit',
    scoped('figure_block_edit', {
      book_id: bookId,
      basename: `f-${tag}.png`,
      block_key: 'k',
      is_text: 'x',
    })
  );
  rows.figure_review = insert(
    db,
    'figure_review',
    scoped('figure_review', {
      book_id: bookId,
      chapter: 1,
      module_id: 'm90001',
      basename: `f-${tag}.png`,
      state: 'approved',
    })
  );
  rows.chapter_pipeline_status = insert(
    db,
    'chapter_pipeline_status',
    scoped('chapter_pipeline_status', {
      book_slug: book,
      chapter_num: 1,
      stage: 'extraction',
      status: 'complete',
    })
  );
  rows.terminology_translations = insert(
    db,
    'terminology_translations',
    scoped('terminology_translations', { headword_id: headwordId, icelandic: `orð-${tag}` })
  );
  rows.terminology_discussions = insert(
    db,
    'terminology_discussions',
    scoped('terminology_discussions', { headword_id: headwordId, comment: 'c' })
  );
  const layer = { book_id: bookId, reason: 'r', source: 's' };
  rows.book_glossary_entry = insert(
    db,
    'book_glossary_entry',
    scoped('book_glossary_entry', { ...layer, concept_id: 2000000 + base + n })
  );
  rows.book_glossary_exclusion = insert(
    db,
    'book_glossary_exclusion',
    scoped('book_glossary_exclusion', {
      ...layer,
      english: `Planted-${tag}`,
      match_key: `planted-${tag}`,
    })
  );
  rows.book_glossary_change = insert(
    db,
    'book_glossary_change',
    scoped('book_glossary_change', { ...layer, action: 'exclude', english: `Planted-${tag}` })
  );
  rows.feedback = insert(db, 'feedback', scoped('feedback', { type: 'bug', message: 'm' }));
  rows.feedback_responses = insert(
    db,
    'feedback_responses',
    scoped('feedback_responses', { feedback_id: rows.feedback, message: 'm' })
  );
  const iso = `${at.slice(0, 10)}T${at.slice(11)}.000Z`;
  rows.localization_logs = insert(
    db,
    'localization_logs',
    scoped('localization_logs', {
      section_id: rows.book_sections,
      entries: JSON.stringify([
        { id: 'e1', timestamp: iso, updatedAt: iso, type: 'unit', original: 'a' },
      ]),
    })
  );

  rows.activity_log = insert(
    db,
    'activity_log',
    scoped('activity_log', { type: 't', description: 'd' })
  );
  rows.notifications = insert(
    db,
    'notifications',
    scoped('notifications', { type: 't', title: 't', message: 'm' })
  );
  rows.chapter_locks = insert(
    db,
    'chapter_locks',
    scoped('chapter_locks', { chapter_id: `lock-${tag}`, expires_at: at })
  );
  rows.analytics_events = insert(
    db,
    'analytics_events',
    scoped('analytics_events', { event_type: 'view' })
  );
  rows.chapter_generation_log = insert(
    db,
    'chapter_generation_log',
    scoped('chapter_generation_log', { book_slug: book, chapter_num: 1, action: 'a' })
  );
  rows.user_book_access = insert(
    db,
    'user_book_access',
    scoped('user_book_access', { book_slug: book, role_for_book: 'editor' })
  );
  rows.user_chapter_assignments = insert(
    db,
    'user_chapter_assignments',
    scoped('user_chapter_assignments', { book_slug: book, chapter: 1 })
  );
  rows.chapter_assignments = insert(
    db,
    'chapter_assignments',
    scoped('chapter_assignments', { book, chapter: 1, stage: 'linguisticReview' })
  );
  rows.notification_preferences = insert(
    db,
    'notification_preferences',
    scoped('notification_preferences', { preferences: '{}' })
  );
  return { names, ints, rows, accountId, bookId };
}

/**
 * Dates every row already in a SCOPE table at `at` (`atMs` for a `*_ms` column), so no fixture depends on the day the
 * suite runs. A migration stamps its seeds with CURRENT_TIMESTAMP, which reads the OS clock and no injected clock
 * reaches: once that clock passes a retention date the seeds are later records, and every step on an injected clock
 * meets a refusal (final review I-2, measured: 4 tests red with the seeds dated 2029-06-01). Call it right after
 * freshMigratedDb(), before planting. NULL times stay NULL. The timestamp triggers are dropped around the writes and
 * recreated, as step 1 does, so a seed in one of their tables cannot be re-stamped with today's clock.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{ at?: string, atMs?: number }} [o]
 */
function pinSeeds(db, { at = AT, atMs = AT_MS } = {}) {
  const tables = Object.keys(SCOPE).filter(
    (t) => db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t) !== undefined
  );
  db.transaction(() => {
    const triggers = db
      .prepare(
        `SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name IN (${tables.map(() => '?').join(', ')})`
      )
      .all(...tables);
    for (const { name } of triggers) db.exec(`DROP TRIGGER "${name}"`);
    for (const t of tables) {
      const e = SCOPE[t];
      for (const c of new Set([...e.times, ...e.person.map((p) => p.timeCol).filter(Boolean)])) {
        db.prepare(`UPDATE "${t}" SET "${c}" = ? WHERE "${c}" IS NOT NULL`).run(/_ms$/.test(c) ? atMs : at);
      }
    }
    for (const { sql } of triggers) db.exec(sql);
  })();
}

module.exports = { plantAll, insert, pinSeeds, AT, AT_MS };
