// Photo d'un post du feed — chargée quand elle approche de l'écran.
//
// Avant : la photo restait cachée derrière un bouton « voir la photo ». C'était
// économe mais ça ne ressemblait pas à un feed : sur un vrai réseau social les
// images sont là. Ici on garde l'économie SANS le bouton, en ne demandant l'URL
// signée que lorsque le post approche du viewport (IntersectionObserver).
//
// Pourquoi c'est plus frugal que « tout charger au montage » :
//   - on ne paie l'egress que des photos réellement vues (on lit rarement les
//     20 posts jusqu'en bas) ;
//   - les appels de signature sont étalés au lieu de partir en rafale ;
//   - l'upload pose déjà `cacheControl: 1 an`, donc une photo vue une fois ne
//     recoûte rien aux visites suivantes.
//
// La place est réservée par un ratio 4/3 fixe : aucun décalage de mise en page
// quand l'image arrive (CLS = 0).

import { useEffect, useRef, useState } from "react";

export default function FeedPhoto({ post, url, signing, onNeedsUrl, alt, onDoubleTapLike }) {
  const holderRef = useRef(null);
  const askedRef = useRef(false);
  const lastTapRef = useRef(0);
  const [visible, setVisible] = useState(false); // fondu à l'arrivée
  const [burst, setBurst] = useState(false);     // coeur au double-tap

  // Double-tap pour reagir, le geste attendu sur un feed. Gere a la main plutot
  // qu'avec onDoubleClick : sur mobile le dblclick natif est inegal, et on veut
  // aussi ignorer le second tap s'il arrive trop tard.
  function handleTap() {
    if (!onDoubleTapLike) return;
    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      lastTapRef.current = 0;
      onDoubleTapLike(post);
      setBurst(true);
      setTimeout(() => setBurst(false), 700);
    } else {
      lastTapRef.current = now;
    }
  }

  useEffect(() => {
    const el = holderRef.current;
    if (!el || url || askedRef.current) return undefined;

    // Repli sans IntersectionObserver : on demande tout de suite.
    if (typeof IntersectionObserver === "undefined") {
      askedRef.current = true;
      onNeedsUrl(post);
      return undefined;
    }

    const io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting) && !askedRef.current) {
        askedRef.current = true;
        io.disconnect();
        onNeedsUrl(post);
      }
    }, { rootMargin: "300px 0px" }); // un écran d'avance : l'image est prête à l'arrivée

    io.observe(el);
    return () => io.disconnect();
  }, [post, url, onNeedsUrl]);

  return (
    <div ref={holderRef}
      onPointerUp={handleTap}
      style={{ aspectRatio: "4/3", overflow: "hidden", backgroundColor: "var(--bt-subtle)", position: "relative",
        cursor: onDoubleTapLike ? "pointer" : undefined, touchAction: "manipulation" }}>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setVisible(true)}
          className="w-full h-full object-cover bt-feed-photo"
          style={{ opacity: visible ? 1 : 0 }}
        />
      )}
      {!url && signing && (
        <span aria-hidden="true" className="bt-skeleton absolute inset-0" style={{ borderRadius: 0 }} />
      )}
      {burst && (
        <span aria-hidden="true" className="bt-heart-burst absolute inset-0 flex items-center justify-center">
          <svg width="76" height="76" viewBox="0 0 24 24" fill="#fff" stroke="none"
            style={{ filter: "drop-shadow(0 2px 12px rgba(0,0,0,0.35))" }}>
            <path d="M12 21s-7.5-4.7-9.3-9A5.4 5.4 0 0 1 12 6.2 5.4 5.4 0 0 1 21.3 12c-1.8 4.3-9.3 9-9.3 9z" />
          </svg>
        </span>
      )}
    </div>
  );
}
