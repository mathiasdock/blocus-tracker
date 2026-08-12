// Réglages des notifications automatiques — onglet Communication de l'admin.
//
// Chaque carte dit D'ABORD quand la notification part : c'est l'information
// qui manque quand on découvre qu'une app envoie des choses toute seule. Le
// texte n'est modifiable qu'ensuite, une fois le déclencheur compris.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const MAX_TITLE = 60;
const MAX_BODY = 160;

function humanError(raw) {
  const m = String(raw || "");
  if (/Server misconfigured/i.test(m)) return "Configuration serveur incomplète.";
  if (/Forbidden/i.test(m)) return "Ton compte n'a pas les droits admin.";
  if (/Unauthorized/i.test(m)) return "Session expirée — recharge la page.";
  if (/relation .*push_automations.* does not exist/i.test(m)) {
    return "La migration v42 n'a pas encore été exécutée dans Supabase.";
  }
  return m || "Une erreur est survenue.";
}

function Row({ item, onSaved }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => ({
    enabled: item.current.enabled,
    titleFr: item.current.title.fr, bodyFr: item.current.body.fr,
    titleEn: item.current.title.en, bodyEn: item.current.body.en,
    url: item.current.url || "",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function save(patch = {}) {
    setBusy(true); setError(""); setSaved(false);
    const next = { ...form, ...patch };
    try {
      const { data: s } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/push-automations", {
        method: "PUT",
        headers: { Authorization: `Bearer ${s?.session?.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ key: item.key, ...next }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Requête refusée.");
      setForm(next); setSaved(true); onSaved?.();
      setTimeout(() => setSaved(false), 2500);
    } catch (e) { setError(humanError(e.message)); }
    finally { setBusy(false); }
  }

  const modifie = form.titleFr !== item.defaults.title.fr || form.bodyFr !== item.defaults.body.fr;

  return (
    <li className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--bt-subtle)" }}>
      <div className="flex items-start gap-3 p-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold" style={{ color: "var(--bt-text-1)" }}>{item.label.fr}</span>
            {!form.enabled && (
              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: "var(--bt-border)", color: "var(--bt-text-3)" }}>Coupée</span>
            )}
            {modifie && (
              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)" }}>Modifiée</span>
            )}
          </div>
          <p className="text-[11px] mt-0.5 leading-snug" style={{ color: "var(--bt-text-3)" }}>{item.trigger.fr}</p>
          <p className="text-xs mt-1.5" style={{ color: "var(--bt-text-2)" }}>
            <strong>{form.titleFr}</strong> — {form.bodyFr}
          </p>
        </div>

        {/* Couper est le geste le plus fréquent : accessible sans déplier. */}
        <button type="button" role="switch" aria-checked={form.enabled} disabled={busy}
          aria-label={`${form.enabled ? "Couper" : "Réactiver"} ${item.label.fr}`}
          onClick={() => save({ enabled: !form.enabled })}
          className="shrink-0 rounded-full transition-colors"
          style={{ width: 42, height: 24, padding: 3, backgroundColor: form.enabled ? "#14B885" : "var(--bt-border)" }}>
          <span className="block rounded-full transition-transform"
            style={{ width: 18, height: 18, backgroundColor: "#fff", transform: form.enabled ? "translateX(18px)" : "none" }} />
        </button>
      </div>

      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full text-left px-3.5 pb-3 text-[11px] font-medium"
        style={{ color: "var(--bt-accent-dark)" }}>
        {open ? "Fermer" : "Modifier le texte"}
      </button>

      {open && (
        <div className="px-3.5 pb-3.5 space-y-3" style={{ borderTop: "1px solid var(--bt-border)", paddingTop: 12 }}>
          {item.vars.length > 0 && (
            <p className="text-[11px] leading-snug" style={{ color: "var(--bt-text-3)" }}>
              Garde {item.vars.join(", ")} dans le message : remplacé à l'envoi par le prénom réel.
            </p>
          )}
          <div>
            <label className="label">Titre</label>
            <input className="input" maxLength={MAX_TITLE} value={form.titleFr}
              onChange={e => setForm(f => ({ ...f, titleFr: e.target.value }))} />
          </div>
          <div>
            <label className="label">Message</label>
            <textarea className="input" rows={2} maxLength={MAX_BODY} value={form.bodyFr}
              onChange={e => setForm(f => ({ ...f, bodyFr: e.target.value }))} />
          </div>
          <div>
            <label className="label">Page ouverte</label>
            <input className="input" value={form.url}
              onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="/dashboard" />
          </div>
          <details>
            <summary className="text-[11px] cursor-pointer" style={{ color: "var(--bt-text-3)" }}>
              Version anglaise (facultative)
            </summary>
            <div className="space-y-3 mt-2">
              <input className="input" maxLength={MAX_TITLE} value={form.titleEn}
                onChange={e => setForm(f => ({ ...f, titleEn: e.target.value }))} placeholder="Title" />
              <textarea className="input" rows={2} maxLength={MAX_BODY} value={form.bodyEn}
                onChange={e => setForm(f => ({ ...f, bodyEn: e.target.value }))} placeholder="Message" />
            </div>
          </details>

          {error && <p className="text-xs" style={{ color: "#DC2626" }} role="alert">{error}</p>}
          <div className="flex items-center gap-2">
            <button className="btn-primary px-4 py-2 text-sm" disabled={busy} onClick={() => save()}>
              {busy ? "…" : "Enregistrer"}
            </button>
            <button className="btn-ghost px-3 py-2 text-xs" disabled={busy}
              onClick={() => save({
                titleFr: item.defaults.title.fr, bodyFr: item.defaults.body.fr,
                titleEn: item.defaults.title.en, bodyEn: item.defaults.body.en,
                url: item.defaults.url,
              })}>
              Texte d'origine
            </button>
            {saved && <span className="text-xs" style={{ color: "var(--bt-accent-dark)" }}>Enregistré</span>}
          </div>
        </div>
      )}
    </li>
  );
}

export default function PushAutomations() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const { data: s } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/push-automations", {
        headers: { Authorization: `Bearer ${s?.session?.access_token}` },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Requête refusée.");
      setItems(payload.automations || []);
    } catch (e) { setError(humanError(e.message)); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <section className="card p-5">
      <h2 className="text-base font-semibold" style={{ color: "var(--bt-text-1)" }}>Notifications automatiques</h2>
      <p className="text-[11px] mt-1 mb-4 leading-snug" style={{ color: "var(--bt-text-3)" }}>
        Celles que l'app envoie seule, sans que tu fasses quoi que ce soit. Tu peux en couper une,
        ou en reformuler le texte — le déclencheur, lui, reste fixé par le code.
      </p>

      {error && <p className="text-sm" style={{ color: "#DC2626" }} role="alert">{error}</p>}
      {!items && !error && <p className="text-sm" style={{ color: "var(--bt-text-3)" }}>Chargement…</p>}

      {items && (
        <ul className="space-y-2">
          {items.map(it => <Row key={it.key} item={it} onSaved={load} />)}
        </ul>
      )}
    </section>
  );
}
