import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { useI18n } from "../contexts/I18nContext";

// Modale réutilisable (Planning + Chrono) : checklist de révision d'un cours.
// Props : course {id, name, color}, userId, onClose, onChanged().
export default function CourseChecklistModal({ course, userId, onClose, onChanged }) {
  const { t } = useI18n();
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy]         = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText]   = useState("");

  const load = useCallback(async () => {
    if (!course || !userId) return;
    setLoading(true);
    const { data } = await supabase
      .from("course_checklist_items")
      .select("*")
      .eq("user_id", userId)
      .eq("course_id", course.id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    setItems(data || []);
    setLoading(false);
  }, [course, userId]);

  useEffect(() => { load(); }, [load]);

  async function addItem(e) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title || busy) return;
    setBusy(true);
    const position = items.length ? Math.max(...items.map(i => i.position || 0)) + 1 : 0;
    const { data, error } = await supabase
      .from("course_checklist_items")
      .insert({ user_id: userId, course_id: course.id, title, position })
      .select()
      .maybeSingle();
    setBusy(false);
    if (error) return;
    if (data) setItems(prev => [...prev, data]);
    setNewTitle("");
    onChanged?.();
  }

  async function toggle(item) {
    const next = !item.is_done;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_done: next } : i));
    const { error } = await supabase.from("course_checklist_items").update({ is_done: next }).eq("id", item.id);
    if (error) { setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_done: item.is_done } : i)); return; }
    onChanged?.();
  }

  async function remove(item) {
    setItems(prev => prev.filter(i => i.id !== item.id));
    await supabase.from("course_checklist_items").delete().eq("id", item.id);
    onChanged?.();
  }

  function startEdit(item) { setEditingId(item.id); setEditText(item.title); }

  async function saveEdit(item) {
    const title = editText.trim();
    setEditingId(null);
    if (!title || title === item.title) return;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, title } : i));
    await supabase.from("course_checklist_items").update({ title }).eq("id", item.id);
    onChanged?.();
  }

  const done  = items.filter(i => i.is_done).length;
  const total = items.length;
  const pct   = total ? Math.round(done / total * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }} onClick={onClose}>
      <div className="card w-full sm:max-w-md rounded-t-3xl sm:rounded-[22px] max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="p-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-0.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: course.color }} />
              <h2 className="text-base font-semibold truncate" style={{ color: "var(--bt-text-1)" }}>{course.name}</h2>
            </div>
            <button onClick={onClose} className="shrink-0 text-xl leading-none" style={{ color: "var(--bt-text-3)" }}
              aria-label={t("common.close")}>✕</button>
          </div>
          <p className="text-xs mb-3" style={{ color: "var(--bt-text-3)" }}>{t("checklist.title")}</p>

          {/* Progress */}
          <div className="mb-4">
            <div className="flex justify-between text-xs mb-1.5" style={{ color: "var(--bt-text-2)" }}>
              <span className="font-medium">{done}/{total} {t("checklist.tasks")}</span>
              <span className="font-semibold" style={{ color: "#14B885" }}>{pct}%</span>
            </div>
            <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--bt-subtle)" }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: "#14B885" }} />
            </div>
          </div>

          {/* Add */}
          <form onSubmit={addItem} className="flex gap-2 mb-3">
            <input className="input" value={newTitle} maxLength={200}
              onChange={e => setNewTitle(e.target.value)} placeholder={t("checklist.addPlaceholder")} />
            <button type="submit" disabled={busy || !newTitle.trim()} className="btn-primary shrink-0">
              {t("checklist.add")}
            </button>
          </form>

          {/* List */}
          {loading ? (
            <p className="text-sm py-4 text-center" style={{ color: "var(--bt-text-3)" }}>…</p>
          ) : items.length === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: "var(--bt-text-3)" }}>{t("checklist.empty")}</p>
          ) : (
            <ul className="space-y-1.5">
              {items.map(item => (
                <li key={item.id} className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 group"
                  style={{ backgroundColor: "var(--bt-subtle)" }}>
                  <button onClick={() => toggle(item)}
                    className="shrink-0 w-5 h-5 rounded-md flex items-center justify-center transition-colors"
                    style={{
                      backgroundColor: item.is_done ? "#14B885" : "transparent",
                      border: item.is_done ? "1px solid #14B885" : "1.5px solid var(--bt-border)",
                    }}
                    aria-label={t("checklist.toggle")}>
                    {item.is_done && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </button>
                  {editingId === item.id ? (
                    <input autoFocus className="input flex-1 py-1" value={editText} maxLength={200}
                      onChange={e => setEditText(e.target.value)}
                      onBlur={() => saveEdit(item)}
                      onKeyDown={e => { if (e.key === "Enter") saveEdit(item); if (e.key === "Escape") setEditingId(null); }} />
                  ) : (
                    <span onClick={() => startEdit(item)}
                      className="flex-1 text-sm cursor-text break-words"
                      style={{ color: item.is_done ? "var(--bt-text-3)" : "var(--bt-text-1)", textDecoration: item.is_done ? "line-through" : "none" }}>
                      {item.title}
                    </span>
                  )}
                  <button onClick={() => remove(item)}
                    className="shrink-0 transition-colors opacity-60 sm:opacity-0 sm:group-hover:opacity-100"
                    style={{ color: "var(--bt-text-4)" }}
                    onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
                    onMouseLeave={e => e.currentTarget.style.color = "var(--bt-text-4)"}
                    aria-label={t("common.remove")}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button onClick={onClose} className="btn-ghost w-full mt-4">{t("common.close")}</button>
        </div>
      </div>
    </div>
  );
}
