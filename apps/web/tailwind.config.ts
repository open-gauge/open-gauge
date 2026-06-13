import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        mar: {
          bg:           "var(--mar-bg)",
          text:         "var(--mar-text)",
          action:       "var(--mar-action)",
          "action-dark": "var(--mar-action-dark)",
          // accent uses rgb() so opacity modifiers (e.g. bg-mar-accent/20) work
          accent:       "rgb(47 129 155 / <alpha-value>)",
          "accent-dark": "var(--mar-accent-dark)",
        },
      },
    },
  },
  plugins: [],
};
export default config;
