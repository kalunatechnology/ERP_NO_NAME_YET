"use client";

import React from "react";
import * as XLSX from "xlsx";
import { formatMoney } from "@/lib/utils";

/**
 * Parser aritmatika ringan (+, -, *, /, tanda kurung) tanpa eval/Function
 * agar aman untuk input rumus ala Excel seperti "=1500000*12" atau "=50000000/4".
 */
export function evaluateFormulaInput(raw: string): number | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith("=")) {
    const normalized = trimmed.replace(/\s+/g, "");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }

  const expr = trimmed.slice(1).replace(/\s+/g, "");
  if (!expr || !/^[0-9+\-*/().]+$/.test(expr)) return null;

  let pos = 0;
  const parseExpr = (): number => {
    let left = parseTerm();
    while (pos < expr.length && (expr[pos] === "+" || expr[pos] === "-")) {
      const op = expr[pos++];
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  };

  const parseTerm = (): number => {
    let left = parseFactor();
    while (pos < expr.length && (expr[pos] === "*" || expr[pos] === "/")) {
      const op = expr[pos++];
      const right = parseFactor();
      if (op === "/") {
        if (right === 0) throw new Error("Division by zero");
        left = left / right;
      } else {
        left = left * right;
      }
    }
    return left;
  };

  const parseFactor = (): number => {
    if (expr[pos] === "+") {
      pos++;
      return parseFactor();
    }
    if (expr[pos] === "-") {
      pos++;
      return -parseFactor();
    }
    if (expr[pos] === "(") {
      pos++;
      const val = parseExpr();
      if (expr[pos] !== ")") throw new Error("Unclosed parenthesis");
      pos++;
      return val;
    }
    const start = pos;
    while (pos < expr.length && /[0-9.]/.test(expr[pos])) pos++;
    if (start === pos) throw new Error("Invalid token");
    const num = Number(expr.slice(start, pos));
    if (!Number.isFinite(num)) throw new Error("Invalid number");
    return num;
  };

  try {
    const result = parseExpr();
    if (pos !== expr.length || !Number.isFinite(result)) return null;
    return Math.round(result * 100) / 100;
  } catch {
    return null;
  }
}

/**
 * Mengurai teks clipboard TSV dari Excel / Google Sheets menjadi matrix 2D.
 */
export function parseClipboardMatrix(text: string): string[][] {
  if (!text) return [];
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines.map((line) => line.split("\t").map((cell) => cell.trim()));
}

/**
 * Navigasi sel keyboard ala Excel (Enter, ArrowUp/Down/Left/Right, Escape).
 */
export function moveGridCell(
  event: React.KeyboardEvent<HTMLElement>,
  row: number,
  col: number,
  prefix = "excel"
) {
  const isSelect = event.currentTarget.tagName === "SELECT";
  let targetRow = row;
  let targetCol = col;
  let shouldMove = false;

  if (event.key === "Enter" && !event.shiftKey) {
    targetRow = row + 1;
    shouldMove = true;
  } else if (event.key === "ArrowDown" && !isSelect) {
    targetRow = row + 1;
    shouldMove = true;
  } else if (event.key === "ArrowUp" && !isSelect) {
    targetRow = Math.max(0, row - 1);
    shouldMove = targetRow !== row;
  } else if (event.key === "ArrowRight" && !isSelect) {
    const input = event.currentTarget as HTMLInputElement;
    const atEnd =
      typeof input.selectionStart !== "number" ||
      input.selectionStart === input.value.length;
    if (atEnd || event.ctrlKey || event.metaKey) {
      targetCol = col + 1;
      shouldMove = true;
    }
  } else if (event.key === "ArrowLeft" && !isSelect) {
    const input = event.currentTarget as HTMLInputElement;
    const atStart =
      typeof input.selectionStart !== "number" || input.selectionStart === 0;
    if ((atStart || event.ctrlKey || event.metaKey) && col > 0) {
      targetCol = col - 1;
      shouldMove = true;
    }
  } else if (event.key === "Escape") {
    event.currentTarget.blur();
    return;
  }

  if (!shouldMove) return;
  const nextCell = document.querySelector<HTMLElement>(
    `[data-${prefix}-row="${targetRow}"][data-${prefix}-col="${targetCol}"]`
  );
  if (nextCell) {
    event.preventDefault();
    nextCell.focus();
  }
}

export function exportSheetsToXlsx(
  filename: string,
  sheets: { name: string; rows: Record<string, any>[] }[]
) {
  const workbook = XLSX.utils.book_new();
  sheets.forEach(({ name, rows }) => {
    const safeRows = rows.length > 0 ? rows : [{ Info: "Tidak ada data" }];
    const sheet = XLSX.utils.json_to_sheet(safeRows);
    XLSX.utils.book_append_sheet(workbook, sheet, name.slice(0, 31));
  });
  XLSX.writeFile(workbook, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

export async function importFirstSheetFromXlsx(
  file: File
): Promise<Record<string, any>[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets[firstSheet], {
    defval: "",
  });
}

export function ExcelStatusBar({
  values,
  label = "Ringkasan Baris Tampil",
  extra,
}: {
  values: number[];
  label?: string;
  extra?: React.ReactNode;
}) {
  const count = values.length;
  const sum = values.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);
  const avg = count > 0 ? sum / count : 0;
  const min = count > 0 ? Math.min(...values) : 0;
  const max = count > 0 ? Math.max(...values) : 0;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E2E8F0] bg-slate-50 px-4 py-2.5 text-[11px] text-[#475569]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-extrabold uppercase tracking-wide text-[#163D64]">{label}</span>
        <span>
          Count: <b className="text-[#0F172A]">{count}</b>
        </span>
        <span>
          Sum: <b className="text-[#0F172A]">{formatMoney(sum)}</b>
        </span>
        <span>
          Avg: <b className="text-[#0F172A]">{formatMoney(avg)}</b>
        </span>
        <span>
          Min: <b className="text-[#0F172A]">{formatMoney(min)}</b>
        </span>
        <span>
          Max: <b className="text-[#0F172A]">{formatMoney(max)}</b>
        </span>
      </div>
      {extra ? <div className="flex items-center gap-2">{extra}</div> : null}
    </div>
  );
}