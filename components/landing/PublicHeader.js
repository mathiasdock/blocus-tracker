import Link from "next/link";
import { useRouter } from "next/router";
import { useI18n } from "../../contexts/I18nContext";
import { getLandingContent } from "../../lib/landingContent";
import s from "./Landing.module.css";

// En-tête commun du site public (accueil, fonctionnalités, guides, FAQ et les
// six guides). Sur téléphone : la marque et « Se connecter » — l'appel
// principal est déjà dans chaque page, les autres liens dans le pied de page.
export default function PublicHeader() {
  const { lang } = useI18n();
  const { pathname } = useRouter();
  const c = getLandingContent(lang).header;

  return (
    <header className={s.header}>
      <div className={`${s.container} ${s.headerInner}`}>
        <Link href="/" className={`${s.wordmark} ${s.display}`} aria-label={c.home}>
          blocus<span className={s.wordmarkDot}>·</span>tracker
        </Link>
        <nav className={s.nav} aria-label={c.navAria}>
          {c.links.map(([href, label]) => (
            <Link key={href} href={href} className={s.navLink} aria-current={pathname === href ? "page" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        <div className={s.headerActions}>
          <Link href="/login" className={s.loginLink}>{c.login}</Link>
          <Link href="/signup" className={`btn-primary ${s.headerCta}`}>{c.signup}</Link>
        </div>
      </div>
    </header>
  );
}
