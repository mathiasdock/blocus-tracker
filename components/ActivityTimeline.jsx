// Activity — the timeline itself.
//
// Two registers, decided in lib/activityFeed.mjs and drawn here:
//
//   ORDINARY STUDY   one row. Person, course, duration, time. No card, no
//                    shadow, no level pill, no icon tile, no eyebrow. The
//                    course marker is the only color, and only when a course
//                    is actually attached to the session.
//   ACCOMPLISHMENT   the real Blocus object, with room around it: the
//                    canonical BadgeIcon, the canonical StreakEmblem, the
//                    shared LevelSeal. Activity draws none of them itself.
//
// A manual post is neither: it is someone's own words, shown as written.
import { Fragment, useState } from "react";
import { Avatar } from "./Layout";
import BadgeIcon from "./BadgeIcon";
import StreakEmblem from "./StreakEmblem";
import LevelSeal from "./LevelSeal";
import FeedPhoto from "./FeedPhoto";
import Glyph from "./Glyph";
import { BADGES } from "../lib/badges";
import { displayName, formatStudyTime, timeAgo } from "../lib/format";
import { allowsComments, localDayKey } from "../lib/activityFeed.mjs";

const BADGE_BY_ID = new Map(BADGES.map((badge) => [badge.id, badge]));
const IconTrash = () => <Glyph size={16}><path d="M3.8 6.2h16.4" /><path d="M18.4 6.2 17.3 20a1.6 1.6 0 0 1-1.6 1.4H8.3A1.6 1.6 0 0 1 6.7 20L5.6 6.2" /><path d="M10 10.6v6.2M14 10.6v6.2" /><path d="M9.2 6.2V4.4a1.6 1.6 0 0 1 1.6-1.6h2.4a1.6 1.6 0 0 1 1.6 1.6v1.8" /></Glyph>;
const IconPencil = () => <Glyph size={16}><path d="M16.6 3.4a2.7 2.7 0 0 1 3.8 3.8L7.6 20 2.8 21.2 4 16.4Z" /></Glyph>;
const IconClose = () => <Glyph size={14}><path d="m17.4 6.6-10.8 10.8M6.6 6.6l10.8 10.8" /></Glyph>;

function dayLabel(day, t, lang) {
  const today = localDayKey(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (day === today) return t("common.today");
  if (day === localDayKey(yesterday)) return t("feed.yesterday");
  const [year, month, date] = day.split("-").map(Number);
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "fr-BE", {
    weekday: "long", day: "numeric", month: "long",
    ...(year !== new Date().getFullYear() ? { year: "numeric" } : {}),
  }).format(new Date(year, month - 1, date));
}

function Person({ profile, onOpen, children }) {
  return (
    <button type="button" className="bt-activity-person" onClick={onOpen}>
      <strong>{displayName(profile)}</strong>{children}
    </button>
  );
}

// One encouragement, one state. Not a picker, not a long press, not a
// double tap: the only thing a student needs to say here is "bravo".
function Encourage({ t, count, mine, onToggle, disabled }) {
  return (
    <button type="button" className={`bt-activity-cheer${mine ? " is-on" : ""}`} onClick={onToggle}
      disabled={disabled} aria-pressed={mine}>
      <span>{t("feed.encourage")}</span>
      {count > 0 && <span className="bt-activity-cheer-count">{count}</span>}
    </button>
  );
}

function Comments({ entry, t, user, isAdmin, profiles, draft, onDraft, onSend, onDelete, onOpenProfile }) {
  const [open, setOpen] = useState(false);
  const comments = entry.post.comments || [];
  if (!allowsComments(entry)) return null;
  return (
    <div className="bt-activity-comments">
      {comments.length > 0 && <ul>
        {comments.slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).map((comment) => (
          <li key={comment.id}>
            <button type="button" onClick={() => onOpenProfile(comment.user_id)}>{displayName(profiles[comment.user_id] || {})}</button>
            <span>{comment.content}</span>
            {(comment.user_id === user.id || isAdmin) && (
              <button type="button" className="bt-activity-inline-btn" aria-label={t("feed.deleteComment")}
                onClick={() => onDelete(comment.id)}><IconClose /></button>
            )}
          </li>
        ))}
      </ul>}
      {open ? (
        <div className="bt-activity-comment-field">
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <input className="input" autoFocus placeholder={t("feed.comment")} maxLength={500}
            value={draft || ""} onChange={(event) => onDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { onSend(); setOpen(false); } }} />
          <button type="button" disabled={!String(draft || "").trim()} onClick={() => { onSend(); setOpen(false); }}>
            {t("common.send")}
          </button>
        </div>
      ) : (
        <button type="button" className="bt-activity-quiet-btn" onClick={() => setOpen(true)}>{t("feed.comment")}</button>
      )}
    </div>
  );
}

