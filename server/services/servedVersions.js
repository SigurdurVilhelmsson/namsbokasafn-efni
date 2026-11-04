/**
 * servedVersions — the occurrence of each served segment, its base hash, and the served-version
 * rows that record exactly what was served (G1.1; spec §5.2, §5.3, §5.4).
 *
 * Why it is not inside the loader: `segmentParser.loadModuleForEditing` has many callers outside
 * the tests, among them `propagationService.findOccurrences`, which loads every module of a book.
 * A hook there would record serves that no client received. The module route calls this after the
 * loader and before its response (spec §5.4); every other caller of the loader mints nothing.
 *
 * Why a counter and not `withOccurrences` (`tools/lib/seg-markers.cjs`): that helper also adds a
 * `key` field through `occurrenceKey`, which throws on an id holding `#`. No served id holds one
 * today, but a throw there would turn the module route into a 500. `countOccurrences` is a plain
 * per-id counter that cannot throw, and the serve adds only `occurrence` (spec §5.3).
 *
 * Why a duplicated id gets no row (R4; spec §5.2): until G1.12 the loader keys the Icelandic by id
 * alone, so every copy of a duplicated id is served the last copy's Icelandic. A row would record
 * the wrong copy, so a duplicated id gets neither a served-version row nor a `baseSha256`, and
 * every write to it is refused (spec §5.7).
 *
 * Why the caller passes the connection: a save mints the version it is checked against and writes
 * its edit row in one transaction (spec §5.6 step 6), so the mint must run on the caller's handle,
 * inside the caller's transaction. This module never opens a database of its own.
 *
 * Organic is never minted: `annotateServed` gives a not-minted book no rows and no `baseSha256`,
 * and `mintVersions` refuses one on its own, so no caller can mint it even without the route's
 * check (spec §5.4, §11; plan decision 1).
 */
const { sha256Text, isNotMintedBook } = require('../lib/servedText');
const log = require('../lib/logger');

const coded = (code, message) => Object.assign(new Error(message), { code });

/** The 0-based ordinal of each segment among those with the same id, in served order (spec §5.3). */
function countOccurrences(segments) {
  const seen = new Map();
  const occurrences = segments.map((s) => {
    const k = seen.get(s.segmentId) || 0;
    seen.set(s.segmentId, k + 1);
    return k;
  });
  const duplicated = new Set([...seen].filter(([, n]) => n > 1).map(([id]) => id));
  return { occurrences, duplicated };
}

/** One served-version row; throws code NO_LAYER when the module has no Icelandic layer (spec §5.2). */
function buildVersionRow({ book, chapter, moduleId, segmentId, occurrence, en, is, layer }) {
  if (!layer) throw coded('NO_LAYER', `${book}/${chapter}/${moduleId} has no layer`);
  return {
    book,
    chapter,
    moduleId,
    segmentId,
    occurrence,
    enSha256: sha256Text(en),
    isSha256: sha256Text(is),
    layer,
    enText: en,
    isText: is,
  };
}

/**
 * A row for EVERY served segment, duplicated ids included and marked, for readers that compute
 * versions from the loader's output instead of serving it (T1's ch00 and duplicated chains).
 * Throws NO_LAYER for a module with no layer.
 */
function versionRowsFor(data, { book, chapter, moduleId }) {
  const { occurrences, duplicated } = countOccurrences(data.segments);
  const rows = data.segments.map((seg, i) => ({
    ...buildVersionRow({
      book,
      chapter,
      moduleId,
      segmentId: seg.segmentId,
      occurrence: occurrences[i],
      en: seg.en,
      is: seg.is,
      layer: data.isSource,
    }),
    duplicated: duplicated.has(seg.segmentId),
  }));
  return { rows, duplicatedIds: [...duplicated].sort() };
}

/**
 * Spec §5.4 steps 1–2, pure computation: adds `occurrence` to every served segment and
 * `baseSha256` to each non-duplicated one of a minted book with a layer. Mutates `data.segments`
 * and returns the rows step 3 mints.
 */
