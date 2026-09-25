import type { SVGProps } from "react";

interface MarkaWordmarkProps extends SVGProps<SVGSVGElement> {
  title?: string;
}

/**
 * Native vector recreation of the Marka wordmark.
 *
 * The artwork intentionally uses `currentColor`, so the same SVG can be
 * rendered in the brand blue, white, or black without separate image files.
 */
export function MarkaWordmark({
  title = "Marka",
  ...props
}: MarkaWordmarkProps) {
  return (
    <svg
      viewBox="0 0 670 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      {...props}
    >
      <title>{title}</title>

      {/* Custom M / flag symbol. */}
      <path
        fill="currentColor"
        d="M10 24h36l29 36 29-36h36v110h-36V76L75 99 46 76v43h66l-66 42v-27H10V24Z"
      />

      {/* a */}
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M210 19c-38.7 0-68 27.6-68 63.5S171.3 146 210 146c17.1 0 31.9-6.7 42.5-18.1V141H287V24h-34.5v13.1C241.9 25.7 227.1 19 210 19Zm7 34c-20.4 0-35 12.8-35 29.5s14.6 29.5 35 29.5 35-12.8 35-29.5S237.4 53 217 53Z"
        clipRule="evenodd"
      />

      {/* r */}
      <path
        fill="currentColor"
        d="M299 24h36v22.5C346.2 27.2 362.8 18 383 18c13.6 0 27.2 4.7 40 14.1L405 72c-11.5-7.2-21.6-10.8-30.5-10.8-25 0-39.5 17.3-39.5 47.1V141h-36V24Z"
      />

      {/* k */}
      <path
        fill="currentColor"
        d="M427 24h36v39.2L500.5 24H545l-45.7 51.5L550 141h-45.5L463 88.8V141h-36V24Z"
      />

      {/* a */}
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M588 19c-38.7 0-68 27.6-68 63.5S549.3 146 588 146c17.1 0 31.9-6.7 42.5-18.1V141H665V24h-34.5v13.1C619.9 25.7 605.1 19 588 19Zm7 34c-20.4 0-35 12.8-35 29.5s14.6 29.5 35 29.5 35-12.8 35-29.5S615.4 53 595 53Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export default MarkaWordmark;
