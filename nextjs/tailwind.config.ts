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
          50: "#f1f7ff",
          100: "#dfeeff",
          200: "#bcdcff",
          300: "#89c1ff",
          400: "#5aa3ff",
          500: "#2c84ff",
          600: "#1667e6",
          700: "#0f4fb3",
          800: "#103d86",
          900: "#122f63"
        }
      }
    }
  },
  plugins: [
    require("@tailwindcss/typography")
  ]
};

export default config;

