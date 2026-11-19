"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchableSelectOption {
  value: string;
  label: string;
  sublabel?: string;
  keywords?: string;
  disabled?: boolean;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyOptionLabel?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "-- Pilih --",
  searchPlaceholder = "Ketik untuk mencari...",
  emptyOptionLabel,
  emptyMessage = "Tidak ada pilihan yang cocok.",
  disabled = false,
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [mounted, setMounted] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [coords, setCoords] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    placement: "bottom" | "top";
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => {
      const haystack = `${opt.label} ${opt.sublabel || ""} ${opt.keywords || ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [options, query]);

  const updateCoords = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const dropdownHeight = 270;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    const placement: "bottom" | "top" = spaceBelow < dropdownHeight && spaceAbove > spaceBelow ? "top" : "bottom";
    const width = Math.max(rect.width, 220);

    let left = rect.left;
    if (typeof window !== "undefined" && left + width > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - width - 12);
    }

    if (placement === "bottom") {
      setCoords({
        top: rect.bottom + 4,
        left,
        width,
        placement: "bottom",
      });
    } else {
      setCoords({
        bottom: window.innerHeight - rect.top + 4,
        left,
        width,
        placement: "top",
      });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    updateCoords();

    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        (triggerRef.current && triggerRef.current.contains(target)) ||
        (menuRef.current && menuRef.current.contains(target))
      ) {
        return;
      }
      setOpen(false);
    };

    const handleScrollOrResize = () => {
      updateCoords();
    };

    document.addEventListener("mousedown", handleOutside);
    window.addEventListener("resize", handleScrollOrResize);
    window.addEventListener("scroll", handleScrollOrResize, true);

    return () => {
      document.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("resize", handleScrollOrResize);
      window.removeEventListener("scroll", handleScrollOrResize, true);
    };
  }, [open, updateCoords]);

  useEffect(() => {
    if (open) {
      setActiveIndex(0);
      const timer = setTimeout(() => searchInputRef.current?.focus(), 15);
      return () => clearTimeout(timer);
    } else {
      setQuery("");
    }
  }, [open]);

  const handleSelect = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, Math.max(0, filteredOptions.length - 1)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const target = filteredOptions[activeIndex];
      if (target && !target.disabled) {
        handleSelect(target.value);
      }
    }
  };

  const menuDropdown =
    open && mounted && coords && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: coords.top !== undefined ? `${coords.top}px` : undefined,
              bottom: coords.bottom !== undefined ? `${coords.bottom}px` : undefined,
              left: `${coords.left}px`,
              width: `${coords.width}px`,
              zIndex: 99999,
            }}
            className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xl animate-in fade-in-0 zoom-in-95 duration-100"
          >
            <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50/80 px-2.5 py-2">
              <Search size={13} className="shrink-0 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder={searchPlaceholder}
                className="w-full bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <div className="max-h-60 overflow-y-auto py-1">
              {emptyOptionLabel !== undefined && !query.trim() && (
                <button
                  type="button"
                  onClick={() => handleSelect("")}
                  className={cn(
                    "flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors hover:bg-blue-50",
                    value === "" && "bg-blue-50/70 font-semibold text-[#0876CD]"
                  )}
                >
                  <span className="text-slate-500">{emptyOptionLabel}</span>
                  {value === "" && <Check size={13} className="text-[#0876CD]" />}
                </button>
              )}

              {filteredOptions.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-slate-400">
                  {emptyMessage}
                </div>
              ) : (
                filteredOptions.map((opt, idx) => {
                  const isSelected = opt.value === value;
                  const isActive = idx === activeIndex;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={opt.disabled}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => !opt.disabled && handleSelect(opt.value)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors",
                        opt.disabled
                          ? "cursor-not-allowed opacity-50"
                          : isActive
                          ? "bg-blue-50 text-[#0876CD]"
                          : "hover:bg-blue-50/70",
                        isSelected && "bg-blue-50/80 font-semibold text-[#163D64]"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{opt.label}</div>
                        {opt.sublabel && (
                          <div className="truncate text-[11px] text-slate-400">{opt.sublabel}</div>
                        )}
                      </div>
                      {isSelected && <Check size={13} className="shrink-0 text-[#0876CD]" />}
                    </button>
                  );
                })
              )}
            </div>

            <div className="border-t border-slate-100 bg-slate-50 px-3 py-1.5 text-[10px] text-slate-500">
              Menampilkan {filteredOptions.length} dari {options.length} pilihan
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        className={cn(
          "input flex w-full items-center justify-between gap-2 text-left",
          disabled && "cursor-not-allowed bg-slate-100 opacity-60",
          open && "border-[#0876CD] ring-2 ring-blue-100"
        )}
      >
        <span className={cn("truncate text-xs", !selectedOption && "text-slate-400")}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-slate-400">
          {value && emptyOptionLabel !== undefined && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              title="Hapus pilihan"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="rounded p-0.5 hover:bg-slate-100 hover:text-slate-600"
            >
              <X size={12} />
            </span>
          )}
          <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
        </span>
      </button>

      {menuDropdown}
    </div>
  );
}
