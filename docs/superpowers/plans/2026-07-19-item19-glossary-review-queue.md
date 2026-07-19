# Item 19 — Glossary Review-Queue — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give head-editors a real, translation-granular review queue for `proposed`/`disputed`/`needs_review` glossary terms with tag-at-approval (closes I18-R1), batch approve+tag, and a new terminal `rejected` status — while proposed terms stay live in editor surfaces exactly as today.

**Architecture:** Service-layer queue query + counts + three transition extensions in `terminologyService.js` (no migration — `translations.status` has no CHECK constraint); five routes in `routes/terminology.js` (all above the parametric `/:id` routes); a queue panel on `terminology.html` following the mined-candidates card pattern. The old headword-granular `getReviewQueue` is retired when its last consumer is rewired.

**Tech Stack:** Node 22 / Express 5 / better-sqlite3 (singleton + `_setTestDb` in-memory injection), Vitest, vanilla-JS views.

**Spec:** `docs/superpowers/specs/2026-07-19-item19-glossary-review-queue-design.md`

## Global Constraints

- Branch: `feat/item19-glossary-review-queue` off current `main`. One PR. Commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- `npm test` from the **repo root** is the authoritative gate. Single file: `npx vitest run server/__tests__/<file>` — **NEVER `--project server`** (broken under vitest 4, register I16-R12).
- New `/api/terminology` routes MUST register above the parametric `/:id` routes (item-L regression, `routes/terminology.js:242-245`).
- Do NOT touch: `lookupTerm`/`findTermsInSegments` status gates (`status IN ('approved', 'proposed')` at service `:197`/`:1063`), the item-18 tier model, or the "deliberately strict" export subject rule (pinned by name in `terminologyService.test.js`).
- Any test file that requires server routes/services with their own DB opens MUST set `process.env.SESSIONS_DB_PATH` to a temp path BEFORE any `require` (item-12 real-DB-pollution lesson).
- Client byte-pins must match FILE BYTES: `terminology.html` JS strings use `\uXXXX` escapes, its markup uses HTML entities (`&#240;`), newer markup uses raw UTF-8 — check which form the touched region uses.
- Every DB-sourced field rendered client-side goes through `escapeHtml`/`escapeAttr` (Unit-0 stored-XSS discipline).
- No schema change: the hand-copied in-memory DDL in the test helper must stay byte-identical to today's (only its location moves in Task 4).

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `server/services/terminologyService.js` | Modify | `rejected` status, queue query + counts, approve-with-subjects, batch approve, reject, `getBookSubject` export; delete `getReviewQueue` (Task 4) |
| `server/routes/terminology.js` | Modify | Rewrite `GET /review-queue`, add `GET /review-queue/counts`, `POST /translations/batch-approve`, `POST /translations/:id/reject`; extend approve; delete `resolveBookSubject` |
| `server/__tests__/terminologyService.test.js` | Modify | New describes per service function; old `getReviewQueue()` describe deleted in Task 4 |
| `server/__tests__/helpers/terminologyTestDb.js` | Create (Task 4) | Shared in-memory DDL (extracted, not duplicated a third time) |
| `server/__tests__/terminologyReviewRoutes.test.js` | Create | Route ordering pins + handler-extraction behavioral tests |
| `server/views/terminology.html` | Modify | Queue panel, banner rewire, `Hafnað` status vocab |
| `server/__tests__/terminologyQueueClientPins.test.js` | Create | Byte-pins for client wiring |
| `server/e2e/terminology.spec.js` | Modify | Retarget review-queue shape checks to `{items, total}` |
| `docs/plans/2026-07-11-pre-semester-coding-campaign.md` | Modify (Task 6) | Register section I19-R1..R6 |

---

### Task 0: Branch setup

- [ ] **Step 0.1:** `git fetch origin && git checkout -b feat/item19-glossary-review-queue origin/main` (fetch first — post-merge push gotcha). Run `nvm use` and `npm test` from repo root once to confirm a green baseline. Expected: full suite passes (2963+ tests as of item 18).

---

### Task 1: `rejected` status foundation (service)

**Files:**
- Modify: `server/services/terminologyService.js` (`TERM_STATUSES:33`, new `rejectTranslation` after `disputeTranslation:~484`, `getStats:578-651`, `exportBookGlossary:1241-1298`, `module.exports`)
- Test: `server/__tests__/terminologyService.test.js`

**Interfaces:**
- Consumes: existing `insertFullTerm`/`insertHeadword`/`insertTranslation` test helpers; `terminology_discussions` insert pattern from `disputeTranslation:474-479`.
- Produces: `TERM_STATUSES = ['approved', 'proposed', 'disputed', 'needs_review', 'rejected']`; `rejectTranslation(translationId, userId, username, reason = '')` → headword object (throws `'Translation not found'`, `'reason must be a string of at most 500 characters'`); `REJECT_REASON_MAX = 500` (not exported); `getStats().byStatus.rejected`; `exportBookGlossary` excludes rejected rows.

- [ ] **Step 1.1: Write the failing tests.** Append to `server/__tests__/terminologyService.test.js` (after the `disputeTranslation()` describe):

```js
// =====================
// rejectTranslation() — item 19
// =====================
describe('rejectTranslation()', () => {
  it('exposes rejected as the fifth status', () => {
    expect(terminologyService.TERM_STATUSES).toEqual([
      'approved',
      'proposed',
      'disputed',
      'needs_review',
      'rejected',
    ]);
  });

  it('sets status rejected and records a discussion entry with actor + reason', () => {
    const { hwId, trId } = insertFullTerm({
      english: 'molecule',
      icelandic: 'sameind',
      status: 'proposed',
    });
    const hw = terminologyService.rejectTranslation(trId, 'u9', 'Head Editor', 'rangt fag');
    expect(hw.translations[0].status).toBe('rejected');
    const disc = db
      .prepare('SELECT * FROM terminology_discussions WHERE headword_id = ?')
      .all(hwId);
    expect(disc).toHaveLength(1);
    expect(disc[0].comment).toBe('Hafnað: rangt fag');
    expect(disc[0].username).toBe('Head Editor');
    expect(disc[0].user_id).toBe('u9');
  });

  it('records a bare "Hafnað" entry when no reason is given', () => {
    const { hwId, trId } = insertFullTerm({ english: 'atom', icelandic: 'frumeind' });
    terminologyService.rejectTranslation(trId, 'u9', 'Head Editor');
    const disc = db
      .prepare('SELECT comment FROM terminology_discussions WHERE headword_id = ?')
      .get(hwId);
    expect(disc.comment).toBe('Hafnað');
  });

  it('rejects from any prior status, including approved', () => {
    const { trId } = insertFullTerm({ english: 'ion', icelandic: 'jón', status: 'approved' });
    const hw = terminologyService.rejectTranslation(trId, 'u9', 'HE', '');
    expect(hw.translations[0].status).toBe('rejected');
  });

  it('approve after reject works (un-reject for free)', () => {
    const { trId } = insertFullTerm({ english: 'bond', icelandic: 'tengi', status: 'proposed' });
    terminologyService.rejectTranslation(trId, 'u9', 'HE', '');
    const hw = terminologyService.approveTranslation(trId, 'u9', 'HE');
    expect(hw.translations[0].status).toBe('approved');
  });

  it('throws on unknown translation id', () => {
    expect(() => terminologyService.rejectTranslation(9999, 'u', 'U', '')).toThrow(
      'Translation not found'
    );
  });

  it('throws when reason exceeds 500 characters, leaving status unchanged', () => {
    const { trId } = insertFullTerm({ english: 'gas', icelandic: 'gas', status: 'proposed' });
    expect(() =>
      terminologyService.rejectTranslation(trId, 'u', 'U', 'a'.repeat(501))
    ).toThrow('reason must be a string of at most 500 characters');
    const row = db
      .prepare('SELECT status FROM terminology_translations WHERE id = ?')
      .get(trId);
    expect(row.status).toBe('proposed');
  });

  it('rejected translations vanish from lookupTerm and findTermsInSegments', () => {
    const { trId } = insertFullTerm({
      english: 'molecule',
      icelandic: 'sameind',
      status: 'approved',
    });
    terminologyService.rejectTranslation(trId, 'u', 'U', '');
    expect(terminologyService.lookupTerm('molecule')).toHaveLength(0);
    const res = terminologyService.findTermsInSegments([
      { segmentId: 's1', enContent: 'a molecule here', isContent: 'texti' },
    ]);
    expect(res.s1.matches).toHaveLength(0);
    expect(res.s1.issues).toHaveLength(0);
  });
});
```

Then inside the existing `getStats()` describe add:

```js
  it('counts rejected translations (item 19)', () => {
    insertFullTerm({ english: 'molecule', icelandic: 'sameind', status: 'rejected' });
    insertFullTerm({ english: 'atom', icelandic: 'frumeind', status: 'approved' });
    const stats = terminologyService.getStats();
    expect(stats.byStatus.rejected).toBe(1);
    expect(stats.byStatus.approved).toBe(1);
  });
```

Then inside the existing `exportBookGlossary()` describe (the block containing the "deliberately strict" test, around `:1239-1302`) add:

```js
  it('excludes rejected translations from the export (item 19)', () => {
    insertFullTerm({
      english: 'molecule',
      icelandic: 'sameind',
      status: 'approved',
      subjects: ['chemistry'],
    });
    insertFullTerm({
      english: 'atom',
      icelandic: 'frumeind',
      status: 'rejected',
      subjects: ['chemistry'],
    });
    const out = terminologyService.exportBookGlossary('efnafraedi-2e');
    expect(out.terms.map((t) => t.english)).toEqual(['molecule']);
    expect(out.stats.total).toBe(1);
  });

  it('rejected siblings do not appear as alternatives (item 19)', () => {
    const hwId = insertHeadword({ english: 'bond' });
    const approvedId = insertTranslation(hwId, { icelandic: 'tengi', status: 'approved' });
    const rejectedId = insertTranslation(hwId, { icelandic: 'efnatengi', status: 'rejected' });
    addSubject(approvedId, 'chemistry');
    addSubject(rejectedId, 'chemistry');
    const out = terminologyService.exportBookGlossary('efnafraedi-2e');
    const bond = out.terms.find((t) => t.english === 'bond');
    expect(bond.alternatives).toEqual([]);
  });
```

