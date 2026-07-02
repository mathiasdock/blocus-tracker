// Wrapper commun pour toutes les pages d'authentification.
// Affiche l'image de fond (desktop ou mobile) avec un overlay blanc discret.
export default function AuthBackground({ children, className = "min-h-screen flex items-center justify-center px-4 py-8" }) {
  return (
    <>
      {/* Image de fond — responsive via CSS */}
      <div className="auth-bg" style={{ position: "fixed", inset: 0, zIndex: 0 }} />
      {/* Overlay adaptatif : blanc en light, sombre en dark — garde le
          contenu lisible dans les deux thèmes */}
      <div style={{ position: "fixed", inset: 0, zIndex: 1, backgroundColor: "var(--bt-auth-overlay)" }} />
      {/* Contenu au-dessus */}
      <div style={{ position: "relative", zIndex: 2 }} className={className}>
        {children}
      </div>
    </>
  );
}
