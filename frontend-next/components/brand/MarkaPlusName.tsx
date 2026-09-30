import type { HTMLAttributes } from "react";

interface MarkaPlusNameProps extends HTMLAttributes<HTMLSpanElement> {
  compact?: boolean;
}

/** User-facing product name. Internal MARBOT identifiers stay stable for API compatibility. */
export function MarkaPlusName({ className = "", compact = false, ...props }: MarkaPlusNameProps) {
  return (
    <span
      aria-label="Marka Plus"
      className={`inline-flex items-baseline font-inherit ${className}`}
      {...props}
    >
      <span>Marka</span>
      <span
        aria-hidden="true"
        className={`ml-[0.22em] inline-block bg-gradient-to-r from-[#294BB2] to-[#1688E8] bg-clip-text font-black italic tracking-[-0.04em] text-transparent ${
          compact
            ? "text-[0.82em]"
            : "text-[0.9em]"
        }`}
      >
        Plus
      </span>
    </span>
  );
}

export default MarkaPlusName;
