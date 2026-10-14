import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useI18n } from "../../contexts/I18nContext";
import { getLandingContent } from "../../lib/landingContent";
import { languageSwitchHref, publicHref } from "../../lib/publicRoutes.mjs";
import s from "./Landing.module.css";

// L'ancre de la page (#question-3…), pour que le changement de langue garde
// la position. Lue après le montage : le serveur ne la connaît pas.
function useLocationHash() {
  const [hash, setHash] = useState("");
  useEffect(() => {
    const read = () => setHash(window.location.hash);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  return hash;
}

// En-tête commun du site public. Sur téléphone, l'inscription reste l'action
// principale, avec un libellé court qui préserve l'accès à la connexion.
// Le lien de langue mène à la même page dans l'autre langue (ou à l'accueil
// de l'autre langue tant qu'elle n'est pas traduite) : il change d'adresse,
// jamais un réglage.
export default function PublicHeader({ signupHref = "/signup" }) {
  const { lang } = useI18n();
  const router = useRouter();
  const hash = useLocationHash();
  const c = getLandingContent(lang).header;
  const other = lang === "en" ? "fr" : "en";
  const switchHref = languageSwitchHref({ pathname: router.pathname, query: router.isReady ? router.query : {}, hash }, other);

  return (
    <header className={s.header}>
      <div className={`${s.container} ${s.headerInner}`}>
        <Link href={publicHref("/", lang)} className={`${s.wordmark} ${s.display}`} aria-label={c.home}>
          blocus<span className={s.wordmarkDot}>·</span>tracker
        </Link>
        <nav className={s.nav} aria-label={c.navAria}>
          {c.links.map(([href, label]) => {
            const to = publicHref(href, lang);
            return (
              <Link key={href} href={to} className={s.navLink} aria-current={router.pathname === to ? "page" : undefined}>
                {label}
              </Link>
            );
          })}
        </nav>
        <div className={s.headerActions}>
          <Link href={switchHref} hrefLang={other} lang={other} className={s.langLink}>
            {c.switchCode}
            <span className={s.srOnly}>{` – ${c.switchName}`}</span>
          </Link>
          <Link href={publicHref("/login", lang)} className={s.loginLink}>
            <span className={s.loginLong}>{c.login}</span>
            <span className={s.loginShort}>{c.loginShort}</span>
          </Link>
          <Link href={publicHref(signupHref, lang)} className={`btn-primary ${s.headerCta}`} aria-label={c.signup}>
            <span className={s.headerCtaMobile}>{c.signupMobile}</span>
            <span className={s.headerCtaDesktop}>{c.signup}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
