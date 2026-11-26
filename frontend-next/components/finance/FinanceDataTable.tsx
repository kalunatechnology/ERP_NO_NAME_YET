"use client";

import { useCallback, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TablePagination, TableSearchBar, useTablePagination } from "@/components/ui/TablePagination";

/** Pemilih sub-halaman seragam (satu format untuk seluruh modul Finance). */
export function FinanceSubtabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: Array<{ id: T; label: ReactNode; count?: number }>;
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("fin-subtabs", className)} role="tablist">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === value}
          data-active={item.id === value}
          onClick={() => onChange(item.id)}
        >
          {item.label}
          {typeof item.count === "number" && <span className="opacity-70">({item.count})</span>}
        </button>
      ))}
    </div>
  );
}

export interface FinanceColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T, index: number) => ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
}

/**
 * Tabel Finance standar: pencarian + filter dalam SATU baris, pagination 10/20/30, header rapi.
 * `searchText` menentukan teks yang dicari; `filters` adalah kontrol tambahan (select, dll) yang tampil sebaris dengan pencarian.
 */
export function FinanceDataTable<T>({
  rows,
  columns,
  searchText,
  rowKey,
  rowClassName,
  searchPlaceholder = "Cari data...",
  emptyText = "Belum ada data.",
  filters,
  trailing,
  minWidth = 640,
  defaultPageSize = 10,
}: {
  rows: T[];
  columns: FinanceColumn<T>[];
  searchText: (row: T) => string;
  rowKey: (row: T, index: number) => string | number;
  rowClassName?: (row: T) => string | undefined;
  searchPlaceholder?: string;
  emptyText?: string;
  filters?: ReactNode;
  trailing?: ReactNode;
  minWidth?: number;
  defaultPageSize?: number;
}) {
  const matcher = useCallback((row: T, q: string) => searchText(row).toLowerCase().includes(q), [searchText]);
  const table = useTablePagination(rows, matcher, defaultPageSize);
  const alignClass = (align?: "left" | "center" | "right") =>
    align === "center" ? "col-center" : align === "right" ? "text-right" : undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <TableSearchBar
          query={table.query}
          onQueryChange={table.setQuery}
          onSearchSubmit={table.applySearch}
          onReset={table.resetSearch}
          placeholder={searchPlaceholder}
          totalItems={rows.length}
          filteredCount={table.totalItems}
          showSubmitButton={false}
          className="flex-nowrap"
        />
        {filters}
        {trailing && <div className="ml-auto flex items-center gap-2">{trailing}</div>}
      </div>
      <div className="table-scroll-wrapper">
        <table className="w-full data-table" style={{ minWidth }}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={cn(alignClass(column.align), column.className)}>{column.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.paginatedItems.map((row, index) => (
              <tr key={rowKey(row, index)} className={rowClassName?.(row)}>
                {columns.map((column) => (
                  <td key={column.key} className={cn(alignClass(column.align), column.className)}>{column.render(row, index)}</td>
                ))}
              </tr>
            ))}
            {table.paginatedItems.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="py-8 text-center text-text-secondary">
                  {table.appliedQuery ? "Tidak ada data yang cocok dengan pencarian." : emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <TablePagination
        page={table.page}
        totalPages={table.totalPages}
        pageSize={table.pageSize}
        totalItems={table.totalItems}
        onPageChange={table.setPage}
        onPageSizeChange={table.setPageSize}
        className="mt-0"
      />
    </div>
  );
}

/** Teks nominal dengan bahasa visual: hijau untuk plus, merah untuk minus. */
export function SignedAmount({ value, text, plusSign = false }: { value: number; text: string; plusSign?: boolean }) {
  return (
    <span className={cn("tabular-nums", value < 0 ? "amount-neg" : value > 0 ? "amount-pos" : "text-text-secondary")}>
      {plusSign && value > 0 ? "+" : ""}
      {text}
    </span>
  );
}