- [ ] **Step 1.2: Run to verify failure.** `npx vitest run server/__tests__/terminologyService.test.js` — Expected: FAIL (`rejectTranslation is not a function`, TERM_STATUSES length 4, export includes rejected).

- [ ] **Step 1.3: Implement.** In `server/services/terminologyService.js`:

Line 33:
```js
const TERM_STATUSES = ['approved', 'proposed', 'disputed', 'needs_review', 'rejected'];
```

After `disputeTerm` alias (`:484`), add:
```js
const REJECT_REASON_MAX = 500;

/**
 * Reject a translation (item 19 — the review queue's negative action).
 * Terminal-but-reversible: approveTranslation approves from any status.
 * Audit trail is a terminology_discussions entry (dispute's pattern — no
 * schema change; the translations table has no rejected_by columns).
 */
function rejectTranslation(translationId, userId, username, reason = '') {
  const db = getDb();

  const tr = db.prepare('SELECT * FROM terminology_translations WHERE id = ?').get(translationId);
  if (!tr) {
    throw new Error('Translation not found');
  }
  if (typeof reason !== 'string' || reason.length > REJECT_REASON_MAX) {
    throw new Error(`reason must be a string of at most ${REJECT_REASON_MAX} characters`);
  }

  const rejectTx = db.transaction(() => {
    db.prepare(`UPDATE terminology_translations SET status = 'rejected' WHERE id = ?`).run(
      translationId
    );
    db.prepare(
      `
      INSERT INTO terminology_discussions (headword_id, user_id, username, comment, proposed_translation)
      VALUES (?, ?, ?, ?, NULL)
    `
    ).run(tr.headword_id, userId, username, reason ? `Hafnað: ${reason}` : 'Hafnað');
  });
  rejectTx();

  return getHeadword(tr.headword_id);
}
```

In `getStats` (`:596-609`) add the CASE column and byStatus key:
```js
        SUM(CASE WHEN t.status = 'needs_review' THEN 1 ELSE 0 END) as needs_review,
        SUM(CASE WHEN t.status = 'rejected' THEN 1 ELSE 0 END) as rejected
```
```js
      needsReview: stats?.needs_review || 0,
      rejected: stats?.rejected || 0,
```

In `exportBookGlossary` (`:1245-1255`), add a WHERE clause to the SQL (between the LEFT JOIN and GROUP BY):
```sql
       WHERE t.status != 'rejected'
```
(The `stats` literal at `:1267` keeps its four keys — rejected rows never reach the loop.)

In `module.exports` add `rejectTranslation` under the Approval-workflow group.

- [ ] **Step 1.4: Run to verify pass.** `npx vitest run server/__tests__/terminologyService.test.js` — Expected: PASS, including every pre-existing test (the export "deliberately strict" pin must be untouched).

- [ ] **Step 1.5: Commit.**
```bash
git add server/services/terminologyService.js server/__tests__/terminologyService.test.js
git commit -m "feat(item19): rejected status + rejectTranslation; exclude from export/stats opt-in"
```

---

### Task 2: Queue query + counts + `getBookSubject` (service)

**Files:**
- Modify: `server/services/terminologyService.js` (new functions after `getReviewQueue:548`; `module.exports`)
- Test: `server/__tests__/terminologyService.test.js`

