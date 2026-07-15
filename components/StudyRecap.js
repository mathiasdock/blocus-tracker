import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Mascot from "./Mascot";

const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;
const INK = "#0B2E23";
const INK_SOFT = "#123D31";
const CREAM = "#F7F3ED";
const MUTED = "#9FD7C1";
const GREEN = "#14B885";
const GREEN_LIGHT = "#2BD9A4";
const AMBER = "#F3B64A";
const BLUE = "#8CB9FF";
const TEXT = "#1F1A17";
const BLOCK_SECONDS = 15 * 60;
const BRAND_LOGO_SRC = "/logo-transparent.png";
const BRAND_LOGO_CROP = { x: 170, y: 108, width: 684, height: 558 };

let brandLogoPromise;

const MASCOT = {
  fur: "#E0A458",
  cream: "#F8EACB",
  dark: "#2E2018",
  pink: "#EC9AAB",
};

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

function loadBrandLogo() {
  if (typeof Image === "undefined") return Promise.resolve(null);
  if (!brandLogoPromise) {
    brandLogoPromise = new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => {
        brandLogoPromise = null;
        reject(new Error("brand_logo_load_failed"));
      };
      image.src = BRAND_LOGO_SRC;
    });
  }
  return brandLogoPromise;
}

function drawBrandMark(ctx, image, x, y) {
  if (!image) return;
  const width = 66;
  const height = Math.round((width * BRAND_LOGO_CROP.height) / BRAND_LOGO_CROP.width);
  const mask = ctx.canvas.ownerDocument.createElement("canvas");
  mask.width = width;
  mask.height = height;
  const maskContext = mask.getContext("2d");
  maskContext.drawImage(
    image,
    BRAND_LOGO_CROP.x,
    BRAND_LOGO_CROP.y,
    BRAND_LOGO_CROP.width,
    BRAND_LOGO_CROP.height,
    0,
    0,
    width,
    height,
  );
  maskContext.globalCompositeOperation = "source-in";
  maskContext.fillStyle = GREEN;
  maskContext.fillRect(0, 0, width, height);
  ctx.drawImage(mask, x, y, width, height);
}

function fillPath(ctx, path, color) {
  ctx.fillStyle = color;
  ctx.fill(new Path2D(path));
}

