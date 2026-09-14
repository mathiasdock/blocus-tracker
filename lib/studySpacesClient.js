import { supabase } from "./supabaseClient";

export const SPACE_COLUMNS = "id,kind,name,parent_id,broader_id,university_id,field_id,exam_date,member_count,recent_posts,last_activity";
export const POST_COLUMNS = "id,community,user_id,content,content_type,parent_id,exam_date,attachment_url,attachment_type,attachment_name,created_at";
export function requireData(result) {
  if (result.error) throw result.error;
  return result.data;
}
export async function fetchStudyDirectory(userId, query = "") {
  const memberships = requireData(await supabase.from("study_space_members").select("space_id").eq("user_id", userId).limit(200)) || [];
  const ids = memberships.map(row => row.space_id);
  let discover = supabase.from("study_space_directory").select(SPACE_COLUMNS);
  const search = query.trim().replace(/[%_\\]/g, "\\$&").slice(0, 120);
  if (search) discover = discover.ilike("search_text", `%${search}%`);
  else discover = discover.or("kind.eq.field,kind.eq.hub,recent_posts.gt.0");
  discover = discover.order("recent_posts", { ascending: false }).order("name").limit(40);
  const [found, owned] = await Promise.all([
    discover.then(requireData),
    ids.length ? supabase.from("study_space_directory").select(SPACE_COLUMNS).in("id", ids).then(requireData) : [],
  ]);
  const map = new Map([...(found || []), ...(owned || [])].map(row => [row.id, row]));
  // Resolve parents in bounded batches, so breadcrumbs and broader spaces work
  // even when they are outside the current search result or discovery page.
  for (let depth = 0; depth < 6; depth += 1) {
    const missing = [...new Set([...map.values()].flatMap(row => [row.parent_id, row.broader_id]).filter(id => id && !map.has(id)))];
    if (!missing.length) break;
    const rows = requireData(await supabase.from("study_space_directory").select(SPACE_COLUMNS).in("id", missing)) || [];
    if (!rows.length) break;
    rows.forEach(row => map.set(row.id, row));
  }
  return { spaces: [...map.values()], memberships: ids, results: (found || []).map(row => row.id) };
}
export async function ensureStudySpace(values) {
  return requireData(await supabase.rpc("ensure_study_space", {
    p_kind: values.kind, p_name: values.name.trim(), p_parent: values.parent_id || "study-hub",
    p_field: values.field_id || null, p_exam_date: values.exam_date || null,
  }));
}
export async function joinStudySpace(userId, spaceId) {
  const result = await supabase.from("study_space_members").insert({ user_id: userId, space_id: spaceId });
  if (result.error && result.error.code !== "23505") throw result.error;
}
