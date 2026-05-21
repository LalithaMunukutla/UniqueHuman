import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f7f7f8",
          100: "#eceef0",
          200: "#d4d8de",
          300: "#aab0bb",
          400: "#7a8190",
          500: "#525a6b",
          600: "#3a4150",
          700: "#2a303c",
          800: "#1c212b",
          900: "#11151c",
        },
        accent: {
          DEFAULT: "#ef3e6d",
          soft: "#ffe3eb",
        },
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
