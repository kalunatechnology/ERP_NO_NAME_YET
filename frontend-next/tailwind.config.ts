/**
 * File: frontend-next/tailwind.config.ts
 *
 * Purpose: Implements runtime/build configuration responsibilities in the frontend application.
 * Responsibility: Owns the contracts declared here and connects them to framework discovery or explicit imports without changing unrelated domain state.
 * Integration: Consumers reach this file through static imports, framework conventions, or an explicit script entry point.
 * Dependencies and side effects: Function-level documentation identifies HTTP, database, browser-state, and security effects where they occur.
 */
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./contexts/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      /* ── Marka+ Brand Colors ──────────────────────────── */
      colors: {
        brand: {
          // Legacy keys are intentionally retained while the application
          // migrates from the old green identity to the approved blue scale.
          "deep-green":    "#163D64",
          "green":         "#0876CD",
          "light-green":   "#E7F2FF",
          "gradient-from": "#0876CD",
          "gradient-to":   "#163D64",
          primary:          "#0876CD",
          "primary-dark":  "#163D64",
          "primary-soft":  "#BAE6FD",
          "primary-pale":  "#E7F2FF",
          muted:            "#64748B",
        },
        text: {
          primary:   "#0F172A",
          secondary: "#475569",
          tertiary:  "#E2E8F0",
        },
        bg: {
          lighter: "#F8FAFC",
          light:   "#F0F4F8",
        },
        status: {
          online:  "#10B981",
          offline: "#CACACA",
          warning: "#D97706",
          danger:  "#DC2626",
          info:    "#0876CD",
        },
      },

      /* ── Typography (Strictly Aligned with Implementation Guideline) ─ */
      fontFamily: {
        sans: ["Fira Sans", "ui-sans-serif", "system-ui", "-apple-system", "'Segoe UI'", "sans-serif"],
      },
      fontSize: {
        "3xs": ["9px", { lineHeight: "12px" }],
        "2xs": ["10px", { lineHeight: "14px" }],
        xs:    ["12px", { lineHeight: "16px" }], // Caption (12px/16px)
        sm:    ["13px", { lineHeight: "18px" }], // Sub-body
        base:  ["14px", { lineHeight: "20px" }], // Body (14px/20px)
        md:    ["15px", { lineHeight: "22px" }], // Body Medium
        lg:    ["16px", { lineHeight: "24px" }], // H3 (16px/24px)
        xl:    ["20px", { lineHeight: "28px" }], // H2 (20px/28px)
        "2xl": ["24px", { lineHeight: "32px" }], // H1 (24px/32px)
        "3xl": ["28px", { lineHeight: "36px" }], // Hero/Banner
      },

      /* ── Border Radius ───────────────────────────────── */
      borderRadius: {
        sm:    "8px",
        DEFAULT: "8px",
        md:    "12px",
        lg:    "16px",
        xl:    "24px",
        full:  "9999px",
      },

      /* ── Spacing extras ─────────────────────────────── */
      spacing: {
        "4.5":  "18px",
        "13":   "52px",
        "17.5": "70px",
        "18":   "72px",
        "68":   "272px",   // sidebar width
        "17":   "68px",    // topbar height
        "65":   "260px",   // right panel width
      },

      /* ── Box Shadow ──────────────────────────────────── */
      boxShadow: {
        "2xs":    "0 1px 2px rgba(0,0,0,0.03)",
        xs:       "0 1px 2px rgba(0,0,0,0.05)",
        card:     "0 1px 3px rgba(0,0,0,0.04)",
        "card-md":"0 4px 12px rgba(38,73,179,0.08)",
        sidebar:  "2px 0 8px rgba(0,0,0,0.04)",
      },

      /* ── Gradients ───────────────────────────────────── */
      backgroundImage: {
        "brand-gradient": "linear-gradient(180deg, #0876CD 0%, #163D64 100%)",
        "brand-gradient-h": "linear-gradient(90deg, #0876CD 0%, #163D64 100%)",
      },

      /* ── Transitions ─────────────────────────────────── */
      transitionDuration: {
        "150": "150ms",
        "200": "200ms",
      },
    },
  },
  plugins: [],
};

export default config;
