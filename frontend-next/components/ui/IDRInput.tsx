"use client";

import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

function formatIDRInput(value: string | number) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function IDRInput({
  value,
  onChange,
  className,
  placeholder = "0",
  disabled,
  showPrefix = true,
  ...inputProps
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "inputMode" | "autoComplete"> & {
  value: string | number;
  onChange: (digits: string) => void;
  showPrefix?: boolean;
}) {
  return (
    <div className="relative">
      {showPrefix && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs font-medium text-text-secondary">Rp</span>}
      <input
        {...inputProps}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        value={formatIDRInput(value)}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, ""))}
        placeholder={placeholder}
        className={cn("input w-full tabular-nums", showPrefix && "pl-9", className)}
      />
    </div>
  );
}
