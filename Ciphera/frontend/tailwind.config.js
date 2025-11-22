/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'brand-900': '#121212', // Dark page background
        'brand-600': '#212121', // Lighter container background
        'gold-500': '#FFD700', // Gold color for icons/accents
        // Add other colors from your Figma design here, using semantic names
        'ui-border': '#c5c6cc',
        'text-muted': '#71727a',
        'accent': '#FFA500', // Updated to Golden Orange from Figma
      },
      fontFamily: {
        display: ["Poppins", "sans-serif"],
        body: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
}