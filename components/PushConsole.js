// Centre de notifications push — section Communication de l'admin.
//
// Pensé pour quelqu'un qui découvre OneSignal : chaque réglage dit ce qu'il
// fait et ce qu'il implique, l'aperçu montre le résultat avant l'envoi, et
// l'envoi passe par une confirmation qui récapitule cible et contenu — une
// notification part sur des téléphones et ne se rattrape pas.
//
// Toute la mécanique OneSignal vit dans /api/admin/push : la clé REST reste
// server-only, ce composant ne connaît que des intentions.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const MAX_TITLE = 60;
const MAX_BODY = 160;

// Les erreurs remontées par l'API sont des codes techniques anglais. Personne
// ne doit avoir à les décoder : on dit ce qui se passe et quoi vérifier.
function humanError(raw) {
  const m = String(raw || "");
  if (/Server misconfigured/i.test(m)) return "Configuration serveur incomplète — vérifie les variables OneSignal et Supabase dans Vercel.";
  if (/OneSignal unreachable|OneSignal error/i.test(m)) return "OneSignal ne répond pas. Réessaie dans un instant ; si ça persiste, vérifie la clé REST.";
  if (/Forbidden/i.test(m)) return "Ton compte n'a pas les droits admin.";
  if (/Unauthorized/i.test(m)) return "Session expirée — recharge la page.";
  return m || "Une erreur est survenue.";
}

function Field({ label, hint, children, counter }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <label className="label mb-0">{label}</label>
        {counter != null && (
          <span className="font-num tabular-nums text-[11px]" style={{ color: "var(--bt-text-4)" }}>{counter}</span>
        )}
      </div>
      {children}
      {hint && <p className="text-[11px] mt-1.5 leading-snug" style={{ color: "var(--bt-text-3)" }}>{hint}</p>}
    </div>
  );
}

function TargetOption({ active, title, detail, onClick }) {
  return (
    <button type="button" onClick={onClick}
      className="text-left rounded-xl p-3 transition-colors w-full"
      style={{
        backgroundColor: active ? "var(--bt-accent-bg)" : "var(--bt-subtle)",
        border: `1px solid ${active ? "var(--bt-accent-border)" : "transparent"}`,
      }}>
      <span className="block text-sm font-semibold" style={{ color: active ? "var(--bt-accent-dark)" : "var(--bt-text-1)" }}>
        {title}
      </span>
      <span className="block text-[11px] mt-0.5 leading-snug" style={{ color: "var(--bt-text-3)" }}>{detail}</span>
    </button>
  );
}

/** Aperçu de la notification telle qu'elle apparaîtra sur l'appareil. */
function Preview({ title, message }) {
  return (
    <div className="rounded-2xl p-3.5" style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)" }}>
      <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--bt-text-4)" }}>
        Aperçu
      </p>
      <div className="rounded-xl p-3 flex gap-3" style={{ backgroundColor: "var(--bt-surface)", boxShadow: "0 2px 10px var(--bt-shadow)" }}>
        <span className="shrink-0 rounded-lg flex items-center justify-center"
          style={{ width: 32, height: 32, background: "linear-gradient(165deg, #14B885, #0E8F68 115%)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold leading-tight" style={{ color: "var(--bt-text-1)" }}>
            {title || "Titre de ta notification"}
          </p>
          <p className="text-[12px] mt-0.5 leading-snug" style={{ color: "var(--bt-text-2)" }}>
            {message || "Le message qui s'affichera sous le titre."}
          </p>
          <p className="text-[10px] mt-1" style={{ color: "var(--bt-text-4)" }}>Blocus Tracker · maintenant</p>
        </div>
      </div>
    </div>
  );
}

