/**
 * File: frontend-next/components/ui/GanttChart.tsx
 *
 * Purpose: Implements React UI component responsibilities in the frontend application.
 * Responsibility: Owns the contracts declared here and connects them to framework discovery or explicit imports without changing unrelated domain state.
 * Integration: Consumers reach this file through static imports, framework conventions, or an explicit script entry point.
 * Dependencies and side effects: Function-level documentation identifies HTTP, database, browser-state, and security effects where they occur.
 */
"use client";

import { useEffect, useRef } from "react";

interface GanttTask {
  label: string;
  start: number;
  duration: number;
  progress: number;
  status?: string;
}

interface GanttChartProps {
  tasks: GanttTask[];
  weeks: string[];
}

const COLORS = {
  deepGreen:    "#275433",
  lighterGreen: "#F0FEE0",
  green:        "#5A861F",
  textPrimary:  "#0E341F",
  textSecondary:"#768779",
  border:       "#E8E8E8",
  colShade:     "rgba(0,0,0,0.02)",
};
const FONT = "'Google Sans', Roboto, sans-serif";

/**
 * GanttChart coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
export function GanttChart({ tasks, weeks }: GanttChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);

/**
 * draw coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  function draw() {
    const container = containerRef.current;
    const canvas    = canvasRef.current;
    if (!container || !canvas) return;

    const W   = container.offsetWidth  || 800;
    const H   = container.offsetHeight || 300;
    const dpr = window.devicePixelRatio || 1;

    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = `${W}px`;
    canvas.style.height = `${H}px`;

    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    const SIDE_PAD    = 16;
    const LABEL_COL_W = Math.max(90, Math.min(130, W * 0.16));
    const TOP_PAD     = 50;
    const ROW_H       = Math.floor((H - TOP_PAD - 10) / Math.max(tasks.length, 1));
    const BAR_H       = Math.min(14, ROW_H - 10);
    const RADIUS      = BAR_H / 2;
    const WEEKS       = weeks.length;
    const CHART_W     = W - LABEL_COL_W - SIDE_PAD;
    const COL_W       = CHART_W / WEEKS;
    const FONT_SIZE   = Math.max(9, Math.min(11, COL_W * 0.28));

    /* ── Background ── */
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, W, H);

    /* ── Alternating column shading ── */
    for (let i = 0; i < WEEKS; i++) {
      if (i % 2 === 0) {
        ctx.fillStyle = COLORS.colShade;
        const x = LABEL_COL_W + i * COL_W;
        ctx.fillRect(x, TOP_PAD - 10, COL_W, H - TOP_PAD + 10);
      }
    }

    /* ── Grid lines ── */
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth   = 0.5;
    for (let i = 0; i <= tasks.length; i++) {
      const y = TOP_PAD + i * ROW_H;
      ctx.beginPath();
      ctx.moveTo(LABEL_COL_W - 2, y);
      ctx.lineTo(W - SIDE_PAD, y);
      ctx.stroke();
    }

    /* ── Vertical divider ── */
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(LABEL_COL_W - 2, TOP_PAD - 10);
    ctx.lineTo(LABEL_COL_W - 2, H - 10);
    ctx.stroke();

    /* ── Week labels ── */
    ctx.font      = `400 ${FONT_SIZE}px ${FONT}`;
    ctx.fillStyle = COLORS.textSecondary;
    ctx.textAlign = "center";
    for (let i = 0; i < WEEKS; i++) {
      ctx.fillText(weeks[i], LABEL_COL_W + (i + 0.5) * COL_W, TOP_PAD - 16);
    }

    /* ── Tasks ── */
    tasks.forEach((task, idx) => {
      const y    = TOP_PAD + idx * ROW_H;
      const barY = y + (ROW_H - BAR_H) / 2;
      const barX = LABEL_COL_W + task.start * COL_W + 2;
      const barW = Math.max(4, task.duration * COL_W - 4);

      /* Label */
      ctx.font      = `500 ${FONT_SIZE}px ${FONT}`;
      ctx.fillStyle = COLORS.textPrimary;
      ctx.textAlign = "left";
      const maxLW   = LABEL_COL_W - SIDE_PAD - 6;
      let lbl       = task.label;
      while (lbl.length > 1 && ctx.measureText(lbl + "…").width > maxLW) lbl = lbl.slice(0, -1);
      if (lbl !== task.label) lbl += "…";
      ctx.fillText(lbl, SIDE_PAD, y + ROW_H / 2 + Math.floor(FONT_SIZE / 2) - 1);

      /* Track */
      ctx.fillStyle = COLORS.lighterGreen;
      roundRect(ctx, barX, barY, barW, BAR_H, RADIUS);
      ctx.fill();

      /* Fill */
      if (task.progress > 0) {
        const fillW = Math.max(BAR_H, barW * (task.progress / 100));
        ctx.fillStyle = COLORS.deepGreen;
        roundRect(ctx, barX, barY, fillW, BAR_H, RADIUS);
        ctx.fill();

        const pct  = `${task.progress}%`;
        ctx.font   = `500 ${Math.max(8, FONT_SIZE - 1)}px ${FONT}`;
        const pctW = ctx.measureText(pct).width;
        if (fillW > pctW + 10) {
          ctx.fillStyle = "#FFFFFF";
          ctx.textAlign = "left";
          ctx.fillText(pct, barX + 5, barY + BAR_H - 2);
        } else {
          ctx.fillStyle = COLORS.green;
          ctx.textAlign = "left";
          ctx.fillText(pct, barX + barW + 4, barY + BAR_H - 2);
        }
      } else {
        ctx.font      = `500 ${Math.max(8, FONT_SIZE - 1)}px ${FONT}`;
        ctx.fillStyle = COLORS.textSecondary;
        ctx.textAlign = "left";
        ctx.fillText("0%", barX + barW + 4, barY + BAR_H - 2);
      }
    });

    /* ── Header label ── */
    ctx.font      = `500 13px ${FONT}`;
    ctx.fillStyle = COLORS.textPrimary;
    ctx.textAlign = "left";
    ctx.fillText("Schedule", SIDE_PAD, 26);
  }

  useEffect(() => {
    draw();
    const ro = new ResizeObserver(() => draw());
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [tasks, weeks]);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <canvas ref={canvasRef} className="absolute inset-0" style={{ borderRadius: "inherit" }} />
    </div>
  );
}

/**
 * roundRect coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
