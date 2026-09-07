// Export des données personnelles (RGPD art. 20 — portabilité).
//
// Tout est lu AVEC LA SESSION DE LA PERSONNE : la RLS reste la seule autorité
// sur ce qui sort. Il n'existe donc aucun chemin privilégié à sécuriser ici,
// et l'export ne peut, par construction, contenir que ce à quoi elle a déjà
// accès dans l'app.
//
// Format : JSON. Lisible par un humain, réimportable par une machine, et
// « couramment utilisé et lisible par machine » au sens de l'article 20.
//
// Une table absente ou refusée n'interrompt pas l'export : elle est signalée
// dans `_notes`. Un export partiel accompagné de la liste de ce qui manque
// vaut mieux qu'un bouton qui échoue en silence.

const PAGE = 1000;
const MAX_ROWS = 20000;

/**
 * Chaque entrée décrit UNE table et comment y retrouver les lignes de la
 * personne. `columns` reste large (toutes les colonnes lisibles) parce que
 * c'est bien l'intégralité de SES données qui doit lui être remise.
 */
function exportPlan(userId) {
  return [
    { key: "courses", table: "courses", filters: [["user_id", userId]] },
    { key: "study_sessions", table: "sessions", filters: [["user_id", userId]] },
    { key: "objectives", table: "objectives", filters: [["user_id", userId]] },
    { key: "exams", table: "exams", filters: [["user_id", userId]] },
    { key: "blocus_periods", table: "blocus_periods", filters: [["user_id", userId]] },
    { key: "course_checklist_items", table: "course_checklist_items", filters: [["user_id", userId]] },
    { key: "posts", table: "posts", filters: [["user_id", userId]] },
    { key: "comments", table: "comments", filters: [["user_id", userId]] },
    { key: "likes", table: "likes", filters: [["user_id", userId]] },
    { key: "community_messages", table: "community_messages", filters: [["user_id", userId]] },
    { key: "group_messages", table: "group_messages", filters: [["user_id", userId]] },
    { key: "group_memberships", table: "group_members", filters: [["user_id", userId]] },
    { key: "badges", table: "user_badges", filters: [["user_id", userId]] },
    { key: "xp_ledger", table: "xp_ledger", filters: [["user_id", userId]] },
    { key: "streak_freeze_days", table: "streak_freeze_days", filters: [["user_id", userId]] },
    { key: "daily_missions", table: "daily_mission_assignments", filters: [["user_id", userId]] },
    { key: "feedback_sent", table: "app_feedback", filters: [["user_id", userId]] },
    { key: "privacy_settings", table: "user_privacy_settings", filters: [["user_id", userId]] },
    // Relations à deux extrémités : on interroge les deux côtés puis on fusionne.
    { key: "friendships", table: "friendships", or: `requester.eq.${userId},addressee.eq.${userId}` },
    { key: "private_messages", table: "private_messages", or: `sender_id.eq.${userId},receiver_id.eq.${userId}` },
  ];
}

async function fetchTable(supabase, entry) {
  const rows = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    let query = supabase.from(entry.table).select("*");
    for (const [column, value] of entry.filters || []) query = query.eq(column, value);
    if (entry.or) query = query.or(entry.or);

    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) return { rows: null, error };
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return { rows, error: null };
}

/**
 * Construit l'export complet.
 * @returns {Promise<{ export: object, notes: string[] }>}
 */
export async function buildDataExport(supabase, { user, profile }) {
  const userId = user?.id;
  const notes = [];
  const data = {};

  if (!userId) return { export: null, notes: ["missing-user"] };

  const results = await Promise.all(
    exportPlan(userId).map(async (entry) => {
      try {
        const { rows, error } = await fetchTable(supabase, entry);
        return { entry, rows, error };
      } catch (err) {
        return { entry, rows: null, error: err };
      }
    })
  );

  for (const { entry, rows, error } of results) {
    if (error) {
      // Table absente de ce projet, ou lecture refusée : on le DIT, on ne
      // laisse pas croire que la personne n'avait rien dans cette catégorie.
      notes.push(`${entry.key}: non exporté (${error.code || error.message || "erreur"})`);
      continue;
    }
    data[entry.key] = rows;
  }

  return {
    export: {
      _meta: {
        generated_at: new Date().toISOString(),
        format: "blocus-tracker-export/1",
        note:
          "Export de tes données personnelles (RGPD art. 15 et 20). Il contient ce que "
          + "tu as créé dans l'app. Les fichiers que tu as envoyés (photo de profil, photos "
          + "du feed, pièces jointes) ne sont pas inclus en binaire : leurs adresses figurent "
          + "dans les lignes correspondantes.",
      },
      account: {
        user_id: userId,
        email: profile?.email || user?.email || null,
        created_at: user?.created_at || profile?.created_at || null,
        last_sign_in_at: user?.last_sign_in_at || null,
      },
      profile: profile ? { ...profile } : null,
      ...data,
    },
    notes,
  };
}

/** Déclenche le téléchargement du fichier, côté navigateur. */
export function downloadJson(payload, filename) {
  if (typeof window === "undefined") return;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Révocation différée : Safari annule le téléchargement si l'URL disparaît
  // dans la même tâche que le clic.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