export default function PushConsole({ users = [], universities = [] }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  // Deux erreurs distinctes : celle du chargement de l'audience ne doit pas
  // s'afficher sous le formulaire d'envoi comme si l'envoi avait échoué.
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [url, setUrl] = useState("");
  const [targetType, setTargetType] = useState("all");
  const [university, setUniversity] = useState("");
  const [picked, setPicked] = useState([]);
  const [search, setSearch] = useState("");

  const [sendAfter, setSendAfter] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const authedFetch = useCallback(async (options = {}, query = "") => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) throw new Error("Session expirée — reconnecte-toi.");
    const res = await fetch(`/api/admin/push${query}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...(options.body ? { "Content-Type": "application/json" } : {}) },
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload?.error || "Requête refusée.");
    return payload;
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    try { setData(await authedFetch({ method: "GET" })); }
    catch (e) { setLoadError(humanError(e.message)); }
    finally { setLoading(false); }
  }, [authedFetch]);

  useEffect(() => { load(); }, [load]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return users
      .filter(u => `${u.pseudo || ""} ${u.first_name || ""} ${u.last_name || ""}`.toLowerCase().includes(q))
      .slice(0, 6);
  }, [search, users]);

  const audienceLabel =
    targetType === "all" ? "tous les abonnés"
    : targetType === "university" ? (university || "une université")
    : `${picked.length} membre${picked.length > 1 ? "s" : ""} choisi${picked.length > 1 ? "s" : ""}`;

  const ready = title.trim() && message.trim()
    && (targetType !== "university" || university)
    && (targetType !== "users" || picked.length > 0);

  async function cancel(id) {
    setError("");
    try {
      await authedFetch({ method: "DELETE" }, `?id=${encodeURIComponent(id)}`);
      load();
    } catch (e) { setError(e.message); }
  }

  async function send() {
    setSending(true); setError("");
    try {
      const payload = await authedFetch({
        method: "POST",
        body: JSON.stringify({
          title, message, url: url.trim(),
          sendAfter: sendAfter ? new Date(sendAfter).toISOString() : undefined,
          target: targetType === "university" ? { type: "university", university }
            : targetType === "users" ? { type: "users", userIds: picked.map(u => u.id) }
            : { type: "all" },
        }),
      });
      setResult(payload);
      setTitle(""); setMessage(""); setUrl(""); setPicked([]); setSendAfter("");
      setConfirming(false);
      load();
    } catch (e) { setError(humanError(e.message)); setConfirming(false); }
    finally { setSending(false); }
  }

  const audience = data?.audience;

  return (
    <div className="space-y-5">
      {/* ── Qui reçoit ─────────────────────────────────────────── */}
      <section className="card p-5">
        <h2 className="text-base font-semibold" style={{ color: "var(--bt-text-1)" }}>Qui peut recevoir tes notifications</h2>
        {loading ? (
          <p className="text-sm mt-2" style={{ color: "var(--bt-text-3)" }}>Chargement…</p>
        ) : audience ? (
          <>
            <div className="flex flex-wrap gap-6 mt-3">
              <div>
                <p className="font-num tabular-nums text-3xl font-bold" style={{ color: "var(--bt-accent-dark)" }}>{audience.messageable}</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--bt-text-2)" }}>appareils joignables</p>
              </div>
              <div>
                <p className="font-num tabular-nums text-3xl font-bold" style={{ color: "var(--bt-text-3)" }}>{audience.total}</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--bt-text-2)" }}>appareils enregistrés</p>
              </div>
            </div>
            <p className="text-[11px] mt-3 leading-snug" style={{ color: "var(--bt-text-3)" }}>
              Un <strong>appareil</strong>, pas une personne : quelqu'un qui a activé les notifications sur
              son téléphone et son ordinateur en compte deux. Seuls les appareils joignables reçoivent —
              les autres ont désinstallé l'app ou refusé l'autorisation depuis.
            </p>
          </>
        ) : (
          <div className="mt-2">
            <p className="text-sm" style={{ color: "#DC2626" }} role="alert">{loadError || "OneSignal injoignable."}</p>
            <button type="button" onClick={load} className="btn-ghost mt-3 px-4 py-2 text-sm">Réessayer</button>
          </div>
        )}
      </section>

      {/* ── Composer ───────────────────────────────────────────── */}
      <section className="card p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold" style={{ color: "var(--bt-text-1)" }}>Envoyer une notification</h2>
          <p className="text-[11px] mt-1 leading-snug" style={{ color: "var(--bt-text-3)" }}>
            Elle arrive sur l'écran verrouillé du téléphone, comme un SMS. Elle part immédiatement
            et ne peut pas être annulée — d'où la confirmation avant l'envoi.
          </p>
        </div>

        <Field label="Titre" counter={`${title.length}/${MAX_TITLE}`}
          hint="La ligne en gras. Les téléphones coupent au-delà d'une quarantaine de caractères.">
          <input className="input" maxLength={MAX_TITLE} value={title}
            onChange={e => setTitle(e.target.value)} placeholder="Ta série est en danger" />
        </Field>

        <Field label="Message" counter={`${message.length}/${MAX_BODY}`}
          hint="Une phrase, deux au plus. Dis ce qu'il y a à faire, pas juste ce qui se passe.">
          <textarea className="input" rows={2} maxLength={MAX_BODY} value={message}
            onChange={e => setMessage(e.target.value)} placeholder="Tu n'as pas encore étudié aujourd'hui." />
        </Field>

        <Field label="Ouvrir une page (facultatif)"
          hint="Chemin interne uniquement, par exemple /planning. Vide : la notification ouvre l'accueil.">
          <input className="input" value={url} onChange={e => setUrl(e.target.value)} placeholder="/planning" />
        </Field>

        <div>
          <label className="label">À qui</label>
          <div className="grid gap-2 sm:grid-cols-3">
            <TargetOption active={targetType === "all"} onClick={() => setTargetType("all")}
              title="Tout le monde" detail="Tous les appareils abonnés." />
            <TargetOption active={targetType === "university"} onClick={() => setTargetType("university")}
              title="Une université" detail="Les membres inscrits dans cette école." />
            <TargetOption active={targetType === "users"} onClick={() => setTargetType("users")}
              title="Des membres précis" detail="Tu les choisis un par un." />
          </div>

          {targetType === "university" && (
            <select className="input mt-3" value={university} onChange={e => setUniversity(e.target.value)}>
              <option value="">— Choisir une université —</option>
              {universities.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          )}

          {targetType === "users" && (
            <div className="mt-3">
              <input className="input" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Chercher un membre par pseudo ou nom…" />
              {matches.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {matches.map(u => (
                    <li key={u.id}>
                      <button type="button"
                        onClick={() => { setPicked(p => p.some(x => x.id === u.id) ? p : [...p, u]); setSearch(""); }}
                        className="w-full text-left text-sm px-3 py-2 rounded-lg"
                        style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-1)" }}>
                        @{u.pseudo} <span style={{ color: "var(--bt-text-3)" }}>{[u.first_name, u.last_name].filter(Boolean).join(" ")}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {picked.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {picked.map(u => (
                    <button key={u.id} type="button" onClick={() => setPicked(p => p.filter(x => x.id !== u.id))}
                      className="text-xs px-2.5 py-1 rounded-full inline-flex items-center gap-1.5"
                      style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)" }}
                      aria-label={`Retirer @${u.pseudo}`}>
                      @{u.pseudo}
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[11px] mt-2" style={{ color: "var(--bt-text-3)" }}>
                Les membres qui n'ont pas activé les notifications sont ignorés automatiquement.
              </p>
            </div>
          )}
        </div>

        <Field label="Quand"
          hint={sendAfter
            ? "Elle partira à cette heure. Tu pourras l'annuler tant qu'elle n'est pas partie."
            : "Vide : envoi immédiat, et plus rien à faire — une notification partie ne se rattrape pas."}>
          <input type="datetime-local" className="input" value={sendAfter}
            min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
            onChange={e => setSendAfter(e.target.value)} />
        </Field>

        <Preview title={title} message={message} />

        {error && <p className="text-xs" style={{ color: "#DC2626" }} role="alert">{error}</p>}
        {result?.ok && (
          <p className="text-xs" style={{ color: "var(--bt-accent-dark)" }} role="status">
            Envoyée{result.recipients != null ? ` à ${result.recipients} appareil(s)` : ""}.
          </p>
        )}

        <button type="button" className="btn-primary w-full sm:w-auto" disabled={!ready || sending}
          onClick={() => setConfirming(true)}>
          {sendAfter ? "Programmer la notification" : "Envoyer la notification"}
        </button>
      </section>

      {/* ── Historique ─────────────────────────────────────────── */}
      <section className="card p-5">
        <h2 className="text-base font-semibold mb-1" style={{ color: "var(--bt-text-1)" }}>Envois récents</h2>
        <p className="text-[11px] mb-4" style={{ color: "var(--bt-text-3)" }}>
          « Reçues » compte les appareils qu'Apple ou Google ont acceptés — pas ceux qui l'ont lue.
        </p>
        {loading ? (
          <p className="text-sm" style={{ color: "var(--bt-text-3)" }}>Chargement…</p>
        ) : !data?.history?.length ? (
          <p className="text-sm" style={{ color: "var(--bt-text-3)" }}>Aucune notification envoyée pour l'instant.</p>
        ) : (
          <ul className="space-y-2">
            {data.history.map(n => (
              <li key={n.id} className="rounded-xl p-3" style={{ backgroundColor: "var(--bt-subtle)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: "var(--bt-text-1)" }}>{n.title || "(sans titre)"}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--bt-text-2)" }}>{n.body}</p>
                    <p className="text-[10px] mt-1" style={{ color: "var(--bt-text-4)" }}>
                      {n.scheduledFor
                        ? `Programmée pour le ${new Date(n.scheduledFor).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
                        : n.sentAt ? new Date(n.sentAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                      {" · "}{n.audience}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {n.scheduledFor ? (
                      <button type="button" onClick={() => cancel(n.id)}
                        className="text-xs px-2.5 py-1 rounded-lg font-medium"
                        style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
                        Annuler
                      </button>
                    ) : n.canceled ? (
                      <p className="text-[10px]" style={{ color: "var(--bt-text-3)" }}>Annulée</p>
                    ) : (
                      <>
                        <p className="font-num tabular-nums text-sm font-bold" style={{ color: "var(--bt-accent-dark)" }}>{n.successful}</p>
                        <p className="text-[10px]" style={{ color: "var(--bt-text-3)" }}>reçues</p>
                        {n.failed > 0 && <p className="text-[10px] mt-0.5" style={{ color: "#DC2626" }}>{n.failed} échec(s)</p>}
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Confirmation ───────────────────────────────────────── */}
      {confirming && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(3px)" }}
          onClick={() => !sending && setConfirming(false)}>
          <div className="card w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold" style={{ color: "var(--bt-text-1)" }}>
              {sendAfter ? "Programmer cet envoi ?" : "Envoyer maintenant ?"}
            </h3>
            <p className="text-sm mt-1" style={{ color: "var(--bt-text-2)" }}>
              Vers <strong>{audienceLabel}</strong>.{" "}
              {sendAfter
                ? `Partira le ${new Date(sendAfter).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}, annulable jusque-là.`
                : "L'envoi est immédiat et définitif."}
            </p>
            <div className="mt-3"><Preview title={title} message={message} /></div>
            <div className="flex gap-2 mt-4">
              <button className="btn-primary flex-1" disabled={sending} onClick={send}>
                {sending ? "…" : sendAfter ? "Programmer" : "Envoyer"}
              </button>
              <button className="btn-ghost px-4" disabled={sending} onClick={() => setConfirming(false)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
