import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        lilac: {
          light: "#EDE9FE",
          DEFAULT: "#C4B5FD",
          dark: "#8B5CF6",
        },
      },
      fontFamily: {
        display: ["var(--font-display)"],
      },
    },
  },
  plugins: [],
};
export default config;
