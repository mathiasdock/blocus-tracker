import { useEffect, useState } from "react";
import { Avatar } from "./Layout";
import LevelPill from "./LevelPill";
import { SkeletonList } from "./Skeleton";
import EmptyState from "./EmptyState";
import { useI18n } from "../contexts/I18nContext";
import { supabase } from "../lib/supabaseClient";
import { formatStudyTime, displayName, lastNDates, todayISO } from "../lib/format";
import { loadUserLevelMap } from "../lib/userLevels";
import AnimatedNumber from "./AnimatedNumber";
import FilterMenu from "./FilterMenu";
import Flame from "./Flame";

// ── RankBadge ────────────────────────────────────────────────
// Rang : un numéro, pas une médaille. Le podium or / argent / bronze habillait
// une simple quantité d'heures en récompense — comme si étudier plus longtemps
// voulait dire étudier mieux — et ses chiffres blancs tenaient 2,2:1 sur l'or.
// Le classement reste motivant par les noms, les visages et sa propre ligne ;
// le rang, lui, est une position. La ligne de l'utilisateur ressort par son
// fond, pas par une couleur de rang.
export function RankBadge({ rank, isMe = false }) {
  return (
    <span className="shrink-0 w-6 h-6 flex items-center justify-center font-num font-bold text-xs tabular-nums"
      style={{ color: isMe ? "var(--bt-text-1)" : "var(--bt-text-2)" }}>
      {rank}
    </span>
  );
}

