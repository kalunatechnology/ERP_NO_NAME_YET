import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./contexts/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      /* ── Marka Brand Colors (Identik dengan Marka Logistik) ── */
      colors: {
        primary: {
          DEFAULT: "#4F8CF6",
          hover: "#72A3F8",
          active: "#3F70C5",
        },
        danger: {
          DEFAULT: "#F43F5E",
          hover: "#F6657E",
          active: "#C3324B",
        },
        success: {
          DEFAULT: "#10B981",
          hover: "#40C79A",
          active: "#0D9467",
        },
        tertiary: {
          DEFAULT: "#475569",
          hover: "#6C7787",
          active: "#394454",
          disabled: "#94A3B8",
        },
        grey: "#94A3B8",
        brand: {
          primary:          "#4F8CF6",
          "primary-dark":  "#3F70C5",
          "primary-soft":  "#9FD6FF",
          "primary-pale":  "#EBF3FE",
          muted:            "#475569",
          "deep-green":    "#3F70C5",
          "green":         "#4F8CF6",
          "light-green":   "#EBF3FE",
          "gradient-from": "#72A3F8",
          "gradient-to":   "#3F70C5",
        },
        text: {
          primary:   "#0F172A", // Slate 900
          secondary: "#475569", // Slate 600
          tertiary:  "#94A3B8", // Slate 400
        },
        bg: {
          lighter: "#F1F5F9", // Slate 100
          light:   "#F8FAFC", // Slate 50
        },
        status: {
          online:  "#10B981",
          offline: "#94A3B8",
          warning: "#F59E0B",
          danger:  "#F43F5E",
          info:    "#4F8CF6",
        },
      },

      /* ── Typography (Identik dengan Marka: Inter Font) ── */
      fontFamily: {
        inter: ["Inter", "-apple-system", "BlinkMacSystemFont", "'Segoe UI'", "Roboto", "sans-serif"],
        sans:  ["Inter", "-apple-system", "BlinkMacSystemFont", "'Segoe UI'", "Roboto", "sans-serif"],
      },
      fontSize: {
        "3xs": ["9px", { lineHeight: "12px" }],
        "2xs": ["10px", { lineHeight: "14px" }],
        xs:    ["12px", { lineHeight: "16px" }],
        sm:    ["13px", { lineHeight: "18px" }],
        base:  ["14px", { lineHeight: "20px" }],
        md:    ["15px", { lineHeight: "22px" }],
        lg:    ["16px", { lineHeight: "24px" }],
        xl:    ["20px", { lineHeight: "28px" }],
        "2xl": ["24px", { lineHeight: "32px" }],
        "3xl": ["28px", { lineHeight: "36px" }],
      },

      /* ── Border Radius ── */
      borderRadius: {
        sm:    "6px",
        DEFAULT: "8px",
        md:    "10px",
        lg:    "12px",
        xl:    "16px",
        "2xl": "20px",
        full:  "9999px",
      },

      /* ── Spacing ── */
      spacing: {
        "4.5":  "18px",
        "13":   "52px",
        "17.5": "70px",
        "18":   "72px",
        "60":   "240px",   // Marka standard expanded sidebar
        "68":   "272px",
        "16":   "64px",    // Topbar height
        "17":   "68px",
        "65":   "260px",
      },

      /* ── Box Shadow ── */
      boxShadow: {
        DEFAULT: "0px 8px 20px rgba(143, 142, 174, 0.15)",
        "2xs":    "0 1px 2px rgba(0,0,0,0.03)",
        xs:       "0 1px 2px rgba(0,0,0,0.05)",
        card:     "0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03)",
        "card-md":"0 4px 12px rgba(79, 140, 246, 0.08)",
        sidebar:  "2px 0 8px rgba(0,0,0,0.08)",
        topbar:   "0 0px 2px 2px rgba(0,0,0,0.04)",
      },

      /* ── Gradients ── */
      backgroundImage: {
        "brand-gradient": "linear-gradient(180deg, #72A3F8 0%, #3F70C5 100%)",
        "brand-gradient-h": "linear-gradient(90deg, #72A3F8 0%, #3F70C5 100%)",
      },

      /* ── Transitions ── */
      transitionDuration: {
        "150": "150ms",
        "200": "200ms",
      },
    },
  },
  plugins: [
    plugin(({ addVariant }) => {
      addVariant("sidebar-expanded", ":merge(.sidebar-expanded) &");
    }),
  ],
};

export default config;
