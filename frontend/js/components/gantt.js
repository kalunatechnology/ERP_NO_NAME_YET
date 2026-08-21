/**
 * gantt.js
 * Renders the Gantt chart using HTML Canvas.
 * Precisely matches the Figma spec:
 *   - 8 week columns (W1–W8)
 *   - 6 task rows with dual-layer progress bars
 *   - Deep Green fills, Lighter Green tracks
 */

(function () {
  'use strict';

  const COLORS = {
    deepGreen:     '#275433',
    lighterGreen:  '#F0FEE0',
    green:         '#5A861F',
    textPrimary:   '#0E341F',
    textSecondary: '#768779',
    border:        '#E8E8E8',
    colShade:      'rgba(0,0,0,0.03)',
  };

  const FONT = "'Google Sans', Roboto, sans-serif";

  /**
   * Renders the Gantt chart into the container element.
   * @param {HTMLElement} container - The .gantt-card div
   * @param {object} data - { weeks: string[], tasks: {label,start,duration,progress}[] }
   */
  function renderGantt(container, data) {
    if (!container) return;

    // Use offsetWidth to get the rendered width, fallback to 800
    const W = container.offsetWidth  || 800;
    const H = container.offsetHeight || 300;

    // Build or reuse canvas
    let canvas = container.querySelector('#gantt-canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'gantt-canvas';
      canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border-radius:16px;';
      container.appendChild(canvas);
    }

    // HiDPI support
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // Layout constants — adaptive to container width
    const SIDE_PAD     = 16;
    const LABEL_COL_W  = Math.max(100, Math.min(130, W * 0.15)); // 15% of width, 100–130px
    const TOP_PADDING  = 50;
    const ROW_H        = Math.floor((H - TOP_PADDING - 12) / data.tasks.length);
    const BAR_H        = Math.min(14, ROW_H - 10);
    const RADIUS       = BAR_H / 2;
    const WEEKS        = data.weeks.length;
    const CHART_W      = W - LABEL_COL_W - SIDE_PAD;
    const COL_W        = CHART_W / WEEKS;
    const LABEL_SIZE   = Math.max(9, Math.min(11, COL_W * 0.3));

    // Clear
    ctx.clearRect(0, 0, W, H);

    // ── Background ─────────────────────────────────────
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);

    // ── Column shading (alternating) ────────────────────
    for (let i = 0; i < WEEKS; i++) {
      if (i % 2 === 0) {
        ctx.fillStyle = COLORS.colShade;
        const x = LABEL_COL_W + i * COL_W;
        roundRect(ctx, x, TOP_PADDING - 10, COL_W, H - TOP_PADDING + 10, 6);
        ctx.fill();
      }
    }

    // ── Horizontal grid lines ────────────────────────────
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth   = 0.5;
    for (let i = 0; i <= data.tasks.length; i++) {
      const y = TOP_PADDING + i * ROW_H;
      ctx.beginPath();
      ctx.moveTo(LABEL_COL_W - 4, y);
      ctx.lineTo(W - SIDE_PAD, y);
      ctx.stroke();
    }

    // ── Vertical divider: labels | chart ─────────────────
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(LABEL_COL_W - 4, TOP_PADDING - 10);
    ctx.lineTo(LABEL_COL_W - 4, H - 12);
    ctx.stroke();

    // ── Week headers ──────────────────────────────────────
    // Only show every Nth label if columns are too narrow
    const minLabelW = 24;
    const skipEvery = COL_W < minLabelW ? Math.ceil(minLabelW / COL_W) : 1;

    ctx.font      = `400 ${LABEL_SIZE}px ${FONT}`;
    ctx.fillStyle = COLORS.textSecondary;
    ctx.textAlign = 'center';
    for (let i = 0; i < WEEKS; i++) {
      if (i % skipEvery !== 0) continue;
      const x = LABEL_COL_W + (i + 0.5) * COL_W;
      ctx.fillText(data.weeks[i], x, TOP_PADDING - 16);
    }

    // ── Task rows ──────────────────────────────────────────
    data.tasks.forEach(function (task, idx) {
      const y   = TOP_PADDING + idx * ROW_H;
      const barY = y + (ROW_H - BAR_H) / 2;

      // ── Row label (truncate if needed) ─────────────────
      ctx.font      = `500 ${LABEL_SIZE}px ${FONT}`;
      ctx.fillStyle = COLORS.textPrimary;
      ctx.textAlign = 'left';
      const maxLabelW = LABEL_COL_W - SIDE_PAD - 8;
      const label = truncateText(ctx, task.label, maxLabelW);
      ctx.fillText(label, SIDE_PAD, y + ROW_H / 2 + Math.floor(LABEL_SIZE / 2) - 1);

      // ── Bar track ──────────────────────────────────────
      const barX = LABEL_COL_W + task.start * COL_W + 2;
      const barW = Math.max(4, task.duration * COL_W - 4);

      ctx.fillStyle = COLORS.lighterGreen;
      roundRect(ctx, barX, barY, barW, BAR_H, RADIUS);
      ctx.fill();

      // ── Bar fill ───────────────────────────────────────
      if (task.progress > 0) {
        const fillW = Math.max(BAR_H, barW * (task.progress / 100));
        ctx.fillStyle = COLORS.deepGreen;
        roundRect(ctx, barX, barY, fillW, BAR_H, RADIUS);
        ctx.fill();

        // Inline progress label (inside bar if wide enough)
        const pctText = task.progress + '%';
        ctx.font      = `500 ${Math.max(8, LABEL_SIZE - 1)}px ${FONT}`;
        const pctW    = ctx.measureText(pctText).width;
        if (fillW > pctW + 10) {
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'left';
          ctx.fillText(pctText, barX + 5, barY + BAR_H - 3);
        } else if (task.progress < 30) {
          // Label outside right
          ctx.fillStyle = COLORS.green;
          ctx.textAlign = 'left';
          ctx.fillText(pctText, barX + barW + 4, barY + BAR_H - 3);
        }
      } else {
        // 0% — label to the right
        ctx.font      = `500 ${Math.max(8, LABEL_SIZE - 1)}px ${FONT}`;
        ctx.fillStyle = COLORS.textSecondary;
        ctx.textAlign = 'left';
        ctx.fillText('0%', barX + barW + 4, barY + BAR_H - 3);
      }
    });

    // ── "Schedule" label top-left ────────────────────────
    ctx.font      = `500 13px ${FONT}`;
    ctx.fillStyle = COLORS.textPrimary;
    ctx.textAlign = 'left';
    ctx.fillText('Schedule', SIDE_PAD, 26);
  }

  /**
   * Truncates text with ellipsis if it exceeds maxWidth.
   */
  function truncateText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) {
      t = t.slice(0, -1);
    }
    return t + '…';
  }

  /**
   * Utility: draw a rounded rectangle path
   */
  function roundRect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
  }

  // Export
  window.GanttChart = { render: renderGantt };

})();