function OwnerActions({ entry, t, mine, isAdmin, onEdit, onDelete }) {
  if (!mine && !isAdmin) return null;
  return (
    <span className="bt-activity-owner">
      {mine && entry.type === "note" && (
        <button type="button" className="bt-activity-inline-btn" aria-label={t("feed.editPost")} onClick={onEdit}><IconPencil /></button>
      )}
      <button type="button" className="bt-activity-inline-btn is-danger" aria-label={t("common.remove")} onClick={onDelete}><IconTrash /></button>
    </span>
  );
}

// The accomplishment objects. Each one is imported, never redrawn.
function AchievementObject({ entry, t }) {
  const activity = entry.post.activity;
  if (activity.type === "badge_unlocked") {
    const badge = BADGE_BY_ID.get(activity.badgeId);
    if (!badge) return null;
    return <BadgeIcon id={badge.id} earned size={84} animate={false} />;
  }
  if (activity.type === "streak") return <StreakEmblem days={activity.days} size={84} />;
  return <LevelSeal level={activity.level} size={84} />;
}

function achievementCopy(entry, t) {
  const activity = entry.post.activity;
  if (activity.type === "badge_unlocked") {
    const badge = BADGE_BY_ID.get(activity.badgeId);
    return badge ? { title: t(badge.labelKey), detail: t(badge.descKey), kind: t("feed.autoBadge") } : null;
  }
  if (activity.type === "streak") {
    return { title: t("feed.streakDays").replace("{n}", activity.days), detail: null, kind: t("feed.autoStreak") };
  }
  return {
    title: t("feed.levelReached").replace("{n}", activity.level),
    detail: activity.titleKey ? t(activity.titleKey) : null,
    kind: t("feed.autoLevel"),
  };
}

// Les publications qu'une ligne montre (une ligne de sessions en regroupe
// plusieurs) : un lien ?post=<id> retrouve ainsi sa ligne.
function postIdsOf(entry) {
  return (entry.posts || [entry.post]).map((post) => post.id).join(" ");
}

