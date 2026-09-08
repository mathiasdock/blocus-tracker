import AnimatedNumber from "./AnimatedNumber";
import Flame from "./Flame";
import { useI18n } from "../contexts/I18nContext";
import { formatMinutesShort } from "../lib/format";

const BLOCK_SECONDS = 15 * 60;
const DAILY_BLOCK_GOAL = 8;

function BlocksIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <rect x="3" y="5" width="4" height="14" rx="1.5" />
      <rect x="10" y="5" width="4" height="14" rx="1.5" />
      <rect x="17" y="5" width="4" height="14" rx="1.5" />
    </svg>
  );
}

export default function TodayProgressCard({
  totalToday,
  goalPct,
  weekSecs,
  streak,
  bestStreak,
  streakPaused,
  freezeInfo,
  className = "",
}) {
  const { t } = useI18n();
  const blocks = Math.floor(totalToday / BLOCK_SECONDS);
  const blockPct = Math.min(100, (blocks / DAILY_BLOCK_GOAL) * 100);

  return (
    <section className={`card-ink bt-grain min-w-0 p-4 sm:p-5 ${className}`}>
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3">
          <h2 className="bt-dashboard-title-accent text-lg font-bold" style={{ color: "var(--bt-ink-text)" }}>
            {t("dash.todayProgress")}
          </h2>

          {(streak > 0 || freezeInfo?.supported) && (
            <div className="flex shrink-0 items-center gap-1.5">
              {freezeInfo?.supported && (
                <span
                  className="inline-flex min-h-7 items-center gap-1 rounded-full px-2 text-xs font-bold"
                  title={t("streak.freezeStock")}
                  aria-label={`${t("streak.stockLabel")} : ${t("streak.stockCount").replace("{n}", String(freezeInfo.stock))}`}
                  style={{
                    backgroundColor: freezeInfo.stock > 0 ? "rgba(56,189,248,0.16)" : "rgba(255,255,255,0.07)",
                    border: `1px solid ${freezeInfo.stock > 0 ? "rgba(56,189,248,0.34)" : "rgba(255,255,255,0.10)"}`,
                    color: freezeInfo.stock > 0 ? "#BAE6FD" : "rgba(255,255,255,0.55)",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M12 2v20M4 6l16 12M20 6 4 18M12 2 9.5 4.5M12 2l2.5 2.5M12 22l-2.5-2.5M12 22l2.5-2.5" />
                  </svg>
                  <span className="font-num tabular-nums">{freezeInfo.stock}/2</span>
                </span>
              )}
              {streak > 0 && (
                <span
                  className="inline-flex min-h-7 items-center gap-1.5 rounded-full px-2 text-xs font-bold"
                  style={{ backgroundColor: "rgba(251,191,36,0.14)", border: "1px solid rgba(251,191,36,0.28)", color: "#FFF7D6" }}
                >
                  <Flame size={12} style={{ color: streakPaused ? "rgba(251,191,36,0.48)" : "#FBBF24" }} />
                  <span className="font-num tabular-nums"><AnimatedNumber value={streak} /></span>
                </span>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 flex items-end justify-between gap-4">
          <p className="font-num text-[2.35rem] font-extrabold leading-none tracking-[-0.035em] tabular-nums sm:text-[2.75rem]" style={{ color: "var(--bt-ink-text)" }}>
            <AnimatedNumber value={totalToday} format={formatMinutesShort} />
          </p>
          <p className="pb-1 text-right text-xs font-semibold tabular-nums" style={{ color: "var(--bt-ink-muted)" }}>
            {t("dash.goal")} · <AnimatedNumber value={goalPct} suffix="%" />
          </p>
        </div>

        <div
          className="mt-2.5 h-2 overflow-hidden rounded-full"
          role="progressbar"
          aria-label={t("dash.goal")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={goalPct}
          style={{ backgroundColor: "rgba(255,255,255,0.14)" }}
        >
          <div
            className="h-full origin-left rounded-full transition-transform duration-300 motion-reduce:transition-none"
            style={{ transform: `scaleX(${goalPct / 100})`, backgroundImage: "linear-gradient(90deg, #14B885, #2BD9A4)" }}
          />
        </div>

        <div className="mt-4 flex items-center gap-3" style={{ color: "var(--bt-ink-text)" }}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.10)" }}>
            <BlocksIcon />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {t("dash.blocksToday").replace("{done}", String(blocks)).replace("{total}", String(DAILY_BLOCK_GOAL))}
            </p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.12)" }}>
              <div className="h-full origin-left rounded-full transition-transform duration-300 motion-reduce:transition-none" style={{ transform: `scaleX(${blockPct / 100})`, backgroundColor: "#7FE6C2" }} />
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-3" style={{ borderColor: "var(--bt-ink-border)" }}>
          <div>
            <p className="text-xs" style={{ color: "var(--bt-ink-muted)" }}>{t("dash.recWeek")}</p>
            <p className="mt-0.5 font-num text-base font-bold tabular-nums" style={{ color: "var(--bt-ink-text)" }}>
              <AnimatedNumber value={weekSecs} format={formatMinutesShort} />
            </p>
          </div>
          <div>
            <p className="text-xs" style={{ color: "var(--bt-ink-muted)" }}>{t("dash.recBestStreak")}</p>
            <p className="mt-0.5 font-num text-base font-bold tabular-nums" style={{ color: "var(--bt-ink-text)" }}>
              <AnimatedNumber value={bestStreak} suffix={` ${t("dash.daysShort")}`} />
            </p>
          </div>
        </div>

        {streakPaused && (
          <p className="mt-3 text-xs" style={{ color: "var(--bt-ink-muted)" }}>{t("blocus.paused")}</p>
        )}
      </div>
    </section>
  );
}
