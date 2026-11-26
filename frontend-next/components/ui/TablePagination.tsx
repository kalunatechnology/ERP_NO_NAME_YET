"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function useTablePagination<T>(
  items: T[],
  searchMatcher: (item: T, normalizedQuery: string) => boolean,
  defaultPageSize = 10
) {
  const [inputQuery, setInputQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const filteredItems = useMemo(() => {
    const q = appliedQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => searchMatcher(item, q));
  }, [items, appliedQuery, searchMatcher]);

  const totalItems = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, page, pageSize]);

  const handleSearchChange = (value: string) => {
    setInputQuery(value);
    setAppliedQuery(value);
    setPage(1);
  };

  const applySearch = () => {
    setAppliedQuery(inputQuery);
    setPage(1);
  };

  const resetSearch = () => {
    setInputQuery("");
    setAppliedQuery("");
    setPage(1);
  };

  const handlePageSizeChange = (nextSize: number) => {
    setPageSize(nextSize);
    setPage(1);
  };

  return {
    query: inputQuery,
    appliedQuery,
    setQuery: handleSearchChange,
    applySearch,
    resetSearch,
    page,
    setPage,
    pageSize,
    setPageSize: handlePageSizeChange,
    totalItems,
    totalPages,
    filteredItems,
    paginatedItems,
  };
}

interface TableSearchBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  onSearchSubmit: () => void;
  onReset: () => void;
  placeholder?: string;
  totalItems: number;
  filteredCount: number;
  className?: string;
  /** Tampilkan tombol "Cari" terpisah. Default true; Finance mematikannya (cukup tekan Enter / ketik langsung). */
  showSubmitButton?: boolean;
}

export function TableSearchBar({
  query,
  onQueryChange,
  onSearchSubmit,
  onReset,
  placeholder = "Cari data...",
  totalItems,
  filteredCount,
  className,
  showSubmitButton = true,
}: TableSearchBarProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSearchSubmit();
      }}
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      <div className="relative min-w-[200px] flex-1 sm:w-64 sm:flex-initial">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder}
          className="input w-full pl-8 pr-7 text-xs"
        />
        {query && (
          <button
            type="button"
            onClick={onReset}
            title="Hapus pencarian"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={12} />
          </button>
        )}
      </div>
      {showSubmitButton && (
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCE3EB] bg-slate-50 px-3 py-1.5 text-xs font-semibold text-[#163D64] transition-colors hover:bg-blue-50 hover:text-[#0876CD]"
      >
        <Search size={13} />
        Cari
      </button>
      )}
      {query && (
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
        >
          Reset
        </button>
      )}
      {query && (
        <span className="text-[11px] text-slate-500">
          {filteredCount} dari {totalItems} data
        </span>
      )}
    </form>
  );
}

interface TablePaginationProps {
  page: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

export function TablePagination({
  page,
  totalPages,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 30],
  className,
}: TablePaginationProps) {
  if (totalItems === 0) return null;

  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalItems);

  const pageNumbers: Array<number | "ellipsis-left" | "ellipsis-right"> = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);
  } else {
    pageNumbers.push(1);
    if (page > 3) pageNumbers.push("ellipsis-left");
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    for (let i = start; i <= end; i++) pageNumbers.push(i);
    if (page < totalPages - 2) pageNumbers.push("ellipsis-right");
    pageNumbers.push(totalPages);
  }

  return (
    <div
      className={cn(
        "mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-600",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span>
          Menampilkan <strong className="text-slate-800">{startItem}–{endItem}</strong> dari{" "}
          <strong className="text-slate-800">{totalItems}</strong> data
        </span>
        <label className="inline-flex items-center gap-1.5">
          <span>Baris:</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 outline-none focus:border-[#0876CD]"
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(1)}
          title="Halaman pertama"
          className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronsLeft size={13} />
        </button>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          title="Sebelumnya"
          className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft size={13} />
        </button>

        {pageNumbers.map((item, idx) =>
          typeof item === "string" ? (
            <span key={`${item}-${idx}`} className="px-1.5 text-slate-400">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              className={cn(
                "min-w-[28px] rounded-md border px-2 py-1 text-xs font-semibold transition-colors",
                item === page
                  ? "border-[#163D64] bg-[#163D64] text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-blue-50 hover:text-[#0876CD]"
              )}
            >
              {item}
            </button>
          )
        )}

        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          title="Berikutnya"
          className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight size={13} />
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(totalPages)}
          title="Halaman terakhir"
          className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronsRight size={13} />
        </button>
      </div>
    </div>
  );
}