// ── Leaderboard ──────────────────────────────────────────────
// Classement de la page Stats, servi par get_leaderboard_v2 (migration v27).
// Tant que la migration n'est pas passée en prod, repli automatique sur
// get_public_leaderboard + calcul amis côté client.
//
// Trois menus compacts remplacent deux rangées d'onglets : l'audience (« je
// regarde qui ? »), la période (« sur quand ? ») et le classement (temps,
// série, régularité). En onglets, ces trois dimensions faisaient onze boutons
// permanents sur trois lignes — plus haut que le podium lui-même sur un
// téléphone.
//
// `compact` : aperçu (podium + ma ligne + bouton pour tout voir). Les filtres
// restent visibles en aperçu : sans eux, on ne sait pas ce qu'on lit.
// `desktopTall` transforme cet aperçu en rail complet à partir de xl : toutes
// les lignes sont déjà rendues et défilent dans la carte, tandis que le mobile
// conserve l'aperçu compact pour ne pas créer un long piège de scroll imbriqué.
export default function Leaderboard({
  user,
  profile,
  onViewUser,
  compact = false,
  desktopTall = false,
}) {
  const { t } = useI18n();
  const [showAll, setShowAll] = useState(!compact);
  const isCompact = compact && !showAll;

  // « Je regarde qui ? » — une seule question, une seule valeur. Avant, la
  // reponse se lisait sur DEUX controles a la fois (onglet Public/Amis + puce
  // « Ma fac ») : « Public + Ma fac » et « Amis + Ma fac » etaient deux etats
  // distincts que rien n'annoncait. Le couple (mode, fUni) reste derive ici,
  // pour ne rien changer a la requete.
  const [audience, setAudience] = useState("global"); // global | friends | uni
  const [period, setPeriod] = useState("day");        // day | week | month
  const [metric, setMetric] = useState("time");       // time | streak | regularity
  const mode = audience === "friends" ? "friends" : "public";
  const fUni = audience === "uni";
  // Conserves a false : la RPC get_leaderboard_v2 accepte toujours ces deux
  // parametres, on les lui passe simplement neutres.
  const fField = false;
  const fYear  = false;

  const [v2Available, setV2Available] = useState(true); // optimiste ; ↓ legacy si RPC absente
  const [rows,    setRows]    = useState([]);
  const [levels,  setLevels]  = useState({});
  const [loading, setLoading] = useState(true);
  const [friendIds, setFriendIds] = useState([]);

  // Le sélecteur de métrique contraint la période : la série est
  // indépendante de la période, la régularité n'a pas de sens sur un jour.
  function pickMetric(m) {
    setMetric(m);
    if (m === "regularity" && period === "day") setPeriod("week");
  }

  // L'audience choisie peut cesser d'exister (dernier ami retiré, université
  // effacée du profil). Sans ce repli, on interrogeait « ma fac » avec une
  // université nulle et la liste se vidait sans explication.
  useEffect(() => {
    if (audience === "friends" && !friendIds.length) setAudience("global");
    if (audience === "uni" && !profile?.university) setAudience("global");
  }, [audience, friendIds.length, profile?.university]);

  // Amis acceptés — sert à afficher l'onglet Amis et au repli legacy.
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: links } = await supabase
        .from("friendships")
        .select("requester, addressee")
        .or(`requester.eq.${user.id},addressee.eq.${user.id}`)
        .eq("status", "accepted");
      setFriendIds((links || []).map(l => l.requester === user.id ? l.addressee : l.requester));
    })();
  }, [user]);

  // ── Chargement principal ───────────────────────────────────
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      let list = null;

      if (v2Available) {
        const { data, error } = await supabase.rpc("get_leaderboard_v2", {
          p_period:      metric === "streak" ? "week" : period,
          p_metric:      metric,
          p_scope:       mode === "friends" ? "friends" : "all",
          p_university:  fUni   ? (profile?.university  || null) : null,
          p_study_field: fField ? (profile?.study_field || null) : null,
          p_study_year:  fYear  ? (profile?.study_year  || null) : null,
        });
        if (error || data == null) {
          // RPC absente (migration v27 pas encore exécutée) → repli legacy.
          if (!cancelled) setV2Available(false);
          return;
        }
        list = data.map(r => ({
          user_id: r.user_id,
          name: [r.first_name, r.last_name].filter(Boolean).join(" ") || r.pseudo,
          avatar_url: r.avatar_url,
          total_seconds: Number(r.total_seconds),
          alltime_seconds: Number(r.alltime_seconds),
          streak_days: Number(r.streak_days),
          active_days: Number(r.active_days),
        }));
      } else if (mode === "public") {
        // Legacy : ancienne RPC (heures uniquement, filtre école, jour/semaine).
        const { data } = await supabase.rpc("get_public_leaderboard", {
          p_period: period === "month" ? "week" : period,
          p_university: fUni ? (profile?.university || null) : null,
        });
        list = (data || []).map(r => ({
          user_id: r.user_id,
          name: [r.first_name, r.last_name].filter(Boolean).join(" ") || r.pseudo,
          avatar_url: r.avatar_url,
          total_seconds: Number(r.total_seconds),
          alltime_seconds: Number(r.alltime_seconds ?? r.total_seconds ?? 0),
          streak_days: 0,
          active_days: 0,
        }));
      } else {
        // Legacy amis : profils + sessions 7 j des amis, moi inclus.
        const ids = friendIds;
        const since7 = lastNDates(7)[0];
        const [{ data: profs }, { data: fSessions }, { data: mine }] = await Promise.all([
          ids.length
            ? supabase.from("profiles").select("id, pseudo, first_name, last_name, avatar_url, university").in("id", ids)
            : Promise.resolve({ data: [] }),
          ids.length
            ? supabase.from("sessions").select("user_id, duration_seconds, started_at").in("user_id", ids).gte("started_at", since7)
            : Promise.resolve({ data: [] }),
          supabase.from("sessions").select("user_id, duration_seconds, started_at").eq("user_id", user.id).gte("started_at", since7),
        ]);
        const secsOf = (sess) => period === "day"
          ? sess.filter(s => s.started_at.slice(0, 10) === todayISO()).reduce((a, s) => a + s.duration_seconds, 0)
          : sess.reduce((a, s) => a + s.duration_seconds, 0);
        list = [
          { user_id: user.id, name: displayName(profile), avatar_url: profile?.avatar_url,
            total_seconds: secsOf(mine || []), alltime_seconds: 0, streak_days: 0, active_days: 0 },
          ...(profs || [])
            .filter(p => !fUni || !profile?.university || p.university === profile.university)
            .map(p => ({
              user_id: p.id, name: displayName(p), avatar_url: p.avatar_url,
              total_seconds: secsOf((fSessions || []).filter(s => s.user_id === p.id)),
              alltime_seconds: 0, streak_days: 0, active_days: 0,
            })),
        ].sort((a, b) => b.total_seconds - a.total_seconds);
      }

      if (cancelled) return;
      setRows(list);

      // Pastilles de niveau (mêmes règles qu'avant : fallback sur le temps total).
      const withAlltime = list.filter(r => r.alltime_seconds > 0);
      if (withAlltime.length) {
        const fallback = Object.fromEntries(withAlltime.map(r => [r.user_id, r.alltime_seconds]));
        const levelMap = await loadUserLevelMap(supabase, withAlltime.map(r => r.user_id), {
          selfUserId: user.id,
          fallbackTotalSecondsByUser: fallback,
        });
        if (!cancelled) setLevels(levelMap);
      } else {
        setLevels({});
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user, profile, mode, audience, period, metric, fUni, fField, fYear, v2Available, friendIds]);

  // ── Libellés ───────────────────────────────────────────────
  // « Jour / Semaine / Mois » mentait : la RPC compte des fenêtres GLISSANTES
  // (migration v27 : 'week' = CURRENT_DATE - 6 j, 'month' = CURRENT_DATE - 29 j).
  // « Semaine » se lisait comme la semaine calendaire en cours. Les libellés
  // disent maintenant ce que la requête fait vraiment.
  const periodDays = period === "month" ? 30 : 7;
  const metricLabel = metric === "streak" ? t("stats.metricStreak")
    : metric === "regularity" ? t("stats.metricRegularity")
    : t("stats.metricTime");
  const periodLabel = period === "day" ? t("stats.lbToday")
    : period === "month" ? t("stats.lbLast30")
    : t("stats.lbLast7");
  const audienceLabel = audience === "friends" ? t("stats.audienceFriends")
    : audience === "uni" ? t("stats.audienceUni")
    : t("stats.audienceGlobal");

  const subtitle = [
    audienceLabel,
    metric === "streak" ? metricLabel : periodLabel,
  ].filter(Boolean).join(" · ");

  // Valeur affichée à droite de chaque ligne, selon la métrique active.
  function ValueCell({ row, rank }) {
    const animate = rank <= 10;
    // Encres lisibles : l'ambre (#D97706) et le vert (#0E8F68) écrits en dur
    // tenaient 3,2:1 et 3,8:1 sur la carte. La flamme garde sa teinte chaude —
    // c'est elle qui dit « série » — et le nombre passe en encre de texte.
    if (v2Available && metric === "streak") {
      return (
        <span className="inline-flex items-center gap-1 text-sm font-num font-semibold tabular-nums" style={{ color: "var(--bt-text-1)" }}>
          <Flame size={13} style={{ color: "#F59E0B" }} />
          {animate
            ? <AnimatedNumber value={row.streak_days} suffix={` ${t("stats.dayUnit")}`} />
            : <>{row.streak_days} {t("stats.dayUnit")}</>}
        </span>
      );
    }
    if (v2Available && metric === "regularity") {
      return (
        <span className="text-sm font-num font-semibold tabular-nums" style={{ color: "var(--bt-accent-text)" }}>
          {animate ? <AnimatedNumber value={row.active_days} /> : row.active_days}/{periodDays} {t("stats.dayUnit")}
        </span>
      );
    }
    return (
      <span className="text-sm font-num font-semibold tabular-nums" style={{ color: "var(--bt-accent-text)" }}>
        {animate
          ? <AnimatedNumber value={row.total_seconds} format={formatStudyTime} />
          : formatStudyTime(row.total_seconds)}
      </span>
    );
  }

  // Deux questions, deux menus : « je regarde qui ? », « sur quelle période ? ».
  // Les options indisponibles ne sont pas grisées, elles n'existent pas : pas
  // d'onglet « Amis » sans ami, pas de « Ma fac » sans université déclarée.
  const audienceOptions = [
    { value: "global", label: t("stats.audienceGlobal") },
    ...(friendIds.length ? [{ value: "friends", label: t("stats.audienceFriends") }] : []),
    ...(profile?.university ? [{ value: "uni", label: t("stats.audienceUni") }] : []),
  ];
  const periodOptions = [
    // La régularité se mesure sur plusieurs jours : « aujourd'hui » n'a pas
    // de sens ici, l'option disparaît au lieu de produire un 0/1.
    ...(metric === "regularity" ? [] : [{ value: "day", label: t("stats.lbToday") }]),
    { value: "week", label: t("stats.lbLast7") },
    ...(v2Available ? [{ value: "month", label: t("stats.lbLast30") }] : []),
  ];
  const metricOptions = [
    { value: "time", label: t("stats.metricTime") },
    { value: "streak", label: t("stats.metricStreak") },
    { value: "regularity", label: t("stats.metricRegularity") },
  ];

  // En aperçu mobile : le podium, puis ma ligne si je n'y suis pas déjà.
  // Le rail desktop rend toute la liste immédiatement ; les lignes qui ne font
  // pas partie de cet aperçu restent simplement masquées sous xl.
  const myIndex = rows.findIndex(r => r.user_id === user?.id);
  const compactRows = isCompact
    ? [
        ...rows.slice(0, 3).map((row, i) => ({ row, rank: i + 1 })),
        ...(myIndex >= 3 ? [{ row: rows[myIndex], rank: myIndex + 1 }] : []),
      ]
    : rows.map((row, i) => ({ row, rank: i + 1 }));
  const compactRowIds = new Set(compactRows.map(({ row }) => row.user_id));
  const visibleRows = desktopTall && isCompact
    ? rows.map((row, i) => ({ row, rank: i + 1, desktopOnly: !compactRowIds.has(row.user_id) }))
    : compactRows;

  return (
    // `max-h` et non une hauteur fixe : avec deux ou trois lignes, la carte
    // gardait 486 px de haut et la moitié basse restait vide.
    <section className={`card p-4 sm:p-5 ${compact ? "" : "mt-6"} ${desktopTall ? "xl:absolute xl:inset-0 xl:flex xl:flex-col" : ""}`}>
      {/* Titre + les deux filtres, dans le même en-tête. Ils y restent même en
          aperçu : savoir QUI on regarde et SUR QUELLE PÉRIODE fait partie de
          la lecture du classement, ce n'est pas un réglage avancé. */}
      <div className={`mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-2 ${desktopTall ? "xl:shrink-0" : ""}`}>
        <div className="min-w-0">
          <h3 className="text-sm font-bold" style={{ color: "var(--bt-text-1)" }}>
            {t("stats.publicLeaderTitle")}
          </h3>
          <p className="mt-0.5 truncate text-xs" style={{ color: "var(--bt-text-3)" }}>{subtitle}</p>
        </div>
        {/* `max-w-full` : sans plafond, le groupe gardait la largeur de ses
            trois filtres sur une ligne et débordait de la carte à 320 px — le
            dernier était rogné, donc inatteignable. Plafonné, il passe à la
            ligne. `gap-y-3` : les zones tactiles de 44 px de deux rangées se
            touchent sans se chevaucher. Aligné à gauche, sous le titre. */}
        <div className="flex max-w-full shrink-0 flex-wrap items-center justify-start gap-x-1.5 gap-y-3">
          <FilterMenu
            value={audience}
            options={audienceOptions}
            onChange={setAudience}
            ariaLabel={t("stats.audienceFilterLabel")}
            buttonClassName="bt-tap-44"
          />
          {(!v2Available || metric !== "streak") && (
            <FilterMenu
              value={period}
              options={periodOptions}
              onChange={setPeriod}
              ariaLabel={t("stats.periodFilterLabel")}
              buttonClassName="bt-tap-44"
            />
          )}
          {v2Available && (
            <FilterMenu
              value={metric}
              options={metricOptions}
              onChange={pickMetric}
              ariaLabel={t("stats.metricFilterLabel")}
              buttonClassName="bt-tap-44"
            />
          )}
        </div>
      </div>

      {/* Liste */}
      <div
        className={`${desktopTall ? "xl:min-h-0 xl:flex-1 xl:overscroll-contain xl:overflow-y-auto xl:pr-1 xl:focus-visible:outline xl:focus-visible:outline-2 xl:focus-visible:outline-offset-2 xl:focus-visible:outline-[var(--bt-accent)]" : "[&::-webkit-scrollbar]:hidden"}`}
        style={isCompact ? undefined : { maxHeight: "480px", overflowY: "auto", scrollbarWidth: desktopTall ? "thin" : "none" }}
        tabIndex={desktopTall ? 0 : undefined}
        aria-label={desktopTall ? t("stats.publicLeaderTitle") : undefined}>
        {loading ? (
          <div className="py-1"><SkeletonList rows={isCompact ? 3 : 6} avatar={32} lines={1} /></div>
        ) : (
          <ul className="space-y-1.5">
            {visibleRows.map(({ row, rank: i0, desktopOnly = false }) => {
              const i = i0 - 1;
              const isMe = row.user_id === user?.id;
              return (
                <li key={row.user_id}
                  className={`${desktopOnly ? "hidden xl:flex" : "flex"} items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors`}
                  style={isMe ? { backgroundColor: "var(--bt-accent-bg)" } : { cursor: "pointer" }}
                  onClick={() => { if (!isMe) onViewUser(row.user_id); }}
                  onMouseEnter={e => { if (!isMe) e.currentTarget.style.backgroundColor = "var(--bt-subtle)"; }}
                  onMouseLeave={e => { if (!isMe) e.currentTarget.style.backgroundColor = ""; }}>
                  <RankBadge rank={i + 1} isMe={isMe} />
                  <Avatar url={row.avatar_url} pseudo={row.name} size={32} />
                  <span className="flex-1 min-w-0 text-sm font-medium" style={{ color: "var(--bt-text-1)" }}>
                    <span className="inline-flex items-center gap-1.5 max-w-full">
                      <span className="truncate">{row.name}</span>
                      {Number(levels[row.user_id]?.totalXP) > 0 && (
                        <LevelPill level={levels[row.user_id].current.level} />
                      )}
                    </span>
                    {/* Sur le fond vert de sa propre ligne, l'encre secondaire ne
                        tenait que 4,3:1. */}
                    {isMe && <span className="font-normal" style={{ color: "var(--bt-text-1)" }}> {t("stats.me")}</span>}
                  </span>
                  <ValueCell row={row} rank={i + 1} />
                </li>
              );
            })}
            {rows.length === 0 && (
              <li>
                <EmptyState illustration="leaderboard" title={t("stats.leaderboardEmptyTitle")} subtitle={t("stats.leaderboardEmptySubtitle")} />
              </li>
            )}
          </ul>
        )}
      </div>

      {isCompact && rows.length > 3 && (
        <button onClick={() => setShowAll(true)}
          className={`bt-stats-quiet-btn mt-3 w-full rounded-xl py-2 text-xs font-semibold ${desktopTall ? "xl:hidden" : ""}`}>
          {t("stats.viewFullLeaderboard")}
        </button>
      )}
    </section>
  );
}
