import { useEffect, useState } from "react";

// Avatar d'un membre : sa photo, ou son initiale sur la teinte d'accent quand
// il n'en a pas (ou qu'elle ne charge pas). Sorti de Layout pour que la cloche
// puisse l'utiliser sans que Layout et elle ne s'importent l'un l'autre ;
// Layout le réexporte, les imports existants ne changent pas.
export default function Avatar({ url, pseudo, size = 32 }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [url]);

  if (url && !failed) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={pseudo || "avatar"}
          loading="lazy" decoding="async"
          onError={() => setFailed(true)}
          className="rounded-full object-cover shrink-0"
          style={{ width: size, height: size, border: "1.5px solid var(--bt-border)" }} />
      </>
    );
  }
  return (
    <div className="rounded-full flex items-center justify-center font-semibold shrink-0"
      style={{
        width: size, height: size,
        fontSize: size * 0.4,
        backgroundColor: "var(--bt-accent-bg)",
        color: "var(--bt-accent-dark)",
        border: "1.5px solid var(--bt-accent-border)",
      }}>
      {(pseudo || "?").slice(0, 1).toUpperCase()}
    </div>
  );
}
