/**
 * Segment Editor — Pass 1 linguistic review
 *
 * All state and functions are encapsulated in this IIFE.
 * Only functions needed by HTML onclick handlers are exposed on window.
 */
(function () {
  'use strict';

  // ================================================================
  // STATE
  // ================================================================
  let currentBook = '';
  let currentChapter = 0;
  let currentModuleId = '';
  let _loadingModuleId = null; // re-entrancy guard for loadModule()
  let moduleData = null;
  let termData = null; // Per-segment term matches and issues
  let repetitionData = {}; // segmentId → { suggestion: {is_text, book, chapter, module_id} }
  let userRole = 'viewer';
  let userName = null;
  let termLookupTimer = null;
  const dirtyEdits = new Set(); // Track segment IDs with unsaved textarea edits
  const savesInFlight = new Set(); // segment ids whose save has been sent and not yet answered (saveEdit)
  let draftTimer = null;
  let figDraftTimer = null;
  let lastServerSaveTime = null;
  const recentlySaved = new Set(); // Track recently saved segment IDs for indicators
  let lastFocusedTextarea = null; // Track last-focused edit textarea for term insertion
  let cursorSegmentId = null; // keyboard accept-and-advance cursor (item 20b)
  // §5.10 / §5.18: per open pane, the assists since it opened, the base its text
  // was started from, and (Task 19) why a refused save kept it.
  const paneState = new Map();
  // Index decision 12: texts kept by a refused save, waiting for their pane.
  // addRestoreItem: true when the text left the screen (a refusal), false when
  // it is only being carried across a re-render.
  const heldDrafts = new Map();
  // PR2 review R2: per unit (its draft prefix), the draft value that leaving it could not store because the browser's
  // storage was full (the OPENING_UNRECORDED branch, or a refusal answered after leaving: keepLeftText). Leaving
  // empties heldDrafts and paneState, so without this a kept text would be lost; restoreDraft takes it on the unit's
  // next opening, and storeUnwritten tries storage again when the page is left.
  const unwrittenDrafts = new Map();

  // Track textarea focus so term lookup can insert at the right place
  document.addEventListener('focusin', (e) => {
    if (e.target.tagName === 'TEXTAREA' && e.target.id?.startsWith('textarea-')) {
      lastFocusedTextarea = e.target;
    }
  });

  // ================================================================
  // SAVE STATUS BAR
  // ================================================================

  function updateSaveStatusBar() {
    const bar = document.getElementById('save-status-bar');
    if (!bar) return;
    // A kept text whose row the filters hide is unsaved too (it waits in heldDrafts for its row).
    const count =
      dirtyEdits.size + [...heldDrafts.keys()].filter((id) => !dirtyEdits.has(id)).length;
    bar.classList.remove('has-unsaved', 'all-saved', 'saving');
    if (count > 0) {
      bar.classList.add('has-unsaved');
      document.getElementById('save-status-text').textContent = UI.save.unsaved(count);
    } else {
      bar.classList.add('all-saved');
      // Interface audit ED-04: after a discard nothing was saved, so the line says only what it knows.
      document.getElementById('save-status-text').textContent = UI.save.nothingUnsaved;
    }
    document.getElementById('save-status-time').textContent = lastServerSaveTime
      ? UI.save.lastSaved +
        new Date(lastServerSaveTime).toLocaleTimeString('is-IS', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';
  }

  // ================================================================
  // DRAFT PERSISTENCE (localStorage)
  // ================================================================

  function draftKey() {
    return (
      'seg-draft:' +
      currentBook +
      '/' +
      currentChapter +
      '/' +
      currentModuleId +
      ':' +
      tabGuard.tabId
    );
  }

  function draftPrefix() {
    return 'seg-draft:' + currentBook + '/' + currentChapter + '/' + currentModuleId + ':';
  }

  /** Writes a draft value (this tab's, of the open unit, unless `key` names another); false when storage refused it. */
  function writeDraft(entries, key = draftKey()) {
    try {
      localStorage.setItem(
        key,
        JSON.stringify(segmentSaveState.buildDraftValue(entries, Date.now()))
      );
      return true;
    } catch {
      if (typeof saveRetry !== 'undefined')
        saveRetry.showToast(UI.common.localStorageFull, 'error');
      return false;
    }
  }

  /** Writes this tab's draft of the open unit; false when storage refused the write (R2). */
  function saveDraft() {
    if (!currentModuleId) return true;
    const entries = draftEntries();
    if (Object.keys(entries).length === 0) {
      localStorage.removeItem(draftKey());
      return true;
    }
    return writeDraft(entries);
  }

  /** §5.18: per segment the text, the base it was started from, its occurrence and its assists. */
  function draftEntries() {
    const entries = {};
    for (const segId of dirtyEdits) {
      const ta = document.getElementById('textarea-' + cssId(segId));
      if (!ta) continue;
      const st = paneState.get(segId) || freshPaneState(segId);
      entries[segId] = segmentSaveState.draftEntry({
        text: ta.value,
        baseSha256: st.baseSha256,
        occurrence: st.occurrence,
        assists: st.assists,
        refused: st.refused,
      });
    }
    for (const [segId, held] of heldDrafts) if (!entries[segId]) entries[segId] = held.entry;
    return entries;
  }

  /** Try storage again with what leaving a unit could not store (R2); what it still refuses stays in memory. */
  function storeUnwritten() {
    for (const [prefix, value] of unwrittenDrafts) {
      try {
        localStorage.setItem(prefix + tabGuard.tabId, JSON.stringify(value));
        unwrittenDrafts.delete(prefix);
      } catch {
        // still full: it stays here, and leaving the page asks first
      }
    }
  }

  function clearDraft() {
    if (!currentModuleId) return;
    const kept = keptEntries(); // a refused save's text outlives leaving the module
    tabGuard.clearDraftsByPrefix(draftPrefix());
    if (Object.keys(kept).length > 0) writeDraft(kept);
    heldDrafts.clear();
    paneState.clear();
  }

  function startDraftTimer() {
    if (draftTimer) clearInterval(draftTimer);
    draftTimer = setInterval(saveDraft, 5000);
  }

  /** Every parseable draft value stored under `prefix`, in storage order (mergeDraftValues orders them by ts). */
  function draftValuesUnder(prefix) {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      try {
        out.push(JSON.parse(localStorage.getItem(k)));
      } catch {
        // a corrupt entry holds nothing usable; clearDraftsByPrefix removes it with the rest
      }
    }
    return out;
  }

  function restoreDraft() {
    const prefix = draftPrefix();
    // EVERY tab's draft for this module, not only tabGuard.findNewestDraft's: a kept text can sit in an older
    // tab's key (an F5 gives the page a new tabId), and clearDraftsByPrefix below removes them all (plan decision 31).
    const values = draftValuesUnder(prefix);
    // What leaving this unit could not store (R2): built when the unit was left, so newer than what storage holds.
    if (unwrittenDrafts.has(prefix)) {
      values.push(unwrittenDrafts.get(prefix));
      unwrittenDrafts.delete(prefix);
    }
    const found = values.length > 0;
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000; // tabGuard's own window
    const fromStorage = segmentSaveState.mergeDraftValues(
      values.filter((v) => v && typeof v.ts === 'number' && v.ts >= weekAgo)
    );
    const parked =
      typeof saveRetry !== 'undefined' && typeof saveRetry.takeParked === 'function'
        ? saveRetry.takeParked(parkedPrefix())
        : [];
    const entries = segmentSaveState.mergeRestoreSources(fromStorage, parked);
    // A pane already holding text on screen is left alone: its row was not rebuilt by this load (renderSegments).
    const ids = Object.keys(entries).filter((id) => !paneState.has(id) && !dirtyEdits.has(id));
    // A parked replay for this module comes back even with no draft stored: a body queued by a page loaded before
    // the deploy, replayed by this page after F5 (decision 28).
    if (!found && parked.length === 0) return;
    if (found) tabGuard.clearDraftsByPrefix(prefix);
    // A kept text (a refused save) comes back unasked; only the others ask (index decision 12).
    const kept = ids.filter((id) => entries[id].refused);
    const others = ids.filter((id) => !entries[id].refused);
    // The first restored pane takes the focus at the end (and so scrolls into view), unless the editor is in a
    // pane already.
    const active = document.activeElement;
    const typing = !!(
      active &&
      typeof active.closest === 'function' &&
      active.closest('.edit-panel')
    );
    const restored = [];
    for (const segId of kept) {
      restored.push(segId);
      if (!installDraft(segId, entries[segId], { addRestoreItem: true })) {
        heldDrafts.set(segId, { entry: entries[segId], addRestoreItem: true });
      }
    }
    if (others.length > 0 && confirm(UI.confirm.draftRecovery(others.length))) {
      for (const segId of others) {
        restored.push(segId);
        // The editor asked for it back: a row the filters hide must not make that answer a deletion. It waits in
        // the hold for its row. A segment the module no longer has gets no row, so its draft is dropped as before
        // (held, it could never be installed and would be offered again at every reload).
        if (
          !installDraft(segId, entries[segId], { addRestoreItem: true }) &&
          moduleData.segments.some((s) => s.segmentId === segId)
        ) {
          heldDrafts.set(segId, { entry: entries[segId], addRestoreItem: true });
        }
      }
    }
    // A held text's row is rendered whatever the filters say (renderSegments), which installs it.
    if (heldDrafts.size > 0) renderSegments();
    if (!typing) {
      const first = restored.map((segId) => openBox(segId)).find(Boolean);
      if (first) first.focus();
    }
    updateSaveStatusBar();
    saveDraft(); // the restored panes are dirty: persist them under this tab's key now
  }

  /**
   * Put a draft entry into its pane. `addRestoreItem`: the text came back from
   * storage, so its assists are re-installed BEFORE a draft-restore item
   * (§5.18). Returns false when the row is not on screen (its segment is gone).
   * `fields`: the category and note the pane held when its text was taken out
   * (paneFields), put back so the rebuilt row's own do not replace them.
   */
  function installDraft(segId, entry, { addRestoreItem, fields = null }) {
    if (!rowElement(segId)) return false;
    openEditPanel(segId, { focus: false }); // it never takes the focus itself: its callers decide who has it
    const ta = document.getElementById('textarea-' + cssId(segId));
    if (!ta) return false;
    heldDrafts.delete(segId);
    ta.value = entry.text;
    if (fields) {
      const cat = document.getElementById('cat-' + cssId(segId));
      const note = document.getElementById('note-' + cssId(segId));
      if (cat) cat.value = fields.category;
      if (note) note.value = fields.note;
    }
    const row = rowValues(segId);
    // A kept text on a row that is another editor's to finish is not saved from here (rowNotEditable).
    const blocked = !!entry.refused && entry.refused !== 'DUPLICATE_ID' && rowNotEditable(segId);
    paneState.set(segId, {
      baseSha256: entry.baseSha256, // the base it was typed on; null when unknown (legacy)
      // A parked save names none (entryFromParked; PR1 review C17): the row's.
      occurrence: entry.occurrence !== null ? entry.occurrence : row ? row.occurrence : null,
      assists: addRestoreItem
        ? segmentSaveState.restoredAssists(entry, Date.now())
        : entry.assists.slice(),
      refused: entry.refused || null,
      blocked,
    });
    dirtyEdits.add(segId);
    const previewEl = document.getElementById('preview-' + cssId(segId));
    if (previewEl) previewEl.innerHTML = panePreviewHtml(segId, ta.value);
    refreshBackdrop(segId);
    // The text was set without an input event: redraw, so the restored accepts come back tagged (G1.23).
    refreshSuggestionView(segId);
    showDraftNotice(
      segId,
      blocked ? 'ROW_NOT_YOURS' : segmentSaveState.noticeFor(entry, row ? row.baseSha256 : null)
    );
    setSaveBlocked(segId, entry.refused === 'DUPLICATE_ID' || blocked);
    return true;
  }

  /** Get effective role (respects admin role preview override) */
  function getEffectiveRole() {
    if (window.navUtils && typeof window.navUtils.getEffectiveRole === 'function') {
      return window.navUtils.getEffectiveRole(userRole);
    }
    return userRole;
  }

  const API_BASE = '/api/segment-editor';

  // Index decision 12, decision 28: a refused replay of a segment save comes back to its pane. markReplayed is
  // repeated because a second setKeyPolicy for a prefix replaces the first (Task 7's DEFAULT_KEY_POLICIES).
  // A replay that succeeds writes its echo on the row (PR1 review C5).
  // Guarded: a cached saveRetry.js older than this file has no setKeyPolicy.
  if (typeof saveRetry !== 'undefined' && typeof saveRetry.setKeyPolicy === 'function') {
    saveRetry.setKeyPolicy('seg:', {
      markReplayed: true,
      parkRefused: true,
      onParked: onSaveParked,
      onReplayed: onSaveReplayed,
    });
  }

  /**
   * The row's own values, read from its DOM. Never moduleData: a declined
   * re-render (renderSegments returns false, renderModule ignores it) leaves
   * moduleData newer than the screen (§5.18).
   */
  function rowElement(segmentId) {
    return document.getElementById('row-' + cssId(segmentId));
  }
  function rowValues(segmentId) {
    return segmentSaveState.readRowValues(rowElement(segmentId));
  }

  /** G1.21: what the next save from this row must echo, kept on the row itself. */
  function applySaveEcho(segmentId, result) {
    const tr = rowElement(segmentId);
    if (!tr) return;
    const current = segmentSaveState.readRowValues(tr);
    for (const [name, value] of segmentSaveState.echoAttributeUpdates(result, current.baseEditId)) {
      if (value === null) tr.removeAttribute(name);
      else tr.setAttribute(name, value);
    }
  }

  /** The hash of the edit the reviewer is looking at: the row that displays it. */
  function reviewedEditSha256For(editId) {
    const id = Number(editId);
    const tr = document.querySelector('#segments-body tr[data-displayed-edit-id="' + id + '"]');
    const row = segmentSaveState.readRowValues(tr);
    return row && row.displayedEditId === id ? row.displayedEditSha256 : null;
  }

  function freshPaneState(segmentId) {
    const row = rowValues(segmentId);
    return {
      baseSha256: row ? row.baseSha256 : null,
      occurrence: row ? row.occurrence : null,
      assists: [],
      refused: null,
    };
  }
  /** Attribute the item to the segment whose textarea received it (§5.10). */
  function addAssist(segmentId, item) {
    if (!paneState.has(segmentId)) paneState.set(segmentId, freshPaneState(segmentId));
    paneState.get(segmentId).assists.push(item);
  }
  function paneAssists(segmentId) {
    const st = paneState.get(segmentId);
    return st ? st.assists : [];
  }
  function clearPaneState(segmentId) {
    paneState.delete(segmentId);
    heldDrafts.delete(segmentId);
    showDraftNotice(segmentId, null);
    setSaveBlocked(segmentId, false);
  }

  const DRAFT_NOTICE_TEXT = {
    STALE_BASE: UI.draftNotice.staleBase,
    STALE_DISPLAYED: UI.draftNotice.staleDisplayed,
    UNSEEN_EDIT: UI.draftNotice.unseenEdit,
    BASE_MISSING: UI.draftNotice.baseMissing,
    DUPLICATE_ID: UI.draftNotice.duplicateId,
    BOOK_NOT_MINTED: UI.draftNotice.bookNotMinted,
    NO_LAYER: UI.draftNotice.noLayer,
    conflict: UI.draftNotice.conflict, // the save route's { error: 'conflict' } (segmentSaveState.CONFLICT_CODE)
    REFUSED: UI.draftNotice.refused,
    ROW_NOT_YOURS: UI.draftNotice.rowNotYours, // a kept text whose row is another editor's to finish (installDraft)
  };

  function showDraftNotice(segmentId, code) {
    const panel = document.getElementById('edit-' + cssId(segmentId));
    if (!panel) return;
    const old = panel.querySelector('.draft-notice');
    if (old) old.remove();
    if (!code) return;
    const div = document.createElement('div');
    div.className = 'draft-notice';
    div.setAttribute('data-notice', code);
    div.setAttribute('role', 'status');
    div.textContent = DRAFT_NOTICE_TEXT[code] || UI.draftNotice.refused;
    panel.insertBefore(div, panel.firstChild);
  }

  /** R4: a DUPLICATE_ID text is never sent (Vista, Ctrl+Enter, propagate). */
  function setSaveBlocked(segmentId, blocked) {
    const panel = document.getElementById('edit-' + cssId(segmentId));
    if (!panel) return;
    for (const sel of ['.edit-controls .btn-primary', '.edit-controls .btn-propagate']) {
      const btn = panel.querySelector(sel);
      if (btn) btn.disabled = blocked;
    }
  }

  /**
   * A kept text is never dropped silently. It is kept while its pane says so, and also while it waits in the hold
   * for the reload that follows its refusal: the pane is still open on screen then, with no state of its own.
   */
  function confirmDiscardKept(segmentId) {
    const st = paneState.get(segmentId);
    return (
      !((st && st.refused) || heldDrafts.has(segmentId)) || confirm(UI.draftNotice.discardKept)
    );
  }

  /** Whether the pane holds text the editor changed: dirty, and not typed back to what the pane started with. */
  function paneTextChanged(segmentId) {
    const ta = document.getElementById('textarea-' + cssId(segmentId));
    return !!ta && dirtyEdits.has(segmentId) && ta.value !== ta.defaultValue;
  }

  /**
   * Interface audit ED-04: Hætta við, Endurstilla and Escape in the text box threw changed text away unasked.
   * One question per gesture: a kept text asks its own (confirmDiscardKept), any other changed text asks
   * discardChanges, and a pane with nothing changed asks nothing.
   */
  function confirmDiscard(segmentId) {
    const st = paneState.get(segmentId);
    if ((st && st.refused) || heldDrafts.has(segmentId)) return confirmDiscardKept(segmentId);
    return !paneTextChanged(segmentId) || confirm(UI.confirm.discardChanges);
  }

  /** Back's question, also asked before another unit is opened over this one (loadModule). */
  function confirmLeaveUnit() {
    // It asks when leaving would discard a changed text, and says that it will; a text a refused save kept is not
    // discarded (clearDraft writes it back), so it does not count that one.
    const losing = [...dirtyEdits].filter(
      (id) =>
        !(paneState.get(id) && paneState.get(id).refused) &&
        paneTextChanged(id) &&
        !savesInFlight.has(id) // its save is on its way and lands; an answer after leaving is handled (R1)
    ).length;
    return losing === 0 || confirm(UI.confirm.leaveDiscards(losing));
  }

  /**
   * Whether the row is another editor's to finish: the row's own Breyta rule (segmentEditAllowed) says no. A text
   * a refused save kept is not saved from such a row, whatever the refusal was: the re-installed pane would save a
   * competing edit over the other editor's waiting one, which the row then no longer shows. The block lifts when
   * that edit has been decided (a kept pane is re-installed, and this asked again, at every re-render).
   */
  function rowNotEditable(segmentId) {
    return !!moduleData && !segmentEditAllowed(moduleData.edits[segmentId]?.[0]);
  }

  /** The textarea of the segment's pane while that pane is open; null otherwise. */
  function openBox(segmentId) {
    const tr = rowElement(segmentId);
    return tr ? tr.querySelector('.edit-panel.active textarea') : null;
  }

  /** The category and note a pane holds now; they are not part of a draft entry, so a carried pane brings them. */
  function paneFields(segmentId) {
    const cat = document.getElementById('cat-' + cssId(segmentId));
    const note = document.getElementById('note-' + cssId(segmentId));
    return { category: cat ? cat.value : '', note: note ? note.value : '' };
  }

  function keptPaneEntries() {
    const out = {};
    for (const [segId, st] of paneState) {
      if (!st.refused) continue;
      const ta = document.getElementById('textarea-' + cssId(segId));
      if (!ta) continue;
      out[segId] = segmentSaveState.draftEntry({
        text: ta.value,
        baseSha256: st.baseSha256,
        occurrence: st.occurrence,
        assists: st.assists,
        refused: st.refused,
      });
    }
    return out;
  }
  function keptEntries() {
    const out = keptPaneEntries();
    for (const [segId, held] of heldDrafts) if (!out[segId]) out[segId] = held.entry;
    return out;
  }

  /** Move a refused text into the hold and the draft, so the reload restores it. */
  function keepText(segmentId, entry) {
    // `rereadBox`: the pane is open and holds exactly this text, so what is typed in it before the reload redraws
    // the row belongs to it (renderSegments reads the box again). A text that did not come from the box (a parked
    // replay's, when the pane was reverted meanwhile) is left as it is.
    const box = openBox(segmentId);
    heldDrafts.set(segmentId, {
      entry,
      addRestoreItem: true,
      fields: paneFields(segmentId),
      rereadBox: !!box && box.value === entry.text,
    });
    dirtyEdits.delete(segmentId);
    paneState.delete(segmentId);
    saveDraft(); // every dirty pane's text, plus the held one, before the reload
  }

  function parkedPrefix() {
    return 'seg:' + currentBook + '/' + currentChapter + '/' + currentModuleId + ':';
  }

  /**
   * A replay of a save in THIS module was refused, or ran out of retries on
   * 5xx answers or network failures (saveRetry parked it; decision 28; a
   * network one has status null). Keep the newest text: the
   * pane's, if the editor kept typing; else a text already held for the
   * segment (a newer save's refusal kept it while its pane is not back yet,
   * PR1 review C1), with its base and assists, by the rule a restore applies
   * (mergeRestoreSources: it takes the parked code only if it has none); else
   * the replayed body's. A parked item with no refusal code restores with the
   * generic notice (entryFromParked). A replay for another module waits for
   * that module's next load, and so does one that parks while no unit is open
   * (moduleData null: after Back, or after a reload answered
   * OPENING_UNRECORDED; leaveModule): restoreDraft takes it then, and the
   * drafted text, if newer, wins (mergeRestoreSources).
   */
  function onSaveParked(item) {
    if (!moduleData || item.key.indexOf(parkedPrefix()) !== 0) return;
    saveRetry.takeParked(item.key, { exact: true }); // handled here, not at the next load
    const parked = segmentSaveState.entryFromParked(item);
    if (!parked) return;
    const segId = parked.segmentId;
    const st = paneState.get(segId);
    const ta = document.getElementById('textarea-' + cssId(segId));
    const held = heldDrafts.get(segId);
    const heldEntry = held
      ? segmentSaveState.mergeRestoreSources({ entries: { [segId]: held.entry } }, [item])[segId]
      : null;
    const entry =
      st && ta && dirtyEdits.has(segId)
        ? segmentSaveState.draftEntry({
            text: ta.value,
            baseSha256: st.baseSha256,
            occurrence: st.occurrence,
            assists: st.assists,
            refused: parked.entry.refused,
          })
        : heldEntry || parked.entry;
    keepText(segId, entry);
    loadModule(currentModuleId, { force: true });
  }

  /**
   * A replay of a save in THIS module succeeded (PR1 review C5). Its live
   * attempt failed, so saveEdit wrote no echo and left the pane open and
   * dirty: write the replay's echo on the row now, so the pane's next save
   * sends the edit the segment displays since the replay. The pane stays open
   * and the module is not reloaded: the editor may still be typing. Only while
   * that pane is still dirty: a pane closed since was reset to the text the
   * row shows, which the replay has replaced, so a save from it should meet
   * the displayed check. A replay for another module, or one that lands while
   * no unit is open (leaveModule), waits for that module's next load, which
   * renders its rows from the server.
   */
  function onSaveReplayed(item, data) {
    if (!moduleData || item.key.indexOf(parkedPrefix()) !== 0) return;
    const segId = item.key.slice(parkedPrefix().length);
    if (!dirtyEdits.has(segId)) return;
    applySaveEcho(segId, data);
  }

  function reinstallHeldDrafts() {
    for (const [segId, held] of [...heldDrafts]) {
      // No row (the segment is gone from the module): it stays held.
      installDraft(segId, held.entry, {
        addRestoreItem: held.addRestoreItem,
        fields: held.fields || null,
      });
    }
    updateSaveStatusBar();
  }

  function refusalAlertText(err) {
    if (err.code === 'BASE_MISSING') return UI.refusal.baseMissing;
    return (err.message || UI.refusal.generic) + '\n\n' + UI.refusal.textKept;
  }

  // ================================================================
  // AUTH
  // ================================================================
  async function checkAuth() {
    try {
      const data = await fetchJson('/api/auth/me', { credentials: 'include' });
      userRole = data.user?.role || 'viewer';
      userName = data.user?.username || null;
    } catch {
      window.location.href =
        '/api/auth/login?redirect=' +
        encodeURIComponent(window.location.pathname + window.location.search);
    }
  }

  // ================================================================
  // MODULE SELECTOR
  // ================================================================
  const bookSelect = document.getElementById('book-select');
  const chapterSelect = document.getElementById('chapter-select');

  bookSelect.addEventListener('change', async () => {
    currentBook = bookSelect.value;
    chapterSelect.disabled = !currentBook;
    chapterSelect.innerHTML = '<option value="">' + UI.common.loadingChapter + '</option>';
    document.getElementById('modules-list').style.display = 'none';

    if (currentBook) {
      try {
        const data = await fetchJson(`${API_BASE}/${currentBook}/chapters`, {
          credentials: 'include',
        });
        for (const ch of data.chapters) {
          const opt = document.createElement('option');
          // ch is now an object { chapter, title, titleIs } from the enriched API
          const num = ch.chapter ?? ch;
          const label = ch.titleIs || ch.title;
          opt.value = num;
          opt.textContent =
            num === -1 ? label || 'Viðaukar' : label ? `Kafli ${num} — ${label}` : `Kafli ${num}`;
          chapterSelect.appendChild(opt);
        }
      } catch (err) {
        console.error('Failed to load chapters:', err);
      }
      // Restore placeholder if no chapters loaded (fetch failed or empty)
      if (chapterSelect.options.length <= 1) {
        chapterSelect.innerHTML = '<option value="">' + UI.common.selectChapter + '</option>';
      }
    } else {
      chapterSelect.innerHTML = '<option value="">' + UI.common.selectChapter + '</option>';
    }
  });

  chapterSelect.addEventListener('change', async () => {
    currentChapter = parseInt(chapterSelect.value, 10);
    if (!currentChapter) return;

    const container = document.getElementById('modules-container');
    container.innerHTML =
      '<div class="loading-state"><span class="spinner"></span><span>' +
      UI.common.loading +
      '</span></div>';
    document.getElementById('modules-list').style.display = 'block';

    try {
      const data = await fetchJson(`${API_BASE}/${currentBook}/${currentChapter}`, {
        credentials: 'include',
      });

      if (!data.modules || data.modules.length === 0) {
        container.innerHTML = '<p class="text-muted">' + UI.common.noModulesFound + '</p>';
        return;
      }

      const MODULE_LABELS = { 'chapter-metadata': 'Lýsigögn kafla' };
      container.innerHTML = data.modules
        .map((m) => {
          const displayTitle = MODULE_LABELS[m.moduleId] || m.titleIs || m.title || m.moduleId;
          const sectionLabel = m.section
            ? `<span class="module-section">${escapeHtml(m.section)}</span> `
            : '';
          return `
            <div class="module-card" onclick="loadModule('${m.moduleId}')" title="${escapeHtml(m.moduleId)} — Smelltu til að opna">
              <strong>${sectionLabel}${escapeHtml(displayTitle)}</strong>
              <div class="module-badges">
                ${m.hasEnSource ? '<span class="module-badge en">EN</span>' : ''}
                ${m.hasMtOutput ? '<span class="module-badge mt">MT</span>' : ''}
                ${m.hasFaithful ? '<span class="module-badge faithful">Ritstýrt</span>' : ''}
                ${m.hasLocalized ? '<span class="module-badge localized">Staðfært</span>' : ''}
                ${m.mtFindingCount > 0 ? `<span class="module-badge mt-finding" title="Vélþýðingarskoðun fann ${m.mtFindingCount} bút til skoðunar">&#9888; ${m.mtFindingCount}</span>` : ''}
              </div>
            </div>
          `;
        })
        .join('');
    } catch (err) {
      container.innerHTML = `<p style="color: var(--error);">Villa: ${escapeHtml(err.message)}</p>`;
    }
  });

  // ================================================================
  // LOAD MODULE
  // ================================================================
  async function loadModule(moduleId, { force = false } = {}) {
    if (!force && _loadingModuleId === moduleId) return; // already loading this module
    // Another unit while one is open: after a failed reload the module list is on screen above the open unit.
    // The open one is left first, as Back leaves it and with Back's question. Otherwise its rows with unsaved
    // text would stay in the other unit's table (renderSegments leaves such rows alone), and the draft timer
    // would write their text under the other unit's key.
    if (moduleData && moduleId !== currentModuleId) {
      if (!confirmLeaveUnit()) return;
      clearDraft();
      leaveModule();
    }
    _loadingModuleId = moduleId;
    currentModuleId = moduleId;

    // Show loading spinner immediately to prevent double-clicks
    const modulesContainer = document.getElementById('modules-container');
    if (modulesContainer) {
      modulesContainer.innerHTML =
        '<div class="loading-state"><span class="spinner"></span><span>' +
        UI.common.loadingModule +
        '</span></div>';
    }

    try {
      moduleData = await fetchJson(`${API_BASE}/${currentBook}/${currentChapter}/${moduleId}`, {
        credentials: 'include',
      });

      // Claim module for cross-tab conflict detection
      tabGuard.claim('seg:' + currentBook + '/' + currentChapter + '/' + moduleId);

      document.getElementById('module-selector').style.display = 'none';
      document.getElementById('editor-container').style.display = 'block';

      renderModule();
      showPipelinePanel();
      showPreviewPanel();
      showApplyPanel();
      showReviewSummary();
      restoreDraft();
      startDraftTimer();
      // Safe to start before any card exists: figSaveDraft no-ops until
      // figuresModuleId matches, which only loadFigures sets.
      figStartDraftTimer();

      // Show save status bar and update it
      document.getElementById('save-status-bar').style.display = 'flex';
      updateSaveStatusBar();

      // Load term data + repetition suggestions in background (non-blocking)
      loadTermData(moduleId);
      loadRepetitions(moduleId);
      // Figure-text review cards. Also non-blocking, and it clears the
      // container first, so switching modules cannot leave a stale card
      // offering to approve a figure the open module does not have.
      loadFigures(moduleId);
    } catch (err) {
      // Restore module list on error so users can retry
      document.getElementById('module-selector').style.display = 'block';
      chapterSelect.dispatchEvent(new Event('change'));
      // spec §5.4: a serve whose opening could not be recorded answers 503 OPENING_UNRECORDED. fetchJson builds
      // err.message from data.error first (htmlUtils.js), which is the bare code here, so the text comes from UI.
      // No retry: the editor opens the unit again from the list.
      const unrecorded = err.status === 503 && err.data && err.data.error === 'OPENING_UNRECORDED';
      const pane = document.getElementById('editor-container');
      if (unrecorded && pane.style.display !== 'none') {
        // A reload from an open pane (after a save, a review action, or a refused save's keepText). The editor leaves
        // the unit as Back leaves it, so nothing on the module list can save, accept or discard for a unit whose
        // opening was not recorded (spec §5.4; T6); but unlike Back nothing is discarded. saveDraft first writes
        // every dirty pane's text and every held (kept) text to this tab's draft; if storage refuses it (full), the
        // same entries stay in memory for this unit (keepUnwritten, PR2 review R2). leaveModule then empties the
        // memory a later saveDraft would rebuild that draft from. Both kinds come back through restoreDraft when the
        // unit is opened again. Writes sent before this reload can still land, their texts typed while the unit was open
        // (Review Focus 8): a save saveRetry queued, and a save, accept or review action still awaiting its answer.
        // That answer touches nothing of the unit and re-serves nothing (openUnit, PR2 review R1); a kept code's
        // text is added to this draft (keepLeftText). On a first load nothing is on screen and this is skipped:
        // saveDraft there would remove this tab's draft, which can hold a text Back kept.
        if (!saveDraft()) keepUnwritten(draftPrefix(), draftEntries());
        leaveModule();
      }
      alert(unrecorded ? UI.segmentEditor.openingUnrecorded : UI.common.errorLoading + err.message);
    } finally {
      _loadingModuleId = null;
    }
  }

  async function loadTermData(moduleId) {
    const requestedModule = currentModuleId; // capture at call time
    try {
      const res = await fetch(`${API_BASE}/${currentBook}/${currentChapter}/${moduleId}/terms`, {
        credentials: 'include',
      });
      if (!res.ok || currentModuleId !== requestedModule) return; // stale
      const data = await res.json();
      if (currentModuleId !== requestedModule) return; // stale after parse
      termData = data.termMatches || {};

      // Re-render to show term highlights and issues
      renderSegments();
      renderStats();
    } catch {
      // Term loading is non-critical, fail silently
      termData = null;
    }
  }

  // Fetch exact-match review-deduplication suggestions: segments whose EN was
  // already approved elsewhere get a "þegar samþykkt" hint with one-click insert.
  async function loadRepetitions(moduleId) {
    const requestedModule = currentModuleId;
    try {
      const res = await fetch(
        `${API_BASE}/${currentBook}/${currentChapter}/${moduleId}/repetitions`,
        { credentials: 'include' }
      );
      if (!res.ok || currentModuleId !== requestedModule) return;
      const data = await res.json();
      if (currentModuleId !== requestedModule) return;
      repetitionData = {};
      for (const rep of data.repetitions || []) {
        repetitionData[rep.segmentId] = rep;
      }
      renderSegments();
    } catch {
      // Non-critical
      repetitionData = {};
    }
  }

  // ================================================================
  // FIGURE-TEXT REVIEW CARDS
  // ================================================================
  /**
   * A translated figure's Icelandic text lives in a COMMITTED sidecar; its
   * review state lives in SQLite; the badge is DERIVED from both and is never
   * stored client-side. So every mutation below re-fetches /figures instead of
   * guessing: an approved figure whose blocks just changed reverts to
   * mt-preview on its own, and a local guess would disagree with the renderer.
   *
   * ⚠️ Every value here is assigned through the DOM (input.value, textContent,
   * setAttribute) and never interpolated into innerHTML. Block text is MT
   * output plus editor free-text, and a caption warning's note contains double
   * quotes BY CONSTRUCTION (`the module's caption/alt uses "X"`), so a
   * `value="${text}"` template would break the attribute or inject markup.
   *
   * ⚠️ The <img> URL is SERVER-SUPPLIED, in fig.imageUrl, and this file must
   * never build one. Two measured reasons: this app serves no /content mount
   * (express.static covers server/public only), so the URL the plan originally
   * sketched would have 404'd on every card for every book; and assembling the
   * filename here would hardcode DEFAULT_SUFFIX, whose owner is
   * tools/generate-image-mapping.js and which CLAUDE.md says to read from its
   * owner rather than restate. The server resolves it FORWARD through
   * books/<slug>/media/image-mapping.json instead, and sends null when the
   * figure has no translated image — which is most of them.
   * Pinned by server/__tests__/figureCardImagePins.test.js.
   */
  function figureCardsContainer() {
    return document.getElementById('figure-cards');
  }

  /**
   * Which module the figure cards currently on screen belong to.
   *
   * 🔴 NOT the same thing as `currentModuleId`. `loadModule` sets that FIRST and
   * calls `loadFigures` last, without awaiting it, so there is a window in which
   * the variable names the new module while the DOM still shows the previous
   * one's cards. Capturing or drafting in that window files one module's text
   * under another module's id. Everything that reads the figure DOM checks this.
   */
  let figuresModuleId = null;

  /** What is in the figure inputs right now, keyed the way the payload is. */
  function captureLiveFigureEdits() {
    const live = {};
    const container = figureCardsContainer();
    if (!container) return live;
    for (const card of container.querySelectorAll('[data-figure-card]')) {
      const basename = card.getAttribute('data-figure-card');
      const blocks = {};
      for (const input of card.querySelectorAll('[data-block-input]')) {
        blocks[input.getAttribute('data-block-key')] = input.value;
      }
      const noteInput = card.querySelector('[data-figure-note-input]');
      live[basename] = { blocks, note: noteInput ? noteInput.value : '' };
    }
    return live;
  }

  /**
   * Write carried-forward text back into the freshly rebuilt cards and MARK it,
   * so "this is not saved" is visible rather than inferred from memory.
   */
  function applyFigureEdits(edits) {
    const container = figureCardsContainer();
    if (!container) return;
    for (const basename of Object.keys(edits)) {
      const card = container.querySelector(`[data-figure-card="${CSS.escape(basename)}"]`);
      if (!card) continue;
      const entry = edits[basename];
      for (const key of Object.keys(entry.blocks || {})) {
        const input = card.querySelector(`[data-block-input][data-block-key="${CSS.escape(key)}"]`);
        if (!input) continue;
        input.value = entry.blocks[key];
        markFigureBlockUnsaved(input);
      }
      if (entry.note) {
        const noteInput = card.querySelector('[data-figure-note-input]');
        if (noteInput) noteInput.value = entry.note;
      }
    }
  }

  /** The visible "not saved yet" state for one block. */
  function markFigureBlockUnsaved(input) {
    input.classList.add('figure-block-unsaved');
    const row = input.closest('.figure-block');
    if (row) row.setAttribute('data-block-unsaved', '');
  }

  /**
   * @param {string} moduleId
   * @param {object} [opts]
   * @param {boolean} [opts.preserve] carry unsaved input across the rebuild.
   *        Only ever true for a refresh of the module already on screen — on the
   *        module-load path there is nothing of THIS module's to preserve, and
   *        capturing would file the previous module's text under this one's id.
   * @param {{basename: string, blockKey: string}|null} [opts.justSaved]
   *
   * A localStorage draft is restored on the NOT-preserve path, i.e. exactly the
   * module-load one. It cannot live in `loadModule`: the inputs a draft writes
   * into are created by `renderFigureCards`, which runs here and is not awaited
   * there. `preserve` therefore selects between the two reasons a rebuild
   * happens — a fresh module (restore) and a refresh after a save (carry over).
   */
  async function loadFigures(moduleId, { preserve = false, justSaved = null } = {}) {
    const requestedModule = currentModuleId; // capture at call time
    // Read the inputs BEFORE the clear below destroys them.
    const live = preserve && figuresModuleId === moduleId ? captureLiveFigureEdits() : {};
    // Clear FIRST: a module with no reviewable figures must show none, and a
    // re-load must not stack a second copy of every card.
    figuresModuleId = null;
    renderFigureCards([]);
    try {
      const res = await fetch(`${API_BASE}/${currentBook}/${currentChapter}/${moduleId}/figures`, {
        credentials: 'include',
      });
      if (!res.ok || currentModuleId !== requestedModule) return; // stale
      const data = await res.json();
      if (currentModuleId !== requestedModule) return; // stale after parse
      const figures = data.figures || [];
      renderFigureCards(figures);
      figuresModuleId = moduleId;
      applyFigureEdits(figureDrafts.unsavedFigureEdits(figures, live, justSaved));
      if (!preserve) figRestoreDraft(figures);
      figSaveDraft();
    } catch {
      // Advisory surface: a figure-review outage must never block segment work.
      renderFigureCards([]);
    }
  }

  // ================================================================
  // FIGURE DRAFTS (localStorage) — survive a reload, a crash, a closed tab
  // ================================================================

  function figSaveDraft() {
    // Guarded by figuresModuleId, not currentModuleId: see its docstring.
    if (!currentModuleId || figuresModuleId !== currentModuleId) return;
    const key = figureDrafts.figDraftKey(
      currentBook,
      currentChapter,
      currentModuleId,
      tabGuard.tabId
    );
    // Only what is genuinely unsaved — the same decision the rebuild uses, so a
    // draft can never disagree with what the card shows as unsaved.
    const container = figureCardsContainer();
    const unsaved = {};
    if (container) {
      for (const row of container.querySelectorAll('[data-block-unsaved]')) {
        const input = row.querySelector('[data-block-input]');
        const card = row.closest('[data-figure-card]');
        if (!input || !card) continue;
        const basename = card.getAttribute('data-figure-card');
        unsaved[basename] = unsaved[basename] || { blocks: {} };
        unsaved[basename].blocks[input.getAttribute('data-block-key')] = input.value;
      }
      for (const noteInput of container.querySelectorAll('[data-figure-note-input]')) {
        if (!noteInput.value) continue;
        const card = noteInput.closest('[data-figure-card]');
        if (!card) continue;
        const basename = card.getAttribute('data-figure-card');
        unsaved[basename] = unsaved[basename] || { blocks: {} };
        unsaved[basename].note = noteInput.value;
      }
    }
    if (Object.keys(unsaved).length === 0) {
      localStorage.removeItem(key);
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify({ ts: Date.now(), figures: unsaved }));
    } catch {
      if (typeof saveRetry !== 'undefined')
        saveRetry.showToast(UI.common.localStorageFull, 'error');
    }
  }

  function figStartDraftTimer() {
    if (figDraftTimer) clearInterval(figDraftTimer);
    figDraftTimer = setInterval(figSaveDraft, 5000);
  }

  /**
   * Re-apply a draft into the cards that were just built.
   *
   * ⚠️ SILENT, unlike the segment and localization editors, which `confirm()`.
   * Those run one prompt per module load; a second one for figures would mean
   * two dialogs before the editor can read the page. The unsaved MARKER is the
   * notice here, and it is on the block itself rather than in a dialog the
   * editor has already dismissed.
   */
  function figRestoreDraft(figures) {
    const prefix = figureDrafts.figDraftPrefix(currentBook, currentChapter, currentModuleId);
    const found = tabGuard.findNewestDraft(prefix);
    if (!found) return;
    try {
      const draft = found.data;
      if (Date.now() - draft.ts > 7 * 24 * 60 * 60 * 1000) {
        tabGuard.clearDraftsByPrefix(prefix);
        return;
      }
      // Through the same decision the rebuild uses: a draft older than the
      // server's own value must not resurrect text an editor already saved
      // elsewhere, and a figure that has since gone must not come back.
      applyFigureEdits(figureDrafts.unsavedFigureEdits(figures, draft.figures || {}, null));
      tabGuard.clearDraftsByPrefix(prefix);
    } catch {
      tabGuard.clearDraftsByPrefix(prefix);
    }
  }

  function renderFigureCards(figures) {
    const container = figureCardsContainer();
    const section = document.getElementById('figure-review-section');
    if (!container || !section) return;
    container.replaceChildren();
    // A figure with no sidecar is not returned at all (there are ~1,500
    // untranslated OpenStax figures), so an empty list is the ordinary case.
    section.style.display = figures.length ? 'block' : 'none';
    for (const fig of figures) container.appendChild(renderFigureCard(fig));
  }

  function figureWarning(text) {
    const em = document.createElement('em');
    em.className = 'figure-warning';
    em.setAttribute('data-block-warning', '');
    em.textContent = text;
    return em;
  }

  /**
   * How many source lines a block key has: its '|'-segments, not counting a segment of only spaces
   * (the next row's indent, which the composer folds into its neighbour; ruling R-17). A key whose
   * segments are all spaces counts its raw segments, so the result is never 0.
   *
   * ⚠️ A BROWSER COPY of tools/lib/figure-text-sidecar.cjs `keyInkLineCount`, the rule's one owner,
   * which a page script cannot require. server/__tests__/figureCardClientPins.test.js runs this
   * function against the owner over every committed block key, so the two cannot drift silently.
   */
  function figureKeyInkLineCount(key) {
    const segs = String(key).split('|');
    const ink = segs.filter((s) => !(s !== '' && /^ +$/.test(s)));
    return ink.length || segs.length;
  }

  function renderFigureBlock(basename, key, text, warnings) {
    const li = document.createElement('li');
    li.className = 'figure-block';

    const label = document.createElement('code');
    label.className = 'figure-block-key';
    label.textContent = key;

    // §C140 '6' R-5a ([USER] 2026-10-05): a block with two or more source lines is edited in a
    // TEXTAREA, so an editor can type an explicit line break (an LF), which the composer draws as a
    // line of its own. An <input type=text> DELETES an LF and fuses the words around it, so a break
    // typed, pasted or already stored would be lost on the next save. A single-line block keeps the
    // input: it takes no break (the save route refuses one). The variable keeps its name and every
    // data-* hook, so the selectors, the draft code and the save path read either element alike.
    const isMultiline = figureKeyInkLineCount(key) >= 2;
    const input = document.createElement(isMultiline ? 'textarea' : 'input');
    if (isMultiline) {
      input.rows = figureKeyInkLineCount(key);
    } else {
      input.type = 'text'; // a textarea's `type` is read-only, and this IIFE is strict
    }
    input.className = 'figure-block-input';
    input.setAttribute('data-block-input', '');
    input.setAttribute('data-block-key', key);
    // The block key is the English source text, so it is also the field's name.
    input.setAttribute('aria-label', key);
    input.value = text == null ? '' : String(text);
    // Typing marks the block unsaved immediately. The marker is what makes the
    // loss visible instead of silent, and it is also what figSaveDraft reads —
    // so what the card SHOWS as unsaved and what the draft PERSISTS cannot drift.
    const serverText = text == null ? '' : String(text);
    input.addEventListener('input', () => {
      if (input.value === serverText) {
        input.classList.remove('figure-block-unsaved');
        li.removeAttribute('data-block-unsaved');
      } else {
        markFigureBlockUnsaved(input);
      }
    });

    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'btn btn-sm';
    save.setAttribute('data-block-save', '');
    save.textContent = 'Vista';
    save.addEventListener('click', () => saveFigureBlock(basename, key, input.value));

    li.append(label, input, save);

    // Both advisory checks, each rendering ITS OWN field: decimal carries a
    // whole suggested string, caption carries a note about one word.
    //
    // ⑭, [USER]-ruled 2026-09-04: the decimal suggestion is APPLICABLE in one
    // click, and only in one click — never automatically. Icelandic writes the
    // decimal separator as a comma, but it INVERTS the thousands separator too,
    // so a wrong conversion silently changes a number in a chemistry textbook.
    // Offering it keeps a human in the loop and keeps the sidecar a record of
    // what somebody approved.
    //
    // 🔴 The conversion is NEVER computed here. `w.suggested` is the server's
    // string, and the rule's one owner is tools/lib/figure-consistency.cjs.
    for (const w of warnings.decimal) {
      if (w.blockKey !== key) continue;
      li.appendChild(figureWarning(`⚠ Tillaga: ${w.suggested}`));

      const apply = document.createElement('button');
      apply.type = 'button';
      apply.className = 'btn btn-sm figure-block-apply';
      apply.setAttribute('data-block-apply', '');
      apply.textContent = 'Nota';
      apply.setAttribute('aria-label', `Nota tillögu fyrir ${key}`);
      // ⚠️ The suggestion was derived server-side from the SAVED text. If the
      // editor has typed since, applying it would silently discard that typing.
      // Disabling is the honest fix; recomputing the conversion here to cope
      // with the newer value would put a second implementation of the rule in
      // the browser, which is exactly what the comment above forbids. Saving
      // re-fetches and recomputes the suggestion, so the button comes back.
      const syncApplyEnabled = () => {
        apply.disabled = input.value !== w.current;
      };
      syncApplyEnabled();
      input.addEventListener('input', syncApplyEnabled);
      apply.addEventListener('click', () => saveFigureBlock(basename, key, w.suggested));
      li.appendChild(apply);
    }
    // No apply control here on purpose: a caption warning is a note ABOUT a
    // word, not a replacement for the block, so there is nothing to apply.
    for (const w of warnings.caption) {
      if (w.blockKey === key) li.appendChild(figureWarning(`⚠ ${w.figureText}: ${w.note}`));
    }
    // §C140 ㉔ — the joined and per-label MT disagreed; the block holds the joined wording and the
    // per-label one is offered in one click, never automatically ([USER] 2026-09-15). Same guard
    // as the decimal suggestion: the offer was computed from the SAVED text, so typing disables it.
    // A formula/empty fallback carries no `suggested` and renders as a note only.
    for (const w of warnings.mt) {
      if (w.blockKey !== key) continue;
      if (!w.suggested) {
        li.appendChild(
          figureWarning(
            w.reason === 'formula'
              ? '⚠ Samhengisþýðing breytti tölu eða formúlu — stök vélþýðing notuð.'
              : '⚠ Samhengisþýðing skilaði engu — stök vélþýðing notuð.'
          )
        );
        continue;
      }
      li.appendChild(figureWarning(`⚠ Orðalag MT stakra merkinga: ${w.suggested}`));
      const apply = document.createElement('button');
      apply.type = 'button';
      apply.className = 'btn btn-sm figure-block-apply';
      apply.setAttribute('data-block-apply', '');
      apply.textContent = 'Nota';
      apply.setAttribute('aria-label', `Nota orðalag stakra merkinga fyrir ${key}`);
      const syncApplyEnabled = () => {
        apply.disabled = input.value !== w.current;
      };
      syncApplyEnabled();
      input.addEventListener('input', syncApplyEnabled);
      apply.addEventListener('click', () => saveFigureBlock(basename, key, w.suggested));
      li.appendChild(apply);
    }
    return li;
  }

  function renderFigureCard(fig) {
    const basename = fig.basename;
    const card = document.createElement('section');
    card.className = 'figure-card';
    card.setAttribute('data-figure-card', basename);

    const header = document.createElement('header');
    header.className = 'figure-card-header';
    const name = document.createElement('code');
    name.textContent = basename;
    const state = String(fig.effectiveState || '');
    const badge = document.createElement('span');
    badge.className = `figure-state-badge state-${state}`;
    badge.setAttribute('data-figure-state', '');
    badge.textContent = state.toUpperCase();
    header.append(name, badge);
    card.appendChild(header);

    // The picture the text belongs to. Rendered ONLY when the server offered a
    // URL: a figure whose image has not been composed yet gets no element at
    // all, rather than a broken-image icon on a card that is otherwise fine.
    if (fig.imageUrl) {
      const img = document.createElement('img');
      img.className = 'figure-card-image';
      img.setAttribute('data-figure-image', '');
      img.alt = `Þýdd mynd: ${basename}`;
      img.loading = 'lazy';
      // Through the DOM, never innerHTML — the rule this whole card follows.
      img.src = fig.imageUrl;
      card.appendChild(img);
    }

    // Only ever non-null once a review row exists (a flag or an approval note).
    if (fig.note) {
      const note = document.createElement('p');
      note.className = 'figure-note';
      note.setAttribute('data-figure-note', '');
      note.textContent = fig.note;
      card.appendChild(note);
    }

    const warnings = {
      decimal: (fig.warnings && fig.warnings.decimal) || [],
      caption: (fig.warnings && fig.warnings.caption) || [],
      mt: (fig.warnings && fig.warnings.mt) || [],
    };
    // §C140 ㉔ — every label on this figure fell back to its per-label MT, i.e. without the
    // sibling labels' context: the wrong-sense risk the joined arm exists to remove.
    if (fig.warnings && fig.warnings.mtFigure) {
      const figWarn = document.createElement('p');
      figWarn.className = 'figure-warning';
      figWarn.setAttribute('data-figure-mt-warning', '');
      figWarn.textContent = `⚠ ${fig.warnings.mtFigure}`;
      card.appendChild(figWarn);
    }
    const list = document.createElement('ul');
    list.className = 'figure-blocks';
    list.setAttribute('data-figure-blocks', '');
    for (const [key, text] of Object.entries(fig.blocks || {})) {
      list.appendChild(renderFigureBlock(basename, key, text, warnings));
    }
    card.appendChild(list);

    const actions = document.createElement('div');
    actions.className = 'figure-card-actions';
    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.className = 'figure-note-input';
    noteInput.setAttribute('data-figure-note-input', '');
    noteInput.placeholder = 'Athugasemd (valkvæð)';
    noteInput.setAttribute('aria-label', `Athugasemd um mynd ${basename}`);

    const approve = document.createElement('button');
    approve.type = 'button';
    approve.className = 'btn btn-sm btn-primary';
    approve.setAttribute('data-figure-approve', '');
    approve.textContent = 'Samþykkja';
    approve.addEventListener('click', () =>
      setFigureState(basename, { state: 'approved', note: noteInput.value })
    );

    const flag = document.createElement('button');
    flag.type = 'button';
    flag.className = 'btn btn-sm';
    flag.setAttribute('data-figure-flag', '');
    flag.textContent = 'Merkja villu';
    // flagKind is required to be one of the service's enum values when present;
    // 'text' is the kind this card can actually describe.
    flag.addEventListener('click', () =>
      setFigureState(basename, { state: 'flagged', flagKind: 'text', note: noteInput.value })
    );

    actions.append(noteInput, approve, flag);
    card.appendChild(actions);
    return card;
  }

  function figureUrl(basename, leaf) {
    return (
      `${API_BASE}/${currentBook}/${currentChapter}/${currentModuleId}` +
      `/figures/${encodeURIComponent(basename)}/${leaf}`
    );
  }

  async function saveFigureBlock(basename, blockKey, isText) {
    try {
      await fetchJson(figureUrl(basename, 'block'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ blockKey, isText }),
      });
    } catch (err) {
      alert('Ekki tókst að vista myndatexta: ' + err.message);
      return;
    }
    // The route returns {ok:true} and deliberately no state — re-read it.
    // `preserve` is what stops that re-read from destroying text typed into the
    // OTHER blocks; `justSaved` is what stops it from undoing this one.
    await loadFigures(currentModuleId, {
      preserve: true,
      justSaved: { basename, blockKey },
    });
  }

  async function setFigureState(basename, { state, flagKind = null, note = '' }) {
    try {
      await fetchJson(figureUrl(basename, 'state'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ state, flagKind, note: note || null }),
      });
    } catch (err) {
      alert('Ekki tókst að uppfæra stöðu myndar: ' + err.message);
      return;
    }
    // Approving or flagging rebuilds the cards too, so it loses sibling typing
    // by the same mechanism. Every block's live value is still unsaved — this
    // wrote a review state, not a block — but the NOTE was just submitted, so
    // carrying it forward would show it twice and let the next approval send it
    // again.
    await loadFigures(currentModuleId, { preserve: true, justSaved: { basename, note: true } });
  }

  // Insert a repetition suggestion into a segment's edit box (still saved
  // through the normal QA path — no silent auto-apply). It replaces the whole
  // text, so a kept text asks first and, replaced, takes its notice, its block
  // and its draft entry with it (PR1 review C10).
  function insertRepetition(segmentId) {
    const rep = repetitionData?.[segmentId];
    if (!rep?.suggestion) return;
    // It replaces the pane's whole text: a kept text asks its own question, any other changed text asks
    // discardChanges (interface audit ED-18; it used to ask only about a kept text).
    if (!confirmDiscard(segmentId)) return;
    const discardsKept = Boolean(paneState.get(segmentId)?.refused) || heldDrafts.has(segmentId);
    openEditPanel(segmentId);
    const ta = document.getElementById('textarea-' + cssId(segmentId));
    if (ta) {
      if (discardsKept) clearPaneState(segmentId); // the pane starts afresh, as Endurstilla leaves it
      ta.value = rep.suggestion.is_text;
      addAssist(
        segmentId,
        segmentSaveState.assistItem('repetition-insert', 'tm', Date.now(), {
          text: ta.value, // the whole text right after the item (§5.10)
          book: rep.suggestion.book,
          chapter: rep.suggestion.chapter,
          moduleId: rep.suggestion.module_id,
        })
      );
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.focus();
      if (discardsKept) saveDraft(); // the draft holds the new text now, not the kept one (PR1 review C12)
    }
  }

  // ================================================================
  // CONCORDANCE SEARCH ("how did we translate this before?")
  // ================================================================
  function highlightQuery(text, q) {
    const escaped = escapeHtml(text);
    if (!q) return escaped;
    // Highlight the (escaped) query as a literal, case-insensitively.
    const needle = escapeHtml(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      return escaped.replace(new RegExp(needle, 'gi'), (m) => `<mark>${m}</mark>`);
    } catch {
      return escaped;
    }
  }

  async function searchConcordance() {
    const input = document.getElementById('concordance-q');
    const resultsEl = document.getElementById('concordance-results');
    if (!input || !resultsEl) return;
    const q = input.value.trim();
    if (q.length < 2) {
      resultsEl.innerHTML = '<div class="text-muted">Sláðu inn a.m.k. 2 stafi.</div>';
      return;
    }
    if (!currentBook) return;
    resultsEl.innerHTML = '<div class="text-muted">Leita…</div>';
    try {
      const data = await fetchJson(
        `${API_BASE}/concordance?q=${encodeURIComponent(q)}&book=${encodeURIComponent(currentBook)}`,
        { credentials: 'include' }
      );
      const results = data.results || [];
      if (!results.length) {
        resultsEl.innerHTML = '<div class="text-muted">Engar fyrri þýðingar fundust.</div>';
        return;
      }
      resultsEl.innerHTML = results
        .map((r) => {
          const provChapter =
            Number(r.chapter) === -1 ? 'Viðaukar' : `kafli ${escapeHtml(String(r.chapter))}`;
          const prov = `${escapeHtml(r.module_id)} · ${provChapter}`;
          const href =
            `/segment-editor?book=${encodeURIComponent(r.book)}` +
            `&chapter=${encodeURIComponent(r.chapter)}&module=${encodeURIComponent(r.module_id)}`;
          return `
          <div class="concordance-hit">
            <div class="concordance-en">${highlightQuery(r.en_text, q)}</div>
            <div class="concordance-is">${highlightQuery(r.is_text, q)}</div>
            <a class="concordance-prov" href="${href}" target="_blank" rel="noopener">${prov} &#8599;</a>
          </div>`;
        })
        .join('');
    } catch (err) {
      resultsEl.innerHTML = `<div class="text-muted">Leit mistókst: ${escapeHtml(err.message || '')}</div>`;
    }
  }

  // ================================================================
  // REVIEW SUMMARY (head-editor): terminology violations + proofreading
  // ================================================================
  function showReviewSummary() {
    const isHeadEditor = ['head-editor', 'admin'].includes(getEffectiveRole());
    const panel = document.getElementById('review-summary-panel');
    if (!panel) return;
    panel.style.display = isHeadEditor ? 'block' : 'none';
    const spellEl = document.getElementById('review-summary-spell');
    if (spellEl) spellEl.innerHTML = '';
    if (isHeadEditor) loadTerminologyReport();
  }

  /** Most ids to list per violation before collapsing the rest into a count. */
  const TERM_JUMP_LIMIT = 8;

  async function loadTerminologyReport() {
    const el = document.getElementById('review-summary-terms');
    if (!el || !currentModuleId) return;
    const requestedModule = currentModuleId; // capture at call time
    try {
      const data = await fetchJson(
        `${API_BASE}/${currentBook}/${currentChapter}/${requestedModule}/terminology-report`,
        { credentials: 'include' }
      );
      // Stale: the editor switched modules while this was in flight. The two
      // sibling fetches already guard this; before the ids were rendered it only
      // meant stale text, but they are controls now and would move ANOTHER
      // module's cursor and filters.
      if (currentModuleId !== requestedModule) return;
      const violations = data.violations || [];
      if (!violations.length) {
        el.innerHTML = '<div class="text-muted">Engin hugtakafrávik.</div>';
        return;
      }
      el.innerHTML =
        '<div class="rs-label">Hugtakafrávik</div>' +
        violations
          .map((v) => {
            // U2: buildModuleTerminologyReport has always returned `segments` per
            // violation and this panel always dropped it, so a head editor was told
            // a term was wrong N times with no way to reach the N. Rendering them
            // uses the same .rs-seg shape as the spellcheck and repetition reports.
            // Capped: chemistry measures ~2.8 terminology issues per segment and
            // biology 4.8, so an uncapped list is hundreds of focusable buttons
            // sitting ahead of the filter bar and the table in tab order.
            const all = v.segments || [];
            const shown = all.slice(0, TERM_JUMP_LIMIT);
            const rest = all.length - shown.length;
            const segs =
              shown
                .map((segId) => {
                  const shortId = escapeHtml(segId.split(':').slice(1).join(':'));
                  return `<button type="button" class="rs-jump" data-seg="${escapeHtml(segId)}" title="Fara í þennan bút">${shortId}</button>`;
                })
                .join(' ') + (rest > 0 ? ` <span class="rs-count">+${rest}</span>` : '');
            return (
              `<div class="rs-term">„${escapeHtml(v.english)}“ &#8594; „${escapeHtml(v.expected)}“ <span class="rs-count">(${v.count})</span></div>` +
              (segs ? `<div class="rs-seg">${segs}</div>` : '')
            );
          })
          .join('');
      el.querySelectorAll('.rs-jump').forEach((btn) =>
        btn.addEventListener('click', () => jumpToSegment(btn.dataset.seg))
      );
    } catch {
      el.innerHTML = '';
    }
  }

  async function runSpellcheck() {
    const el = document.getElementById('review-summary-spell');
    if (!el || !currentModuleId) return;
    el.innerHTML = '<div class="text-muted">Yfirles…</div>';
    try {
      const data = await fetchJson(
        `${API_BASE}/${currentBook}/${currentChapter}/${currentModuleId}/spellcheck`,
        { credentials: 'include' }
      );
      if (!data.enabled) {
        el.innerHTML =
          '<div class="text-muted">Yfirlestur er ekki virkur (GREYNIR_URL vantar á þjóni).</div>';
        return;
      }
      const segs = data.segments || [];
      if (!segs.length) {
        el.innerHTML =
          '<div class="rs-label">Yfirlestur</div><div class="text-muted">Engar ábendingar.</div>';
        return;
      }
      el.innerHTML =
        '<div class="rs-label">Yfirlestur</div>' +
        segs
          .map((s) => {
            const shortId = escapeHtml(s.segmentId.split(':').slice(1).join(':'));
            const msgs = s.findings.map((f) => escapeHtml(f.message)).join('; ');
            return `<div class="rs-seg"><code>${shortId}</code>: ${msgs}</div>`;
          })
          .join('');
    } catch (err) {
      el.innerHTML = `<div class="text-muted">Yfirlestur mistókst: ${escapeHtml(err.message || '')}</div>`;
    }
  }

  async function runRepetitionReport() {
    const el = document.getElementById('review-summary-repetition');
    if (!el) return;
    el.innerHTML = '<div class="text-muted">Sæki endurtekningar…</div>';
    try {
      const data = await fetchJson(
        `${API_BASE}/${currentBook}/${currentChapter}/repetition-report`,
        { credentials: 'include' }
      );
      const report = data.report || [];
      if (!report.length) {
        el.innerHTML =
          '<div class="rs-label">Endurtekningar</div><div class="text-muted">Engar endurteknar setningar.</div>';
        return;
      }
      el.innerHTML =
        '<div class="rs-label">Endurtekningar í kafla</div>' +
        report
          .map((r) => {
            const mark = r.agree ? '&#10003;' : '&#9888;';
            const cls = r.agree ? 'rs-agree' : 'rs-disagree';
            const snippet = r.en_text.length > 90 ? r.en_text.slice(0, 90) + '…' : r.en_text;
            const extra = r.agree ? '' : ', ' + r.distinctTranslations + ' þýðingar';
            return `<div class="rs-seg"><span class="${cls}">${mark}</span> ${escapeHtml(snippet)} <span class="rs-count">(&times;${r.count}${extra})</span></div>`;
          })
          .join('');
    } catch (err) {
      el.innerHTML = `<div class="text-muted">Mistókst: ${escapeHtml(err.message || '')}</div>`;
    }
  }

  // ================================================================
  // RENDER MODULE
  // ================================================================
  function renderModule() {
    // Editor-facing header speaks the human title; the pipeline module id is a
    // muted tag shown only to head-editors/admins (de-jargon, audit 4.3).
    const isHeadEditorView = ['head-editor', 'admin'].includes(getEffectiveRole());
    const titleEl = document.getElementById('module-title');
    titleEl.textContent = moduleData.titleIs || moduleData.title || moduleData.moduleId;
    if (isHeadEditorView && (moduleData.titleIs || moduleData.title)) {
      const idTag = document.createElement('span');
      idTag.textContent = moduleData.moduleId;
      idTag.style.cssText =
        'margin-left:0.5rem;font-size:var(--text-xs);color:var(--text-muted);font-weight:400;';
      titleEl.appendChild(idTag);
    }
    const sourceLabels = UI.sourceLabels;
    const sourceLabel = sourceLabels[moduleData.isSource] || moduleData.isSource || 'engin';
    const metaEl = document.getElementById('module-meta');
    const missing = moduleData.segmentCount - moduleData.translatedCount;
    let metaText =
      `${moduleData.chapter === -1 ? 'Viðaukar' : 'Kafli ' + moduleData.chapter} · ${moduleData.segmentCount} bútar · ` +
      `${moduleData.translatedCount} þýddar · Heimild: ${sourceLabel}`;
    if (missing > 0) {
      metaText += ` · ${missing} óþýdd(ar)`;
    }
    metaEl.innerHTML =
      missing > 0
        ? metaText.replace(
            `${missing} óþýdd(ar)`,
            `<span style="color: var(--warning); font-weight: 600;">${missing} óþýdd(ar)</span>`
          )
        : metaText;
    metaEl.title = UI.tooltips.sourceTypes;

    // Update topbar breadcrumb — human title, not the pipeline module id
    const topbarTitle = document.getElementById('topbar-title');
    if (topbarTitle) {
      topbarTitle.textContent =
        moduleData.titleIs ||
        moduleData.title ||
        (moduleData.chapter === -1 ? 'Viðaukar' : 'Kafli ' + moduleData.chapter);
    }

    renderStats();
    renderProgress();
    renderSegments();
  }

  function renderProgress() {
    const progressEl = document.getElementById('module-progress');
    const textEl = document.getElementById('module-progress-text');
    const fillEl = document.getElementById('module-progress-fill');
    if (!progressEl || !moduleData) return;

    const total = moduleData.segmentCount || moduleData.segments?.length || 0;
    if (total === 0) {
      progressEl.style.display = 'none';
      return;
    }

    // Count segments that have at least one edit (any status) OR an active
    // acceptance (item 20b: edits ∪ acceptances drive the progress bar)
    let editedCount = 0;
    for (const seg of moduleData.segments) {
      const edits = moduleData.edits[seg.segmentId] || [];
      if (edits.length > 0 || moduleData.acceptances?.[seg.segmentId]) {
        editedCount++;
      }
    }

    const pct = Math.round((editedCount / total) * 100);
    textEl.textContent = UI.segmentEditor.progress(editedCount, total);
    fillEl.style.width = pct + '%';

    // Color the bar based on completion
    if (pct === 100) {
      fillEl.style.background = 'var(--success)';
    } else if (pct > 0) {
      fillEl.style.background = 'var(--accent)';
    }

    progressEl.style.display = 'block';
  }

  function renderStats() {
    const s = moduleData.stats || {};
    const bar = document.getElementById('stats-bar');

    // Count term matches and issues
    let termMatchCount = 0;
    let termIssueCount = 0;
    if (termData) {
      for (const segId of Object.keys(termData)) {
        termMatchCount += (termData[segId].matches || []).length;
        termIssueCount += (termData[segId].issues || []).length;
      }
    }

    const chipVal = (n) => (n > 0 ? ' has-value' : '');

    bar.innerHTML = `
        <div class="stat-chip${chipVal(s.total_edits)}"><strong>${s.total_edits || 0}</strong> breytingar</div>
        <div class="stat-chip${chipVal(s.pending)}"><strong>${s.pending || 0}</strong> bíða</div>
        <div class="stat-chip${chipVal(s.approved)}"><strong>${s.approved || 0}</strong> samþykkt</div>
        <div class="stat-chip${chipVal(s.accepted)}"><strong>${s.accepted || 0}</strong> staðfest</div>
        <div class="stat-chip${chipVal(s.rejected)}"><strong>${s.rejected || 0}</strong> hafnað</div>
        <div class="stat-chip${chipVal(s.discuss)}"><strong>${s.discuss || 0}</strong> umræða</div>
        ${
          termData
            ? `
          <div class="stat-chip terms"><strong>${termMatchCount}</strong> hugtök</div>
          ${termIssueCount > 0 ? `<div class="stat-chip term-issues"><strong>${termIssueCount}</strong> hugtakavandamál</div>` : ''}
        `
            : ''
        }
      `;
  }

  /**
   * The rows whose pane holds unsaved text that is not a refused save's kept text, by segment id. A re-render
   * never rebuilds them (interface audit 2026-11-13, ED-03): renderSegments used to ask closePanels, up to three
   * times after one save, and OK closed every pane and lost its text. A kept text is not in this set: its pane is
   * carried by re-install on the rebuilt row (index decision 12), because the row values its save was refused on
   * are the stale ones.
   */
  function liveRows() {
    const rows = new Map();
    for (const segId of dirtyEdits) {
      const st = paneState.get(segId);
      if ((st && st.refused) || heldDrafts.has(segId)) continue;
      const tr = rowElement(segId);
      const panel = tr && tr.querySelector('.edit-panel.active');
      if (panel) rows.set(segId, tr);
    }
    return rows;
  }

  /** The module's segments the three filters let through, in module order. */
  function filteredSegments() {
    const filterType = document.getElementById('filter-type').value;
    const filterCat = document.getElementById('filter-category').value;
    const filterStatus = document.getElementById('filter-status').value;

    let segments = moduleData.segments;

    // Apply type filters
    if (filterType === 'edited') {
      segments = segments.filter((s) => moduleData.edits[s.segmentId]?.length > 0);
    } else if (filterType === 'pending') {
      segments = segments.filter((s) => {
        const edits = moduleData.edits[s.segmentId] || [];
        return edits.some((e) => e.status === 'pending');
      });
    } else if (filterType === 'term-issues') {
      segments = segments.filter((s) => {
        const td = termData?.[s.segmentId];
        return td && td.issues && td.issues.length > 0;
      });
    } else if (filterType !== 'all') {
      segments = segments.filter((s) => s.segmentType === filterType);
    }

    if (filterCat !== 'all') {
      segments = segments.filter((s) => {
        const edits = moduleData.edits[s.segmentId] || [];
        return edits.some((e) => e.category === filterCat);
      });
    }

    // Apply status filter
    if (filterStatus !== 'all') {
      segments = segments.filter((s) => {
        const edits = moduleData.edits[s.segmentId] || [];
        const latestEdit = edits[0];
        if (filterStatus === 'accepted') {
          return !!moduleData.acceptances?.[s.segmentId];
        }
        if (filterStatus === 'unhandled') {
          // MTA-R3: the shared backlog predicate, so the facet can no longer
          // disagree with the button (it used to omit hasTranslation, and to
          // exclude every contested row the button now offers).
          return isUnreviewedBacklog(s);
        }
        if (filterStatus === 'unedited') {
          return !latestEdit;
        }
        return latestEdit && latestEdit.status === filterStatus;
      });
    }
    return segments;
  }

  /**
   * Rebuild the table from moduleData. It asks nothing and loses no text (ED-03): a row whose pane holds unsaved
   * text stays in the page exactly as it is (liveRows), never detached, so its text, caret, category and note
   * survive, and every other row is rebuilt around it. Such a row keeps the values it was rendered with (the base,
   * the displayed pair), which are the ones its text was typed against and the ones its save echoes (§5.18): if
   * they are no longer current the server refuses the save and the text is kept. It also stays on screen when the
   * filters would hide it. A live row is marked, and rebuilt once its text is saved (the reload) or discarded
   * (rebuildSkippedRow). Always returns true; the return value is kept for jumpToSegment, which used to roll back
   * a declined render.
   */
  function renderSegments() {
    // Whoever is typing keeps the focus and the caret: a kept pane re-installed below must not take them.
    const focused = document.activeElement;
    const caret =
      focused && typeof focused.selectionStart === 'number'
        ? [focused.selectionStart, focused.selectionEnd, focused.scrollTop]
        : null;
    // Which control of which row holds the focus, for a row that is rebuilt under it: a kept pane's row is
    // rebuilt at every render, so the element itself goes and the same control of the re-installed pane takes over.
    const focusedRow =
      focused && typeof focused.closest === 'function'
        ? focused.closest('#segments-body tr')
        : null;
    const focusedSeg = focusedRow ? focusedRow.getAttribute('data-segment-id') : null;
    const focusedKind =
      focusedRow && focused.id
        ? ['textarea-', 'note-', 'cat-'].find((prefix) => focused.id.startsWith(prefix)) || null
        : null;
    // A text waiting in the hold whose pane is still open (its refusal's reload is on its way): what the box
    // holds now is the text, and its category and note come along.
    for (const [segId, held] of heldDrafts) {
      const ta = held.rereadBox ? openBox(segId) : null;
      if (!ta) continue;
      held.entry = Object.assign({}, held.entry, { text: ta.value });
      held.fields = paneFields(segId);
    }
    const live = liveRows();
    for (const [segId, entry] of Object.entries(keptPaneEntries())) {
      if (!heldDrafts.has(segId)) {
        heldDrafts.set(segId, { entry, addRestoreItem: false, fields: paneFields(segId) });
      }
    }
    // Every other pane closes with its row: it holds no unsaved text (a kept one is in the hold above).
    for (const segId of [...dirtyEdits]) if (!live.has(segId)) dirtyEdits.delete(segId);
    for (const segId of [...paneState.keys()]) if (!live.has(segId)) paneState.delete(segId);
    // O4: Clear stale DOM reference
    if (!(lastFocusedTextarea && live.has(lastFocusedTextarea._segmentId))) {
      lastFocusedTextarea = null;
    }
    updateSaveStatusBar();

    const tbody = document.getElementById('segments-body');
    // A row with unsaved text, and the row of a text waiting in the hold, are on screen whatever the filters say:
    // the first is not touched at all, the second is rebuilt so its text has a pane to come back to.
    const passes = new Set(filteredSegments());
    const segments = moduleData.segments.filter(
      (seg) => passes.has(seg) || live.has(seg.segmentId) || heldDrafts.has(seg.segmentId)
    );
    if (live.size === 0) {
      tbody.innerHTML = segments.map((seg) => renderSegmentRow(seg)).join('');
    } else {
      const kept = new Set(live.values());
      for (const node of [...tbody.childNodes]) if (!kept.has(node)) node.remove();
      let html = '';
      const flushBefore = (node) => {
        if (!html) return;
        const tpl = document.createElement('template');
        tpl.innerHTML = html;
        tbody.insertBefore(tpl.content, node);
        html = '';
      };
      const placed = new Set();
      for (const seg of segments) {
        const tr = live.get(seg.segmentId);
        if (tr && !placed.has(tr)) {
          placed.add(tr);
          tr.setAttribute('data-render-skipped', '');
          flushBefore(tr);
        } else {
          html += renderSegmentRow(seg);
        }
      }
      flushBefore(null);
    }
    reinstallHeldDrafts();
    let refocus = focused && focused.isConnected ? focused : null;
    if (!refocus && focusedSeg && focusedKind) {
      const again = document.getElementById(focusedKind + cssId(focusedSeg));
      if (again && again.closest('.edit-panel.active')) refocus = again;
    }
    if (refocus && document.activeElement !== refocus) {
      refocus.focus({ preventScroll: true });
      if (caret && typeof refocus.setSelectionRange === 'function') {
        refocus.setSelectionRange(caret[0], caret[1]);
        refocus.scrollTop = caret[2];
      }
    }
    pauseSuggestionButtons(); // every row may have moved, often with no click (an opening's term reload)
    return true;
  }

  /**
   * A live row that a re-render skipped is older than moduleData. Once its text is discarded, rebuild it from
   * moduleData (or drop it, if the filters hide it and its pane has closed). Returns whether it did; a row no
   * re-render skipped is left alone.
   */
  function rebuildSkippedRow(segmentId, { keep = false } = {}) {
    const tr = rowElement(segmentId);
    if (!tr || !tr.hasAttribute('data-render-skipped') || !moduleData) return false;
    const seg = moduleData.segments.find((s) => s.segmentId === segmentId);
    // `keep`: the pane stays open (Endurstilla), so the row stays too, whatever the filters say.
    if (!seg || (!keep && !filteredSegments().includes(seg))) {
      tr.remove();
      return true;
    }
    const tpl = document.createElement('template');
    tpl.innerHTML = renderSegmentRow(seg);
    tr.replaceWith(tpl.content);
    // Kept on screen although the filters hide it: still marked, so it goes when its pane closes.
    if (keep && !filteredSegments().includes(seg)) {
      const again = rowElement(segmentId);
      if (again) again.setAttribute('data-render-skipped', '');
    }
    return true;
  }

  /**
   * The IS text an editor should SEE and EDIT for a segment: the faithful file,
   * unless an edit is still in flight (MTA-R12).
   *
   * One rule, shared by the row renderer and the three textarea
   * restore paths (cancel, "Til baka", Escape-close), which had drifted into
   * three different answers: two restored ANY latest edit's text (so cancelling
   * on a rejected row replaced the baseline with the rejected text the row had
   * never shown) and one counted applied edits as active.
   */
  function baselineTextFor(seg, latestEdit) {
    return acceptEligibility.isEditInFlight(latestEdit) ? latestEdit.edited_content : seg.is;
  }

  // ================================================================
  // AI TERM SUGGESTIONS (G1.23, spec §4 and §7)
  // ================================================================
  // The server serves `seg.suggestions` = { groups, tagged } only on segments that have a group or a tag; every
  // other row renders exactly as before. Placement and the fail-closed drawing are suggestion-placement.js
  // (drawSuggestions); what follows builds the HTML and wires the row, the pane and the save.

  /**
   * Whether this editor may edit a segment whose newest edit is `latestEdit`: the row's Breyta rule (its cases are
   * listed where renderSegmentRow calls it). One predicate, so the suggestion controls appear exactly where the row
   * offers editing (spec §7: anyone who can edit the segment can accept or reject).
   */
  function segmentEditAllowed(latestEdit) {
    const isPublished = !!(latestEdit && latestEdit.status === 'approved' && latestEdit.applied_at);
    return (
      !latestEdit ||
      latestEdit.status === 'rejected' ||
      latestEdit.status === 'discuss' ||
      latestEdit.status === 'superseded' ||
      (latestEdit.status === 'pending' && latestEdit.editor_username === userName) ||
      (latestEdit.status === 'approved' &&
        !latestEdit.applied_at &&
        latestEdit.editor_username === userName) ||
      isPublished
    );
  }

  /** The served segment, only if it has suggestions; null otherwise. */
  function suggestionSegment(segmentId) {
    const seg = moduleData?.segments?.find((s) => s.segmentId === segmentId);
    return seg && seg.suggestions ? seg : null;
  }

  /** Every change a segment's suggestions name, by opId (its groups' and its tagged), for acceptedFromAssists. */
  function suggestionChangesByOpId(seg) {
    const out = new Map();
    const sugg = seg && seg.suggestions;
    if (!sugg) return out;
    for (const g of sugg.groups || []) for (const c of g.changes || []) out.set(c.opId, c);
    for (const c of sugg.tagged || []) if (!out.has(c.opId)) out.set(c.opId, c);
    return out;
  }

  /** What a row with suggestions displays (R13): the open pane's text, else the baseline. */
  function shownSuggestionText(seg) {
    const panel = document.getElementById('edit-' + cssId(seg.segmentId));
    const ta = document.getElementById('textarea-' + cssId(seg.segmentId));
    if (panel && ta && panel.classList.contains('active')) return { open: true, text: ta.value };
    const latestEdit = moduleData.edits[seg.segmentId]?.[0];
    return { open: false, text: baselineTextFor(seg, latestEdit) };
  }

  /** A pane's live preview: the suggestions drawn without controls on a row that has them (R13), else as before. */
  function panePreviewHtml(segmentId, text) {
    const seg = suggestionSegment(segmentId);
    return seg
      ? suggestionDisplay(seg, text, paneAssists(segmentId), { controls: false }).html
      : renderMarkdownPreview(text);
  }

  function suggestionTagHtml() {
    return `<span class="sugg-tag" title="${escapeHtml(UI.suggestions.tagTitle)}">${escapeHtml(UI.suggestions.tag)}</span>`;
  }

  /**
   * A group's accept button. The key travels in an escaped data attribute and reaches the handler as
   * this.dataset.groupKey: a key holds '#', '|' and ':', so it is never written into the onclick itself (R14). The
   * segment id is read from the row the button sits in, so the row stays the one element carrying data-segment-id.
   * `named`: the one-change button, named by aria-label (and title) rather than by its visible text (R20).
   */
  function suggestionAcceptButton(group, label, named) {
    const name = named
      ? ` title="${escapeHtml(UI.suggestions.notaTitle)}" aria-label="${escapeHtml(UI.suggestions.notaTitle)}"`
      : '';
    return `<button type="button" class="sugg-btn sugg-nota" data-group-key="${escapeHtml(group.key)}"${name} onclick="acceptSuggestionGroup(this.closest('tr').dataset.segmentId, this.dataset.groupKey)">${escapeHtml(label)}</button>`;
  }

  /**
   * A group's reject button (Hafna), drawn exactly where Nota is drawn and by the same mechanism: an escaped
   * data-group-key, read as this.dataset.groupKey. The one-change button is named "Hafna tillögu" by aria-label and
   * title (R20), distinct from the head editor's own Hafna.
   */
  function suggestionRejectButton(group, label, named) {
    const name = named
      ? ` title="${escapeHtml(UI.suggestions.hafnaTitle)}" aria-label="${escapeHtml(UI.suggestions.hafnaTitle)}"`
      : '';
    return `<button type="button" class="sugg-btn sugg-hafna" data-group-key="${escapeHtml(group.key)}"${name} onclick="rejectSuggestionGroup(this.closest('tr').dataset.segmentId, this.dataset.groupKey)">${escapeHtml(label)}</button>`;
  }

  /**
   * One change of an offered group, drawn on its word: the old word struck through, the new word, the GG tag; then
   * the group's number (two or more changes) or, with controls, its accept button (one change). No whitespace
   * between tags: the display is white-space: pre-wrap. `innerHtml` is the renderer's own escaped text.
   */
  function suggestionSwapHtml(offer, changeIndex, innerHtml, controls) {
    const group = offer.group;
    const change = group.changes[changeIndex];
    let after = suggestionTagHtml();
    if (group.changes.length > 1) after += `<sup class="sugg-num">${offer.number}</sup>`;
    else if (controls) {
      after += suggestionAcceptButton(group, UI.suggestions.nota, true);
      after += suggestionRejectButton(group, UI.suggestions.hafna, true);
    }
    return `<span class="sugg-swap" data-group-key="${escapeHtml(group.key)}"><del class="sugg-old">${innerHtml}</del><ins class="sugg-new">${escapeHtml(change.replace)}</ins>${after}</span>`;
  }

  /** One ruling line below the text: number, `en → is`, the change count, and (controls) a multi-change button. */
  function suggestionRulingHtml(offer, controls) {
    const group = offer.group;
    const n = group.changes.length;
    const label = group.label || {};
    let buttons = '';
    if (controls && n > 1) {
      const text = n === 2 ? UI.suggestions.notaBadar : UI.suggestions.notaAllar(n);
      buttons = suggestionAcceptButton(group, text, false);
      const rejectText = n === 2 ? UI.suggestions.hafnaBadum : UI.suggestions.hafnaOllum(n);
      buttons += suggestionRejectButton(group, rejectText, false);
    }
    return `<div class="sugg-ruling" data-group-key="${escapeHtml(group.key)}"><span class="sugg-num">${offer.number}</span><span class="sugg-label">${escapeHtml(label.en || group.rulingId)} → ${escapeHtml(label.is || '')}</span><span class="sugg-count">(${n})</span>${buttons}</div>`;
  }

  // ---- The double-click guard (spec ✏️ AMENDED 2026-11-11; register §C216) ----
  // Nota and Hafna redraw the page, so a second click can land on whatever moved under the pointer, and a wrong
  // reject can be neither undone on screen nor told apart from a deliberate one in the records. Every suggestion
  // button therefore ignores a click within SUGGESTION_PAUSE_MS of a click on any control, or of a redraw the editor
  // did not click for: Hafna's answer, renderSegments, and a pane closing (Escape, or closeEditPanel, which Ctrl+S
  // reaches with no click). Typing redraws do not pause.

  /** Windows' default double-click time. Changing it changes the measured task: a register entry and a spec amendment. */
  const SUGGESTION_PAUSE_MS = 500;
  /** A click on one of these starts the pause; a click in the text (a textarea, plain words) does not. */
  const PAUSING_CONTROLS = 'button, a[href], [onclick], [role="button"]';
  let suggestionPauseUntil = 0;
  let suggestionPauseTimer = null;

  /**
   * Start, or restart, the pause. <html> carries data-sugg-paused meanwhile, which dims the buttons (never
   * click-through: a click passing to what lies beneath would be the defect again). The marker is cleared only once
   * the time has passed, so a button that is not dimmed always takes its click.
   */
  function pauseSuggestionButtons() {
    suggestionPauseUntil = performance.now() + SUGGESTION_PAUSE_MS;
    document.documentElement.setAttribute('data-sugg-paused', '');
    if (suggestionPauseTimer === null) {
      suggestionPauseTimer = setTimeout(endSuggestionPause, SUGGESTION_PAUSE_MS);
    }
  }

  /** The pause's timer: a restart moved the end, so it waits again until the end has passed. */
  function endSuggestionPause() {
    const left = suggestionPauseUntil - performance.now();
    if (left > 0) {
      suggestionPauseTimer = setTimeout(endSuggestionPause, left);
      return;
    }
    suggestionPauseTimer = null;
    document.documentElement.removeAttribute('data-sugg-paused');
  }

  // In the capture phase on document, so it runs before a button's own onclick: a swallowed click reaches no handler,
  // sends nothing and records nothing. It restarts the pause, so a quick third click is swallowed too. Mouse and
  // keyboard alike (Enter on a focused button is a click).
  document.addEventListener(
    'click',
    (e) => {
      const control = e.target instanceof Element ? e.target.closest(PAUSING_CONTROLS) : null;
      if (!control) return;
      if (control.classList.contains('sugg-btn') && performance.now() < suggestionPauseUntil) {
        e.stopPropagation();
        e.preventDefault();
      }
      pauseSuggestionButtons();
    },
    true
  );

  /** Groups whose reject request is in flight ("segmentId|groupKey"), so a double click sends one request. */
  const rejectsInFlight = new Set();

  /**
   * Hafna (spec §4): close one suggestion group for good. Posts to the reject route; on success, or when the server
   * says the group is not in its kept log (404 SUGGESTION_UNKNOWN: it is already gone), the group leaves
   * moduleData's suggestions.groups and the row is redrawn in place. Any other failure (a missing module is a 404
   * too, with another error) alerts and changes nothing. It never reloads, re-renders the table, writes a textarea
   * or closes a pane. seg.suggestions itself is never deleted: refreshSuggestionView must still draw the row plain.
   */
  async function rejectSuggestionGroup(segmentId, groupKey) {
    const seg = suggestionSegment(segmentId);
    const group = seg ? (seg.suggestions.groups || []).find((g) => g.key === groupKey) : null;
    if (!group || !segmentEditAllowed(moduleData.edits[segmentId]?.[0])) return;
    const inFlightKey = segmentId + '|' + groupKey;
    if (rejectsInFlight.has(inFlightKey)) return;
    rejectsInFlight.add(inFlightKey);
    const row = rowValues(segmentId);
    const body = {
      segmentId,
      occurrence: row ? row.occurrence : null,
      groupKey,
      groupActionId: segmentSaveState.newClientActionId(window.crypto),
      clientActionId: segmentSaveState.newClientActionId(window.crypto),
      clientActionTime: Date.now(),
    };
    if (row && row.baseSha256) body.baseSha256 = row.baseSha256;
    try {
      try {
        await fetchJson(
          `${API_BASE}/${currentBook}/${currentChapter}/${currentModuleId}/suggestions/reject`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body),
          }
        );
      } catch (err) {
        const unknownGroup =
          err && err.status === 404 && err.data && err.data.error === 'SUGGESTION_UNKNOWN';
        if (!unknownGroup) {
          alert(UI.suggestions.rejectFailed);
          return;
        }
      }
      const current = suggestionSegment(segmentId);
      if (current) {
        current.suggestions.groups = (current.suggestions.groups || []).filter(
          (g) => g.key !== groupKey
        );
      }
      refreshSuggestionView(segmentId);
      pauseSuggestionButtons(); // the row moved when the server answered, not when the editor clicked
    } finally {
      rejectsInFlight.delete(inFlightKey);
    }
  }

  /**
   * A row's IS display with its suggestions drawn (spec §4, R13, R14), and its ruling lines.
   * A segment without `suggestions` gets exactly today's output: renderMarkdownPreview(text) and no ruling lines.
   * Groups accepted in the pane (its ai-suggestion items) are not offered again and their words carry the GG tag.
   * @param {object} seg a served segment
   * @param {string} text the displayed text
   * @param {Array<object>} assists the open pane's assist items ([] when no pane is open)
   * @param {{controls?: boolean}} [opts] controls false draws no buttons: the pane preview (R13), whose caller
   *   ignores the ruling lines, and a row this editor may not edit (segmentEditAllowed)
   * @returns {{html: string, rulingsHtml: string}}
   */
  function suggestionDisplay(seg, text, assists, { controls = true } = {}) {
    if (!seg || !seg.suggestions) return { html: renderMarkdownPreview(text), rulingsHtml: '' };
    const paneAccepted = (assists || [])
      .filter((it) => it && it.itemType === 'ai-suggestion')
      .map((it) => it.opId);
    const drawn = suggestionPlacement.drawSuggestions(text, seg.suggestions, paneAccepted, {
      render: renderMarkdownPreview,
      swap: (offer, changeIndex, innerHtml) =>
        suggestionSwapHtml(offer, changeIndex, innerHtml, controls),
      tag: (change, innerHtml) =>
        `<span class="sugg-accepted">${innerHtml}</span>${suggestionTagHtml()}`,
    });
    return {
      html: drawn.html,
      rulingsHtml: drawn.offered.map((offer) => suggestionRulingHtml(offer, controls)).join(''),
    };
  }

  /**
   * Redraw one row's suggestions in place (R11): its IS display, its ruling lines and, while its pane is open, the
   * preview. It never writes the textarea and never closes the pane. A row without suggestions is left alone.
   */
  function refreshSuggestionView(segmentId) {
    const seg = suggestionSegment(segmentId);
    if (!seg) return;
    const shown = shownSuggestionText(seg);
    const controls = segmentEditAllowed(moduleData.edits[segmentId]?.[0]);
    const view = suggestionDisplay(seg, shown.text, shown.open ? paneAssists(segmentId) : [], {
      controls,
    });
    const isEl = document.getElementById('is-' + cssId(segmentId));
    if (isEl) isEl.innerHTML = view.html || '<em class="text-muted">Engin þýðing</em>';
    const rulingsEl = document.getElementById('sugg-' + cssId(segmentId));
    if (rulingsEl) rulingsEl.innerHTML = view.rulingsHtml;
    if (!shown.open) return;
    const previewEl = document.getElementById('preview-' + cssId(segmentId));
    if (previewEl) previewEl.innerHTML = panePreviewHtml(segmentId, shown.text);
  }

  /**
   * Nota (spec §4, §7): write one group's changes into the pane's pending text, on the screen only. A closed pane
   * opens first, as insertRepetition opens it. A group that no longer applies to the pane's text changes nothing.
   * Each change becomes an ai-suggestion assist item; the server hears of the accept only at Vista, through
   * acceptedFromAssists, so Hætta við forgets it like any unsaved change.
   */
  function acceptSuggestionGroup(segmentId, groupKey) {
    const seg = suggestionSegment(segmentId);
    const group = seg ? (seg.suggestions.groups || []).find((g) => g.key === groupKey) : null;
    if (!group || !segmentEditAllowed(moduleData.edits[segmentId]?.[0])) return;
    if (!shownSuggestionText(seg).open) {
      if (!confirmDiscardKept(segmentId)) return;
      openEditPanel(segmentId);
    }
    const ta = document.getElementById('textarea-' + cssId(segmentId));
    if (!ta) return;
    const placed = suggestionPlacement.placeGroup(ta.value, group);
    if (!placed.ok) {
      refreshSuggestionView(segmentId); // the text changed under the button
      return;
    }
    ta.value = placed.result;
    const groupActionId = segmentSaveState.newClientActionId(window.crypto);
    for (const item of segmentSaveState.suggestionItems(group, groupActionId, Date.now())) {
      addAssist(segmentId, item);
    }
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    refreshSuggestionView(segmentId);
  }

  function renderSegmentRow(seg) {
    const edits = moduleData.edits[seg.segmentId] || [];
    const latestEdit = edits[0]; // Most recent
    const acceptance = moduleData.acceptances?.[seg.segmentId] || null;
    let rowClass = 'segment-row';
    if (latestEdit) {
      rowClass += ` has-edit ${latestEdit.status}`;
    }
    if (!seg.is && !latestEdit) {
      rowClass += ' no-translation';
    }
    // MTA-R3: an acceptance can now coexist with a non-active edit, so the
    // tint follows the acceptance itself rather than the absence of history.
    if (acceptance) {
      rowClass += ' accepted-row';
    }
    if (seg.segmentId === cursorSegmentId) {
      rowClass += ' kbd-cursor';
    }

    // Determine what IS text to display and what to pre-fill in the editor.
    //
    // MTA-R12: only an edit still IN FLIGHT gets to override the file. This
    // used to count applied edits too, so after a "Útgáfusaga" restore past an
    // applied edit the row displayed the edit's stale text while "Staðfesta MT"
    // attested the on-disk bytes (the accept posts the row's data-is, which
    // rowDataAttributes renders from seg.is — anything else 409s STALE_CONTENT).
    // The editor read one string and attested another.
    //
    // For an applied edit the faithful file IS the truth: loadModuleForEditing
    // rebuilds seg.is from it. Showing seg.is is also the more correct pre-fill
    // for "Breyta aftur" — edited_content is the raw stored text, so pre-filling
    // it made an open-and-save with no typing produce a spurious diff against
    // the normalized baseline.
    const hasActiveEdit = acceptEligibility.isEditInFlight(latestEdit);
    const displayIs = baselineTextFor(seg, latestEdit);
    const editableText = displayIs;
    // §5.18: what a save and an accept echo, rendered ON the row, so a declined
    // re-render cannot make them disagree with what the editor is looking at.
    const rowAttrs = segmentSaveState.rowDataAttributeHtml(
      segmentSaveState.rowDataAttributes(
        seg,
        hasActiveEdit ? latestEdit : null,
        latestEditIdForSegment(seg.segmentId)
      ),
      escapeHtml
    );

    let enHtml = renderMarkdownPreview(seg.en);

    // Show word-level inline diff when an active edit changes the text
    let originalHint = '';
    if (hasActiveEdit && latestEdit.edited_content !== seg.is) {
      const diffHtml = renderInlineDiff(seg.is || '', latestEdit.edited_content || '');
      originalHint = `<div class="diff-hint" title="Breytingar frá upprunalegu">${diffHtml}</div>`;
    }

    // Apply term highlights to EN text
    const segTerms = termData?.[seg.segmentId];
    if (segTerms?.matches?.length > 0) {
      enHtml = highlightTermsInHtml(enHtml, segTerms.matches);
    }

    // Build term issue indicators for IS column
    let termIssuesHtml = '';
    if (segTerms?.issues?.length > 0) {
      termIssuesHtml = segTerms.issues
        .map(
          (issue) => `
          <div class="term-issue ${issue.type}">
            <span class="term-issue-icon">${issue.type === 'inconsistent' ? '&#9888;' : '&#8505;'}</span>
            <span>${escapeHtml(issue.message)}</span>
          </div>
        `
        )
        .join('');
    }

    // §C124: the MT finding for THIS segment, from the residue report the
    // pipeline already wrote at inject time.
    //
    // ⚠️ ADVISORY AND POSSIBLY STALE, BY DESIGN. The report is a snapshot from
    // the last inject, so a segment already fixed can still carry a flag. It is
    // shown WITH its date and nothing is filtered — suppressing a flag because
    // the segment was edited would hide it whenever someone edited the segment
    // without fixing the flagged problem.
    let mtFindingHtml = '';
    if (seg.mtFinding) {
      const when = moduleData.mtFindingsGeneratedAt
        ? new Date(moduleData.mtFindingsGeneratedAt).toLocaleDateString('is-IS')
        : 'dagsetning óþekkt';
      const label =
        seg.mtFinding.kind === 'exact'
          ? 'Vélþýðingarskoðun: virðist óþýdd enska'
          : `Vélþýðingarskoðun: líkist enska frumtextanum (${Math.round(seg.mtFinding.ratio * 100)}%)`;
      mtFindingHtml = `
          <div class="term-issue mt-finding" title="Úr residue-report frá vélþýðingarkeyrslu — ráðgefandi, ekki lifandi próf">
            <span class="term-issue-icon">&#9888;</span>
            <span>${escapeHtml(label)} <em class="text-muted">· ${escapeHtml(when)}</em></span>
          </div>
        `;
    }

    // Build exact-match repetition hint (an approved translation of the same
    // EN sentence elsewhere — outranks the MT draft).
    let repetitionHint = '';
    const rep = repetitionData?.[seg.segmentId];
    if (rep?.suggestion) {
      const s = rep.suggestion;
      const where =
        Number(s.chapter) === -1
          ? `${escapeHtml(s.module_id)} (Viðaukar)`
          : `${escapeHtml(s.module_id)} (kafli ${escapeHtml(String(s.chapter))})`;
      repetitionHint = `
          <div class="repetition-hint" title="Sama setning var þegar samþykkt annars staðar">
            <div class="repetition-hint-label">&#10003; Þegar samþykkt í ${where}</div>
            <div class="repetition-hint-text">${escapeHtml(s.is_text)}</div>
            <button type="button" class="btn btn-sm btn-secondary" onclick="insertRepetition('${seg.segmentId}')">Nota þessa þýðingu</button>
          </div>`;
    }

    const isHeadEditor = ['head-editor', 'admin'].includes(getEffectiveRole());

    // Determine whether editing is allowed:
    // - No edit yet -> can edit
    // - Own pending edit -> can re-edit
    // - Rejected edit -> can try again
    // - Discuss edit -> can re-edit based on feedback
    // - Superseded edit (latest, e.g. after a withdraw) -> can re-edit
    // - Published (approved + applied) -> can revise: a new edit supersedes the
    //   old one on the next "Vista + Birta". Open to any editor, since published
    //   content is settled like baseline. loadModuleForEditing reads the
    //   faithful file as the baseline, so other segments' edits are preserved.
    const isPublished = !!(latestEdit && latestEdit.status === 'approved' && latestEdit.applied_at);
    const canEdit = segmentEditAllowed(latestEdit);

    // G1.23: a row without suggestions gets renderMarkdownPreview(displayIs) and no ruling lines, as before.
    // The suggestion buttons appear only where the row offers editing (spec §7).
    const suggestionView = suggestionDisplay(seg, displayIs, paneAssists(seg.segmentId), {
      controls: canEdit,
    });
    const isHtml = suggestionView.html;

    let actionsHtml = '';
    if (latestEdit) {
      actionsHtml = `
          <div>
            <span class="edit-status ${latestEdit.status}">${statusLabel(latestEdit.status)}</span>
            ${latestEdit.category ? `<span class="category-badge ${latestEdit.category}">${categoryLabel(latestEdit.category)}</span>` : ''}
          </div>
          ${
            // §C210: an edit in discussion carries a thread — the head editor's
            // topic, then the replies — which anyone on the page can read and answer.
            latestEdit.status === 'discuss'
              ? `
            <button class="btn btn-sm btn-secondary btn-thread" data-edit-id="${latestEdit.id}" onclick="openDiscussion(${latestEdit.id})" style="margin-top: 0.25rem;" title="${UI.discussion.openTitle}">
              &#128172; ${UI.discussion.open}
            </button>
          `
              : ''
          }
          ${
            // Head-editors/admins may review any pending edit, including their
            // own (e.g. after "Breyta aftur") — self-approval is permitted for
            // this tier; editors can't reach these actions at all.
            isHeadEditor && latestEdit.status === 'pending'
              ? `
            <div class="review-actions" style="margin-top: 0.25rem;">
              <button class="btn btn-sm btn-approve" onclick="reviewEdit(${latestEdit.id}, 'approve')" title="Samþykkja">&#10003;</button>
              <button class="btn btn-sm btn-reject" onclick="reviewEdit(${latestEdit.id}, 'reject')" title="Hafna">&#10007;</button>
              <button class="btn btn-sm btn-discuss" onclick="reviewEdit(${latestEdit.id}, 'discuss')" title="Ræða">&#128172;</button>
            </div>
          `
              : ''
          }
          ${
            // Stale discuss/rejected rows: a head-editor can reopen the edit for
            // fresh review without waiting for the editor to submit a new revision.
            isHeadEditor &&
            (latestEdit.status === 'discuss' || latestEdit.status === 'rejected') &&
            !latestEdit.applied_at
              ? `
            <button class="btn btn-sm btn-reopen" onclick="reopenEdit(${latestEdit.id})" style="margin-top: 0.25rem;" title="${UI.tooltips.reopenEdit}">
              &#8634; Opna aftur
            </button>
          `
              : ''
          }
          ${
            isHeadEditor && latestEdit.status === 'approved' && !latestEdit.applied_at
              ? `
            <button class="btn btn-sm btn-secondary" onclick="unapproveEdit(${latestEdit.id})" style="margin-top: 0.25rem;" title="Afturkalla samþykki — breytir stöðu í 'bíður'">
              &#8617; Afturkalla
            </button>
          `
              : ''
          }
          ${
            canEdit
              ? `
            <button class="btn btn-sm btn-secondary btn-edit" onclick="openEditPanel('${seg.segmentId}')" style="margin-top: 0.25rem;"${isPublished ? ` title="${UI.editAgain.tooltip}"` : ''}>
              ${isPublished ? UI.editAgain.button : 'Breyta'}
            </button>
          `
              : ''
          }
        `;
    }

    // ── MT acceptance, rendered INDEPENDENTLY of edit history (MTA-R3) ──
    // The old chain was `if (latestEdit) … else if (acceptance) … else`, so the
    // Staðfest chip and the revoke button — which live only in the acceptance
    // arm — were permanently shadowed by any edit. A segment holding both an
    // edit and an acceptance showed neither: an attestation the editor could
    // enter but never see or undo. Eligibility comes from the shared predicate
    // that mirrors the server guard, never from ad-hoc conditions here.
    // Via the SAME adapter the facet and keyboard stream use. Building the
    // predicate's input twice is how two gates drift apart — which is MTA-R3
    // itself; the shared scenario table cannot see an adapter, only the rule.
    const blockReason = acceptEligibility.acceptBlockReason(eligibilityView(seg));
    const stacked = latestEdit ? ' style="margin-top: 0.25rem;"' : '';

    if (acceptance) {
      const canRevoke = acceptance.accepted_by_username === userName || isHeadEditor;
      // Shown NEXT TO the retained history chip, never instead of it: hiding
      // that a segment was contested would trade one honesty hole for another.
      actionsHtml += `
          <div${latestEdit ? ' style="margin-top: 0.25rem;"' : ''}>
            <span class="edit-status accepted" title="${escapeHtml(UI.acceptance.chipTitle(acceptance.accepted_by_username, acceptance.accepted_at))}">${UI.acceptance.chip}</span>
          </div>
          ${
            canRevoke
              ? `<button class="btn btn-sm btn-secondary" onclick="revokeAcceptance(${acceptance.id})" style="margin-top: 0.25rem;">&#8617; ${UI.acceptance.revokeButton}</button>`
              : ''
          }
        `;
    } else if (!blockReason) {
      // Contested rows get their reason ON SCREEN — a title= tooltip is
      // invisible on a keyboard or touch pass, and this is an attestation.
      const contestedHint =
        latestEdit && latestEdit.status === 'rejected'
          ? `<div class="accept-context-hint">${UI.acceptance.contestedRejected}</div>`
          : latestEdit && latestEdit.status === 'superseded'
            ? `<div class="accept-context-hint">${UI.acceptance.contestedSuperseded}</div>`
            : '';
      actionsHtml += `
          ${contestedHint}
          <button class="btn btn-sm btn-accept" onclick="acceptSegmentAndAdvance('${seg.segmentId}', 'single')"${stacked} title="${UI.acceptance.acceptTooltip}">&#10003; ${UI.acceptance.acceptButton}</button>
        `;
    } else if (blockReason === 'DISCUSS_OPEN') {
      actionsHtml += `<div class="accept-context-hint"${stacked}>${UI.acceptance.discussBlocked}</div>`;
    }

    // The edit branch renders its own (conditional, sometimes "Breyta aftur")
    // edit button; rows without history still need the plain one.
    if (!latestEdit) {
      const precededByAcceptanceUi = !!acceptance || !blockReason;
      actionsHtml += `
          <button class="btn btn-sm btn-secondary btn-edit" onclick="openEditPanel('${seg.segmentId}')"${precededByAcceptanceUi ? ' style="margin-top: 0.25rem;"' : ''}>
            Breyta
          </button>
        `;
    }

    // Pre-select the category, and pre-fill the note, when the editor is re-editing their OWN edit. Another
    // editor's are theirs: pre-filled, a save from this pane would store them under this editor's name.
    const ownLatest = latestEdit && latestEdit.editor_username === userName ? latestEdit : null;
    const selectedCat = ownLatest?.category || '';

    // Cross-editor conflict indicator
    const hasOtherEdits = (moduleData.otherPendingSegments || []).includes(seg.segmentId);
    const conflictHtml = hasOtherEdits
      ? '<span class="other-editor-badge" title="' + UI.tooltips.otherEditor + '">&#9998;</span>'
      : '';

    return `
        <tr class="${rowClass}" id="row-${cssId(seg.segmentId)}"${rowAttrs}>
          <td class="col-type">
            <span class="segment-type-badge ${seg.segmentType}">${seg.segmentType}</span>
            ${conflictHtml}
          </td>
          <td class="col-en">
            <div class="segment-content">${enHtml || '<em class="text-muted">' + UI.segmentEditor.noEnglish + '</em>'}</div>
          </td>
          <td class="col-is">
            <div class="segment-content" id="is-${cssId(seg.segmentId)}">${isHtml || '<em class="text-muted">Engin þýðing</em>'}</div>${seg.suggestions ? `<div class="sugg-rulings" id="sugg-${cssId(seg.segmentId)}">${suggestionView.rulingsHtml}</div>` : ''}
            ${originalHint}
            ${mtFindingHtml}
            ${termIssuesHtml}
            ${repetitionHint}
            <div class="edit-panel" id="edit-${cssId(seg.segmentId)}">
              <div class="preview-panel" id="preview-${cssId(seg.segmentId)}"></div>
              <div class="format-toolbar">
                <button type="button" class="tb-bold" onclick="wrapSelection('textarea-${cssId(seg.segmentId)}','**','**')" title="Feitletrað (Ctrl+B)"><b>B</b></button>
                <button type="button" class="tb-italic" onclick="wrapSelection('textarea-${cssId(seg.segmentId)}','*','*')" title="Skáletrað (Ctrl+I)"><i>I</i></button>
                <button type="button" class="tb-term" onclick="wrapSelection('textarea-${cssId(seg.segmentId)}','__','__')" title="Hugtak (Ctrl+T)">T</button>
                <button type="button" onclick="wrapSelection('textarea-${cssId(seg.segmentId)}','++','++')"><u>U</u></button>
                <button type="button" onclick="wrapSelection('textarea-${cssId(seg.segmentId)}','~','~')" title="Niðurskrift">x<sub>2</sub></button>
                <button type="button" onclick="wrapSelection('textarea-${cssId(seg.segmentId)}','^','^')" title="Uppskrift">x<sup>2</sup></button>
              </div>
              <div class="editor-overlay-wrap">
                <div class="marker-backdrop" id="backdrop-${cssId(seg.segmentId)}" aria-hidden="true"></div>
                <textarea id="textarea-${cssId(seg.segmentId)}">${escapeHtml(editableText)}</textarea>
              </div>
              <div class="edit-controls">
                <select id="cat-${cssId(seg.segmentId)}" title="Veldu flokk breytingar">
                  <option value="">Flokkur...</option>
                  <option value="terminology" title="Fagorð, skilgreiningar, samræmi hugtaka" ${selectedCat === 'terminology' ? 'selected' : ''}>Hugtök</option>
                  <option value="accuracy" title="Efnislegir gallar eða rangar þýðingar" ${selectedCat === 'accuracy' ? 'selected' : ''}>Nákvæmni</option>
                  <option value="readability" title="Málfar, setningaskipan, læsileiki" ${selectedCat === 'readability' ? 'selected' : ''}>Læsileiki</option>
                  <option value="style" title="Tónn, orðalag, stílbrigði" ${selectedCat === 'style' ? 'selected' : ''}>Stíll</option>
                  <option value="omission" title="Vantar efni eða hluta úr upprunalega textanum" ${selectedCat === 'omission' ? 'selected' : ''}>Úrfelling</option>
                </select>
                <input type="text" id="note-${cssId(seg.segmentId)}" placeholder="Athugasemd (valkvætt)" value="${escapeHtml(ownLatest?.editor_note || '')}">
                <button class="btn btn-sm btn-primary" onclick="saveEdit('${seg.segmentId}')">Vista</button>
                <button class="btn btn-sm btn-secondary btn-propagate" onclick="propagateSegment('${seg.segmentId}')" title="${UI.segmentEditor.propagateTooltip}">${UI.segmentEditor.propagateButton}</button>
                <button class="btn btn-sm btn-secondary btn-revert" onclick="revertEdit('${seg.segmentId}')" title="${UI.segmentEditor.revertTooltip}">&#8617; ${UI.segmentEditor.revertButton}</button>
                <button class="btn btn-sm btn-secondary" onclick="closeEditPanel('${seg.segmentId}')">Hætta við</button>
              </div>
            </div>
          </td>
          <td class="col-actions">${actionsHtml}<span class="seg-save-ind${recentlySaved.has(seg.segmentId) ? ' saved' : ''}" id="seg-ind-${cssId(seg.segmentId)}">${recentlySaved.has(seg.segmentId) ? 'Vistað' : ''}</span></td>
        </tr>
      `;
  }

  // ================================================================
  // MT ACCEPTANCE ("Staðfesta vélþýðingu", item 20b)
  // ================================================================

  /** Shape the shared eligibility predicate expects, from editor state. */
  function eligibilityView(seg) {
    return {
      hasTranslation: seg.hasTranslation,
      is: seg.is,
      edits: moduleData.edits[seg.segmentId] || [],
    };
  }

  /**
   * The unreviewed backlog — what the Óyfirfarnir facet lists.
   *
   * Everything still awaiting attestation, INCLUDING contested rows (a
   * rejected or withdrawn edit leaves the MT standing and unreviewed).
   */
  function isUnreviewedBacklog(seg) {
    if (moduleData.acceptances?.[seg.segmentId]) return false;
    return acceptEligibility.canAcceptMt(eligibilityView(seg));
  }

  /**
   * The Ctrl+Shift+Enter rapid-accept stream — virgin MT rows only.
   *
   * Deliberately NARROWER than accept-eligibility (MTA-R3). A row carrying a
   * head editor's rejection may be attested, but with a deliberate click and
   * its history on screen. The keyboard flow is a motor rhythm — read, press,
   * read, press — built for rows whose only judgment is "is this sentence
   * fine"; sweeping contested rows into it is exactly where blind attestation
   * happens. The facet above intentionally disagrees, and says so in the
   * exhausted-stream toast.
   */
  function isKeyboardAcceptTarget(seg) {
    return (
      !(moduleData.edits[seg.segmentId] || []).length &&
      !moduleData.acceptances?.[seg.segmentId] &&
      acceptEligibility.canAcceptMt(eligibilityView(seg))
    );
  }

  /** Next keyboard-acceptable segment AFTER the given one (document order). */
  function nextUnhandledAfter(segmentId) {
    const segs = moduleData?.segments || [];
    const start = segs.findIndex((s) => s.segmentId === segmentId);
    for (let i = start + 1; i < segs.length; i++) {
      if (isKeyboardAcceptTarget(segs[i])) return segs[i].segmentId;
    }
    return null;
  }

  /** Re-apply the cursor class (rows are re-rendered on reload) and scroll it into view. */
  function paintCursor() {
    document
      .querySelectorAll('.segment-row.kbd-cursor')
      .forEach((r) => r.classList.remove('kbd-cursor'));
    if (!cursorSegmentId) return;
    const row = document.getElementById('row-' + cssId(cursorSegmentId));
    if (row) {
      row.classList.add('kbd-cursor');
      row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  /**
   * U2: jump to a segment named in the head-editor review panel.
   *
   * The row may be filtered out of the current view, and `paintCursor` fails
   * silently when its row is absent — which reads as a broken button rather than
   * as an active filter. So widen the filters first when the target is not in the
   * DOM, and only then paint.
   * @param {string} segmentId - full segment id as the report emits it
   */
  function jumpToSegment(segmentId) {
    if (!segmentId) return;
    const rowFor = (id) => document.getElementById('row-' + cssId(id));

    if (!rowFor(segmentId)) {
      // The row is filtered out. renderSegments() used to DECLINE (it asked
      // before closing a dirty pane), so the selects are snapshotted and
      // rolled back if it ever answers false. It no longer asks or declines
      // (a row with unsaved text is left in place), so the rollback is a
      // guard that does not fire today.
      const sels = ['filter-type', 'filter-category', 'filter-status']
        .map((id) => document.getElementById(id))
        .filter(Boolean);
      const prev = sels.map((s) => s.value);
      sels.forEach((s) => {
        s.value = 'all';
      });
      if (renderSegments() === false) {
        sels.forEach((s, i) => {
          s.value = prev[i];
        });
        return;
      }
    }

    // Only now commit the cursor. It is the ACCEPT-AND-ADVANCE cursor, so
    // moving it to a row that is not on screen would re-aim Ctrl/Cmd+Shift+Enter
    // at a segment the editor cannot see.
    if (!rowFor(segmentId)) return;
    cursorSegmentId = segmentId;
    paintCursor();
  }

  async function acceptSegment(segmentId, acceptOrigin) {
    if (!moduleData?.segments) return;
    const seg = moduleData.segments.find((s) => s.segmentId === segmentId);
    if (!seg || !seg.hasTranslation) return;
    const row = rowValues(segmentId);
    if (!row || row.is === null) return; // nothing on screen to attest
    const unit = openUnit(); // R1: an answer after the unit was left reloads nothing

    try {
      await saveRetry.attempt(
        `acc:${currentBook}/${currentChapter}/${currentModuleId}:${segmentId}`,
        `${API_BASE}/${currentBook}/${currentChapter}/${currentModuleId}/accept`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(
            segmentSaveState.buildAcceptBody({
              segmentId,
              row,
              acceptOrigin,
              clientActionId: segmentSaveState.newClientActionId(window.crypto),
              clientActionTime: Date.now(),
            })
          ),
        }
      );
      if (openUnit() !== unit) return;
      lastServerSaveTime = Date.now();
      await loadModule(currentModuleId, { force: true });
      paintCursor();
    } catch (err) {
      if (err.status === 409) {
        // Content changed or an edit is in flight — reload to the fresh state
        // (parity with the edit-save conflict flow).
        alert(err.message || UI.acceptance.conflict);
        if (openUnit() !== unit) return;
        await loadModule(currentModuleId, { force: true });
        paintCursor();
      } else if (!saveRetry.isRetryable(err)) {
        alert(UI.common.errorPrefix + err.message);
      }
      // Retryable errors queue in saveRetry; the STALE_CONTENT guard makes
      // a late replay safe (it 409s instead of blessing changed bytes).
    }
  }

  /** Accept a segment and advance the cursor to the next unhandled row. */
  async function acceptSegmentAndAdvance(segmentId, acceptOrigin = 'single') {
    cursorSegmentId = nextUnhandledAfter(segmentId);
    await acceptSegment(segmentId, acceptOrigin);
  }

  /**
   * Keyboard entry point (Ctrl/Cmd+Shift+Enter): first press positions the
   * visible cursor on the first unhandled row; a press with the cursor on an
   * unhandled row accepts it and advances. Never blind-accepts a row the
   * editor hasn't seen highlighted.
   */
  function acceptAtCursor() {
    if (!moduleData?.segments) return;
    const cur = cursorSegmentId && moduleData.segments.find((s) => s.segmentId === cursorSegmentId);
    if (cur && isKeyboardAcceptTarget(cur)) {
      acceptSegmentAndAdvance(cur.segmentId, 'keyboard-stream');
      return;
    }
    const first = moduleData.segments.find(isKeyboardAcceptTarget);
    if (!first) {
      // The keyboard stream skips contested rows on purpose, so "none left"
      // must not imply the module is done while accept buttons remain (MTA-R3).
      const contested = moduleData.segments.filter(isUnreviewedBacklog).length;
      saveRetry.showToast(
        contested ? UI.acceptance.noneLeftContested(contested) : UI.acceptance.noneLeft,
        'info'
      );
      return;
    }
    cursorSegmentId = first.segmentId;
    paintCursor();
  }

  async function revokeAcceptance(acceptanceId) {
    if (!confirm(UI.acceptance.revokeConfirm)) return;
    const unit = openUnit();
    try {
      await fetchJson(`${API_BASE}/acceptance/${acceptanceId}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      await reloadIfOpen(unit, { force: true });
    } catch (err) {
      alert(UI.common.errorPrefix + err.message);
    }
  }

  // ================================================================
  // EDIT ACTIONS
  // ================================================================
  /** `focus: false`: a text put back into its pane by the page (installDraft), which must not move the caret. */
  function openEditPanel(segmentId, { focus = true } = {}) {
    const panel = document.getElementById('edit-' + cssId(segmentId));
    if (panel) {
      if (!paneState.has(segmentId)) paneState.set(segmentId, freshPaneState(segmentId));
      panel.classList.add('active');
      // Add copper left-border to the row
      const row = document.getElementById('row-' + cssId(segmentId));
      if (row) row.classList.add('editing');
      // Focus the textarea and track dirty state
      const textarea = document.getElementById('textarea-' + cssId(segmentId));
      if (textarea) {
        textarea._segmentId = segmentId;
        if (focus) textarea.focus();

        // P1: Skip listener attachment if already bound (prevents accumulation on open/close/open)
        if (!textarea._listenersAttached) {
          textarea._listenersAttached = true;

          // Live preview: render initial content and update on input
          const previewEl = document.getElementById('preview-' + cssId(segmentId));
          if (previewEl) {
            let previewTimer = null;
            textarea.addEventListener('input', function onPreview() {
              clearTimeout(previewTimer);
              previewTimer = setTimeout(() => {
                previewEl.innerHTML = panePreviewHtml(segmentId, textarea.value);
                refreshSuggestionView(segmentId); // a typed-over group leaves the row (G1.23)
              }, 150);
            });
          }

          textarea.addEventListener('input', function onInput() {
            // A pane with text in it always has a state (it has none while its kept text waits in the hold).
            if (!paneState.has(segmentId)) paneState.set(segmentId, freshPaneState(segmentId));
            dirtyEdits.add(segmentId);
            // Update per-segment indicator
            const ind = document.getElementById('seg-ind-' + cssId(segmentId));
            if (ind) {
              ind.textContent = UI.save.changed;
              ind.className = 'seg-save-ind dirty';
            }
            updateSaveStatusBar();
          });

          // B-4: keep the marker backdrop in sync with edits + scrolling
          textarea.addEventListener('input', function onBackdrop() {
            refreshBackdrop(segmentId);
          });
          textarea.addEventListener('scroll', function onScroll() {
            const bd = document.getElementById('backdrop-' + cssId(segmentId));
            if (bd) {
              bd.scrollTop = textarea.scrollTop;
              bd.scrollLeft = textarea.scrollLeft;
            }
          });
        }

        // Always render initial preview + backdrop when opening
        const previewEl = document.getElementById('preview-' + cssId(segmentId));
        if (previewEl) {
          previewEl.innerHTML = panePreviewHtml(segmentId, textarea.value);
        }
        refreshBackdrop(segmentId);
      }
    }
  }

  /** The row's "Breytt" mark goes when its text is discarded, so the row and the status line agree. */
  function clearDirtyIndicator(segmentId) {
    const ind = document.getElementById('seg-ind-' + cssId(segmentId));
    if (ind && ind.classList.contains('dirty')) {
      ind.textContent = '';
      ind.className = 'seg-save-ind';
    }
  }

  /**
   * `unchanged`: saveEdit's call for a save that changes nothing, which has no text to ask about.
   * `confirmed`: the caller has asked already (revertEdit).
   */
  function closeEditPanel(segmentId, { unchanged = false, confirmed = false } = {}) {
    if (!confirmed && !(unchanged ? confirmDiscardKept(segmentId) : confirmDiscard(segmentId)))
      return;
    const panel = document.getElementById('edit-' + cssId(segmentId));
    if (panel) {
      panel.classList.remove('active');
      const row = document.getElementById('row-' + cssId(segmentId));
      if (row) row.classList.remove('editing');
      // Restore original text when cancelling (discard unsaved edits)
      const textarea = document.getElementById('textarea-' + cssId(segmentId));
      if (textarea && moduleData) {
        const seg = moduleData.segments.find((s) => s.segmentId === segmentId);
        if (seg) {
          const latestEdit = moduleData.edits[segmentId]?.[0];
          textarea.value = baselineTextFor(seg, latestEdit);
        }
      }
    }
    dirtyEdits.delete(segmentId);
    clearDirtyIndicator(segmentId);
    rebuildSkippedRow(segmentId); // a row a re-render left alone while it held this text is rebuilt now (ED-03)
    clearPaneState(segmentId);
    refreshSuggestionView(segmentId); // the pane's accepts are gone: their groups are offered again (G1.23)
    updateSaveStatusBar();
    saveDraft(); // a discarded text leaves the draft now, not at the next tick (PR1 review C12)
    pauseSuggestionButtons(); // the rows below moved up; Ctrl+S on a pane with nothing to save comes with no click
  }

  /**
   * Revert a segment's edit textarea to the last-saved (pending/approved) edit
   * or the original MT text, without closing the edit panel. (B-4)
   */
  function revertEdit(segmentId) {
    const textarea = document.getElementById('textarea-' + cssId(segmentId));
    if (!textarea || !moduleData) return;
    const seg = moduleData.segments.find((s) => s.segmentId === segmentId);
    if (!seg) return;
    if (!confirmDiscard(segmentId)) return;
    // On a row that is another editor's to finish there is nothing of this editor's to reset the pane to: left
    // open, it would be a pane with a working Vista on a row that offers no Breyta. It closes.
    if (rowNotEditable(segmentId)) {
      closeEditPanel(segmentId, { confirmed: true });
      return;
    }
    dirtyEdits.delete(segmentId);
    if (rebuildSkippedRow(segmentId, { keep: true })) {
      // The row was older than moduleData (a re-render left it alone while it held this text, ED-03): it has been
      // rebuilt, and the pane opens again on the new row with the text that row shows.
      clearPaneState(segmentId);
      if (rowElement(segmentId)) openEditPanel(segmentId);
    } else {
      const latestEdit = moduleData.edits[segmentId]?.[0];
      textarea.value = baselineTextFor(seg, latestEdit);
      paneState.set(segmentId, freshPaneState(segmentId)); // the pane stays open; its list starts again
      heldDrafts.delete(segmentId); // and it no longer holds a kept text
      showDraftNotice(segmentId, null);
      setSaveBlocked(segmentId, false);
    }
    const ind = document.getElementById('seg-ind-' + cssId(segmentId));
    if (ind) {
      ind.textContent = UI.segmentEditor.reverted;
      ind.className = 'seg-save-ind saved';
      setTimeout(() => {
        ind.textContent = '';
        ind.className = 'seg-save-ind';
      }, 2000);
    }
    const shownText = document.getElementById('textarea-' + cssId(segmentId));
    const previewEl = document.getElementById('preview-' + cssId(segmentId));
    if (previewEl && shownText) previewEl.innerHTML = panePreviewHtml(segmentId, shownText.value);
    refreshBackdrop(segmentId);
    refreshSuggestionView(segmentId); // the pane's list started again: its groups are offered again (G1.23)
    updateSaveStatusBar();
    saveDraft(); // a discarded text leaves the draft now, not at the next tick (PR1 review C12)
  }

  /**
   * Validate a segment edit before saving. Rules live in the shared
   * segment-validation.js module (also enforced server-side, SR-OOS-2);
   * this wrapper only maps violation codes to the pane's wording.
   * Returns { blocked: string[]|null, warnings: string[]|null }
   */
  function validateSegmentEdit(enText, originalIs, editedIs) {
    const result = segmentValidation.validateStructure(enText, originalIs, editedIs);
    const PAIR_NAMES = {
      '**': UI.validation.pairNames.bold,
      __: UI.validation.pairNames.term,
      '++': UI.validation.pairNames.underline,
    };
    const BLOCK_MSG = {
      'math-missing': (p) => UI.validation.mathMissing(p.marker),
      'br-removed': (p) => UI.validation.brRemoved(p.from, p.to),
      'xref-missing': (p) => UI.validation.xrefMissing(p.ref),
      'link-removed': (p) => UI.validation.linkRemoved(p.link),
      'docref-missing': (p) => UI.validation.docRefMissing(p.ref),
      'media-missing': (p) => UI.validation.mediaMissing(p.marker),
      'space-removed': (p) => UI.validation.spaceRemoved(p.from, p.to),
      'seg-marker-injected': (p) => UI.validation.segMarkerInjected(p.marker),
    };
    const WARN_MSG = {
      'unmatched-pair': (p) => UI.validation.unmatchedPair(PAIR_NAMES[p.marker], p.count),
      'unmatched-emphasis': (p) => UI.validation.unmatchedEmphasis(p.open, p.close),
      'unmatched-subscript': (p) => UI.validation.unmatchedSubscript(p.count),
      'unmatched-superscript': (p) => UI.validation.unmatchedSuperscript(p.count),
      'segment-cleared': () => UI.validation.segmentCleared,
    };
    return {
      blocked: result.blocked ? result.blocked.map((v) => BLOCK_MSG[v.code](v.params)) : null,
      warnings: result.warnings ? result.warnings.map((v) => WARN_MSG[v.code](v.params)) : null,
    };
  }

  async function saveEdit(segmentId) {
    // O3: Guard against null moduleData if user navigated away mid-save
    if (!moduleData?.segments) return;
    // One save per segment at a time: a second one sent before the first's answer would name the displayed pair
    // the first is about to replace, and be refused against the editor's own save.
    if (savesInFlight.has(segmentId)) return;
    const seg = moduleData.segments.find((s) => s.segmentId === segmentId);
    if (!seg) return;
    const kept = paneState.get(segmentId);
    if (kept && kept.refused === 'DUPLICATE_ID') {
      alert(UI.draftNotice.duplicateId); // R4: never sent
      return;
    }
    if (kept && kept.blocked) {
      alert(UI.draftNotice.rowNotYours); // not sent while another editor's edit of the row is undecided
      return;
    }
    // §5.18: the base, the displayed pair and the text compared against all
    // come from the ROW, not from moduleData.
    const row = rowValues(segmentId);
    if (!row || row.is === null) return; // the pane's row is gone (navigated away mid-save)
    const shownIs = row.is;

    const editedContent = document.getElementById('textarea-' + cssId(segmentId)).value;
    const category = document.getElementById('cat-' + cssId(segmentId)).value;
    const editorNote = document.getElementById('note-' + cssId(segmentId)).value;

    // If content matches original and no annotation, check if there's an existing edit to withdraw
    const existingEdits = moduleData.edits[segmentId] || [];
    const hasPendingEdit = existingEdits.some((e) => e.status === 'pending');
    if (editedContent === shownIs && !category && !editorNote && !hasPendingEdit) {
      closeEditPanel(segmentId, { unchanged: true });
      return; // No change from original, no annotation, no edit to withdraw
    }

    // Withdraw-branch honesty (item 20b, spec §6): an unchanged save that
    // carries a category/note is NOT an edit — the server's withdraw branch
    // would silently drop the annotation (and delete a pending edit).
    // Explain, and point at Staðfesta MT. Server behavior unchanged.
    if (editedContent === shownIs && (category || editorNote)) {
      if (!hasPendingEdit) {
        alert(UI.acceptance.unchangedNothingSaved);
        return;
      }
      if (!confirm(UI.acceptance.unchangedWithdrawConfirm)) return;
    }

    // Validate before saving
    const validation = validateSegmentEdit(seg.en, shownIs, editedContent);
    if (validation.blocked) {
      alert(
        UI.confirm.validationBlocked +
          validation.blocked.join('\n') +
          UI.confirm.validationRevertHint
      );
      return;
    }
    if (validation.warnings) {
      if (
        !confirm(
          UI.confirm.validationWarnings +
            validation.warnings.join('\n') +
            UI.confirm.validationContinue
        )
      ) {
        return;
      }
    }

    const saveUrl = `${API_BASE}/${currentBook}/${currentChapter}/${currentModuleId}/edit`;
    const retryKey = `seg:${currentBook}/${currentChapter}/${currentModuleId}:${segmentId}`;
    const unit = openUnit(); // R1: the unit this save is sent from, which it may have left when the answer comes
    const saveOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(
        segmentSaveState.buildSaveBody({
          segmentId,
          row,
          editedContent,
          category,
          editorNote,
          assists: paneAssists(segmentId),
          // G1.23 §7: the pane's accepted groups whose words are still in the saved text ([] without suggestions).
          acceptedSuggestions: segmentSaveState.acceptedFromAssists(
            paneAssists(segmentId),
            editedContent,
            suggestionChangesByOpId(seg)
          ),
          clientActionId: segmentSaveState.newClientActionId(window.crypto),
          clientActionTime: Date.now(),
        })
      ),
    };

    // Update per-segment indicator to "saving"
    const savingInd = document.getElementById('seg-ind-' + cssId(segmentId));
    if (savingInd) {
      savingInd.textContent = UI.save.saving;
      savingInd.className = 'seg-save-ind saving';
    }

    savesInFlight.add(segmentId);
    const assistsSent = paneAssists(segmentId).length; // what the body above carries; later ones are not in it
    /** The pane's box, only while the pane is still open and dirty: closed or reset meanwhile, it holds no typing. */
    const boxNow = () => (dirtyEdits.has(segmentId) ? openBox(segmentId) : null);
    try {
      const saveResult = await saveRetry.attempt(retryKey, saveUrl, saveOptions);

      // Live terminology QA (non-blocking): warn if the edit contradicts an
      // approved term. Advisory only — the save already succeeded.
      if (saveResult && Array.isArray(saveResult.termWarnings) && saveResult.termWarnings.length) {
        // ⚠️ THE SERVER'S OWN `message`, NOT A RECONSTRUCTION — whole-branch
        // review, 2026-08-11. This used to rebuild the text from `english` and
        // `expected` and append a hardcoded "fannst ekki í þýðingunni", which is
        // a FALSE STATEMENT for the `alternative` tier: there the editor DID use
        // a known Icelandic term, just a different approved one, and the server
        // already says so — „atom“ → „frumeind“ (notað: „atóm“). On the pinned
        // C24 fixture `alternative` is 15 of 22 issues, i.e. the MAJORITY tier,
        // and this toast fires on EVERY save.
        //
        // The server writes an accurate message per type (terminologyService.js,
        // the issues.push at the end of findTermsInSegments): missing says
        // "fannst ekki", alternative names what was used instead, and a position
        // tie lists every equally-ranked option. Rendering `w.message` keeps
        // this client correct for a type it has never heard of — which is what
        // the previous version got wrong, since B4b-1 introduced exactly that.
        //
        // The `??` arm is for a server old enough not to send `message`; it
        // reproduces the previous wording rather than inventing a third one.
        const names = saveResult.termWarnings
          .map((w) => w.message || `„${w.english}“ → „${w.expected}“ fannst ekki í þýðingunni`)
          .join(', ');
        saveRetry.showToast(`Hugtakaviðvörun: ${names}`, 'warn');
      }
      // Mechanical QA findings (number slips, untranslated-EN residue) — advisory.
      if (saveResult && Array.isArray(saveResult.qaFindings) && saveResult.qaFindings.length) {
        for (const f of saveResult.qaFindings) {
          saveRetry.showToast(f.message, 'warn');
        }
      }

      // The unit was left while the save was in flight (Back, or a reload answered OPENING_UNRECORDED): its panes,
      // dirty set and hold are gone, and its draft holds what leaving kept. The save landed; nothing here may touch
      // that draft (saveDraft would rebuild it from an empty memory) or re-serve the unit (PR2 review R1).
      if (openUnit() !== unit) return;
      applySaveEcho(segmentId, saveResult);
      // Interface audit ED-18: text typed after Vista was pressed was not in this save. The pane stays dirty, so
      // the reload below leaves its row and that text alone (renderSegments); the row now carries this save's
      // echo, so the next save is made over it. Its list of assists keeps what was done after the body was built.
      const typedSince = boxNow();
      if (typedSince && typedSince.value !== editedContent) {
        const next = freshPaneState(segmentId);
        next.assists = paneAssists(segmentId).slice(assistsSent);
        paneState.set(segmentId, next);
        showDraftNotice(segmentId, null);
        dirtyEdits.add(segmentId);
        if (savingInd) {
          savingInd.textContent = UI.save.changed; // not "Vistar...": what is in the box now is unsaved
          savingInd.className = 'seg-save-ind dirty';
        }
      } else {
        dirtyEdits.delete(segmentId);
        clearPaneState(segmentId);
      }
      savesInFlight.delete(segmentId); // the answer is applied: the next Vista need not wait for the reload
      lastServerSaveTime = Date.now();
      recentlySaved.add(segmentId);
      setTimeout(() => {
        recentlySaved.delete(segmentId);
      }, 4000);
      saveDraft(); // update draft (or clear if empty)
      updateSaveStatusBar();
      // Reload module to refresh edits (O2: force bypass re-entrancy guard)
      await reloadIfOpen(unit, { force: true });
    } catch (err) {
      savesInFlight.delete(segmentId); // answered: the next Vista need not wait for the reload below
      // Revert per-segment indicator on error
      if (savingInd) {
        savingInd.textContent = UI.save.changed;
        savingInd.className = 'seg-save-ind dirty';
      }
      if (openUnit() !== unit) {
        // Left while in flight (R1): no pane, hold or reload. A kept code's text goes to the unit's draft for its
        // next opening (keepLeftText); any other answer is only reported. A retryable one is queued as before.
        if (err.status === 409 && segmentSaveState.keepsText(err.code)) {
          keepLeftText(unit, { key: retryKey, body: saveOptions.body, code: err.code });
          alert(refusalAlertText(err));
        } else if (!saveRetry.isRetryable(err)) {
          alert(UI.common.errorSaving + err.message);
        }
        return;
      }
      if (err.status === 409 && segmentSaveState.keepsText(err.code)) {
        // Index decision 12: the typed text, its assists and the base it was
        // sent with go into the draft, then the module reloads and restores it.
        // The text kept is what the box holds NOW: the editor may have typed on while the save was on its way.
        // (A pane closed or reset meanwhile holds no typing: then it is the text that was sent.)
        const box = boxNow();
        keepText(
          segmentId,
          segmentSaveState.refusedEntry({
            text: box ? box.value : editedContent,
            row,
            assists: paneAssists(segmentId),
            code: err.code,
          })
        );
        alert(refusalAlertText(err));
        await loadModule(currentModuleId, { force: true });
      } else if (err.status === 409) {
        // Any other 409 (a withdraw refused because the edit has a discussion): say why and reload. The pane is
        // still dirty, so the reload leaves its row and its text alone (renderSegments, ED-03). A conflict with
        // another editor's save is a kept code and took the branch above (ED-02).
        alert(err.message || UI.refusal.generic);
        await loadModule(currentModuleId, { force: true });
      } else if (!saveRetry.isRetryable(err)) {
        alert(UI.common.errorSaving + err.message);
      }
    } finally {
      savesInFlight.delete(segmentId);
    }
  }

  /**
   * Highest edit id seen on a segment at load time — the optimistic-concurrency
   * token sent with a save. moduleData.edits is keyed by segmentId; 0 means the
   * client saw no edits on the segment.
   */
  function latestEditIdForSegment(segmentId) {
    const list = (moduleData && moduleData.edits && moduleData.edits[segmentId]) || [];
    let max = 0;
    for (const e of list) {
      if (e && typeof e.id === 'number' && e.id > max) max = e.id;
    }
    return max;
  }

  /**
   * Save the segment (if needed), then offer to propagate the translation to
   * its other book-wide occurrences. Manual — the O(book) scan runs only here,
   * never on an ordinary save. (Item O)
   */
  async function propagateSegment(segmentId) {
    if (!moduleData?.segments) return;
    const st = paneState.get(segmentId);
    if (st && st.refused === 'DUPLICATE_ID') return; // R4: never sent
    if (st && st.blocked) return; // nor a kept text whose Vista is blocked (installDraft)
    if (heldDrafts.has(segmentId)) return; // nor a refused text waiting for its reload (its pane has no state)
    const unit = openUnit(); // R1: nothing is sent from a unit left on the way (the save's reload, the preview)
    // Ensure the current edit is persisted first so the propagated text is the
    // saved text. saveEdit reloads the module on success.
    if (dirtyEdits.has(segmentId)) {
      await saveEdit(segmentId);
      if (openUnit() !== unit) return;
      // Decision 32: a refused save is never propagated. Its refusal path has just put the kept text back in this
      // textarea (keepText → loadModule → reinstallHeldDrafts → installDraft), so reading it below would send it:
      // a DUPLICATE_ID text to POST /propagate (R4), or a STALE_BASE text to every other occurrence.
      const after = paneState.get(segmentId);
      if (heldDrafts.has(segmentId) || (after && after.refused)) return;
      // Still dirty: the save did not land (a refusal that is not kept, a queued retry, a declined warning),
      // or more was typed while it was on its way. Either way the box holds text the server does not.
      if (dirtyEdits.has(segmentId)) return;
    }
    const editedContent = document.getElementById('textarea-' + cssId(segmentId))?.value;
    const category = document.getElementById('cat-' + cssId(segmentId))?.value;
    if (!editedContent) return;
    try {
      const pv = await fetchJson(
        `${API_BASE}/${currentBook}/${currentChapter}/${currentModuleId}/propagation-preview?segmentId=${encodeURIComponent(segmentId)}`
      );
      if (openUnit() !== unit) return;
      if (!pv || !pv.eligible || pv.eligible.length === 0) {
        saveRetry.showToast(UI.segmentEditor.propagateNone, 'info');
        return;
      }
      if (!confirm(UI.segmentEditor.propagateConfirm(pv.eligible.length))) return;
      const pr = await fetchJson(
        `${API_BASE}/${currentBook}/${currentChapter}/${currentModuleId}/propagate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ segmentId, editedContent, category: category || undefined }),
        }
      );
      const structureBlockedCount = pr.skipped.filter(
        (s) => s.reason === 'structure_blocked'
      ).length;
      saveRetry.showToast(
        UI.segmentEditor.propagateResult(
          pr.created.length,
          pr.skipped.length,
          structureBlockedCount
        ),
        'success'
      );
      // The rows it wrote to are in this module: show them, so the next save on one names the edit it now
      // displays (a save that names none is refused, UNSEEN_EDIT). Rows with unsaved text are left alone.
      if (pr.created.length > 0) await reloadIfOpen(unit, { force: true });
    } catch (err) {
      // A refusal answers { error: CODE, message } (sendRefusal; PR1 review C3), and fetchJson builds err.message
      // from the code: show the server's message when the body carries one, else what fetchJson read.
      const detail =
        (err.data && typeof err.data.message === 'string' && err.data.message) || err.message;
      saveRetry.showToast(UI.segmentEditor.propagateError(detail), 'error');
    }
  }

  async function reviewEdit(editId, action) {
    const note =
      action === 'reject' || action === 'discuss'
        ? prompt(action === 'reject' ? 'Ástæða höfnunar:' : 'Umræðuefni:')
        : null;

    if ((action === 'reject' || action === 'discuss') && note === null) return; // Cancelled
    const unit = openUnit();

    try {
      await fetchJson(`${API_BASE}/edit/${editId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ note, reviewedEditSha256: reviewedEditSha256For(editId) }),
      });

      await reloadIfOpen(unit);
    } catch (err) {
      alert(UI.common.errorPrefix + err.message);
    }
  }

  // ── §C210: discussion thread on an edit marked "Ræða" ───────────────
  // The topic is the edit's reviewer_note (from the module payload); the
  // replies come from GET /edit/:id/comments. A reply posts to
  // POST /edit/:id/comment and never changes the edit's status: the head
  // editor still decides, with "Opna aftur" or a review action.

  function findEditById(editId) {
    if (!moduleData || !moduleData.edits) return null;
    for (const list of Object.values(moduleData.edits)) {
      const hit = (list || []).find((e) => e.id === editId);
      if (hit) return hit;
    }
    return null;
  }

  function discussionDialog() {
    let dlg = document.getElementById('discussion-dialog');
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.id = 'discussion-dialog';
    dlg.className = 'discussion-dialog';
    dlg.innerHTML = `
      <h3>${escapeHtml(UI.discussion.heading)}</h3>
      <div class="discussion-topic"></div>
      <ol class="discussion-thread"></ol>
      <textarea id="discussion-reply" rows="3" placeholder="${escapeHtml(UI.discussion.replyPlaceholder)}"></textarea>
      <div class="discussion-actions">
        <button type="button" class="btn btn-sm btn-primary" id="discussion-send">${escapeHtml(UI.discussion.send)}</button>
        <button type="button" class="btn btn-sm btn-secondary" id="discussion-close">${escapeHtml(UI.discussion.close)}</button>
      </div>`;
    document.body.appendChild(dlg);
    dlg.querySelector('#discussion-close').addEventListener('click', () => dlg.close());
    dlg.querySelector('#discussion-send').addEventListener('click', () => sendDiscussionReply(dlg));
    return dlg;
  }

  // Comment text is user input: every value goes in through textContent, never innerHTML.
  function renderDiscussion(dlg, edit, comments) {
    const topic = dlg.querySelector('.discussion-topic');
    topic.textContent = '';
    const who = document.createElement('strong');
    who.textContent = (edit && edit.reviewer_username) || UI.discussion.reviewerFallback;
    topic.append(
      who,
      document.createTextNode(': ' + ((edit && edit.reviewer_note) || UI.discussion.noTopic))
    );

    const list = dlg.querySelector('.discussion-thread');
    list.textContent = '';
    if (comments === null || comments.length === 0) {
      const li = document.createElement('li');
      li.className = 'discussion-empty';
      li.textContent = comments === null ? UI.discussion.loading : UI.discussion.noReplies;
      list.appendChild(li);
      return;
    }
    for (const c of comments) {
      const li = document.createElement('li');
      li.className = 'discussion-comment';
      const name = document.createElement('strong');
      name.textContent = c.username || '';
      const when = document.createElement('span');
      when.className = 'discussion-when';
      when.textContent = c.created_at ? ` ${String(c.created_at).slice(0, 16)}` : '';
      const body = document.createElement('div');
      body.textContent = c.comment;
      li.append(name, when, body);
      list.appendChild(li);
    }
  }

  async function loadDiscussion(dlg, editId) {
    const data = await fetchJson(`${API_BASE}/edit/${editId}/comments`, { credentials: 'include' });
    renderDiscussion(dlg, findEditById(editId), data.comments || []);
  }

  async function openDiscussion(editId) {
    const dlg = discussionDialog();
    dlg.dataset.editId = String(editId);
    dlg.querySelector('#discussion-reply').value = '';
    renderDiscussion(dlg, findEditById(editId), null);
    if (!dlg.open) dlg.showModal();
    try {
      await loadDiscussion(dlg, editId);
    } catch (err) {
      alert(UI.common.errorPrefix + err.message);
    }
  }

  async function sendDiscussionReply(dlg) {
    const editId = parseInt(dlg.dataset.editId, 10);
    const box = dlg.querySelector('#discussion-reply');
    const comment = box.value.trim();
    if (!comment) {
      box.focus();
      return;
    }
    const send = dlg.querySelector('#discussion-send');
    send.disabled = true;
    try {
      await fetchJson(`${API_BASE}/edit/${editId}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ comment }),
      });
      box.value = '';
      await loadDiscussion(dlg, editId);
    } catch (err) {
      alert(UI.common.errorPrefix + err.message);
    } finally {
      send.disabled = false;
    }
  }

  async function unapproveEdit(editId) {
    if (!confirm(UI.confirm.unapprove)) return;
    const unit = openUnit();

    try {
      await fetchJson(`${API_BASE}/edit/${editId}/unapprove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      await reloadIfOpen(unit);
    } catch (err) {
      alert(UI.common.errorPrefix + err.message);
    }
  }

  async function reopenEdit(editId) {
    const unit = openUnit();
    try {
      await fetchJson(`${API_BASE}/edit/${editId}/return-to-pending`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      await reloadIfOpen(unit);
    } catch (err) {
      alert(UI.common.errorPrefix + err.message);
    }
  }

  // ================================================================
  // SUBMIT FOR REVIEW
  // ================================================================
  document.getElementById('btn-submit').addEventListener('click', async () => {
    const stats = moduleData.stats || {};
    if (!stats.pending || stats.pending === 0) {
      alert(UI.alert.noChanges);
      return;
    }

    if (!confirm(UI.confirm.submitForReview(stats.pending))) return;
    const unit = openUnit();

    try {
      await fetchJson(`${API_BASE}/${currentBook}/${currentChapter}/${currentModuleId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      // Show success toast with link to reviews page
      const toast = document.createElement('div');
      toast.className = 'toast toast-success show';
      toast.innerHTML =
        UI.segmentEditor.sentForReview +
        ' <a href="/editor" style="color: inherit; text-decoration: underline; margin-left: 0.5rem;">' +
        UI.segmentEditor.viewReview +
        '</a>';
      document.body.appendChild(toast);
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      }, 6000);
      await reloadIfOpen(unit);
    } catch (err) {
      alert(UI.common.errorPrefix + err.message);
    }
  });

  // ================================================================
  // LEAVING A UNIT (Back, and a reload answered OPENING_UNRECORDED)
  // ================================================================
  /**
   * The open unit, by its draft prefix; null while none is open (leaveModule nulls moduleData). An action that awaits
   * the server captures it first and compares after the await: a different answer means the unit it acted on was left
   * meanwhile, and perhaps it or another unit opened since (PR2 review R1). A reopening of the same unit compares
   * equal, and the action then finishes as in any open unit; that opening rendered its own panes from the draft.
   */
  function openUnit() {
    return moduleData ? draftPrefix() : null;
  }

  /** Reload the unit an action started on, only while it is still the open one: never re-serve a unit left (R1). */
  function reloadIfOpen(unit, options) {
    return openUnit() === unit ? loadModule(currentModuleId, options) : Promise.resolve();
  }

  /**
   * A save refused with a kept code after its unit was left (R1). Its pane and the hold are gone, so the text goes to
   * that unit's draft in this tab, where restoreDraft installs it unasked at the next opening (index decision 12). It
   * merges by the rule a restore applies to a parked refusal (mergeRestoreSources): a drafted text of the segment is
   * newer typing, so it stays and takes the code. It writes that one key only, never through saveDraft, which would
   * rebuild the draft from a memory that leaving emptied.
   */
  function keepLeftText(unit, item) {
    const key = unit + tabGuard.tabId;
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(key));
    } catch {
      // a corrupt value holds nothing usable: the refusal's own text is all there is
    }
    // What leaving could not store is newer than what storage holds (R2); mergeDraftValues orders them by ts.
    const draft = segmentSaveState.mergeDraftValues([stored, unwrittenDrafts.get(unit)]);
    const entries = segmentSaveState.mergeRestoreSources(draft, [item]);
    if (writeDraft(entries, key)) unwrittenDrafts.delete(unit);
    else keepUnwritten(unit, entries);
  }

  /** A left unit's draft that storage refused (R2): it stays in memory for the unit's next opening. */
  function keepUnwritten(unit, entries) {
    unwrittenDrafts.set(unit, segmentSaveState.buildDraftValue(entries, Date.now()));
  }

  /**
   * Leave the open unit for the module list. It writes nothing to storage: the caller has already put in the draft
   * what should outlive the unit (Back: clearDraft, which keeps only a refused save's texts; the OPENING_UNRECORDED
   * branch in loadModule: saveDraft, which keeps every text, or keepUnwritten when storage refuses it, PR2 review R2).
   * Afterwards nothing in memory belongs to the unit but that refused draft value, waiting for restoreDraft, so
   * nothing on the module list can act on it (spec §5.4, T6): no pane is open for Escape or Ctrl/Cmd+S to find;
   * moduleData is null for saveEdit, acceptAtCursor and a parked or replayed save (onSaveParked, onSaveReplayed);
   * and nothing is dirty or held that the draft timer, beforeunload, auth-expired or the next unit's draft could
   * write over this unit's draft with. An action still awaiting the server when the unit is left (a save, an accept,
   * a review action) compares openUnit() after its await, so its answer leaves all of this alone and re-serves
   * nothing; a save refused with a kept code adds its text to this unit's draft (keepLeftText; PR2 review R1). What
   * the draft keeps comes back through restoreDraft when the unit is opened again (a kept text unasked, index
   * decision 12).
   */
  function leaveModule() {
    // Close every pane as renderSegments does, without its confirm and without reverting a text: hidden panes left
    // open would be found by Escape, which would close one and save the draft without it.
    document.querySelectorAll('.edit-panel.active').forEach((panel) => {
      panel.classList.remove('active');
      const row = panel.closest('tr');
      if (row) row.classList.remove('editing');
    });
    // Nothing stays dirty (the next load would leave rows nobody can see in place, as rows with unsaved text) and nothing stays held
    // (a later saveDraft would rewrite the draft from it alone, or write it under another unit's key).
    dirtyEdits.clear();
    heldDrafts.clear();
    paneState.clear();
    lastFocusedTextarea = null;
    if (draftTimer) clearInterval(draftTimer);
    tabGuard.release();
    document.getElementById('editor-container').style.display = 'none';
    document.getElementById('module-selector').style.display = 'block';
    document.getElementById('save-status-bar').style.display = 'none';
    moduleData = null;
    termData = null;
    repetitionData = {};
    cursorSegmentId = null;
    lastServerSaveTime = null;
    recentlySaved.clear();
    clearInterval(pipelinePollingTimer);
    const concResults = document.getElementById('concordance-results');
    if (concResults) concResults.innerHTML = '';
    const concInput = document.getElementById('concordance-q');
    if (concInput) concInput.value = '';
    const rsTerms = document.getElementById('review-summary-terms');
    if (rsTerms) rsTerms.innerHTML = '';
    const rsSpell = document.getElementById('review-summary-spell');
    if (rsSpell) rsSpell.innerHTML = '';
    const rsRep = document.getElementById('review-summary-repetition');
    if (rsRep) rsRep.innerHTML = '';

    // Reset topbar title
    const topbarTitle = document.getElementById('topbar-title');
    if (topbarTitle) {
      topbarTitle.textContent = UI.segmentEditor.title;
    }
  }

  // ================================================================
  // BACK BUTTON
  // ================================================================
  document.getElementById('btn-back').addEventListener('click', () => {
    if (!confirmLeaveUnit()) return; // interface audit ED-01: Back asked nothing
    clearDraft(); // writes back only the texts refused saves kept, and discards the rest
    leaveModule();

    // Reload module list (otherwise the spinner from loadModule persists)
    // Guard: if no chapter selected, show clean state instead of infinite spinner
    if (chapterSelect.value && parseInt(chapterSelect.value, 10)) {
      chapterSelect.dispatchEvent(new Event('change'));
    } else {
      const container = document.getElementById('modules-container');
      if (container) container.innerHTML = '';
    }
  });

  // ================================================================
  // CONCORDANCE SEARCH WIRING
  // ================================================================
  const concordanceBtn = document.getElementById('btn-concordance');
  if (concordanceBtn) {
    concordanceBtn.addEventListener('click', searchConcordance);
  }
  const concordanceInput = document.getElementById('concordance-q');
  if (concordanceInput) {
    concordanceInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        searchConcordance();
      }
    });
  }
  const spellcheckBtn = document.getElementById('btn-spellcheck');
  if (spellcheckBtn) {
    spellcheckBtn.addEventListener('click', runSpellcheck);
  }
  const repetitionBtn = document.getElementById('btn-repetition-report');
  if (repetitionBtn) {
    repetitionBtn.addEventListener('click', runRepetitionReport);
  }

  // ================================================================
  // FILTERS
  // ================================================================
  document.getElementById('filter-type').addEventListener('change', renderSegments);
  document.getElementById('filter-category').addEventListener('change', renderSegments);
  document.getElementById('filter-status').addEventListener('change', renderSegments);

  // ================================================================
  // HELPERS
  // ================================================================
  function highlightMath(html) {
    return html.replace(/\[\[MATH:(\d+)\]\]/g, '<span class="math-placeholder">[[MATH:$1]]</span>');
  }

  /**
   * Render markdown preview from raw segment text.
   * Converts formatting markers to styled HTML for display.
   * Order matters: most specific patterns first, then general.
   */
  function renderMarkdownPreview(text) {
    if (!text) return '';
    let html = escapeHtml(text);

    // 1. [[MATH:N]] placeholders
    html = html.replace(/\[\[MATH:(\d+)\]\]/g, '<span class="math-placeholder">[[MATH:$1]]</span>');

    // 1b. [[MEDIA:N]] placeholders
    html = html.replace(
      /\[\[MEDIA:(\d+)\]\]/g,
      '<span class="math-placeholder" title="Mynd/miðill">[[MEDIA:$1]]</span>'
    );

    // 1c. [[SPACE]] / [[SPACE:N]] placeholders
    html = html.replace(
      /\[\[SPACE(?::(\d+))?\]\]/g,
      '<span class="preview-br" title="Bil">·</span>'
    );

    // 2. [[BR]] line breaks
    html = html.replace(/\[\[BR\]\]/g, '<span class="preview-br">[BR]</span><br>');

    // ── Bracket family (B-4): MUST precede single-bracket + markdown rules ──
    // [[TABLE:id]] → table chip
    html = html.replace(
      /\[\[TABLE:([^\]]+)\]\]/g,
      '<span class="xref-chip" title="Tafla: $1">&#128203;</span>'
    );
    // reference markers WITH display text (text|target) — keep text
    html = html.replace(
      /\[\[link:([^|\]]+)\|([^\]]+)\]\]/g,
      '<span class="link-chip" title="Hlekkur: $2">$1 &#128279;</span>'
    );
    html = html.replace(
      /\[\[xref:([^|\]]+)\|([^\]]+)\]\]/g,
      '<span class="xref-chip" title="Tilvísun: $2">$1</span>'
    );
    html = html.replace(
      /\[\[docref:([^|\]]+)\|([^\]]+)\]\]/g,
      '<span class="xref-chip" title="Skjal: $2">$1</span>'
    );
    // reference markers, no display text → chip icon
    html = html.replace(
      /\[\[xref:([^\]]+)\]\]/g,
      '<span class="xref-chip" title="Tilvísun: $1">&#128247;</span>'
    );
    html = html.replace(
      /\[\[docref:([^\]]+)\]\]/g,
      '<span class="xref-chip" title="Skjaltilvísun: $1">&#128196;</span>'
    );
    // paired-content emphasis/sub/sup
    html = html.replace(/\[\[i:(.+?)\]\]/g, '<em>$1</em>');
    html = html.replace(/\[\[b:(.+?)\]\]/g, '<strong>$1</strong>');
    html = html.replace(/\[\[sub:(.+?)\]\]/g, '<sub>$1</sub>');
    html = html.replace(/\[\[sup:(.+?)\]\]/g, '<sup>$1</sup>');
    // B4 id-anchored markers
    html = html.replace(
      /\[\[term:([^|\]]+)\|([^\]]+)\]\]/g,
      '<span class="preview-term" title="$2">$1</span>'
    );
    html = html.replace(/\[\[term:([^\]]+)\]\]/g, '<span class="preview-term">$1</span>');
    html = html.replace(
      /\[\[fn:([^|\]]+)\|([^\]]+)\]\]/g,
      '<span class="xref-chip" title="Neðanmálsgrein: $2">&#8224;$1</span>'
    );
    html = html.replace(
      /\[\[fn:([^\]]+)\]\]/g,
      '<span class="xref-chip" title="Neðanmálsgrein">&#8224;$1</span>'
    );
    html = html.replace(/\[\[u:([^\]]+)\]\]/g, '<u>$1</u>');
    html = html.replace(/\[\[em:([^|\]]+)\|[^\]]+\]\]/g, '<em>$1</em>');
    // ── Brace family (term/footnote + legacy emphasis from old files) ──
    html = html.replace(/\{\{term\}\}(.+?)\{\{\/term\}\}/g, '<span class="preview-term">$1</span>');
    html = html.replace(
      /\{\{fn\}\}(.+?)\{\{\/fn\}\}/g,
      '<span class="xref-chip" title="Neðanmálsgrein">&#8224;$1</span>'
    );
    html = html.replace(/\{\{i\}\}(.+?)\{\{\/i\}\}/g, '<em>$1</em>');
    html = html.replace(/\{\{b\}\}(.+?)\{\{\/b\}\}/g, '<strong>$1</strong>');

    // 3. [#CNX_...] cross-references (before general bracket matching)
    html = html.replace(
      /\[#([A-Za-z0-9_.-]+)\]/g,
      '<span class="xref-chip" title="Tilvísun: $1">&#128247;</span>'
    );

    // 3b. [doc#target] self-closing document cross-references
    html = html.replace(
      /\[([A-Za-z0-9_.-]+)#([A-Za-z0-9_.-]+)\]/g,
      '<span class="xref-chip" title="Skjal: $1, tilvísun: $2">&#128247;</span>'
    );

    // 4. [text](#anchor) and [text](doc#target) links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (m, text, url) {
      if (url.charAt(0) === '#') {
        return '<span class="link-chip" title="Hlekkur: ' + url + '">' + text + ' &#128279;</span>';
      }
      return (
        '<span class="link-chip" title="Skjalhlekkur: ' + url + '">' + text + ' &#128279;</span>'
      );
    });

    // 5. **bold** (before italic to avoid * conflicts)
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // 6. *italic* (must not match inside **)
    html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

    // 7. __term__
    html = html.replace(/__(.+?)__/g, '<span class="preview-term">$1</span>');

    // 8. ~subscript~ (not ~~)
    html = html.replace(/(?<!~)~(?!~)(.+?)(?<!~)~(?!~)/g, '<sub>$1</sub>');

    // 9. ^superscript^
    html = html.replace(/\^(.+?)\^/g, '<sup>$1</sup>');

    // 10. ++underline++
    html = html.replace(/\+\+(.+?)\+\+/g, '<u>$1</u>');

    // 11. {=emphasis=} (class-only emphasis, e.g., emphasis-one for ionizable H)
    html = html.replace(/\{=(.+?)=\}/g, '<span style="color:#d32f2f;font-weight:bold">$1</span>');

    // 12. [footnote: text] / [neðanmálsgrein: text]
    html = html.replace(
      /\[(?:footnote|neðanmálsgrein): (.+?)\]/g,
      '<span class="xref-chip" title="Neðanmálsgrein">†$1</span>'
    );

    return html;
  }

  /**
   * Regenerate the marker backdrop for a segment's edit textarea and keep it
   * scroll-synced. Render-only; never mutates textarea.value. (B-4)
   */
  function refreshBackdrop(segmentId) {
    const ta = document.getElementById('textarea-' + cssId(segmentId));
    const bd = document.getElementById('backdrop-' + cssId(segmentId));
    if (!ta || !bd || typeof highlightMarkersInPlace !== 'function') return;
    bd.innerHTML = highlightMarkersInPlace(ta.value);
    bd.scrollTop = ta.scrollTop;
    bd.scrollLeft = ta.scrollLeft;
  }

  function cssId(segmentId) {
    return segmentId.replace(/[^a-zA-Z0-9-]/g, '_');
  }

  // ================================================================
  // WORD-LEVEL INLINE DIFF
  // ================================================================

  /**
   * Tokenize text for diffing. Treats [[MATH:N]] placeholders as single
   * tokens and splits on whitespace boundaries.
   */
  function tokenizeForDiff(text) {
    if (!text) return [];
    const tokens = [];
    const re = /(\[\[MATH:\d+\]\]|\S+|\s+)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      tokens.push(m[1]);
    }
    return tokens;
  }

  /**
   * LCS-based word diff. Returns array of {type, text} operations.
   * type: 'equal' | 'delete' | 'insert'
   */
  function computeWordDiff(oldText, newText) {
    const oldTokens = tokenizeForDiff(oldText);
    const newTokens = tokenizeForDiff(newText);

    // Build LCS table
    const m = oldTokens.length;
    const n = newTokens.length;
    const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (oldTokens[i - 1] === newTokens[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Backtrack to produce diff ops
    const ops = [];
    let i = m,
      j = n;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldTokens[i - 1] === newTokens[j - 1]) {
        ops.push({ type: 'equal', text: oldTokens[i - 1] });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        ops.push({ type: 'insert', text: newTokens[j - 1] });
        j--;
      } else {
        ops.push({ type: 'delete', text: oldTokens[i - 1] });
        i--;
      }
    }
    ops.reverse();
    return ops;
  }

  /**
   * Render word-level inline diff as HTML with <del> and <ins> tags.
   */
  function renderInlineDiff(oldText, newText) {
    const ops = computeWordDiff(oldText, newText);
    return ops
      .map((op) => {
        const escaped = highlightMath(escapeHtml(op.text));
        switch (op.type) {
          case 'delete':
            return `<del class="diff-del">${escaped}</del>`;
          case 'insert':
            return `<ins class="diff-ins">${escaped}</ins>`;
          default:
            return escaped;
        }
      })
      .join('');
  }

  function statusLabel(status) {
    return UI.editStatus[status] || status;
  }

  function categoryLabel(cat) {
    return UI.editCategory[cat] || cat;
  }

  // ================================================================
  // PIPELINE CONTROLS
  // ================================================================

  let pipelinePollingTimer = null;

  function showPipelinePanel() {
    const isHeadEditor = ['head-editor', 'admin'].includes(getEffectiveRole());
    const panel = document.getElementById('pipeline-panel');
    panel.style.display = isHeadEditor ? 'block' : 'none';
  }

  document.getElementById('btn-inject').addEventListener('click', () => {
    runPipelineAction('inject');
  });

  document.getElementById('btn-render').addEventListener('click', () => {
    runPipelineAction('render');
  });

  document.getElementById('btn-pipeline').addEventListener('click', () => {
    runPipelineAction('run');
  });

  async function runPipelineAction(action) {
    const track = document.getElementById('pipeline-track').value;
    const badge = document.getElementById('pipeline-badge');
    const output = document.getElementById('pipeline-output');

    // Disable buttons while running
    setPipelineButtonsDisabled(true);
    badge.textContent = UI.pipeline.running;
    badge.className = 'pipeline-status-badge running';
    badge.style.display = 'inline-block';
    output.textContent = UI.pipeline.starting(action);
    output.classList.add('active');

    try {
      const data = await fetchJson(`/api/pipeline/${action}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          book: currentBook,
          chapter: currentChapter,
          moduleId: currentModuleId !== 'all' ? currentModuleId : undefined,
          track,
        }),
      });

      // Start polling for job status
      pollJobStatus(data.jobId);
    } catch (err) {
      if (err.data && err.data.requiresConfirmation) {
        if (window.confirm(err.data.warning || err.message)) {
          try {
            const data = await fetchJson(`/api/pipeline/${action}`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                book: currentBook,
                chapter: currentChapter,
                moduleId: currentModuleId !== 'all' ? currentModuleId : undefined,
                track,
                confirmed: true,
              }),
            });
            pollJobStatus(data.jobId);
            return;
          } catch (retryErr) {
            err = retryErr;
          }
        } else {
          // User declined the confirmation dialog — this is not a failure,
          // just a cancelled action. Reset to a neutral idle state instead
          // of falling through to the red failure badge/'Error:' line below.
          badge.style.display = 'none';
          badge.className = 'pipeline-status-badge';
          badge.textContent = '';
          output.classList.remove('active');
          output.textContent = UI.pipeline.cancelled;
          setPipelineButtonsDisabled(false);
          return;
        }
      }
      badge.textContent = UI.common.error;
      badge.className = 'pipeline-status-badge failed';
      output.textContent += `Error: ${err.message}\n`;
      setPipelineButtonsDisabled(false);
    }
  }

  function pollJobStatus(jobId) {
    clearInterval(pipelinePollingTimer);
    let pollAttempts = 0;
    const MAX_POLL_ATTEMPTS = 40; // ~60 seconds at 1.5s interval

    pipelinePollingTimer = setInterval(async () => {
      pollAttempts++;
      try {
        const { job } = await fetchJson(`/api/pipeline/jobs/${jobId}`, {
          credentials: 'include',
        });
        pollAttempts = 0; // Reset on success

        const badge = document.getElementById('pipeline-badge');
        const output = document.getElementById('pipeline-output');

        // Update output
        output.textContent = job.output.join('\n');
        output.scrollTop = output.scrollHeight;

        if (job.status === 'completed') {
          clearInterval(pipelinePollingTimer);
          badge.textContent = UI.pipeline.completed;
          badge.className = 'pipeline-status-badge completed';
          setPipelineButtonsDisabled(false);
        } else if (job.status === 'failed') {
          clearInterval(pipelinePollingTimer);
          badge.textContent = UI.pipeline.failed;
          badge.className = 'pipeline-status-badge failed';
          output.textContent += `\nError: ${job.error || 'Unknown error'}`;
          setPipelineButtonsDisabled(false);
        } else {
          badge.textContent = job.phase ? UI.pipeline.runningPhase(job.phase) : UI.pipeline.running;
        }
      } catch {
        if (pollAttempts >= MAX_POLL_ATTEMPTS) {
          clearInterval(pipelinePollingTimer);
          const badge = document.getElementById('pipeline-badge');
          badge.textContent = UI.pipeline.connectionLost;
          badge.className = 'pipeline-status-badge failed';
          document.getElementById('pipeline-output').textContent +=
            UI.pipeline.connectionLostDetail;
          setPipelineButtonsDisabled(false);
        }
      }
    }, 1500);
  }

  function setPipelineButtonsDisabled(disabled) {
    document.getElementById('btn-inject').disabled = disabled;
    document.getElementById('btn-render').disabled = disabled;
    document.getElementById('btn-pipeline').disabled = disabled;
  }

  // ================================================================
  // PREVIEW (render translated CNXML to HTML in-process)
  // ================================================================

  function showPreviewPanel() {
    const panel = document.getElementById('preview-panel');
    if (panel) panel.style.display = 'block';
  }

  document.getElementById('btn-preview').addEventListener('click', async function () {
    const badge = document.getElementById('preview-badge');
    const track = document.getElementById('preview-track').value;
    const btn = this;

    btn.disabled = true;
    badge.style.display = '';
    badge.textContent = 'Hle\u00f0ur...';
    badge.className = 'pipeline-status-badge';

    try {
      const url = `${API_BASE}/${currentBook}/${currentChapter}/${currentModuleId}/preview?track=${track}`;
      const res = await fetch(url, { credentials: 'include' });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || 'HTTP ' + res.status);
      }

      const html = await res.text();

      // Open preview in a new window
      const win = window.open('', 'preview-' + currentModuleId, 'width=900,height=700');
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.document.title = 'Forskoðun: ' + currentModuleId;

      badge.textContent = 'Opna\u00f0';
      badge.className = 'pipeline-status-badge';
      setTimeout(() => {
        badge.style.display = 'none';
      }, 2000);
    } catch (err) {
      badge.textContent = err.message;
      badge.className = 'pipeline-status-badge';
    }

    btn.disabled = false;
  });

  // ================================================================
  // APPLY CONTROLS (Write approved edits to files)
  // ================================================================

  function showApplyPanel() {
    const isHeadEditor = ['head-editor', 'admin'].includes(getEffectiveRole());
    const panel = document.getElementById('apply-panel');
    panel.style.display = isHeadEditor ? 'block' : 'none';
    if (isHeadEditor) {
      loadApplyStatus();
    }
  }

  // Re-render panels when admin changes role preview
  window.addEventListener('roleVisibilityChanged', function () {
    if (currentModuleId) {
      showPipelinePanel();
      showApplyPanel();
    }
  });

  async function loadApplyStatus() {
    const statusEl = document.getElementById('apply-status');
    const btnApply = document.getElementById('btn-apply');
    const btnApplyRender = document.getElementById('btn-apply-render');
    const badge = document.getElementById('apply-badge');

    statusEl.textContent = UI.apply.loading;
    btnApply.disabled = true;
    btnApplyRender.disabled = true;
    badge.style.display = 'none';

    try {
      const data = await fetchJson(
        `${API_BASE}/${currentBook}/${currentChapter}/${currentModuleId}/apply-status`,
        { credentials: 'include' }
      );

      const {
        held,
        unapplied_count,
        unapplied_acceptances,
        total_approved,
        can_rebuild,
        applied_acceptances,
      } = data;
      if (held) {
        // §C203: the server refuses to write this book's faithful files; say why, and leave
        // both buttons disabled (they were disabled above, before the fetch).
        statusEl.textContent = held;
        return;
      }
      const totalUnapplied = (unapplied_count || 0) + (unapplied_acceptances || 0);

      if (totalUnapplied > 0) {
        statusEl.textContent =
          unapplied_acceptances > 0
            ? UI.apply.unappliedCombined(unapplied_count || 0, unapplied_acceptances)
            : UI.apply.unapplied(unapplied_count);
        btnApply.disabled = false;
        btnApplyRender.disabled = false;
      } else if (can_rebuild) {
        // Edits are marked applied but the faithful file is gone — offer a
        // rebuild (the apply endpoint self-heals by re-applying).
        statusEl.textContent = 'Skrá vantar — hægt að endurbyggja úr samþykktum breytingum';
        btnApply.disabled = false;
        btnApplyRender.disabled = false;
      } else if (total_approved > 0) {
        statusEl.textContent = UI.apply.allApplied(total_approved);
      } else if (applied_acceptances > 0) {
        // item 20b final-review F2: an accept-only publish has
        // total_approved === 0 but applied_acceptances > 0 — without this
        // branch it fell through to noApproved ("Engar samþykktar
        // breytingar"), which is wrong for a module that was just published.
        statusEl.textContent = UI.apply.acceptancesApplied(applied_acceptances);
      } else {
        statusEl.textContent = UI.apply.noApproved;
      }
    } catch (err) {
      statusEl.textContent = UI.apply.errorLoading;
      console.error('Apply status error:', err);
    }
  }

  async function applyEdits() {
    const badge = document.getElementById('apply-badge');
    const btnApply = document.getElementById('btn-apply');
    const btnApplyRender = document.getElementById('btn-apply-render');

    btnApply.disabled = true;
    btnApplyRender.disabled = true;
    badge.style.display = 'inline-block';
    badge.textContent = UI.apply.saving;
    badge.className = 'pipeline-status-badge running';

    try {
      const data = await fetchJson(
        `${API_BASE}/${currentBook}/${currentChapter}/${currentModuleId}/apply`,
        { method: 'POST', credentials: 'include' }
      );
      badge.textContent = UI.apply.saved(data.appliedCount, data.acceptedCount);
      badge.className = 'pipeline-status-badge success';
      // Refresh status
      loadApplyStatus();
    } catch (err) {
      badge.textContent = UI.pipeline.failed;
      badge.className = 'pipeline-status-badge failed';
      alert(UI.common.errorSaving + err.message);
      btnApply.disabled = false;
      btnApplyRender.disabled = false;
    }
  }

  async function applyAndRender() {
    const badge = document.getElementById('apply-badge');
    const btnApply = document.getElementById('btn-apply');
    const btnApplyRender = document.getElementById('btn-apply-render');

    btnApply.disabled = true;
    btnApplyRender.disabled = true;
    badge.style.display = 'inline-block';
    badge.textContent = UI.apply.saveAndRender;
    badge.className = 'pipeline-status-badge running';

    try {
      const data = await fetchJson(
        `${API_BASE}/${currentBook}/${currentChapter}/${currentModuleId}/apply-and-render`,
        { method: 'POST', credentials: 'include' }
      );

      badge.textContent = UI.apply.saveAndRenderProgress(
        data.applied.appliedCount,
        data.applied.acceptedCount
      );

      // Poll the pipeline job
      if (data.jobId) {
        pollApplyRenderJob(data.jobId);
      } else {
        badge.textContent = UI.apply.saveNoRender;
        badge.className = 'pipeline-status-badge success';
        loadApplyStatus();
      }
    } catch (err) {
      badge.textContent = UI.pipeline.failed;
      badge.className = 'pipeline-status-badge failed';
      alert(UI.common.errorPrefix + err.message);
      btnApply.disabled = false;
      btnApplyRender.disabled = false;
    }
  }

  function pollApplyRenderJob(jobId) {
    const badge = document.getElementById('apply-badge');
    let pollAttempts = 0;
    const MAX_POLL_ATTEMPTS = 40; // ~60 seconds at 1.5s interval

    const timer = setInterval(async () => {
      pollAttempts++;
      try {
        const { job } = await fetchJson(`/api/pipeline/jobs/${jobId}`, {
          credentials: 'include',
        });
        pollAttempts = 0; // Reset on success

        if (job.status === 'completed') {
          clearInterval(timer);
          badge.textContent = UI.apply.saveAndRenderDone;
          badge.className = 'pipeline-status-badge success';
          loadApplyStatus();
        } else if (job.status === 'failed') {
          clearInterval(timer);
          // Name the phase that actually failed (inject vs render) and surface
          // the real error — the generic "render failed" badge sent past
          // debugging down the wrong path.
          badge.textContent = UI.apply.phaseFailed(job.phase);
          badge.className = 'pipeline-status-badge failed';
          const detail = [job.error]
            .concat((job.output || []).slice(-6))
            .filter(Boolean)
            .join('\n');
          if (detail) {
            badge.title = detail;
            console.error(
              '[apply-and-render] ' + (job.phase || 'pipeline') + ' failed:\n' + detail
            );
          }
          document.getElementById('btn-apply').disabled = false;
          document.getElementById('btn-apply-render').disabled = false;
        } else {
          badge.textContent = job.phase ? UI.apply.renderPhase(job.phase) : UI.apply.renderRunning;
        }
      } catch {
        if (pollAttempts >= MAX_POLL_ATTEMPTS) {
          clearInterval(timer);
          badge.textContent = UI.pipeline.connectionLost;
          badge.className = 'pipeline-status-badge failed';
          document.getElementById('btn-apply').disabled = false;
          document.getElementById('btn-apply-render').disabled = false;
        }
      }
    }, 1500);
  }

  document.getElementById('btn-apply').addEventListener('click', applyEdits);
  document.getElementById('btn-apply-render').addEventListener('click', applyAndRender);

  // ================================================================
  // VERSION HISTORY (revert a module to a previous snapshot)
  // ================================================================

  /** Format a SQLite UTC datetime ("YYYY-MM-DD HH:MM:SS") for display. */
  function vhFormatDate(raw) {
    if (!raw) return '';
    const d = new Date(raw.replace(' ', 'T') + 'Z');
    return isNaN(d.getTime()) ? raw : d.toLocaleString('is-IS');
  }

  function closeVersionHistory() {
    document.getElementById('vh-overlay').classList.remove('active');
  }

  async function openVersionHistory() {
    const overlay = document.getElementById('vh-overlay');
    const list = document.getElementById('vh-list');
    list.innerHTML = '<div class="vh-empty">Hleður…</div>';
    overlay.classList.add('active');

    try {
      const data = await fetchJson(
        `${API_BASE}/${currentBook}/${currentChapter}/${currentModuleId}/versions`,
        { credentials: 'include' }
      );
      const versions = data.versions || [];
      if (versions.length === 0) {
        list.innerHTML =
          '<div class="vh-empty">Engar eldri útgáfur. Útgáfur verða til þegar samþykktar breytingar eru vistaðar í skrár.</div>';
        return;
      }

      const newest = versions[0].version;
      list.innerHTML = versions
        .map((v) => {
          const who = v.applied_by ? escapeHtml(v.applied_by) : '—';
          const when = escapeHtml(vhFormatDate(v.applied_at));
          const latest = v.version === newest ? ' · nýjasta' : '';
          return (
            '<div class="vh-row">' +
            '<div class="vh-meta">' +
            '<div><span class="vh-sub">' +
            who +
            ' · ' +
            when +
            '</span></div>' +
            '<div><span class="vh-ver">Útgáfa ' +
            v.version +
            '</span> <span class="vh-sub">(' +
            v.segments +
            ' einingar' +
            latest +
            ')</span></div>' +
            '</div>' +
            '<button class="btn btn-secondary btn-sm vh-restore" data-version="' +
            v.version +
            '">Færa í þessa útgáfu</button>' +
            '</div>'
          );
        })
        .join('');

      list.querySelectorAll('.vh-restore').forEach((btn) => {
        btn.addEventListener('click', () =>
          restoreToVersion(parseInt(btn.getAttribute('data-version'), 10))
        );
      });
    } catch (err) {
      list.innerHTML =
        '<div class="vh-empty">Villa við að sækja sögu: ' + escapeHtml(err.message) + '</div>';
    }
  }

  async function restoreToVersion(version) {
    const ok = window.confirm(
      'Færa þessa einingu aftur í útgáfu ' +
        version +
        '?\n\nNúverandi efni er fyrst vistað sem ný útgáfa, svo þetta er afturkræft.'
    );
    if (!ok) return;
    const unit = openUnit();

    try {
      const result = await fetchJson(
        `${API_BASE}/${currentBook}/${currentChapter}/${currentModuleId}/restore/${version}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirm: true }),
        }
      );
      closeVersionHistory();
      if (saveRetry && saveRetry.showToast) {
        saveRetry.showToast(
          'Fært í útgáfu ' +
            version +
            ' (núverandi efni vistað sem útgáfa ' +
            result.snapshotVersion +
            ')',
          'success'
        );
      }
      if (openUnit() !== unit) return;
      await loadModule(currentModuleId, { force: true });
      loadApplyStatus();
    } catch (err) {
      alert(UI.common.errorPrefix + err.message);
    }
  }

  document.getElementById('btn-history').addEventListener('click', openVersionHistory);
  document.getElementById('vh-close').addEventListener('click', closeVersionHistory);
  document.getElementById('vh-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'vh-overlay') closeVersionHistory();
  });

  // ================================================================
  // TERM HIGHLIGHTING — highlightTermsInHtml lives in term-highlight.js
  // (dual-mode, tag-aware splice guard, unit-tested). Loaded as a global
  // before this file; called at the EN-render site above.
  // ================================================================

  // ================================================================
  // TERM POPUP
  // ================================================================

  const SUBJECT_NAMES = {
    chemistry: 'Efnafræði',
    biology: 'Líffræði',
    physics: 'Eðlisfræði',
    microbiology: 'Örverufræði',
    'organic-chemistry': 'Lífræn efnafræði',
    mathematics: 'Stærðfræði',
    general: 'Almennt',
  };

  function showTermPopup(headwordId, element) {
    closeTermPopup();
    const popup = document.getElementById('term-popup');

    // Find term info from termData
    let termInfo = null;
    if (termData) {
      for (const segId of Object.keys(termData)) {
        const match = termData[segId].matches?.find((m) => m.headwordId === headwordId);
        if (match) {
          termInfo = match;
          break;
        }
      }
    }

    if (!termInfo) {
      closeTermPopup();
      return;
    }

    document.getElementById('term-popup-en').textContent = termInfo.english;

    // Build translations HTML with subject badges
    const translations = termInfo.translations || [];
    const translationsHtml = translations
      .map((tr) => {
        const statusBadge =
          tr.status === 'approved'
            ? '<span class="edit-status approved">✓</span>'
            : '<span class="edit-status pending">…</span>';
        const subjectBadges = (tr.subjects || [])
          .map(
            (s) =>
              `<span class="term-subject-badge${tr.isFallback ? ' other' : ''}">${escapeHtml(SUBJECT_NAMES[s] || s)}</span>`
          )
          .join(' ');
        const primaryMark = tr.isPrimary ? ' ★' : '';
        return `
          <div class="term-popup-row" style="padding: 0.2rem 0;">
            <span class="term-popup-value" style="font-weight: ${tr.isPrimary ? '600' : '400'};">${escapeHtml(tr.icelandic)}${primaryMark}</span>
            ${statusBadge} ${subjectBadges}
          </div>`;
      })
      .join('');

    const fallbackNote = termInfo.isFallback
      ? `<div class="term-popup-fallback-note">${UI.termPopup.fallbackNote}</div>`
      : '';

    document.getElementById('term-popup-body').innerHTML = `
        ${fallbackNote}
        ${translationsHtml}
        <div style="margin-top: 0.5rem; padding-top: 0.4rem; border-top: 1px solid var(--border);">
          <a href="/terminology" target="_blank" style="font-size: var(--text-xs); color: var(--accent);">
            ${UI.termLookup.openGlossary}
          </a>
        </div>
      `;

    // Position near the clicked element
    const rect = element.getBoundingClientRect();
    popup.style.top = rect.bottom + window.scrollY + 4 + 'px';
    popup.style.left = Math.min(rect.left + window.scrollX, window.innerWidth - 380) + 'px';
    popup.classList.add('active');

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', closeTermPopupOnOutside);
    }, 0);
  }

  function closeTermPopup() {
    document.getElementById('term-popup').classList.remove('active');
    document.removeEventListener('click', closeTermPopupOnOutside);
  }

  function closeTermPopupOnOutside(e) {
    const popup = document.getElementById('term-popup');
    if (!popup.contains(e.target) && !e.target.classList.contains('term-highlight')) {
      closeTermPopup();
    }
  }

  // ================================================================
  // TERM LOOKUP
  // ================================================================
  const termLookupInput = document.getElementById('term-lookup');
  const termLookupResults = document.getElementById('term-lookup-results');

  termLookupInput.addEventListener('input', () => {
    clearTimeout(termLookupTimer);
    const q = termLookupInput.value.trim();

    if (q.length < 2) {
      termLookupResults.classList.remove('active');
      return;
    }

    termLookupTimer = setTimeout(async () => {
      try {
        const data = await fetchJson(
          `${API_BASE}/terminology/lookup?q=${encodeURIComponent(q)}&bookSlug=${encodeURIComponent(currentBook || '')}`,
          {
            credentials: 'include',
          }
        );

        if (!data.terms || data.terms.length === 0) {
          termLookupResults.innerHTML =
            '<div class="term-lookup-item" style="color: var(--text-muted);">' +
            UI.termLookup.noResults +
            '</div>';
        } else {
          termLookupResults.innerHTML = data.terms
            .map((hw) => {
              // Show primary translation first, then alternatives
              const translations = hw.translations || [];
              const primary = translations.find((t) => t.isPrimary) || translations[0];
              if (!primary) return '';
              const others = translations.filter((t) => t !== primary);
              // Final-review F1: alternatives carry their own subject badges —
              // the einnig list is the only surface where a foreign sibling of
              // a mixed homograph appears at all, so it must be labeled too.
              const otherLabel = (t) =>
                `${escapeHtml(t.icelandic)}${(t.subjects || [])
                  .map(
                    (s) =>
                      ` <span class="term-subject-badge${t.isFallback ? ' other' : ''}">${escapeHtml(SUBJECT_NAMES[s] || s)}</span>`
                  )
                  .join('')}`;
              const othersText =
                others.length > 0
                  ? `<span style="font-size: 0.75em; color: var(--text-muted);"> (einnig: ${others.map(otherLabel).join(', ')})</span>`
                  : '';
              // Item 18: label where the shown translation comes from; the
              // 'other' modifier marks a fallback (foreign-subject) pick.
              const subjectBadges = (primary.subjects || [])
                .map(
                  (s) =>
                    `<span class="term-subject-badge${primary.isFallback ? ' other' : ''}">${escapeHtml(SUBJECT_NAMES[s] || s)}</span>`
                )
                .join(' ');
              return `
              <div class="term-lookup-item" onclick="insertTermFromLookup('${escapeHtml(primary.icelandic)}')">
                <span class="term-lookup-en">${escapeHtml(hw.english)}</span>
                &#8594; <span class="term-lookup-is">${escapeHtml(primary.icelandic)}</span>
                ${primary.status === 'approved' ? ' &#10003;' : ''} ${subjectBadges}${othersText}
              </div>`;
            })
            .join('');
        }
        termLookupResults.classList.add('active');
      } catch {
        termLookupResults.classList.remove('active');
      }
    }, 300);
  });

  let termBlurTimeout = null;
  termLookupInput.addEventListener('blur', () => {
    // Delay to allow click on results
    clearTimeout(termBlurTimeout);
    termBlurTimeout = setTimeout(() => termLookupResults.classList.remove('active'), 200);
  });
  termLookupInput.addEventListener('focusin', () => {
    clearTimeout(termBlurTimeout);
  });

  function insertTermFromLookup(icelandicTerm) {
    // Insert into the last-focused edit textarea (clicking lookup moves focus away)
    const ta = lastFocusedTextarea;
    if (ta && ta.id?.startsWith('textarea-') && document.body.contains(ta)) {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const text = ta.value;
      const insertion = '__' + icelandicTerm + '__';
      ta.value = text.slice(0, start) + insertion + text.slice(end);
      ta.selectionStart = ta.selectionEnd = start + insertion.length;
      if (ta._segmentId) {
        addAssist(
          ta._segmentId,
          segmentSaveState.assistItem('term-insert', 'termbase', Date.now(), {
            term: icelandicTerm,
          })
        );
      }
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      if (ta._segmentId) refreshBackdrop(ta._segmentId);
      termLookupInput.value = '';
      termLookupResults.classList.remove('active');
      termLookupInput.placeholder = UI.termLookup.inserted;
      setTimeout(() => {
        termLookupInput.placeholder = UI.termLookup.placeholder;
      }, 1500);
      ta.focus();
      return;
    }

    // Fallback: copy to clipboard
    navigator.clipboard
      .writeText(icelandicTerm)
      .then(() => {
        termLookupInput.value = '';
        termLookupResults.classList.remove('active');
        termLookupInput.placeholder = UI.termLookup.copied;
        setTimeout(() => {
          termLookupInput.placeholder = UI.termLookup.placeholder;
        }, 1500);
      })
      .catch(() => {
        termLookupResults.classList.remove('active');
      });
  }

  // ================================================================
  // FORMATTING TOOLBAR
  // ================================================================

  /**
   * Wrap the current selection in a textarea with prefix/suffix markers.
   * If no selection, inserts both markers and places cursor between them.
   * Fires an input event so live preview and dirty tracking update.
   */
  function wrapSelection(textareaId, prefix, suffix, source = 'toolbar') {
    const ta = document.getElementById(textareaId);
    if (!ta) return;
    ta.focus();

    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = ta.value;
    const selected = text.slice(start, end);

    const before = text.slice(0, start);
    const after = text.slice(end);

    ta.value = before + prefix + selected + suffix + after;

    // Place cursor: after selected text if there was a selection, between markers if not
    if (selected) {
      ta.selectionStart = start + prefix.length;
      ta.selectionEnd = end + prefix.length;
    } else {
      ta.selectionStart = ta.selectionEnd = start + prefix.length;
    }

    // Trigger input event for live preview and dirty tracking
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    if (ta._segmentId) {
      addAssist(
        ta._segmentId,
        segmentSaveState.assistItem(
          'markup-wrap',
          source === 'keyboard' ? 'keyboard' : 'toolbar',
          Date.now(),
          { marker: prefix }
        )
      );
    }
    refreshBackdrop(ta._segmentId);
  }

  // ================================================================
  // KEYBOARD SHORTCUTS
  // ================================================================
  /** The open pane a key press is about: the one holding the focus, else the only open one, else none. */
  function paneForKey() {
    const el = document.activeElement;
    const own = el && typeof el.closest === 'function' ? el.closest('.edit-panel.active') : null;
    if (own) return own;
    const open = document.querySelectorAll('.edit-panel.active');
    return open.length === 1 ? open[0] : null;
  }

  document.addEventListener('keydown', (e) => {
    // Escape: revert unsaved changes in focused textarea, or close panel
    if (e.key === 'Escape') {
      // O5: Close term lookup results if visible
      const termResults = document.getElementById('term-lookup-results');
      if (termResults && termResults.classList.contains('active')) {
        termResults.classList.remove('active');
        return;
      }

      // If focused in an edit textarea, revert its content to last saved state
      const focused = document.activeElement;
      if (
        focused &&
        focused.tagName === 'TEXTAREA' &&
        focused.id?.startsWith('textarea-') &&
        focused._segmentId
      ) {
        const segId = focused._segmentId;
        // (a refused save's text waiting in the hold is unsaved text too, though its pane is not dirty)
        if (dirtyEdits.has(segId) || heldDrafts.has(segId)) {
          revertEdit(segId);
          e.preventDefault();
          return;
        }
      }

      // Otherwise close the pane the key was pressed in, or the only open one. Several panes can be open (a
      // re-render leaves a row with unsaved text alone), and the first in the page is not the one meant.
      const activePanel = paneForKey();
      if (activePanel) {
        const textarea = activePanel.querySelector('textarea');
        const segId = textarea?._segmentId;
        // If there are unsaved changes, confirm before discarding
        if (segId && (dirtyEdits.has(segId) || heldDrafts.has(segId))) {
          if (!confirm(UI.confirm.discardChanges)) return;
        }
        activePanel.classList.remove('active');
        const row = activePanel.closest('tr');
        if (row) row.classList.remove('editing');
        if (segId) {
          // Restore original text when closing
          if (moduleData) {
            const seg = moduleData.segments.find((s) => s.segmentId === segId);
            if (seg && textarea) {
              const latestEdit = moduleData.edits[segId]?.[0];
              textarea.value = baselineTextFor(seg, latestEdit);
            }
          }
          dirtyEdits.delete(segId);
          clearDirtyIndicator(segId);
          rebuildSkippedRow(segId); // as closeEditPanel (ED-03)
          clearPaneState(segId);
          refreshSuggestionView(segId); // as closeEditPanel: the pane's accepts are offered again (G1.23)
          updateSaveStatusBar();
          saveDraft(); // a discarded text leaves the draft now, not at the next tick (PR1 review C12)
        }
        pauseSuggestionButtons(); // the rows below moved up, by a key rather than a click (G1.23 guard)
      }
    }

    // Ctrl+S to save the current segment (prevent browser save dialog)
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const focused = document.activeElement;
      if (
        focused &&
        focused.tagName === 'TEXTAREA' &&
        focused.id?.startsWith('textarea-') &&
        focused._segmentId
      ) {
        saveEdit(focused._segmentId);
      } else {
        // If not focused on a textarea: the pane holding the focus, or the only open one
        const activePanel = paneForKey();
        if (activePanel) {
          const textarea = activePanel.querySelector('textarea');
          if (textarea?._segmentId) {
            saveEdit(textarea._segmentId);
          }
        }
      }
    }

    // Ctrl/Cmd+Shift+Enter: accept-and-advance (Staðfesta MT, item 20b)
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
      e.preventDefault();
      acceptAtCursor();
      return;
    }

    // Ctrl+Enter to save active edit
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      const focused = document.activeElement;
      if (focused && focused.tagName === 'TEXTAREA' && focused.id.startsWith('textarea-')) {
        const panel = focused.closest('.edit-panel');
        if (panel) {
          const saveBtn = panel.querySelector('.btn-primary');
          if (saveBtn) saveBtn.click();
        }
      }
    }

    // Formatting shortcuts inside textareas
    if (
      (e.ctrlKey || e.metaKey) &&
      document.activeElement?.tagName === 'TEXTAREA' &&
      document.activeElement.id?.startsWith('textarea-')
    ) {
      const taId = document.activeElement.id;
      if (e.key === 'b') {
        e.preventDefault();
        wrapSelection(taId, '**', '**', 'keyboard');
      } else if (e.key === 'i') {
        e.preventDefault();
        wrapSelection(taId, '*', '*', 'keyboard');
      } else if (e.key === 't') {
        e.preventDefault();
        wrapSelection(taId, '__', '__', 'keyboard');
      }
    }
  });

  // ================================================================
  // WARN BEFORE LEAVING WITH UNSAVED EDITS
  // ================================================================
  window.addEventListener('beforeunload', function (e) {
    storeUnwritten(); // R2: a left unit's draft that storage refused, if it has room now
    if (dirtyEdits.size > 0 || heldDrafts.size > 0 || unwrittenDrafts.size > 0) {
      if (dirtyEdits.size > 0 || heldDrafts.size > 0) saveDraft(); // last-chance save to localStorage
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // Save drafts on auth expiry (before 401 redirect)
  window.addEventListener('auth-expired', function () {
    storeUnwritten();
    if (dirtyEdits.size > 0 || heldDrafts.size > 0) saveDraft();
  });

  // ================================================================
  // INIT
  // ================================================================

  // Auto-load from URL params: ?book=...&chapter=...&module=...
  // checkAuth() MUST resolve before any module loads, so role-gated
  // panels (pipeline, apply) see the real role, not the default 'viewer'.
  (async function autoLoadFromParams() {
    await checkAuth();

    const params = new URLSearchParams(window.location.search);
    const book = params.get('book');
    let chapter = params.get('chapter');
    // Item 14: status-page deep links and old bookmarks say 'appendices';
    // dropdown option values are canonical '-1'.
    if (chapter === 'appendices') chapter = '-1';
    const module = params.get('module');
    const view = params.get('view');

    // Apply review filter mode
    if (view === 'reviews') {
      const statusFilter = document.getElementById('filter-status');
      if (statusFilter) {
        statusFilter.value = 'pending';
      }
      // Show info banner
      const selectorCard = document.querySelector('.selector-card');
      if (selectorCard && !document.getElementById('review-mode-banner')) {
        const banner = document.createElement('div');
        banner.id = 'review-mode-banner';
        banner.className = 'review-banner';
        banner.textContent = 'Sýnir einingar sem bíða yfirlestrar';
        selectorCard.parentNode.insertBefore(banner, selectorCard.nextSibling);
      }
    }

    if (!book || !chapter) return;

    // Helper: poll until a condition is true (max 5s)
    function waitFor(conditionFn, interval = 100, timeout = 5000) {
      return new Promise((resolve, reject) => {
        const start = Date.now();
        (function check() {
          if (conditionFn()) return resolve();
          if (Date.now() - start > timeout) return reject(new Error('waitFor timeout'));
          setTimeout(check, interval);
        })();
      });
    }

    // 1. Wait for bookSelector.js to populate the dropdown with our book
    if (window.bookSelector) {
      await window.bookSelector.init();
    }
    await waitFor(() => bookSelect.querySelector('option[value="' + book + '"]'));

    // 2. Set book and trigger chapter loading
    bookSelect.value = book;
    bookSelect.dispatchEvent(new Event('change'));

    // 3. Wait for chapter options to appear
    await waitFor(() => chapterSelect.querySelector('option[value="' + chapter + '"]'));
    chapterSelect.value = chapter;
    chapterSelect.dispatchEvent(new Event('change'));

    // 4. If module specified, wait for module cards then load it. With ?segment=, open that row once it is
    // loaded: Heim's links name the row a reviewer answered (interface audit 2026-11-13, HM-04).
    if (module) {
      await waitFor(() => document.querySelector('.module-card'));
      await loadModule(module);
      const segment = params.get('segment');
      if (segment) jumpToSegment(segment);
    }
  })();

  // ================================================================
  // EXPOSE TO WINDOW (for HTML onclick/inline handlers)
  // ================================================================
  window.renderMarkdownPreview = renderMarkdownPreview;
  window.loadModule = loadModule;
  window.openEditPanel = openEditPanel;
  window.closeEditPanel = closeEditPanel;
  window.revertEdit = revertEdit;
  window.saveEdit = saveEdit;
  window.wrapSelection = wrapSelection;
  window.closeTermPopup = closeTermPopup;
  window.reviewEdit = reviewEdit;
  window.unapproveEdit = unapproveEdit;
  window.reopenEdit = reopenEdit;
  window.openDiscussion = openDiscussion;
  window.showTermPopup = showTermPopup;
  window.insertTermFromLookup = insertTermFromLookup;
  window.insertRepetition = insertRepetition;
  window.acceptSuggestionGroup = acceptSuggestionGroup;
  window.rejectSuggestionGroup = rejectSuggestionGroup;
  window.refreshSuggestionView = refreshSuggestionView;
  window.propagateSegment = propagateSegment;
  window.acceptSegmentAndAdvance = acceptSegmentAndAdvance;
  window.revokeAcceptance = revokeAcceptance;
})(); // end IIFE
