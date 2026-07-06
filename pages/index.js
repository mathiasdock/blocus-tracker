import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "../contexts/AuthContext";

const features = [
  {
    title: "Chrono d'étude",
    text: "Lance une session libre ou un rythme Pomodoro, garde le cap et enregistre ton temps quand tu crées un compte.",
  },
  {
    title: "Planning de révision",
    text: "Organise tes cours, objectifs et examens pour voir clairement ce qui doit avancer chaque jour.",
  },
  {
    title: "Stats et progression",
    text: "Suis tes heures, tes séries, tes records, tes badges et ton XP sans te perdre dans des tableaux compliqués.",
  },
  {
    title: "Motivation sociale",
    text: "Travaille avec tes amis, groupes et communautés étudiantes quand tu veux rendre le blocus moins solitaire.",
  },
];

const faq = [
  {
    q: "Blocus Tracker est-il gratuit ?",
    a: "Oui. Tu peux tester le chrono gratuitement en mode découverte. Un compte permet surtout de sauvegarder tes données et ta progression.",
  },
  {
    q: "Faut-il un compte pour utiliser le chrono ?",
    a: "Non pour essayer le chrono. Oui pour conserver tes statistiques, ton planning, tes amis, tes badges et ton profil.",
  },
  {
    q: "À qui s'adresse Blocus Tracker ?",
    a: "Aux étudiants qui veulent structurer leurs révisions, mesurer leur temps d'étude et rester réguliers pendant les périodes de blocus ou d'examens.",
  },
];

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, router, user]);

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ backgroundColor: "var(--bt-bg)" }}>
      <div className="auth-bg absolute inset-0" aria-hidden="true" />
      <div className="absolute inset-0" aria-hidden="true" style={{ backgroundColor: "var(--bt-auth-overlay)" }} />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Link href="/" className="font-display text-xl font-bold tracking-tight" style={{ color: "var(--bt-text-1)" }}>
          blocus<span style={{ color: "#14B885" }}>·</span>tracker
        </Link>
        <nav className="flex items-center gap-2" aria-label="Navigation principale">
          <Link href="/login" className="rounded-full px-4 py-2 text-sm font-semibold transition-colors"
            style={{ color: "var(--bt-accent-dark)", backgroundColor: "var(--bt-accent-bg)", border: "1px solid var(--bt-accent-border)" }}>
            Se connecter
          </Link>
          <Link href="/signup" className="hidden rounded-full px-4 py-2 text-sm font-semibold text-white sm:inline-flex"
            style={{ backgroundColor: "#14B885", boxShadow: "0 8px 22px rgba(20,184,133,0.22)" }}>
            Créer un compte
          </Link>
        </nav>
      </header>

      <main className="relative z-10">
        <section className="mx-auto flex min-h-[calc(100vh-88px)] max-w-6xl flex-col justify-center px-5 pb-12 pt-6">
          <div className="max-w-3xl">
            <p className="mb-4 inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide"
              style={{ color: "var(--bt-accent-dark)", backgroundColor: "var(--bt-accent-bg)", border: "1px solid var(--bt-accent-border)" }}>
              Application d'étude pour étudiants
            </p>
            <h1 className="max-w-3xl text-4xl leading-tight sm:text-6xl" style={{ color: "var(--bt-text-1)" }}>
              Le chrono qui rend ton blocus plus clair.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed sm:text-lg" style={{ color: "var(--bt-text-2)" }}>
              Chronomètre tes sessions, prépare tes examens, suis ta progression et garde une dynamique régulière avec tes amis. Le chrono est testable sans compte ; tes données se sauvegardent quand tu t'inscris.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/dashboard" className="btn-primary px-6 py-3 text-center text-sm">
                Essayer le chrono
              </Link>
              <Link href="/signup" className="btn-ghost px-6 py-3 text-center text-sm"
                style={{ backgroundColor: "var(--bt-surface)" }}>
                Créer mon espace
              </Link>
            </div>
          </div>

          <dl className="mt-10 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Fonctionnalités principales">
            {["Chrono", "Planning", "Stats", "Social"].map((item) => (
              <div key={item} className="rounded-2xl px-4 py-3"
                style={{ backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-border)" }}>
                <dt className="text-sm font-bold" style={{ color: "var(--bt-text-1)" }}>{item}</dt>
                <dd className="mt-1 text-xs" style={{ color: "var(--bt-text-2)" }}>Inclus</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="bg-[var(--bt-bg)] px-5 py-14">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl">
              <h2 className="text-2xl sm:text-3xl" style={{ color: "var(--bt-text-1)" }}>
                Pensé pour les vraies semaines de révision.
              </h2>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
                Blocus Tracker garde l'interface calme et lisible pour que tu puisses lancer, planifier, mesurer et reprendre sans friction.
              </p>
            </div>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {features.map((feature) => (
                <article key={feature.title} className="card p-5">
                  <h3 className="text-base" style={{ color: "var(--bt-text-1)" }}>{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>{feature.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 py-14" style={{ backgroundColor: "var(--bt-surface)", borderTop: "1px solid var(--bt-border)" }}>
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <h2 className="text-2xl sm:text-3xl" style={{ color: "var(--bt-text-1)" }}>
                Questions fréquentes
              </h2>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
                Les réponses courtes que les étudiants cherchent avant de créer un compte.
              </p>
            </div>
            <div className="space-y-3">
              {faq.map((item) => (
                <article key={item.q} className="rounded-2xl p-5" style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)" }}>
                  <h3 className="text-base" style={{ color: "var(--bt-text-1)" }}>{item.q}</h3>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>{item.a}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
