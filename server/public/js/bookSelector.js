/**
 * Book Selector Utility
 *
 * Fetches the registered book list from /api/books/list and populates
 * all <select> elements with class "book-select" on the page.
 *
 * Usage: include this script in any view that has book dropdowns.
 * Each <select> should have class="book-select" and will be auto-populated.
 *
 * Attributes on the <select> element:
 *   data-allow-all="true"  — prepend an "Allar bækur" (all books) option with value=""
 *   data-placeholder="..." — custom placeholder text (default: "Veldu bók...")
 *
 * The selected book is persisted in localStorage('selectedBook') so the
 * user's choice is remembered across page loads.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'selectedBook';
  let cachedBooks = null;

  /**
   * Fetch the book list from the API (cached per page load).
   * @returns {Promise<Array<{slug: string, label: string}>>}
   */
  function fetchBooks() {
    if (cachedBooks) return Promise.resolve(cachedBooks);

    return fetch('/api/books/list', { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to fetch books');
        return res.json();
      })
      .then(function (data) {
        cachedBooks = data.books || [];
        return cachedBooks;
      })
      .catch(function () {
        // Fallback: return empty list so dropdowns degrade gracefully
        return [];
      });
  }

  /**
   * Populate a single <select> element with book options.
   * @param {HTMLSelectElement} select
   * @param {Array<{slug: string, label: string}>} books
   */
  function populateSelect(select, books) {
    // Preserve any value already set (e.g. from URL params)
    const currentValue = select.value || select.dataset.default || '';

    // Check localStorage for persisted selection
    let stored = '';
    try {
      stored = localStorage.getItem(STORAGE_KEY) || '';
    } catch {
      /* localStorage unavailable */
    }

    // Clear existing options
    select.innerHTML = '';

    // Add placeholder or "all books" option
    const allowAll = select.dataset.allowAll === 'true';
    const placeholder = select.dataset.placeholder || 'Veldu bók...';

    if (allowAll) {
      const allOpt = document.createElement('option');
      allOpt.value = '';
      allOpt.textContent = 'Allar bækur';
      select.appendChild(allOpt);
    } else {
      const phOpt = document.createElement('option');
      phOpt.value = '';
      phOpt.textContent = placeholder;
      select.appendChild(phOpt);
    }

    // Add book options
    books.forEach(function (book) {
      const opt = document.createElement('option');
      opt.value = book.slug;
      opt.textContent = book.label;
      select.appendChild(opt);
    });

    // Restore selection: prefer current value > stored > first book
    const preferred = currentValue || stored;
    if (
      preferred &&
      books.some(function (b) {
        return b.slug === preferred;
      })
    ) {
      select.value = preferred;
    } else if (!allowAll && books.length > 0) {
      select.value = books[0].slug;
    }

    // Save selection on change
    select.addEventListener('change', function () {
      try {
        if (select.value) {
          localStorage.setItem(STORAGE_KEY, select.value);
        }
      } catch {
        /* localStorage unavailable */
      }
    });
  }

  /**
   * Initialize all book selectors on the page.
   * Call again if new selectors are added dynamically.
   */
  function initBookSelectors() {
    const selects = document.querySelectorAll('.book-select');
    if (selects.length === 0) return Promise.resolve();

    return fetchBooks().then(function (books) {
      selects.forEach(function (select) {
        populateSelect(select, books);
      });
    });
  }

  // Auto-init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBookSelectors);
  } else {
    initBookSelectors();
  }

  // Expose for manual re-init and direct access
  window.bookSelector = {
    init: initBookSelectors,
    fetchBooks: fetchBooks,
  };
})();
