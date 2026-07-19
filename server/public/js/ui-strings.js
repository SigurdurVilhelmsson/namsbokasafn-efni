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
    validationRevertHint: '\n\nÝttu á „Endurstilla" til að ná aftur upprunalega textanum.',
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
    missingModuleId: 'Villa: vantar einingu',
    scanned: function (count) {
      return 'Skannað! ' + count + ' tillögur fundust.';
    },
    syncedEntries: function (count) {
      return count + ' færslur bættar við skrá';
    },
  },

  // ── MT acceptance (Staðfesta vélþýðingu, item 20b) ─────────
  acceptance: {
    acceptButton: 'Staðfesta MT',
    acceptTooltip: 'Staðfesta að vélþýðingin sé rétt eins og hún er (Ctrl+Shift+Enter)',
    chip: 'Staðfest',
    chipTitle: function (by, at) {
      return 'Staðfest af ' + by + (at ? ' · ' + at : '');
    },
    revokeButton: 'Afturkalla staðfestingu',
    revokeConfirm: 'Afturkalla staðfestingu á þessum bút? Hann telst þá óyfirfarinn aftur.',
    conflict:
      'Innihald bútsins hefur breyst eða bútur er með virka breytingu í ferli. Endurhleð...',
    noneLeft: 'Engir óyfirfarnir bútar eftir í einingunni.',
    unchangedNothingSaved:
      'Textinn er óbreyttur — engin breyting er vistuð og flokkur/athugasemd fylgja ekki með.\n\n' +
      'Ef vélþýðingin er rétt eins og hún er, notaðu „Staðfesta MT".',
    unchangedWithdrawConfirm:
      'Textinn er aftur eins og upprunalega — breytingin í bið verður dregin til baka og ' +
      'flokkur/athugasemd falla niður.\n\n' +
      'Ef vélþýðingin er rétt eins og hún er, notaðu „Staðfesta MT".\n\nHalda áfram?',
  },

  // ── Edit status labels ──────────────────────────────────────
  editStatus: {
    pending: 'Bíður',
    approved: 'Samþykkt',
    rejected: 'Hafnað',
    discuss: 'Umræða',
    superseded: 'Leyst úr gildi',
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
    faithful: 'Ritstýrt — bein þýðing',
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
    cancelled: 'Hætt við.',
    connectionLost: 'Tenging rofnaði',
    connectionLostDetail: '\nGat ekki náð sambandi við þjón.',
    starting: function (action) {
      return 'Ræsi ' + action + '...\n';
    },
  },

  // ── Apply panel ─────────────────────────────────────────────
  apply: {
    loading: 'Hleður...',
    unapplied: function (count) {
      return count + ' samþykktar breytingar til að vista';
    },
    unappliedCombined: function (edits, acceptances) {
      return edits + ' samþykktar breytingar og ' + acceptances + ' staðfestingar til að vista';
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
    saveAndRender: 'Vista + Birta...',
    saveAndRenderProgress: function (count) {
      return 'Vistað (' + count + '), birting í gangi...';
    },
    saveAndRenderDone: 'Vistað + Birt!',
    saveNoRender: 'Vistað, en birting hófst ekki',
    renderFailed: 'Birting mistókst',
    // Phase-aware failure label so an injection failure isn't mislabelled as a
    // rendering failure (the two phases fail for very different reasons).
    phaseFailed: function (phase) {
      const label = phase === 'inject' ? 'Innsetning' : 'Birting';
      return label + ' mistókst';
    },
    renderPhase: function (phase) {
      return 'Birting (' + phase + ')...';
    },
    renderRunning: 'Birting í gangi...',
  },

  // ── Edit-again (revise a published segment) ─────────────────
  editAgain: {
    button: 'Breyta aftur',
    tooltip:
      'Þessi þýðing er þegar birt. Breyting býr til nýja útgáfu sem þarf samþykki og „Vista + Birta“ til að birtast — eldri útgáfan helst í sögunni.',
  },

  // ── Segment editor specific ─────────────────────────────────
  segmentEditor: {
    title: 'Ritill',
    noEnglish: 'Engin enska',
    sentForReview: 'Sent til yfirlestrar!',
    viewReview: 'Skoða yfirlestur →',
    progress: function (edited, total) {
      return edited + '/' + total + ' bútar breytt';
    },
    filterStatus: 'Staða:',
    filterStatusAll: 'Allir',
    filterStatusUnedited: 'Óbreyttir',
    filterStatusEdited: 'Breytt',
    filterStatusApproved: 'Samþykkt',
    filterStatusRejected: 'Hafnað',
    filterStatusDiscuss: 'Í umræðu',
    reverted: 'Afturkallað',
    revertButton: 'Endurstilla',
    revertTooltip: 'Endurstilla bútinn í síðast vistaða útgáfu (eða vélþýðingu)',
    propagateButton: 'Beita víðar',
    propagateTooltip: 'Beita þessari þýðingu á aðra eins búta í bókinni',
    propagateNone: 'Þessi texti finnst hvergi annars staðar.',
    propagateConfirm: (n) =>
      `Þessi texti birtist á ${n} öðrum stað/stöðum. Beita þýðingunni þar líka?`,
    // SR-OOS-2 FIX6c: structure_blocked skips used to fall into the generic
    // "(þegar breytt)" bucket with every other skip reason — give them an
    // explicit label so an editor isn't told a propagation-blocking
    // structural marker is just "already changed".
    propagateResult: (created, skipped, structureBlocked) => {
      let msg = `Fjölgað á ${created} stað/staði`;
      if (skipped) {
        const blocked = structureBlocked || 0;
        const other = skipped - blocked;
        const parts = [];
        if (blocked) parts.push(`${blocked} vegna þess að byggingarmerki hindra`);
        if (other > 0) parts.push(`${other} þegar breytt`);
        msg += `, sleppt ${skipped} (${parts.join(', ')})`;
      }
      return msg;
    },
    propagateError: (msg) => 'Villa við fjölgun: ' + msg,
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
    segMarkerInjected: function (marker) {
      return (
        'Textinn inniheldur bútamerki (' +
        marker +
        '…) sem má ekki standa inni í bút — fjarlægðu það.'
      );
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
      'MT = óyfirfarin vélþýðing · Yfirlesið = mannlegur yfirlestur lokinn · Staðfærð = aðlöguð að Íslandi',
    otherEditor: 'Annar yfirlesari hefur breytt þessum bút',
    reopenEdit: 'Opna aftur til yfirferðar',
  },

  // ── Term lookup ─────────────────────────────────────────────
  termLookup: {
    noResults: 'Ekkert fannst',
    inserted: 'Sett inn!',
    copied: 'Afritað!',
    placeholder: 'Fletta upp hugtaki...',
    openGlossary: 'Opna í orðasafni →',
  },

  termPopup: {
    fallbackNote: 'Ekkert hugtak í fagi bókarinnar — sýnt úr öðru fagi',
  },
};
