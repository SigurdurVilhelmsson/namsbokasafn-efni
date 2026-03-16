/**
 * UI String Constants — all user-facing Icelandic text in one place.
 *
 * Loaded via <script> before editor JS files.
 * Usage: UI.save.allSaved, UI.confirm.discardChanges(), etc.
 *
 * For parameterized messages, use functions:
 *   UI.confirm.draftRecovery(5) → 'Fundust 5 óvistuð drög frá síðustu lotu. Endurheimta?'
 */

// eslint-disable-next-line no-unused-vars
const UI = {
  // ── Common ──────────────────────────────────────────────────
  common: {
    error: 'Villa',
    errorPrefix: 'Villa: ',
    errorLoading: 'Villa við að hlaða einingu: ',
    errorSaving: 'Villa við að vista: ',
    loading: 'Hleður...',
    loadingModule: 'Hleður einingu...',
    loadingChapter: 'Hleður kafla...',
    selectChapter: 'Veldu kafla...',
    selectOption: 'Veldu...',
    noModulesFound: 'Engar einingar fundust.',
    localStorageFull: 'Geymsla í vafra er full — drög gætu glatast.',
  },

  // ── Save status ─────────────────────────────────────────────
  save: {
    allSaved: 'Allar breytingar vistaðar',
    unsaved: function (count) {
      return count === 1 ? '1 óvistuð breyting' : count + ' óvistaðar breytingar';
    },
    lastSaved: 'Síðast vistað: ',
    saving: 'Vistar...',
    saved: 'Vistað',
    changed: 'Breytt',
    autoSaving: 'Sjálfvirk vistun...',
    conflict: 'Árekstrar!',
    errorIndicator: 'Villa!',
  },

  // ── Confirm/alert dialogs ───────────────────────────────────
  confirm: {
    draftRecovery: function (count) {
      return 'Fundust ' + count + ' óvistuð drög frá síðustu lotu. Endurheimta?';
    },
    discardChanges: 'Þú átt óvistaðar breytingar. Viltu henda þeim?',
    leaveUnsaved: 'Þú átt óvistaðar breytingar. Viltu yfirgefa?',
    closePanels: 'Opnum klippispjöldum verður lokað. Viltu halda áfram?',
    unapprove: 'Afturkalla samþykki? Breytingin fer til baka í stöðuna „bíður".',
    submitForReview: function (count) {
      return 'Senda ' + count + ' breytingar til yfirlestrar?';
    },
    acceptSuggestions: function (count) {
      return 'Samþykkja ' + count + ' tillögur?';
    },
    rejectSuggestions: function (count) {
      return 'Hafna ' + count + ' tillögum?';
    },
    conflictReload:
      'Einingu hefur verið breytt af öðrum notanda.\n' +
      'Endurhlaða til að sjá nýjustu útgáfu?\n\n' +
      '(Óvistaðar breytingar þínar verða geymdar sem drög.)',
    validationBlocked: 'Ekki hægt að vista:\n\n',
    validationWarnings: 'Athugið:\n\n',
    validationContinue: '\n\nViltu halda áfram?',
    bulkValidationBlocked: 'Ekki hægt að vista — vandamál í eftirfarandi bútum:\n\n',
  },

  alert: {
    noChanges: 'Engar breytingar til að senda.',
    noUnsavedChanges: 'Engar óvistaðar breytingar.',
    noPendingSuggestions: 'Engar tillögur í bið',
    noAcceptedSuggestions: 'Engar samþykktar tillögur til að samstilla',
    modificationRequired: 'Breyting er nauðsynleg',
    missingModuleId: 'Villa: vantar moduleID',
    scanned: function (count) {
      return 'Skannað! ' + count + ' tillögur fundust.';
    },
    syncedEntries: function (count) {
      return count + ' færslur bættar við skrá';
    },
  },

  // ── Edit status labels ──────────────────────────────────────
  editStatus: {
    pending: 'Bíður',
    approved: 'Samþykkt',
    rejected: 'Hafnað',
    discuss: 'Umræða',
  },

  // ── Edit category labels ────────────────────────────────────
  editCategory: {
    terminology: 'Hugtök',
    accuracy: 'Nákvæmni',
    readability: 'Læsileiki',
    style: 'Stíll',
    omission: 'Úrfelling',
  },

  // ── Module source labels ────────────────────────────────────
  sourceLabels: {
    'mt-output': 'MT — vélþýðing',
    faithful: 'Ritstýrt — yfirfarin þýðing',
    localized: 'Staðfærð — aðlöguð að íslensku samhengi',
  },

  // ── Pipeline status ─────────────────────────────────────────
  pipeline: {
    running: 'Í gangi...',
    runningPhase: function (phase) {
      return 'Í gangi (' + phase + ')...';
    },
    completed: 'Lokið',
    failed: 'Mistókst',
    connectionLost: 'Tenging rofnaði',
    connectionLostDetail: '\nGat ekki náð sambandi við þjón.',
    starting: function (action) {
      return 'Starting ' + action + '...\n';
    },
  },

  // ── Apply panel ─────────────────────────────────────────────
  apply: {
    loading: 'Hleður...',
    unapplied: function (count) {
      return count + ' samþykktar breytingar til að vista';
    },
    allApplied: function (total) {
      return 'Allar ' + total + ' samþykktar breytingar vistaðar';
    },
    noApproved: 'Engar samþykktar breytingar',
    errorLoading: 'Villa við að sækja stöðu',
    saving: 'Vista...',
    saved: function (count) {
      return 'Vistað (' + count + ' breytingar)';
    },
    saveAndRender: 'Vista + Render...',
    saveAndRenderProgress: function (count) {
      return 'Vistað (' + count + '), render í gangi...';
    },
    saveAndRenderDone: 'Vistað + Render lokið!',
    saveNoRender: 'Vistað, en render startaði ekki',
    renderFailed: 'Render mistókst',
    renderPhase: function (phase) {
      return 'Render (' + phase + ')...';
    },
    renderRunning: 'Render í gangi...',
  },

  // ── Segment editor specific ─────────────────────────────────
  segmentEditor: {
    title: 'Ritstjóri',
    titleModule: function (moduleId) {
      return 'Ritstjóri — ' + moduleId;
    },
    noEnglish: 'Engin enska',
    sentForReview: 'Sent til yfirlestrar!',
    viewReview: 'Skoða yfirlestur →',
  },

  // ── Localization editor specific ────────────────────────────
  localization: {
    savingBulk: function (count) {
      return 'Vistar ' + count + ' búta...';
    },
    savedBulk: function (count) {
      return count + ' bútar vistaðar';
    },
    scanning: 'Skannar...',
  },

  // ── Localization review status labels ───────────────────────
  reviewStatus: {
    faithful_approved: 'Tilbúið fyrir staðfæringu',
    localization_in_progress: 'Í vinnslu',
    localization_submitted: 'Sent til samþykktar',
    localization_approved: 'Samþykkt',
  },

  // ── Suggestion type labels ──────────────────────────────────
  suggestionType: {
    unit_conversion: 'Einingar',
    cultural_reference: 'Menning',
    currency: 'Gjaldmiðill',
    agency_reference: 'Stofnanir',
    regional_example: 'Dæmi',
    other: 'Annað',
  },

  // ── Suggestion status labels ────────────────────────────────
  suggestionStatus: {
    accepted: 'Samþykkt',
    rejected: 'Hafnað',
    modified: 'Breytt og samþykkt',
  },

  // ── Log type labels ─────────────────────────────────────────
  logType: {
    unit_conversion: 'Einingaumreikn.',
    cultural_adaptation: 'Menningarlegt',
    added_context: 'Skýringar',
    removed_content: 'Fjarlægt',
    terminology: 'Orð',
    other: 'Annað',
  },

  // ── History popover ─────────────────────────────────────────
  history: {
    title: 'Breytingasaga',
    titleCount: function (count) {
      return 'Breytingasaga (' + count + ')';
    },
    empty: 'Engin saga.',
    noEntries: 'Engar færslur í skrá.',
    restore: 'Endurheimta',
  },

  // ── Validation messages ─────────────────────────────────────
  validation: {
    mathMissing: function (marker) {
      return 'Stærðfræðimerkið ' + marker + ' vantar — það er í enskum texta og má ekki fjarlægja.';
    },
    mathMissingShort: function (marker) {
      return 'Stærðfræðimerkið ' + marker + ' vantar.';
    },
    brRemoved: function (from, to) {
      return '[[BR]] línuskil voru fjarlægð (' + from + ' → ' + to + ').';
    },
    brRemovedShort: '[[BR]] línuskil voru fjarlægð.',
    xrefMissing: function (ref) {
      return 'Tilvísun ' + ref + ' vantar — hún er í enskum texta og má ekki fjarlægja.';
    },
    xrefMissingShort: function (ref) {
      return 'Tilvísun ' + ref + ' vantar.';
    },
    linkRemoved: function (link) {
      return 'Hlekkur ' + link + ' var fjarlægður.';
    },
    docRefMissing: function (ref) {
      return 'Skjalatilvísun ' + ref + ' vantar — hún er í enskum texta og má ekki fjarlægja.';
    },
    docRefMissingShort: function (ref) {
      return 'Skjalatilvísun ' + ref + ' vantar.';
    },
    mediaMissing: function (marker) {
      return 'Myndarmerki ' + marker + ' vantar — það er í enskum texta og má ekki fjarlægja.';
    },
    mediaMissingShort: function (marker) {
      return 'Myndarmerki ' + marker + ' vantar.';
    },
    spaceRemoved: function (from, to) {
      return '[[SPACE]] bil var fjarlægt (' + from + ' → ' + to + ').';
    },
    segmentCleared: 'Bútur var tæmdur — var það viljandi?',
    unmatchedPair: function (name, count) {
      return 'Ójafn fjöldi ' + name + ' merkja (' + count + ') — vantar lokun?';
    },
    unmatchedEmphasis: function (open, close) {
      return 'Ójafn fjöldi áherslumerkja: ' + open + '× {= en ' + close + '× =} — vantar lokun?';
    },
    unmatchedSubscript: function (count) {
      return 'Ójafn fjöldi ~ merkja (' + count + ') — vantar lokun á niðurskrift?';
    },
    unmatchedSuperscript: function (count) {
      return 'Ójafn fjöldi ^ merkja (' + count + ') — vantar lokun á uppskrift?';
    },
    // Formatting pair names (used with unmatchedPair)
    pairNames: {
      bold: 'feitletrað (**)',
      term: 'hugtak (__)',
      underline: 'undirstrikað (++)',
    },
  },

  // ── Module badges ───────────────────────────────────────────
  badges: {
    pass1Done: 'Yfirlestur 1',
    pass1Missing: 'Vantar yfirlestur 1',
    localized: 'Staðfært',
  },

  // ── Tooltip strings ─────────────────────────────────────────
  tooltips: {
    sourceTypes:
      'MT = óyfirfarin vélþýðing · Yfirlesið = mannlegri yfirferð lokið · Staðfærð = aðlöguð að Íslandi',
    otherEditor: 'Annar ritstjóri hefur breytt þessum bút',
  },

  // ── Term lookup ─────────────────────────────────────────────
  termLookup: {
    noResults: 'Ekkert fannst',
    inserted: 'Sett inn!',
    copied: 'Afritað!',
    placeholder: 'Fletta upp hugtaki...',
    openGlossary: 'Opna í orðasafni →',
  },
};