**Interfaces:**
- Consumes: internal `getBookSubjectBySlug(db, bookSlug):1450`, `TERM_STATUSES`, test helpers.
- Produces (used by Task 4 routes and Task 5 client):
  - `getBookSubject(bookSlug)` → `string|null` (public wrapper; errors propagate — no swallow-to-null).
  - `getTranslationReviewQueue({statuses, source, subject, book, limit, offset})` → `{items, total}`; item = `{translationId, headwordId, english, pos, icelandic, definitionIs, notes, source, status, subjects, proposedBy, proposedByName, createdAt}`; default statuses `['proposed','disputed','needs_review']`; `subject: 'untagged'` special value; throws `'Invalid status: X'`, `'statuses must be a non-empty array'`.
  - `getReviewQueueCounts({book, subject})` → `{proposed, disputed, needsReview, subject}` (`subject` = the resolved effective subject or `null` — the client's picker prefill).
- Does NOT delete `getReviewQueue` yet (routes still call it until Task 4).

- [ ] **Step 2.1: Write the failing tests.** Append to `terminologyService.test.js`:

```js
// =====================
// getTranslationReviewQueue() / getReviewQueueCounts() / getBookSubject() — item 19
// =====================
describe('getBookSubject()', () => {
  it('resolves a mapped book, null for unmapped or missing input', () => {
    expect(terminologyService.getBookSubject('efnafraedi-2e')).toBe('chemistry');
    expect(terminologyService.getBookSubject('unknown-book')).toBeNull();
    expect(terminologyService.getBookSubject(null)).toBeNull();
    expect(terminologyService.getBookSubject(undefined)).toBeNull();
  });
});

describe('getTranslationReviewQueue()', () => {
  it('defaults to proposed+disputed+needs_review, excluding approved and rejected', () => {
    insertFullTerm({ english: 'a', icelandic: 'a1', status: 'approved' });
    insertFullTerm({ english: 'b', icelandic: 'b1', status: 'proposed' });
    insertFullTerm({ english: 'c', icelandic: 'c1', status: 'disputed' });
    insertFullTerm({ english: 'd', icelandic: 'd1', status: 'needs_review' });
    insertFullTerm({ english: 'e', icelandic: 'e1', status: 'rejected' });
    const { items, total } = terminologyService.getTranslationReviewQueue();
    expect(total).toBe(3);
    expect(items.map((i) => i.english).sort()).toEqual(['b', 'c', 'd']);
  });

  it('is translation-granular: mixed-status headword contributes only queued rows', () => {
    const hwId = insertHeadword({ english: 'bond' });
    insertTranslation(hwId, { icelandic: 'tengi', status: 'approved' });
    insertTranslation(hwId, { icelandic: 'efnatengi', status: 'proposed' });
    const { items, total } = terminologyService.getTranslationReviewQueue();
    expect(total).toBe(1);
    expect(items[0].icelandic).toBe('efnatengi');
    expect(items[0].english).toBe('bond');
    expect(items[0].headwordId).toBe(hwId);
  });

  it('accepts explicit statuses including rejected', () => {
    insertFullTerm({ english: 'a', icelandic: 'a1', status: 'proposed' });
    insertFullTerm({ english: 'b', icelandic: 'b1', status: 'rejected' });
    const { items, total } = terminologyService.getTranslationReviewQueue({
      statuses: ['rejected'],
    });
    expect(total).toBe(1);
    expect(items[0].english).toBe('b');
  });

  it('throws on an unknown status', () => {
    expect(() =>
      terminologyService.getTranslationReviewQueue({ statuses: ['bogus'] })
    ).toThrow('Invalid status: bogus');
    expect(() => terminologyService.getTranslationReviewQueue({ statuses: [] })).toThrow(
      'statuses must be a non-empty array'
    );
  });

  it('filters by source', () => {
    insertFullTerm({ english: 'a', icelandic: 'a1', source: 'mined-postedit' });
    insertFullTerm({ english: 'b', icelandic: 'b1', source: 'manual' });
    const { items } = terminologyService.getTranslationReviewQueue({ source: 'mined-postedit' });
    expect(items.map((i) => i.english)).toEqual(['a']);
  });

  it("subject slug matches tagged rows; 'untagged' matches only untagged rows", () => {
    insertFullTerm({ english: 'a', icelandic: 'a1', subjects: ['chemistry'] });
    insertFullTerm({ english: 'b', icelandic: 'b1' }); // untagged
    const chem = terminologyService.getTranslationReviewQueue({ subject: 'chemistry' });
    expect(chem.items.map((i) => i.english)).toEqual(['a']);
    const untagged = terminologyService.getTranslationReviewQueue({ subject: 'untagged' });
    expect(untagged.items.map((i) => i.english)).toEqual(['b']);
  });

  it('book resolves to the mapped subject; unmapped book applies no constraint', () => {
    insertFullTerm({ english: 'a', icelandic: 'a1', subjects: ['chemistry'] });
    insertFullTerm({ english: 'b', icelandic: 'b1', subjects: ['biology'] });
    const chem = terminologyService.getTranslationReviewQueue({ book: 'efnafraedi-2e' });
    expect(chem.items.map((i) => i.english)).toEqual(['a']);
    const all = terminologyService.getTranslationReviewQueue({ book: 'no-such-book' });
    expect(all.total).toBe(2);
  });

  it('paginates with a real total, newest-first (created_at DESC, id DESC)', () => {
    insertFullTerm({ english: 'a', icelandic: 'a1' });
    insertFullTerm({ english: 'b', icelandic: 'b1' });
    insertFullTerm({ english: 'c', icelandic: 'c1' });
    const page1 = terminologyService.getTranslationReviewQueue({ limit: 2, offset: 0 });
    expect(page1.total).toBe(3);
    expect(page1.items).toHaveLength(2);
    // Same-second created_at → id DESC tie-break: newest insert first
    expect(page1.items[0].english).toBe('c');
    const page2 = terminologyService.getTranslationReviewQueue({ limit: 2, offset: 2 });
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0].english).toBe('a');
  });

  it('rows carry headword context, subjects, and proposer', () => {
    insertFullTerm({
      english: 'molecule',
      icelandic: 'sameind',
      subjects: ['chemistry', 'general'],
      proposed_by_name: 'Jón',
    });
    const { items } = terminologyService.getTranslationReviewQueue();
    const it0 = items[0];
    expect(it0.english).toBe('molecule');
    expect(it0.icelandic).toBe('sameind');
    expect(it0.subjects.sort()).toEqual(['chemistry', 'general']);
    expect(it0.proposedByName).toBe('Jón');
    expect(it0.status).toBe('proposed');
    expect(typeof it0.translationId).toBe('number');
  });
});

describe('getReviewQueueCounts()', () => {
  it('returns per-status counts', () => {
    insertFullTerm({ english: 'a', icelandic: 'a1', status: 'proposed' });
    insertFullTerm({ english: 'b', icelandic: 'b1', status: 'proposed' });
    insertFullTerm({ english: 'c', icelandic: 'c1', status: 'disputed' });
    insertFullTerm({ english: 'd', icelandic: 'd1', status: 'approved' });
    const counts = terminologyService.getReviewQueueCounts();
    expect(counts).toEqual({ proposed: 2, disputed: 1, needsReview: 0, subject: null });
  });

  it('scopes by book subject and reports the resolved subject for picker prefill', () => {
    insertFullTerm({ english: 'a', icelandic: 'a1', subjects: ['chemistry'] });
    insertFullTerm({ english: 'b', icelandic: 'b1', subjects: ['biology'] });
    const counts = terminologyService.getReviewQueueCounts({ book: 'efnafraedi-2e' });
    expect(counts.proposed).toBe(1);
    expect(counts.subject).toBe('chemistry');
  });
});
```

- [ ] **Step 2.2: Run to verify failure.** `npx vitest run server/__tests__/terminologyService.test.js` — Expected: FAIL (`getBookSubject is not a function`, etc.).

- [ ] **Step 2.3: Implement.** In `terminologyService.js`, after the `getReviewQueue` function (keep it for now — routes still call it until Task 4), add:

```js
/**
 * Public book→subject resolver (item 19; consolidates the routes-level
 * resolveBookSubject duplicate — I18-R2). Errors propagate: fail loud.
 */
function getBookSubject(bookSlug) {
  if (!bookSlug) return null;
  return getBookSubjectBySlug(getDb(), bookSlug);
}

const REVIEW_QUEUE_DEFAULT_STATUSES = ['proposed', 'disputed', 'needs_review'];

/**
 * Build the subject-scoping WHERE fragment shared by the queue query and the
 * counts query. subject === 'untagged' selects rows with zero subject tags
 * (the I18-R1 targets a slug-filtered view must not silently hide).
 */
function subjectScopeClause(effectiveSubject, where, params) {
  if (effectiveSubject === 'untagged') {
    where.push(
      'NOT EXISTS (SELECT 1 FROM terminology_translation_subjects x WHERE x.translation_id = t.id)'
    );
  } else if (effectiveSubject) {
    where.push(
      'EXISTS (SELECT 1 FROM terminology_translation_subjects x WHERE x.translation_id = t.id AND x.subject = ?)'
    );
    params.push(effectiveSubject);
  }
}

/**
 * Translation-granular review queue (item 19). Replaces the headword-granular
 * getReviewQueue. Explicit `subject` beats `book`; a book without a subject
 * mapping applies no subject constraint.
 *
 * @returns {{ items: Array, total: number }}
 */
function getTranslationReviewQueue(options = {}) {
  const {
    statuses = REVIEW_QUEUE_DEFAULT_STATUSES,
    source,
    subject,
    book,
    limit = 50,
    offset = 0,
  } = options;
  const db = getDb();

  if (!Array.isArray(statuses) || statuses.length === 0) {
    throw new Error('statuses must be a non-empty array');
  }
  for (const s of statuses) {
    if (!TERM_STATUSES.includes(s)) throw new Error(`Invalid status: ${s}`);
  }

  const effectiveSubject = subject || (book ? getBookSubjectBySlug(db, book) : null);

  const where = [`t.status IN (${statuses.map(() => '?').join(', ')})`];
  const params = [...statuses];
  if (source) {
    where.push('t.source = ?');
    params.push(source);
  }
  subjectScopeClause(effectiveSubject, where, params);
  const whereSql = where.join(' AND ');

  const total = db
    .prepare(`SELECT COUNT(*) AS total FROM terminology_translations t WHERE ${whereSql}`)
    .get(...params).total;

  const rows = db
    .prepare(
      `
      SELECT t.id, t.headword_id, h.english, h.pos,
             t.icelandic, t.definition_is, t.notes, t.source, t.status,
             t.proposed_by, t.proposed_by_name, t.created_at
      FROM terminology_translations t
      JOIN terminology_headwords h ON h.id = t.headword_id
      WHERE ${whereSql}
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT ? OFFSET ?
    `
    )
    .all(...params, limit, offset);

  const subjectStmt = db.prepare(
    'SELECT subject FROM terminology_translation_subjects WHERE translation_id = ?'
  );

  const items = rows.map((r) => ({
    translationId: r.id,
    headwordId: r.headword_id,
    english: r.english,
    pos: r.pos || null,
    icelandic: r.icelandic,
    definitionIs: r.definition_is || null,
    notes: r.notes,
    source: r.source,
    status: r.status,
    subjects: subjectStmt.all(r.id).map((s) => s.subject),
    proposedBy: r.proposed_by,
    proposedByName: r.proposed_by_name,
    createdAt: r.created_at,
  }));

  return { items, total };
}

/**
 * Lightweight per-status counts for the review banner and queue chips.
 * `subject` in the result is the resolved effective subject (or null) so the
 * client can prefill its tag-at-approval picker without a book→subject map.
 */
function getReviewQueueCounts(options = {}) {
  const { book, subject } = options;
  const db = getDb();

  const effectiveSubject = subject || (book ? getBookSubjectBySlug(db, book) : null);

  const where = [`t.status IN ('proposed', 'disputed', 'needs_review')`];
  const params = [];
  subjectScopeClause(effectiveSubject, where, params);

  const row = db
    .prepare(
      `
      SELECT
        SUM(CASE WHEN t.status = 'proposed' THEN 1 ELSE 0 END) AS proposed,
        SUM(CASE WHEN t.status = 'disputed' THEN 1 ELSE 0 END) AS disputed,
        SUM(CASE WHEN t.status = 'needs_review' THEN 1 ELSE 0 END) AS needs_review
      FROM terminology_translations t
      WHERE ${where.join(' AND ')}
    `
    )
    .get(...params);

  return {
    proposed: row?.proposed || 0,
    disputed: row?.disputed || 0,
    needsReview: row?.needs_review || 0,
    subject: effectiveSubject || null,
  };
}
```

Add to `module.exports`: `getTranslationReviewQueue`, `getReviewQueueCounts`, `getBookSubject`.

- [ ] **Step 2.4: Run to verify pass.** `npx vitest run server/__tests__/terminologyService.test.js` — Expected: PASS.

- [ ] **Step 2.5: Commit.**
```bash
git add server/services/terminologyService.js server/__tests__/terminologyService.test.js
git commit -m "feat(item19): translation-granular review queue query + counts + getBookSubject"
```

---

### Task 3: Tag-at-approval + batch approve (service)

**Files:**
- Modify: `server/services/terminologyService.js` (`approveTranslation:432-453`, new `batchApproveTranslations` + `validateSubjects` beside it, `module.exports`)
- Test: `server/__tests__/terminologyService.test.js`

**Interfaces:**
- Consumes: `SUBJECTS` constant (`:51-59`), `getHeadword`, `proposeMinedTerm`, `exportBookGlossary` (for the I18-R1 end-to-end test).
- Produces (used by Task 4 routes):
  - `approveTranslation(translationId, userId, username, options = {})` — `options.subjects` (non-empty array of valid slugs) → replace tags + approve in one tx, runs even if already approved; omitted → byte-identical legacy behavior incl. the already-approved early-return. Throws `'Invalid subject: X'`, `'subjects must be a non-empty array'`.
  - `batchApproveTranslations(ids, userId, username, options = {})` → `{approved, alreadyApproved, tagged}`; all-or-nothing; throws `'ids must be a non-empty array'`, `'ids must be positive integers'`, `'Too many ids (max 200)'`, `'Translations not found: 3, 9'`. Batch subjects apply ONLY to currently-untagged rows; already-approved rows keep their original stamps.
  - `BATCH_APPROVE_LIMIT = 200` (not exported; route re-states 200 in its message via the thrown error).

- [ ] **Step 3.1: Write the failing tests.** Append to `terminologyService.test.js`:

```js
// =====================
// approveTranslation({subjects}) + batchApproveTranslations() — item 19
// =====================
describe('approveTranslation() with subjects (tag-at-approval, I18-R1)', () => {
  it('replaces subject tags and approves in one action', () => {
    const { trId } = insertFullTerm({ status: 'proposed', subjects: ['general'] });
    const hw = terminologyService.approveTranslation(trId, 'u1', 'Head', {
      subjects: ['chemistry'],
    });
    expect(hw.translations[0].status).toBe('approved');
    expect(hw.translations[0].subjects).toEqual(['chemistry']);
    expect(hw.translations[0].approvedByName).toBe('Head');
  });

  it('without subjects keeps the idempotent early-return (stamps unchanged)', () => {
    const { trId } = insertFullTerm({ status: 'proposed' });
    terminologyService.approveTranslation(trId, 'u1', 'First');
    const before = db
      .prepare('SELECT approved_by, approved_by_name FROM terminology_translations WHERE id = ?')
      .get(trId);
    terminologyService.approveTranslation(trId, 'u2', 'Second');
    const after = db
      .prepare('SELECT approved_by, approved_by_name FROM terminology_translations WHERE id = ?')
      .get(trId);
    expect(after).toEqual(before);
    expect(after.approved_by_name).toBe('First');
  });

  it('with subjects on an already-approved row re-tags (no early-return)', () => {
    const { trId } = insertFullTerm({ status: 'approved', subjects: ['general'] });
    const hw = terminologyService.approveTranslation(trId, 'u1', 'Head', {
      subjects: ['chemistry', 'biology'],
    });
    expect(hw.translations[0].subjects.sort()).toEqual(['biology', 'chemistry']);
    expect(hw.translations[0].status).toBe('approved');
  });

  it('throws on an invalid subject slug before any write', () => {
    const { trId } = insertFullTerm({ status: 'proposed', subjects: ['general'] });
    expect(() =>
      terminologyService.approveTranslation(trId, 'u', 'U', { subjects: ['klingon'] })
    ).toThrow('Invalid subject: klingon');
    const row = db
      .prepare('SELECT status FROM terminology_translations WHERE id = ?')
      .get(trId);
    expect(row.status).toBe('proposed');
    const tags = db
      .prepare('SELECT subject FROM terminology_translation_subjects WHERE translation_id = ?')
      .all(trId);
    expect(tags.map((t) => t.subject)).toEqual(['general']);
  });

  it('throws on an empty subjects array', () => {
    const { trId } = insertFullTerm({ status: 'proposed' });
    expect(() =>
      terminologyService.approveTranslation(trId, 'u', 'U', { subjects: [] })
    ).toThrow('subjects must be a non-empty array');
  });

  it('closes I18-R1 end-to-end: mined term tagged at approval passes the strict MT export', () => {
    const { translationId } = terminologyService.proposeMinedTerm(
      'yield',
      'heimta',
      null,
      'he1',
      'Head'
    );
    // Untagged + proposed → invisible to the subject-mapped export today
    expect(
      terminologyService.exportBookGlossary('efnafraedi-2e').terms.map((t) => t.english)
    ).not.toContain('yield');
    terminologyService.approveTranslation(translationId, 'he1', 'Head', {
      subjects: ['chemistry'],
    });
    const out = terminologyService.exportBookGlossary('efnafraedi-2e');
    const yieldTerm = out.terms.find((t) => t.english === 'yield');
    expect(yieldTerm).toBeDefined();
    expect(yieldTerm.status).toBe('approved');
  });
});

describe('batchApproveTranslations()', () => {
  it('approves all ids and tags only the untagged rows', () => {
    const tagged = insertFullTerm({
      english: 'a',
      icelandic: 'a1',
      status: 'proposed',
      subjects: ['biology'],
    });
    const untagged = insertFullTerm({ english: 'b', icelandic: 'b1', status: 'proposed' });
    const result = terminologyService.batchApproveTranslations(
      [tagged.trId, untagged.trId],
      'he1',
      'Head',
      { subjects: ['chemistry'] }
    );
    expect(result).toEqual({ approved: 2, alreadyApproved: 0, tagged: 1 });
    const tagsOfTagged = db
      .prepare('SELECT subject FROM terminology_translation_subjects WHERE translation_id = ?')
      .all(tagged.trId)
      .map((r) => r.subject);
    expect(tagsOfTagged).toEqual(['biology']); // untouched
    const tagsOfUntagged = db
      .prepare('SELECT subject FROM terminology_translation_subjects WHERE translation_id = ?')
      .all(untagged.trId)
      .map((r) => r.subject);
    expect(tagsOfUntagged).toEqual(['chemistry']);
    const statuses = db
      .prepare('SELECT status FROM terminology_translations WHERE id IN (?, ?)')
      .all(tagged.trId, untagged.trId)
      .map((r) => r.status);
    expect(statuses).toEqual(['approved', 'approved']);
  });

  it('works without subjects (plain batch approve)', () => {
    const { trId } = insertFullTerm({ status: 'proposed' });
    const result = terminologyService.batchApproveTranslations([trId], 'he1', 'Head');
    expect(result.approved).toBe(1);
  });

  it('is all-or-nothing: unknown id throws naming it, nothing applied', () => {
    const { trId } = insertFullTerm({ status: 'proposed' });
    expect(() =>
      terminologyService.batchApproveTranslations([trId, 9999], 'he1', 'Head')
    ).toThrow('Translations not found: 9999');
    const row = db
      .prepare('SELECT status FROM terminology_translations WHERE id = ?')
      .get(trId);
    expect(row.status).toBe('proposed');
  });

  it('skips re-stamping already-approved rows but still tags them if untagged', () => {
    const { trId } = insertFullTerm({ status: 'approved' }); // untagged, approved by nobody
    db.prepare(
      "UPDATE terminology_translations SET approved_by = 'orig', approved_by_name = 'Original' WHERE id = ?"
    ).run(trId);
    const result = terminologyService.batchApproveTranslations([trId], 'he2', 'Second', {
      subjects: ['chemistry'],
    });
    expect(result).toEqual({ approved: 0, alreadyApproved: 1, tagged: 1 });
    const row = db
      .prepare('SELECT approved_by_name FROM terminology_translations WHERE id = ?')
      .get(trId);
    expect(row.approved_by_name).toBe('Original');
  });

  it('validates ids: empty, non-integer, and >200 all throw', () => {
    expect(() => terminologyService.batchApproveTranslations([], 'u', 'U')).toThrow(
      'ids must be a non-empty array'
    );
    expect(() => terminologyService.batchApproveTranslations(['x'], 'u', 'U')).toThrow(
      'ids must be positive integers'
    );
    const tooMany = Array.from({ length: 201 }, (_, i) => i + 1);
    expect(() => terminologyService.batchApproveTranslations(tooMany, 'u', 'U')).toThrow(
      'Too many ids (max 200)'
    );
  });
});
```

- [ ] **Step 3.2: Run to verify failure.** `npx vitest run server/__tests__/terminologyService.test.js` — Expected: FAIL.

- [ ] **Step 3.3: Implement.** Replace `approveTranslation` (`:432-453`) and add the new functions beside it:

```js
/**
 * Validate a tag-at-approval subjects array (item 19). Throws before any write.
 */
function validateSubjects(subjects) {
  if (!Array.isArray(subjects) || subjects.length === 0) {
    throw new Error('subjects must be a non-empty array');
  }
  for (const s of subjects) {
    if (!SUBJECTS.includes(s)) throw new Error(`Invalid subject: ${s}`);
  }
}

/**
 * Approve a translation. With options.subjects (item 19, tag-at-approval /
 * I18-R1): wholesale-replace the subject tags and approve in one transaction —
 * runs even if already approved (re-tagging through approve is legitimate).
 * Without options.subjects: legacy behavior, byte-identical, including the
 * already-approved early-return.
 */
function approveTranslation(translationId, userId, username, options = {}) {
  const { subjects } = options;
  const db = getDb();

  const tr = db.prepare('SELECT * FROM terminology_translations WHERE id = ?').get(translationId);
  if (!tr) {
    throw new Error('Translation not found');
  }

  if (subjects !== undefined) {
    validateSubjects(subjects);
    const approveTx = db.transaction(() => {
      db.prepare('DELETE FROM terminology_translation_subjects WHERE translation_id = ?').run(
        translationId
      );
      const insertSubject = db.prepare(
        'INSERT INTO terminology_translation_subjects (translation_id, subject) VALUES (?, ?)'
      );
      for (const subj of subjects) {
        insertSubject.run(translationId, subj);
      }
      db.prepare(
        `
        UPDATE terminology_translations
        SET status = 'approved', approved_by = ?, approved_by_name = ?, approved_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      ).run(userId, username, translationId);
    });
    approveTx();
    return getHeadword(tr.headword_id);
  }

  if (tr.status === 'approved') {
    return getHeadword(tr.headword_id);
  }

  db.prepare(
    `
    UPDATE terminology_translations
    SET status = 'approved', approved_by = ?, approved_by_name = ?, approved_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `
  ).run(userId, username, translationId);

  return getHeadword(tr.headword_id);
}

