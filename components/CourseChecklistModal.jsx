import { useEffect, useState, useCallback, useRef } from "react";
import Glyph from "./Glyph";
import { supabase } from "../lib/supabaseClient";
import { useI18n } from "../contexts/I18nContext";

// Modale réutilisable (Planning + Chrono) : checklist de révision d'un cours.
// Props : course {id, name, color}, userId, onClose, onChanged(), onEdit().
const FOCUSABLE_SELECTOR = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])";

export default function CourseChecklistModal({ course, userId, onClose, onChanged, onEdit }) {
  const { t } = useI18n();
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy]         = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText]   = useState("");
  const dialogRef = useRef(null);
  const openerRef = useRef(null);

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

  useEffect(() => {
    openerRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus({ preventScroll: true });

    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR));
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus?.({ preventScroll: true });
    };
  }, [onClose]);

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
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="course-checklist-title" className="bt-dashboard-readable card w-full sm:max-w-md rounded-t-3xl sm:rounded-[22px] max-h-[85vh] overflow-y-auto focus:outline-none">
        <div className="p-5">
          {/* Header */}
          <div className="mb-0.5 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: course.color }} />
              <h2 id="course-checklist-title" className="text-base font-semibold truncate" style={{ color: "var(--bt-text-1)" }}>{course.name}</h2>
            </div>
            <div className="-mr-2 -mt-2 flex shrink-0 items-center gap-1">
              {onEdit && (
                <button type="button" onClick={onEdit} className="bt-dashboard-control flex h-11 w-11 items-center justify-center rounded-xl" style={{ color: "var(--bt-text-2)" }} aria-label={t("courseEditor.edit")} title={t("courseEditor.edit")}>
                  <Glyph size={16}>
                    <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z" />
                  </Glyph>
                </button>
              )}
              <button type="button" onClick={onClose} className="bt-dashboard-control flex h-11 w-11 items-center justify-center rounded-xl" style={{ color: "var(--bt-text-2)" }} aria-label={t("common.close")}>
                <Glyph size={17}>
                  <path d="M18 6 6 18M6 6l12 12" />
                </Glyph>
              </button>
            </div>
          </div>
          <p className="text-xs mb-3" style={{ color: "var(--bt-text-3)" }}>{t("checklist.title")}</p>

          {/* Progress */}
          <div className="mb-4">
            <div className="flex justify-between text-xs mb-1.5" style={{ color: "var(--bt-text-2)" }}>
              <span className="font-medium">{done}/{total} {t("checklist.tasks")}</span>
              <span className="font-semibold" style={{ color: "var(--bt-accent-text)" }}>{pct}%</span>
            </div>
            <div className="w-full h-2 rounded-full overflow-hidden" role="progressbar" aria-label={t("checklist.title")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} style={{ backgroundColor: "var(--bt-subtle)" }}>
              <div className="h-full origin-left rounded-full transition-transform duration-500 motion-reduce:transition-none" style={{ transform: `scaleX(${pct / 100})`, backgroundColor: "#14B885" }} />
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
                  <button type="button" onClick={() => toggle(item)}
                    className="bt-dashboard-control -my-2 -ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                    aria-label={item.is_done ? t("checklist.markUndone") : t("checklist.markDone")} aria-pressed={item.is_done}>
                    <span className="flex h-5 w-5 items-center justify-center rounded-md" style={{ backgroundColor: item.is_done ? "var(--bt-action)" : "transparent", border: item.is_done ? "1px solid var(--bt-action)" : "1.5px solid var(--bt-border)" }}>
                      {item.is_done && (
                        <Glyph size={11} strokeWidth={3.5} style={{ color: "#fff" }}>
                          <polyline points="20 6 9 17 4 12"/>
                        </Glyph>
                      )}
                    </span>
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
                  <button type="button" onClick={() => remove(item)}
                    className="bt-checklist-remove bt-dashboard-control -my-2 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl opacity-70 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                    style={{ color: "var(--bt-text-4)" }}
                    aria-label={t("common.remove")}>
                    <Glyph size={13}>
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </Glyph>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button type="button" onClick={onClose} className="btn-ghost w-full mt-4">{t("common.close")}</button>
        </div>
      </div>
    </div>
  );
}
