"use client";

import type { ReactNode } from "react";
import { ChevronDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapsibleGuidelineProps {
  title: string;
  children: ReactNode;
  className?: string;
  tone?: "amber" | "blue";
}

export function CollapsibleGuideline({ title, children, className, tone = "blue" }: CollapsibleGuidelineProps) {
  const toneClasses = tone === "blue"
    ? {
        container: "border-blue-200 bg-blue-50",
        summary: "text-blue-950",
        icon: "text-blue-700",
        content: "border-blue-200 text-blue-900",
        focus: "focus-visible:ring-blue-500",
      }
    : {
        container: "border-amber-200 bg-amber-50",
        summary: "text-amber-950",
        icon: "text-amber-700",
        content: "border-amber-200 text-amber-900",
        focus: "focus-visible:ring-amber-500",
      };

  return (
    <details className={cn("group rounded-xl border", toneClasses.container, className)}>
      <summary className={cn("flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-3 py-3 text-sm font-semibold outline-none focus-visible:ring-2 [&::-webkit-details-marker]:hidden", toneClasses.summary, toneClasses.focus)}>
        <span className="flex min-w-0 items-center gap-2">
          <Info size={15} className={cn("shrink-0", toneClasses.icon)} aria-hidden="true" />
          <span>{title}</span>
        </span>
        <ChevronDown size={15} className={cn("shrink-0 transition-transform group-open:rotate-180", toneClasses.icon)} aria-hidden="true" />
      </summary>
      <div className={cn("border-t px-3 py-3 text-sm leading-6", toneClasses.content)}>
        {children}
      </div>
    </details>
  );
}
