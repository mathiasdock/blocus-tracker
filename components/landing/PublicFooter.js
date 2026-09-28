import Link from "next/link";
import { useI18n } from "../../contexts/I18nContext";
import { useConsent } from "../../contexts/ConsentContext";
import { getLandingContent } from "../../lib/landingContent";
import s from "./Landing.module.css";

// Pied de page du site public. Il porte les liens de toutes les pages
// indexables : chaque guide reste à un clic de n'importe quelle page.
export default function PublicFooter() {
  const { lang } = useI18n();
  const { openSettings } = useConsent();
  const c = getLandingContent(lang).footer;

  return (
    <footer className={s.footer}>
      <div className={s.container}>
        <div className={s.footerGrid}>
          <div>
            <Link href="/" className={`${s.wordmark} ${s.display}`}>
              blocus<span className={s.wordmarkDot}>·</span>tracker
            </Link>
            <p className={s.footerTagline}>{c.tagline}</p>
          </div>
          {c.columns.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <p className={s.footerTitle}>{column.title}</p>
              <ul className={s.footerLinks}>
                {column.links.map(([href, label]) => (
                  <li key={href}>
                    <Link href={href} className={s.footerLink}>{label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className={s.footerBottom}>
          <span>© {new Date().getFullYear()} Blocus Tracker</span>
          {/* Le bandeau cookies s'affiche sur le site public : son panneau
              doit y rester joignable sans créer de compte. */}
          <button type="button" onClick={openSettings} className={s.footerButton}>
            {c.cookieSettings}
          </button>
          <span>{c.credit}</span>
        </div>
      </div>
    </footer>
  );
}
