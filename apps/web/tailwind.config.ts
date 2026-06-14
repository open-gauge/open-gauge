import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/store/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        mar: {
          bg:             "var(--mar-bg)",
          text:           "var(--mar-text)",
          action:         "var(--mar-action)",
          "action-dark":  "var(--mar-action-dark)",
          // accent uses rgb var so opacity modifiers (e.g. bg-mar-accent/20) work in both themes
          accent:         "rgb(var(--mar-accent-rgb) / <alpha-value>)",
          "accent-dark":  "var(--mar-accent-dark)",
          surface:        "var(--mar-surface)",
          "surface-alt":  "var(--mar-surface-alt)",
          border:         "var(--mar-border)",
          "border-md":    "var(--mar-border-md)",
        },
      },
    },
  },
  plugins: [],
};
export default config;
