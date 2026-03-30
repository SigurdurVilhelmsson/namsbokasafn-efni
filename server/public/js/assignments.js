/**
 * Assignments Page
 *
 * Chapter-centric assignment management: shows all chapters for a book,
 * lets admins assign/unassign editors via dropdown selects.
 *
 * All state is encapsulated in this IIFE.
 * Relies on globally available fetchJson() and escapeHtml() from htmlUtils.js.
 */
(function () {
  'use strict';

  // ================================================================
  // STATE
  // ================================================================

  let currentBook = '';
  let currentEditors = [];

  // ================================================================
  // TOAST
  // ================================================================

  /**
   * Show a toast notification that auto-dismisses after 3 seconds.
   * @param {string} message
   * @param {'success'|'error'} [type='success']
   */
  function showToast(message, type) {
    type = type || 'success';

    // Remove any existing toast
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type + ' show';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(function () {
      toast.classList.remove('show');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 3000);
  }

  // ================================================================
  // STATS
  // ================================================================

  /**
   * Render the three stat cards from the merged chapter list.
   * @param {Array<{assignment: object|null}>} chapters
   */
  function renderStats(chapters) {
    const assigned = chapters.filter(function (ch) {
      return ch.assignment && ch.assignment.user_id;
    }).length;
    const unassigned = chapters.length - assigned;

    // Count distinct editors assigned to at least one chapter
    const editorIds = {};
    chapters.forEach(function (ch) {
      if (ch.assignment && ch.assignment.user_id) {
        editorIds[ch.assignment.user_id] = true;
      }
    });
    const editorCount = Object.keys(editorIds).length;

    document.getElementById('stat-assigned').textContent = assigned;
    document.getElementById('stat-unassigned').textContent = unassigned;
    document.getElementById('stat-editors').textContent = editorCount;
  }

  // ================================================================
  // TABLE
  // ================================================================

  /**
   * Build and render the assignments table.
   * @param {Array<object>} chapters - Merged chapter+assignment objects
   * @param {string} book - Current book slug
   */
  function renderTable(chapters, book) {
    const tbody = document.getElementById('assignments-tbody');
    const editors = currentEditors;

    const rows = chapters.map(function (ch) {
      const isAssigned = ch.assignment && ch.assignment.user_id;
      const rowClass = isAssigned ? '' : ' class="row-unassigned"';

      const title = ch.titleIs || ch.title || 'Kafli ' + ch.chapter;

      // Build editor dropdown
      let options = '<option value="">— Óúthlutað —</option>';
      editors.forEach(function (ed) {
        const selected = isAssigned && ch.assignment.user_id === ed.id ? ' selected' : '';
        options +=
          '<option value="' +
          escapeHtml(String(ed.id)) +
          '"' +
          selected +
          '>' +
          escapeHtml(ed.name || 'Notandi ' + ed.id) +
          '</option>';
      });

      const select =
        '<select class="assign-select"' +
        ' data-book="' +
        escapeHtml(book) +
        '"' +
        ' data-chapter="' +
        escapeHtml(String(ch.chapter)) +
        '"' +
        ' onchange="window._assignmentsPage.handleAssignChange(this)">' +
        options +
        '</select>';

      const editorLink =
        '<a href="/editor?book=' +
        encodeURIComponent(book) +
        '&chapter=' +
        encodeURIComponent(ch.chapter) +
        '" class="link-accent">Opna &rarr;</a>';

      return (
        '<tr' +
        rowClass +
        '>' +
        '<td>K' +
        escapeHtml(String(ch.chapter)) +
        '</td>' +
        '<td>' +
        escapeHtml(title) +
        '</td>' +
        '<td>' +
        select +
        '</td>' +
        '<td>—</td>' +
        '<td>' +
        editorLink +
        '</td>' +
        '</tr>'
      );
    });

    tbody.innerHTML = rows.join('');
  }

  // ================================================================
  // ASSIGNMENT HANDLER
  // ================================================================

  /**
   * Handle a change on an assignment dropdown.
   * POSTs or DELETEs from the assignment API, then reloads.
   * @param {HTMLSelectElement} selectEl
   */
  function handleAssignChange(selectEl) {
    const book = selectEl.dataset.book;
    const chapter = selectEl.dataset.chapter;
    const userId = selectEl.value;

    let promise;
    if (userId) {
      promise = fetchJson(
        '/api/admin/assignments/' + encodeURIComponent(book) + '/' + encodeURIComponent(chapter),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ userId: parseInt(userId, 10) }),
        }
      );
    } else {
      promise = fetchJson(
        '/api/admin/assignments/' + encodeURIComponent(book) + '/' + encodeURIComponent(chapter),
        {
          method: 'DELETE',
          credentials: 'same-origin',
        }
      );
    }

    promise
      .then(function () {
        showToast('Úthlutun uppfærð');
        loadAssignments(currentBook);
      })
      .catch(function (err) {
        showToast(err.message || 'Villa við vistun', 'error');
        // Reload to restore correct state
        loadAssignments(currentBook);
      });
  }

  // ================================================================
  // DATA LOADING
  // ================================================================

  /**
   * Fetch assignments and chapter list in parallel, merge, and render.
   * @param {string} book - Book slug
   */
  function loadAssignments(book) {
    if (!book) return;
    currentBook = book;

    const loadingEl = document.getElementById('assignments-loading');
    const contentEl = document.getElementById('assignments-content');
    loadingEl.style.display = '';
    contentEl.style.display = 'none';

    Promise.all([
      fetchJson('/api/admin/assignments/' + encodeURIComponent(book), {
        credentials: 'same-origin',
      }),
      fetchJson('/api/segment-editor/' + encodeURIComponent(book) + '/chapters', {
        credentials: 'same-origin',
      }),
    ])
      .then(function (results) {
        const adminData = results[0];
        const chapterList = results[1];

        const assignments = adminData.assignments || [];
        currentEditors = adminData.editors || [];

        // Index assignments by chapter number for fast lookup
        const assignmentMap = {};
        assignments.forEach(function (a) {
          assignmentMap[a.chapter] = a;
        });

        // Merge: attach assignment (or null) to each chapter
        const chapters = ((chapterList && chapterList.chapters) || []).map(function (ch) {
          return Object.assign({}, ch, {
            assignment: assignmentMap[ch.chapter] || null,
          });
        });

        renderStats(chapters);
        renderTable(chapters, book);

        loadingEl.style.display = 'none';
        contentEl.style.display = '';
      })
      .catch(function (err) {
        loadingEl.textContent = 'Villa: ' + (err.message || 'Gat ekki sótt gögn');
      });
  }

  // ================================================================
  // INIT
  // ================================================================

  document.addEventListener('DOMContentLoaded', function () {
    const bookSelect = document.getElementById('book-select');

    // Handle URL param ?book=
    const urlParams = new URLSearchParams(window.location.search);
    const urlBook = urlParams.get('book');
    if (urlBook) {
      bookSelect.dataset.default = urlBook;
    }

    // Listen for book changes (including auto-selection from bookSelector.js)
    bookSelect.addEventListener('change', function () {
      if (bookSelect.value) {
        loadAssignments(bookSelect.value);
      }
    });
  });

  // ================================================================
  // PUBLIC API (for inline event handlers)
  // ================================================================

  window._assignmentsPage = {
    handleAssignChange: handleAssignChange,
  };
})();
