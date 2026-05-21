/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        display: ["Fraunces", "ui-serif", "Georgia", "serif"],
      },
      colors: {
        accent: {
          DEFAULT: "#14B885",
          dark:    "#0E8F68",
          soft:    "#EAFBF4",
        },
        bt: {
          bg:       "#FAF9F7",
          surface:  "#FFFDFB",
          surface2: "#F7F3EF",
          border:   "#E8E2DC",
          text:     "#1F1A17",
          muted:    "#7C746E",
          faint:    "#A8A09A",
        },
      },
    },
  },
  plugins: [],
};