function annotateServed(data, key) {
  const { occurrences, duplicated } = countOccurrences(data.segments);
  data.segments.forEach((seg, i) => {
    seg.occurrence = occurrences[i];
  });
  const duplicatedIds = [...duplicated].sort();
  if (isNotMintedBook(key.book)) return { scope: 'not-minted-book', duplicatedIds, rows: [] };
  if (!data.isSource) return { scope: 'no-layer', duplicatedIds, rows: [] };
  const rows = [];
  data.segments.forEach((seg, i) => {
    if (duplicated.has(seg.segmentId)) return;
    const row = buildVersionRow({
      ...key,
      segmentId: seg.segmentId,
      occurrence: occurrences[i],
      en: seg.en,
      is: seg.is,
      layer: data.isSource,
    });
    seg.baseSha256 = row.isSha256; // hashed from the response object itself (spec §5.3)
    rows.push(row);
  });
  return { scope: 'minted', duplicatedIds, rows };
}

/**
 * Spec §5.4 step 3: the served-version id of each row, aligned with `rows`, inserting only the
 * missing ones. Refuses a not-minted book before any statement runs, even in a mixed batch.
 */
function mintVersions(conn, rows) {
  if (rows.length === 0) return [];
  const organic = rows.find((r) => isNotMintedBook(r.book));
  if (organic) throw coded('BOOK_NOT_MINTED', `${organic.book} is never minted`);
  const select = conn.prepare(
    `SELECT id FROM served_text_versions
      WHERE book = ? AND chapter = ? AND module_id = ? AND segment_id = ? AND occurrence = ?
        AND en_sha256 = ? AND is_sha256 = ? AND layer = ?`
  );
  let insert = null; // prepared only when a row is missing, so an unchanged set never prepares a write
  // A deferred transaction: it takes the write lock at its first INSERT, so re-serving unchanged text writes
  // nothing and never waits on another writer (spec §5.4 step 3).
  return conn.transaction(() =>
    rows.map((r) => {
      const k = [
        r.book,
        r.chapter,
        r.moduleId,
        r.segmentId,
        r.occurrence,
        r.enSha256,
        r.isSha256,
        r.layer,
      ];
      const hit = select.get(...k);
      if (hit) return hit.id;
      insert ??= conn.prepare(
        `INSERT INTO served_text_versions (book, chapter, module_id, segment_id, occurrence,
           en_sha256, is_sha256, layer, en_text, is_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      return Number(insert.run(...k, r.enText, r.isText).lastInsertRowid);
    })
  )();
}

/**
 * The serve hook's steps 1–3 with the fail-soft rule (spec §5.4): a mint failure is logged once
 * and the module is still served, with `baseSha256`; `mintOk` is false only when the mint threw.
 */
function recordServe(conn, data, key) {
  const annotation = annotateServed(data, key);
  if (annotation.rows.length === 0) return { ...annotation, mintOk: true, servedVersionIds: [] };
  try {
    const ids = mintVersions(conn, annotation.rows);
    return {
      ...annotation,
      mintOk: true,
      servedVersionIds: annotation.rows.map((r, i) => ({
        segmentId: r.segmentId,
        occurrence: r.occurrence,
        servedVersionId: ids[i],
      })),
    };
  } catch (err) {
    // Fail-soft (spec §5.4): the module is served with baseSha256; the save path mints its own base.
    log.error(
      {
        err: { code: err.code, message: err.message },
        book: key.book,
        chapter: key.chapter,
        moduleId: key.moduleId,
      },
      'Served-version mint failed; module served without its record (spec §5.4 fail-soft)'
    );
    return { ...annotation, mintOk: false, servedVersionIds: null };
  }
}

module.exports = {
  countOccurrences,
  buildVersionRow,
  versionRowsFor,
  annotateServed,
  mintVersions,
  recordServe,
};
