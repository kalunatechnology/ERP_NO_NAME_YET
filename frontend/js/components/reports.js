/**
 * reports.js
 * Renders the Incoming Reports panel:
 *   - Left list with sender, subject, preview
 *   - Right detail pane with full message and action buttons
 */

(function () {
  'use strict';

  let _activeId = null;

  /**
   * Renders the full reports panel.
   * @param {object[]} reports - Array of report objects from MOCK_DATA.reports
   */
  function renderReports(reports) {
    const listContainer = document.getElementById('reports-items-container');
    if (!listContainer) return;

    listContainer.innerHTML = '';
    reports.forEach(function (report, idx) {
      const item = buildListItem(report);
      listContainer.appendChild(item);
    });

    // Show first item by default
    if (reports.length > 0) {
      showDetail(reports[0]);
      _activeId = reports[0].id;
      const firstItem = listContainer.firstElementChild;
      if (firstItem) firstItem.classList.add('is-active');
    }
  }

  /**
   * Builds a list item element for the reports sidebar.
   */
  function buildListItem(report) {
    const item = document.createElement('div');
    item.className = 'reports-list__item';
    item.id        = 'report-item-' + report.id;
    item.setAttribute('role', 'listitem');
    item.setAttribute('tabindex', '0');
    item.setAttribute('aria-label', 'Laporan dari ' + report.sender);

    item.innerHTML = `
      <div class="reports-list__item-content">
        <div class="reports-list__item-row">
          <div class="reports-list__item-sender-wrap">
            <span class="reports-list__item-dot" style="background:${report.dotColor};"></span>
            <span class="reports-list__item-sender">${escapeHtml(report.sender)}</span>
          </div>
          <span class="reports-list__item-time">${escapeHtml(report.timestamp.split(',')[0])}</span>
        </div>
        <p class="reports-list__item-subject">${escapeHtml(report.subject)}</p>
        <p class="reports-list__item-preview">${escapeHtml(report.preview)}</p>
      </div>
    `;

    item.addEventListener('click', function () {
      // Remove active from all
      document.querySelectorAll('.reports-list__item').forEach(function (el) {
        el.classList.remove('is-active');
      });
      item.classList.add('is-active');
      _activeId = report.id;
      showDetail(report);
    });

    item.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        item.click();
      }
    });

    return item;
  }

  /**
   * Updates the right detail pane with the selected report's content.
   */
  function showDetail(report) {
    const senderName  = document.getElementById('reports-detail-sender-name');
    const senderTitle = document.getElementById('reports-detail-sender-title');
    const timestamp   = document.getElementById('reports-detail-timestamp');
    const subject     = document.getElementById('reports-detail-subject');
    const message     = document.getElementById('reports-detail-message');

    if (senderName)  senderName.textContent  = report.sender;
    if (senderTitle) senderTitle.textContent  = report.title;
    if (timestamp)   timestamp.textContent    = report.timestamp;
    if (subject)     subject.textContent      = report.subject;
    if (message)     message.textContent      = report.message;
  }

  /**
   * Minimal HTML escaping.
   */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Export
  window.ReportsPanel = { render: renderReports };

})();
