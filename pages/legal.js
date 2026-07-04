import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { useI18n } from "../contexts/I18nContext";
import { LEGAL_DOCS, LEGAL_EFFECTIVE_DATE } from "../lib/legal";

const TAB_KEYS = {
  privacy: "legal.tabPrivacy",
  terms:   "legal.tabTerms",
  cookies: "legal.tabCookies",
  notice:  "legal.tabNotice",
};

export default function Legal() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [active, setActive] = useState("privacy");

  // Deep-link : /legal?doc=cookies ouvre directement le bon onglet.
  useEffect(() => {
    const q = router.query.doc;
    if (typeof q === "string" && LEGAL_DOCS.some(d => d.id === q)) setActive(q);
  }, [router.query.doc]);

  function selectTab(id) {
    setActive(id);
    router.replace({ pathname: "/legal", query: { doc: id } }, undefined, { shallow: true });
  }

  const doc = LEGAL_DOCS.find(d => d.id === active);
  const content = doc?.[lang === "en" ? "en" : "fr"] || doc?.fr;
  const updated = lang === "en" ? LEGAL_EFFECTIVE_DATE.en : LEGAL_EFFECTIVE_DATE.fr;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto pb-10 bt-stagger">
        <h1 className="text-2xl mb-0.5" style={{ color: "var(--bt-text-1)" }}>{t("legal.pageTitle")}</h1>
        <p className="text-sm mb-5" style={{ color: "var(--bt-text-2)" }}>{t("legal.pageSubtitle")}</p>

        {/* Onglets — controle segmente, scrollable sur mobile */}
        <div className="[&::-webkit-scrollbar]:hidden -mx-1 px-1 mb-5"
          style={{ overflowX: "auto", scrollbarWidth: "none" }}>
          <div className="inline-flex gap-1 rounded-2xl p-1"
            style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)" }}>
            {LEGAL_DOCS.map(d => {
              const isActive = d.id === active;
              return (
                <button key={d.id} onClick={() => selectTab(d.id)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors"
                  style={isActive
                    ? { backgroundColor: "#14B885", color: "#fff", boxShadow: "0 1px 4px rgba(20,184,133,0.3)" }
                    : { color: "var(--bt-text-2)" }}>
                  {t(TAB_KEYS[d.id])}
                </button>
              );
            })}
          </div>
        </div>

        {/* Document */}
        <article className="card p-6">
          <h2 className="font-display text-xl" style={{ color: "var(--bt-text-1)" }}>{content.title}</h2>
          <p className="text-xs mt-1 mb-5" style={{ color: "var(--bt-text-3)" }}>
            {t("legal.updated")} : {updated}
          </p>

          <div className="space-y-6">
            {content.sections.map((s, i) => (
              <section key={i}>
                <h3 className="text-sm font-bold mb-2" style={{ color: "var(--bt-text-1)" }}>{s.h}</h3>
                <div className="space-y-2.5">
                  {s.body.map((item, j) =>
                    typeof item === "string" ? (
                      <p key={j} className="text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>{item}</p>
                    ) : (
                      <ul key={j} className="space-y-1.5">
                        {item.list.map((li, k) => (
                          <li key={k} className="flex items-start gap-2.5 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
                            <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: "var(--bt-accent)" }} />
                            <span>{li}</span>
                          </li>
                        ))}
                      </ul>
                    )
                  )}
                </div>
              </section>
            ))}
          </div>
        </article>
      </div>
    </Layout>
  );
}
