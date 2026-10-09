/**
 * File: frontend-next/components/ui/Modal.tsx
 *
 * Purpose: Defines React UI component responsibilities for the frontend application.
 * Responsibility: Owns the executable contracts declared here and their framework/import integration boundary.
 * Dependencies and side effects: Function comments identify HTTP, persistence, browser-state, and security effects where present.
 */
"use client";

import { useEffect, useId, useRef, ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl" | "full";
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl" | "full";
  placement?: "dialog" | "drawer";
}

/**
 * Modal owns the local UI behavior described by its typed signature.
 *
 * @param input - Uses the declared props, event, or value arguments.
 * @returns The rendered React value, computed presentation value, or Promise declared by the implementation.
 * Integration/side effects: updates only the visible React/browser state or invokes the callbacks below.
 */
export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxWidth,
  size = "lg",
  placement = "dialog",
}: ModalProps) {
  const effectiveMaxWidth = maxWidth || size || "lg";
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const titleId = useId();
  closeRef.current = onClose;
  useEffect(() => {
/**
 * handleKeyDown owns the local UI behavior described by its typed signature.
 *
 * @param input - Uses the declared props, event, or value arguments.
 * @returns The rendered React value, computed presentation value, or Promise declared by the implementation.
 * Integration/side effects: updates only the visible React/browser state or invokes the callbacks below.
 */
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); closeRef.current(); }
      if (e.key === "Tab") {
        const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') || []).filter(item => item.getClientRects().length > 0);
        const first = items[0]; const last = items[items.length - 1];
        if (!first) { e.preventDefault(); dialogRef.current?.focus(); }
        else if (!dialogRef.current?.contains(document.activeElement) || document.activeElement === dialogRef.current) {
          e.preventDefault(); (e.shiftKey ? last : first).focus();
        }
        else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    if (!isOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!dialogRef.current?.contains(document.activeElement)) dialogRef.current?.focus();
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const maxWidthClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
    "3xl": "max-w-3xl",
    "4xl": "max-w-4xl",
    "5xl": "max-w-5xl",
    full: "max-w-full",
  }[effectiveMaxWidth] || "max-w-lg";

  return (
    <div className={cn("fixed inset-0 z-50 flex", placement === "drawer" ? "items-stretch justify-end" : "items-center justify-center p-2 sm:p-4")}>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Card */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={cn(
          "relative w-full bg-white rounded-2xl shadow-2xl border border-text-tertiary overflow-hidden z-10 flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
          maxWidthClasses,
          placement === "drawer" && "max-h-none rounded-none sm:rounded-l-2xl"
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-4 py-4 sm:px-6 sm:py-5 border-b border-text-tertiary bg-gray-50/50">
          <div className="space-y-1 pr-2">
            <h3 id={titleId} className="text-base font-semibold text-text-primary leading-tight">{title}</h3>
            {subtitle && <p className="text-xs text-text-secondary leading-relaxed">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-gray-100 transition-colors shrink-0"
            aria-label="Tutup"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 py-4 sm:px-6 sm:py-5 overflow-y-auto overscroll-contain flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}
