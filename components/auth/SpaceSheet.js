import Link from "next/link";
import { useI18n } from "../../contexts/I18nContext";
import { UniversityMark } from "../course-spaces/CourseSpaceList";
import { communityIdForUniversity, universityShortName } from "../../lib/universities";
import { fieldLabel } from "../../lib/studySpaces.mjs";
import { programInitials } from "../../lib/courseSpaces.mjs";
import { studyYearShortLabel } from "../../lib/studyYears";

// The student's space, drawn with the product's own marks: the avatar, the
// institution's crest, the program's disc, the course markers. It holds only
// what the student has actually answered; a mark still to come is a dashed
// outline of the same shape. It never shows study time, a mascot or an
// example course — there is nothing of that to show yet.

const VISIBLE_COURSES = 8;

function GhostMark({ shape }) {
  return (
    <span className={`bt-sheet-ghost is-${shape}`} aria-hidden="true">
      {shape === "dots" && <><i /><i /><i /></>}
    </span>
  );
}

function Ghost({ shape, children }) {
  return (
    <div className="bt-sheet-row is-ghost">
      <GhostMark shape={shape} />
      <span>{children}</span>
    </div>
  );
}

function initialOf(name) {
  const letter = String(name || "").trim().charAt(0);
  return letter ? letter.toLocaleUpperCase() : "";
}

export default function SpaceSheet({
  firstName = "",
  lastName = "",
  pseudo = "",
  university = "",
  broadField = "",
  year = "",
  program = "",
  courses = [],
  stage = 0,
  loading = false,
}) {
  const { t, lang } = useI18n();
  const name = [firstName, lastName].map(part => String(part || "").trim()).filter(Boolean).join(" ");
  const handle = String(pseudo || "").trim();
  const institution = String(university || "").trim();
  const field = broadField ? fieldLabel(broadField, lang) : "";
  const yearLabel = year ? studyYearShortLabel(year, t) : "";
  const detail = String(program || "").trim();
  const shown = courses.slice(0, VISIBLE_COURSES);
  const hidden = courses.length - shown.length;

  if (loading) {
    return (
      <div className="bt-sheet card-ink is-loading" aria-hidden="true">
        <div className="bt-sheet-id">
          <span className="bt-sheet-avatar is-empty" />
          <div className="bt-sheet-id-text">
            <span className="bt-sheet-bone" style={{ width: "58%" }} />
            <span className="bt-sheet-bone is-small" style={{ width: "34%" }} />
          </div>
        </div>
        <div className="bt-sheet-sec">
          <span className="bt-sheet-bone is-small" style={{ width: "22%" }} />
          <span className="bt-sheet-bone" style={{ width: "70%" }} />
          <span className="bt-sheet-bone" style={{ width: "52%" }} />
        </div>
      </div>
    );
  }

  return (
    // The same answers are in the form beside it: the sheet is a picture of
    // them, so assistive technology reads the form only.
    <div className="bt-sheet card-ink" data-stage={stage} aria-hidden="true">
      <div className="bt-sheet-id" data-filled={name ? "true" : undefined}>
        <span className={`bt-sheet-avatar${name ? "" : " is-empty"}`}>{initialOf(name)}</span>
        <div className="bt-sheet-id-text">
          <p className="bt-sheet-name">{name || t("setup.sheetName")}</p>
          <p className="bt-sheet-handle">{handle ? `@${handle}` : t("setup.sheetHandle")}</p>
        </div>
      </div>

      <section className="bt-sheet-sec" data-current={stage === 1 ? "true" : undefined}>
        <h2 className="bt-sheet-label">{t("setup.stageStudies")}</h2>
        {institution ? (
          <div className="bt-sheet-row" key={institution}>
            <UniversityMark
              entry={{ institutionId: communityIdForUniversity(institution), institutionName: universityShortName(institution), title: institution }}
              size={30}
            />
            <span>{universityShortName(institution)}</span>
          </div>
        ) : <Ghost shape="plate">{t("setup.sheetInstitution")}</Ghost>}
        {field ? (
          <div className="bt-sheet-row" key={`${field}-${yearLabel}`}>
            <span className="bt-course-disc" style={{ "--mark": "30px" }}>{programInitials(field)}</span>
            <span>
              {[field, yearLabel].filter(Boolean).join(" · ")}
              {detail && <small>{detail}</small>}
            </span>
          </div>
        ) : <Ghost shape="disc">{t("setup.sheetField")}</Ghost>}
      </section>

      <section className="bt-sheet-sec" data-current={stage === 2 ? "true" : undefined}>
        <h2 className="bt-sheet-label">
          {t("setup.stageCourses")}
          {courses.length > 0 && <span className="bt-sheet-count">{courses.length}</span>}
        </h2>
        {courses.length > 0 ? (
          <ul className="bt-sheet-courses">
            {shown.map(course => (
              <li key={course.id} data-saving={course.status === "saving" ? "true" : undefined}>
                <span className="bt-sheet-dot" style={{ background: course.color }} />
                <span>{course.name}</span>
              </li>
            ))}
            {hidden > 0 && <li className="bt-sheet-more">{t("setup.sheetMore").replace("{n}", hidden)}</li>}
          </ul>
        ) : <Ghost shape="dots">{t("setup.sheetCourses")}</Ghost>}
      </section>
    </div>
  );
}

// The same sheet on the sign-in page, for someone who has none yet: the three
// parts it will hold, and the door to start it.
export function SpaceInvite() {
  const { t } = useI18n();
  const parts = [
    { shape: "avatar", title: "setup.inviteAccount", hint: "setup.inviteAccountHint" },
    { shape: "plate", title: "setup.inviteStudies", hint: "setup.inviteStudiesHint" },
    { shape: "dots", title: "setup.inviteCourses", hint: "setup.inviteCoursesHint" },
  ];
  return (
    <section className="bt-sheet card-ink is-invite" aria-labelledby="bt-invite-title">
      <h2 id="bt-invite-title" className="bt-sheet-invite-title">{t("setup.inviteTitle")}</h2>
      <p className="bt-sheet-invite-lead">{t("setup.inviteLead")}</p>
      <ol className="bt-sheet-plan">
        {parts.map(part => (
          <li key={part.title}>
            <GhostMark shape={part.shape} />
            <span>
              <strong>{t(part.title)}</strong>
              <small>{t(part.hint)}</small>
            </span>
          </li>
        ))}
      </ol>
      <Link href="/signup" className="bt-sheet-cta">{t("login.create")}</Link>
    </section>
  );
}
