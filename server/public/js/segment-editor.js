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
  let userRole = 'viewer';
  let userName = null;
  let termLookupTimer = null;
  const dirtyEdits = new Set(); // Track segment IDs with unsaved textarea edits
  let draftTimer = null;
  let lastServerSaveTime = null;
  const recentlySaved = new Set(); // Track recently saved segment IDs for indicators
  let lastFocusedTextarea = null; // Track last-focused edit textarea for term insertion

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
    const count = dirtyEdits.size;
    bar.classList.remove('has-unsaved', 'all-saved', 'saving');
    if (count > 0) {
      bar.classList.add('has-unsaved');
      document.getElementById('save-status-text').textContent = UI.save.unsaved(count);
    } else {
      bar.classList.add('all-saved');
      document.getElementById('save-status-text').textContent = UI.save.allSaved;
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

  function saveDraft() {
    if (!currentModuleId || dirtyEdits.size === 0) {
      if (currentModuleId) localStorage.removeItem(draftKey());
      return;
    }
    const drafts = {};
    for (const segId of dirtyEdits) {
      const ta = document.getElementById('textarea-' + cssId(segId));
      if (ta) drafts[segId] = ta.value;
    }
    try {
      localStorage.setItem(draftKey(), JSON.stringify({ ts: Date.now(), drafts }));
    } catch {
      if (typeof saveRetry !== 'undefined')
        saveRetry.showToast(UI.common.localStorageFull, 'error');
    }
  }

  function clearDraft() {
    if (currentModuleId) tabGuard.clearDraftsByPrefix(draftPrefix());
  }

  function startDraftTimer() {
    if (draftTimer) clearInterval(draftTimer);
    draftTimer = setInterval(saveDraft, 5000);
  }

  function restoreDraft() {
    const found = tabGuard.findNewestDraft(draftPrefix());
    if (!found) return;
    try {
      const draft = found.data;
      if (Date.now() - draft.ts > 7 * 24 * 60 * 60 * 1000) {
        tabGuard.clearDraftsByPrefix(draftPrefix());
        return;
      }
      const ids = Object.keys(draft.drafts);
      if (ids.length === 0) return;
      if (!confirm(UI.confirm.draftRecovery(ids.length))) {
        tabGuard.clearDraftsByPrefix(draftPrefix());
        return;
      }
      for (const segId of ids) {
        openEditPanel(segId);
        const ta = document.getElementById('textarea-' + cssId(segId));
        if (ta) {
          ta.value = draft.drafts[segId];
          dirtyEdits.add(segId);
        }
      }
      // Clean up all tab-specific drafts after restore
      tabGuard.clearDraftsByPrefix(draftPrefix());
      updateSaveStatusBar();
    } catch {
      tabGuard.clearDraftsByPrefix(draftPrefix());
    }
  }

  /** Get effective role (respects admin role preview override) */
  function getEffectiveRole() {
    if (window.navUtils && typeof window.navUtils.getEffectiveRole === 'function') {
      return window.navUtils.getEffectiveRole(userRole);
    }
    return userRole;
  }

  const API_BASE = '/api/segment-editor';

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

      container.innerHTML = data.modules
        .map((m) => {
          const displayTitle = m.titleIs || m.title || m.moduleId;
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
      restoreDraft();
      startDraftTimer();

      // Show save status bar and update it
      document.getElementById('save-status-bar').style.display = 'flex';
      updateSaveStatusBar();

      // Load term data in background (non-blocking)
      loadTermData(moduleId);
    } catch (err) {
      // Restore module list on error so users can retry
      document.getElementById('module-selector').style.display = 'block';
      chapterSelect.dispatchEvent(new Event('change'));
      alert(UI.common.errorLoading + err.message);
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

  // ================================================================
  // RENDER MODULE
  // ================================================================
  function renderModule() {
    document.getElementById('module-title').textContent =
      `${moduleData.moduleId} — ${moduleData.title}`;
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

    // Update topbar breadcrumb
    const topbarTitle = document.getElementById('topbar-title');
    if (topbarTitle) {
      topbarTitle.textContent = UI.segmentEditor.titleModule(moduleData.moduleId);
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

    // Count segments that have at least one edit (any status)
    let editedCount = 0;
    for (const seg of moduleData.segments) {
      const edits = moduleData.edits[seg.segmentId] || [];
      if (edits.length > 0) {
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

  function renderSegments() {
    // O1: Close open edit panels before re-rendering to prevent losing typed text
    const openPanels = document.querySelectorAll('.edit-panel.active');
    if (openPanels.length > 0 && dirtyEdits.size > 0) {
      if (!confirm(UI.confirm.closePanels)) return;
    }
    openPanels.forEach((panel) => {
      panel.classList.remove('active');
      const row = panel.closest('tr');
      if (row) row.classList.remove('editing');
    });
    dirtyEdits.clear();
    // O4: Clear stale DOM reference
    lastFocusedTextarea = null;
    updateSaveStatusBar();

    const tbody = document.getElementById('segments-body');
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
        if (filterStatus === 'unedited') {
          return !latestEdit;
        }
        return latestEdit && latestEdit.status === filterStatus;
      });
    }

    tbody.innerHTML = segments.map((seg) => renderSegmentRow(seg)).join('');
  }

  function renderSegmentRow(seg) {
    const edits = moduleData.edits[seg.segmentId] || [];
    const latestEdit = edits[0]; // Most recent
    let rowClass = 'segment-row';
    if (latestEdit) {
      rowClass += ` has-edit ${latestEdit.status}`;
    }
    if (!seg.is && !latestEdit) {
      rowClass += ' no-translation';
    }

    // Determine what IS text to display and what to pre-fill in the editor
    const hasActiveEdit =
      latestEdit && (latestEdit.status === 'pending' || latestEdit.status === 'approved');
    const displayIs = hasActiveEdit ? latestEdit.edited_content : seg.is;
    const editableText = hasActiveEdit ? latestEdit.edited_content : seg.is;

    let enHtml = highlightMath(escapeHtml(seg.en));
    const isHtml = renderMarkdownPreview(displayIs);

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

    const isHeadEditor = ['head-editor', 'admin'].includes(getEffectiveRole());

    // Determine whether editing is allowed:
    // - No edit yet -> can edit
    // - Own pending edit -> can re-edit
    // - Rejected edit -> can try again
    // - Discuss edit -> can re-edit based on feedback
    const canEdit =
      !latestEdit ||
      latestEdit.status === 'rejected' ||
      latestEdit.status === 'discuss' ||
      (latestEdit.status === 'pending' && latestEdit.editor_username === userName) ||
      (latestEdit.status === 'approved' &&
        !latestEdit.applied_at &&
        latestEdit.editor_username === userName);

    let actionsHtml = '';
    if (latestEdit) {
      actionsHtml = `
          <div>
            <span class="edit-status ${latestEdit.status}">${statusLabel(latestEdit.status)}</span>
            ${latestEdit.category ? `<span class="category-badge ${latestEdit.category}">${categoryLabel(latestEdit.category)}</span>` : ''}
          </div>
          ${
            isHeadEditor &&
            latestEdit.status === 'pending' &&
            latestEdit.editor_username !== userName
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
            <button class="btn btn-sm btn-secondary btn-edit" onclick="openEditPanel('${seg.segmentId}')" style="margin-top: 0.25rem;">
              Breyta
            </button>
          `
              : ''
          }
        `;
    } else {
      actionsHtml = `
          <button class="btn btn-sm btn-secondary btn-edit" onclick="openEditPanel('${seg.segmentId}')">
            Breyta
          </button>
        `;
    }

    // Pre-select the category in the dropdown if re-editing
    const selectedCat = latestEdit?.category || '';

    // Cross-editor conflict indicator
    const hasOtherEdits = (moduleData.otherPendingSegments || []).includes(seg.segmentId);
    const conflictHtml = hasOtherEdits
      ? '<span class="other-editor-badge" title="' + UI.tooltips.otherEditor + '">&#9998;</span>'
      : '';

    return `
        <tr class="${rowClass}" id="row-${cssId(seg.segmentId)}">
          <td class="col-type">
            <span class="segment-type-badge ${seg.segmentType}">${seg.segmentType}</span>
            ${conflictHtml}
          </td>
          <td class="col-en">
            <div class="segment-content">${enHtml || '<em class="text-muted">' + UI.segmentEditor.noEnglish + '</em>'}</div>
          </td>
          <td class="col-is">
            <div class="segment-content" id="is-${cssId(seg.segmentId)}">${isHtml || '<em class="text-muted">Engin þýðing</em>'}</div>
            ${originalHint}
            ${termIssuesHtml}
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
              <textarea id="textarea-${cssId(seg.segmentId)}">${escapeHtml(editableText)}</textarea>
              <div class="edit-controls">
                <select id="cat-${cssId(seg.segmentId)}" title="Veldu flokk breytingar">
                  <option value="">Flokkur...</option>
                  <option value="terminology" title="Fagorð, skilgreiningar, samræmi hugtaka" ${selectedCat === 'terminology' ? 'selected' : ''}>Hugtök</option>
                  <option value="accuracy" title="Efnislegir gallar eða rangar þýðingar" ${selectedCat === 'accuracy' ? 'selected' : ''}>Nákvæmni</option>
                  <option value="readability" title="Málfar, setningaskipan, læsileiki" ${selectedCat === 'readability' ? 'selected' : ''}>Læsileiki</option>
                  <option value="style" title="Tónn, orðalag, stílbrigði" ${selectedCat === 'style' ? 'selected' : ''}>Stíll</option>
                  <option value="omission" title="Vantar efni eða hluta úr upprunalega textanum" ${selectedCat === 'omission' ? 'selected' : ''}>Úrfelling</option>
                </select>
                <input type="text" id="note-${cssId(seg.segmentId)}" placeholder="Athugasemd (valkvætt)" value="${escapeHtml(latestEdit?.editor_note || '')}">
                <button class="btn btn-sm btn-primary" onclick="saveEdit('${seg.segmentId}')">Vista</button>
                <button class="btn btn-sm btn-secondary" onclick="closeEditPanel('${seg.segmentId}')">Hætta við</button>
              </div>
            </div>
          </td>
          <td class="col-actions">${actionsHtml}<span class="seg-save-ind${recentlySaved.has(seg.segmentId) ? ' saved' : ''}" id="seg-ind-${cssId(seg.segmentId)}">${recentlySaved.has(seg.segmentId) ? 'Vistað' : ''}</span></td>
        </tr>
      `;
  }

  // ================================================================
  // EDIT ACTIONS
  // ================================================================
  function openEditPanel(segmentId) {
    const panel = document.getElementById('edit-' + cssId(segmentId));
    if (panel) {
      panel.classList.add('active');
      // Add copper left-border to the row
      const row = document.getElementById('row-' + cssId(segmentId));
      if (row) row.classList.add('editing');
      // Focus the textarea and track dirty state
      const textarea = document.getElementById('textarea-' + cssId(segmentId));
      if (textarea) {
        textarea._segmentId = segmentId;
        textarea.focus();

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
                previewEl.innerHTML = renderMarkdownPreview(textarea.value);
              }, 150);
            });
          }

          textarea.addEventListener('input', function onInput() {
            dirtyEdits.add(segmentId);
            // Update per-segment indicator
            const ind = document.getElementById('seg-ind-' + cssId(segmentId));
            if (ind) {
              ind.textContent = UI.save.changed;
              ind.className = 'seg-save-ind dirty';
            }
            updateSaveStatusBar();
          });
        }

        // Always render initial preview when opening
        const previewEl = document.getElementById('preview-' + cssId(segmentId));
        if (previewEl) {
          previewEl.innerHTML = renderMarkdownPreview(textarea.value);
        }
      }
    }
  }

  function closeEditPanel(segmentId) {
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
          textarea.value = latestEdit ? latestEdit.edited_content : seg.is;
        }
      }
    }
    dirtyEdits.delete(segmentId);
    updateSaveStatusBar();
  }

  /**
   * Validate a segment edit before saving.
   * Returns { blocked: string[]|null, warnings: string[]|null }
   */
  function validateSegmentEdit(enText, originalIs, editedIs) {
    const blocked = [];
    const warnings = [];

    // Hard block: [[MATH:N]] in EN but missing from edited IS
    const enMath = (enText || '').match(/\[\[MATH:\d+\]\]/g) || [];
    for (const m of enMath) {
      if (!editedIs.includes(m)) {
        blocked.push(UI.validation.mathMissing(m));
      }
    }

    // Hard block: [[BR]] removed (present in original IS but not edited)
    const origBR = (originalIs || '').match(/\[\[BR\]\]/g) || [];
    const editBR = (editedIs || '').match(/\[\[BR\]\]/g) || [];
    if (origBR.length > editBR.length) {
      blocked.push(UI.validation.brRemoved(origBR.length, editBR.length));
    }

    // Hard block: [#CNX_...] cross-references in EN but missing from edited IS
    const enXrefs = (enText || '').match(/\[#[A-Za-z0-9_.-]+\]/g) || [];
    for (const xref of enXrefs) {
      if (!editedIs.includes(xref)) {
        blocked.push(UI.validation.xrefMissing(xref));
      }
    }

    // Hard block: [text](#anchor) or [text](doc#target) links in original IS but removed
    const origLinks = (originalIs || '').match(/\[[^\]]+\]\([^)]+\)/g) || [];
    for (const link of origLinks) {
      if (!editedIs.includes(link)) {
        blocked.push(UI.validation.linkRemoved(link));
      }
    }

    // Hard block: [doc#target] self-closing document refs in EN but missing from edited IS
    const enDocRefs = (enText || '').match(/\[[A-Za-z0-9_.-]+#[A-Za-z0-9_.-]+\]/g) || [];
    for (const ref of enDocRefs) {
      if (!editedIs.includes(ref)) {
        blocked.push(UI.validation.docRefMissing(ref));
      }
    }

    // Hard block: [[MEDIA:N]] in EN but missing from edited IS
    const enMedia = (enText || '').match(/\[\[MEDIA:\d+\]\]/g) || [];
    for (const m of enMedia) {
      if (!editedIs.includes(m)) {
        blocked.push(UI.validation.mediaMissing(m));
      }
    }

    // Hard block: [[SPACE]] / [[SPACE:N]] in original IS but removed
    const origSpaces = (originalIs || '').match(/\[\[SPACE(?::\d+)?\]\]/g) || [];
    const editSpaces = (editedIs || '').match(/\[\[SPACE(?::\d+)?\]\]/g) || [];
    if (origSpaces.length > editSpaces.length) {
      blocked.push(UI.validation.spaceRemoved(origSpaces.length, editSpaces.length));
    }

    // Warning: unmatched formatting pairs (odd count)
    const pairs = [
      { marker: '**', name: UI.validation.pairNames.bold, re: /\*\*/g },
      { marker: '__', name: UI.validation.pairNames.term, re: /__/g },
      { marker: '++', name: UI.validation.pairNames.underline, re: /\+\+/g },
    ];
    for (const { name, re } of pairs) {
      const count = (editedIs.match(re) || []).length;
      if (count % 2 !== 0) {
        warnings.push(UI.validation.unmatchedPair(name, count));
      }
    }

    // Asymmetric pair: {= must match =}
    const openEmph = (editedIs.match(/\{=/g) || []).length;
    const closeEmph = (editedIs.match(/=\}/g) || []).length;
    if (openEmph !== closeEmph) {
      warnings.push(UI.validation.unmatchedEmphasis(openEmph, closeEmph));
    }

    // Warning: unmatched ~ for subscript (but ignore ~~ which could be strikethrough)
    const tildeCount = (editedIs.match(/(?<![~])~(?!~)/g) || []).length;
    if (tildeCount % 2 !== 0) {
      warnings.push(UI.validation.unmatchedSubscript(tildeCount));
    }

    // Warning: unmatched ^ for superscript
    const caretCount = (editedIs.match(/\^/g) || []).length;
    if (caretCount % 2 !== 0) {
      warnings.push(UI.validation.unmatchedSuperscript(caretCount));
    }

    // Warning: segment cleared when original had content
    if (originalIs && originalIs.trim() && (!editedIs || !editedIs.trim())) {
      warnings.push(UI.validation.segmentCleared);
    }

    return {
      blocked: blocked.length > 0 ? blocked : null,
      warnings: warnings.length > 0 ? warnings : null,
    };
  }

  async function saveEdit(segmentId) {
    // O3: Guard against null moduleData if user navigated away mid-save
    if (!moduleData?.segments) return;
    const seg = moduleData.segments.find((s) => s.segmentId === segmentId);
    if (!seg) return;

    const editedContent = document.getElementById('textarea-' + cssId(segmentId)).value;
    const category = document.getElementById('cat-' + cssId(segmentId)).value;
    const editorNote = document.getElementById('note-' + cssId(segmentId)).value;

    // If content matches original and no annotation, check if there's an existing edit to withdraw
    const existingEdits = moduleData.edits[segmentId] || [];
    const hasPendingEdit = existingEdits.some((e) => e.status === 'pending');
    if (editedContent === seg.is && !category && !editorNote && !hasPendingEdit) {
      closeEditPanel(segmentId);
      return; // No change from original, no annotation, no edit to withdraw
    }

    // Validate before saving
    const validation = validateSegmentEdit(seg.en, seg.is, editedContent);
    if (validation.blocked) {
      alert(UI.confirm.validationBlocked + validation.blocked.join('\n'));
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
    const saveOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        segmentId,
        originalContent: seg.is,
        editedContent,
        category: category || undefined,
        editorNote: editorNote || undefined,
      }),
    };

    // Update per-segment indicator to "saving"
    const savingInd = document.getElementById('seg-ind-' + cssId(segmentId));
    if (savingInd) {
      savingInd.textContent = UI.save.saving;
      savingInd.className = 'seg-save-ind saving';
    }

    try {
      await saveRetry.attempt(
        `seg:${currentBook}/${currentChapter}/${currentModuleId}:${segmentId}`,
        saveUrl,
        saveOptions
      );

      dirtyEdits.delete(segmentId);
      lastServerSaveTime = Date.now();
      recentlySaved.add(segmentId);
      setTimeout(() => {
        recentlySaved.delete(segmentId);
      }, 4000);
      saveDraft(); // update draft (or clear if empty)
      updateSaveStatusBar();
      // Reload module to refresh edits (O2: force bypass re-entrancy guard)
      await loadModule(currentModuleId, { force: true });
    } catch (err) {
      // Revert per-segment indicator on error
      if (savingInd) {
        savingInd.textContent = UI.save.changed;
        savingInd.className = 'seg-save-ind dirty';
      }
      if (!saveRetry.isRetryable(err)) {
        alert(UI.common.errorSaving + err.message);
      }
    }
  }

  async function reviewEdit(editId, action) {
    const note =
      action === 'reject' || action === 'discuss'
        ? prompt(action === 'reject' ? 'Ástæða höfnunar:' : 'Umræðuefni:')
        : null;

    if ((action === 'reject' || action === 'discuss') && note === null) return; // Cancelled

    try {
      await fetchJson(`${API_BASE}/edit/${editId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ note }),
      });

      await loadModule(currentModuleId);
    } catch (err) {
      alert(UI.common.errorPrefix + err.message);
    }
  }

  async function unapproveEdit(editId) {
    if (!confirm(UI.confirm.unapprove)) return;

    try {
      await fetchJson(`${API_BASE}/edit/${editId}/unapprove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      await loadModule(currentModuleId);
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
      await loadModule(currentModuleId);
    } catch (err) {
      alert(UI.common.errorPrefix + err.message);
    }
  });

  // ================================================================
  // BACK BUTTON
  // ================================================================
  document.getElementById('btn-back').addEventListener('click', () => {
    clearDraft();
    if (draftTimer) clearInterval(draftTimer);
    tabGuard.release();
    document.getElementById('editor-container').style.display = 'none';
    document.getElementById('module-selector').style.display = 'block';
    document.getElementById('save-status-bar').style.display = 'none';
    moduleData = null;
    termData = null;
    lastServerSaveTime = null;
    recentlySaved.clear();
    clearInterval(pipelinePollingTimer);

    // Reset topbar title
    const topbarTitle = document.getElementById('topbar-title');
    if (topbarTitle) {
      topbarTitle.textContent = UI.segmentEditor.title;
    }

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

      const { unapplied_count, total_approved } = data;

      if (unapplied_count > 0) {
        statusEl.textContent = UI.apply.unapplied(unapplied_count);
        btnApply.disabled = false;
        btnApplyRender.disabled = false;
      } else if (total_approved > 0) {
        statusEl.textContent = UI.apply.allApplied(total_approved);
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
      badge.textContent = UI.apply.saved(data.appliedCount);
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

      badge.textContent = UI.apply.saveAndRenderProgress(data.applied.appliedCount);

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
          badge.textContent = UI.apply.renderFailed;
          badge.className = 'pipeline-status-badge failed';
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
  // TERM HIGHLIGHTING
  // ================================================================

  /**
   * Highlight matched terms in already-escaped HTML.
   * Works on the escaped text, matching term.english case-insensitively.
   */
  function highlightTermsInHtml(html, matches) {
    // Sort by position descending so replacements don't shift indices
    // But since html is escaped, we match by term text instead
    // Sort longest first so "molar mass" matches before "mass"
    const sorted = [...matches].sort((a, b) => b.english.length - a.english.length);
    const used = new Set();

    for (const m of sorted) {
      const escaped = escapeHtml(m.english);
      const pattern = new RegExp(`\\b(${escapeRegexStr(escaped)})\\b`, 'gi');
      // Only highlight first occurrence to keep it clean
      let replaced = false;
      html = html.replace(pattern, (match) => {
        if (replaced || used.has(m.english.toLowerCase())) return match;
        replaced = true;
        used.add(m.english.toLowerCase());
        const cls = m.status === 'approved' ? 'term-highlight' : 'term-highlight proposed';
        return `<span class="${cls}" data-term-id="${m.termId}" onclick="showTermPopup(${m.termId}, this)">${match}</span>`;
      });
    }
    return html;
  }

  function escapeRegexStr(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ================================================================
  // TERM POPUP
  // ================================================================

  function showTermPopup(termId, element) {
    closeTermPopup(); // remove any existing popup and outside-click listener
    const popup = document.getElementById('term-popup');

    // Find term info from termData
    let termInfo = null;
    if (termData) {
      for (const segId of Object.keys(termData)) {
        const match = termData[segId].matches?.find((m) => m.termId === termId);
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

    const statusBadge =
      termInfo.status === 'approved'
        ? '<span class="edit-status approved">Samþykkt</span>'
        : '<span class="edit-status pending">Tillaga</span>';

    // Build alternatives HTML if available
    let altsHtml = '';
    if (termInfo.alternatives && termInfo.alternatives.length > 0) {
      const altItems = termInfo.alternatives
        .map((a) => {
          const altTerm = typeof a === 'string' ? a : a.term;
          const altNote = typeof a === 'object' && a.note ? ` (${escapeHtml(a.note)})` : '';
          return `<span style="color: var(--text-secondary);">${escapeHtml(altTerm)}${altNote}</span>`;
        })
        .join(', ');
      altsHtml = `
          <div class="term-popup-row" style="font-size: var(--text-xs);">
            <span class="term-popup-label">Einnig:</span>
            <span>${altItems}</span>
          </div>`;
    }

    // Build definition HTML if available
    let defHtml = '';
    if (termInfo.definitionIs) {
      defHtml = `
          <div class="term-popup-row" style="font-size: var(--text-xs); margin-top: 0.25rem;">
            <span style="color: var(--text-muted); font-style: italic;">${escapeHtml(termInfo.definitionIs)}</span>
          </div>`;
    } else if (termInfo.definitionEn) {
      defHtml = `
          <div class="term-popup-row" style="font-size: var(--text-xs); margin-top: 0.25rem;">
            <span style="color: var(--text-muted); font-style: italic;">${escapeHtml(termInfo.definitionEn)}</span>
          </div>`;
    }

    document.getElementById('term-popup-body').innerHTML = `
        <div class="term-popup-row">
          <span class="term-popup-label">Íslenska:</span>
          <span class="term-popup-value">${escapeHtml(termInfo.icelandic)}</span>
        </div>
        ${altsHtml}
        <div class="term-popup-row">
          <span class="term-popup-label">Flokkur:</span>
          <span>${termInfo.category || '—'}</span>
        </div>
        <div class="term-popup-row">
          <span class="term-popup-label">Staða:</span>
          ${statusBadge}
        </div>
        ${defHtml}
        <div style="margin-top: 0.5rem; padding-top: 0.4rem; border-top: 1px solid var(--border);">
          <a href="/terminology" target="_blank" style="font-size: var(--text-xs); color: var(--accent);">
            ' + UI.termLookup.openGlossary + '
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
        const data = await fetchJson(`${API_BASE}/terminology/lookup?q=${encodeURIComponent(q)}`, {
          credentials: 'include',
        });

        if (!data.terms || data.terms.length === 0) {
          termLookupResults.innerHTML =
            '<div class="term-lookup-item" style="color: var(--text-muted);">' +
            UI.termLookup.noResults +
            '</div>';
        } else {
          termLookupResults.innerHTML = data.terms
            .map((t) => {
              const alts = (t.alternatives || [])
                .map((a) => (typeof a === 'string' ? a : a.term))
                .filter(Boolean);
              const altsText =
                alts.length > 0
                  ? `<span style="font-size: 0.75em; color: var(--text-muted);"> (einnig: ${alts.map((a) => escapeHtml(a)).join(', ')})</span>`
                  : '';
              return `
              <div class="term-lookup-item" onclick="insertTermFromLookup('${escapeHtml(t.icelandic)}')">
                <span class="term-lookup-en">${escapeHtml(t.english)}</span>
                &#8594; <span class="term-lookup-is">${escapeHtml(t.icelandic)}</span>
                ${t.status === 'approved' ? ' &#10003;' : ''}${altsText}
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
      ta.dispatchEvent(new Event('input', { bubbles: true }));
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
  function wrapSelection(textareaId, prefix, suffix) {
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
  }

  // ================================================================
  // KEYBOARD SHORTCUTS
  // ================================================================
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
        if (dirtyEdits.has(segId) && moduleData) {
          const seg = moduleData.segments.find((s) => s.segmentId === segId);
          if (seg) {
            const latestEdit = moduleData.edits[segId]?.[0];
            const hasActiveEdit =
              latestEdit && (latestEdit.status === 'pending' || latestEdit.status === 'approved');
            focused.value = hasActiveEdit ? latestEdit.edited_content : seg.is;
            dirtyEdits.delete(segId);
            // Update per-segment indicator
            const ind = document.getElementById('seg-ind-' + cssId(segId));
            if (ind) {
              ind.textContent = UI.segmentEditor.reverted;
              ind.className = 'seg-save-ind saved';
              setTimeout(() => {
                ind.textContent = '';
                ind.className = 'seg-save-ind';
              }, 2000);
            }
            // Update preview
            const previewEl = document.getElementById('preview-' + cssId(segId));
            if (previewEl) previewEl.innerHTML = renderMarkdownPreview(focused.value);
            updateSaveStatusBar();
            e.preventDefault();
            return;
          }
        }
      }

      // Otherwise close the active edit panel (existing behavior)
      const activePanel = document.querySelector('.edit-panel.active');
      if (activePanel) {
        const textarea = activePanel.querySelector('textarea');
        const segId = textarea?._segmentId;
        // If there are unsaved changes, confirm before discarding
        if (segId && dirtyEdits.has(segId)) {
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
              textarea.value = latestEdit ? latestEdit.edited_content : seg.is;
            }
          }
          dirtyEdits.delete(segId);
          updateSaveStatusBar();
        }
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
        // If not focused on a textarea, find the single active edit panel
        const activePanel = document.querySelector('.edit-panel.active');
        if (activePanel) {
          const textarea = activePanel.querySelector('textarea');
          if (textarea?._segmentId) {
            saveEdit(textarea._segmentId);
          }
        }
      }
    }

    // Ctrl+Enter to save active edit
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
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
        wrapSelection(taId, '**', '**');
      } else if (e.key === 'i') {
        e.preventDefault();
        wrapSelection(taId, '*', '*');
      } else if (e.key === 't') {
        e.preventDefault();
        wrapSelection(taId, '__', '__');
      }
    }
  });

  // ================================================================
  // WARN BEFORE LEAVING WITH UNSAVED EDITS
  // ================================================================
  window.addEventListener('beforeunload', function (e) {
    if (dirtyEdits.size > 0) {
      saveDraft(); // last-chance save to localStorage
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // Save drafts on auth expiry (before 401 redirect)
  window.addEventListener('auth-expired', function () {
    if (dirtyEdits.size > 0) saveDraft();
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
    const chapter = params.get('chapter');
    const module = params.get('module');
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

    // 4. If module specified, wait for module cards then load it
    if (module) {
      await waitFor(() => document.querySelector('.module-card'));
      loadModule(module);
    }
  })();

  // ================================================================
  // EXPOSE TO WINDOW (for HTML onclick/inline handlers)
  // ================================================================
  window.loadModule = loadModule;
  window.openEditPanel = openEditPanel;
  window.closeEditPanel = closeEditPanel;
  window.saveEdit = saveEdit;
  window.wrapSelection = wrapSelection;
  window.closeTermPopup = closeTermPopup;
  window.reviewEdit = reviewEdit;
  window.unapproveEdit = unapproveEdit;
  window.showTermPopup = showTermPopup;
  window.insertTermFromLookup = insertTermFromLookup;
})(); // end IIFE
