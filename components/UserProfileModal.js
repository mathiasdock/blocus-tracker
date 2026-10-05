import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { Avatar } from "./Layout";
import Glyph from "./Glyph";
import InboxSheet from "./InboxSheet";
import LevelPill from "./LevelPill";
import BadgeIcon from "./BadgeIcon";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { supabase } from "../lib/supabaseClient";
import { displayName, formatStudyTime } from "../lib/format";
import { studyYearShortLabel } from "../lib/studyYears";
import { fieldLabel } from "../lib/studySpaces.mjs";
import { getLevelInfo } from "../lib/xp";
import { BADGES } from "../lib/badges";
import { clientRateLimit } from "../lib/security";
import { notifyXPChanged } from "../lib/xpEvents";
import { changeProfileFriendship, loadSocialProfile, profileCourses, sharedBadgeHighlights } from "../lib/socialProfile.mjs";
import styles from "./UserProfileModal.module.css";

export default function UserProfileModal({ userId, onClose }) {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [more, setMore] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const actionLock = useRef(false);
  const generation = useRef(null);

  useEffect(() => {
    const request = { active: true };
    generation.current = request;
    setLoading(true); setFailed(false); setData(null); setError("");
    setMore(false); setConfirmRemove(false); setOpen(true);
    loadSocialProfile(supabase, user?.id, userId).then(result => {
      if (request.active && generation.current === request) setData(result);
    }).catch(() => {
      if (request.active && generation.current === request) setFailed(true);
    }).finally(() => {
      if (request.active && generation.current === request) setLoading(false);
    });
    return () => { request.active = false; };
  }, [user?.id, userId, attempt]);

  async function friendship(action) {
    if (actionLock.current || !data) return;
    if (action === "add" && !clientRateLimit(`friends:add:${user.id}`, 12, 60_000).ok) {
      setError(t("security.rateLimited")); return;
    }
    actionLock.current = true; setBusy(true); setError("");
    const request = generation.current;
    try {
      const relationship = await changeProfileFriendship(supabase, {
        viewerId: user.id, userId, relationship: data.relationship, action,
      });
      if (!request.active || generation.current !== request) return;
      setData(previous => ({ ...previous, relationship,
        // Discard friends-only content as soon as the link is removed.
        ...(action === "remove" ? { seconds30d: null, courses: null, mine: [],
          sharedPosts: previous.sharedPosts.filter(post => post.visibility === "public") } : {}),
      }));
      setMore(false); setConfirmRemove(false); notifyXPChanged();
      if (action === "accept") setAttempt(value => value + 1);
    } catch {
      if (request.active && generation.current === request) setError(t("modal.actionError"));
    } finally { actionLock.current = false; setBusy(false); }
  }

  if (!userId) return null;
  const profile = data?.profile;
  const relationship = data?.relationship;
  const friends = relationship?.status === "accepted";
  const incoming = relationship?.status === "pending" && relationship.addressee === user?.id;
  const pending = relationship?.status === "pending";
  const self = userId === user?.id;
  const progress = data?.progression;
  const level = progress?.totalXP !== null && progress?.totalXP !== undefined ? getLevelInfo(progress.totalXP) : null;
  const courses = profileCourses(data?.courses || [], data?.mine || [], profile || {}, data?.viewer || {}, friends);
  const highlights = sharedBadgeHighlights(data?.sharedPosts || [], BADGES.map(b => b.id), friends || self);
  const studies = profile && [profile.study_field || fieldLabel(profile.broad_field, lang), studyYearShortLabel(profile.study_year, t)].filter(Boolean).join(" · ");
  const metrics = [
    ...(data?.seconds30d !== null && data?.seconds30d !== undefined ? [{ label: t("modal.study30d"), value: formatStudyTime(data.seconds30d) }] : []),
    ...(progress?.streak !== null && progress?.streak !== undefined ? [{ label: t("modal.streak"), value: `${progress.streak} ${t(progress.streak === 1 ? "modal.day" : "modal.days")}` }] : []),
    ...(progress?.badgeCount !== null && progress?.badgeCount !== undefined ? [{ label: t("modal.badges"), value: progress.badgeCount }] : []),
  ];

  return <InboxSheet open={open} className={styles.sheet} title={t("modal.profileTitle")} closeLabel={t("common.close")}
    onClose={() => setOpen(false)} onAfterClose={onClose}>
    <div className={styles.body} aria-busy={loading}>
      {loading ? <p className={styles.notice} role="status">{t("common.loading")}</p> : failed ?
        <div className={styles.empty}><p role="alert">{t("modal.loadError")}</p>
          <button className="btn-secondary" onClick={() => setAttempt(value => value + 1)}>{t("modal.retry")}</button></div> : profile && <>
        <div className={styles.identity}>
          <Avatar url={profile.avatar_url} pseudo={displayName(profile)} size={72} />
          <div className={styles.identityText}>
            <h3>{displayName(profile)}</h3>
            {profile.pseudo && <p className={styles.username}>@{profile.pseudo}</p>}
            {level && <div className={styles.level}><LevelPill level={level.current.level} size="sm" solid />
              <span>{t(level.current.titleKey)}</span></div>}
          </div>
        </div>
        {(profile.university || studies) && <div className={styles.academic}>
          {profile.university && <p>{profile.university}</p>}
          {studies && <p className={styles.secondary}>{studies}</p>}
        </div>}
        {profile.bio && <p className={styles.bio}>{profile.bio}</p>}

        {!self && <div className={styles.actions}>
          <button className="btn-primary" disabled={busy || (pending && !incoming)} onClick={() => {
            if (friends) { setOpen(false); router.push(`/messages?dm=${encodeURIComponent(userId)}`); }
            else friendship(incoming ? "accept" : "add");
          }}>{busy ? t("common.loading") : friends ? t("social.messageBtn") : incoming ? t("friends.accept") : pending ? t("modal.pendingFriend") : t("modal.addFriend")}</button>
          {relationship && <button className={styles.moreButton} aria-label={t("modal.friendshipOptions")}
            aria-expanded={more} aria-controls="profile-friendship-options" disabled={busy}
            onClick={() => { setMore(value => !value); setConfirmRemove(false); }}>
            <Glyph size={20}><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></Glyph>
          </button>}
        </div>}
        {more && <div id="profile-friendship-options" className={styles.options}>
          {confirmRemove ? <><p>{t("modal.removeConfirm")}</p><div className={styles.confirmActions}>
            <button className={styles.danger} disabled={busy} onClick={() => friendship("remove")}>{t("modal.removeFriend")}</button>
            <button className="btn-ghost" disabled={busy} onClick={() => setConfirmRemove(false)}>{t("common.cancel")}</button>
          </div></> : <button className={friends ? styles.danger : styles.neutralAction} disabled={busy}
            onClick={() => friends ? setConfirmRemove(true) : friendship("remove")}>
            {t(friends ? "modal.removeFriend" : incoming ? "friends.refuse" : "friends.cancel")}
          </button>}
        </div>}
        {error && <p className={styles.error} role="alert">{error}</p>}

        {metrics.length > 0 && <dl className={styles.metrics} style={{ gridTemplateColumns: `repeat(${metrics.length}, minmax(0, 1fr))` }}>
          {metrics.map(metric => <div key={metric.label}><dt>{metric.label}</dt><dd>{metric.value}</dd></div>)}
        </dl>}
        {!friends && !self && <p className={styles.notice}>{t("modal.friendsOnly")}</p>}
        {data.partial && <p className={styles.notice} role="status">{t("modal.partial")}</p>}

        {courses.visible.length > 0 && <section className={styles.section}>
          <h4>{t("friends.courses")}</h4>
          <ul className={styles.courses}>{courses.visible.map(course => <li key={course.id} className={styles.course}>
            <span className={styles.courseDot} style={{ background: course.color || "var(--bt-text-3)" }} aria-hidden="true" />
            <span>{course.name}{course.shared && <small>{t("modal.sharedCourse")}</small>}</span>
          </li>)}{courses.remaining > 0 && <li className={styles.remaining} aria-label={t("modal.moreCourses").replace("{n}", courses.remaining)}>+{courses.remaining}</li>}</ul>
        </section>}
        {highlights.length > 0 && <section className={styles.section}>
          <h4>{t("modal.highlights")}</h4>
          <ul className={styles.highlights}>{highlights.map(id => <li key={id}>
            <BadgeIcon id={id} earned size={48} />
            <span>{t(BADGES.find(b => b.id === id).labelKey)}</span>
          </li>)}</ul>
        </section>}
      </>}
    </div>
  </InboxSheet>;
}
