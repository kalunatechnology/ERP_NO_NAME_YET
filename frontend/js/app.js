/**
 * app.js
 * Root application entry point.
 * Bootstraps all components on DOMContentLoaded.
 */

(function () {
  'use strict';

  /* ── KPI: update values from data ─────────── */
  function initKPI(kpi) {
    setKpiValue('kpi-success-rate-value', kpi.successRate.value);
    setKpiValue('kpi-finished-value',     kpi.finished.value);
    setKpiValue('kpi-ongoing-value',      kpi.ongoing.value);
    setKpiValue('kpi-discontinued-value', kpi.discontinued.value);

    // Delta colours
    setDeltaColor('kpi-success-rate',   kpi.successRate.deltaColor);
    setDeltaColor('kpi-finished',       kpi.finished.deltaColor);
    setDeltaColor('kpi-ongoing',        kpi.ongoing.deltaColor);
    setDeltaColor('kpi-discontinued',   kpi.discontinued.deltaColor);
  }

  function setKpiValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function setDeltaColor(cardId, color) {
    const card  = document.getElementById(cardId);
    if (!card) return;
    const delta = card.querySelector('.kpi-card__delta');
    if (delta) delta.style.color = color;
  }

  /* ── Gantt: render chart ───────────────────── */
  function initGantt(ganttData) {
    const container = document.getElementById('gantt-chart-container');
    if (container && window.GanttChart) {
      // Use a small delay to ensure layout is complete
      requestAnimationFrame(function () {
        GanttChart.render(container, ganttData);
      });
    }

    // Re-render on resize
    window.addEventListener('resize', debounce(function () {
      if (container && window.GanttChart) {
        GanttChart.render(container, ganttData);
      }
    }, 200));
  }

  /* ── Reports: render panel ─────────────────── */
  function initReports(reports) {
    if (window.ReportsPanel) {
      ReportsPanel.render(reports);
    }
  }

  /* ── Right Panel: render ───────────────────── */
  function initRightPanel(data) {
    if (window.RightPanel) {
      RightPanel.render({
        notifications: data.notifications,
        activities:    data.activities,
        contacts:      data.contacts,
      });
    }
  }

  /* ── Sidebar: active state ─────────────────── */
  function initSidebar() {
    const navItems = document.querySelectorAll('.sidebar__nav-item[href]');
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';

    navItems.forEach(function (item) {
      const href = item.getAttribute('href').split('/').pop();
      if (href === currentPath) {
        item.classList.add('is-active');
        item.setAttribute('aria-current', 'page');
        const label = item.querySelector('.sidebar__nav-item-label');
        if (label) label.style.color = 'var(--color-brand-deep-green)';
      }
    });
  }

  /* ── Logout handler ────────────────────────── */
  function initLogout() {
    const btn = document.getElementById('btn-logout');
    if (btn) {
      btn.addEventListener('click', function () {
        // TODO: connect to backend auth endpoint
        console.info('[Marka+] Logout triggered');
        alert('Fitur logout akan terhubung ke backend auth.');
      });
    }
  }

  /* ── Utility: debounce ─────────────────────── */
  function debounce(fn, delay) {
    let timer;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, delay);
    };
  }

  /* ── Bootstrap ─────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    const data = window.MOCK_DATA;
    if (!data) {
      console.error('[Marka+] MOCK_DATA not found. Check mock-data.js is loaded.');
      return;
    }

    initKPI(data.kpi);
    initGantt(data.gantt);
    initReports(data.reports);
    initRightPanel(data);
    initSidebar();
    initLogout();

    console.info('[Marka+] Dashboard initialized successfully.');
  });

})();
