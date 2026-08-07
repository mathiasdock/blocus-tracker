// Wrapper commun pour toutes les pages d'authentification.
// Affiche l'image de fond (desktop ou mobile) avec un overlay adaptatif.
export default function AuthBackground({ children, className = "min-h-dvh flex items-center justify-center px-4 py-8 sm:py-10" }) {
  return (
    <>
      <div className="auth-bg" style={{ position: "fixed", inset: 0, zIndex: 0 }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 1, backgroundColor: "var(--bt-auth-overlay)" }} />
      <main style={{ position: "relative", zIndex: 2 }} className={className}>
        {children}
      </main>
    </>
  );
}
