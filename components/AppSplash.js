import styles from "./AppSplash.module.css";

// Le logo est écrit en clair ici plutôt que chargé depuis /app-icon.svg : une
// balise <img> demanderait une requête, et le logo apparaîtrait une image après
// le fond. Inline, il est dans le HTML initial et peint en même temps que le
// vert — c'est ce qui rend le relais avec l'écran de lancement iOS invisible.
//
// C'est le même dessin que public/app-icon.svg. Les deux doivent bouger
// ensemble : le générateur d'écrans de lancement lit le fichier, cet écran-ci
// lit ce balisage.
export default function AppSplash() {
  return (
    <div className={styles.splash} aria-hidden="true">
      <svg className={styles.mark} viewBox="0 0 1024 1024" focusable="false">
        <rect width="1024" height="1024" fill="#14B885" />
        <rect x="220" y="110" width="167" height="804" rx="72" fill="#0B2E23" />
        <circle cx="515" cy="629" r="285" fill="#0B2E23" />
        <circle cx="515" cy="629" r="173" fill="#14B885" />
        <rect x="648" y="314" width="130" height="60" rx="22" fill="#0B2E23" transform="rotate(36 713 344)" />
        <line x1="515" y1="629" x2="598" y2="533" fill="none" stroke="#F4E8D0" strokeWidth="30" strokeLinecap="round" />
        <circle cx="515" cy="629" r="28" fill="#F4E8D0" />
      </svg>
    </div>
  );
}