const BATCH_APPROVE_LIMIT = 200;

/**
 * Batch approve (item 19). One transaction, all-or-nothing, fail-loud.
 * Subject semantics deliberately differ from single approve: the batch tag is
 * applied ONLY to currently-untagged rows — a bulk action can never clobber
 * deliberate per-term tagging. Already-approved rows keep their original
 * approval stamps (idempotency parity with single approve).
 *
 * @returns {{ approved: number, alreadyApproved: number, tagged: number }}
 */
function batchApproveTranslations(ids, userId, username, options = {}) {
  const { subjects } = options;
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('ids must be a non-empty array');
  }
  if (ids.length > BATCH_APPROVE_LIMIT) {
    throw new Error(`Too many ids (max ${BATCH_APPROVE_LIMIT})`);
  }
  if (!ids.every((id) => Number.isInteger(id) && id > 0)) {
    throw new Error('ids must be positive integers');
  }
  if (subjects !== undefined) {
    validateSubjects(subjects);
  }

  const db = getDb();
  const selectStmt = db.prepare('SELECT id, status FROM terminology_translations WHERE id = ?');
  const hasSubjectStmt = db.prepare(
    'SELECT 1 FROM terminology_translation_subjects WHERE translation_id = ? LIMIT 1'
  );
  const insertSubject = db.prepare(
    'INSERT OR IGNORE INTO terminology_translation_subjects (translation_id, subject) VALUES (?, ?)'
  );
  const approveStmt = db.prepare(
    `
    UPDATE terminology_translations
    SET status = 'approved', approved_by = ?, approved_by_name = ?, approved_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `
  );

  const batchTx = db.transaction(() => {
    const rows = ids.map((id) => ({ id, row: selectStmt.get(id) }));
    const missing = rows.filter((r) => !r.row).map((r) => r.id);
    if (missing.length > 0) {
      throw new Error(`Translations not found: ${missing.join(', ')}`);
    }
    let approved = 0;
    let alreadyApproved = 0;
    let tagged = 0;
    for (const { id, row } of rows) {
      if (subjects !== undefined && !hasSubjectStmt.get(id)) {
        for (const subj of subjects) {
          insertSubject.run(id, subj);
        }
        tagged++;
      }
      if (row.status === 'approved') {
        alreadyApproved++;
      } else {
        approveStmt.run(userId, username, id);
        approved++;
      }
    }
    return { approved, alreadyApproved, tagged };
  });

  return batchTx();
}
```

Add `batchApproveTranslations` to `module.exports` (Approval-workflow group). `approveTerm` alias stays pointing at `approveTranslation`.

- [ ] **Step 3.4: Run to verify pass.** `npx vitest run server/__tests__/terminologyService.test.js` — Expected: PASS. Also run `npx vitest run server/__tests__/termMiningService.test.js` — Expected: PASS (promoteCandidate uses the no-options approve path indirectly? It does not call approve at all — it creates proposed. This run is a cheap regression guard).

- [ ] **Step 3.5: Commit.**
```bash
git add server/services/terminologyService.js server/__tests__/terminologyService.test.js
git commit -m "feat(item19): tag-at-approval (I18-R1) + all-or-nothing batchApproveTranslations"
```

---

### Task 4: Routes — queue contract, batch, reject; retire getReviewQueue + resolveBookSubject

**Files:**
- Modify: `server/routes/terminology.js` (rewrite `GET /review-queue:122-137`, add counts/batch/reject, extend approve `:565-592`, delete `resolveBookSubject:985-1018`, rewire its 4 call sites `:61, :178, :752, :906`)
- Modify: `server/services/terminologyService.js` (delete `getReviewQueue:515-548` + its export)
- Modify: `server/__tests__/terminologyService.test.js` (delete the old `getReviewQueue()` describe `:649-693`; extract DDL to helper)
- Create: `server/__tests__/helpers/terminologyTestDb.js`
- Create: `server/__tests__/terminologyReviewRoutes.test.js`

**Interfaces:**
- Consumes: Task 1–3 service functions; `requireAuth`/`requireRole(ROLES.*)`; `activityLog.log`; handler-extraction idiom from `locApproveConflict.test.js` (`router.stack.find(l => l.route && l.route.path === P && l.route.methods.M)`, handler = `layer.route.stack[layer.route.stack.length - 1].handle`).
- Produces (consumed by Task 5 client):
  - `GET /api/terminology/review-queue` (EDITOR) → `{items, total, limit, offset}`; query `status` (comma-list), `source`, `subject`, `book`, `limit` (clamp 1–200, default 50), `offset`.
  - `GET /api/terminology/review-queue/counts` (EDITOR) → `{proposed, disputed, needsReview, subject}`; query `book`, `subject`.
  - `POST /api/terminology/translations/:id/approve` (HEAD_EDITOR) body `{subjects?}`.
  - `POST /api/terminology/translations/batch-approve` (HEAD_EDITOR) body `{ids, subjects?}` → `{success, approved, alreadyApproved, tagged}`.
  - `POST /api/terminology/translations/:id/reject` (HEAD_EDITOR) body `{reason?}` → `{success, term}`.

- [ ] **Step 4.1: Extract the shared test DDL.** Create `server/__tests__/helpers/terminologyTestDb.js` containing exactly the `createTestDb` function currently at `terminologyService.test.js:18-95` (byte-identical DDL — copy it, do not retype), as:

```js
/**
 * Shared in-memory terminology schema for unit tests.
 * Hand-maintained copy of migration 032's tables (+ registered_books /
 * book_subject_mapping seed) — keep in sync with the real migrations.
 * Extracted from terminologyService.test.js in item 19 so the route harness
 * doesn't become a third hand-copied DDL.
 */