export default function ActivityTimeline({
  items, t, lang, user, isAdmin, profiles, photoUrls, signingPhotos,
  onOpenProfile, onEncourage, onRevealPhoto, onDeletePost, onEditPost,
  commentDrafts, onCommentDraft, onSendComment, onDeleteComment, pending,
}) {
  const who = (id) => profiles[id] || { pseudo: "?", avatar_url: null };
  const cheerFor = (entry) => {
    const likes = entry.post.likes || [];
    return { count: likes.length, mine: likes.some((like) => like.user_id === user.id) };
  };

  return (
    <ol className="bt-activity">
      {items.map((entry) => {
        if (entry.type === "day") {
          return <li key={entry.key} className="bt-activity-day"><span>{dayLabel(entry.day, t, lang)}</span></li>;
        }
        const author = who(entry.userId);
        const mine = entry.userId === user.id;
        const cheer = cheerFor(entry);
        const openAuthor = () => onOpenProfile(entry.userId);
        const social = (
          <div className="bt-activity-social">
            <Encourage t={t} count={cheer.count} mine={cheer.mine} disabled={!!pending[entry.post.id]}
              onToggle={() => onEncourage(entry.post)} />
            <Comments entry={entry} t={t} user={user} isAdmin={isAdmin} profiles={profiles}
              draft={commentDrafts[entry.post.id]} onDraft={(value) => onCommentDraft(entry.post.id, value)}
              onSend={() => onSendComment(entry.post)} onDelete={onDeleteComment} onOpenProfile={onOpenProfile} />
          </div>
        );

        // ORDINARY STUDY — a row, not a card.
        if (entry.type === "session") {
          return (
            <li key={entry.key} className="bt-activity-item is-study" data-post-ids={postIdsOf(entry)}>
              <button type="button" className="bt-activity-face" onClick={openAuthor} aria-label={displayName(author)}>
                <Avatar url={author.avatar_url} pseudo={displayName(author)} size={34} />
              </button>
              <div className="bt-activity-line">
                <p>
                  <Person profile={author} onOpen={openAuthor} />{" "}
                  <span className="bt-activity-verb">{t("feed.studiedFor").replace("{time}", formatStudyTime(entry.seconds))}</span>
                </p>
                {entry.courses.length > 0 && (
                  <p className="bt-activity-courses">
                    {entry.courses.map((course, index) => (
                      <Fragment key={course.name}>
                        {index > 0 && <span className="bt-activity-sep" aria-hidden="true">·</span>}
                        <span className="bt-activity-course">
                          <i style={course.color ? { background: course.color } : undefined} aria-hidden="true" />
                          {course.name}
                        </span>
                      </Fragment>
                    ))}
                  </p>
                )}
                <div className="bt-activity-meta">
                  <time dateTime={entry.at}>{timeAgo(entry.at, lang)}</time>
                  <Encourage t={t} count={cheer.count} mine={cheer.mine} disabled={!!pending[entry.post.id]}
                    onToggle={() => onEncourage(entry.post)} />
                  <OwnerActions entry={entry} t={t} mine={mine} isAdmin={isAdmin}
                    onDelete={() => onDeletePost(entry.post.id)} />
                </div>
              </div>
            </li>
          );
        }

        // A completed objective: the student's own words about their own plan.
        if (entry.type === "goal") {
          return (
            <li key={entry.key} className="bt-activity-item is-goal" data-post-ids={postIdsOf(entry)}>
              <button type="button" className="bt-activity-face" onClick={openAuthor} aria-label={displayName(author)}>
                <Avatar url={author.avatar_url} pseudo={displayName(author)} size={34} />
              </button>
              <div className="bt-activity-line">
                <p>
                  <Person profile={author} onOpen={openAuthor} />{" "}
                  <span className="bt-activity-verb">{t("feed.finishedGoal")}</span>
                </p>
                <p className="bt-activity-goal-title">{entry.post.activity.title}</p>
                <div className="bt-activity-meta">
                  <time dateTime={entry.at}>{timeAgo(entry.at, lang)}</time>
                  <OwnerActions entry={entry} t={t} mine={mine} isAdmin={isAdmin}
                    onDelete={() => onDeletePost(entry.post.id)} />
                </div>
                {social}
              </div>
            </li>
          );
        }

        // ACCOMPLISHMENT — the object gets the room.
        if (entry.type === "achievement") {
          const copy = achievementCopy(entry, t);
          if (!copy) return null;
          return (
            <li key={entry.key} className="bt-activity-item is-achievement" data-post-ids={postIdsOf(entry)}>
              <div className="bt-activity-object" aria-hidden="true"><AchievementObject entry={entry} t={t} /></div>
              <div className="bt-activity-line">
                <p className="bt-activity-achievement-kind">{copy.kind}</p>
                <h2>{copy.title}</h2>
                {copy.detail && <p className="bt-activity-achievement-detail">{copy.detail}</p>}
                <p className="bt-activity-byline">
                  <Person profile={author} onOpen={openAuthor} />
                  <span className="bt-activity-sep" aria-hidden="true">·</span>
                  <time dateTime={entry.at}>{timeAgo(entry.at, lang)}</time>
                  <OwnerActions entry={entry} t={t} mine={mine} isAdmin={isAdmin}
                    onDelete={() => onDeletePost(entry.post.id)} />
                </p>
                {entry.post.caption && <p className="bt-activity-caption">{entry.post.caption}</p>}
                {social}
              </div>
            </li>
          );
        }

        // Someone's own words (and their photo, if any).
        const hasPhoto = entry.post.hasPhoto;
        return (
          <li key={entry.key} className="bt-activity-item is-note" data-post-ids={postIdsOf(entry)}>
            <button type="button" className="bt-activity-face" onClick={openAuthor} aria-label={displayName(author)}>
              <Avatar url={author.avatar_url} pseudo={displayName(author)} size={34} />
            </button>
            <div className="bt-activity-line">
              <p className="bt-activity-byline">
                <Person profile={author} onOpen={openAuthor} />
                <span className="bt-activity-sep" aria-hidden="true">·</span>
                <time dateTime={entry.at}>{timeAgo(entry.at, lang)}</time>
                {entry.post.visibility === "friends" && (
                  <>
                    <span className="bt-activity-sep" aria-hidden="true">·</span>
                    <span>{t("feed.friendsBadge")}</span>
                  </>
                )}
                <OwnerActions entry={entry} t={t} mine={mine} isAdmin={isAdmin}
                  onEdit={() => onEditPost(entry.post)} onDelete={() => onDeletePost(entry.post.id)} />
              </p>
              {entry.post.caption && <p className="bt-activity-text">{entry.post.caption}</p>}
              {hasPhoto && (
                <div className="bt-activity-photo">
                  <FeedPhoto post={entry.post} url={photoUrls[entry.post.id] || ""} signing={!!signingPhotos[entry.post.id]}
                    onNeedsUrl={onRevealPhoto} alt={entry.post.caption || t("feed.photoAlt")} />
                </div>
              )}
              {social}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
