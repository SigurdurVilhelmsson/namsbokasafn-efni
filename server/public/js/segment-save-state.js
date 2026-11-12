/**
 * segment-save-state.js — what a segment row carries for a save, what a draft
 * holds, and what a refused save keeps (G1.1, spec §5.18).
 *
 * 🔴 WHY A SEPARATE FILE. segment-editor.js touches the DOM at load and cannot
 * be required, and no DOM test environment exists, so the rules that decide
 * VALUES live here, where `npm test` can execute them. The DOM plumbing stays in
 * segment-editor.js and is exercised in the browser by
 * server/e2e/served-base-client.spec.js. Dual-loadable (browser global +
 * CommonJS), the idiom of figure-drafts.js and accept-eligibility.js.
 *
 * 🔴 NO HASHING HERE, OR ANYWHERE IN THE BROWSER (§5.3, §5.18). The client only
 * echoes the hashes the server sent; a second hash would be a second mechanism.
 */
(function (root) {
  'use strict';

  const SHA256_HEX = /^[0-9a-f]{64}$/;
  const DRAFT_VERSION = 2;

  /**
   * Refusal codes whose typed text moves into the draft (index decision 12).
   * 'NO_LAYER' is servedEdit.js's code for "the module has no layer" (spec
   * §5.6 step 2 names none; plan decision 5); keep the two in step.
   */
  const KEEP_TEXT_CODES = [
    'STALE_BASE',
    'STALE_DISPLAYED',
    'BASE_MISSING',
    'DUPLICATE_ID',
    'BOOK_NOT_MINTED',
    'NO_LAYER',
  ];
  /** What a restored pane can say; any other refusal reads as 'REFUSED'. */
  const NOTICE_CODES = KEEP_TEXT_CODES.concat(['REFUSED']);

  /** Item types the client claims (§5.10), and the sources each may name. */
  const ITEM_SOURCES = {
    'repetition-insert': ['tm'],
    'term-insert': ['termbase'],
    'markup-wrap': ['toolbar', 'keyboard'],
    'ai-suggestion': ['ai'],
  };

  /** express.json({ limit: '1mb' }) (server/index.js:206) counts BYTES; '1mb' is 1,048,576. */
  const BODY_LIMIT_BYTES = 1048576;
  /** Room for what the measurement cannot see (headers are not counted; this is margin, not a calculation). */
  const BODY_HEADROOM_BYTES = 16384;

  /** UTF-8 length: JSON.stringify leaves Icelandic letters unescaped, two bytes each on the wire. */
  function utf8Length(s) {
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(s).length;
    return s.length * 3; // no TextEncoder: assume the worst case
  }

  function isSha256(v) {
    return typeof v === 'string' && SHA256_HEX.test(v);
  }
  function intOrNull(v) {
    return Number.isInteger(v) && v >= 0 ? v : null;
  }
  function intAttr(raw) {
    return raw != null && /^\d+$/.test(raw) ? Number(raw) : null;
  }

  // ── The row (§5.18 row 1) ───────────────────────────────────────

  /**
   * The values a save or an accept must echo, as the row renders them.
   * `displayedEdit` is the in-flight edit the row shows, or null (the caller
   * decides with acceptEligibility.isEditInFlight: one rule, not two).
   * `is` is JSON-encoded: the HTML parser turns CR into LF inside an attribute.
   */
  function rowDataAttributes(seg, displayedEdit, baseEditId) {
    const attrs = {
      'data-segment-id': String(seg.segmentId),
      'data-is': JSON.stringify(typeof seg.is === 'string' ? seg.is : ''),
      'data-base-edit-id': String(intOrNull(baseEditId) || 0),
    };
    if (isSha256(seg.baseSha256)) attrs['data-base-sha256'] = seg.baseSha256;
    if (intOrNull(seg.occurrence) !== null) attrs['data-occurrence'] = String(seg.occurrence);
    if (displayedEdit && intOrNull(displayedEdit.id) !== null) {
      attrs['data-displayed-edit-id'] = String(displayedEdit.id);
      if (isSha256(displayedEdit.contentSha256)) {
        attrs['data-displayed-edit-sha256'] = displayedEdit.contentSha256;
      }
    }
    return attrs;
  }

  function rowDataAttributeHtml(attrs, escape) {
    return Object.keys(attrs)
      .map(function (k) {
        return ' ' + k + '="' + escape(attrs[k]) + '"';
      })
      .join('');
  }

  /** Read back what rowDataAttributes wrote, from anything with getAttribute. */
  function readRowValues(el) {
    if (!el || typeof el.getAttribute !== 'function') return null;
    const get = function (n) {
      return el.getAttribute(n);
    };
    let is = null;
    try {
      const raw = get('data-is');
      is = raw == null ? null : JSON.parse(raw);
    } catch {
      is = null; // not ours: read as nothing shown
    }
    const displayedEditId = intAttr(get('data-displayed-edit-id'));
    const displayedSha = get('data-displayed-edit-sha256');
    return {
      segmentId: get('data-segment-id'),
      is: typeof is === 'string' ? is : null,
      baseSha256: isSha256(get('data-base-sha256')) ? get('data-base-sha256') : null,
      occurrence: intAttr(get('data-occurrence')),
      displayedEditId: displayedEditId,
      displayedEditSha256: displayedEditId !== null && isSha256(displayedSha) ? displayedSha : null,
      baseEditId: intAttr(get('data-base-edit-id')) || 0,
    };
  }

  // ── Bodies (§5.6, §5.18 rows 2, 7, 8) ───────────────────────────

  function buildSaveBody(i) {
    const row = i.row || {};
    const displayedEditId = intOrNull(row.displayedEditId);
    const body = {
      segmentId: i.segmentId,
      originalContent: typeof row.is === 'string' ? row.is : '', // ignored by the server (§5.6 step 6)
      editedContent: i.editedContent,
      category: i.category || undefined,
      editorNote: i.editorNote || undefined,
      baseEditId: intOrNull(row.baseEditId) || 0,
      displayedEditId: displayedEditId,
      displayedEditSha256:
        displayedEditId !== null && isSha256(row.displayedEditSha256)
          ? row.displayedEditSha256
          : null,
      clientActionId: i.clientActionId,
      clientActionTime: i.clientActionTime,
      assists: [],
      // Beside the assists, never inside them (G1.23 §8); '[]' when none. Set before the measurement below.
      acceptedSuggestions: Array.isArray(i.acceptedSuggestions) ? i.acceptedSuggestions : [],
    };
    // Absent, not null: the server's order (§5.6 steps 1-4) decides the code.
    if (isSha256(row.baseSha256)) body.baseSha256 = row.baseSha256;
    // Decision 36: the assists get what is left of the limit, so the bound fires only where a 413 would.
    const rest = utf8Length(JSON.stringify(body));
    body.assists = boundAssists(
      Array.isArray(i.assists) ? i.assists : [],
      BODY_LIMIT_BYTES - BODY_HEADROOM_BYTES - rest
    );
    return body;
  }

  function buildAcceptBody(i) {
    return {
      segmentId: i.segmentId,
      acceptedContent: i.row && typeof i.row.is === 'string' ? i.row.is : '',
      acceptOrigin: i.acceptOrigin === 'keyboard-stream' ? 'keyboard-stream' : 'single',
      clientActionId: i.clientActionId,
      clientActionTime: i.clientActionTime,
    };
  }

  // ── Assists (§5.10) ─────────────────────────────────────────────

  function assistItem(itemType, source, clientTimeMs, detail) {
    const sources = ITEM_SOURCES[itemType];
    if (!sources || sources.indexOf(source) === -1) {
      throw new TypeError('assistItem: no ' + itemType + ' from ' + source);
    }
    return { itemType: itemType, source: source, clientTimeMs: clientTimeMs, detail: detail || {} };
  }

  /**
   * The assist items one accepted suggestion group produces: one per change, each sharing `groupActionId`.
   * The suggestion fields sit at the item's TOP level (the server reads them there; its detail is `{}`).
   * @param {{rulingId: string, changes: Array<{opId: string, occurrence: number, category: string, runId: string}>}} group
   * @param {string} groupActionId One id for the whole group's accept.
   * @param {number} clientTimeMs
   * @returns {Array<object>}
   */
  function suggestionItems(group, groupActionId, clientTimeMs) {
    const changes = group && Array.isArray(group.changes) ? group.changes : [];
    return changes.map(function (c) {
      return Object.assign(assistItem('ai-suggestion', 'ai', clientTimeMs, {}), {
        opId: c.opId,
        occurrence: c.occurrence,
        category: c.category,
        runId: c.runId,
        rulingId: group.rulingId,
        groupActionId: groupActionId,
      });
    });
  }

  /**
   * The save body's `acceptedSuggestions`: the ai-suggestion items whose change's `replace` is still in `savedText`
   * (spec §7). Returns only `{opId, occurrence}`, distinct by opId (first wins), in item order, at most 500, in the
   * exact shape the server accepts: it empties the WHOLE list for one bad entry. An item whose change is missing
   * from `changesByOpId` cannot be checked and is dropped. A deletion op (`replace: ''`) always counts, as on the
   * server (none exist in committed layer 2).
   * @param {Array<object>} assists The pane's assist items.
   * @param {string} savedText The text being saved.
   * @param {Object<string, {replace: string}>|Map<string, {replace: string}>} changesByOpId A plain object or a Map.
   * @returns {Array<{opId: string, occurrence: number}>}
   */
  function acceptedFromAssists(assists, savedText, changesByOpId) {
    const out = [];
    if (!Array.isArray(assists) || typeof savedText !== 'string' || !changesByOpId) return out;
    const isMap = typeof Map === 'function' && changesByOpId instanceof Map;
    const seen = {};
    for (let n = 0; n < assists.length && out.length < 500; n++) {
      const it = assists[n];
      if (!it || it.itemType !== 'ai-suggestion') continue;
      if (typeof it.opId !== 'string' || it.opId.length < 1 || it.opId.length > 128) continue;
      if (intOrNull(it.occurrence) === null) continue;
      if (Object.prototype.hasOwnProperty.call(seen, it.opId)) continue;
      const change = isMap
        ? changesByOpId.get(it.opId)
        : Object.prototype.hasOwnProperty.call(changesByOpId, it.opId)
          ? changesByOpId[it.opId]
          : undefined;
      if (!change || typeof change.replace !== 'string') continue;
      if (savedText.indexOf(change.replace) === -1) continue;
      seen[it.opId] = true;
      out.push({ opId: it.opId, occurrence: it.occurrence });
    }
    return out;
  }

  /**
   * For the SENT body only (decision 36; drafts never call it). Every item kept; past the budget, in UTF-8 bytes
   * of the list's JSON, the OLDEST whole texts lose their text first, never the newest.
   */
  function boundAssists(items, maxBytes) {
    const limit = typeof maxBytes === 'number' ? maxBytes : BODY_LIMIT_BYTES - BODY_HEADROOM_BYTES;
    const out = items.map(function (it) {
      return Object.assign({}, it, {
        detail: it.detail ? Object.assign({}, it.detail) : it.detail,
      });
    });
    let lastWhole = -1;
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i].detail && typeof out[i].detail.text === 'string') {
        lastWhole = i;
        break;
      }
    }
    for (let i = 0; i < out.length && utf8Length(JSON.stringify(out)) > limit; i++) {
      const d = out[i].detail;
      if (i === lastWhole || !d || typeof d.text !== 'string') continue;
      d.textLength = d.text.length;
      d.textDropped = true;
      delete d.text;
    }
    return out;
  }

  // ── Drafts (§5.18 rows 3, 4) ────────────────────────────────────

  function draftEntry(e) {
    const src = e || {};
    return {
      text: typeof src.text === 'string' ? src.text : '',
      baseSha256: isSha256(src.baseSha256) ? src.baseSha256 : null,
      occurrence: intOrNull(src.occurrence),
      assists: Array.isArray(src.assists) ? src.assists.slice() : [], // every text kept (§5.10, §14 call 18)
      refused: typeof src.refused === 'string' && src.refused ? src.refused : null,
    };
  }

  /**
   * `ts`: tabGuard keys its lookup and its sweep on it. `drafts`: the texts
   * again, for a page loaded before this deploy, whose restoreDraft reads
   * `.drafts` and, finding none, clears every draft of the module.
   */
  function buildDraftValue(entries, now) {
    const segments = {};
    const drafts = {};
    Object.keys(entries).forEach(function (id) {
      segments[id] = draftEntry(entries[id]);
      drafts[id] = segments[id].text;
    });
    return { v: DRAFT_VERSION, ts: now, segments: segments, drafts: drafts };
  }

  function parseDraftValue(value) {
    if (!value || typeof value !== 'object') return null;
    const entries = {};
    if (value.v === DRAFT_VERSION && value.segments && typeof value.segments === 'object') {
      Object.keys(value.segments).forEach(function (id) {
        entries[id] = draftEntry(value.segments[id]);
      });
      return { legacy: false, entries: entries };
    }
    if (value.v === undefined && value.drafts && typeof value.drafts === 'object') {
      Object.keys(value.drafts).forEach(function (id) {
        if (typeof value.drafts[id] !== 'string') return;
        entries[id] = Object.assign(draftEntry({ text: value.drafts[id] }), { legacy: true });
      });
      return { legacy: true, entries: entries };
    }
    return null;
  }

  /**
   * Every draft found under the module's prefix, in any order (plan decision 31). tabGuard.findNewestDraft returns
   * one and the restore clears them all, so a kept text in an older tab's key would vanish. The newest by `ts`
   * wins per segment; a kept (refused) entry in an older draft is carried over, or keeps its code on the newer text.
   */
  function mergeDraftValues(values) {
    const parsed = (values || [])
      .filter(function (v) {
        return v && typeof v === 'object' && typeof v.ts === 'number';
      })
      .sort(function (a, b) {
        return b.ts - a.ts;
      })
      .map(function (v) {
        return parseDraftValue(v);
      })
      .filter(Boolean);
    if (parsed.length === 0) return null;
    const out = { legacy: parsed[0].legacy, entries: Object.assign({}, parsed[0].entries) };
    parsed.slice(1).forEach(function (older) {
      Object.keys(older.entries).forEach(function (id) {
        const e = older.entries[id];
        if (!e.refused) return;
        if (!out.entries[id]) out.entries[id] = e;
        else if (!out.entries[id].refused) {
          out.entries[id] = Object.assign({}, out.entries[id], { refused: e.refused });
        }
      });
    });
    return out;
  }

  function draftRestoreItem(entry, now) {
    const item = {
      itemType: 'draft-restore',
      source: null,
      clientTimeMs: now,
      detail: { text: entry.text },
    };
    if (entry.legacy) {
      item.claim = 'unverified';
      item.detail.legacy = true;
    }
    return item;
  }

  /** A restored draft re-installs its assists BEFORE the draft-restore item (§5.18). */
  function restoredAssists(entry, now) {
    return entry.assists.concat([draftRestoreItem(entry, now)]);
  }

  // ── Kept texts (index decision 12) ──────────────────────────────

  function keepsText(code) {
    return KEEP_TEXT_CODES.indexOf(code) !== -1;
  }

  /** The base recorded is the one the refused save was SENT with: what the server compared. */
  function refusedEntry(i) {
    const row = i.row || {};
    return draftEntry({
      text: i.text,
      baseSha256: row.baseSha256,
      occurrence: row.occurrence,
      assists: i.assists,
      refused: i.code,
    });
  }

  /**
   * A save body carries no occurrence (option (b) of G1.12 was not built; plan § What the client sends; buildSaveBody), so the entry
   * has none (null) and installDraft takes the row's (PR1 review C17). Read it here once the body sends it.
   */
  function entryFromParked(item) {
    if (!item || typeof item.body !== 'string') return null;
    let body;
    try {
      body = JSON.parse(item.body);
    } catch {
      return null; // not a segment save
    }
    if (!body || typeof body.segmentId !== 'string' || typeof body.editedContent !== 'string')
      return null;
    return {
      segmentId: body.segmentId,
      entry: draftEntry({
        text: body.editedContent,
        baseSha256: body.baseSha256,
        assists: body.assists,
        refused: typeof item.code === 'string' && item.code ? item.code : 'REFUSED',
      }),
    };
  }

  /** The draft holds the newer typing; a parked refusal still marks it kept. */
  function mergeRestoreSources(fromDraft, parked) {
    const out = {};
    (parked || []).forEach(function (p) {
      const e = entryFromParked(p);
      if (e && !out[e.segmentId]) out[e.segmentId] = e.entry;
    });
    if (fromDraft && fromDraft.entries) {
      Object.keys(fromDraft.entries).forEach(function (id) {
        const d = fromDraft.entries[id];
        out[id] = out[id] && !d.refused ? Object.assign({}, d, { refused: out[id].refused }) : d;
      });
    }
    return out;
  }

  function noticeFor(entry, rowBaseSha256) {
    if (!entry) return null;
    if (entry.refused)
      return NOTICE_CODES.indexOf(entry.refused) !== -1 ? entry.refused : 'REFUSED';
    if (entry.baseSha256 && isSha256(rowBaseSha256) && entry.baseSha256 !== rowBaseSha256) {
      return 'STALE_BASE';
    }
    return null;
  }

  // ── The save response (G1.21) ───────────────────────────────────

  /**
   * The save route's response fields (Task 14; plan decision 15). If they are
   * ever renamed, change them here and in segmentSaveState.test.js, nowhere else.
   */
  function echoAttributeUpdates(result, currentBaseEditId) {
    const out = [];
    if (!result || typeof result !== 'object') return out;
    const has = function (k) {
      return Object.prototype.hasOwnProperty.call(result, k);
    };
    if (has('baseSha256') && isSha256(result.baseSha256))
      out.push(['data-base-sha256', result.baseSha256]);
    if (has('displayedEditId')) {
      const id = intOrNull(result.displayedEditId);
      out.push(['data-displayed-edit-id', id === null ? null : String(id)]);
      out.push([
        'data-displayed-edit-sha256',
        id !== null && isSha256(result.displayedEditSha256) ? result.displayedEditSha256 : null,
      ]);
    }
    if (intOrNull(result.editId) !== null && has('displayedEditId')) {
      out.push([
        'data-base-edit-id',
        String(Math.max(intOrNull(currentBaseEditId) || 0, result.editId)),
      ]);
    }
    return out;
  }

  function newClientActionId(cryptoObj) {
    if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return cryptoObj.randomUUID();
    return (
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).slice(2) +
      Math.random().toString(36).slice(2)
    );
  }

  const api = {
    DRAFT_VERSION: DRAFT_VERSION,
    BODY_LIMIT_BYTES: BODY_LIMIT_BYTES,
    BODY_HEADROOM_BYTES: BODY_HEADROOM_BYTES,
    KEEP_TEXT_CODES: KEEP_TEXT_CODES,
    NOTICE_CODES: NOTICE_CODES,
    ITEM_SOURCES: ITEM_SOURCES, // G1.23 extends it; PR3 pins its server table against it (index § Cross-PR interfaces)
    rowDataAttributes: rowDataAttributes,
    rowDataAttributeHtml: rowDataAttributeHtml,
    readRowValues: readRowValues,
    buildSaveBody: buildSaveBody,
    buildAcceptBody: buildAcceptBody,
    assistItem: assistItem,
    suggestionItems: suggestionItems,
    acceptedFromAssists: acceptedFromAssists,
    boundAssists: boundAssists,
    draftEntry: draftEntry,
    buildDraftValue: buildDraftValue,
    parseDraftValue: parseDraftValue,
    mergeDraftValues: mergeDraftValues,
    draftRestoreItem: draftRestoreItem,
    restoredAssists: restoredAssists,
    keepsText: keepsText,
    refusedEntry: refusedEntry,
    entryFromParked: entryFromParked,
    mergeRestoreSources: mergeRestoreSources,
    noticeFor: noticeFor,
    echoAttributeUpdates: echoAttributeUpdates,
    newClientActionId: newClientActionId,
  };
  if (typeof root !== 'undefined') root.segmentSaveState = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
