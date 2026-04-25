import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#fff1f2",
          100: "#ffe4e6",
          200: "#fecdd3",
          300: "#fda4af",
          400: "#fb7185",
          500: "#f43f5e",
          600: "#e11d48",
          700: "#be123c",
          800: "#9f1239",
          900: "#881337",
        },
        gold: {
          50:  "#fffbeb",
          100: "#fef3c7",
          200: "#fde68a",
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706",
          700: "#b45309",
        },
        ink:     "#1c0505",
        paper:   "#fffbf7",
        crimson: "#c41230",
        accent:  "#d97706",
        danger:  "#991b1b",
      },
      fontFamily: {
        display: ["var(--font-oswald)", "sans-serif"],
        body:    ["var(--font-inter)", "sans-serif"],
      },
      boxShadow: {
        soft: "0 20px 60px rgba(28,5,5,0.12)",
        card: "0 1px 4px rgba(28,5,5,0.08)",
        glow: "0 0 30px rgba(196,18,48,0.20)",
      },
      borderRadius: {
        app:    "16px",
        "app-lg": "20px",
      }
    }
  },
  plugins: [require("@tailwindcss/forms")]
};

export default config;