// Plain CJS so both ESM vitest files can load it via their createRequire.
const Database = require('better-sqlite3');

function createTestDb() {
  const testDb = new Database(':memory:');
  testDb.pragma('journal_mode = WAL');
  testDb.pragma('foreign_keys = ON');
  testDb.exec(`/* ← paste the exact CREATE TABLE + INSERT block from terminologyService.test.js:23-92 here, unchanged */`);
  return testDb;
}

module.exports = { createTestDb };
```

In `terminologyService.test.js`: delete the inline `createTestDb` (`:18-95`) and replace with `const { createTestDb } = require('./helpers/terminologyTestDb');` (it already has `createRequire`). Run `npx vitest run server/__tests__/terminologyService.test.js` — Expected: PASS unchanged (pure extraction).

- [ ] **Step 4.2: Write the failing route tests.** Create `server/__tests__/terminologyReviewRoutes.test.js`:

```js
/**
 * Item 19 — review-queue route contract tests.
 * Harness idiom: locApproveConflict.test.js (handler extracted from the
 * router stack, invoked with fake req/res).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import os from 'os';

// MUST precede every server require — activityLog opens the real sessions.db
// otherwise (item-12 pollution lesson).
process.env.SESSIONS_DB_PATH = path.join(
  os.tmpdir(),
  `term-review-routes-${process.pid}.db`
);

const require = createRequire(import.meta.url);
const { createTestDb } = require('./helpers/terminologyTestDb');
const terminologyService = require('../services/terminologyService');

let db;
let router;

function getLayer(routePath, method) {
  return router.stack.find(
    (l) => l.route && l.route.path === routePath && l.route.methods[method]
  );
}

function getHandler(routePath, method) {
  const layer = getLayer(routePath, method);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function invoke(handler, req) {
  let resolveResult;
  const done = new Promise((resolve) => {
    resolveResult = resolve;
  });
  const res = {
    statusCode: 200,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(body) {
      resolveResult({ status: this.statusCode, body });
    },
  };
  return Promise.resolve(handler(req, res)).then(() => done);
}

const HE_USER = { id: 'he1', name: 'Head Editor', username: 'head' };

function insertTerm(english, icelandic, status = 'proposed', subjects = []) {
  const hw = db
    .prepare('INSERT INTO terminology_headwords (english) VALUES (?)')
    .run(english);
  const tr = db
    .prepare(
      `INSERT INTO terminology_translations (headword_id, icelandic, source, status)
       VALUES (?, ?, 'manual', ?)`
    )
    .run(Number(hw.lastInsertRowid), icelandic, status);
  const trId = Number(tr.lastInsertRowid);
  for (const s of subjects) {
    db.prepare(
      'INSERT INTO terminology_translation_subjects (translation_id, subject) VALUES (?, ?)'
    ).run(trId, s);
  }
  return trId;
}

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations(); // gives activityLog a real (temp) DB to write into
  db = createTestDb();
  terminologyService._setTestDb(db);
  router = require('../routes/terminology');
});

afterAll(() => {
  terminologyService._setTestDb(null);
  db.close();
});

beforeEach(() => {
  db.exec('DELETE FROM terminology_discussions');
  db.exec('DELETE FROM terminology_translation_subjects');
  db.exec('DELETE FROM terminology_translations');
  db.exec('DELETE FROM terminology_headwords');
});

describe('route registration (item-L ordering trap)', () => {
  it('registers queue + batch routes above the parametric routes', () => {
    const order = (p, m) =>
      router.stack.findIndex((l) => l.route && l.route.path === p && l.route.methods[m]);
    expect(order('/review-queue', 'get')).toBeGreaterThan(-1);
    expect(order('/review-queue/counts', 'get')).toBeGreaterThan(-1);
    expect(order('/review-queue/counts', 'get')).toBeLessThan(order('/:id', 'get'));
    expect(order('/review-queue', 'get')).toBeLessThan(order('/:id', 'get'));
    expect(order('/translations/batch-approve', 'post')).toBeGreaterThan(-1);
    expect(getLayer('/translations/:id/reject', 'post')).toBeDefined();
  });

  it('the legacy headword-granular getReviewQueue is gone from the service', () => {
    expect(terminologyService.getReviewQueue).toBeUndefined();
  });
});

describe('GET /review-queue (new contract)', () => {
  it('returns {items, total, limit, offset}', async () => {
    insertTerm('molecule', 'sameind', 'proposed');
    insertTerm('atom', 'frumeind', 'approved');
    const out = await invoke(getHandler('/review-queue', 'get'), { query: {} });
    expect(out.status).toBe(200);
    expect(out.body.total).toBe(1);
    expect(out.body.items[0].english).toBe('molecule');
    expect(out.body.limit).toBe(50);
    expect(out.body.offset).toBe(0);
  });

  it('parses comma-separated status and 400s on an unknown one', async () => {
    insertTerm('a', 'a1', 'rejected');
    const ok = await invoke(getHandler('/review-queue', 'get'), {
      query: { status: 'rejected' },
    });
    expect(ok.body.total).toBe(1);
    const bad = await invoke(getHandler('/review-queue', 'get'), {
      query: { status: 'bogus' },
    });
    expect(bad.status).toBe(400);
  });
});

describe('GET /review-queue/counts', () => {
  it('returns per-status counts with resolved subject', async () => {
    insertTerm('a', 'a1', 'proposed', ['chemistry']);
    insertTerm('b', 'b1', 'disputed');
    const out = await invoke(getHandler('/review-queue/counts', 'get'), {
      query: { book: 'efnafraedi-2e' },
    });
    expect(out.status).toBe(200);
    expect(out.body).toEqual({ proposed: 1, disputed: 0, needsReview: 0, subject: 'chemistry' });
  });
});

describe('POST /translations/:id/approve with subjects', () => {
  it('tags and approves; 400 on invalid slug', async () => {
    const trId = insertTerm('a', 'a1', 'proposed');
    const handler = getHandler('/translations/:id/approve', 'post');
    const ok = await invoke(handler, {
      params: { id: String(trId) },
      body: { subjects: ['chemistry'] },
      user: HE_USER,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.term.translations[0].status).toBe('approved');
    expect(ok.body.term.translations[0].subjects).toEqual(['chemistry']);

    const trId2 = insertTerm('b', 'b1', 'proposed');
    const bad = await invoke(handler, {
      params: { id: String(trId2) },
      body: { subjects: ['klingon'] },
      user: HE_USER,
    });
    expect(bad.status).toBe(400);
  });

  it('legacy no-body approve still works', async () => {
    const trId = insertTerm('a', 'a1', 'proposed');
    const out = await invoke(getHandler('/translations/:id/approve', 'post'), {
      params: { id: String(trId) },
      body: {},
      user: HE_USER,
    });
    expect(out.status).toBe(200);
    expect(out.body.term.translations[0].status).toBe('approved');
  });
});

describe('POST /translations/batch-approve', () => {
  it('approves + tags untagged; all-or-nothing 404 names missing ids', async () => {
    const a = insertTerm('a', 'a1', 'proposed');
    const b = insertTerm('b', 'b1', 'proposed', ['biology']);
    const handler = getHandler('/translations/batch-approve', 'post');
    const ok = await invoke(handler, {
      body: { ids: [a, b], subjects: ['chemistry'] },
      user: HE_USER,
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ success: true, approved: 2, tagged: 1 });

    const c = insertTerm('c', 'c1', 'proposed');
    const bad = await invoke(handler, { body: { ids: [c, 9999] }, user: HE_USER });
    expect(bad.status).toBe(404);
    expect(bad.body.message).toContain('9999');
    const row = db.prepare('SELECT status FROM terminology_translations WHERE id = ?').get(c);
    expect(row.status).toBe('proposed');
  });

  it('400s on empty/oversized/garbage ids', async () => {
    const handler = getHandler('/translations/batch-approve', 'post');
    expect((await invoke(handler, { body: { ids: [] }, user: HE_USER })).status).toBe(400);
    expect((await invoke(handler, { body: {}, user: HE_USER })).status).toBe(400);
    const tooMany = Array.from({ length: 201 }, (_, i) => i + 1);
    expect((await invoke(handler, { body: { ids: tooMany }, user: HE_USER })).status).toBe(400);
  });
});

describe('POST /translations/:id/reject', () => {
  it('rejects with reason; 404 unknown; 400 oversize reason', async () => {
    const trId = insertTerm('a', 'a1', 'proposed');
    const handler = getHandler('/translations/:id/reject', 'post');
    const ok = await invoke(handler, {
      params: { id: String(trId) },
      body: { reason: 'rangt' },
      user: HE_USER,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.term.translations[0].status).toBe('rejected');

    const missing = await invoke(handler, {
      params: { id: '9999' },
      body: {},
      user: HE_USER,
    });
    expect(missing.status).toBe(404);

    const trId2 = insertTerm('b', 'b1', 'proposed');
    const oversize = await invoke(handler, {
      params: { id: String(trId2) },
      body: { reason: 'a'.repeat(501) },
      user: HE_USER,
    });
    expect(oversize.status).toBe(400);
  });
});
```

- [ ] **Step 4.3: Run to verify failure.** `npx vitest run server/__tests__/terminologyReviewRoutes.test.js` — Expected: FAIL (counts route missing, old `{terms}` shape, `getReviewQueue` still exported).

- [ ] **Step 4.4: Implement routes.** In `server/routes/terminology.js`:

Replace the `GET /review-queue` handler (`:118-137`) with:

```js
/**
 * GET /api/terminology/review-queue  (item 19 — translation-granular)
 * Query: status (comma-list, default proposed,disputed,needs_review),
 *        source, subject ('untagged' allowed), book, limit, offset.
 * Read = EDITOR; actions are HEAD_EDITOR (pinned RBAC asymmetry).
 */
