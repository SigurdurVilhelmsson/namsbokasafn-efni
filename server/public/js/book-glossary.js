/**
 * The book glossary page (design §5.3): the book's layer, one headword's history and one change's
 * worklist, for head editors and admins.
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

  let currentUser = null;
  let book = '';
  // True only when the server says so: an answer without `writable` offers no action either.
  let writable = false;
  // Each request takes a ticket; an answer whose ticket is no longer the latest is dropped, so a
  // slow answer for the previous book or headword cannot overwrite the current one.
  const latest = { layer: 0, history: 0, worklist: 0 };

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

  /** The row's own buttons: Saga, when there is an English word to ask the history for. */
  function rowActions(english) {
    const box = el('div', 'bg-actions');
    if (english) box.appendChild(actionButton(T.history, 'history', { english: english }));
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
    row.appendChild(rowActions(x.english));
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
    // Wired with the page's write actions; a book the write routes refuse gets none (Q13).
    if (writable && entry.inflections.state === 'exact-only') {
      inflections.appendChild(actionButton(T.retryInflections, 'retry-inflections'));
    }
    row.appendChild(inflections);
    for (const form of view.editorOnlyForms(entry.english)) {
      row.appendChild(el('div', 'bg-note', T.editorOnly + ' — ' + form));
    }

    row.appendChild(rowActions(entry.english[0]));
    if (claimed.length > 0) {
      const list = el('ul', 'bg-claimed');
      for (const x of claimed) list.appendChild(exclusionRow(x));
      row.appendChild(list);
    }
    return row;
  }

  function renderLayer(data) {
    clear(layerPanel);
    layerPanel.appendChild(el('h2', 'card-title', T.layerTitle));

    // §C243 T3: an exclusion an entry claims is listed under that entry, the rest on their own.
    const entryIds = new Set(data.entries.map((e) => e.conceptId));
    const claimedBy = new Map();
    const unclaimed = [];
    for (const x of data.exclusions) {
      if (x.claimedBy != null && entryIds.has(x.claimedBy)) {
        if (!claimedBy.has(x.claimedBy)) claimedBy.set(x.claimedBy, []);
        claimedBy.get(x.claimedBy).push(x);
      } else {
        unclaimed.push(x);
      }
    }

    if (data.entries.length === 0 && unclaimed.length === 0) {
      layerPanel.appendChild(el('p', 'bg-empty', T.layerEmpty));
    }
    if (data.entries.length > 0) {
      const list = el('ul', 'bg-list');
      for (const e of data.entries) list.appendChild(entryRow(e, claimedBy.get(e.conceptId) || []));
      layerPanel.appendChild(list);
    }
    if (unclaimed.length > 0) {
      layerPanel.appendChild(el('h3', 'bg-subtitle', T.unclaimedTitle));
      const list = el('ul', 'bg-list');
      for (const x of unclaimed) list.appendChild(exclusionRow(x));
      layerPanel.appendChild(list);
    }
    // Design §5.3: the BÍN credit stands wherever inflections are listed.
    if (data.entries.length > 0) layerPanel.appendChild(el('p', 'bg-credit', T.binCredit));

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

  /** Read the selected book's layer again; the history and worklist panels are left as they are. */
  async function loadLayer() {
    const slug = book;
    const ticket = ++latest.layer;
    if (!slug) return;
    statusLine.textContent = UI.common.loading;
    try {
      const data = await fetchJson(apiPath(slug));
      if (ticket !== latest.layer) return;
      writable = data.writable === true;
      renderHold(data.hold);
      // Q13: the line says why nothing can be changed; an answer without `writable` claims nothing.
      readOnlyLine.textContent = T.readOnly;
      readOnlyLine.hidden = data.writable !== false;
      renderLayer(data);
      statusLine.textContent = '';
    } catch (err) {
      if (ticket !== latest.layer) return;
      statusLine.textContent = T.loadError + err.message;
    }
  }

  function selectBook() {
    book = select.value;
    writable = false;
    closePanel(historyPanel, 'history');
    closePanel(worklistPanel, 'worklist');
    holdBanner.hidden = true;
    readOnlyLine.hidden = true;
    layerPanel.hidden = true;
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

  async function openWorklist(changeId) {
    if (!book || !Number.isInteger(changeId) || changeId < 1) return;
    const slug = book;
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

  // ── Actions ─────────────────────────────────────────────────

  const ACTIONS = {
    history: (b) => openHistory(b.dataset.english),
    worklist: (b) => openWorklist(Number(b.dataset.changeId)),
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

  select.addEventListener('change', selectBook);

  userReady().then(function (user) {
    currentUser = user;
    return loadBooks();
  });
})();
