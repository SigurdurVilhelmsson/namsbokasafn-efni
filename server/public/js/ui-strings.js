/**
 * UI String Constants — all user-facing Icelandic text in one place.
 *
 * Loaded via <script> before editor JS files.
 * Usage: UI.save.allSaved, UI.confirm.discardChanges(), etc.
 *
 * For parameterized messages, use functions:
 *   UI.confirm.draftRecovery(5) → 'Fundust 5 óvistuð drög frá síðustu lotu. Endurheimta? (…)'
 */

// "í kafla" (dative singular) for a count of 1, "í köflum" (dative plural) otherwise.
const inChapters = (n) => (n === 1 ? 'í kafla' : 'í köflum');

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
    // The segment editor's status line when no row holds unsaved text. It does not claim a save: the same line
    // shows after a text was discarded (interface audit 2026-11-13, ED-04).
    nothingUnsaved: 'Engar óvistaðar breytingar',
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
    // Both editors delete the drafts when this is answered Cancel, so it says so (interface audit 2026-11-13,
    // ED-18). The last sentence was read and approved by [USER] on 2026-11-14.
    draftRecovery: function (count) {
      return (
        'Fundust ' +
        count +
        ' óvistuð drög frá síðustu lotu. Endurheimta? (Ef hætt er við er drögunum eytt.)'
      );
    },
    discardChanges: 'Þú átt óvistaðar breytingar. Viltu henda þeim?',
    leaveUnsaved: 'Þú átt óvistaðar breytingar. Viltu yfirgefa?',
    // The segment editor asks this before it leaves a unit with unsaved text in `count` segments: "← Til baka",
    // and another unit opened over this one (interface audit 2026-11-13, ED-01). It says what OK does: the text is
    // thrown away, unlike closing the tab, which keeps a draft. Read and approved by [USER] on 2026-11-14.
    leaveDiscards: function (count) {
      return (
        'Þú átt óvistaðan texta í ' +
        count +
        (count % 10 === 1 && count % 100 !== 11 ? ' bút' : ' bútum') +
        '. Honum verður hent ef þú ferð úr einingunni. Halda áfram?'
      );
    },
    // No longer asked by the segment editor (since the 2026-11-13 interface audit a re-render leaves a row with
    // unsaved text in place). Kept: the server's BASE_MISSING message quotes it for a page loaded before G1.1, and
    // specs name it when they check that it is not asked.
    closePanels: 'Opnum klippispjöldum verður lokað. Viltu halda áfram?',
    unapprove: 'Afturkalla samþykki? Breytingin fer til baka í stöðuna „bíður".',
    // "Merkja sem lokið" (register §C222; [USER]-approved 2026-11-17)
    markDone: 'Merkja þennan hluta sem lokið? Þú getur haldið áfram að breyta honum á eftir.',
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
    // "Merkja sem lokið" refusals (register §C222; [USER]-approved 2026-11-17)
    doneUnsaved:
      'Óvistaður texti er í hlutanum. Vistaðu hann eða hentu honum áður en þú merkir hlutann sem lokið.',
    doneNotRecorded: 'Ekki tókst að skrá að hlutanum sé lokið. Reyndu aftur.',
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
    // MTA-R3: the keyboard stream deliberately skips rows with edit history, so
    // "none left" must not imply the module is done while accept buttons are
    // still on screen.
    noneLeftContested: function (n) {
      return (
        'Engir ósnertir bútar eftir — ' +
        n +
        // Icelandic number agreement follows the LAST digit: 21/31/101 take the
        // singular, 11 takes the plural. Noun and verb are both in the switched
        // fragment, so the whole clause agrees together.
        (n % 10 === 1 && n % 100 !== 11
          ? ' bútur með fyrri breytingu bíður'
          : ' bútar með fyrri breytingu bíða') +
        ' staðfestingar. Smelltu á „Staðfesta MT" í þeim röðum.'
      );
    },
    // MTA-R3: a contested row may be attested, but the reason must be ON SCREEN
    // — a title= tooltip is invisible on a keyboard or touch pass, and this is
    // an attestation, not a convenience action.
    contestedRejected: 'Breytingu var hafnað — vélþýðingin stendur óbreytt.',
    contestedSuperseded: 'Fyrri breyting var dregin til baka — vélþýðingin stendur óbreytt.',
    discussBlocked: 'Umræða er opin — leysa þarf úr henni áður en hægt er að staðfesta.',
    unchangedNothingSaved:
      'Textinn er óbreyttur — engin breyting er vistuð og flokkur/athugasemd fylgja ekki með.\n\n' +
      'Ef vélþýðingin er rétt eins og hún er, notaðu „Staðfesta MT".',
    unchangedWithdrawConfirm:
      'Textinn er aftur eins og upprunalega — breytingin í bið verður dregin til baka og ' +
      'flokkur/athugasemd falla niður.\n\n' +
      'Ef vélþýðingin er rétt eins og hún er, notaðu „Staðfesta MT".\n\nHalda áfram?',
  },

  // ── Refused saves (G1.1, spec §5.6, §5.7, §5.18; index decision 12) ──
  // Wording approved by [USER] 2026-11-04 (index decision 13); draftNotice.refused, changed 2026-11-04, was approved
  // as written in a later answer the same day (index § Answers, "Later answers").
  refusal: {
    textKept: 'Textinn sem þú skrifaðir var geymdur og birtist aftur í bútnum.',
    generic: 'Vistun var hafnað.',
    // An old page cannot show this: the server's own BASE_MISSING message must also ask for F5.
    baseMissing:
      'Vistun var hafnað því síðan er úr eldri útgáfu kerfisins. Textinn sem þú skrifaðir var ' +
      'geymdur. Ýttu á F5 til að endurhlaða síðuna og vistaðu svo aftur.',
  },
  draftNotice: {
    staleBase:
      'Textinn sem þessi drög voru skrifuð við hefur breyst. Röðin sýnir nýja textann; gerðu ' +
      'breytinguna aftur á honum og vistaðu.',
    staleDisplayed:
      'Breytingin sem birtist þegar þú skrifaðir hefur breyst síðan. Berðu textann þinn saman ' +
      'við röðina og vistaðu aftur.',
    // An edit of the row was saved after this page loaded and was never shown on it: from another tab or
    // device, or by another editor (interface audit 2026-11-13, ED-05). Read and approved by [USER] on 2026-11-14.
    unseenEdit:
      'Breyting á þessum bút var vistuð eftir að þú opnaðir síðuna, til dæmis í öðrum flipa. Berðu ' +
      'textann þinn saman við röðina og vistaðu aftur.',
    baseMissing:
      'Vistun var hafnað því hún kom frá eldri útgáfu síðunnar. Berðu textann saman við röðina ' +
      'og vistaðu aftur.',
    duplicateId:
      'Ekki er hægt að vista þennan bút fyrr en lagfæring á tvíteknum auðkennum er komin (sama ' +
      'auðkenni kemur tvisvar fyrir í einingunni). Textinn þinn er geymdur hér og verður ekki sendur.',
    bookNotMinted: 'Ekki er hægt að vista breytingar í þessari bók. Textinn þinn er geymdur hér.',
    // Another editor saved the row first (interface audit 2026-11-13, ED-02). Read and approved by [USER] on
    // 2026-11-14.
    conflict:
      'Annar yfirlesari vistaði breytingu á þessum bút á meðan þú skrifaðir. Berðu textann þinn saman ' +
      'við röðina og vistaðu aftur.',
    // A kept text whose row shows another editor's undecided edit: the row offers no Breyta, and the kept text is
    // not saved over that edit (interface audit 2026-11-13). Read and approved by [USER] on 2026-11-14.
    rowNotYours:
      'Annar yfirlesari á óafgreidda breytingu á þessum bút. Textinn þinn er geymdur hér, en hann verður ' +
      'ekki vistaður fyrr en sú breyting hefur verið afgreidd.',
    noLayer:
      'Engin íslensk útgáfa er til fyrir þessa einingu og því er ekki hægt að vista. Textinn ' +
      'þinn er geymdur hér.',
    // The generic notice: any parked replay with no refusal code of its own, a refusal (a 404, a conflict) or a
    // replay that 5xx answers or network failures left with no retry (decision 28), so it says the save did not go
    // through, not that it was refused.
    refused:
      'Vistun sem beið í biðröð tókst ekki. Textinn þinn er hér; berðu hann saman við röðina og ' +
      'vistaðu aftur.',
    discardKept: 'Henda geymda textanum? Hann glatast þá.',
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
    // item 20b final-review F2: an accept-only publish has appliedCount === 0,
    // so `applied_acceptances > 0` needs its own message instead of falling
    // through to noApproved.
    acceptancesApplied: function (n) {
      return n + ' staðfestingar vistaðar';
    },
    errorLoading: 'Villa við að sækja stöðu',
    saving: 'Vista...',
    // item 20b final-review F2: accept-only / mixed apply must surface the
    // acceptance count too, not just appliedCount (which is 0 for an
    // accept-only module) — accepted is an optional trailing arg.
    saved: function (count, accepted) {
      return (
        'Vistað (' +
        count +
        ' breytingar' +
        (accepted ? ', ' + accepted + ' staðfestingar' : '') +
        ')'
      );
    },
    saveAndRender: 'Vista + Birta...',
    saveAndRenderProgress: function (count, accepted) {
      return (
        'Vistað (' +
        count +
        (accepted ? ', ' + accepted + ' staðfestingar' : '') +
        '), birting í gangi...'
      );
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
  // "Yfirlestrar": the units with edits waiting for a decision (interface audit 2026-11-13, ED-08). Read and
  // approved by [USER] on 2026-11-14.
  reviewList: {
    book: 'Bók',
    chapter: 'Kafli',
    section: 'Hluti',
    waiting: 'Bíða',
    oldest: 'Elsta breyting',
    empty: 'Engar breytingar bíða yfirlestrar.',
    today: 'í dag',
    yesterday: 'í gær',
    daysAgo: function (n) {
      return 'fyrir ' + n + ' dögum';
    },
  },

  segmentEditor: {
    title: 'Ritill',
    noEnglish: 'Engin enska',
    // The reader's own last "Merkja sem lokið" (register §C222; [USER]-approved 2026-11-17)
    doneTrace: function (when) {
      return 'Merkt sem lokið ' + when;
    },
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
    //
    // G1.13 (spec §2, §6.3): the scope guards add two skip reasons the editor must be told about, again not as
    // "already changed": `not-your-chapter` (a chapter the editor does not hold) and `chapter-not-editable`
    // (chapter 0, which nobody edits).
    propagateResult: (created, skipped, structureBlocked, notYours, notEditable) => {
      let msg = `Fjölgað á ${created} stað/staði`;
      if (skipped) {
        const blocked = structureBlocked || 0;
        const foreign = notYours || 0;
        const closed = notEditable || 0;
        const other = skipped - blocked - foreign - closed;
        const parts = [];
        if (blocked) parts.push(`${blocked} vegna þess að byggingarmerki hindra`);
        if (foreign) parts.push(`${foreign} ${inChapters(foreign)} sem þú ritstýrir ekki`);
        if (closed) parts.push(`${closed} ${inChapters(closed)} sem ekki er ritstýrt`);
        if (other > 0) parts.push(`${other} þegar breytt`);
        msg += `, sleppt ${skipped} (${parts.join(', ')})`;
      }
      return msg;
    },
    // G1.13: no eligible target, but some occurrences exist where this editor may not write. Say that, not that
    // the text "finds nowhere else".
    propagateNoneScoped: (notYours, notEditable) => {
      const parts = [];
      if (notYours) parts.push(`${notYours} ${inChapters(notYours)} sem þú ritstýrir ekki`);
      if (notEditable) parts.push(`${notEditable} ${inChapters(notEditable)} sem ekki er ritstýrt`);
      return `Þessi texti birtist annars staðar (${parts.join(', ')}), en þú mátt ekki breyta þar.`;
    },
    propagateError: (msg) => 'Villa við fjölgun: ' + msg,
    // spec §5.4 (G1.1 + G1.2 PR2): a serve whose opening could not be recorded answers 503 OPENING_UNRECORDED.
    // Wording approved by [USER] 2026-11-04 (index decision 13).
    openingUnrecorded:
      'Ekki tókst að skrá opnun einingarinnar og því var hún ekki opnuð. Veljið hana aftur úr listanum.',
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
    // The review tab's book list, for someone who holds none of the listed books: it stands where "Veldu bók..."
    // would, so the empty list says why it is empty.
    noBooksHeld: 'Þú ert ekki aðalritstjóri neinnar bókar á listanum',
    categoryPlaceholder: 'Flokkur…',
    categoryTitle: 'Flokkur staðfærslu — vistast með breytingunni',
    allCategories: 'Allir flokkar',
  },

  // ── Localization categories (§C210): the ONE label set for the picker, the
  // badges and the filter. Keys are PASS2_CATEGORIES (server/constants.js), minus
  // 'unchanged': an unchanged segment has no pending change and no history row.
  localizationCategory: {
    'unit-conversion': 'Einingabreyting',
    'cultural-adaptation': 'Menningarleg aðlögun',
    'example-replacement': 'Dæmaskipti',
    formatting: 'Snið',
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
    // G1.11 + §C248: the bracket-marker rules (marker-integrity.js). Read by [USER] before the PR.
    markerSpaced: function (type) {
      return 'Bil á eftir tvípunkti í merkinu [[' + type + ': — færðu bilið út fyrir merkið.';
    },
    markerUnbalanced: function (open, close) {
      return 'Ójafn fjöldi [[ og ]] (' + open + ' á móti ' + close + ') — merki er ekki lokað.';
    },
    markerEmpty: function (type) {
      return 'Tómt merki [[' + type + ':]] — skrifaðu texta inn í það eða eyddu því.';
    },
    markerDropped: function (type, from, to) {
      return (
        'Merkið [[' +
        type +
        ': vantar (' +
        from +
        ' → ' +
        to +
        ') — það er í enskum texta og má ekki fjarlægja.'
      );
    },
    markerDroppedExact: function (marker) {
      return 'Merkið ' + marker + ' vantar — það er í enskum texta og má ekki fjarlægja.';
    },
    formattingDropped: function (type, from, to) {
      return 'Sniðmerkjum [[' + type + ': fækkaði (' + from + ' → ' + to + ') — var það viljandi?';
    },
    markerUnknown: function (type) {
      return 'Óþekkt merki [[' + type + ': — athugaðu hvort það sé rétt skrifað.';
    },
    markerLbRb: function (lb, rb) {
      return 'Ójafn fjöldi hornklofamerkja: ' + lb + '× [[lb:]] en ' + rb + '× [[rb:]].';
    },
    legacyWrapAdded: function (marker) {
      return (
        'Gamalt sniðmerki ' +
        marker +
        ' í texta sem notar ný merki — það birtist lesendum sem tákn. Notaðu hnappana á tækjastikunni í staðinn.'
      );
    },
    legacyWrapFlip:
      'Nýtt merki í texta sem notar gömul sniðmerki — gömlu merkin birtast þá lesendum sem tákn. Notaðu hnappana á tækjastikunni.',
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

  // ── Discussion thread on an edit marked "Ræða" (§C210) ──────
  discussion: {
    open: 'Umræða',
    openTitle: 'Skoða umræðuefnið og svara',
    heading: 'Umræða um breytingu',
    reviewerFallback: 'Yfirlesari',
    noTopic: '(ekkert umræðuefni skráð)',
    loading: 'Hleð umræðu…',
    noReplies: 'Engin svör enn.',
    replyPlaceholder: 'Skrifaðu svar…',
    send: 'Senda svar',
    close: 'Loka',
  },

  // ── The editors' AI suggestion view (G1.23) ─────────────────
  suggestions: {
    viewLabel: 'Tillögur gervigreindar í ritli',
    on: 'Kveikt',
    off: 'Slökkt',
    confirmFirstOn:
      'Sláðu inn heiti bókarinnar til að kveikja á tillögum gervigreindar. Fyrsti tíminn sem kveikt er á verður ekki færður.',
    killSwitchNote:
      'Ef slökkt er hverfa allar tillögur strax. Á meðan slökkt er lokar hvorki „Staðfesta MT“ né samþykkt neinum tillögum, svo þær birtast aftur þegar kveikt er á ný.',
    confirmMismatch: 'Heitið passaði ekki við bókina. Ekki var kveikt á tillögum gervigreindar.',
    confirmOff:
      'Slökkva á tillögum gervigreindar í þessari bók? Þær hverfa strax hjá öllum ritstjórum.',
    closedBeforeSwitchOn:
      'Ekki var kveikt á tillögum gervigreindar: í þessari bók hefur tillögum þegar verið hafnað eða þeim lokað áður en kveikt var í fyrsta sinn. Skoða þarf þær færslur fyrst.',
    // The editor's display (spec §4).
    nota: '✓ Nota',
    notaBadar: '✓ Nota báðar',
    notaAllar: (n) => `✓ Nota allar (${n})`,
    notaTitle: 'Nota tillögu',
    hafna: '✗ Hafna',
    hafnaBadum: '✗ Hafna báðum',
    hafnaOllum: (n) => `✗ Hafna öllum (${n})`,
    hafnaTitle: 'Hafna tillögu',
    rejectFailed: 'Ekki tókst að hafna tillögunni. Reyndu aftur.',
    tag: 'GG',
    tagTitle: 'Tillaga gervigreindar',
  },

  // ── Book glossary page (design §5.3) ────────────────────────
  // Labels the server also needs (inflection results, history actions, worklist summaries) live in
  // book-glossary-view.js, which the server can require.
  bookGlossary: {
    noBooksHeld: 'Þú ert ekki aðalritstjóri neinnar bókar á listanum',
    loadError: 'Ekki tókst að sækja orðasafn bókarinnar: ',
    historyError: 'Ekki tókst að sækja söguna: ',
    worklistError: 'Ekki tókst að sækja verkefnalistann: ',
    // Design §5.6: shown only while the export is held, or after the record failed to write.
    held: (time) => '⏸ Útflutningur orðasafns bíður forritara' + (time ? ' síðan ' + time : ''),
    recordError:
      '⚠ Skrá orðasafnsins (book-glossary.json) var ekki skrifuð í síðustu keyrslu. Láttu forritara vita.',
    // Plan ruling Q13: a held book with no glossary/ directory is shown read-only.
    readOnly: 'Bókin hefur enga glossary-möppu; orðasafni hennar verður ekki breytt hér.',
    layerTitle: 'Lag bókarinnar',
    layerEmpty: 'Bókin hefur hvorki færslur né útilokanir í orðasafni sínu.',
    unclaimedTitle: 'Útilokanir',
    excluded: 'útilokað',
    wholeHeadword: 'allt orðið',
    noIcelandic: '(engin íslensk þýðing)',
    reason: 'Ástæða: ',
    source: 'Heimild: ',
    updated: 'breytt',
    inflections: 'Beygingar: ',
    retryInflections: 'Sækja beygingar',
    editorOnly: 'ⓘ Þrjú orð eða fleiri: nær til ritilsins, ekki útflutnings',
    // The BÍN credit moved to bin-credit.js (G1.16), which the old screen and the server also read.
    history: 'Saga',
    historyTitle: (english) => 'Saga: ' + english,
    historyEmpty: 'Engin saga er skráð fyrir þetta orð.',
    worklist: 'Verkefnalisti',
    worklistTitle: 'Verkefnalisti',
    oldWords: (n) => (n === 1 ? 'Gamla orðið: ' : 'Gömlu orðin: '),
    newWord: 'nýja orðið: ',
    inflected: ' (og beygingarmyndir)',
    open: 'Opna',
    close: 'Loka',
    // Look up (design §5.3).
    lookupTitle: 'Fletta upp',
    lookupLabel: 'Enskt orð',
    lookupButton: 'Fletta',
    lookupError: 'Ekki tókst að fletta orðinu upp: ',
    winner: 'Bókin notar nú: ',
    bookItself: 'bókin sjálf',
    noWinner: 'Ekkert svar innan sviða bókarinnar.',
    tiedNone: 'Ekkert eitt svar: jafnir kostir innan sviða bókarinnar.',
    tied: 'Jafnir kostir: ',
    alsoInScope: 'Einnig: ',
    outOfScope: 'Utan sviða bókarinnar: ',
    houseStyleMark: 'Ákvörðun um orðanotkun verksins: ',
    preference: (where) => 'Val bókarinnar (' + where + '): ',
    wholeBook: 'öll bókin',
    onHeadword: 'Í lagi bókarinnar',
    wordHistory: 'Saga orðsins',
    // Actions and their dialog.
    setIcelandic: 'Setja þýðingu bókar',
    excludeHeadword: 'Útiloka orðið',
    excludeRow: 'Útiloka línu',
    change: 'Breyta',
    remove: 'Fjarlægja',
    undo: 'Afturkalla',
    setIcelandicTitle: (english) => 'Setja þýðingu bókar: ' + english,
    excludeHeadwordTitle: (english) => 'Útiloka orðið: ' + english,
    excludeHeadwordNote: 'Ekkert svar úr hugtakasafninu verður notað fyrir þetta orð í bókinni.',
    excludeRowTitle: (english, icelandic) => 'Útiloka línu: ' + english + ' → ' + icelandic,
    undoTitle: (what) => 'Afturkalla útilokun: ' + what,
    changeTitle: (english) => 'Breyta færslu: ' + english,
    removeTitle: (english) => 'Fjarlægja færslu: ' + english,
    icelandicLabel: 'Íslensk þýðing bókarinnar',
    formsLabel: 'Enskar orðmyndir (ein í hverri línu)',
    modeLegend: 'Hvernig stendur þýðingin gagnvart núverandi orði?',
    modeReplace: 'Kemur í stað orðanna sem hakað er við (þau verða útilokuð í bókinni)',
    modeAdd: 'Til hliðar (núverandi orð er áfram leyfilegt)',
    replacesRequired: 'Veldu að minnsta kosti eitt orð sem þýðingin kemur í stað.',
    undoClaimed: 'Útilokanir færslunnar sem verða afturkallaðar (orðið verður þá aftur leyfilegt):',
    reasonLabel: 'Ástæða',
    sourceLabel: 'Heimild (má sleppa), t.d. „íðorðanefnd, tillaga 3.12.2026“',
    publicNotice:
      'Ástæðan og heimildin birtast í opinberri skrá verkefnisins (book-glossary.json á GitHub). Þar stendur „aðalritstjóri“ en ekki nafn þitt. Ekki vitna í hafnað orð úr Íðorðabankanum í ástæðunni.',
    reasonRequired: 'Skráðu ástæðu.',
    submit: 'Vista',
    cancel: 'Hætta við',
    confirmHouseStyle: 'Staðfesta og vista',
    unchanged: 'Engin breyting var gerð.',
    // §C243 R8: forms are matched case-insensitively, so a case change alone reads as unchanged.
    caseHint:
      'Hástöfum í enskri orðmynd er aðeins breytt með því að fjarlægja hana og bæta henni við aftur.',
    already: 'Þetta var þegar skráð; engu var breytt.',
    saved: 'Vistað.',
    retryStarted: 'Leit að beygingum er hafin.',
    retryError: 'Ekki tókst að hefja leit að beygingum: ',
  },
};
