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
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        display: ["Bricolage Grotesque", "ui-sans-serif", "system-ui", "sans-serif"],
        num: ["Space Grotesk", "ui-sans-serif", "system-ui", "sans-serif"],
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
