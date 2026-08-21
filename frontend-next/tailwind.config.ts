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
          "deep-green":    "#275433",
          "green":         "#5A861F",
          "light-green":   "#F0FEE0",
          "gradient-from": "#7CDA24",
          "gradient-to":   "#3E9B4B",
        },
        text: {
          primary:   "#0E341F",
          secondary: "#768779",
          tertiary:  "#E8E8E8",
        },
        bg: {
          lighter: "#FFFFFF",
          light:   "#FDFDFD",
        },
        status: {
          online:  "#66D575",
          offline: "#CACACA",
          warning: "#F59E0B",
          danger:  "#EF4444",
          info:    "#3B82F6",
        },
      },

      /* ── Typography ──────────────────────────────────── */
      fontFamily: {
        sans: ["Google Sans", "Roboto", "Inter", "sans-serif"],
      },
      fontSize: {
        "2xs": ["10px", { lineHeight: "13px" }],
        xs:    ["12px", { lineHeight: "15px" }],
        sm:    ["14px", { lineHeight: "18px" }],
        base:  ["16px", { lineHeight: "20px" }],
        lg:    ["20px", { lineHeight: "25px" }],
        xl:    ["24px", { lineHeight: "30px" }],
        "2xl": ["32px", { lineHeight: "40px" }],
        "3xl": ["40px", { lineHeight: "50px" }],
      },

      /* ── Border Radius ───────────────────────────────── */
      borderRadius: {
        sm:    "4px",
        DEFAULT: "6px",
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
        card:     "0 1px 3px rgba(0,0,0,0.04)",
        "card-md":"0 4px 12px rgba(39,84,51,0.10)",
        sidebar:  "2px 0 8px rgba(0,0,0,0.04)",
      },

      /* ── Gradients ───────────────────────────────────── */
      backgroundImage: {
        "brand-gradient": "linear-gradient(180deg, #7CDA24 0%, #3E9B4B 100%)",
        "brand-gradient-h": "linear-gradient(90deg, #7CDA24 0%, #3E9B4B 100%)",
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
