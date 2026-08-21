/**
 * right-panel.js
 * Renders Notifications, Activities, and Contacts sections
 * in the right sidebar panel.
 */

(function () {
  'use strict';

  /**
   * Renders all right panel sections.
   * @param {object} data - { notifications, activities, contacts }
   */
  function renderRightPanel(data) {
    renderNotifications(data.notifications);
    renderActivities(data.activities);
    renderContacts(data.contacts);
  }

  /* ── Notifications ─────────────────────────── */
  function renderNotifications(items) {
    const container = document.getElementById('notifications-list');
    if (!container) return;
    container.innerHTML = '';

    items.forEach(function (item) {
      const el = buildActivityItem(item, '#F59E0B');
      container.appendChild(el);
    });
  }

  /* ── Activities ────────────────────────────── */
  function renderActivities(items) {
    const container = document.getElementById('activities-list');
    if (!container) return;
    container.innerHTML = '';

    items.forEach(function (item) {
      const el = buildActivityItem(item, '#5A861F');
      container.appendChild(el);
    });
  }

  /* ── Contacts ──────────────────────────────── */
  function renderContacts(contacts) {
    const container = document.getElementById('contacts-list');
    if (!container) return;
    container.innerHTML = '';

    contacts.forEach(function (contact) {
      const el = buildContactItem(contact);
      container.appendChild(el);
    });
  }

  /* ── Builders ───────────────────────────────── */

  function buildActivityItem(item, dotColor) {
    const el = document.createElement('div');
    el.className = 'activity-item';
    el.id        = 'activity-' + item.id;

    el.innerHTML = `
      <div class="activity-item__avatar" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="8" r="3" fill="${dotColor}" opacity="0.6"/>
          <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" stroke="${dotColor}" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>
        </svg>
      </div>
      <div class="activity-item__info">
        <span class="activity-item__label">${escapeHtml(item.label)}</span>
        <span class="activity-item__time">${escapeHtml(item.time)}</span>
      </div>
    `;

    return el;
  }

  function buildContactItem(contact) {
    const el = document.createElement('div');
    el.className = 'contact-item';
    el.id        = 'contact-' + contact.id;

    // Avatar with initials
    el.innerHTML = `
      <div class="contact-item__avatar" aria-hidden="true">
        <div style="
          width:32px; height:32px; border-radius:50%;
          background:${contact.color};
          display:flex; align-items:center; justify-content:center;
          font-size:12px; font-weight:500; color:#275433;
          font-family:'Google Sans', Roboto, sans-serif;
        ">${escapeHtml(contact.initials)}</div>
      </div>
      <span class="contact-item__name">${escapeHtml(contact.name)}</span>
    `;

    return el;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Export
  window.RightPanel = { render: renderRightPanel };

})();