router.get('/review-queue', requireAuth, requireRole(ROLES.EDITOR), (req, res) => {
  const { status, source, subject, book, limit, offset } = req.query;

  const effLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const effOffset = Math.max(parseInt(offset, 10) || 0, 0);

  try {
    const statuses = status
      ? String(status)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

    const result = terminology.getTranslationReviewQueue({
      statuses,
      source: source || undefined,
      subject: subject || undefined,
      book: book || undefined,
      limit: effLimit,
      offset: effOffset,
    });

    res.json({ ...result, limit: effLimit, offset: effOffset });
  } catch (err) {
    log.error({ err }, 'Review queue error');
    const badRequest = err.message.includes('Invalid') || err.message.includes('must be');
    res.status(badRequest ? 400 : 500).json({
      error: 'Failed to get review queue',
      message: err.message,
    });
  }
});

/**
 * GET /api/terminology/review-queue/counts  (item 19)
 * Feeds the banner + queue chips; `subject` in the response is the resolved
 * effective subject for the client's tag-at-approval picker prefill.
 */
router.get('/review-queue/counts', requireAuth, requireRole(ROLES.EDITOR), (req, res) => {
  try {
    const counts = terminology.getReviewQueueCounts({
      book: req.query.book || undefined,
      subject: req.query.subject || undefined,
    });
    res.json(counts);
  } catch (err) {
    log.error({ err }, 'Review queue counts error');
    res.status(500).json({ error: 'Failed to get review queue counts', message: err.message });
  }
});
```

In the WORKFLOW section, extend the approve handler (`:565-592`) — only the service call and error mapping change:

```js
      const options =
        req.body && req.body.subjects !== undefined ? { subjects: req.body.subjects } : {};
      const term = terminology.approveTranslation(
        parseInt(id, 10),
        req.user.id,
        req.user.name,
        options
      );
```
and its catch:
```js
      log.error({ err }, 'Approve translation error');
      const badRequest = err.message.includes('Invalid') || err.message.includes('must be');
      res
        .status(err.message.includes('not found') ? 404 : badRequest ? 400 : 500)
        .json({ error: 'Failed to approve translation', message: err.message });
```

Add ABOVE the `POST /translations/:id/approve` route:

```js
/**
 * POST /api/terminology/translations/batch-approve  (item 19)
 * Body: { ids: number[], subjects?: string[] }.
 * All-or-nothing; batch subjects tag ONLY currently-untagged rows.
 */
router.post(
  '/translations/batch-approve',
  requireAuth,
  requireRole(ROLES.HEAD_EDITOR),
  (req, res) => {
    const { ids, subjects } = req.body || {};

    try {
      const result = terminology.batchApproveTranslations(
        ids,
        req.user.id,
        req.user.name,
        subjects !== undefined ? { subjects } : {}
      );

      activityLog.log({
        type: 'batch_approve_translations',
        userId: req.user.id,
        username: req.user.username,
        description: `Batch-approved ${result.approved} translations (${result.tagged} tagged)`,
        metadata: { ids, subjects: subjects || null, ...result },
      });

      res.json({ success: true, ...result });
    } catch (err) {
      log.error({ err }, 'Batch approve error');
      const badRequest =
        err.message.includes('must be') ||
        err.message.includes('Invalid') ||
        err.message.includes('Too many');
      res
        .status(err.message.includes('not found') ? 404 : badRequest ? 400 : 500)
        .json({ error: 'Failed to batch-approve translations', message: err.message });
    }
  }
);

/**
 * POST /api/terminology/translations/:id/reject  (item 19)
 * Body: { reason?: string } (≤500 chars). Terminal-but-reversible.
 */
router.post(
  '/translations/:id/reject',
  requireAuth,
  requireRole(ROLES.HEAD_EDITOR),
  (req, res) => {
    const { id } = req.params;
    const { reason } = req.body || {};

    try {
      const term = terminology.rejectTranslation(
        parseInt(id, 10),
        req.user.id,
        req.user.name,
        typeof reason === 'string' ? reason : ''
      );

      activityLog.log({
        type: 'reject_translation',
        userId: req.user.id,
        username: req.user.username,
        description: `Rejected translation #${id} for "${term.english}"`,
        metadata: { headwordId: term.id, translationId: parseInt(id, 10) },
      });

      res.json({ success: true, term });
    } catch (err) {
      log.error({ err }, 'Reject translation error');
      const badRequest = err.message.includes('must be');
      res
        .status(err.message.includes('not found') ? 404 : badRequest ? 400 : 500)
        .json({ error: 'Failed to reject translation', message: err.message });
    }
  }
);
```

Delete `resolveBookSubject` (`:985-1018`) and replace its 4 call sites (`:61, :178, :752, :906`) with `terminology.getBookSubject(bookSlug)`.

- [ ] **Step 4.5: Retire `getReviewQueue`.** In `terminologyService.js` delete the function (`:515-548`) and its `module.exports` line. In `terminologyService.test.js` delete the whole `getReviewQueue()` describe block (`:647-693`, including the section comment).

- [ ] **Step 4.6: Run to verify pass.** `npx vitest run server/__tests__/terminologyReviewRoutes.test.js server/__tests__/terminologyService.test.js` — Expected: PASS. Then full `npm test` from repo root — Expected: PASS (any other file referencing `getReviewQueue` would surface here; none is known).

- [ ] **Step 4.7: Commit.**
```bash
git add server/routes/terminology.js server/services/terminologyService.js server/__tests__/
git commit -m "feat(item19): queue/batch/reject routes; retire getReviewQueue + resolveBookSubject (I18-R2)"
```

---

### Task 5: Client — queue panel, banner rewire, Hafnað vocabulary

**Files:**
- Modify: `server/views/terminology.html`
- Test: `server/__tests__/terminologyQueueClientPins.test.js` (create)

**Interfaces:**
- Consumes: Task 4 endpoints; page globals `currentUser`, `subjects`, `sources` (set by `loadMetadata`), helpers `fetchJson`, `escapeHtml`, `escapeAttr`, `formatSubject`, `formatStatus`, `formatDate`, `showTermDetail`, `searchTerms`, `loadStats`.
- Produces: `#queue-section` panel; rewired `#review-queue-alert` banner; `formatStatus` + status dropdown carrying `rejected`.

- [ ] **Step 5.1: Write the failing byte-pin test.** Create `server/__tests__/terminologyQueueClientPins.test.js`:

