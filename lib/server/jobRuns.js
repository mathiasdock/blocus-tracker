// Passages des tâches planifiées (table system_job_runs, v60) — serveur uniquement.
//
// Chaque tâche cron inscrit son début, sa fin, son résultat et ses compteurs :
// la page Système de l'admin peut dire si elle a tourné, et sinon depuis
// quand. Un échec d'écriture ici ne doit JAMAIS empêcher la tâche elle-même
// de tourner : il est seulement signalé dans les logs.

export const JOB_RUN_RETENTION_DAYS = 90;

export async function startJobRun(admin, job) {
  const { data, error } = await admin
    .from("system_job_runs")
    .insert({ job, status: "running" })
    .select("id")
    .single();
  if (error) {
    console.warn("job run start not recorded", { job, code: error.code || null });
    return null;
  }
  return data?.id ?? null;
}

// status : "ok" | "error" | "skipped". details : compteurs sans donnée
// personnelle (jamais d'identifiant de membre).
export async function finishJobRun(admin, runId, status, details = {}) {
  if (!runId) return;
  const { error } = await admin
    .from("system_job_runs")
    .update({ status, finished_at: new Date().toISOString(), details })
    .eq("id", runId);
  if (error) console.warn("job run end not recorded", { status, code: error.code || null });
}

// Conservation : 90 jours. Appelé par la purge quotidienne.
export async function purgeOldJobRuns(admin) {
  const cutoff = new Date(Date.now() - JOB_RUN_RETENTION_DAYS * 864e5).toISOString();
  const { count, error } = await admin
    .from("system_job_runs")
    .delete({ count: "exact" })
    .lt("started_at", cutoff);
  if (error) {
    console.warn("job run retention purge failed", { code: error.code || null });
    return null;
  }
  return count || 0;
}
