import { useState } from "react";
import Head from "next/head";
import Mascot, { MASCOT_MOODS } from "../../components/Mascot";

const LABELS = {
  neutral: "Au repos", focused: "Concentré", happy: "Heureux", proud: "Fier",
  celebrating: "Célébration", sleepy: "Somnolent", worried: "Inquiet", surprised: "Surpris",
};
const DESCRIPTIONS = {
  neutral: "Un salut de la patte, puis un regard curieux et de petits changements d’appui.",
  focused: "Livre en main, il baisse la tête et suit les lignes du regard.",
  happy: "Il te salue, remue sa queue enroulée et change joyeusement d’appui.",
  proud: "Mains sur les hanches, sourire satisfait, puis petit geste de victoire.",
  celebrating: "Deux bonds, pattes levées, jambes qui se replient et oreilles qui suivent.",
  sleepy: "Un grand bâillement avec étirement, puis la tête qui tombe doucement.",
  worried: "Oreilles baissées, pattes rapprochées et regard qui cherche à se rassurer.",
  surprised: "Yeux écarquillés, bouche ronde et pattes qui se lèvent d’un coup.",
};

// A local rehearsal space; this route returns 404 in production.
export function getServerSideProps() {
  return process.env.NODE_ENV === "development" ? { props: {} } : { notFound: true };
}

export default function MascotRehearsal() {
  const [mood, setMood] = useState("happy");
  const [replay, setReplay] = useState(0);
  const [animated, setAnimated] = useState(true);
  const [size, setSize] = useState(192);
  const [mounted, setMounted] = useState(true);
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Head><title>Mascotte — atelier local</title><meta name="robots" content="noindex" /></Head>
      <p className="text-xs uppercase tracking-widest text-accent font-bold">Atelier local</p>
      <h1 className="mt-3 text-3xl font-display font-bold">Nouveau dessin. Vraies poses.</h1>
      <p className="mt-3 text-sm" style={{ color: "var(--bt-text-2)" }}>
        Pattes articulées, queue enroulée, grandes expressions : change d’humeur
        pour voir le nouveau shiba réagir. Les gestes expressifs restent ponctuels.
      </p>
      <div className="card mt-8 p-8 text-center">
        <div id="mascot-preview-character" className="flex items-end justify-center h-56 pb-5">
          {mounted && <Mascot mood={mood} size={size} animated={animated} reactionKey={replay} ariaLabel={LABELS[mood]} />}
        </div>
        <p className="mt-6 text-lg font-semibold">{LABELS[mood]}</p>
        <p className="mt-2 mx-auto max-w-sm text-sm" style={{ color: "var(--bt-text-2)" }}>{DESCRIPTIONS[mood]}</p>
        <div className="mt-5 flex justify-center flex-wrap gap-3">
          <button className="btn-primary" onClick={() => setReplay(n => n + 1)}>Rejouer la réaction</button>
          <button className="btn" aria-pressed={!animated} onClick={() => setAnimated(v => !v)}>
            {animated ? "Mettre en pause" : "Animer"}
          </button>
          <button className="btn" onClick={() => setMounted(v => !v)}>{mounted ? "Masquer" : "Afficher"}</button>
        </div>
        <label className="mt-5 inline-flex items-center gap-3 text-sm">
          Taille réelle
          <select className="input" value={size} onChange={e => setSize(Number(e.target.value))}>
            <option value={46}>46 px — bulle</option>
            <option value={96}>96 px — moment</option>
            <option value={160}>160 px — détail</option>
            <option value={192}>192 px — atelier</option>
          </select>
        </label>
      </div>
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {MASCOT_MOODS.map(value => (
          <button key={value} className="card p-4 flex flex-col items-center gap-3"
            aria-pressed={mood === value} onClick={() => setMood(value)}
            style={{ outline: mood === value ? "2px solid var(--bt-accent)" : "none" }}>
            <Mascot mood={value} size={64} animated={false} ariaLabel={LABELS[value]} />
            <span className="text-sm font-semibold">{LABELS[value]}</span>
          </button>
        ))}
      </div>
    </main>
  );
}
