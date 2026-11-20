/**
 * The book glossary page (design §5.3): look a headword up and change the book's answer to it, and
 * see the book's layer, one headword's history and one change's worklist, for head editors and
 * admins. Every write goes through one dialog that asks for a reason and an optional source, says
 * both are published, and resends a house-style override only after the head editor confirms it.
 *
 * 🔴 Every server-supplied value (reasons, sources, Icelandic terms, names, excerpts of editors'
 * text, error messages) is set with textContent or document.createElement. CSP allows inline
 * script, so that is the only control. The one permitted innerHTML is clearing a node with ''.
 * Pinned by server/__tests__/bookGlossaryPage.test.js and server/e2e/book-glossary.spec.js.
 *
 * Buttons carry data-action, and one delegated click handler dispatches on it (ACTIONS). Plan ruling
 * Q13: for a book whose write routes refuse (writable false) no action other than `history` and
 * `worklist` is rendered.
 *
 * Relies on fetchJson (htmlUtils.js), UI (ui-strings.js), window.bookSelector (bookSelector.js),
 * window.chapterLabel (chapter-label.js) and window.bookGlossaryView (book-glossary-view.js).
 */
(function () {
  'use strict';

  const T = UI.bookGlossary;
  const view = window.bookGlossaryView;

  const select = document.getElementById('bg-book-select');
  const holdBanner = document.getElementById('bg-hold-banner');
  const readOnlyLine = document.getElementById('bg-readonly');
  const statusLine = document.getElementById('bg-status');
  const layerPanel = document.getElementById('bg-layer');
  const historyPanel = document.getElementById('bg-history');
  const worklistPanel = document.getElementById('bg-worklist');
  const lookupPanel = document.getElementById('bg-lookup');
  const lookupInput = document.getElementById('bg-lookup-input');
  const lookupResult = document.getElementById('bg-lookup-result');
  const dialog = document.getElementById('bg-action-dialog');
  const dialogTitle = document.getElementById('bg-action-title');
  const dialogFields = document.getElementById('bg-action-fields');
  const reasonBox = document.getElementById('bg-reason');
  const sourceBox = document.getElementById('bg-source');
  const actionError = document.getElementById('bg-action-error');
  const houseStyleBox = document.getElementById('bg-house-style');
  const confirmButton = document.getElementById('bg-confirm-house-style');
  const submitButton = document.getElementById('bg-submit');

  let currentUser = null;
  let book = '';
  // True only when the server says so: an answer without `writable` offers no action either.
  let writable = false;
  // The last layer answer, and the shown look-up ({english, data}): the dialogs read entries,
  // exclusions and the resolution from them.
  let layerData = null;
  let looked = null;
  // The open dialog's action ({request}), and a body waiting for house-style confirmation.
  let current = null;
  let pending = null;
  let sending = false;
  // Each request takes a ticket; an answer whose ticket is no longer the latest is dropped, so a
  // slow answer for the previous book or headword cannot overwrite the current one.
  const latest = { layer: 0, history: 0, worklist: 0, lookup: 0 };

  // ── DOM helpers ─────────────────────────────────────────────

  /** An element with an optional class and optional text. */
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }

  function txt(s) {
    return document.createTextNode(s);
  }

  function clear(node) {
    node.innerHTML = '';
  }

  /** A button the delegated handler dispatches on; `data` becomes data-* attributes. */
  function actionButton(label, action, data) {
    const b = el('button', 'btn btn-secondary btn-sm', label);
    b.type = 'button';
    b.dataset.action = action;
    for (const key of Object.keys(data || {})) b.dataset[key] = String(data[key]);
    return b;
  }

  /**
   * A stored ISO time as local "20.11.2026 kl. 14:02". Built by hand: a browser without Icelandic
   * locale data (headless Chromium is one) answers toLocaleString('is-IS') in US form.
   */
  function when(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    const two = (n) => String(n).padStart(2, '0');
    return (
      d.getDate() +
      '.' +
      (d.getMonth() + 1) +
      '.' +
      d.getFullYear() +
      ' kl. ' +
      two(d.getHours()) +
      ':' +
      two(d.getMinutes())
    );
  }

  function metaLine(by, at, extra) {
    const parts = [by, when(at)].filter(Boolean);
    if (extra) parts.push(extra);
    return el('div', 'bg-meta', parts.join(' · '));
  }

  function appendReason(node, reason, source) {
    if (reason) node.appendChild(el('div', 'bg-reason', T.reason + reason));
    if (source) node.appendChild(el('div', 'bg-source', T.source + source));
  }

  /**
   * The row's own buttons: Saga, when there is an English word to ask the history for, and the
   * row's write buttons only for a book the write routes accept (Q13).
   */
  function rowActions(english, writes) {
    const box = el('div', 'bg-actions');
    if (english) box.appendChild(actionButton(T.history, 'history', { english: english }));
    if (writable) for (const b of writes || []) box.appendChild(b);
    return box;
  }

  /** A link only to a path on this site: the worklist builds editor links, nothing else. */
  function isSitePath(link) {
    return typeof link === 'string' && /^\/(?![/\\])/.test(link);
  }

  function apiPath(slug) {
    return '/api/book-glossary/' + encodeURIComponent(slug);
  }

  // ── Panels (history, worklist) ──────────────────────────────

  /** Clear a panel, give it a title and a close button, show it; returns its body. */
  function openPanel(panel, title, ticketKey) {
    clear(panel);
    const head = el('div', 'bg-panel-head');
    head.appendChild(el('h2', 'card-title', title));
    const close = el('button', 'btn btn-secondary btn-sm bg-close', T.close);
    close.type = 'button';
    close.addEventListener('click', function () {
      closePanel(panel, ticketKey);
    });
    head.appendChild(close);
    panel.appendChild(head);
    const body = el('div', 'bg-panel-body', UI.common.loading);
    panel.appendChild(body);
    panel.hidden = false;
    return body;
  }

  function closePanel(panel, ticketKey) {
    latest[ticketKey] += 1;
    clear(panel);
    panel.hidden = true;
  }

  // ── Layer ───────────────────────────────────────────────────

  function exclusionRow(x) {
    const row = el('li', 'bg-row bg-exclusion');
    row.dataset.exclusionId = String(x.id);
    const head = el('div', 'bg-head');
    head.appendChild(el('span', 'bg-en', x.english));
    head.appendChild(txt(' — ' + T.excluded));
    if (x.conceptId === 0) {
      head.appendChild(el('span', 'bg-whole', T.wholeHeadword));
    } else if (x.icelandic) {
      head.appendChild(txt(': '));
      head.appendChild(el('span', 'bg-is', x.icelandic));
    }
    row.appendChild(head);
    row.appendChild(metaLine(x.createdBy, x.createdAt));
    appendReason(row, x.reason, x.source);
    row.appendChild(rowActions(x.english, [actionButton(T.undo, 'undo-exclusion')]));
    return row;
  }

  function entryRow(entry, claimed) {
    const row = el('li', 'bg-row bg-entry');
    row.dataset.conceptId = String(entry.conceptId);
    const head = el('div', 'bg-head');
    head.appendChild(el('span', 'bg-en', entry.english.join(' · ')));
    head.appendChild(txt(' → '));
    head.appendChild(
      el('span', 'bg-is', entry.icelandic == null ? T.noIcelandic : entry.icelandic)
    );
    row.appendChild(head);
    const updated = entry.updatedAt
      ? T.updated +
        ' ' +
        when(entry.updatedAt) +
        (entry.updatedBy ? ' (' + entry.updatedBy + ')' : '')
      : null;
    row.appendChild(metaLine(entry.createdBy, entry.createdAt, updated));
    appendReason(row, entry.reason, entry.source);

    const inflections = el(
      'div',
      'bg-inflections',
      T.inflections + view.inflectionLabel(entry.inflections)
    );
    // A book the write routes refuse gets no retry (Q13).
    if (writable && entry.inflections.state === 'exact-only') {
      inflections.appendChild(actionButton(T.retryInflections, 'retry-inflections'));
    }
    row.appendChild(inflections);
    for (const form of view.editorOnlyForms(entry.english)) {
      row.appendChild(el('div', 'bg-note', T.editorOnly + ' — ' + form));
    }

    row.appendChild(
      rowActions(entry.english[0], [
        actionButton(T.change, 'change-entry'),
        actionButton(T.remove, 'remove-entry'),
      ])
    );
    if (claimed.length > 0) {
      const list = el('ul', 'bg-claimed');
      for (const x of claimed) list.appendChild(exclusionRow(x));
      row.appendChild(list);
    }
    return row;
  }

  /**
   * Entries and exclusions as lists, into `container` (the layer panel, or a look-up's rows on its
   * headword). Returns false when there was nothing to list.
   */
  function appendLayerRows(container, entries, exclusions) {
    // §C243 T3: an exclusion an entry claims is listed under that entry, the rest on their own.
    const entryIds = new Set(entries.map((e) => e.conceptId));
    const claimedBy = new Map();
    const unclaimed = [];
    for (const x of exclusions) {
      if (x.claimedBy != null && entryIds.has(x.claimedBy)) {
        if (!claimedBy.has(x.claimedBy)) claimedBy.set(x.claimedBy, []);
        claimedBy.get(x.claimedBy).push(x);
      } else {
        unclaimed.push(x);
      }
    }
    if (entries.length > 0) {
      const list = el('ul', 'bg-list');
      for (const e of entries) list.appendChild(entryRow(e, claimedBy.get(e.conceptId) || []));
      container.appendChild(list);
    }
    if (unclaimed.length > 0) {
      container.appendChild(el('h3', 'bg-subtitle', T.unclaimedTitle));
      const list = el('ul', 'bg-list');
      for (const x of unclaimed) list.appendChild(exclusionRow(x));
      container.appendChild(list);
    }
    // Design §5.3: the BÍN credit stands wherever inflections are listed.
    if (entries.length > 0) container.appendChild(el('p', 'bg-credit', T.binCredit));
    return entries.length + unclaimed.length > 0;
  }

  function renderLayer(data) {
    clear(layerPanel);
    layerPanel.appendChild(el('h2', 'card-title', T.layerTitle));
    if (!appendLayerRows(layerPanel, data.entries, data.exclusions)) {
      layerPanel.appendChild(el('p', 'bg-empty', T.layerEmpty));
    }
    layerPanel.dataset.loadedBook = data.book;
    layerPanel.hidden = false;
  }

  function renderHold(hold) {
    clear(holdBanner);
    const lines = [];
    if (hold && hold.held) lines.push(T.held(hold.since ? when(hold.since) : null));
    if (hold && hold.recordError) lines.push(T.recordError);
    for (const line of lines) holdBanner.appendChild(el('div', null, line));
    holdBanner.hidden = lines.length === 0;
  }

  /**
   * Read the selected book's layer again; the history and worklist panels are left as they are.
   * `note` is shown in the status line once the layer is shown (after a write, "Vistað.").
   */
  async function loadLayer(note) {
    const slug = book;
    const ticket = ++latest.layer;
    if (!slug) return;
    statusLine.textContent = UI.common.loading;
    try {
      const data = await fetchJson(apiPath(slug));
      if (ticket !== latest.layer) return;
      writable = data.writable === true;
      layerData = data;
      renderHold(data.hold);
      // Q13: the line says why nothing can be changed; an answer without `writable` claims nothing.
      readOnlyLine.textContent = T.readOnly;
      readOnlyLine.hidden = data.writable !== false;
      renderLayer(data);
      lookupPanel.hidden = false;
      statusLine.textContent = typeof note === 'string' ? note : '';
    } catch (err) {
      if (ticket !== latest.layer) return;
      statusLine.textContent = T.loadError + err.message;
    }
  }

  function selectBook() {
    book = select.value;
    writable = false;
    layerData = null;
    closePanel(historyPanel, 'history');
    closePanel(worklistPanel, 'worklist');
    if (dialog.open) dialog.close();
    resetLookup();
    holdBanner.hidden = true;
    readOnlyLine.hidden = true;
    layerPanel.hidden = true;
    lookupPanel.hidden = true;
    statusLine.textContent = '';
    return loadLayer();
  }

  // ── History ─────────────────────────────────────────────────

  function renderHistory(rows, body) {
    clear(body);
    if (rows.length === 0) {
      body.appendChild(el('p', 'bg-empty', T.historyEmpty));
      return;
    }
    const list = el('ul', 'bg-list');
    for (const h of rows) {
      const row = el('li', 'bg-row bg-history-row');
      row.dataset.changeId = String(h.id);
      const head = el('div', 'bg-head');
      head.appendChild(el('strong', null, view.actionLabel(h.action) || h.action));
      head.appendChild(txt(' · '));
      head.appendChild(el('span', 'bg-en', h.english));
      row.appendChild(head);
      row.appendChild(metaLine(h.by, h.at));
      appendReason(row, h.reason, h.source);
      // Plan ruling Q6: offered exactly where the worklist route answers with a list.
      if (h.worklist) {
        const box = el('div', 'bg-actions');
        box.appendChild(actionButton(T.worklist, 'worklist', { changeId: h.id }));
        row.appendChild(box);
      }
      list.appendChild(row);
    }
    body.appendChild(list);
  }

  async function openHistory(english) {
    if (!book || !english) return;
    const slug = book;
    const ticket = ++latest.history;
    const body = openPanel(historyPanel, T.historyTitle(english), 'history');
    try {
      const data = await fetchJson(
        apiPath(slug) + '/history?english=' + encodeURIComponent(english)
      );
      if (ticket !== latest.history) return;
      renderHistory(data.history, body);
    } catch (err) {
      if (ticket !== latest.history) return;
      body.textContent = T.historyError + err.message;
    }
  }

  // ── Worklist (design §5.5) ──────────────────────────────────

  function worklistRow(item) {
    const row = el('li', 'bg-row bg-worklist-row');
    row.dataset.segmentId = item.segmentId;
    row.appendChild(el('span', 'bg-module', item.moduleId));
    row.appendChild(el('span', 'bg-segment', item.segmentId));
    const parts = view.excerptParts(item.excerpt);
    const quote = el('span', 'bg-excerpt');
    quote.appendChild(txt('„' + parts.before));
    quote.appendChild(el('mark', null, parts.match));
    quote.appendChild(txt(parts.after + '“'));
    row.appendChild(quote);
    const open = el('a', 'bg-open btn btn-secondary btn-sm', T.open);
    if (isSitePath(item.link)) open.href = item.link;
    open.target = '_blank';
    open.rel = 'noopener';
    row.appendChild(open);
    return row;
  }

  function renderWorklist(w, body) {
    clear(body);
    if (w.old && w.old.length > 0) {
      const words = el('p', 'bg-words');
      words.appendChild(txt(T.oldWords(w.old.length)));
      w.old.forEach(function (o, i) {
        if (i > 0) words.appendChild(txt(', '));
        words.appendChild(el('span', 'bg-is', o.icelandic));
        if (o.inflected) words.appendChild(txt(T.inflected));
      });
      if (w.newIcelandic) {
        words.appendChild(txt(' → ' + T.newWord));
        words.appendChild(el('span', 'bg-is', w.newIcelandic));
      }
      body.appendChild(words);
    }
    body.appendChild(el('p', 'bg-summary', view.worklistSummary(w)));
    const note = view.unreadableNote(w);
    if (note) body.appendChild(el('p', 'bg-note', note));
    for (const chapter of w.chapters) {
      body.appendChild(el('h3', 'bg-subtitle', window.chapterLabel.full(chapter.chapter)));
      const list = el('ul', 'bg-list');
      for (const item of chapter.items) list.appendChild(worklistRow(item));
      body.appendChild(list);
    }
  }

  /** One change's worklist, for `forBook` (the book a write was sent for) or the shown book. */
  async function openWorklist(changeId, forBook) {
    const slug = forBook || book;
    if (!slug || !Number.isInteger(changeId) || changeId < 1) return;
    const ticket = ++latest.worklist;
    const body = openPanel(worklistPanel, T.worklistTitle, 'worklist');
    try {
      const data = await fetchJson(apiPath(slug) + '/worklist?changeId=' + changeId);
      if (ticket !== latest.worklist) return;
      renderWorklist(data, body);
    } catch (err) {
      if (ticket !== latest.worklist) return;
      body.textContent = T.worklistError + err.message;
    }
  }

  // ── Look up (design §5.3) ───────────────────────────────────

  function resetLookup() {
    latest.lookup += 1;
    looked = null;
    clear(lookupResult);
  }

  /** A label, then "text (domain)" for each answer; null when there are none. */
  function answerLine(label, answers) {
    if (!answers || answers.length === 0) return null;
    const line = el('p', 'bg-answers', label);
    answers.forEach(function (c, i) {
      if (i > 0) line.appendChild(txt(' · '));
      line.appendChild(el('span', 'bg-is', c.text));
      line.appendChild(txt(' (' + c.domain + ')'));
    });
    return line;
  }

  /** "english → icelandic" after a label. */
  function termLine(className, label, english, icelandic) {
    const line = el('p', className, label);
    if (english) {
      line.appendChild(el('span', 'bg-en', english));
      line.appendChild(txt(' → '));
    }
    line.appendChild(el('span', 'bg-is', icelandic));
    return line;
  }

  function renderLookup(english, data) {
    clear(lookupResult);
    const r = data.resolution;
    const own = r.reason === 'book-entry';
    // The winner has its own slot, so a test (or a reader) never has to find it in prose.
    const winner = el('p', 'bg-winner');
    if (r.winner) {
      winner.dataset.conceptId = String(r.winner.conceptId);
      winner.dataset.reason = String(r.reason);
      winner.appendChild(txt(T.winner));
      winner.appendChild(el('span', 'bg-is', r.winner.text));
      winner.appendChild(txt(' (' + r.winner.domain + (own ? ', ' + T.bookItself : '') + ')'));
    } else {
      winner.textContent = r.tied.length > 0 ? T.tiedNone : T.noWinner;
    }
    lookupResult.appendChild(winner);
    const lines = [
      answerLine(T.tied, r.tied),
      answerLine(T.alsoInScope, r.alsoInScope),
      answerLine(T.outOfScope, r.outOfScope),
    ];
    for (const h of data.houseStyle) {
      lines.push(termLine('bg-house', T.houseStyleMark, h.english, h.icelandic));
    }
    for (const p of data.preferences) {
      const where = p.chapter === 0 ? T.wholeBook : window.chapterLabel.full(p.chapter);
      lines.push(termLine('bg-preference', T.preference(where), null, p.icelandic));
    }
    for (const line of lines) if (line) lookupResult.appendChild(line);

    // Saga orðsins reaches a removed entry's history too. The rest are writes (Q13).
    const actions = el('div', 'bg-actions');
    actions.appendChild(actionButton(T.wordHistory, 'history', { english: english }));
    if (writable) {
      if (!own) actions.appendChild(actionButton(T.setIcelandic, 'set-icelandic'));
      actions.appendChild(actionButton(T.excludeHeadword, 'exclude-headword'));
      // One per in-scope concept except the book's own entry, which is changed or removed instead.
      const ownIds = new Set(data.layer.entries.map((e) => e.conceptId));
      for (const c of own ? r.alsoInScope : view.replaceCandidates(r)) {
        if (ownIds.has(c.conceptId)) continue;
        const label = T.excludeRow + ': ' + c.text + ' (' + c.domain + ')';
        actions.appendChild(actionButton(label, 'exclude-row', { conceptId: c.conceptId }));
      }
    }
    lookupResult.appendChild(actions);

    const rows = el('div', 'bg-on-headword');
    rows.appendChild(el('h3', 'bg-subtitle', T.onHeadword));
    if (appendLayerRows(rows, data.layer.entries, data.layer.exclusions)) {
      lookupResult.appendChild(rows);
    }
  }

  async function lookUp(text) {
    const english = String(text || '').trim();
    if (!book || !english) return;
    const slug = book;
    const ticket = ++latest.lookup;
    lookupResult.textContent = UI.common.loading;
    try {
      const data = await fetchJson(
        apiPath(slug) + '/lookup?english=' + encodeURIComponent(english)
      );
      if (ticket !== latest.lookup) return;
      looked = { english: english, data: data };
      renderLookup(english, data);
    } catch (err) {
      if (ticket !== latest.lookup) return;
      looked = null;
      lookupResult.textContent = T.lookupError + err.message;
    }
  }

  // ── The action dialog ───────────────────────────────────────

  function field(labelText, control) {
    const wrap = el('div', 'form-group');
    const label = el('label', 'form-label', labelText);
    label.htmlFor = control.id;
    wrap.appendChild(label);
    wrap.appendChild(control);
    return wrap;
  }

  function textField(id, value, multiline) {
    const node = el(multiline ? 'textarea' : 'input', 'form-input');
    node.id = id;
    if (multiline) node.rows = 3;
    else node.type = 'text';
    node.value = value || '';
    return node;
  }

  /** A radio button or a checkbox inside its label. */
  function choice(type, name, value, labelText, checked, className) {
    const label = el('label', 'bg-choice' + (className ? ' ' + className : ''));
    const box = document.createElement('input');
    box.type = type;
    box.name = name;
    box.value = String(value);
    box.checked = Boolean(checked);
    label.appendChild(box);
    label.appendChild(txt(' ' + labelText));
    return label;
  }

  function fieldValue(id) {
    return document.getElementById(id).value;
  }

  function checkedIds(name) {
    return Array.from(dialogFields.querySelectorAll('input[name="' + name + '"]:checked')).map(
      (box) => Number(box.value)
    );
  }

  function showMessage(text) {
    actionError.textContent = text;
  }

  /** Forget a body waiting for confirmation: it was built from the form as it was. */
  function dropPending() {
    pending = null;
    clear(houseStyleBox);
    houseStyleBox.hidden = true;
    confirmButton.hidden = true;
  }

  function resetDialog() {
    current = null;
    dropPending();
    showMessage('');
    clear(dialogFields);
  }

  /**
   * Open the dialog for one action. `fill` adds the action's own fields. `request` reads them and
   * returns {path, body, worklist?(answer)}, or, when nothing should be sent, the message to show.
   */
  function openDialog(title, fill, request) {
    if (!writable) return;
    resetDialog();
    dialogTitle.textContent = title;
    if (fill) fill(dialogFields);
    reasonBox.value = '';
    sourceBox.value = '';
    current = { request: request };
    if (!dialog.open) dialog.showModal();
    (dialogFields.querySelector('input[type="text"], textarea') || reasonBox).focus();
  }

  async function submitDialog() {
    if (!current || sending) return;
    showMessage('');
    const req = current.request();
    if (typeof req === 'string') {
      showMessage(req);
      return;
    }
    const reason = reasonBox.value.trim();
    if (!reason) {
      showMessage(T.reasonRequired);
      reasonBox.focus();
      return;
    }
    const body = Object.assign({}, req.body, { reason: reason });
    const source = sourceBox.value.trim();
    if (source) body.source = source;
    await send(req, body);
  }

  /** The house-style terms a write would override, and the button that resends it confirmed. */
  function showHouseStyle(terms, req, body) {
    clear(houseStyleBox);
    for (const h of terms) houseStyleBox.appendChild(termLine(null, '', h.english, h.icelandic));
    houseStyleBox.hidden = false;
    confirmButton.hidden = false;
    pending = { req: req, body: body };
  }

  function confirmHouseStyle() {
    if (!pending || sending) return;
    const p = pending;
    dropPending();
    // The same body, confirmed: never rebuilt from the form.
    return send(p.req, Object.assign({}, p.body, { confirmHouseStyle: true }));
  }

  /** After a write the layer and the shown look-up are read again. */
  function afterWrite() {
    loadLayer(T.saved);
    if (looked) lookUp(looked.english);
  }

  /**
   * POST one write and answer it (design §5.3; the answers are PR 2's routes'). The answer belongs
   * to the dialog and the book that sent it: the dialog can be closed (Escape, Hætta við) and
   * another opened, or the book changed, while the request runs. An answer for a dialog that is
   * no longer open touches no dialog, arms no confirmation and opens no worklist; a write it
   * reports still happened, so the layer is read again if its book is still shown.
   */
  async function send(req, body) {
    const owner = current;
    const slug = book;
    // `current` alone is not enough: the dialog's close event (which resets it) is queued, while
    // dialog.open and `book` change at once.
    const ours = () => owner !== null && owner === current && slug === book && dialog.open;
    // A confirmation offered for an earlier answer does not stand beside this one's.
    dropPending();
    sending = true;
    submitButton.disabled = true;
    confirmButton.disabled = true;
    try {
      const answer = await fetchJson(apiPath(slug) + req.path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (answer.status === 'unchanged' || answer.status === 'already') {
        if (!ours()) return;
        // Nothing was written. §C243 R8: forms are matched without regard to case, so a change
        // of case alone comes back unchanged.
        showMessage(
          answer.status === 'already'
            ? T.already
            : T.unchanged + (body.forms ? ' ' + T.caseHint : '')
        );
        return;
      }
      if (!ours()) {
        if (slug === book) afterWrite();
        return;
      }
      dialog.close();
      afterWrite();
      // Design G2: the worklist opens for a replacement, a change of Icelandic or a removal.
      if (answer.changeId != null && req.worklist && req.worklist(answer)) {
        openWorklist(answer.changeId, slug);
      }
    } catch (err) {
      if (!ours()) return;
      // 400 and 409 carry the server's Icelandic message; a preference refusal offers nothing more.
      showMessage(err.message);
      const data = err.data || {};
      if (data.refusal === 'needs-confirm' && Array.isArray(data.houseStyle)) {
        showHouseStyle(data.houseStyle, req, body);
      }
    } finally {
      sending = false;
      submitButton.disabled = false;
      confirmButton.disabled = false;
    }
  }

  // ── Write actions ───────────────────────────────────────────

  /**
   * The id a row's button acts on, read from the row itself: the button carries none, so a test
   * keyed on a row's [data-concept-id] or [data-exclusion-id] matches the row alone.
   */
  function rowIdOf(b, rowClass, key) {
    const row = b.closest('.' + rowClass);
    return row ? Number(row.dataset[key]) : NaN;
  }

  /** An entry or exclusion of the last layer answer, or of the shown look-up's rows. */
  function findRow(kind, key, value) {
    for (const source of [layerData, looked && looked.data.layer]) {
      const found = source && source[kind].find((x) => x[key] === value);
      if (found) return found;
    }
    return null;
  }

  function exclusionLabel(x) {
    return x.english + (x.icelandic ? ' → ' + x.icelandic : '');
  }

  function openSetIcelandic() {
    if (!looked) return;
    const english = looked.english;
    const candidates = view.replaceCandidates(looked.data.resolution);
    openDialog(
      T.setIcelandicTitle(english),
      function (box) {
        box.appendChild(field(T.icelandicLabel, textField('bg-icelandic', '')));
        box.appendChild(field(T.formsLabel, textField('bg-forms', english, true)));
        const modes = el('fieldset');
        modes.appendChild(el('legend', 'form-label', T.modeLegend));
        if (candidates.length > 0) {
          modes.appendChild(choice('radio', 'bg-mode', 'replace', T.modeReplace, true));
          for (const c of candidates) {
            const label = c.text + ' (' + c.domain + ')';
            modes.appendChild(
              choice('checkbox', 'bg-replaces', c.conceptId, label, c.checked, 'bg-sub')
            );
          }
        }
        modes.appendChild(choice('radio', 'bg-mode', 'add', T.modeAdd, candidates.length === 0));
        box.appendChild(modes);
      },
      function () {
        const mode = dialogFields.querySelector('input[name="bg-mode"]:checked').value;
        const body = {
          forms: view.formsFromText(fieldValue('bg-forms')),
          icelandic: fieldValue('bg-icelandic').trim(),
          mode: mode,
        };
        if (mode === 'replace') {
          body.replaces = checkedIds('bg-replaces');
          if (body.replaces.length === 0) return T.replacesRequired;
        }
        return { path: '/entries', body: body, worklist: () => mode === 'replace' };
      }
    );
  }

  function openExcludeHeadword() {
    if (!looked) return;
    const english = looked.english;
    openDialog(
      T.excludeHeadwordTitle(english),
      (box) => box.appendChild(el('p', 'bg-note', T.excludeHeadwordNote)),
      () => ({ path: '/exclusions', body: { english: english, conceptId: 0 } })
    );
  }

  function openExcludeRow(b) {
    if (!looked) return;
    const english = looked.english;
    const conceptId = Number(b.dataset.conceptId);
    const r = looked.data.resolution;
    const c = [r.winner].concat(r.tied, r.alsoInScope).find((x) => x && x.conceptId === conceptId);
    if (!c) return;
    openDialog(T.excludeRowTitle(english, c.text), null, () => ({
      path: '/exclusions',
      body: { english: english, conceptId: conceptId },
    }));
  }

  function openUndo(b) {
    const id = rowIdOf(b, 'bg-exclusion', 'exclusionId');
    const x = findRow('exclusions', 'id', id);
    if (!x) return;
    openDialog(T.undoTitle(exclusionLabel(x)), null, () => ({
      path: '/exclusions/' + id + '/undo',
      body: {},
    }));
  }

  function openChange(b) {
    const conceptId = rowIdOf(b, 'bg-entry', 'conceptId');
    const entry = findRow('entries', 'conceptId', conceptId);
    if (!entry) return;
    openDialog(
      T.changeTitle(entry.english.join(' · ')),
      function (box) {
        box.appendChild(field(T.icelandicLabel, textField('bg-icelandic', entry.icelandic)));
        box.appendChild(field(T.formsLabel, textField('bg-forms', entry.english.join('\n'), true)));
      },
      function () {
        const body = view.changeBody(entry, {
          icelandic: fieldValue('bg-icelandic').trim(),
          forms: view.formsFromText(fieldValue('bg-forms')),
        });
        // Nothing differs, so nothing is sent.
        if (!body) return T.unchanged;
        return {
          path: '/entries/' + conceptId + '/change',
          body: body,
          worklist: (answer) => answer.icelandicChanged === true,
        };
      }
    );
  }

  function openRemove(b) {
    const conceptId = rowIdOf(b, 'bg-entry', 'conceptId');
    const entry = findRow('entries', 'conceptId', conceptId);
    if (!entry) return;
    const claimed = ((layerData && layerData.exclusions) || []).filter(
      (x) => x.claimedBy === conceptId
    );
    openDialog(
      T.removeTitle(entry.english.join(' · ')),
      function (box) {
        if (claimed.length === 0) return;
        const set = el('fieldset');
        set.appendChild(el('legend', 'form-label', T.undoClaimed));
        // Plan ruling Q7: each is checked, so the shared word can come back in one step.
        for (const x of claimed) {
          set.appendChild(choice('checkbox', 'bg-undo', x.id, exclusionLabel(x), true));
        }
        box.appendChild(set);
      },
      () => ({
        path: '/entries/' + conceptId + '/remove',
        body: { undoExclusions: checkedIds('bg-undo') },
        worklist: () => true,
      })
    );
  }

  async function retryInflections(b) {
    const conceptId = rowIdOf(b, 'bg-entry', 'conceptId');
    if (!book || !writable || !Number.isInteger(conceptId)) return;
    b.disabled = true;
    try {
      await fetchJson(apiPath(book) + '/entries/' + conceptId + '/inflections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      statusLine.textContent = T.retryStarted;
      // The lookup runs in the background (202); the layer shows its state once read again.
      setTimeout(loadLayer, 1500);
    } catch (err) {
      b.disabled = false;
      statusLine.textContent = T.retryError + err.message;
    }
  }

  // ── Actions ─────────────────────────────────────────────────

  const ACTIONS = {
    history: (b) => openHistory(b.dataset.english),
    worklist: (b) => openWorklist(Number(b.dataset.changeId)),
    lookup: () => lookUp(lookupInput.value),
    'set-icelandic': openSetIcelandic,
    'exclude-headword': openExcludeHeadword,
    'exclude-row': openExcludeRow,
    'undo-exclusion': openUndo,
    'change-entry': openChange,
    'remove-entry': openRemove,
    'retry-inflections': retryInflections,
    submit: submitDialog,
    cancel: () => dialog.close(),
    'confirm-house-style': confirmHouseStyle,
  };

  // On the document: layout.js replaces <main> with its shell once the DOM is ready, moving the
  // children into a wrapper that keeps main's id (#bg-page), so a listener on <main> would be lost.
  document.addEventListener('click', function (event) {
    const b = event.target.closest('#bg-page button[data-action]');
    if (!b || !Object.hasOwn(ACTIONS, b.dataset.action)) return;
    ACTIONS[b.dataset.action](b);
  });

  // ── Books and start-up ──────────────────────────────────────

  /** An admin holds every listed book; a head editor the listed books in `user.books`. */
  function booksHeld(books) {
    if (currentUser && currentUser.role === 'admin') return books;
    const held = (currentUser && currentUser.books) || [];
    return books.filter((b) => held.indexOf(b.slug) !== -1);
  }

  /**
   * Fill the book list once the user is known (the localization page's rule). Only a held slug is
   * ever requested, since the API refuses any other with a 4xx.
   */
  async function loadBooks() {
    const listed = await window.bookSelector.fetchBooks();
    const held = booksHeld(listed);
    if (listed.length > 0 && held.length === 0) select.dataset.placeholder = T.noBooksHeld;
    // Plan ruling Q11: ?book=<slug> opens the page on that book when the user holds it. populate
    // prefers dataset.default over the stored choice and fires `change` for the book it selects.
    const wanted = new URLSearchParams(window.location.search).get('book');
    if (wanted && held.some((b) => b.slug === wanted)) select.dataset.default = wanted;
    window.bookSelector.populate(select, held);
  }

  function userReady() {
    return new Promise(function (resolve) {
      if (window.currentUser) {
        resolve(window.currentUser);
        return;
      }
      window.addEventListener(
        'userLoaded',
        function (e) {
          resolve(e.detail);
        },
        { once: true }
      );
    });
  }

  // The view's static labels come from UI.bookGlossary, like every other string on the page.
  const LABELS = {
    'bg-lookup-title': T.lookupTitle,
    'bg-lookup-button': T.lookupButton,
    'bg-reason-label': T.reasonLabel,
    'bg-source-label': T.sourceLabel,
    'bg-notice': T.publicNotice,
    'bg-cancel': T.cancel,
    'bg-confirm-house-style': T.confirmHouseStyle,
    'bg-submit': T.submit,
  };
  for (const id of Object.keys(LABELS)) document.getElementById(id).textContent = LABELS[id];
  lookupInput.setAttribute('aria-label', T.lookupLabel);
  lookupInput.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    lookUp(lookupInput.value);
  });
  // An edit makes a body waiting for confirmation stale; however the dialog closes (Escape
  // included), its state goes with it.
  dialog.addEventListener('input', dropPending);
  dialog.addEventListener('close', resetDialog);

  select.addEventListener('change', selectBook);

  userReady().then(function (user) {
    currentUser = user;
    return loadBooks();
  });
})();
