/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      // `xs:` etait deja utilise dans le code (boutons Pause / Terminer du chrono)
      // mais n'existait pas : Tailwind 3 demarre a sm:640px, donc la regle ne
      // s'appliquait jamais et les deux boutons restaient empiles sur mobile.
      // 380px et non 400 : les iPhone les plus repandus font 390-393px de large
      // (12/13/14 = 390, 15/16 = 393). Un seuil a 400 les aurait tous exclus.
      // En dessous (iPhone SE / mini = 375) les boutons restent empiles.
      screens: {
        xs: "380px",
      },
      fontFamily: {
        sans: ["Nunito Sans", "Avenir Next", "Segoe UI", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Quicksand", "Avenir Next", "ui-rounded", "ui-sans-serif", "system-ui", "sans-serif"],
        num: ["Nunito Sans", "Avenir Next", "Segoe UI", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        accent: {
          DEFAULT: "var(--bt-brand-primary)",
          dark:    "var(--bt-brand-text)",
          soft:    "var(--bt-brand-surface)",
        },
        bt: {
          bg:       "var(--bt-bg)",
          surface:  "var(--bt-surface)",
          surface2: "var(--bt-subtle)",
          border:   "var(--bt-border)",
          text:     "var(--bt-text-1)",
          muted:    "var(--bt-text-2)",
          faint:    "var(--bt-text-3)",
        },
      },
    },
  },
  plugins: [],
};
