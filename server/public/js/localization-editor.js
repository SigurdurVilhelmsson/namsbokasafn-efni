/**
 * Localization Editor — Pass 2 localization
 *
 * All state and functions are encapsulated in this IIFE.
 * Only functions needed by HTML onclick handlers are exposed on window.
 */
/* eslint-disable no-var */
(function () {
  'use strict';

  // ================================================================
  // VIEW SWITCHING
  // ================================================================

  function switchView(viewName) {
    // Toggle tab active state
    document.querySelectorAll('.view-tab').forEach(function (tab) {
      tab.classList.toggle('active', tab.dataset.view === viewName);
    });

    // Toggle panel visibility
    document.querySelectorAll('.view-panel').forEach(function (panel) {
      panel.classList.toggle('active', panel.id === 'view-' + viewName);
    });
  }

  // ================================================================
  // SHARED — Modal helper
  // ================================================================

  function closeModal(id) {
    document.getElementById(id).style.display = 'none';
  }

  // ================================================================
  //
  //   EDITOR VIEW — All JS from localization-editor.html
  //
  // ================================================================

  let edCurrentBook = '';
  let edCurrentChapter = 0;
  let edCurrentModuleId = '';
  let edModuleData = null;
  // eslint-disable-next-line no-unused-vars -- set by onUserReady(), reserved for future role checks
  let _edUserRole = 'viewer';
  let edLastModified = null; // file mtime for conflict detection

  // Track unsaved changes: { segmentId: { content, category } }
  let edPendingChanges = {};
  let edDraftTimer = null;
  var edLastServerSaveTime = null;
  var edAutoSaveTimer = null;
  var edSaveInFlight = false;
  var ED_AUTOSAVE_MS = 60000;

  const ED_API_BASE = '/api/localization-editor';

  // Track latest category per segment from edit history (5B)
  let edSegmentCategories = {};

  // ----------------------------------------------------------------
  // GUIDELINES PANEL (5C)
  // ----------------------------------------------------------------

  function edToggleGuidelines() {
    var panel = document.getElementById('guidelines-panel');
    var isCollapsed = panel.classList.contains('collapsed');
    panel.classList.toggle('collapsed', !isCollapsed);
    try {
      localStorage.setItem('loc-guidelines-collapsed', isCollapsed ? 'false' : 'true');
    } catch {
      /* localStorage may be unavailable */
    }
  }

  function edRestoreGuidelinesState() {
    try {
      var collapsed = localStorage.getItem('loc-guidelines-collapsed');
      var panel = document.getElementById('guidelines-panel');
      if (collapsed === 'false') {
        panel.classList.remove('collapsed');
      } else {
        panel.classList.add('collapsed');
      }
    } catch {
      /* localStorage may be unavailable */
    }
  }

  edRestoreGuidelinesState();

  // ----------------------------------------------------------------
  // SAVE STATUS BAR
  // ----------------------------------------------------------------

  function edUpdateSaveStatusBar() {
    var bar = document.getElementById('save-status-bar');
    if (!bar) return;
    var count = Object.keys(edPendingChanges).length;
    bar.classList.remove('has-unsaved', 'all-saved', 'saving');
    if (count > 0) {
      bar.classList.add('has-unsaved');
      document.getElementById('save-status-text').textContent = UI.save.unsaved(count);
    } else {
      bar.classList.add('all-saved');
      document.getElementById('save-status-text').textContent = UI.save.allSaved;
    }
    document.getElementById('save-status-time').textContent = edLastServerSaveTime
      ? UI.save.lastSaved +
        new Date(edLastServerSaveTime).toLocaleTimeString('is-IS', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';
  }

  // ----------------------------------------------------------------
  // SERVER AUTOSAVE (every 60s when dirty)
  // ----------------------------------------------------------------

  async function edAutoSave() {
    if (edSaveInFlight) return;
    if (!edModuleData) return; // P5: guard against null after navigating away
    var keys = Object.keys(edPendingChanges);
    if (keys.length === 0) return;

    edSaveInFlight = true;
    var bar = document.getElementById('save-status-bar');
    if (bar) {
      bar.classList.remove('has-unsaved', 'all-saved');
      bar.classList.add('saving');
      document.getElementById('save-status-text').textContent = UI.save.autoSaving;
    }

    var segments = keys.map(function (segmentId) {
      return {
        segmentId: segmentId,
        content: edPendingChanges[segmentId].content,
      };
    });

    var saveUrl =
      ED_API_BASE +
      '/' +
      edCurrentBook +
      '/' +
      edCurrentChapter +
      '/' +
      edCurrentModuleId +
      '/save-all';
    var saveBody = { segments: segments };
    if (edLastModified != null) saveBody.lastModified = edLastModified;
    var saveOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(saveBody),
    };

    try {
      var result = await saveRetry.attempt(
        'loc-auto:' + edCurrentBook + '/' + edCurrentChapter + '/' + edCurrentModuleId,
        saveUrl,
        saveOptions
      );

      if (result.lastModified != null) edLastModified = result.lastModified;

      // Update local state for all saved segments
      for (var i = 0; i < keys.length; i++) {
        var segmentId = keys[i];
        var seg = edModuleData.segments.find(function (s) {
          return s.segmentId === segmentId;
        });
        if (seg) {
          seg.localized = edPendingChanges[segmentId].content;
          seg.hasLocalized = true;
        }
        // Update per-segment indicator
        var ind = document.getElementById('ind-' + edCssId(segmentId));
        if (ind) {
          ind.textContent = UI.save.saved;
          ind.className = 'save-indicator saved';
        }
        var ta = document.getElementById('ta-' + edCssId(segmentId));
        if (ta) ta.classList.remove('modified');
        var row = document.getElementById('row-' + edCssId(segmentId));
        if (row) row.className = 'segment-row saved';
      }
      edPendingChanges = {};
      edClearDraft();

      edModuleData.localizedCount = edModuleData.segments.filter(function (s) {
        return s.hasLocalized;
      }).length;
      edLastServerSaveTime = Date.now();
      edRenderStats();
      edUpdateProgress();
      edUpdateSaveStatusBar();
    } catch (err) {
      if (err.status === 409) {
        // Conflict — stop autosave and prompt user to reload (matches manual save behavior)
        if (edAutoSaveTimer) {
          clearInterval(edAutoSaveTimer);
          edAutoSaveTimer = null;
        }
        if (bar) {
          bar.classList.remove('saving');
          bar.classList.add('has-unsaved');
          document.getElementById('save-status-text').textContent = UI.save.conflict;
        }
        if (confirm(UI.confirm.conflictReload)) {
          edSaveDraft();
          edLoadModule(edCurrentModuleId);
        }
      } else {
        // Other error — revert to unsaved count
        edUpdateSaveStatusBar();
      }
    } finally {
      edSaveInFlight = false;
    }
  }

  // ----------------------------------------------------------------
  // DRAFT PERSISTENCE (localStorage)
  // ----------------------------------------------------------------

  function edDraftKey() {
    return (
      'loc-draft:' +
      edCurrentBook +
      '/' +
      edCurrentChapter +
      '/' +
      edCurrentModuleId +
      ':' +
      tabGuard.tabId
    );
  }

  function edDraftPrefix() {
    return 'loc-draft:' + edCurrentBook + '/' + edCurrentChapter + '/' + edCurrentModuleId + ':';
  }

  function edSaveDraft() {
    if (!edCurrentModuleId) return;
    var keys = Object.keys(edPendingChanges);
    if (keys.length === 0) {
      localStorage.removeItem(edDraftKey());
      return;
    }
    try {
      localStorage.setItem(
        edDraftKey(),
        JSON.stringify({
          ts: Date.now(),
          changes: edPendingChanges,
        })
      );
    } catch {
      if (typeof saveRetry !== 'undefined')
        saveRetry.showToast(UI.common.localStorageFull, 'error');
    }
  }

  function edClearDraft() {
    if (edCurrentModuleId) tabGuard.clearDraftsByPrefix(edDraftPrefix());
  }

  function edStartDraftTimer() {
    if (edDraftTimer) clearInterval(edDraftTimer);
    edDraftTimer = setInterval(edSaveDraft, 5000);
    if (edAutoSaveTimer) clearInterval(edAutoSaveTimer);
    edAutoSaveTimer = setInterval(edAutoSave, ED_AUTOSAVE_MS);
  }

  function edRestoreDraft() {
    var found = tabGuard.findNewestDraft(edDraftPrefix());
    if (!found) return;
    try {
      var draft = found.data;
      // Discard drafts older than 7 days
      if (Date.now() - draft.ts > 7 * 24 * 60 * 60 * 1000) {
        tabGuard.clearDraftsByPrefix(edDraftPrefix());
        return;
      }
      var count = Object.keys(draft.changes).length;
      if (count === 0) return;
      if (!confirm(UI.confirm.draftRecovery(count))) {
        tabGuard.clearDraftsByPrefix(edDraftPrefix());
        return;
      }
      // Apply drafts to textareas
      for (var segId in draft.changes) {
        var ta = document.getElementById('ta-' + edCssId(segId));
        if (ta) {
          ta.value = draft.changes[segId].content;
          edOnSegmentEdit(segId);
        }
      }
      // Clean up all tab-specific drafts for this module after restore
      tabGuard.clearDraftsByPrefix(edDraftPrefix());
      edUpdateSaveStatusBar();
    } catch {
      tabGuard.clearDraftsByPrefix(edDraftPrefix());
    }
  }

  // ----------------------------------------------------------------
  // MODULE SELECTOR
  // ----------------------------------------------------------------

  const edBookSelect = document.getElementById('ed-book-select');
  const edChapterSelect = document.getElementById('ed-chapter-select');

  edBookSelect.addEventListener('change', async function () {
    edCurrentBook = edBookSelect.value;
    edChapterSelect.disabled = !edCurrentBook;
    edChapterSelect.innerHTML = '<option value="">' + UI.common.loadingChapter + '</option>';
    document.getElementById('modules-list').style.display = 'none';

    if (edCurrentBook) {
      try {
        var data = await fetchJson(ED_API_BASE + '/' + edCurrentBook + '/chapters', {
          credentials: 'include',
        });
        for (var j = 0; j < data.chapters.length; j++) {
          var ch = data.chapters[j];
          var num = ch.chapter != null ? ch.chapter : ch;
          var label = ch.titleIs || ch.title;
          var opt = document.createElement('option');
          opt.value = num;
          opt.textContent =
            num === -1
              ? label || 'Viðaukar'
              : label
                ? 'Kafli ' + num + ' — ' + label
                : 'Kafli ' + num;
          edChapterSelect.appendChild(opt);
        }
      } catch (err) {
        console.error('Failed to load chapters:', err);
      }
      // Restore placeholder if no chapters loaded
      if (edChapterSelect.options.length <= 1) {
        edChapterSelect.innerHTML = '<option value="">' + UI.common.selectChapter + '</option>';
      }
    } else {
      edChapterSelect.innerHTML = '<option value="">' + UI.common.selectChapter + '</option>';
    }
  });

  edChapterSelect.addEventListener('change', async function () {
    edCurrentChapter = parseInt(edChapterSelect.value, 10);
    if (!edCurrentChapter) return;

    var container = document.getElementById('modules-container');
    container.innerHTML =
      '<div class="placeholder-text"><span class="spinner"></span><span>' +
      UI.common.loading +
      '</span></div>';
    document.getElementById('modules-list').style.display = 'block';

    try {
      var data = await fetchJson(ED_API_BASE + '/' + edCurrentBook + '/' + edCurrentChapter, {
        credentials: 'include',
      });

      if (!data.modules || data.modules.length === 0) {
        container.innerHTML = '<p class="placeholder-text">' + UI.common.noModulesFound + '</p>';
        document.getElementById('loc-progress-card').classList.remove('visible');
        return;
      }

      // 5A: Compute and show chapter-level localization progress
      var totalModules = data.modules.filter(function (m) {
        return m.hasFaithful;
      }).length;
      var localizedModules = data.modules.filter(function (m) {
        return m.hasLocalized;
      }).length;
      var progressCard = document.getElementById('loc-progress-card');
      if (totalModules > 0) {
        var pct = Math.round((localizedModules / totalModules) * 100);
        document.getElementById('loc-progress-count').textContent =
          localizedModules +
          '/' +
          totalModules +
          ' hlutir sta\u00F0f\u00E6r\u00F0ir (' +
          pct +
          '%)';
        document.getElementById('loc-progress-fill').style.width = pct + '%';
        progressCard.classList.add('visible');
      } else {
        progressCard.classList.remove('visible');
      }

      container.innerHTML = data.modules
        .map(function (m) {
          var clickable = m.hasFaithful;
          return (
            '<div class="module-item ' +
            (clickable ? 'clickable' : 'disabled') +
            '"' +
            (clickable
              ? ' onclick="edLoadModule(\'' +
                m.moduleId +
                '\')" title="Smelltu til a\u00F0 sta\u00F0f\u00E6ra"'
              : ' title="\u00DEarf Pass 1 fyrst"') +
            '>' +
            '<strong>' +
            escapeHtml(m.titleIs || m.title || m.moduleId) +
            '</strong>' +
            (m.title
              ? '<span style="font-size:var(--text-sm);color:var(--text-secondary);margin-left:0.5rem">' +
                escapeHtml(m.moduleId) +
                (m.section ? ' §' + escapeHtml(m.section) : '') +
                '</span>'
              : '') +
            '<div style="display:flex;gap:0.5rem">' +
            (m.hasFaithful
              ? '<span class="status-badge status-approved">Pass 1</span>'
              : '<span class="status-badge status-pending">Vantar Pass 1</span>') +
            (m.hasLocalized
              ? '<span class="status-badge status-approved">Sta\u00F0f\u00E6rt</span>'
              : '') +
            '</div>' +
            '</div>'
          );
        })
        .join('');
    } catch (err) {
      container.innerHTML =
        '<p class="placeholder-text error-text">Villa: ' + escapeHtml(err.message) + '</p>';
    }
  });

  // ----------------------------------------------------------------
  // LOAD MODULE
  // ----------------------------------------------------------------

  async function edLoadModule(moduleId) {
    edCurrentModuleId = moduleId;
    edPendingChanges = {};

    // Show loading spinner while fetching module data
    var container = document.getElementById('modules-container');
    if (container) {
      container.innerHTML =
        '<div class="placeholder-text"><span class="spinner"></span><span>' +
        UI.common.loadingModule +
        '</span></div>';
    }

    try {
      edModuleData = await fetchJson(
        ED_API_BASE + '/' + edCurrentBook + '/' + edCurrentChapter + '/' + moduleId,
        {
          credentials: 'include',
        }
      );

      // Track file version for conflict detection
      edLastModified = edModuleData.lastModified || null;

      // 5B: Load edit history to get latest category per segment
      edSegmentCategories = {};
      try {
        var histData = await fetchJson(
          ED_API_BASE +
            '/' +
            edCurrentBook +
            '/' +
            edCurrentChapter +
            '/' +
            moduleId +
            '/history?limit=200',
          { credentials: 'include' }
        );
        if (histData.history && histData.history.length > 0) {
          // History is ordered by created_at DESC; first occurrence per segment is the latest
          for (var hi = 0; hi < histData.history.length; hi++) {
            var entry = histData.history[hi];
            if (entry.category && !edSegmentCategories[entry.segment_id]) {
              edSegmentCategories[entry.segment_id] = entry.category;
            }
          }
        }
      } catch {
        // Non-critical — continue without category badges
      }

      // Claim module for cross-tab conflict detection
      tabGuard.claim('loc:' + edCurrentBook + '/' + edCurrentChapter + '/' + moduleId);

      document.getElementById('module-selector').style.display = 'none';
      document.getElementById('editor-container').style.display = 'block';

      edRenderModule();
      edRestoreDraft();
      edStartDraftTimer();

      // Show save status bar and update it
      document.getElementById('save-status-bar').style.display = 'flex';
      edUpdateSaveStatusBar();
    } catch (err) {
      alert(UI.common.errorLoading + err.message);
    }
  }

  // ----------------------------------------------------------------
  // RENDER MODULE
  // ----------------------------------------------------------------

  function edRenderModule() {
    document.getElementById('module-title').textContent =
      edModuleData.moduleId + ' \u2014 ' + edModuleData.title;
    document.getElementById('module-meta').textContent =
      (edModuleData.chapter === -1 ? 'Vi\u00F0aukar' : 'Kafli ' + edModuleData.chapter) +
      ' \u00B7 ' +
      edModuleData.segmentCount +
      ' b\u00FAtar \u00B7 ' +
      edModuleData.faithfulCount +
      ' \u00FE\u00FDddar (Pass 1) \u00B7 ' +
      edModuleData.localizedCount +
      ' sta\u00F0f\u00E6r\u00F0ar';

    edRenderStats();
    edRenderSegments();
    edUpdateProgress();
  }

  function edRenderStats() {
    var bar = document.getElementById('stats-bar');
    var total = edModuleData.segmentCount;
    var localized = edModuleData.localizedCount;
    var remaining = total - localized;
    var modified = Object.keys(edPendingChanges).length;

    bar.innerHTML =
      '<div class="stat-item"><strong>' +
      total +
      '</strong> b\u00FAtar</div>' +
      '<div class="stat-item localized"><strong>' +
      localized +
      '</strong> sta\u00F0f\u00E6r\u00F0ar</div>' +
      '<div class="stat-item remaining"><strong>' +
      remaining +
      '</strong> eftir</div>' +
      (modified > 0
        ? '<div class="stat-item saved"><strong>' +
          modified +
          '</strong> \u00F3vista\u00F0ar breytingar</div>'
        : '');
  }

  function edUpdateProgress() {
    var total = edModuleData.segmentCount || 1;
    var localized = edModuleData.localizedCount + Object.keys(edPendingChanges).length;
    var pct = Math.min(100, Math.round((localized / total) * 100));
    document.getElementById('progress-fill').style.width = pct + '%';
  }

  function edRenderSegments() {
    var tbody = document.getElementById('segments-body');
    var filterType = document.getElementById('filter-type').value;
    var filterCat = document.getElementById('filter-category').value;

    var segments = edModuleData.segments.slice();

    // Apply filters
    if (filterType === 'modified') {
      segments = segments.filter(function (s) {
        return edPendingChanges[s.segmentId];
      });
    } else if (filterType === 'localized') {
      segments = segments.filter(function (s) {
        return s.hasLocalized || edPendingChanges[s.segmentId];
      });
    } else if (filterType === 'remaining') {
      segments = segments.filter(function (s) {
        return !s.hasLocalized && !edPendingChanges[s.segmentId];
      });
    } else if (filterType !== 'all') {
      segments = segments.filter(function (s) {
        return s.segmentType === filterType;
      });
    }

    if (filterCat !== 'all') {
      segments = segments.filter(function (s) {
        var change = edPendingChanges[s.segmentId];
        return change && change.category === filterCat;
      });
    }

    tbody.innerHTML = segments
      .map(function (seg) {
        return edRenderSegmentRow(seg);
      })
      .join('');

    // Attach event listeners for textareas
    segments.forEach(function (seg) {
      var ta = document.getElementById('ta-' + edCssId(seg.segmentId));
      if (ta) {
        ta.addEventListener('input', function () {
          edOnSegmentEdit(seg.segmentId);
        });
        ta.addEventListener('blur', function () {
          edOnSegmentBlur(seg.segmentId);
        });
      }
    });
  }

  function edRenderSegmentRow(seg) {
    var pending = edPendingChanges[seg.segmentId];
    var isDifferent = seg.hasLocalized && seg.localized !== seg.faithful;
    var rowClass = 'segment-row';
    if (pending) rowClass += ' modified';
    else if (seg.hasLocalized) rowClass += ' saved';

    var enHtml = edHighlightMath(escapeHtml(seg.en));
    var faithfulHtml = edRenderMarkdownPreview(seg.faithful);

    var currentContent = pending
      ? pending.content
      : seg.hasLocalized
        ? seg.localized
        : seg.faithful;

    // SVG for copy button
    var copySvg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
    // SVG for save button
    var checkSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

    // SVG for history button
    var historySvg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>';

    return (
      '<tr class="' +
      rowClass +
      '" id="row-' +
      edCssId(seg.segmentId) +
      '">' +
      '<td class="col-type">' +
      '<span class="segment-type-badge ' +
      seg.segmentType +
      '">' +
      escapeHtml(seg.segmentType) +
      '</span>' +
      (isDifferent
        ? '<span class="diff-indicator different" title="Breytt fr\u00E1 tr\u00FAri \u00FE\u00FD\u00F0ingu"></span>'
        : '') +
      '</td>' +
      '<td class="col-en">' +
      '<div class="segment-content">' +
      (enHtml || '<em style="color:var(--text-muted)">\u2014</em>') +
      '</div>' +
      '</td>' +
      '<td class="col-faithful">' +
      '<div class="segment-content">' +
      (faithfulHtml || '<em style="color:var(--text-muted)">\u2014</em>') +
      '</div>' +
      '<button class="btn-copy-faithful" onclick="edCopyFaithful(\'' +
      seg.segmentId +
      '\')" title="Afrita tr\u00FAa \u00FE\u00FD\u00F0ingu">' +
      copySvg +
      ' Afrita' +
      '</button>' +
      '</td>' +
      '<td class="col-localized">' +
      '<textarea class="localized-textarea' +
      (pending ? ' modified' : '') +
      '" ' +
      'id="ta-' +
      edCssId(seg.segmentId) +
      '">' +
      escapeHtml(currentContent) +
      '</textarea>' +
      '<span class="save-indicator" id="ind-' +
      edCssId(seg.segmentId) +
      '">' +
      (seg.hasLocalized && !pending ? 'Vista\u00F0' : '') +
      '</span>' +
      edRenderCategoryBadge(seg.segmentId) +
      '</td>' +
      '<td class="col-actions" style="position:relative">' +
      '<button class="btn-save-seg" onclick="edSaveSingleSegment(\'' +
      seg.segmentId +
      '\')" title="Vista b\u00FAt">' +
      checkSvg +
      '</button>' +
      '<button class="btn-history-seg" onclick="edShowHistory(\'' +
      seg.segmentId +
      '\', this)" title="Breytingasaga">' +
      historySvg +
      '</button>' +
      '<div id="hist-' +
      edCssId(seg.segmentId) +
      '"></div>' +
      '</td>' +
      '</tr>'
    );
  }

  // ----------------------------------------------------------------
  // EDIT TRACKING
  // ----------------------------------------------------------------

  function edOnSegmentEdit(segmentId) {
    var ta = document.getElementById('ta-' + edCssId(segmentId));
    if (!ta) return;

    var seg = edModuleData.segments.find(function (s) {
      return s.segmentId === segmentId;
    });
    if (!seg) return;

    var currentSaved = seg.hasLocalized ? seg.localized : seg.faithful;
    var newContent = ta.value;

    if (newContent !== currentSaved) {
      edPendingChanges[segmentId] = {
        content: newContent,
        category: edPendingChanges[segmentId]?.category || '',
      };
      ta.classList.add('modified');
      var row = document.getElementById('row-' + edCssId(segmentId));
      if (row) row.className = 'segment-row modified';
    } else {
      delete edPendingChanges[segmentId];
      ta.classList.remove('modified');
      var row = document.getElementById('row-' + edCssId(segmentId));
      if (row) row.className = seg.hasLocalized ? 'segment-row saved' : 'segment-row';
    }

    var ind = document.getElementById('ind-' + edCssId(segmentId));
    if (ind)
      ind.textContent = edPendingChanges[segmentId]
        ? 'Breytt'
        : seg.hasLocalized
          ? 'Vista\u00F0'
          : '';

    edRenderStats();
    edUpdateProgress();
    edUpdateSaveStatusBar();
  }

  function edOnSegmentBlur(_segmentId) {
    // Auto-save on blur could be added here if desired
  }

  // ----------------------------------------------------------------
  // SAVE ACTIONS
  // ----------------------------------------------------------------

  /**
   * Validate a segment edit before saving (localization editor).
   */
  function edValidateSegmentEdit(enText, originalIs, editedIs) {
    var blocked = [];
    var warnings = [];

    var enMath = (enText || '').match(/\[\[MATH:\d+\]\]/g) || [];
    for (var i = 0; i < enMath.length; i++) {
      if (editedIs.indexOf(enMath[i]) === -1) {
        blocked.push(UI.validation.mathMissingShort(enMath[i]));
      }
    }

    var origBR = (originalIs || '').match(/\[\[BR\]\]/g) || [];
    var editBR = (editedIs || '').match(/\[\[BR\]\]/g) || [];
    if (origBR.length > editBR.length) {
      blocked.push(UI.validation.brRemovedShort);
    }

    var enXrefs = (enText || '').match(/\[#[A-Za-z0-9_.-]+\]/g) || [];
    for (var j = 0; j < enXrefs.length; j++) {
      if (editedIs.indexOf(enXrefs[j]) === -1) {
        blocked.push(UI.validation.xrefMissingShort(enXrefs[j]));
      }
    }

    // Block: [doc#target] self-closing document refs in EN but missing
    var enDocRefs = (enText || '').match(/\[[A-Za-z0-9_.-]+#[A-Za-z0-9_.-]+\]/g) || [];
    for (var k = 0; k < enDocRefs.length; k++) {
      if (editedIs.indexOf(enDocRefs[k]) === -1) {
        blocked.push(UI.validation.docRefMissingShort(enDocRefs[k]));
      }
    }

    // Block: [text](#anchor) or [text](doc#target) links in original IS but removed
    var origLinks = (originalIs || '').match(/\[[^\]]+\]\([^)]+\)/g) || [];
    for (var l = 0; l < origLinks.length; l++) {
      if (editedIs.indexOf(origLinks[l]) === -1) {
        blocked.push(UI.validation.linkRemoved(origLinks[l]));
      }
    }

    // Block: [[MEDIA:N]] in EN but missing from edited IS
    var enMedia = (enText || '').match(/\[\[MEDIA:\d+\]\]/g) || [];
    for (var n = 0; n < enMedia.length; n++) {
      if (editedIs.indexOf(enMedia[n]) === -1) {
        blocked.push(UI.validation.mediaMissingShort(enMedia[n]));
      }
    }

    // Block: [[SPACE]] / [[SPACE:N]] in original IS but removed
    var origSpaces = (originalIs || '').match(/\[\[SPACE(?::\d+)?\]\]/g) || [];
    var editSpaces = (editedIs || '').match(/\[\[SPACE(?::\d+)?\]\]/g) || [];
    if (origSpaces.length > editSpaces.length) {
      blocked.push(UI.validation.spaceRemoved(origSpaces.length, editSpaces.length));
    }

    if (originalIs && originalIs.trim() && (!editedIs || !editedIs.trim())) {
      warnings.push(UI.validation.segmentCleared);
    }

    // Warning: unmatched formatting pairs
    var ppCount = (editedIs.match(/\+\+/g) || []).length;
    if (ppCount % 2 !== 0) {
      warnings.push(UI.validation.unmatchedPair(UI.validation.pairNames.underline, ppCount));
    }
    var boldCount = (editedIs.match(/\*\*/g) || []).length;
    if (boldCount % 2 !== 0) {
      warnings.push(UI.validation.unmatchedPair(UI.validation.pairNames.bold, boldCount));
    }
    var termCount = (editedIs.match(/__/g) || []).length;
    if (termCount % 2 !== 0) {
      warnings.push(UI.validation.unmatchedPair(UI.validation.pairNames.term, termCount));
    }

    // Asymmetric pair: {= must match =}
    var openEmph = (editedIs.match(/\{=/g) || []).length;
    var closeEmph = (editedIs.match(/=\}/g) || []).length;
    if (openEmph !== closeEmph) {
      warnings.push(UI.validation.unmatchedEmphasis(openEmph, closeEmph));
    }

    return {
      blocked: blocked.length > 0 ? blocked : null,
      warnings: warnings.length > 0 ? warnings : null,
    };
  }

  async function edSaveSingleSegment(segmentId) {
    var ta = document.getElementById('ta-' + edCssId(segmentId));
    var ind = document.getElementById('ind-' + edCssId(segmentId));
    if (!ta) return;

    var content = ta.value;

    // Validate before saving
    var seg = edModuleData.segments.find(function (s) {
      return s.segmentId === segmentId;
    });
    if (seg) {
      var validation = edValidateSegmentEdit(seg.en, seg.faithful, content);
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
    }

    ind.textContent = UI.save.saving;
    ind.className = 'save-indicator saving';

    var saveUrl =
      ED_API_BASE +
      '/' +
      edCurrentBook +
      '/' +
      edCurrentChapter +
      '/' +
      edCurrentModuleId +
      '/save';
    var saveBody = { segmentId: segmentId, content: content };
    if (edLastModified != null) saveBody.lastModified = edLastModified;
    var saveOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(saveBody),
    };

    try {
      var result = await saveRetry.attempt(
        'loc:' + edCurrentBook + '/' + edCurrentChapter + '/' + edCurrentModuleId + ':' + segmentId,
        saveUrl,
        saveOptions
      );

      // Update conflict tracking with new mtime
      if (result.lastModified != null) edLastModified = result.lastModified;

      // Update local state
      var seg = edModuleData.segments.find(function (s) {
        return s.segmentId === segmentId;
      });
      if (seg) {
        seg.localized = content;
        seg.hasLocalized = true;
      }

      delete edPendingChanges[segmentId];
      edSaveDraft(); // update draft (or clear if empty)
      ta.classList.remove('modified');

      var row = document.getElementById('row-' + edCssId(segmentId));
      if (row) row.className = 'segment-row saved';

      ind.textContent = UI.save.saved;
      ind.className = 'save-indicator saved';

      edModuleData.localizedCount = edModuleData.segments.filter(function (s) {
        return s.hasLocalized;
      }).length;
      edLastServerSaveTime = Date.now();
      edRenderStats();
      edUpdateProgress();
      edUpdateSaveStatusBar();
    } catch (err) {
      if (err.status === 409) {
        ind.textContent = UI.save.conflict;
        ind.className = 'save-indicator error';
        if (
          confirm(
            'Einingin hefur veri\u00F0 breytt af \u00F6\u00F0rum notanda.\nEndurhla\u00F0a til a\u00F0 sj\u00E1 n\u00FDjustu \u00FAtg\u00E1fu?\n\n(\u00D3vista\u00F0ar breytingar \u00FE\u00EDnar ver\u00F0a geymdar sem dr\u00F6g.)'
          )
        ) {
          edSaveDraft();
          edLoadModule(edCurrentModuleId);
        }
        return;
      }
      ind.textContent = UI.save.errorIndicator;
      ind.className = 'save-indicator error';
      if (!saveRetry.isRetryable(err)) {
        alert(UI.common.errorSaving + err.message);
      }
    }
  }

  async function edSaveAllSegments() {
    if (edSaveInFlight) return;
    var keys = Object.keys(edPendingChanges);
    if (keys.length === 0) {
      alert(UI.alert.noUnsavedChanges);
      return;
    }

    // Validate all pending segments before bulk save
    var allBlocked = [];
    for (var k = 0; k < keys.length; k++) {
      var segId = keys[k];
      var seg = edModuleData.segments.find(function (s) {
        return s.segmentId === segId;
      });
      if (seg) {
        var v = edValidateSegmentEdit(seg.en, seg.faithful, edPendingChanges[segId].content);
        if (v.blocked) {
          allBlocked.push(segId + ': ' + v.blocked.join(', '));
        }
      }
    }
    if (allBlocked.length > 0) {
      alert(UI.confirm.bulkValidationBlocked + allBlocked.join('\n'));
      return;
    }

    edSaveInFlight = true;
    var saveAllBtn = document.getElementById('btn-save-all');
    saveAllBtn.disabled = true;
    saveAllBtn.classList.add('btn-loading');
    var globalInd = document.getElementById('global-save-indicator');
    globalInd.textContent = UI.localization.savingBulk(keys.length);
    globalInd.className = 'save-indicator saving';

    var segments = keys.map(function (segmentId) {
      return {
        segmentId: segmentId,
        content: edPendingChanges[segmentId].content,
      };
    });

    var saveUrl =
      ED_API_BASE +
      '/' +
      edCurrentBook +
      '/' +
      edCurrentChapter +
      '/' +
      edCurrentModuleId +
      '/save-all';
    var saveBody = { segments: segments };
    if (edLastModified != null) saveBody.lastModified = edLastModified;
    var saveOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(saveBody),
    };

    try {
      var result = await saveRetry.attempt(
        'loc-all:' + edCurrentBook + '/' + edCurrentChapter + '/' + edCurrentModuleId,
        saveUrl,
        saveOptions
      );

      // Update conflict tracking with new mtime
      if (result.lastModified != null) edLastModified = result.lastModified;

      // Update local state for all saved segments
      for (var i = 0; i < keys.length; i++) {
        var segmentId = keys[i];
        var seg = edModuleData.segments.find(function (s) {
          return s.segmentId === segmentId;
        });
        if (seg) {
          seg.localized = edPendingChanges[segmentId].content;
          seg.hasLocalized = true;
        }
      }
      edPendingChanges = {};
      edClearDraft();

      edModuleData.localizedCount = edModuleData.segments.filter(function (s) {
        return s.hasLocalized;
      }).length;

      globalInd.textContent = UI.localization.savedBulk(result.savedSegments);
      globalInd.className = 'save-indicator saved';
      setTimeout(function () {
        globalInd.textContent = '';
      }, 3000);

      edLastServerSaveTime = Date.now();
      edRenderSegments();
      edRenderStats();
      edUpdateProgress();
      edUpdateSaveStatusBar();

      // Reset autosave timer to avoid redundant save right after manual save
      if (edAutoSaveTimer) clearInterval(edAutoSaveTimer);
      edAutoSaveTimer = setInterval(edAutoSave, ED_AUTOSAVE_MS);
    } catch (err) {
      if (err.status === 409) {
        if (edAutoSaveTimer) {
          clearInterval(edAutoSaveTimer);
          edAutoSaveTimer = null;
        }
        globalInd.textContent = UI.save.conflict;
        globalInd.className = 'save-indicator error';
        if (
          confirm(
            'Einingin hefur veri\u00F0 breytt af \u00F6\u00F0rum notanda.\nEndurhla\u00F0a til a\u00F0 sj\u00E1 n\u00FDjustu \u00FAtg\u00E1fu?\n\n(\u00D3vista\u00F0ar breytingar \u00FE\u00EDnar ver\u00F0a geymdar sem dr\u00F6g.)'
          )
        ) {
          edSaveDraft();
          edLoadModule(edCurrentModuleId);
        }
        return;
      }
      globalInd.textContent = UI.save.errorIndicator;
      globalInd.className = 'save-indicator error';
      if (!saveRetry.isRetryable(err)) {
        alert(UI.common.errorSaving + err.message);
      }
    } finally {
      edSaveInFlight = false;
      saveAllBtn.disabled = false;
      saveAllBtn.classList.remove('btn-loading');
    }
  }

  function edCopyFaithful(segmentId) {
    var seg = edModuleData.segments.find(function (s) {
      return s.segmentId === segmentId;
    });
    if (!seg) return;

    var ta = document.getElementById('ta-' + edCssId(segmentId));
    if (ta) {
      ta.value = seg.faithful;
      edOnSegmentEdit(segmentId);
    }
  }

  // ----------------------------------------------------------------
  // BACK BUTTON
  // ----------------------------------------------------------------

  document.getElementById('btn-back').addEventListener('click', function () {
    if (Object.keys(edPendingChanges).length > 0) {
      if (!confirm(UI.confirm.leaveUnsaved)) return;
    }
    edClearDraft();
    if (edDraftTimer) clearInterval(edDraftTimer);
    if (edAutoSaveTimer) clearInterval(edAutoSaveTimer);
    tabGuard.release();
    document.getElementById('editor-container').style.display = 'none';
    document.getElementById('module-selector').style.display = 'block';
    document.getElementById('save-status-bar').style.display = 'none';
    edModuleData = null;
    edPendingChanges = {};
    edLastServerSaveTime = null;
  });

  // ----------------------------------------------------------------
  // SAVE ALL BUTTON
  // ----------------------------------------------------------------

  document.getElementById('btn-save-all').addEventListener('click', edSaveAllSegments);

  // ----------------------------------------------------------------
  // FILTERS
  // ----------------------------------------------------------------

  document.getElementById('filter-type').addEventListener('change', edRenderSegments);
  document.getElementById('filter-category').addEventListener('change', edRenderSegments);

  // ----------------------------------------------------------------
  // WARN BEFORE LEAVING WITH UNSAVED CHANGES
  // ----------------------------------------------------------------

  window.addEventListener('beforeunload', function (e) {
    if (edAutoSaveTimer) {
      clearInterval(edAutoSaveTimer);
      edAutoSaveTimer = null;
    }
    if (edDraftTimer) {
      clearInterval(edDraftTimer);
      edDraftTimer = null;
    }
    if (Object.keys(edPendingChanges).length > 0) {
      edSaveDraft(); // last-chance save to localStorage
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // Save drafts on auth expiry (before 401 redirect)
  window.addEventListener('auth-expired', function () {
    if (Object.keys(edPendingChanges).length > 0) edSaveDraft();
  });

  // ----------------------------------------------------------------
  // KEYBOARD SHORTCUTS
  // ----------------------------------------------------------------
  document.addEventListener('keydown', function (e) {
    // Escape key: go back to module list (with unsaved-changes guard)
    if (e.key === 'Escape' && edModuleData) {
      if (Object.keys(edPendingChanges).length > 0) {
        if (!confirm(UI.confirm.leaveUnsaved)) return;
      }
      document.getElementById('btn-back').click();
    }
  });

  // ----------------------------------------------------------------
  // EDITOR HELPERS
  // ----------------------------------------------------------------

  function edHighlightMath(html) {
    return html.replace(/\[\[MATH:(\d+)\]\]/g, '<span class="math-placeholder">[[MATH:$1]]</span>');
  }

  /**
   * Render markdown preview from raw segment text (localization editor).
   */
  function edRenderMarkdownPreview(text) {
    if (!text) return '';
    var html = escapeHtml(text);
    html = html.replace(/\[\[MATH:(\d+)\]\]/g, '<span class="math-placeholder">[[MATH:$1]]</span>');
    html = html.replace(
      /\[\[MEDIA:(\d+)\]\]/g,
      '<span class="math-placeholder" title="Mynd/mi\u00F0ill">[[MEDIA:$1]]</span>'
    );
    html = html.replace(
      /\[\[SPACE(?::(\d+))?\]\]/g,
      '<span class="preview-br" title="Bil">\u00B7</span>'
    );
    html = html.replace(/\[\[BR\]\]/g, '<span class="preview-br">[BR]</span><br>');
    html = html.replace(
      /\[#([A-Za-z0-9_.-]+)\]/g,
      '<span class="xref-chip" title="Tilv\u00EDsun: $1">&#128247;</span>'
    );
    html = html.replace(
      /\[([A-Za-z0-9_.-]+)#([A-Za-z0-9_.-]+)\]/g,
      '<span class="xref-chip" title="Skjal: $1, tilv\u00EDsun: $2">&#128247;</span>'
    );
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (m, text, url) {
      if (url.charAt(0) === '#') {
        return '<span class="link-chip" title="Hlekkur: ' + url + '">' + text + ' &#128279;</span>';
      }
      return (
        '<span class="link-chip" title="Skjalhlekkur: ' + url + '">' + text + ' &#128279;</span>'
      );
    });
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
    html = html.replace(/__(.+?)__/g, '<span class="preview-term">$1</span>');
    html = html.replace(/(?<!~)~(?!~)(.+?)(?<!~)~(?!~)/g, '<sub>$1</sub>');
    html = html.replace(/\^(.+?)\^/g, '<sup>$1</sup>');
    html = html.replace(/\+\+(.+?)\+\+/g, '<u>$1</u>');
    html = html.replace(/\{=(.+?)=\}/g, '<span style="color:#d32f2f;font-weight:bold">$1</span>');
    html = html.replace(
      /\[(?:footnote|ne\u00F0anm\u00E1lsgrein): (.+?)\]/g,
      '<span class="xref-chip" title="Ne\u00F0anm\u00E1lsgrein">\u2020$1</span>'
    );
    return html;
  }

  function edCssId(segmentId) {
    return segmentId.replace(/[^a-zA-Z0-9-]/g, '_');
  }

  // 5B: Category badge labels (Icelandic)
  var edCategoryLabels = {
    'unit-conversion': 'Einingabreyting',
    'cultural-adaptation': 'Menningarlegt',
    'example-replacement': 'D\u00E6maskipti',
    formatting: 'Sni\u00F0',
  };

  /**
   * Render a small category badge for a segment if it has been localized with a category.
   * Uses edSegmentCategories lookup (populated from edit history on module load).
   */
  function edRenderCategoryBadge(segmentId) {
    var category = edSegmentCategories[segmentId];
    if (!category) return '';
    var label = edCategoryLabels[category] || category;
    return (
      '<span class="seg-category-badge ' +
      escapeHtml(category) +
      '">' +
      escapeHtml(label) +
      '</span>'
    );
  }

  // ----------------------------------------------------------------
  // SEGMENT HISTORY POPOVER
  // ----------------------------------------------------------------

  var edOpenPopover = null;

  function edClosePopover() {
    if (edOpenPopover) {
      edOpenPopover.remove();
      edOpenPopover = null;
    }
  }

  // Close popover on outside click
  document.addEventListener('click', function (e) {
    if (
      edOpenPopover &&
      !edOpenPopover.contains(e.target) &&
      !e.target.closest('.btn-history-seg')
    ) {
      edClosePopover();
    }
  });

  async function edShowHistory(segmentId, _btn) {
    // Toggle off if already showing for this segment
    var container = document.getElementById('hist-' + edCssId(segmentId));
    if (edOpenPopover && edOpenPopover.parentElement === container) {
      edClosePopover();
      return;
    }
    edClosePopover();

    var popover = document.createElement('div');
    popover.className = 'history-popover';
    popover.innerHTML =
      '<div class="history-popover-header"><span>' +
      UI.history.title +
      '</span></div>' +
      '<div style="text-align:center;padding:var(--spacing-sm);color:var(--text-muted)"><span class="spinner"></span> Hle\u00F0ur...</div>';
    container.appendChild(popover);
    edOpenPopover = popover;

    try {
      var data = await fetchJson(
        ED_API_BASE +
          '/' +
          edCurrentBook +
          '/' +
          edCurrentChapter +
          '/' +
          edCurrentModuleId +
          '/' +
          encodeURIComponent(segmentId) +
          '/history',
        { credentials: 'include' }
      );

      if (!data.history || data.history.length === 0) {
        popover.innerHTML =
          '<div class="history-popover-header"><span>Breytingasaga</span>' +
          '<button class="btn-close" onclick="edClosePopover()" style="font-size:1rem">&times;</button></div>' +
          '<div style="text-align:center;padding:var(--spacing-sm);color:var(--text-muted)">' +
          UI.history.empty +
          '</div>';
        return;
      }

      var html =
        '<div class="history-popover-header"><span>Breytingasaga (' +
        data.history.length +
        ')</span>' +
        '<button class="btn-close" onclick="edClosePopover()" style="font-size:1rem">&times;</button></div>';

      for (var i = 0; i < data.history.length; i++) {
        var entry = data.history[i];
        var dateStr = new Date(entry.created_at + 'Z').toLocaleString('is-IS', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        var prevTrunc = (entry.previous_content || '').substring(0, 60);
        var newTrunc = (entry.new_content || '').substring(0, 60);
        var catBadge = entry.category
          ? '<span class="category-badge ' +
            entry.category +
            '">' +
            escapeHtml(entry.category) +
            '</span>'
          : '';

        html +=
          '<div class="history-entry">' +
          '<div class="history-meta">' +
          '<span>' +
          escapeHtml(entry.editor_username) +
          '</span>' +
          '<span>' +
          escapeHtml(dateStr) +
          '</span>' +
          '</div>' +
          '<div class="history-diff">' +
          '<span class="history-prev" title="' +
          escapeHtml(entry.previous_content) +
          '">' +
          escapeHtml(prevTrunc) +
          '</span>' +
          '<span class="history-arrow">\u2192</span>' +
          '<span class="history-new" title="' +
          escapeHtml(entry.new_content) +
          '">' +
          escapeHtml(newTrunc) +
          '</span>' +
          '<button class="btn-history-restore" data-restore-idx="' +
          i +
          '" title="Setja \u00FEessa \u00FAtg\u00E1fu \u00ED textareitinn">Endurheimta</button>' +
          '</div>' +
          catBadge +
          '</div>';
      }
      popover.innerHTML = html;

      // Attach restore button handlers
      var historyEntries = data.history;
      popover.querySelectorAll('.btn-history-restore').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var idx = parseInt(btn.getAttribute('data-restore-idx'));
          var content = historyEntries[idx].new_content || '';
          var ta = document.getElementById('ta-' + edCssId(segmentId));
          if (ta) {
            ta.value = content;
            edOnSegmentEdit(segmentId);
            edClosePopover();
          }
        });
      });
    } catch (err) {
      popover.innerHTML =
        '<div class="history-popover-header"><span>Breytingasaga</span>' +
        '<button class="btn-close" onclick="edClosePopover()" style="font-size:1rem">&times;</button></div>' +
        '<div style="text-align:center;padding:var(--spacing-sm);color:var(--error)">Villa: ' +
        escapeHtml(err.message) +
        '</div>';
    }
  }

  // ================================================================
  //
  //   REVIEW VIEW — All JS from localization-review.html
  //
  // ================================================================

  // eslint-disable-next-line no-unused-vars -- set by onUserReady(), reserved for future user context
  let _rvCurrentUser = null;
  let rvCurrentSectionId = null;
  let rvCurrentSuggestions = [];
  let rvCurrentFilter = 'all';
  let rvEditingSuggestionId = null;

  // ----------------------------------------------------------------
  // REVIEW: Event Listeners
  // ----------------------------------------------------------------

  function rvSetupEventListeners() {
    document.getElementById('rv-book-select').addEventListener('change', async function (e) {
      var bookSlug = e.target.value;
      if (bookSlug) {
        await rvLoadChapters(bookSlug);
      } else {
        rvResetSelectors(['rv-chapter-select', 'rv-section-select']);
      }
    });

    document.getElementById('rv-chapter-select').addEventListener('change', async function (e) {
      var chapterNum = e.target.value;
      var bookSlug = document.getElementById('rv-book-select').value;
      if (bookSlug && chapterNum) {
        await rvLoadSections(bookSlug, chapterNum);
      } else {
        rvResetSelectors(['rv-section-select']);
      }
    });

    document.getElementById('rv-section-select').addEventListener('change', function () {
      var sectionId = document.getElementById('rv-section-select').value;
      document.getElementById('rv-load-btn').disabled = !sectionId;
    });
  }

  // ----------------------------------------------------------------
  // REVIEW: Load books / chapters / sections
  // ----------------------------------------------------------------

  async function rvLoadBooks() {
    try {
      var data = await fetchJson('/api/admin/books');
      var select = document.getElementById('rv-book-select');

      data.books.forEach(function (book) {
        select.innerHTML +=
          '<option value="' + escapeHtml(book.slug) + '">' + escapeHtml(book.titleIs) + '</option>';
      });
    } catch (err) {
      console.error('Failed to load books:', err);
    }
  }

  async function rvLoadChapters(bookSlug) {
    var select = document.getElementById('rv-chapter-select');
    select.innerHTML = '<option value="">' + UI.common.loading + '</option>';
    select.disabled = true;
    rvResetSelectors(['rv-section-select']);

    try {
      var data = await fetchJson('/api/books/' + bookSlug);

      select.innerHTML = '<option value="">' + UI.common.selectChapter + '</option>';
      data.chapters.forEach(function (ch) {
        select.innerHTML +=
          '<option value="' +
          ch.chapter +
          '">Kafli ' +
          ch.chapter +
          ': ' +
          escapeHtml(ch.titleIs || ch.title) +
          '</option>';
      });
      select.disabled = false;
    } catch {
      select.innerHTML = '<option value="">' + UI.common.error + '</option>';
    }
  }

  async function rvLoadSections(bookSlug, chapterNum) {
    var select = document.getElementById('rv-section-select');
    select.innerHTML = '<option value="">' + UI.common.loading + '</option>';
    select.disabled = true;

    try {
      var data = await fetchJson('/api/sections/' + bookSlug + '/' + chapterNum);

      select.innerHTML = '<option value="">' + UI.common.selectOption + '...</option>';
      data.sections.forEach(function (sec) {
        var status =
          sec.status === 'localization_in_progress'
            ? ' (\u00ED vinnslu)'
            : sec.status === 'faithful_approved'
              ? ' (tilb\u00FAinn)'
              : '';
        select.innerHTML +=
          '<option value="' + sec.id + '">' + escapeHtml(sec.sectionNum) + status + '</option>';
      });
      select.disabled = false;
    } catch {
      select.innerHTML = '<option value="">' + UI.common.error + '</option>';
    }
  }

  function rvResetSelectors(ids) {
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      el.innerHTML = '<option value="">' + UI.common.selectOption + '</option>';
      el.disabled = true;
    });
    document.getElementById('rv-load-btn').disabled = true;
  }

  // ----------------------------------------------------------------
  // REVIEW: Load section
  // ----------------------------------------------------------------

  async function rvLoadSection() {
    var sectionId = document.getElementById('rv-section-select').value;
    if (!sectionId) return;
    await rvLoadSectionById(parseInt(sectionId, 10));
  }

  // Track the current section's metadata for module-based API calls
  var rvCurrentSectionMeta = null;

  async function rvLoadSectionById(sectionId) {
    rvCurrentSectionId = sectionId;

    // Update URL
    var url = new URL(window.location);
    url.searchParams.set('sectionId', sectionId);
    window.history.pushState({}, '', url);

    // Hide selector, show interface
    document.getElementById('rv-section-selector').style.display = 'none';
    document.getElementById('rv-review-interface').style.display = 'block';

    try {
      // Step 1: Get section metadata (book, chapter, moduleId) from sections API
      var section = await fetchJson('/api/sections/' + sectionId);

      rvCurrentSectionMeta = {
        bookSlug: section.bookSlug,
        chapterNum: section.chapterNum,
        moduleId: section.moduleId,
        sectionNum: section.sectionNum,
        titleEn: section.titleEn,
        status: section.status,
      };

      document.getElementById('rv-section-title').textContent =
        section.sectionNum + ' - ' + (section.titleEn || 'Hluti');
      document.getElementById('rv-section-status').textContent = rvFormatStatus(section.status);

      // Step 2: Load content via localization-editor API (module-based)
      await rvLoadPanelContent(rvCurrentSectionMeta);
      await rvLoadSuggestions();

      // Step 3: Load edit history via localization-editor history endpoint
      if (rvCurrentSectionMeta.moduleId) {
        try {
          var historyData = await fetchJson(
            '/api/localization-editor/' +
              rvCurrentSectionMeta.bookSlug +
              '/' +
              rvCurrentSectionMeta.chapterNum +
              '/' +
              rvCurrentSectionMeta.moduleId +
              '/history'
          );
          if (historyData.history && historyData.history.length > 0) {
            rvRenderLogEntries(historyData.history);
          }
        } catch (histErr) {
          console.warn('Could not load history:', histErr.message);
        }
      }
    } catch (err) {
      console.error('Failed to load section:', err);
      alert(UI.common.errorPrefix + err.message);
    }
  }

  async function rvLoadPanelContent(sectionMeta) {
    var faithfulEl = document.getElementById('rv-faithful-content');

    try {
      // Use the localization-editor endpoint to load EN + faithful IS + localized IS
      var data = await fetchJson(
        '/api/localization-editor/' +
          sectionMeta.bookSlug +
          '/' +
          sectionMeta.chapterNum +
          '/' +
          sectionMeta.moduleId
      );

      if (data.segments && data.segments.length > 0) {
        // Build a preview from the faithful IS segments
        var faithfulHtml = data.segments
          .map(function (seg) {
            var text = seg.faithful || seg.mt || '';
            return '<p>' + escapeHtml(text) + '</p>';
          })
          .join('');
        faithfulEl.innerHTML =
          faithfulHtml ||
          '<p class="placeholder-text">Tr\u00FA \u00FE\u00FD\u00F0ing ekki tilt\u00E6k.</p>';
      } else {
        faithfulEl.innerHTML =
          '<p class="placeholder-text">Tr\u00FA \u00FE\u00FD\u00F0ing ekki tilt\u00E6k.</p>';
      }
    } catch {
      faithfulEl.innerHTML =
        '<p class="placeholder-text">Villa vi\u00F0 a\u00F0 hla\u00F0a \u00FE\u00FD\u00F0ingu.</p>';
    }

    var localizedEl = document.getElementById('rv-localized-content');
    localizedEl.innerHTML = faithfulEl.innerHTML;
  }

  // ----------------------------------------------------------------
  // REVIEW: Suggestions
  // ----------------------------------------------------------------

  async function rvLoadSuggestions() {
    try {
      var data = await fetchJson('/api/suggestions/' + rvCurrentSectionId);

      rvCurrentSuggestions = data.suggestions || [];
      rvUpdateStats(data.stats);
      rvRenderSuggestions();
    } catch (err) {
      console.error('Failed to load suggestions:', err);
      document.getElementById('rv-suggestions-list').innerHTML =
        '<p class="placeholder-text error-text">Villa vi\u00F0 a\u00F0 hla\u00F0a till\u00F6gum.</p>';
    }
  }

  function rvUpdateStats(stats) {
    document.getElementById('rv-stat-total').textContent = stats?.total || 0;
    document.getElementById('rv-stat-pending').textContent = stats?.byStatus?.pending || 0;
    document.getElementById('rv-stat-accepted').textContent =
      (stats?.byStatus?.accepted || 0) + (stats?.byStatus?.modified || 0);
    document.getElementById('rv-stat-rejected').textContent = stats?.byStatus?.rejected || 0;
  }

  function rvRenderSuggestions() {
    var list = document.getElementById('rv-suggestions-list');

    var filtered =
      rvCurrentFilter === 'all'
        ? rvCurrentSuggestions
        : rvCurrentSuggestions.filter(function (s) {
            if (rvCurrentFilter === 'accepted') {
              return s.status === 'accepted' || s.status === 'modified';
            }
            return s.status === rvCurrentFilter;
          });

    if (filtered.length === 0) {
      list.innerHTML = '<p class="placeholder-text">' + UI.alert.noPendingSuggestions + '</p>';
      return;
    }

    // Arrow SVG
    var arrowSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>';
    var checkSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    var editSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
    var xSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

    list.innerHTML = filtered
      .map(function (s) {
        var actionsHtml;
        if (s.status === 'pending') {
          actionsHtml =
            '<button class="btn btn-sm btn-success" onclick="rvAcceptSuggestion(' +
            s.id +
            ')">' +
            checkSvg +
            ' Sam\u00FEykkja</button>' +
            '<button class="btn btn-sm btn-secondary" onclick="rvEditSuggestion(' +
            s.id +
            ')">' +
            editSvg +
            ' Breyta</button>' +
            '<button class="btn btn-sm btn-secondary" onclick="rvRejectSuggestion(' +
            s.id +
            ')">' +
            xSvg +
            ' Hafna</button>';
        } else {
          actionsHtml =
            '<span class="status-label status-' +
            s.status +
            '">' +
            rvFormatSuggestionStatus(s.status) +
            '</span>';
        }

        return (
          '<div class="suggestion-item suggestion-' +
          s.status +
          '" data-id="' +
          s.id +
          '">' +
          '<div class="suggestion-type">' +
          '<span class="type-badge type-' +
          s.type +
          '">' +
          rvFormatType(s.type) +
          '</span>' +
          '<span class="line-number">L\u00EDna ' +
          s.lineNumber +
          '</span>' +
          '</div>' +
          '<div class="suggestion-content">' +
          '<div class="original"><label>Upprunalegt:</label><span>' +
          escapeHtml(s.originalText) +
          '</span></div>' +
          '<div class="suggestion-arrow">' +
          arrowSvg +
          '</div>' +
          '<div class="suggested"><label>Till\u00F6ga:</label><span>' +
          escapeHtml(s.reviewerModifiedText || s.suggestedText) +
          '</span>' +
          (s.status === 'modified' ? '<em>(breytt)</em>' : '') +
          '</div>' +
          '</div>' +
          '<div class="suggestion-context">' +
          escapeHtml(s.context || '') +
          '</div>' +
          '<div class="suggestion-actions">' +
          actionsHtml +
          '</div>' +
          '</div>'
        );
      })
      .join('');
  }

  function rvFilterSuggestions(filter) {
    rvCurrentFilter = filter;

    document.querySelectorAll('.filter-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.filter === filter);
    });

    rvRenderSuggestions();
  }

  async function rvScanForSuggestions() {
    var btn = event.target.closest('button');
    btn.disabled = true;
    var originalHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> ' + UI.localization.scanning;

    try {
      var data = await fetchJson('/api/suggestions/scan/' + rvCurrentSectionId, { method: 'POST' });

      if (data.success) {
        await rvLoadSuggestions();
        alert(UI.alert.scanned(data.suggestionsCount));
      }
    } catch (err) {
      alert(UI.common.errorPrefix + err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }

  async function rvAcceptSuggestion(id) {
    try {
      var data = await fetchJson('/api/suggestions/' + id + '/accept', { method: 'POST' });

      if (data.success) {
        await rvLoadSuggestions();
      }
    } catch (err) {
      alert(UI.common.errorPrefix + err.message);
    }
  }

  async function rvRejectSuggestion(id) {
    try {
      var data = await fetchJson('/api/suggestions/' + id + '/reject', { method: 'POST' });

      if (data.success) {
        await rvLoadSuggestions();
      }
    } catch (err) {
      alert(UI.common.errorPrefix + err.message);
    }
  }

  function rvEditSuggestion(id) {
    rvEditingSuggestionId = id;
    var suggestion = rvCurrentSuggestions.find(function (s) {
      return s.id === id;
    });

    document.getElementById('edit-original').value = suggestion.originalText;
    document.getElementById('edit-suggested').value = suggestion.suggestedText;
    document.getElementById('edit-modified').value =
      suggestion.reviewerModifiedText || suggestion.suggestedText;

    document.getElementById('edit-modal').style.display = 'flex';
  }

  async function rvSaveModifiedSuggestion() {
    var modifiedText = document.getElementById('edit-modified').value.trim();

    if (!modifiedText) {
      alert(UI.alert.modificationRequired);
      return;
    }

    try {
      var data = await fetchJson('/api/suggestions/' + rvEditingSuggestionId + '/modify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modifiedText: modifiedText }),
      });

      if (data.success) {
        closeModal('edit-modal');
        await rvLoadSuggestions();
      }
    } catch (err) {
      alert(UI.common.errorPrefix + err.message);
    }
  }

  async function rvAcceptAllPending() {
    var pendingIds = rvCurrentSuggestions
      .filter(function (s) {
        return s.status === 'pending';
      })
      .map(function (s) {
        return s.id;
      });

    if (pendingIds.length === 0) {
      alert(UI.alert.noPendingSuggestions);
      return;
    }

    if (!confirm(UI.confirm.acceptSuggestions(pendingIds.length))) return;

    try {
      var data = await fetchJson('/api/suggestions/' + rvCurrentSectionId + '/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: pendingIds, action: 'accept' }),
      });

      if (data.success) {
        await rvLoadSuggestions();
      }
    } catch (err) {
      alert(UI.common.errorPrefix + err.message);
    }
  }

  async function rvRejectAllPending() {
    var pendingIds = rvCurrentSuggestions
      .filter(function (s) {
        return s.status === 'pending';
      })
      .map(function (s) {
        return s.id;
      });

    if (pendingIds.length === 0) {
      alert(UI.alert.noPendingSuggestions);
      return;
    }

    if (!confirm(UI.confirm.rejectSuggestions(pendingIds.length))) return;

    try {
      var data = await fetchJson('/api/suggestions/' + rvCurrentSectionId + '/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: pendingIds, action: 'reject' }),
      });

      if (data.success) {
        await rvLoadSuggestions();
      }
    } catch (err) {
      alert(UI.common.errorPrefix + err.message);
    }
  }

  async function rvSyncToLog() {
    var accepted = rvCurrentSuggestions.filter(function (s) {
      return s.status === 'accepted' || s.status === 'modified';
    });

    if (accepted.length === 0) {
      alert(UI.alert.noAcceptedSuggestions);
      return;
    }

    try {
      var data = await fetchJson('/api/suggestions/' + rvCurrentSectionId + '/sync-log', {
        method: 'POST',
      });

      if (data.success) {
        alert(UI.alert.syncedEntries(data.entriesCreated));
        await rvReloadHistory();
      }
    } catch (err) {
      alert(UI.common.errorPrefix + err.message);
    }
  }

  // ----------------------------------------------------------------
  // REVIEW: Log entries
  // ----------------------------------------------------------------

  function rvRenderLogEntries(entries) {
    var list = document.getElementById('rv-log-list');
    var arrowSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>';

    if (!entries || entries.length === 0) {
      list.innerHTML = '<p class="placeholder-text">' + UI.history.noEntries + '</p>';
      return;
    }

    list.innerHTML = entries
      .map(function (e) {
        return (
          '<div class="log-entry">' +
          '<div class="log-type"><span class="type-badge type-' +
          e.type +
          '">' +
          rvFormatLogType(e.type) +
          '</span></div>' +
          '<div class="log-content">' +
          '<span class="log-original">' +
          escapeHtml(e.original) +
          '</span>' +
          arrowSvg +
          '<span class="log-changed">' +
          escapeHtml(e.changedTo) +
          '</span>' +
          '</div>' +
          '<div class="log-reason">' +
          escapeHtml(e.reason) +
          '</div>' +
          (e.location ? '<div class="log-location">' + escapeHtml(e.location) + '</div>' : '') +
          '</div>'
        );
      })
      .join('');
  }

  async function rvReloadHistory() {
    if (!rvCurrentSectionMeta || !rvCurrentSectionMeta.moduleId) return;
    try {
      var historyData = await fetchJson(
        '/api/localization-editor/' +
          rvCurrentSectionMeta.bookSlug +
          '/' +
          rvCurrentSectionMeta.chapterNum +
          '/' +
          rvCurrentSectionMeta.moduleId +
          '/history'
      );
      if (historyData.history) {
        rvRenderLogEntries(historyData.history);
      }
    } catch (err) {
      console.warn('Could not reload history:', err.message);
    }
  }

  function rvAddManualLogEntry() {
    document.getElementById('log-type').value = 'other';
    document.getElementById('log-original').value = '';
    document.getElementById('log-changed').value = '';
    document.getElementById('log-reason').value = '';
    document.getElementById('log-location').value = '';
    document.getElementById('log-modal').style.display = 'flex';
  }

  async function rvSaveLogEntry() {
    var entry = {
      type: document.getElementById('log-type').value,
      original: document.getElementById('log-original').value.trim(),
      changedTo: document.getElementById('log-changed').value.trim(),
      reason: document.getElementById('log-reason').value.trim(),
      location: document.getElementById('log-location').value.trim() || undefined,
    };

    if (!entry.original || !entry.changedTo || !entry.reason) {
      alert(UI.alert.modificationRequired);
      return;
    }

    try {
      if (!rvCurrentSectionMeta || !rvCurrentSectionMeta.moduleId) {
        alert(UI.alert.missingModuleId);
        return;
      }
      var logUrl =
        '/api/localization-editor/' +
        rvCurrentSectionMeta.bookSlug +
        '/' +
        rvCurrentSectionMeta.chapterNum +
        '/' +
        rvCurrentSectionMeta.moduleId +
        '/log';

      var data = await fetchJson(logUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });

      if (data.success) {
        closeModal('log-modal');
        await rvReloadHistory();
      } else {
        alert(UI.common.errorPrefix + data.message);
      }
    } catch (err) {
      alert(UI.common.errorPrefix + err.message);
    }
  }

  // ----------------------------------------------------------------
  // REVIEW: Show selector / navigation
  // ----------------------------------------------------------------

  function rvShowSelector() {
    document.getElementById('rv-review-interface').style.display = 'none';
    document.getElementById('rv-section-selector').style.display = 'block';

    var url = new URL(window.location);
    url.searchParams.delete('sectionId');
    window.history.pushState({}, '', url);

    rvCurrentSectionId = null;
  }

  // ----------------------------------------------------------------
  // REVIEW: Formatting utilities
  // ----------------------------------------------------------------

  function rvFormatStatus(status) {
    return UI.reviewStatus[status] || status;
  }

  function rvFormatType(type) {
    return UI.suggestionType[type] || type;
  }

  function rvFormatSuggestionStatus(status) {
    return UI.suggestionStatus[status] || status;
  }

  function rvFormatLogType(type) {
    return UI.logType[type] || type;
  }

  function rvFormatMarkdownPreview(md) {
    return md
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  // ================================================================
  // INITIALIZATION
  // ================================================================

  async function initPage() {
    // Wait for auth before any data loading (prevents race on deep-link URLs)
    await new Promise(function (resolve) {
      if (window.currentUser) {
        onUserReady(window.currentUser);
        resolve();
      } else {
        window.addEventListener('userLoaded', function (e) {
          onUserReady(e.detail);
          resolve();
        });
      }
    });

    // Initialize review view selectors and event listeners
    await rvLoadBooks();
    rvSetupEventListeners();

    // Check URL params for review deep-link
    var params = new URLSearchParams(window.location.search);
    var sectionId = params.get('sectionId');
    if (sectionId) {
      switchView('review');
      await rvLoadSectionById(parseInt(sectionId, 10));
    }
  }

  function onUserReady(user) {
    _edUserRole = user?.role || 'viewer';
    _rvCurrentUser = user;
  }

  initPage();

  // ================================================================
  // EXPOSE TO WINDOW (for HTML onclick handlers)
  // ================================================================
  window.switchView = switchView;
  window.closeModal = closeModal;
  window.edToggleGuidelines = edToggleGuidelines;
  window.rvLoadSection = rvLoadSection;
  window.rvShowSelector = rvShowSelector;
  window.rvScanForSuggestions = rvScanForSuggestions;
  window.rvSyncToLog = rvSyncToLog;
  window.rvAcceptAllPending = rvAcceptAllPending;
  window.rvRejectAllPending = rvRejectAllPending;
  window.rvFilterSuggestions = rvFilterSuggestions;
  window.rvAddManualLogEntry = rvAddManualLogEntry;
  window.rvSaveModifiedSuggestion = rvSaveModifiedSuggestion;
  window.rvSaveLogEntry = rvSaveLogEntry;
  window.edSaveSingleSegment = edSaveSingleSegment;
  window.edCopyFaithful = edCopyFaithful;
  window.edShowHistory = edShowHistory;
  window.rvAcceptSuggestion = rvAcceptSuggestion;
  window.rvRejectSuggestion = rvRejectSuggestion;
  window.rvEditSuggestion = rvEditSuggestion;
  window.rvFormatMarkdownPreview = rvFormatMarkdownPreview;
})(); // end IIFE
