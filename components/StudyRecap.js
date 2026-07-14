import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;
const INK = "#0B2E23";
const INK_SOFT = "#123D31";
const CREAM = "#F7F3ED";
const MUTED = "#9FD7C1";
const GREEN = "#14B885";
const AMBER = "#F3B64A";
const TEXT = "#1F1A17";

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function periodDates(period) {
  const count = period === "month" ? 30 : 7;
  return Array.from({ length: count }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (count - 1 - index));
    return date;
  });
}

function formatStoryDuration(seconds) {
  const totalMinutes = Math.max(0, Math.round(Number(seconds || 0) / 60));
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} h ${String(minutes).padStart(2, "0")}` : `${hours} h`;
}

function formatPeriod(dates, lang) {
  const locale = lang === "en" ? "en-GB" : "fr-FR";
  const start = dates[0];
  const end = dates[dates.length - 1];
  const startLabel = start.toLocaleDateString(locale, { day: "numeric", month: "short" });
  const endLabel = end.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  return `${startLabel} — ${endLabel}`;
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function fillRoundedRect(ctx, x, y, width, height, radius, color) {
  roundedRect(ctx, x, y, width, height, radius);
  ctx.fillStyle = color;
  ctx.fill();
}

function strokeRoundedRect(ctx, x, y, width, height, radius, color, lineWidth = 1) {
  roundedRect(ctx, x, y, width, height, radius);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function setFont(ctx, weight, size, family = "Bricolage Grotesque") {
  ctx.font = `${weight} ${size}px "${family}", Arial, sans-serif`;
}

function fittedFont(ctx, text, maxWidth, startSize, minSize, weight = 700, family) {
  let size = startSize;
  setFont(ctx, weight, size, family);
  while (ctx.measureText(text).width > maxWidth && size > minSize) {
    size -= 2;
    setFont(ctx, weight, size, family);
  }
  return size;
}

function drawBrandMark(ctx, x, y) {
  ctx.save();
  ctx.strokeStyle = GREEN;
  ctx.fillStyle = GREEN;
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(x + 29, y + 29, 22, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 29, y + 29);
  ctx.lineTo(x + 42, y + 16);
  ctx.stroke();
  ctx.fillRect(x + 23, y, 12, 8);
  ctx.restore();
}

function drawMetric(ctx, x, y, width, label, value, accent) {
  fillRoundedRect(ctx, x, y, width, 224, 8, "rgba(255,255,255,0.045)");
  strokeRoundedRect(ctx, x, y, width, 224, 8, "rgba(255,255,255,0.12)", 2);
  ctx.fillStyle = accent;
  ctx.fillRect(x + 26, y + 28, 42, 7);
  ctx.fillStyle = MUTED;
  setFont(ctx, 700, 25);
  ctx.fillText(label, x + 26, y + 76);
  ctx.fillStyle = CREAM;
  fittedFont(ctx, value, width - 52, 78, 50, 700, "Space Grotesk");
  ctx.fillText(value, x + 26, y + 170);
}

function drawStory(canvas, recap, copy, lang) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  canvas.width = STORY_WIDTH;
  canvas.height = STORY_HEIGHT;

  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);

  // Texture très légère et déterministe : de la matière, jamais un asset réseau.
  ctx.fillStyle = "rgba(255,255,255,0.025)";
  for (let i = 0; i < 150; i += 1) {
    const x = (i * 137 + 47) % STORY_WIDTH;
    const y = (i * 233 + 91) % 1620;
    ctx.fillRect(x, y, 2 + (i % 3), 2 + (i % 3));
  }

  drawBrandMark(ctx, 72, 72);
  ctx.fillStyle = CREAM;
  setFont(ctx, 700, 43);
  ctx.fillText("blocus·tracker", 144, 116);

  fillRoundedRect(ctx, 774, 73, 234, 58, 29, GREEN);
  ctx.fillStyle = INK;
  setFont(ctx, 800, 23);
  ctx.textAlign = "center";
  ctx.fillText(copy.storyLabel, 891, 110);
  ctx.textAlign = "left";

  ctx.fillStyle = MUTED;
  setFont(ctx, 700, 28);
  ctx.fillText(recap.periodLabel.toUpperCase(), 72, 228);
  ctx.fillStyle = GREEN;
  ctx.fillRect(72, 270, 74, 8);

  ctx.fillStyle = CREAM;
  setFont(ctx, 700, 35);
  ctx.fillText(recap.period === "month" ? copy.storyMonth : copy.storyWeek, 72, 356);
  ctx.fillStyle = MUTED;
  setFont(ctx, 700, 25);
  ctx.fillText(copy.storyStudied, 74, 421);

  ctx.fillStyle = CREAM;
  fittedFont(ctx, recap.totalLabel, 936, 182, 106, 700, "Space Grotesk");
  ctx.fillText(recap.totalLabel, 68, 610);

  const sentence = recap.totalSeconds <= 0
    ? copy.storyFreshStart
    : recap.activeDays >= Math.ceil(recap.dayCount / 2)
      ? copy.storyConsistency
      : copy.storyEveryBlock;
  ctx.fillStyle = recap.totalSeconds > 0 ? GREEN : MUTED;
  setFont(ctx, 700, 29);
  ctx.fillText(sentence, 74, 688);

  // Rythme d'étude : le graphique reste lisible en semaine comme sur 30 jours.
  fillRoundedRect(ctx, 72, 760, 936, 330, 8, INK_SOFT);
  ctx.fillStyle = MUTED;
  setFont(ctx, 700, 25);
  ctx.fillText(copy.storyRhythm, 104, 812);
  const values = recap.series.map((item) => item.seconds);
  const max = Math.max(...values, 1);
  const chartX = 104;
  const chartY = 860;
  const chartW = 872;
  const chartH = 158;
  const gap = recap.period === "month" ? 7 : 20;
  const barW = (chartW - gap * (values.length - 1)) / values.length;
  recap.series.forEach((item, index) => {
    const height = item.seconds > 0 ? Math.max(12, (item.seconds / max) * chartH) : 5;
    const x = chartX + index * (barW + gap);
    const y = chartY + chartH - height;
    fillRoundedRect(ctx, x, y, barW, height, Math.min(4, barW / 2), item.seconds === max && item.seconds > 0 ? AMBER : GREEN);
    if (recap.period === "week" || index === 0 || index === 9 || index === 19 || index === 29) {
      ctx.fillStyle = MUTED;
      setFont(ctx, 600, recap.period === "month" ? 17 : 21, "Space Grotesk");
      ctx.textAlign = "center";
      ctx.fillText(item.label, x + barW / 2, 1058);
    }
  });
  ctx.textAlign = "left";

  const metricWidth = 290;
  drawMetric(ctx, 72, 1142, metricWidth, copy.storyStreak, `${recap.streak} ${copy.dayShort}`, AMBER);
  drawMetric(ctx, 395, 1142, metricWidth, copy.storyRank, recap.rankLabel, GREEN);
  drawMetric(ctx, 718, 1142, metricWidth, copy.storyActiveDays, `${recap.activeDays}/${recap.dayCount}`, "#7DB7FF");

  ctx.fillStyle = MUTED;
  setFont(ctx, 700, 24);
  ctx.fillText(copy.storyBestBlock, 74, 1455);
  ctx.fillStyle = CREAM;
  setFont(ctx, 700, 48, "Space Grotesk");
  ctx.fillText(recap.longestLabel, 74, 1518);

  if (recap.topCourse) {
    ctx.fillStyle = MUTED;
    setFont(ctx, 700, 24);
    ctx.fillText(copy.storyTopCourse, 530, 1455);
    ctx.fillStyle = CREAM;
    fittedFont(ctx, recap.topCourse, 476, 45, 28, 700);
    ctx.fillText(recap.topCourse, 530, 1518);
  }

  // Bande signature claire : contraste avec le vert et lecture immédiate en story.
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 1620, STORY_WIDTH, 300);
  ctx.fillStyle = TEXT;
  setFont(ctx, 700, 38);
  ctx.fillText(`@${recap.pseudo || "student"}`, 72, 1710);
  ctx.fillStyle = "#5F5751";
  setFont(ctx, 600, 27);
  ctx.fillText(copy.footerLine, 72, 1765);

  ctx.fillStyle = TEXT;
  setFont(ctx, 700, 31);
  ctx.fillText("blocus-tracker.com", 72, 1850);
  ctx.fillStyle = GREEN;
  ctx.fillRect(762, 1817, 246, 8);
  ctx.fillStyle = TEXT;
  setFont(ctx, 700, 25);
  ctx.textAlign = "right";
  ctx.fillText(copy.footerTag, 1008, 1850);
  ctx.textAlign = "left";
}

function buildRecap({ period, sessions, courses, streak, pseudo, rank, lang }) {
  const dates = periodDates(period);
  const dateSet = new Set(dates.map(dateKey));
  const selected = sessions.filter((session) => dateSet.has((session.started_at || "").slice(0, 10)));
  const totalSeconds = selected.reduce((sum, session) => sum + Number(session.duration_seconds || 0), 0);
  const totalsByDate = {};
  const totalsByCourse = {};
  selected.forEach((session) => {
    const day = (session.started_at || "").slice(0, 10);
    totalsByDate[day] = (totalsByDate[day] || 0) + Number(session.duration_seconds || 0);
    if (session.course_id) {
      totalsByCourse[session.course_id] = (totalsByCourse[session.course_id] || 0) + Number(session.duration_seconds || 0);
    }
  });
  const courseMap = Object.fromEntries(courses.map((course) => [course.id, course.name]));
  const topCourseId = Object.entries(totalsByCourse).sort((a, b) => b[1] - a[1])[0]?.[0];
  const locale = lang === "en" ? "en-GB" : "fr-FR";

  return {
    period,
    periodLabel: formatPeriod(dates, lang),
    pseudo,
    totalSeconds,
    totalLabel: formatStoryDuration(totalSeconds),
    dayCount: dates.length,
    activeDays: Object.keys(totalsByDate).length,
    streak: Number(streak || 0),
    rankLabel: rank === undefined ? "…" : rank == null ? "—" : typeof rank === "number" ? `#${rank}` : String(rank),
    longestLabel: formatStoryDuration(Math.max(0, ...selected.map((session) => Number(session.duration_seconds || 0)))),
    topCourse: topCourseId ? courseMap[topCourseId] || null : null,
    series: dates.map((date) => ({
      seconds: totalsByDate[dateKey(date)] || 0,
      label: period === "week"
        ? date.toLocaleDateString(locale, { weekday: "short" }).replace(".", "").slice(0, 2).toUpperCase()
        : String(date.getDate()).padStart(2, "0"),
    })),
  };
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("canvas_export_failed")), "image/png", 1);
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ShareIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/></svg>;
}

function DownloadIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>;
}

export default function StudyRecap({ sessions = [], courses = [], streak = 0, profile, userId, lang, t }) {
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState("week");
  const [rankByPeriod, setRankByPeriod] = useState({});
  const [rankLoading, setRankLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState("");
  const canvasRef = useRef(null);

  const copy = useMemo(() => ({
    storyLabel: t("stats.recapStoryLabel"),
    storyWeek: t("stats.recapStoryWeek"),
    storyMonth: t("stats.recapStoryMonth"),
    storyStudied: t("stats.recapStoryStudied"),
    storyRhythm: t("stats.recapStoryRhythm"),
    storyStreak: t("stats.recapStoryStreak"),
    storyRank: t("stats.recapStoryRank"),
    storyActiveDays: t("stats.recapStoryActiveDays"),
    storyBestBlock: t("stats.recapStoryBestBlock"),
    storyTopCourse: t("stats.recapStoryTopCourse"),
    storyConsistency: t("stats.recapStoryConsistency"),
    storyEveryBlock: t("stats.recapStoryEveryBlock"),
    storyFreshStart: t("stats.recapStoryFreshStart"),
    dayShort: t("stats.recapDayShort"),
    footerLine: t("stats.recapFooterLine"),
    footerTag: t("stats.recapFooterTag"),
  }), [t]);

  const rank = Object.prototype.hasOwnProperty.call(rankByPeriod, period) ? rankByPeriod[period] : undefined;
  const recap = useMemo(() => buildRecap({
    period,
    sessions,
    courses,
    streak,
    pseudo: profile?.pseudo,
    rank,
    lang,
  }), [period, sessions, courses, streak, profile?.pseudo, rank, lang]);

  useEffect(() => {
    if (!open || !userId || Object.prototype.hasOwnProperty.call(rankByPeriod, period)) return;
    let active = true;
    setRankLoading(true);
    (async () => {
      const { data, error } = await supabase.rpc("get_leaderboard_v2", {
        p_period: period,
        p_metric: "time",
        p_scope: "all",
        p_university: null,
        p_study_field: null,
        p_study_year: null,
      });
      if (!active) return;
      let nextRank = null;
      if (!error && Array.isArray(data)) {
        const index = data.findIndex((row) => row.user_id === userId);
        nextRank = index >= 0 ? index + 1 : (recap.totalSeconds > 0 ? "50+" : null);
      }
      setRankByPeriod((current) => ({ ...current, [period]: nextRank }));
      setRankLoading(false);
    })();
    return () => { active = false; };
  }, [open, userId, period, rankByPeriod, recap.totalSeconds]);

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    let active = true;
    (async () => {
      try {
        await document.fonts?.ready;
        await document.fonts?.load('700 80px "Bricolage Grotesque"');
        await document.fonts?.load('700 80px "Space Grotesk"');
      } catch (_) {}
      if (active) drawStory(canvasRef.current, recap, copy, lang);
    })();
    return () => { active = false; };
  }, [open, recap, copy, lang]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event) => { if (event.key === "Escape") setOpen(false); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function prepareBlob() {
    if (!canvasRef.current) throw new Error("missing_canvas");
    drawStory(canvasRef.current, recap, copy, lang);
    return canvasBlob(canvasRef.current);
  }

  async function download() {
    setExporting(true);
    setStatus("");
    try {
      const blob = await prepareBlob();
      downloadBlob(blob, `blocus-recap-${period}.png`);
      setStatus(t("stats.recapDownloaded"));
    } catch (_) {
      setStatus(t("stats.recapError"));
    } finally {
      setExporting(false);
    }
  }

  async function share() {
    setExporting(true);
    setStatus("");
    try {
      const blob = await prepareBlob();
      const file = new File([blob], `blocus-recap-${period}.png`, { type: "image/png" });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({
          files: [file],
          title: t("stats.recapShareTitle"),
          text: t("stats.recapShareText"),
        });
        setStatus(t("stats.recapShared"));
      } else {
        downloadBlob(blob, file.name);
        setStatus(t("stats.recapShareFallback"));
      }
    } catch (error) {
      if (error?.name !== "AbortError") setStatus(t("stats.recapError"));
    } finally {
      setExporting(false);
    }
  }

  const totalLabel = formatStoryDuration(recap.totalSeconds);
  const isWeekEnd = new Date().getDay() === 0;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isMonthEnd = tomorrow.getMonth() !== new Date().getMonth();
  const isReady = period === "week" ? isWeekEnd : isMonthEnd;

  return (
    <>
      <section className="card mb-4 overflow-hidden" aria-labelledby="study-recap-title">
        <div className="grid grid-cols-[1fr_112px] sm:grid-cols-[1fr_152px] min-h-[196px] sm:min-h-[222px]">
          <div className="p-5 sm:p-6 flex flex-col items-start justify-center min-w-0">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)" }}><ShareIcon /></span>
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--bt-text-3)" }}>{t("stats.recapEyebrow")}</span>
            </div>
            <h2 id="study-recap-title" className="text-lg sm:text-xl font-semibold leading-tight" style={{ color: "var(--bt-text-1)" }}>{t("stats.recapTitle")}</h2>
            <p className="text-xs sm:text-sm mt-1.5 max-w-md" style={{ color: "var(--bt-text-2)" }}>{t("stats.recapSubtitle")}</p>
            <div className="flex items-center gap-2 mt-4 flex-wrap">
              <button onClick={() => setOpen(true)} className="btn-primary inline-flex items-center gap-2 text-sm">
                <ShareIcon />
                {t("stats.recapOpen")}
              </button>
              <span className="text-[10px] font-semibold" style={{ color: isReady ? "var(--bt-accent-dark)" : "var(--bt-text-3)" }}>
                {isReady ? t("stats.recapReady") : t("stats.recapLive")}
              </span>
            </div>
          </div>

          <div className="relative overflow-hidden flex items-center justify-center" style={{ backgroundColor: INK }} aria-hidden="true">
            <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: GREEN }} />
            <div className="w-[78px] sm:w-[104px] aspect-[9/16] border flex flex-col justify-between p-2.5 sm:p-3" style={{ backgroundColor: INK_SOFT, borderColor: "rgba(255,255,255,0.12)", borderRadius: 6 }}>
              <div>
                <span className="block h-1 w-5" style={{ backgroundColor: GREEN }} />
                <span className="block text-[5px] sm:text-[7px] font-bold tracking-wider mt-2" style={{ color: MUTED }}>{t("stats.recapStoryStudied")}</span>
                <span className="block text-[13px] sm:text-[19px] font-num font-bold mt-0.5" style={{ color: CREAM }}>{totalLabel}</span>
              </div>
              <div className="grid grid-cols-3 items-end gap-1 h-9 sm:h-12">
                {[38, 72, 52].map((height, index) => <span key={index} style={{ height: `${height}%`, backgroundColor: index === 1 ? AMBER : GREEN, borderRadius: 2 }} />)}
              </div>
              <div className="h-4 -mx-2.5 -mb-2.5 sm:-mx-3 sm:-mb-3 px-2 flex items-center text-[5px] sm:text-[6px] font-bold" style={{ backgroundColor: CREAM, color: TEXT }}>@{profile?.pseudo || "student"}</div>
            </div>
          </div>
        </div>
      </section>

      {open && (
        <div className="fixed inset-0 z-[100] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="recap-dialog-title" style={{ backgroundColor: "rgba(8,23,18,0.78)", backdropFilter: "blur(5px)" }} onClick={() => setOpen(false)}>
          <div className="min-h-full flex items-start sm:items-center justify-center p-3 sm:p-6">
            <div className="card w-full max-w-4xl overflow-hidden relative" onClick={(event) => event.stopPropagation()}>
              <button onClick={() => setOpen(false)} aria-label={t("stats.recapClose")} className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full flex items-center justify-center text-xl" style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-2)" }}>×</button>
              <div className="grid md:grid-cols-[minmax(280px,390px)_1fr]">
                <div className="p-4 sm:p-6 flex items-center justify-center" style={{ backgroundColor: "#E8E2DC" }}>
                  <canvas ref={canvasRef} width={STORY_WIDTH} height={STORY_HEIGHT} className="block w-full max-w-[320px] aspect-[9/16] shadow-2xl" style={{ borderRadius: 6 }} aria-label={t("stats.recapCanvasLabel")} />
                </div>

                <div className="p-5 sm:p-7 flex flex-col justify-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--bt-accent-dark)" }}>{t("stats.recapEyebrow")}</p>
                  <h2 id="recap-dialog-title" className="text-xl sm:text-2xl font-semibold pr-8" style={{ color: "var(--bt-text-1)" }}>{t("stats.recapDialogTitle")}</h2>
                  <p className="text-sm mt-1.5" style={{ color: "var(--bt-text-2)" }}>{t("stats.recapDialogSubtitle")}</p>

                  <div className="inline-flex items-center gap-1 mt-6 self-start p-1 rounded-lg border" role="group" aria-label={t("stats.recapPeriodLabel")} style={{ backgroundColor: "var(--bt-subtle)", borderColor: "var(--bt-border)" }}>
                    <button className="px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors" style={{ backgroundColor: period === "week" ? "var(--bt-surface)" : "transparent", color: period === "week" ? "var(--bt-text-1)" : "var(--bt-text-3)", boxShadow: period === "week" ? "0 1px 4px var(--bt-shadow)" : "none" }} onClick={() => { setPeriod("week"); setStatus(""); }}>{t("stats.recapWeek")}</button>
                    <button className="px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors" style={{ backgroundColor: period === "month" ? "var(--bt-surface)" : "transparent", color: period === "month" ? "var(--bt-text-1)" : "var(--bt-text-3)", boxShadow: period === "month" ? "0 1px 4px var(--bt-shadow)" : "none" }} onClick={() => { setPeriod("month"); setStatus(""); }}>{t("stats.recapMonth")}</button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-5">
                    {[
                      [t("stats.recapTime"), recap.totalLabel],
                      [t("stats.recapStreak"), `${recap.streak} ${t("stats.recapDayShort")}`],
                      [t("stats.recapRank"), rankLoading ? "…" : recap.rankLabel],
                    ].map(([label, value]) => (
                      <div key={label} className="py-3 text-center border-y" style={{ borderColor: "var(--bt-border)" }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--bt-text-3)" }}>{label}</p>
                        <p className="text-sm sm:text-base font-num font-bold mt-1" style={{ color: "var(--bt-text-1)" }}>{value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid sm:grid-cols-2 gap-2 mt-6">
                    <button onClick={share} disabled={exporting || rankLoading} className="btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-60"><ShareIcon />{exporting ? t("stats.recapExporting") : t("stats.recapShare")}</button>
                    <button onClick={download} disabled={exporting || rankLoading} className="btn-ghost inline-flex items-center justify-center gap-2 disabled:opacity-60"><DownloadIcon />{t("stats.recapDownload")}</button>
                  </div>
                  <p className="text-[11px] mt-3" style={{ color: "var(--bt-text-3)" }}>{t("stats.recapShareHint")}</p>
                  {status && <p role="status" className="text-xs font-medium mt-3" style={{ color: status === t("stats.recapError") ? "#DC2626" : "var(--bt-accent-dark)" }}>{status}</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