```js
/**
 * Item 19 — static byte-pins for the terminology.html queue wiring.
 * Pins match FILE BYTES: the JS status map uses \uXXXX escapes (a literal
 * backslash-u sequence in the file), the dropdown uses HTML entities.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const html = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'views', 'terminology.html'),
  'utf8'
);

describe('terminology.html review-queue wiring (item 19)', () => {
  it('has the queue panel and wiring endpoints', () => {
    expect(html).toContain('id="queue-section"');
    expect(html).toContain('/api/terminology/review-queue/counts');
    expect(html).toContain('/api/terminology/translations/batch-approve');
    expect(html).toContain("'/reject'");
  });

  it('carries the rejected status vocabulary in both dialects', () => {
    // JS map: literal backslash-u escape in the file
    expect(html).toContain("'rejected': 'Hafna\\u00F0'");
    // Dropdown option: HTML entity like its siblings
    expect(html).toContain('<option value="rejected">Hafna&#240;</option>');
  });

  it('the fake limit=1 banner fetch is gone', () => {
    expect(html).not.toContain('review-queue?limit=1');
  });

  it('every queue render site escapes DB-sourced fields', () => {
    // renderQueueRows must reference the escapers (presence pin; behavior is
    // covered by the shared escapeHtml implementation used page-wide)
    const fn = html.slice(html.indexOf('function renderQueueRows'), html.indexOf('function renderQueueRows') + 2500);
    expect(fn).toContain('escapeHtml(it.english)');
    expect(fn).toContain('escapeHtml(it.icelandic)');
  });
});
```

- [ ] **Step 5.2: Run to verify failure.** `npx vitest run server/__tests__/terminologyQueueClientPins.test.js` — Expected: FAIL on every pin.

- [ ] **Step 5.3: Implement the panel.** In `server/views/terminology.html`:

**(a) CSS** — after the `.mined-*` rules (~`:733`), add:

```css
    .queue-section {
      margin: 1rem 0;
      padding: 0.75rem 1rem;
      border: 1px solid var(--border, #ddd);
      border-radius: var(--radius-md);
      background: var(--bg-elevated, #fafafa);
    }
    .queue-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-bottom: 0.5rem;
    }
    .queue-chip {
      border: 1px solid var(--border, #ccc);
      background: transparent;
      border-radius: 999px;
      padding: 0.15rem 0.6rem;
      cursor: pointer;
      font-size: var(--text-sm);
    }
    .queue-chip.active {
      background: var(--accent, #2563eb);
      color: #fff;
      border-color: transparent;
    }
    .queue-filters { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; flex-wrap: wrap; }
    .queue-batch-bar { align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
    .queue-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
    .queue-en { cursor: pointer; font-weight: 600; }
    .queue-status { font-size: var(--text-xs); color: var(--text-muted, #888); }
    .queue-meta { color: var(--text-muted, #888); font-size: var(--text-xs); }
    .queue-untagged { color: var(--warning, #b45309); font-size: var(--text-xs); font-style: italic; }
    .queue-actions { margin-left: auto; display: flex; gap: 0.25rem; }
    .queue-pager {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      justify-content: flex-end;
      margin-top: 0.5rem;
    }
```

