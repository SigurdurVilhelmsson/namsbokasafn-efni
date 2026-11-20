/**
 * The book glossary page's pure read model and the labels the page and the server share
 * (design §5.3). No DOM: the page (book-glossary.js) turns these into elements with textContent.
 *
 * UMD: browser global `bookGlossaryView` + CommonJS module.exports, same pattern as
 * segment-validation.js. The server needs INFLECTION_RESULT_LABELS for its activity text, and
 * ui-strings.js cannot be required, so those labels live here.
 */
(function (root) {
  'use strict';

  // Keys are exactly bookGlossaryInflections.RESULTS (pinned by bookGlossaryView.test.js).
  const INFLECTION_RESULT_LABELS = Object.freeze({
    forms: 'beygingarmyndir skráðar',
    'not-in-bin': 'ekki í BÍN',
    ambiguous: 'tvíræð í BÍN',
    'base-form-only': 'BÍN gefur aðeins grunnmyndina',
    'several-words': 'fleiri en eitt orð',
    'file-absent': 'BÍN-skráin er ekki á þjóninum',
    already: 'beygingar þegar skráðar',
    superseded: 'orðinu var breytt meðan leitað var',
    'no-term': 'engin íslensk þýðing',
    timeout: 'leitin rann út á tíma',
    error: 'villa í leit',
  });

  const ACTION_LABELS = Object.freeze({
    exclude: 'Útilokað',
    unexclude: 'Útilokun afturkölluð',
    'entry-add': 'Færsla bætt við',
    'entry-change': 'Færslu breytt',
    'entry-remove': 'Færsla fjarlægð',
  });

  const EMPTY_REASONS = Object.freeze({
    'not-applicable': 'Þessi breyting hefur engan verkefnalista.',
    'add-alongside': 'Þýðingu var bætt við til hliðar; gamla orðið er áfram leyfilegt.',
    'no-new-word': 'Íslenska orðinu var ekki breytt.',
    'exclusion-undone': 'Útilokun gamla orðsins var afturkölluð; það er aftur leyfilegt.',
    'nothing-to-search': 'Ekkert er til að leita að.',
  });

  /**
   * One line for an entry's inflection state, as GET /:book reports it.
   *
   * @param {{state: string, count?: number, reason?: string|null}} state
   * @returns {string}
   */
  function inflectionLabel(state) {
    if (state.state === 'forms') return state.count + ' beygingarmyndir';
    if (state.state === 'pending') return 'sæki…';
    if (state.reason == null) {
      return 'aðeins rithátturinn — engin leit skráð (t.d. eftir endurræsingu)';
    }
    return 'aðeins rithátturinn — ' + INFLECTION_RESULT_LABELS[state.reason];
  }

  /**
   * Forms of three or more words: the editor's term prompts match them, the export does not
   * (design §5.3).
   *
   * @param {string[]} forms
   * @returns {string[]}
   */
  function editorOnlyForms(forms) {
    return forms.filter((f) => f.trim().split(/\s+/).length >= 3);
  }

  /** @param {string} action a book_glossary_change action */
  function actionLabel(action) {
    return ACTION_LABELS[action];
  }

  /**
   * An excerpt split at its match, with an ellipsis where the text was cut.
   *
   * @param {{text: string, start: number, length: number, cutBefore: boolean, cutAfter: boolean}} excerpt
   * @returns {{before: string, match: string, after: string}}
   */
  function excerptParts(excerpt) {
    const end = excerpt.start + excerpt.length;
    return {
      before: (excerpt.cutBefore ? '…' : '') + excerpt.text.slice(0, excerpt.start),
      match: excerpt.text.slice(excerpt.start, end),
      after: excerpt.text.slice(end) + (excerpt.cutAfter ? '…' : ''),
    };
  }

  /**
   * The sentence that heads a worklist, one per state, so an empty list says why it is empty.
   *
   * @param {{kind: string|null, reason: string|null, units: number, total: number}} w
   * @returns {string}
   */
  function worklistSummary(w) {
    if (w.kind === null) return EMPTY_REASONS[w.reason];
    if (w.units === 0) return 'Bókin hefur engar einingar til að leita í.';
    if (w.total === 0) return 'Enginn bútur notar lengur gamla orðið.';
    return w.total + ' bútar nota enn gamla orðið.';
  }

  /**
   * A note naming the units the scan could not read, or null when it read them all.
   *
   * @param {{unreadable: string[]}} w
   * @returns {string|null}
   */
  function unreadableNote(w) {
    if (!w.unreadable || w.unreadable.length === 0) return null;
    return (
      'Ekki tókst að lesa ' +
      w.unreadable.length +
      ' einingar (' +
      w.unreadable.join(', ') +
      '); þær voru ekki skoðaðar.'
    );
  }

  /**
   * The English forms typed into a form's box: one per line, trimmed, blank lines and exact
   * duplicates dropped, order kept. Case is kept: the server decides what counts as the same form.
   *
   * @param {string} text
   * @returns {string[]}
   */
  function formsFromText(text) {
    const forms = [];
    for (const line of String(text).split('\n')) {
      const form = line.trim();
      if (form && forms.indexOf(form) === -1) forms.push(form);
    }
    return forms;
  }

  /**
   * The body of a change to the book's own entry: only the fields that differ, with the forms
   * compared as sets of exact strings, so a reordering alone sends nothing. Null when nothing
   * differs, and the page then sends nothing.
   *
   * @param {{english: string[], icelandic: string|null}} entry
   * @param {{icelandic: string, forms: string[]}} edited
   * @returns {{icelandic?: string, forms?: string[]}|null}
   */
  function changeBody(entry, edited) {
    const body = {};
    if (edited.icelandic !== entry.icelandic) body.icelandic = edited.icelandic;
    const was = new Set(entry.english);
    const now = new Set(edited.forms);
    if (was.size !== now.size || [...now].some((f) => !was.has(f))) body.forms = edited.forms;
    return Object.keys(body).length > 0 ? body : null;
  }

  /**
   * The concepts a "replace" may hide (design §5.3): the winner, checked, then the tied and the
   * other in-scope answers, unchecked, each concept once. None when the book's own entry wins: that
   * entry is changed, not replaced.
   *
   * @param {{winner: object|null, reason: string|null, tied: object[], alsoInScope: object[]}} resolution
   * @returns {Array<{conceptId: number, text: string, domain: string, checked: boolean}>}
   */
  function replaceCandidates(resolution) {
    if (!resolution || resolution.reason === 'book-entry') return [];
    const out = [];
    const seen = new Set();
    const offer = (c, checked) => {
      if (!c || seen.has(c.conceptId)) return;
      seen.add(c.conceptId);
      out.push({ conceptId: c.conceptId, text: c.text, domain: c.domain, checked: checked });
    };
    offer(resolution.winner, true);
    for (const c of resolution.tied || []) offer(c, false);
    for (const c of resolution.alsoInScope || []) offer(c, false);
    return out;
  }

  const api = {
    INFLECTION_RESULT_LABELS: INFLECTION_RESULT_LABELS,
    inflectionLabel: inflectionLabel,
    editorOnlyForms: editorOnlyForms,
    actionLabel: actionLabel,
    excerptParts: excerptParts,
    worklistSummary: worklistSummary,
    unreadableNote: unreadableNote,
    formsFromText: formsFromText,
    changeBody: changeBody,
    replaceCandidates: replaceCandidates,
  };
  root.bookGlossaryView = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
