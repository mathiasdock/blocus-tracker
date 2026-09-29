import Link from "next/link";
import { useRouter } from "next/router";
import { useI18n } from "../../contexts/I18nContext";
import { getLandingContent } from "../../lib/landingContent";
import s from "./Landing.module.css";

// En-tête commun du site public. Sur téléphone, l'inscription reste l'action
// principale, avec un libellé court qui préserve l'accès à la connexion.
export default function PublicHeader({ signupHref = "/signup" }) {
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
          <Link href={signupHref} className={`btn-primary ${s.headerCta}`} aria-label={c.signup}>
            <span className={s.headerCtaMobile}>{c.signupMobile}</span>
            <span className={s.headerCtaDesktop}>{c.signup}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