**(b) Markup** — insert directly after the `review-queue-alert` div closes (`:839`), before the `<!-- Terms List -->` comment (raw UTF-8 Icelandic, matching the mined-section's newer style):

```html
    <!-- Review queue (item 19) -->
    <div class="queue-section" id="queue-section" style="display: none;">
      <div class="queue-header">
        <h3 style="margin:0;font-size:var(--text-md)">Yfirferðarröð</h3>
        <div>
          <button class="queue-chip" id="queue-chip-all" onclick="setQueueStatus('')">Allt</button>
          <button class="queue-chip active" id="queue-chip-proposed" onclick="setQueueStatus('proposed')">Í bið (<span id="queue-count-proposed">0</span>)</button>
          <button class="queue-chip" id="queue-chip-disputed" onclick="setQueueStatus('disputed')">Til umræðu (<span id="queue-count-disputed">0</span>)</button>
          <button class="queue-chip" id="queue-chip-needs_review" onclick="setQueueStatus('needs_review')">Þarf yfirlestur (<span id="queue-count-needs_review">0</span>)</button>
        </div>
      </div>
      <div class="queue-filters">
        <select id="queue-filter-source" onchange="loadQueue(0)">
          <option value="">Allir upprunar</option>
        </select>
        <select id="queue-filter-subject" onchange="loadQueue(0)">
          <option value="">Öll fög</option>
          <option value="untagged">Ómerkt</option>
        </select>
      </div>
      <div class="queue-batch-bar" id="queue-batch-bar" style="display: none;">
        <span><strong id="queue-selected-count">0</strong> valin</span>
        <select id="queue-batch-subject">
          <option value="">— fag við samþykkt —</option>
        </select>
        <button class="btn btn-sm" onclick="batchApproveSelected()">Samþykkja valin</button>
      </div>
      <div id="queue-results"></div>
      <div class="queue-pager">
        <button class="btn btn-sm btn-secondary" onclick="queuePrev()">&#8249;</button>
        <span id="queue-page-info" class="queue-meta"></span>
        <button class="btn btn-sm btn-secondary" onclick="queueNext()">&#8250;</button>
      </div>
    </div>
```

Note: the default-active chip is `proposed` — the queue opens on the finding item 19 exists to fix. `setQueueStatus('')` = all three review statuses (service default).

**(c) JS** — add after the mined-candidates block (~after `promoteMined`'s closing brace, before `loadMetadata`):

```js
    // ── Review queue (item 19) ──────────────────────────────────────
    let queueOffset = 0;
    const queueLimit = 50;
    let queueStatusFilter = 'proposed';
    let queueTotal = 0;
    const queueSelected = new Set();

    function canActOnQueue() {
      return currentUser && ['admin', 'head-editor'].includes(currentUser.role);
    }

    function initQueueFilters() {
      const srcSel = document.getElementById('queue-filter-source');
      for (const s of sources) {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        srcSel.appendChild(opt);
      }
      const subjSel = document.getElementById('queue-filter-subject');
      const batchSel = document.getElementById('queue-batch-subject');
      for (const s of subjects) {
        for (const sel of [subjSel, batchSel]) {
          const opt = document.createElement('option');
          opt.value = s;
          opt.textContent = SUBJECT_NAMES[s] || s;
          sel.appendChild(opt);
        }
      }
    }

    async function loadQueueCounts() {
      const book = document.getElementById('filter-book')?.value || '';
      const url =
        '/api/terminology/review-queue/counts' +
        (book ? '?book=' + encodeURIComponent(book) : '');
      const counts = await fetchJson(url);
      document.getElementById('queue-count-proposed').textContent = counts.proposed || 0;
      document.getElementById('queue-count-disputed').textContent = counts.disputed || 0;
      document.getElementById('queue-count-needs_review').textContent = counts.needsReview || 0;
      const total = (counts.proposed || 0) + (counts.disputed || 0) + (counts.needsReview || 0);
      const alertBox = document.getElementById('review-queue-alert');
      if (total > 0) {
        document.getElementById('review-queue-count').textContent = total;
        alertBox.style.display = 'flex';
      } else {
        alertBox.style.display = 'none';
      }
      // Prefill the tag-at-approval picker from the book's resolved subject
      const batchSel = document.getElementById('queue-batch-subject');
      if (counts.subject && !batchSel.value) {
        batchSel.value = counts.subject;
      }
      return counts;
    }

    async function loadQueue(offset = 0) {
      queueOffset = offset;
      queueSelected.clear();
      updateQueueBatchBar();
      const container = document.getElementById('queue-results');
      container.innerHTML = '<div class="terms-state">Hleður...</div>';
      const params = new URLSearchParams();
      if (queueStatusFilter) params.set('status', queueStatusFilter);
      const book = document.getElementById('filter-book')?.value || '';
      const source = document.getElementById('queue-filter-source')?.value || '';
      const subject = document.getElementById('queue-filter-subject')?.value || '';
      if (book) params.set('book', book);
      if (source) params.set('source', source);
      if (subject) params.set('subject', subject);
      params.set('limit', queueLimit);
      params.set('offset', offset);
      try {
        const data = await fetchJson('/api/terminology/review-queue?' + params);
        queueTotal = data.total || 0;
        renderQueueRows(data.items || []);
        const from = queueTotal === 0 ? 0 : offset + 1;
        const to = offset + (data.items || []).length;
        document.getElementById('queue-page-info').textContent =
          from + '–' + to + ' af ' + queueTotal;
      } catch (err) {
        container.innerHTML =
          '<div class="terms-state error">Villa: ' + escapeHtml(err.message) + '</div>';
      }
    }

    function renderQueueRows(items) {
      const container = document.getElementById('queue-results');
      if (items.length === 0) {
        container.innerHTML = '<div class="terms-state">Ekkert í röðinni með þessum síum.</div>';
        return;
      }
      const canAct = canActOnQueue();
      container.innerHTML = items
        .map((it) => {
          const badges = (it.subjects || []).length
            ? it.subjects
                .map((s) => '<span class="subject-badge">' + formatSubject(s) + '</span>')
                .join(' ')
            : '<span class="queue-untagged">ómerkt</span>';
          const untagged = (it.subjects || []).length === 0;
          return (
            '<div class="mined-card queue-row">' +
            (canAct
              ? '<input type="checkbox" onchange="toggleQueueSelection(' +
                it.translationId +
                ', this.checked)">'
              : '') +
            '<span class="queue-en" onclick="showTermDetail(' +
            it.headwordId +
            ')">' +
            escapeHtml(it.english) +
            (it.pos ? ' <em>(' + escapeHtml(it.pos) + ')</em>' : '') +
            '</span> → <span>' +
            escapeHtml(it.icelandic) +
            '</span> <span class="queue-status">' +
            formatStatus(it.status) +
            '</span> ' +
            badges +
            ' <span class="queue-meta">' +
            escapeHtml(it.source || '') +
            (it.proposedByName ? ' · ' + escapeHtml(it.proposedByName) : '') +
            (it.createdAt ? ' · ' + formatDate(it.createdAt) : '') +
            '</span>' +
            (canAct
              ? '<span class="queue-actions">' +
                '<button class="btn btn-sm" onclick="queueApprove(' +
                it.translationId +
                ', ' +
                untagged +
                ')">Samþykkja</button>' +
                '<button class="btn btn-sm btn-secondary" onclick="queueReject(' +
                it.translationId +
                ')">Hafna</button>' +
                '</span>'
              : '') +
            '</div>'
          );
        })
        .join('');
    }

    function setQueueStatus(status) {
      queueStatusFilter = status;
      document.querySelectorAll('.queue-chip').forEach((c) => c.classList.remove('active'));
      const chip = document.getElementById('queue-chip-' + (status || 'all'));
      if (chip) chip.classList.add('active');
      loadQueue(0);
    }

    function toggleQueueSelection(id, checked) {
      if (checked) queueSelected.add(id);
      else queueSelected.delete(id);
      updateQueueBatchBar();
    }

    function updateQueueBatchBar() {
      document.getElementById('queue-selected-count').textContent = queueSelected.size;
      document.getElementById('queue-batch-bar').style.display =
        queueSelected.size > 0 && canActOnQueue() ? 'flex' : 'none';
    }

    async function queueRefreshAll() {
      await Promise.all([loadQueue(queueOffset), loadQueueCounts()]);
      loadStats();
      searchTerms();
    }

    async function queueApprove(id, untagged) {
      const subject = document.getElementById('queue-batch-subject').value;
      if (
        untagged &&
        !subject &&
        !confirm(
          'Þýðingin er ómerkt (ekkert fag). Samþykkja án fags? Ómerkt orð ná ekki í vélþýðingar-orðasafnið.'
        )
      )
        return;
      try {
        const body = untagged && subject ? { subjects: [subject] } : {};
        const data = await fetchJson('/api/terminology/translations/' + id + '/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (data.success) await queueRefreshAll();
        else alert('Villa: ' + (data.message || ''));
      } catch (err) {
        alert('Villa: ' + err.message);
      }
    }

    async function queueReject(id) {
      const reason = prompt('Ástæða höfnunar (valfrjálst):');
      if (reason === null) return;
      try {
        const data = await fetchJson('/api/terminology/translations/' + id + '/reject', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason })
        });
        if (data.success) await queueRefreshAll();
        else alert('Villa: ' + (data.message || ''));
      } catch (err) {
        alert('Villa: ' + err.message);
      }
    }

    async function batchApproveSelected() {
      const ids = Array.from(queueSelected);
      if (ids.length === 0) return;
      const subject = document.getElementById('queue-batch-subject').value;
      const subjectNote = subject
        ? ' með fagið „' + (SUBJECT_NAMES[subject] || subject) + '“ á ómerktar'
        : ' án fags á ómerktar';
      if (!confirm('Samþykkja ' + ids.length + ' þýðingar' + subjectNote + '?')) return;
      try {
        const body = subject ? { ids, subjects: [subject] } : { ids };
        const data = await fetchJson('/api/terminology/translations/batch-approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (data.success) await queueRefreshAll();
        else alert('Villa: ' + (data.message || ''));
      } catch (err) {
        alert('Villa: ' + err.message);
      }
    }

    function queuePrev() {
      if (queueOffset >= queueLimit) loadQueue(queueOffset - queueLimit);
    }
    function queueNext() {
      if (queueOffset + queueLimit < queueTotal) loadQueue(queueOffset + queueLimit);
    }

    function maybeReloadQueue() {
      if (document.getElementById('queue-section').style.display !== 'none') {
        loadQueueCounts().catch(() => {});
        loadQueue(0);
      }
    }
```

**(d) Rewire init and the banner:**

- In `init()` replace the line `try { await checkReviewQueue(); } catch (e) { console.error('Review queue check failed:', e); }` with:
```js
      if (currentUser && ['admin', 'head-editor', 'editor'].includes(currentUser.role)) {
        document.getElementById('queue-section').style.display = 'block';
        initQueueFilters();
        try { await loadQueueCounts(); } catch (e) { console.error('Queue counts failed:', e); }
        try { await loadQueue(0); } catch (e) { console.error('Queue load failed:', e); }
      }
```
(The replaced line already sits after the `loadMetadata()` await, so the queue block correctly runs with the `subjects`/`sources` globals populated — do not move it earlier.)

- Delete the whole `checkReviewQueue` function (`:1295-1305` area).
- Replace `showReviewQueue` (`:1734-1738`) with:
```js
    function showReviewQueue() {
      const section = document.getElementById('queue-section');
      if (section.style.display === 'none') return;
      section.scrollIntoView({ behavior: 'smooth' });
    }
```
- Extend `#filter-book`'s inline `onchange` (`:765`) to also call `maybeReloadQueue();` (append after `maybeReloadMined();`).

**(e) Status vocabulary:**

- `formatStatus` (`:1942-1950`): the map's existing entries are written with LITERAL backslash-u escapes in the file (approved maps to `'Sam\u00FEykkt'` — a real backslash-u sequence in the bytes, not the glyph). The new entry MUST use the same escaped style — the byte-pin asserts it. Exact new map body (every `\uXXXX` below is typed literally into the file):

```text
      const names = {
        'approved': 'Sam\u00FEykkt',
        'proposed': '\u00CD bi\u00F0',
        'disputed': 'Til umr\u00E6\u00F0u',
        'needs_review': '\u00DEarf yfirlestur',
        'rejected': 'Hafna\u00F0'
      };
```

(Only two lines actually change: a trailing comma on the `needs_review` line and the new `rejected` line. The four existing lines are shown for placement and must remain byte-identical.)

- Status filter dropdown (`:775-781`): add `<option value="rejected">Hafna&#240;</option>` after the `needs_review` option (entity style like its siblings).

- [ ] **Step 5.4: Run to verify pass.** `npx vitest run server/__tests__/terminologyQueueClientPins.test.js` — Expected: PASS. Sanity: `node --check` is not applicable to HTML; instead open the page mentally — every new `onclick` target function exists (`setQueueStatus`, `loadQueue`, `batchApproveSelected`, `queuePrev`, `queueNext`, `toggleQueueSelection`, `queueApprove`, `queueReject`, `showTermDetail`).

- [ ] **Step 5.5: Commit.**
```bash
git add server/views/terminology.html server/__tests__/terminologyQueueClientPins.test.js
git commit -m "feat(item19): Yfirferðarröð queue panel + real-count banner + Hafnað vocab"
```

---

### Task 6: E2E retarget, registers, full-suite gate

**Files:**
- Modify: `server/e2e/terminology.spec.js` (`:600-611`)
- Modify: `docs/plans/2026-07-11-pre-semester-coding-campaign.md` (new register section after the item-18 register)

**Interfaces:** none new — closure work.

- [ ] **Step 6.1: Retarget the e2e shape check.** In `server/e2e/terminology.spec.js:603-611`, the `review queue returns array` test currently asserts `{terms}`. Replace the body assertions with:

```js
  test('review queue returns items with total', async ({ page }) => {
    // Need editor+ role for review queue
    const res = await page.request.get(`${API}/review-queue`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('items');
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.total).toBe('number');
  });
```
The `viewer cannot access review queue` 403 test (`:417-424`) is unchanged — the gate did not move.

- [ ] **Step 6.2: Add the campaign register.** In `docs/plans/2026-07-11-pre-semester-coding-campaign.md`, after the item-18 register section, insert:

```markdown
### Register — findings/deferrals from item 19 (2026-07-19)
- **I19-R1 `[decision]`** — `translate-chapter-titles.js` primes chapter-title MT with `approvedOnly:false` (`:118/:124`) — the one consumer that leaks non-approved terms to Málstaður; flip to approved-only or bless deliberately.
- **I19-R2 `[feature]`** — my-work "Orðatillögur" proposer card is fully built but dead (`getUserProposedTerms` stub returns `[]`); wiring = query by `proposed_by` + route; gives proposers feedback on their terms' fate.
- **I19-R3 `[authz note]`** — queue actions + mining endpoints are role-gated but not book-scoped (an HE of book A can act on terms surfaced from book B); deliberate posture today (glossary is subject-oriented) — decide with the wider cross-book authz lane.
- **I19-R4 `[gap]`** — `PUT /translations/:id` lets any EDITOR silently rewrite the Icelandic text and subjects of an **approved** translation with no status reset — undermines the queue's trust in "approved"; decide reset-on-edit vs gate.
- **I19-R5 `[yagni]`** — batch-reject deliberately omitted; add only if triage practice demands it.
- **I19-R6 `[minor]`** — mining headword dedupe is case-sensitive (`Mole` vs `mole` fork headwords).
```

- [ ] **Step 6.3: Full-suite gate.** From the repo root: `npm test` — Expected: PASS, count ≥ 2963 + the new tests. If Playwright is run (`npm run test:e2e` in `server/`), the two pre-existing SR-OOS-2 reds (I16-R14) are known-red on main — not this branch's failures.

- [ ] **Step 6.4: Commit.**
```bash
git add server/e2e/terminology.spec.js docs/plans/2026-07-11-pre-semester-coding-campaign.md
git commit -m "docs(item19): registers I19-R1..R6; e2e review-queue contract retarget"
```

---

## Manual QA (deploy-time, for the lead — not a plan task)

- Terminology page as head-editor: queue panel shows the (large, intended) backlog; chips filter; book filter prefills the subject picker; batch-select + Samþykkja valin tags only untagged rows; Hafna prompts for a reason and the term drops from lookup; "Hafnað" appears in the main status filter.
- As plain editor: panel visible read-only (no checkboxes/buttons); banner shows a real count.
- Editor surfaces unchanged: proposed terms still amber in the segment editor; MT export unchanged except approved+tagged mined terms now appear.

## Spec-coverage self-check (writing-plans §Self-Review — run before handoff)

- Spec §4.1 rejected/no-migration → Task 1. §4.2 queue+counts+retire → Tasks 2+4. §4.3 tag-at-approval → Task 3. §4.4 batch → Task 3. §4.5 reject → Task 1. §4.6 I18-R2 → Task 4. §5 routes table → Task 4. §6 client → Task 5. §7 testing map → Tasks 1–5 test steps + Task 6 e2e. §9 registers → Task 6. §10 out-of-scope respected (no gate changes, no book-scoping, no merge-glossary work).
