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
          50:  "hsl(var(--brand-h), var(--brand-s), 98%)",
          100: "hsl(var(--brand-h), var(--brand-s), 94%)",
          200: "hsl(var(--brand-h), var(--brand-s), 88%)",
          300: "hsl(var(--brand-h), var(--brand-s), 78%)",
          400: "hsl(var(--brand-h), var(--brand-s), 65%)",
          500: "hsl(var(--brand-h), var(--brand-s), 53%)",
          600: "hsl(var(--brand-h), var(--brand-s), 43%)",
          700: "hsl(var(--brand-h), var(--brand-s), 37%)",
          800: "hsl(var(--brand-h), var(--brand-s), 30%)",
          900: "hsl(var(--brand-h), var(--brand-s), 24%)",
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
        editorial: {
          paper: "#F6F1E6", "paper-2": "#EFE8D7", card: "#FCFAF3",
          ink: "#211D15", "ink-soft": "#5B5446", "ink-faint": "#938B78",
          green: "#2C4031", "green-deep": "#1E2C22",
          clay: "#C0673E", "clay-soft": "#D98C5F",
          sage: "#DEE2CF", gold: "#C99A3F", line: "#E3DBC6",
        },
      },
      fontFamily: {
        display:   ["var(--font-oswald)", "sans-serif"],
        body:      ["var(--font-inter)", "sans-serif"],
        editorial: ["Fraunces", "Georgia", "serif"],
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