function drawMascot(ctx, x, y, size, mood) {
  const scale = size / 120;
  const awake = mood !== "asleep";
  const excited = mood === "happy" || mood === "fired";
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Pastille claire : la mascotte reste identifiable sans devenir dominante.
  ctx.fillStyle = "rgba(247,243,237,0.94)";
  ctx.beginPath();
  ctx.arc(60, 60, 58, 0, Math.PI * 2);
  ctx.fill();

  const tail = excited
    ? "M86 80 Q108 74 104 50 Q98 70 82 74 Z"
    : mood === "asleep"
      ? "M84 98 Q102 98 98 82 Q94 94 80 94 Z"
      : "M86 88 Q104 82 99 62 Q96 78 81 82 Z";
  fillPath(ctx, tail, MASCOT.fur);
  fillPath(ctx, "M34 80 Q26 110 46 115 Q60 119 74 115 Q94 110 86 80 Q76 66 60 66 Q44 66 34 80 Z", MASCOT.fur);

  ctx.fillStyle = MASCOT.cream;
  ctx.beginPath(); ctx.ellipse(50, 113, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(70, 113, 9, 6, 0, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = GREEN;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(42, 72); ctx.quadraticCurveTo(60, 84, 78, 72); ctx.stroke();
  ctx.fillStyle = GREEN;
  ctx.beginPath(); ctx.arc(60, 82, 4.5, 0, Math.PI * 2); ctx.fill();

  if (awake) {
    fillPath(ctx, "M37 32 L53 10 L62 34 Z", MASCOT.fur);
    fillPath(ctx, "M43 30 L53 16 L58 32 Z", MASCOT.cream);
    fillPath(ctx, "M83 32 L67 10 L58 34 Z", MASCOT.fur);
    fillPath(ctx, "M77 30 L67 16 L62 32 Z", MASCOT.cream);
  } else {
    fillPath(ctx, "M38 40 Q26 46 30 64 Q40 56 44 46 Z", MASCOT.fur);
    fillPath(ctx, "M82 40 Q94 46 90 64 Q80 56 76 46 Z", MASCOT.fur);
  }

  ctx.fillStyle = MASCOT.fur;
  ctx.beginPath(); ctx.arc(60, 50, 27, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = MASCOT.cream;
  ctx.beginPath(); ctx.ellipse(48, 39, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(72, 39, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(60, 58, 16, 13, 0, 0, Math.PI * 2); ctx.fill();

  if (awake) {
    ctx.fillStyle = MASCOT.dark;
    ctx.beginPath(); ctx.arc(49, 48, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(71, 48, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(47.8, 46.5, 1.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(69.8, 46.5, 1.3, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.strokeStyle = MASCOT.dark;
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(45, 49); ctx.quadraticCurveTo(49, 52, 53, 49); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(67, 49); ctx.quadraticCurveTo(71, 52, 75, 49); ctx.stroke();
  }
  ctx.fillStyle = MASCOT.dark;
  ctx.beginPath(); ctx.ellipse(60, 53, 4.5, 3.4, 0, 0, Math.PI * 2); ctx.fill();

  if (excited) {
    fillPath(ctx, "M53 61 Q60 73 67 61 Z", MASCOT.dark);
    fillPath(ctx, "M57 65 Q60 74 63 65 Z", MASCOT.pink);
  } else if (awake) {
    ctx.strokeStyle = MASCOT.dark;
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(54, 62); ctx.quadraticCurveTo(60, 67, 66, 62); ctx.stroke();
  }

  if (mood === "fired") {
    fillPath(ctx, "M94 29 C87 22 92 15 101 8 C99 17 110 20 108 31 C107 39 98 42 92 36 C89 33 90 30 94 29 Z", AMBER);
    fillPath(ctx, "M99 31 C96 27 99 23 102 20 C102 26 106 27 105 32 C104 36 100 36 98 34 Z", "#F97316");
  }
  ctx.restore();
}

function drawSpeechBubble(ctx, text, variant) {
  const accent = variant === "record" ? AMBER : GREEN;
  fillRoundedRect(ctx, 760, 378, 248, 62, 31, "rgba(247,243,237,0.96)");
  ctx.beginPath();
  ctx.moveTo(880, 438); ctx.lineTo(907, 438); ctx.lineTo(896, 458); ctx.closePath();
  ctx.fillStyle = "rgba(247,243,237,0.96)";
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.beginPath(); ctx.arc(792, 409, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = TEXT;
  fittedFont(ctx, text, 180, 21, 16, 800);
  ctx.fillText(text, 812, 416);
}

function drawBlockCell(ctx, x, y, width, height, state, accent, fraction = 0) {
  if (state === "filled") {
    ctx.save();
    ctx.shadowColor = "rgba(20,184,133,0.22)";
    ctx.shadowBlur = 9;
    fillRoundedRect(ctx, x, y, width, height, 5, accent);
    ctx.restore();
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.fillRect(x + 5, y + 4, Math.max(4, width - 10), 2);
    return;
  }
  fillRoundedRect(ctx, x, y, width, height, 5, "rgba(255,255,255,0.035)");
  strokeRoundedRect(ctx, x, y, width, height, 5, "rgba(159,215,193,0.20)", 2);
  if (state === "partial" && fraction > 0) {
    roundedRect(ctx, x, y, width * fraction, height, 5);
    ctx.fillStyle = "rgba(20,184,133,0.72)";
    ctx.fill();
  }
}

function drawBlockRhythm(ctx, recap, copy) {
  const groups = recap.blockGroups;
  const groupGap = recap.period === "month" ? 18 : 12;
  const groupWidth = (936 - groupGap * (groups.length - 1)) / groups.length;
  const blockGap = 7;
  const cellWidth = (groupWidth - 14 - blockGap) / 2;
  const cellHeight = 27;

  ctx.fillStyle = MUTED;
  setFont(ctx, 700, 24);
  ctx.fillText(copy.storyBlocksRhythm, 72, 790);
  ctx.fillStyle = CREAM;
  setFont(ctx, 700, 24, "Space Grotesk");
  ctx.textAlign = "right";
  ctx.fillText(`${recap.blockCount} ${recap.blockCount === 1 ? copy.blockSingular : copy.blockPlural}`, 1008, 790);
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(72, 816, 936, 2);

  groups.forEach((group, groupIndex) => {
    const x = 72 + groupIndex * (groupWidth + groupGap);
    const isBest = groupIndex === recap.bestGroupIndex && group.seconds > 0;
    ctx.fillStyle = isBest ? AMBER : MUTED;
    setFont(ctx, 700, recap.period === "month" ? 18 : 21, "Space Grotesk");
    ctx.textAlign = "center";
    ctx.fillText(group.label, x + groupWidth / 2, 858);

    const shown = Math.min(8, group.blocks);
    for (let index = 0; index < 8; index += 1) {
      const col = index % 2;
      const row = 3 - Math.floor(index / 2);
      const cellX = x + 7 + col * (cellWidth + blockGap);
      const cellY = 880 + row * (cellHeight + 8);
      const state = index < shown ? "filled" : index === shown && group.partial > 0 ? "partial" : "empty";
      const color = isBest && index === Math.max(0, shown - 1) ? AMBER : (groupIndex % 2 ? GREEN_LIGHT : GREEN);
      drawBlockCell(ctx, cellX, cellY, cellWidth, cellHeight, state, color, group.partial);
    }
    if (group.blocks > 8) {
      fillRoundedRect(ctx, x + groupWidth / 2 - 28, 1024, 56, 30, 15, "rgba(243,182,74,0.16)");
      ctx.fillStyle = AMBER;
      setFont(ctx, 700, 17, "Space Grotesk");
      ctx.fillText(`+${group.blocks - 8}`, x + groupWidth / 2, 1045);
    } else {
      ctx.fillStyle = "rgba(159,215,193,0.72)";
      setFont(ctx, 600, 17, "Space Grotesk");
      ctx.fillText(formatStoryDuration(group.seconds), x + groupWidth / 2, 1045);
    }
  });
  ctx.textAlign = "left";
}

function drawMetricStrip(ctx, recap, copy) {
  const metrics = [
    { label: copy.storyStreak, value: `${recap.streak} ${copy.dayShort}`, accent: AMBER },
    { label: copy.storyActiveDays, value: `${recap.activeDays}/${recap.dayCount}`, accent: BLUE },
  ];
  if (recap.rankPending || recap.rank != null) {
    metrics.push({
      label: recap.rankScope === "university" ? copy.storyRankUniversity : copy.storyRankFriends,
      value: recap.rankPending ? "…" : `#${recap.rank}`,
      accent: GREEN,
    });
  }
  const width = 936 / metrics.length;
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(72, 1128, 936, 2);
  ctx.fillRect(72, 1290, 936, 2);
  metrics.forEach((metric, index) => {
    const x = 72 + index * width;
    if (index > 0) ctx.fillRect(x, 1156, 2, 108);
    ctx.fillStyle = metric.accent;
    ctx.fillRect(x + 24, 1160, 38, 6);
    ctx.fillStyle = MUTED;
    setFont(ctx, 700, 21);
    ctx.fillText(metric.label, x + 24, 1202);
    ctx.fillStyle = CREAM;
    fittedFont(ctx, metric.value, width - 48, 58, 42, 700, "Space Grotesk");
    ctx.fillText(metric.value, x + 24, 1262);
  });
}

function drawHighlightStrip(ctx, recap, copy) {
  const highlights = [];
  if (recap.bestDayLabel) highlights.push({ label: copy.storyBestDay, value: recap.bestDayLabel });
  if (recap.longestSeconds > 0) highlights.push({ label: copy.storyBestBlock, value: recap.longestLabel });
  if (recap.topCourse) highlights.push({ label: copy.storyTopCourse, value: recap.topCourse });
  if (!highlights.length) return;
  const width = 936 / highlights.length;
  highlights.forEach((item, index) => {
    const x = 72 + index * width;
    ctx.fillStyle = MUTED;
    setFont(ctx, 700, 20);
    ctx.fillText(item.label, x, 1355);
    ctx.fillStyle = CREAM;
    fittedFont(ctx, item.value, width - 38, 39, 26, 700, index === 1 ? "Space Grotesk" : undefined);
    ctx.fillText(item.value, x, 1408);
  });
}

function drawProgress(ctx, recap, copy) {
  ctx.fillStyle = MUTED;
  setFont(ctx, 700, 21);
  ctx.fillText(copy.storyProgress, 72, 1494);
  ctx.textAlign = "right";
  ctx.fillText(recap.period === "month" ? copy.storyMonthGoal : copy.storyWeekGoal, 1008, 1494);
  ctx.textAlign = "left";

  const segments = 20;
  const gap = 8;
  const width = (936 - gap * (segments - 1)) / segments;
  const filled = Math.round(recap.goalProgress * segments);
  for (let index = 0; index < segments; index += 1) {
    const x = 72 + index * (width + gap);
    drawBlockCell(ctx, x, 1526, width, 24, index < filled ? "filled" : "empty", recap.record && index === filled - 1 ? AMBER : GREEN);
  }
  ctx.fillStyle = CREAM;
  setFont(ctx, 700, 29, "Space Grotesk");
  ctx.fillText(`${Math.round(recap.goalProgress * 100)}%`, 72, 1602);
  ctx.fillStyle = recap.goalReached ? AMBER : MUTED;
  setFont(ctx, 700, 22);
  ctx.fillText(recap.goalReached ? copy.storyGoalReached : copy.storyProgressLine, 158, 1600);
}

function drawStory(canvas, recap, copy, brandLogo) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  canvas.width = STORY_WIDTH;
  canvas.height = STORY_HEIGHT;

  const background = ctx.createLinearGradient(0, 0, STORY_WIDTH, STORY_HEIGHT);
  background.addColorStop(0, recap.variant === "strong" || recap.variant === "record" ? "#061F18" : INK);
  background.addColorStop(0.62, recap.variant === "fresh" ? "#12352D" : "#0A3327");
  background.addColorStop(1, "#071D17");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);

  const glow = ctx.createRadialGradient(930, 290, 20, 930, 290, 470);
  glow.addColorStop(0, recap.variant === "record" ? "rgba(243,182,74,0.18)" : "rgba(43,217,164,0.13)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(470, 0, 610, 760);

  // Texture très légère et déterministe : de la matière, jamais un asset réseau.
  ctx.fillStyle = "rgba(255,255,255,0.022)";
  for (let i = 0; i < 180; i += 1) {
    const x = (i * 137 + 47) % STORY_WIDTH;
    const y = (i * 233 + 91) % 1720;
    ctx.fillRect(x, y, 2 + (i % 3), 2 + (i % 3));
  }

  // Quelques éclats géométriques seulement sur la variante record.
  if (recap.variant === "record") {
    ctx.strokeStyle = "rgba(243,182,74,0.65)";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    for (let i = 0; i < 12; i += 1) {
      const x = 700 + ((i * 73) % 310);
      const y = 72 + ((i * 97) % 420);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 10 + (i % 3) * 5, y + 18); ctx.stroke();
    }
  }

  drawBrandMark(ctx, brandLogo, 72, 74);
  ctx.fillStyle = CREAM;
  setFont(ctx, 700, 43);
  ctx.fillText("blocus·tracker", 150, 116);

  fillRoundedRect(ctx, 801, 76, 207, 52, 26, recap.variant === "record" ? AMBER : GREEN);
  ctx.fillStyle = TEXT;
  setFont(ctx, 800, 21);
  ctx.textAlign = "center";
  ctx.fillText(copy.storyLabel, 904, 109);
  ctx.textAlign = "left";

  ctx.fillStyle = MUTED;
  setFont(ctx, 700, 24);
  ctx.fillText(recap.periodLabel.toUpperCase(), 72, 214);

  ctx.fillStyle = CREAM;
  setFont(ctx, 700, 52);
  ctx.fillText(recap.period === "month" ? copy.storyMonthTitle : copy.storyWeekTitle, 72, 294);
  ctx.fillStyle = recap.variant === "record" ? AMBER : GREEN;
  ctx.fillRect(72, 326, 92, 8);

  drawMascot(ctx, 824, 188, 168, recap.mascotMood);
  drawSpeechBubble(ctx, recap.statusText, recap.variant);

  ctx.fillStyle = MUTED;
  setFont(ctx, 700, 23);
  ctx.fillText(copy.storyFocusTime, 74, 432);

  ctx.fillStyle = CREAM;
  fittedFont(ctx, recap.totalLabel, 650, 155, 98, 700, "Space Grotesk");
  ctx.fillText(recap.totalLabel, 68, 607);

  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.fillRect(728, 472, 2, 156);
  ctx.fillStyle = recap.variant === "record" ? AMBER : GREEN_LIGHT;
  setFont(ctx, 700, 74, "Space Grotesk");
  ctx.fillText(String(recap.blockCount), 770, 565);
  ctx.fillStyle = MUTED;
  setFont(ctx, 700, 21);
  ctx.fillText(recap.blockCount === 1 ? copy.storyBlockValidated : copy.storyBlocksValidated, 772, 608);

  drawBlockRhythm(ctx, recap, copy);
  drawMetricStrip(ctx, recap, copy);
  drawHighlightStrip(ctx, recap, copy);
  drawProgress(ctx, recap, copy);

  // Footer diagonal, plus léger et plus distinctif qu'un pavé rectangulaire.
  ctx.fillStyle = CREAM;
  ctx.beginPath();
  ctx.moveTo(0, 1705); ctx.lineTo(STORY_WIDTH, 1655); ctx.lineTo(STORY_WIDTH, STORY_HEIGHT); ctx.lineTo(0, STORY_HEIGHT); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = recap.variant === "record" ? AMBER : GREEN;
  ctx.beginPath();
  ctx.moveTo(0, 1689); ctx.lineTo(STORY_WIDTH, 1639); ctx.lineTo(STORY_WIDTH, 1659); ctx.lineTo(0, 1709); ctx.closePath();
  ctx.fill();

  ctx.fillStyle = TEXT;
  setFont(ctx, 700, 39);
  ctx.fillText(`@${recap.pseudo || "student"}`, 72, 1791);
  ctx.fillStyle = "#5F5751";
  setFont(ctx, 600, 25);
  ctx.fillText(copy.footerLine, 72, 1841);

  ctx.fillStyle = TEXT;
  setFont(ctx, 700, 29);
  ctx.fillText("blocus-tracker.com", 72, 1892);

  const footerBlocks = [GREEN, GREEN_LIGHT, recap.variant === "record" ? AMBER : GREEN];
  footerBlocks.forEach((color, index) => fillRoundedRect(ctx, 798 + index * 70, 1828 - index * 18, 54, 34, 5, color));
  ctx.fillStyle = TEXT;
  setFont(ctx, 700, 21);
  ctx.textAlign = "right";
  ctx.fillText(copy.footerTag, 1008, 1892);
  ctx.textAlign = "left";
}

function buildRecap({ period, sessions, courses, streak, pseudo, rankData, lang, copy }) {
  const dates = periodDates(period);
  const dateSet = new Set(dates.map(dateKey));
  const selected = sessions.filter((session) => dateSet.has((session.started_at || "").slice(0, 10)));
  const previousDateSet = new Set(dates.map((date) => {
    const previous = new Date(date);
    previous.setDate(previous.getDate() - dates.length);
    return dateKey(previous);
  }));
  const previousTotal = sessions
    .filter((session) => previousDateSet.has((session.started_at || "").slice(0, 10)))
    .reduce((sum, session) => sum + Number(session.duration_seconds || 0), 0);
  const totalSeconds = selected.reduce((sum, session) => sum + Number(session.duration_seconds || 0), 0);
  const totalsByDate = {};
  const detailsByDate = {};
  const totalsByCourse = {};
  selected.forEach((session) => {
    const day = (session.started_at || "").slice(0, 10);
    const seconds = Math.max(0, Number(session.duration_seconds || 0));
    totalsByDate[day] = (totalsByDate[day] || 0) + seconds;
    const detail = detailsByDate[day] || { seconds: 0, blocks: 0, partial: 0 };
    detail.seconds += seconds;
    detail.blocks += Math.floor(seconds / BLOCK_SECONDS);
    detail.partial = Math.max(detail.partial, (seconds % BLOCK_SECONDS) / BLOCK_SECONDS);
    detailsByDate[day] = detail;
    if (session.course_id) {
      totalsByCourse[session.course_id] = (totalsByCourse[session.course_id] || 0) + seconds;
    }
  });
  const courseMap = Object.fromEntries(courses.map((course) => [course.id, course.name]));
  const topCourseId = Object.entries(totalsByCourse).sort((a, b) => b[1] - a[1])[0]?.[0];
  const locale = lang === "en" ? "en-GB" : "fr-FR";
  const dayRows = dates.map((date) => {
    const key = dateKey(date);
    const detail = detailsByDate[key] || { seconds: 0, blocks: 0, partial: 0 };
    return {
      ...detail,
      key,
      label: date.toLocaleDateString(locale, { weekday: "short" }).replace(".", "").slice(0, 2).toUpperCase(),
      date,
    };
  });
  const blockGroups = period === "week"
    ? dayRows
    : Array.from({ length: 6 }, (_, index) => {
      const group = dayRows.slice(index * 5, index * 5 + 5);
      return {
        label: `${group[0].date.getDate()}–${group[group.length - 1].date.getDate()}`,
        seconds: group.reduce((sum, day) => sum + day.seconds, 0),
        blocks: group.reduce((sum, day) => sum + day.blocks, 0),
        partial: Math.max(0, ...group.map((day) => day.partial)),
      };
    });
  const bestGroupIndex = blockGroups.reduce((best, group, index, all) => group.seconds > all[best].seconds ? index : best, 0);
  const blockCount = dayRows.reduce((sum, day) => sum + day.blocks, 0);
  const bestDay = dayRows.reduce((best, day) => day.seconds > best.seconds ? day : best, dayRows[0]);
  const longestSeconds = Math.max(0, ...selected.map((session) => Number(session.duration_seconds || 0)));
  const goalSeconds = period === "month" ? 40 * 3600 : 10 * 3600;
  const goalProgress = Math.min(1, totalSeconds / goalSeconds);
  const goalReached = totalSeconds >= goalSeconds;
  const record = previousTotal > 0 && totalSeconds > previousTotal;

  let variant = "light";
  if (totalSeconds === 0) variant = "fresh";
  else if (record) variant = "record";
  else if (goalReached || goalProgress >= 0.8 || blockCount >= (period === "month" ? 128 : 32)) variant = "strong";
  else if (dayRows.filter((day) => day.seconds > 0).length >= (period === "month" ? 12 : 4)
    || totalSeconds >= (period === "month" ? 12 : 3) * 3600) variant = "steady";

  const statusText = record
    ? copy.statusRecord
    : goalReached
      ? copy.statusGoal
      : variant === "strong"
        ? copy.statusStrong
        : variant === "steady"
          ? copy.statusSteady
          : variant === "fresh"
            ? copy.statusFresh
            : copy.statusLight;

  return {
    period,
    periodLabel: formatPeriod(dates, lang),
    pseudo,
    totalSeconds,
    totalLabel: formatStoryDuration(totalSeconds),
    dayCount: dates.length,
    activeDays: Object.keys(totalsByDate).length,
    streak: Number(streak || 0),
    blockCount,
    blockGroups,
    bestGroupIndex,
    rankPending: rankData === undefined,
    rank: rankData?.rank ?? null,
    rankScope: rankData?.scope || "friends",
    longestSeconds,
    longestLabel: formatStoryDuration(longestSeconds),
    bestDayLabel: bestDay?.seconds > 0
      ? bestDay.date.toLocaleDateString(locale, { weekday: "short", day: "numeric" }).replace(".", "")
      : null,
    topCourse: topCourseId ? courseMap[topCourseId] || null : null,
    goalProgress,
    goalReached,
    record,
    variant,
    mascotMood: variant === "fresh" ? "asleep" : variant === "light" ? "content" : variant === "record" ? "fired" : "happy",
    statusText,
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
  const [brandLogo, setBrandLogo] = useState(null);
  const [brandLogoLoading, setBrandLogoLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState("");
  const canvasRef = useRef(null);

  const copy = useMemo(() => ({
    storyLabel: t("stats.recapStoryLabel"),
    storyWeekTitle: t("stats.recapStoryWeekTitle"),
    storyMonthTitle: t("stats.recapStoryMonthTitle"),
    storyFocusTime: t("stats.recapStoryFocusTime"),
    storyBlockValidated: t("stats.recapStoryBlockValidated"),
    storyBlocksValidated: t("stats.recapStoryBlocksValidated"),
    storyBlocksRhythm: t("stats.recapStoryBlocksRhythm"),
    storyStreak: t("stats.recapStoryStreak"),
    storyRankUniversity: t("stats.recapStoryRankUniversity"),
    storyRankFriends: t("stats.recapStoryRankFriends"),
    storyActiveDays: t("stats.recapStoryActiveDays"),
    storyBestDay: t("stats.recapStoryBestDay"),
    storyBestBlock: t("stats.recapStoryBestBlock"),
    storyTopCourse: t("stats.recapStoryTopCourse"),
    storyProgress: t("stats.recapStoryProgress"),
    storyWeekGoal: t("stats.recapStoryWeekGoal"),
    storyMonthGoal: t("stats.recapStoryMonthGoal"),
    storyGoalReached: t("stats.recapStoryGoalReached"),
    storyProgressLine: t("stats.recapStoryProgressLine"),
    blockSingular: t("stats.recapBlockSingular"),
    blockPlural: t("stats.recapBlockPlural"),
    statusFresh: t("stats.recapStatusFresh"),
    statusLight: t("stats.recapStatusLight"),
    statusSteady: t("stats.recapStatusSteady"),
    statusStrong: t("stats.recapStatusStrong"),
    statusRecord: t("stats.recapStatusRecord"),
    statusGoal: t("stats.recapStatusGoal"),
    dayShort: t("stats.recapDayShort"),
    footerLine: t("stats.recapFooterLine"),
    footerTag: t("stats.recapFooterTag"),
  }), [t]);

  const rankScope = profile?.university ? "university" : "friends";
  const rankKey = `${period}:${rankScope}:${profile?.university || ""}`;
  const rankData = Object.prototype.hasOwnProperty.call(rankByPeriod, rankKey) ? rankByPeriod[rankKey] : undefined;
  const recap = useMemo(() => buildRecap({
    period,
    sessions,
    courses,
    streak,
    pseudo: profile?.pseudo,
    rankData,
    lang,
    copy,
  }), [period, sessions, courses, streak, profile?.pseudo, rankData, lang, copy]);

  useEffect(() => {
    if (!open || !userId || Object.prototype.hasOwnProperty.call(rankByPeriod, rankKey)) return;
    let active = true;
    setRankLoading(true);
    (async () => {
      const { data, error } = await supabase.rpc("get_leaderboard_v2", {
        p_period: period,
        p_metric: "time",
        p_scope: rankScope === "university" ? "all" : "friends",
        p_university: rankScope === "university" ? profile.university : null,
        p_study_field: null,
        p_study_year: null,
      });
      if (!active) return;
      let nextRankData = null;
      if (!error && Array.isArray(data)) {
        const activeRows = data.filter((row) => Number(row.total_value || row.total_seconds || 0) > 0);
        const index = activeRows.findIndex((row) => row.user_id === userId);
        if (activeRows.length > 1 && index >= 0) {
          nextRankData = { rank: index + 1, scope: rankScope, cohort: activeRows.length };
        }
      }
      setRankByPeriod((current) => ({ ...current, [rankKey]: nextRankData }));
      setRankLoading(false);
    })();
    return () => { active = false; };
  }, [open, userId, period, rankByPeriod, rankKey, rankScope, profile?.university]);

  useEffect(() => {
    if (!open || brandLogo) return;
    let active = true;
    setBrandLogoLoading(true);
    loadBrandLogo()
      .then((image) => {
        if (active) setBrandLogo(image);
      })
      .catch(() => {
        if (active) setStatus(t("stats.recapError"));
      })
      .finally(() => {
        if (active) setBrandLogoLoading(false);
      });
    return () => { active = false; };
  }, [open, brandLogo, t]);

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    let active = true;
    (async () => {
      try {
        await document.fonts?.ready;
        await document.fonts?.load('700 80px "Bricolage Grotesque"');
        await document.fonts?.load('700 80px "Space Grotesk"');
      } catch (_) {}
      if (active) drawStory(canvasRef.current, recap, copy, brandLogo);
    })();
    return () => { active = false; };
  }, [open, recap, copy, brandLogo]);

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
    const logo = brandLogo || await loadBrandLogo();
    if (!logo) throw new Error("missing_brand_logo");
    drawStory(canvasRef.current, recap, copy, logo);
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
                <div className="flex items-start justify-between gap-1">
                  <span className="block h-1 w-5 mt-1" style={{ backgroundColor: recap.variant === "record" ? AMBER : GREEN }} />
                  <Mascot streak={streak} size={30} animated={false} />
                </div>
                <span className="block text-[5px] sm:text-[7px] font-bold tracking-wider mt-1" style={{ color: MUTED }}>{t("stats.recapStoryFocusTime")}</span>
                <span className="block text-[13px] sm:text-[19px] font-num font-bold mt-0.5" style={{ color: CREAM }}>{totalLabel}</span>
              </div>
              <div>
                <div className="grid grid-cols-4 gap-1">
                  {Array.from({ length: 8 }, (_, index) => (
                    <span key={index} className="h-2 sm:h-2.5" style={{ backgroundColor: index < Math.min(recap.blockCount, 8) ? (index === 7 && recap.variant === "record" ? AMBER : GREEN) : "rgba(255,255,255,0.1)", borderRadius: 2 }} />
                  ))}
                </div>
                <span className="block text-[5px] sm:text-[7px] font-bold mt-1.5" style={{ color: MUTED }}>{recap.blockCount} {recap.blockCount === 1 ? copy.blockSingular : copy.blockPlural}</span>
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
                      [t("stats.recapBlocks"), String(recap.blockCount)],
                      [t("stats.recapStreak"), `${recap.streak} ${t("stats.recapDayShort")}`],
                    ].map(([label, value]) => (
                      <div key={label} className="py-3 text-center border-y" style={{ borderColor: "var(--bt-border)" }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--bt-text-3)" }}>{label}</p>
                        <p className="text-sm sm:text-base font-num font-bold mt-1" style={{ color: "var(--bt-text-1)" }}>{value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid sm:grid-cols-2 gap-2 mt-6">
                    <button onClick={share} disabled={exporting || rankLoading || brandLogoLoading || !brandLogo} className="btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-60"><ShareIcon />{exporting ? t("stats.recapExporting") : t("stats.recapShare")}</button>
                    <button onClick={download} disabled={exporting || rankLoading || brandLogoLoading || !brandLogo} className="btn-ghost inline-flex items-center justify-center gap-2 disabled:opacity-60"><DownloadIcon />{t("stats.recapDownload")}</button>
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
