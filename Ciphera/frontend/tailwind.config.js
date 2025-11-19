/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        base: {
          900: "#121212",
          800: "#1e1e1e",
          700: "#3b3b3b",
          600: "#212121",
        },
        overlay: "#141414",
        border: "#c5c6cc",
        muted: "#71727a",
        placeholder: "#8f9098",
        accent: {
          DEFAULT: "#ffa500",
          strong: "#ffb13c",
        },
        info: "#006FFD",
        white: "#ffffff",
      },
      fontFamily: {
        display: ["Poppins", "Inter", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        none: "0px",
        xs: "4px",
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "24px",
        pill: "999px",
        full: "9999px",
      },
      spacing: {
        3.5: "0.875rem",
        4.5: "1.125rem",
        7: "1.75rem",
        8.5: "2.125rem",
        10.5: "2.625rem",
        15: "3.75rem",
      },
      boxShadow: {
        card: "0 16px 40px rgba(0, 0, 0, 0.35)",
        inset: "inset 0 1px 0 rgba(255, 255, 255, 0.04)",
      },
    },
  },
  plugins: [],
};
