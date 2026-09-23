import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { clearClientCache } from "../../lib/clientCache";
import { COURSE_COLOR_SEQUENCE } from "../../lib/courseColors";
import { newClientId } from "../../lib/timerDraft";
import {
  cleanCourseName,
  hasDuplicateCourse,
  nextCourseColor,
  normalizeCourseName,
  planCourseAdds,
} from "../../lib/onboarding.mjs";

const COLUMNS = "id,name,color,created_at,archived_at";

// The course list of the setup, optimistic and serial.
//
// A course appears the moment Enter is pressed — with its colour, in the list
// and in the sheet — and is written to the database behind it, one at a time,
// in the order typed. Each row carries a client id from the start: a retry
// after a lost response, or after a reload, upserts the same row instead of
// creating a second one (Phase 1 idempotency, kept in localStorage below).
// Every change goes through one ref, so a save finishing while another course
// is renamed can never overwrite it with a stale list.
//
// Row status: undefined = saved, "saving" = on its way, "failed" = to retry.

export default function useCourseSetup({ userId, t }) {
  const [courses, setCourses] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [flashId, setFlashId] = useState(null);
  const [announcement, setAnnouncement] = useState("");
  const listRef = useRef([]);
  const queueRef = useRef([]);
  const drainRef = useRef(null);
  const actionRef = useRef(null);
  const flashTimer = useRef(null);
  const draftKey = userId ? `bt_onboarding_course_draft_${userId}` : null;

  useEffect(() => () => clearTimeout(flashTimer.current), []);

  const update = useCallback((next) => {
    const value = typeof next === "function" ? next(listRef.current) : next;
    listRef.current = value;
    setCourses(value);
    return value;
  }, []);

  const reset = useCallback((rows) => {
    queueRef.current = [];
    update((rows || []).map(row => ({ ...row, status: undefined })));
  }, [update]);

  const say = useCallback((key, values) => {
    let text = t(key);
    for (const [name, value] of Object.entries(values)) text = text.replace(`{${name}}`, value);
    setAnnouncement(text);
  }, [t]);

  const flash = useCallback((id) => {
    clearTimeout(flashTimer.current);
    setFlashId(id);
    flashTimer.current = setTimeout(() => setFlashId(null), 700);
  }, []);

  const readDraft = useCallback(() => {
    if (!draftKey) return null;
    try { return JSON.parse(localStorage.getItem(draftKey) || "null"); } catch (_) { return null; }
  }, [draftKey]);

  const writeDraft = useCallback((row) => {
    if (!draftKey) return;
    try { localStorage.setItem(draftKey, JSON.stringify({ id: row.id, nameKey: normalizeCourseName(row.name) })); } catch (_) {}
  }, [draftKey]);

  const clearDraft = useCallback((id) => {
    if (!draftKey) return;
    try {
      const draft = JSON.parse(localStorage.getItem(draftKey) || "null");
      if (!id || draft?.id === id) localStorage.removeItem(draftKey);
    } catch (_) {}
  }, [draftKey]);

  const drain = useCallback(() => {
    if (drainRef.current) return drainRef.current;
    const run = (async () => {
      while (queueRef.current.length) {
        const id = queueRef.current[0];
        const row = listRef.current.find(course => course.id === id);
        if (!row) { queueRef.current.shift(); continue; }
        writeDraft(row);
        let saved = null;
        try {
          const { data, error } = await supabase
            .from("courses")
            .upsert({ id: row.id, user_id: userId, name: row.name, color: row.color }, { onConflict: "id" })
            .select(COLUMNS)
            .single();
          if (!error && data) saved = data;
        } catch (_) {}
        queueRef.current.shift();
        if (saved) {
          clearDraft(row.id);
          clearClientCache(`dashboard:${userId}:`);
          update(list => list.map(course => (course.id === row.id ? { ...saved, status: undefined } : course)));
        } else {
          update(list => list.map(course => (course.id === row.id ? { ...course, status: "failed" } : course)));
          setNotice({ tone: "error", text: t("onboarding.courses.saveError") });
        }
      }
    })().finally(() => { drainRef.current = null; });
    drainRef.current = run;
    return run;
  }, [userId, t, update, writeDraft, clearDraft]);

  // Typed or pasted names → rows at once, saves queued behind them.
  const add = useCallback((names) => {
    const { accepted, duplicate } = planCourseAdds(listRef.current, names);
    if (duplicate) {
      flash(duplicate.id);
      setNotice({ tone: "quiet", text: t("onboarding.courses.duplicate") });
      say("onboarding.courses.duplicate", {});
    }
    if (!accepted.length) return { added: 0, duplicate };

    const draft = readDraft();
    let list = listRef.current;
    const rows = accepted.map(name => {
      const reuse = draft?.id && draft.nameKey === normalizeCourseName(name) && !list.some(course => course.id === draft.id);
      const row = {
        id: reuse ? draft.id : newClientId(),
        name,
        color: nextCourseColor(list, COURSE_COLOR_SEQUENCE) || COURSE_COLOR_SEQUENCE[0],
        created_at: null,
        archived_at: null,
        status: "saving",
      };
      list = [...list, row];
      return row;
    });
    update(list);
    if (!duplicate) setNotice(null);
    queueRef.current.push(...rows.map(row => row.id));
    if (rows.length === 1) say("setup.courseAdded", { course: rows[0].name, n: list.length });
    else say("setup.courseAddedMany", { count: rows.length, n: list.length });
    drain();
    return { added: rows.length, duplicate };
  }, [drain, flash, readDraft, say, t, update]);

  const retry = useCallback((id) => {
    const row = listRef.current.find(course => course.id === id);
    if (!row || row.status !== "failed") return;
    update(list => list.map(course => (course.id === id ? { ...course, status: "saving" } : course)));
    queueRef.current.push(id);
    setNotice(null);
    drain();
  }, [drain, update]);

  // One edit at a time, on a course that is already saved.
  const act = useCallback(async (id, work) => {
    const row = listRef.current.find(course => course.id === id);
    if (!row || row.status || actionRef.current) return { ok: false };
    setBusyId(id);
    const run = (async () => {
      try { return await work(row); } finally { actionRef.current = null; setBusyId(null); }
    })();
    actionRef.current = run;
    return run;
  }, []);

  const rename = useCallback((id, raw) => {
    const name = cleanCourseName(raw);
    const row = listRef.current.find(course => course.id === id);
    if (!row) return Promise.resolve({ ok: false });
    if (!name) return Promise.resolve({ ok: false, error: t("setup.courseNameEmpty") });
    if (name === row.name) return Promise.resolve({ ok: true });
    if (hasDuplicateCourse(listRef.current, name, id)) {
      const twin = listRef.current.find(course => course.id !== id && normalizeCourseName(course.name) === normalizeCourseName(name));
      if (twin) flash(twin.id);
      return Promise.resolve({ ok: false, error: t("onboarding.courses.duplicate") });
    }
    return act(id, async () => {
      try {
        const { data, error } = await supabase
          .from("courses").update({ name }).eq("id", id).eq("user_id", userId)
          .select(COLUMNS).single();
        if (error || !data) throw error || new Error("course_update_failed");
        update(list => list.map(course => (course.id === id ? { ...course, ...data, status: undefined } : course)));
        clearClientCache(`dashboard:${userId}:`);
        setNotice(null);
        return { ok: true };
      } catch (_) {
        setNotice({ tone: "error", text: t("onboarding.courses.saveError") });
        return { ok: false };
      }
    });
  }, [act, flash, t, update, userId]);

  const recolor = useCallback((id, color) => act(id, async (row) => {
    if (row.color === color) return { ok: true };
    try {
      const { error } = await supabase.from("courses").update({ color }).eq("id", id).eq("user_id", userId);
      if (error) throw error;
      update(list => list.map(course => (course.id === id ? { ...course, color } : course)));
      clearClientCache(`dashboard:${userId}:`);
      setNotice(null);
      return { ok: true };
    } catch (_) {
      setNotice({ tone: "error", text: t("onboarding.courses.saveError") });
      return { ok: false };
    }
  }), [act, t, update, userId]);

  const remove = useCallback((id) => {
    const row = listRef.current.find(course => course.id === id);
    if (!row || row.status === "saving") return Promise.resolve({ ok: false });
    // A course whose save failed may still exist on the server (response
    // lost), so it is deleted there too before leaving the list.
    const work = async () => {
      try {
        const { error } = await supabase.from("courses").delete().eq("id", id).eq("user_id", userId);
        if (error) throw error;
        const list = update(current => current.filter(course => course.id !== id));
        queueRef.current = queueRef.current.filter(queued => queued !== id);
        clearDraft(id);
        clearClientCache(`dashboard:${userId}:`);
        setNotice(null);
        say("setup.courseRemoved", { course: row.name, n: list.length });
        return { ok: true };
      } catch (_) {
        setNotice({ tone: "error", text: t("onboarding.courses.removeError") });
        return { ok: false };
      }
    };
    if (row.status === "failed") {
      if (actionRef.current) return Promise.resolve({ ok: false });
      setBusyId(id);
      const run = work().finally(() => { actionRef.current = null; setBusyId(null); });
      actionRef.current = run;
      return run;
    }
    return act(id, work);
  }, [act, clearDraft, say, t, update, userId]);

  // Before leaving: failed rows get one more try, then every write in flight
  // has to land. Returns the list as the server now has it.
  const flush = useCallback(async () => {
    const failed = listRef.current.filter(course => course.status === "failed").map(course => course.id);
    if (failed.length) {
      update(list => list.map(course => (course.status === "failed" ? { ...course, status: "saving" } : course)));
      queueRef.current.push(...failed);
    }
    if (actionRef.current) await actionRef.current.catch(() => {});
    await drain();
    return listRef.current;
  }, [drain, update]);

  const clearNotice = useCallback(() => setNotice(current => (current?.tone === "quiet" ? null : current)), []);

  return {
    courses,
    busyId,
    notice,
    flashId,
    announcement,
    announce: setAnnouncement,
    nextColor: nextCourseColor(courses, COURSE_COLOR_SEQUENCE) || COURSE_COLOR_SEQUENCE[0],
    reset,
    add,
    retry,
    rename,
    recolor,
    remove,
    flush,
    clearNotice,
    setNotice,
  };
}
