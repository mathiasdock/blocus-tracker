import { useI18n } from "../contexts/I18nContext";
import Glyph from "./Glyph";

function IconChevron() {
  return (
    <Glyph size={16}>
      <path d="m9 18 6-6-6-6" />
    </Glyph>
  );
}

function formatExamDate(value, locale) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(date);
}

// L'archive des cours ne vit pas ici : elle est dans « Analyse avancée » sur la
// page Statistiques, avec les heures de chaque ancien cours. Le tableau de bord
// ne montre que ce sur quoi on travaille aujourd'hui.
export default function DashboardCoursesCard({ courses, checklistCounts, onAdd, onOpen, className = "" }) {
  const { t, lang } = useI18n();
  const locale = lang === "en" ? "en-US" : "fr-BE";

  return (
    <section className={`card min-w-0 p-4 sm:p-5 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold" style={{ color: "var(--bt-text-1)" }}>{t("dash.myCourses")}</h2>
        <button type="button" onClick={onAdd} className="bt-dashboard-control flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold" style={{ backgroundColor: "var(--bt-accent-bg)", border: "1px solid var(--bt-accent-border)", color: "var(--bt-accent-text)" }}>
          <Glyph size={16}>
            <path d="M12 5v14M5 12h14" />
          </Glyph>
          {t("common.add")}
        </button>
      </div>

      {courses.length === 0 ? (
        <p className="py-5 text-center text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>{t("courseEditor.empty")}</p>
      ) : (
        <ul className="mt-3 divide-y" style={{ borderColor: "var(--bt-border)" }}>
          {courses.map((course) => {
            const count = checklistCounts[course.id] || { done: 0, total: 0 };
            const examDate = formatExamDate(course.exam_date, locale);
            return (
              <li key={course.id}>
                <button
                  type="button"
                  onClick={() => onOpen(course)}
                  className="bt-dashboard-row group flex min-h-16 w-full items-center gap-3 rounded-xl px-1 py-2.5 text-left"
                  aria-label={`${t("dash.openCourseDetails")} — ${course.name}`}
                >
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: course.color, boxShadow: course.color ? `0 0 0 4px ${course.color}1F` : "none" }} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold" style={{ color: "var(--bt-text-1)" }}>{course.name}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs" style={{ color: "var(--bt-text-3)" }}>
                      {examDate && <span>{t("dash.examLabel")} {examDate}</span>}
                      {examDate && <span aria-hidden="true">·</span>}
                      <span>{count.done}/{count.total} {t("checklist.tasks")}</span>
                    </span>
                  </span>
                  <span className="shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transform-none motion-reduce:transition-none" style={{ color: "var(--bt-text-3)" }}>
                    <IconChevron />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

    </section>
  );
}
