import Link from "next/link";
import Mascot from "../Mascot";
import { useI18n } from "../../contexts/I18nContext";
import { getLandingContent } from "../../lib/landingContent";
import s from "./Landing.module.css";

// Dernier appel, commun aux pages publiques. La mascotte fête une fois
// l'arrivée de la section (moteur de lib/mascotMotion.mjs), puis se pose.
export default function FinalCta() {
  const { lang } = useI18n();
  const c = getLandingContent(lang).cta;
  return (
    <section className={`${s.container} ${s.finalWrap}`} aria-labelledby="final-title">
      <div className={s.final}>
        <div className={s.finalMascot} aria-hidden="true">
          <Mascot mood="celebrating" size={104} />
        </div>
        <h2 id="final-title" className={`${s.finalTitle} ${s.display}`}>{c.title}</h2>
        <p className={s.finalText}>{c.text}</p>
        <div className={`${s.actions} ${s.finalActions}`}>
          <Link href="/signup" className={`btn btn-hero ${s.cta}`}>{c.primary}</Link>
          <Link href="/dashboard" className={`btn ${s.cta} ${s.ctaOnInk}`}>{c.secondary}</Link>
        </div>
      </div>
    </section>
  );
}
