import { useEffect, useState, useCallback, useRef } from "react";
import Layout, { Avatar } from "../components/Layout";
import UserProfileModal from "../components/UserProfileModal";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { supabase } from "../lib/supabaseClient";
import { displayName, timeAgo } from "../lib/format";

export default function Groupes() {
  const { user, profile } = useAuth();
  const { t, lang } = useI18n();
  const isAdmin = profile?.is_admin === true;

  const [groups, setGroups]       = useState([]);
  const [activeId, setActiveId]   = useState(null);
  const [messages, setMessages]   = useState([]);
  const [members, setMembers]     = useState([]);
  const [profiles, setProfiles]   = useState({});
  const [text, setText]           = useState("");
  const [file, setFile]           = useState(null);
  const [sending, setSending]     = useState(false);

  const [showCreate, setShowCreate]   = useState(false);
  const [createForm, setCreateForm]   = useState({ name: "", description: "" });
  const [creating, setCreating]       = useState(false);
  const [createStep, setCreateStep]   = useState(1);
  const [createdGroupId, setCreatedGroupId] = useState(null);
  const [createInviteQuery, setCreateInviteQuery]     = useState("");
  const [createInviteResults, setCreateInviteResults] = useState([]);

  const [showInvite, setShowInvite]     = useState(false);
  const [inviteQuery, setInviteQuery]   = useState("");
  const [inviteResults, setInviteResults] = useState([]);
  const [inviting, setInviting]         = useState(null);

  const [viewUserId, setViewUserId] = useState(null);
  const bottomRef   = useRef(null);
  const fileInputRef = useRef(null);

  const activeGroup = groups.find(g => g.id === activeId);
  const amCreator   = activeGroup?.created_by === user?.id;

  const loadGroups = useCallback(async () => {
    if (!user) return;
    const { data: myMem } = await supabase
      .from("group_members").select("group_id, role").eq("user_id", user.id);
    if (!myMem?.length) { setGroups([]); return; }
    const ids = myMem.map(m => m.group_id);
    const { data: grps } = await supabase
      .from("study_groups").select("*").in("id", ids).order("created_at", { ascending: false });
    const roleMap = Object.fromEntries(myMem.map(m => [m.group_id, m.role]));
    const enriched = (grps || []).map(g => ({ ...g, myRole: roleMap[g.id] || "member" }));
    setGroups(enriched);
    if (enriched.length && !activeId) setActiveId(enriched[0].id);
  }, [user, activeId]);

  const loadMessages = useCallback(async () => {
    if (!activeId) return;
    const { data } = await supabase
      .from("group_messages").select("*").eq("group_id", activeId)
      .order("created_at", { ascending: true }).limit(200);
    setMessages(data || []);
    const ids = [...new Set((data || []).map(m => m.user_id))];
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles").select("id, pseudo, first_name, last_name, avatar_url").in("id", ids);
      const map = {};
      (profs || []).forEach(p => (map[p.id] = p));
      setProfiles(map);
    }
  }, [activeId]);

  const loadMembers = useCallback(async () => {
    if (!activeId) return;
    const { data } = await supabase
      .from("group_members").select("user_id, role, joined_at").eq("group_id", activeId);
    const ids = (data || []).map(m => m.user_id);
    if (!ids.length) { setMembers([]); return; }
    const { data: profs } = await supabase
      .from("profiles").select("id, pseudo, first_name, last_name, avatar_url").in("id", ids);
    const profMap = Object.fromEntries((profs || []).map(p => [p.id, p]));
    setMembers((data || []).map(m => ({ ...m, profile: profMap[m.user_id] })));
  }, [activeId]);

  useEffect(() => { loadGroups(); }, [loadGroups]);
  useEffect(() => {
    if (!activeId) return;
    setMessages([]);
    loadMessages();
    loadMembers();
  }, [activeId]); // eslint-disable-line
  useEffect(() => {
    const id = setInterval(loadMessages, 5000);
    return () => clearInterval(id);
  }, [loadMessages]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim() && !file) return;
    setSending(true);
    let attachment_url = null, attachment_type = null, attachment_name = null;
    if (file) {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${activeId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("community").upload(path, file);
      if (upErr) { setSending(false); alert("Erreur upload : " + upErr.message); return; }
      const { data: pub } = supabase.storage.from("community").getPublicUrl(path);
      attachment_url = pub.publicUrl;
      attachment_type = file.type.startsWith("image/") ? "image" : "file";
      attachment_name = file.name;
    }
    await supabase.from("group_messages").insert({
      group_id: activeId, user_id: user.id,
      content: text.trim() || null,
      attachment_url, attachment_type, attachment_name,
    });
    setText(""); setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setSending(false);
    loadMessages();
  }

  async function removeMessage(id) {
    await supabase.from("group_messages").delete().eq("id", id);
    loadMessages();
  }

  async function createGroup(e) {
    e.preventDefault();
    if (!createForm.name.trim()) return;
    setCreating(true);
    // NOTE: requires the SQL policy "creator_see_own_group" on study_groups:
    //   CREATE POLICY "creator_see_own_group" ON study_groups FOR SELECT USING (auth.uid() = created_by);
    const { data: grp, error } = await supabase.from("study_groups")
      .insert({ name: createForm.name.trim(), description: createForm.description.trim() || null, created_by: user.id })
      .select().single();
    if (error || !grp) { setCreating(false); return; }
    await supabase.from("group_members").insert({ group_id: grp.id, user_id: user.id, role: "admin" });
    setCreatedGroupId(grp.id);
    setCreateStep(2);
    setCreating(false);
    setActiveId(grp.id);
    await loadGroups();
  }

  async function searchCreateInvite(q) {
    setCreateInviteQuery(q);
    if (!q.trim()) { setCreateInviteResults([]); return; }
    const { data } = await supabase.from("profiles")
      .select("id, pseudo, first_name, last_name, avatar_url")
      .ilike("pseudo", `%${q}%`).limit(8);
    setCreateInviteResults((data || []).filter(p => p.id !== user.id));
  }

  async function inviteToNewGroup(userId) {
    if (!createdGroupId) return;
    await supabase.from("group_members").insert({ group_id: createdGroupId, user_id: userId, role: "member" });
    setCreateInviteResults(prev => prev.filter(p => p.id !== userId));
    loadMembers();
  }

  function closeCreateModal() {
    setShowCreate(false);
    setCreateStep(1);
    setCreateForm({ name: "", description: "" });
    setCreatedGroupId(null);
    setCreateInviteQuery("");
    setCreateInviteResults([]);
  }

  async function leaveGroup() {
    if (!activeId || !window.confirm("Quitter ce groupe ?")) return;
    await supabase.from("group_members").delete().eq("group_id", activeId).eq("user_id", user.id);
    setActiveId(null);
    loadGroups();
  }

  async function deleteGroup() {
    if (!activeId || !window.confirm("Supprimer ce groupe définitivement ?")) return;
    await supabase.from("study_groups").delete().eq("id", activeId);
    setActiveId(null);
    loadGroups();
  }

  async function removeMember(userId) {
    await supabase.from("group_members").delete().eq("group_id", activeId).eq("user_id", userId);
    loadMembers();
  }

  async function searchInvite(q) {
    setInviteQuery(q);
    if (!q.trim()) { setInviteResults([]); return; }
    const { data } = await supabase.from("profiles")
      .select("id, pseudo, first_name, last_name, avatar_url")
      .ilike("pseudo", `%${q}%`).limit(8);
    const memberIds = new Set(members.map(m => m.user_id));
    setInviteResults((data || []).filter(p => !memberIds.has(p.id) && p.id !== user.id));
  }

  async function inviteUser(userId) {
    setInviting(userId);
    await supabase.from("group_members").insert({ group_id: activeId, user_id: userId, role: "member" });
    setInviting(null);
    loadMembers();
    setInviteResults(prev => prev.filter(p => p.id !== userId));
  }

  const who = id => profiles[id] || { pseudo: "Utilisateur", avatar_url: null };

  return (
    <Layout>
      <h1 className="text-2xl mb-0.5" style={{ color: "#1F1A17" }}>{t("groups.title")}</h1>
      <p className="text-sm mb-6" style={{ color: "#7C746E" }}>{t("groups.subtitle")}</p>

      <div className="grid gap-5 lg:grid-cols-4">
        {/* Sidebar */}
        <aside className="lg:col-span-1 space-y-1">
          <button onClick={() => setShowCreate(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-2xl text-sm font-semibold transition-all mb-2"
            style={{ backgroundColor: "#EAFBF4", color: "#0E8F68", border: "1px solid #C6EED9" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            {t("groups.create")}
          </button>

          {groups.length === 0 && (
            <p className="text-xs text-center py-4" style={{ color: "#A8A09A" }}>{t("groups.noGroups")}</p>
          )}
          {groups.map(g => {
            const isAct = g.id === activeId;
            return (
              <button key={g.id} onClick={() => setActiveId(g.id)}
                className="relative w-full text-left rounded-2xl px-3 py-2.5 transition-all"
                style={isAct
                  ? { backgroundColor: "#EAFBF4", color: "#0E8F68" }
                  : { color: "#7C746E" }}
                onMouseEnter={e => { if (!isAct) e.currentTarget.style.backgroundColor = "#F7F3EF"; }}
                onMouseLeave={e => { if (!isAct) e.currentTarget.style.backgroundColor = ""; }}>
                {isAct && (
                  <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
                    style={{ backgroundColor: "#14B885" }} />
                )}
                <p className={`text-sm ${isAct ? "font-semibold" : "font-medium"}`}>{g.name}</p>
                {g.description && (
                  <p className="text-xs truncate" style={{ color: "#A8A09A" }}>{g.description}</p>
                )}
              </button>
            );
          })}
        </aside>

        {/* Chat */}
        {activeId ? (
          <section className="lg:col-span-3 card flex flex-col h-[72vh]">
            {/* Header */}
            <div className="px-5 py-3 flex items-center gap-3 shrink-0"
              style={{ borderBottom: "1px solid #E8E2DC" }}>
              <div className="flex-1">
                <h2 className="text-sm font-semibold" style={{ color: "#1F1A17" }}>{activeGroup?.name}</h2>
                <p className="text-xs" style={{ color: "#A8A09A" }}>
                  {members.length} membre{members.length > 1 ? "s" : ""}
                  {activeGroup?.description ? ` · ${activeGroup.description}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setShowInvite(v => !v); setInviteQuery(""); setInviteResults([]); }}
                  className="btn-ghost text-xs px-3 py-1.5">
                  {t("groups.invite")}
                </button>
                {amCreator ? (
                  <button onClick={deleteGroup} className="text-xs transition-colors"
                    style={{ color: "#D0C9C3" }}
                    onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
                    onMouseLeave={e => e.currentTarget.style.color = "#D0C9C3"}>
                    {t("groups.delete")}
                  </button>
                ) : (
                  <button onClick={leaveGroup} className="text-xs transition-colors"
                    style={{ color: "#D0C9C3" }}
                    onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
                    onMouseLeave={e => e.currentTarget.style.color = "#D0C9C3"}>
                    {t("groups.leave")}
                  </button>
                )}
              </div>
            </div>

            {/* Invite panel */}
            {showInvite && (
              <div className="px-4 py-3 shrink-0" style={{ borderBottom: "1px solid #E8E2DC", backgroundColor: "#F7F3EF" }}>
                <input className="input text-sm mb-2" placeholder={t("groups.searchUser")}
                  value={inviteQuery} onChange={e => searchInvite(e.target.value)} />
                {inviteResults.length > 0 && (
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {inviteResults.map(p => (
                      <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-xl"
                        style={{ backgroundColor: "#FFFDFB" }}>
                        <Avatar url={p.avatar_url} pseudo={displayName(p)} size={24} />
                        <span className="flex-1 text-sm font-medium" style={{ color: "#1F1A17" }}>
                          {displayName(p)}
                          <span className="font-normal text-xs ml-1" style={{ color: "#A8A09A" }}>@{p.pseudo}</span>
                        </span>
                        <button onClick={() => inviteUser(p.id)} disabled={inviting === p.id}
                          className="text-xs font-semibold px-3 py-1 rounded-lg"
                          style={{ backgroundColor: "#14B885", color: "#fff" }}>
                          {inviting === p.id ? "…" : "Inviter"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {/* Member list */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {members.map(m => (
                    <span key={m.user_id} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                      style={{ backgroundColor: "#FFFDFB", border: "1px solid #E8E2DC", color: "#7C746E" }}>
                      {displayName(m.profile)}
                      {m.role === "admin" && <span style={{ color: "#14B885" }}>★</span>}
                      {(isAdmin || (amCreator && m.user_id !== user.id)) && (
                        <button onClick={() => removeMember(m.user_id)}
                          className="ml-0.5 hover:text-red-500" style={{ color: "#D0C9C3" }}>✕</button>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {messages.length === 0 && (
                <p className="text-center text-sm mt-10" style={{ color: "#A8A09A" }}>
                  Aucun message. Lance la discussion !
                </p>
              )}
              {messages.map(m => {
                const author = who(m.user_id);
                const mine = m.user_id === user.id;
                return (
                  <div key={m.id} className={`flex gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                    <button onClick={() => setViewUserId(m.user_id)} className="shrink-0">
                      <Avatar url={author.avatar_url} pseudo={displayName(author)} size={30} />
                    </button>
                    <div className={`max-w-[72%] ${mine ? "items-end text-right" : "items-start"} flex flex-col`}>
                      <span className="text-[11px] mb-0.5" style={{ color: "#A8A09A" }}>
                        {displayName(author)} · {timeAgo(m.created_at, lang)}
                      </span>
                      <div className="rounded-2xl px-3.5 py-2.5 text-sm"
                        style={mine
                          ? { backgroundColor: "#14B885", color: "#fff", borderRadius: "18px 18px 6px 18px" }
                          : { backgroundColor: "#F7F3EF", color: "#1F1A17", borderRadius: "18px 18px 18px 6px" }}>
                        {m.content && <p className="whitespace-pre-wrap">{m.content}</p>}
                        {m.attachment_url && m.attachment_type === "image" && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.attachment_url} alt={m.attachment_name || "image"}
                            className="mt-2 rounded-xl max-h-60 object-cover" />
                        )}
                        {m.attachment_url && m.attachment_type === "file" && (
                          <a href={m.attachment_url} target="_blank" rel="noreferrer"
                            className="mt-2 inline-flex items-center gap-2 underline"
                            style={{ color: mine ? "#fff" : "#0E8F68" }}>
                            📎 {m.attachment_name || "Document"}
                          </a>
                        )}
                      </div>
                      {(mine || isAdmin) && (
                        <button onClick={() => removeMessage(m.id)}
                          className="text-[10px] mt-0.5 transition-colors"
                          style={{ color: "#D0C9C3" }}
                          onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
                          onMouseLeave={e => e.currentTarget.style.color = "#D0C9C3"}>
                          supprimer
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <form onSubmit={send} className="p-3 flex items-center gap-2 shrink-0"
              style={{ borderTop: "1px solid #E8E2DC" }}>
              <label className="btn-ghost cursor-pointer px-3 shrink-0" title="Joindre un fichier">
                📎
                <input ref={fileInputRef} type="file"
                  accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt"
                  className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
              </label>
              <input className="input flex-1"
                placeholder={file ? `Fichier : ${file.name}` : "Écris un message…"}
                value={text} onChange={e => setText(e.target.value)} />
              <button className="btn-primary shrink-0" disabled={sending || (!text.trim() && !file)}>
                {sending ? "…" : t("common.send")}
              </button>
            </form>
          </section>
        ) : (
          <section className="lg:col-span-3 card flex items-center justify-center h-[72vh]">
            <div className="text-center space-y-3">
              <p className="text-sm" style={{ color: "#A8A09A" }}>
                {groups.length === 0 ? t("groups.noGroups") : "Sélectionne un groupe"}
              </p>
              {groups.length === 0 && (
                <button onClick={() => setShowCreate(true)} className="btn-primary text-sm px-6">
                  {t("groups.create")}
                </button>
              )}
            </div>
          </section>
        )}
      </div>

      {/* Create group modal — 2-step */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(31,26,23,0.4)" }}
          onClick={e => { if (e.target === e.currentTarget) closeCreateModal(); }}>
          <div className="card p-6 w-full max-w-sm">
            {createStep === 1 ? (
              <form onSubmit={createGroup} className="space-y-4">
                <h2 className="text-lg font-semibold" style={{ color: "var(--bt-text-1)" }}>{t("groups.create")}</h2>
                <input className="input" required
                  placeholder={t("groups.groupName")}
                  value={createForm.name}
                  onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} />
                <textarea className="input" rows={2}
                  placeholder={t("groups.description")}
                  value={createForm.description}
                  onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} />
                <div className="flex gap-2">
                  <button type="submit" disabled={creating} className="btn-primary flex-1">
                    {creating ? "Création…" : "Créer"}
                  </button>
                  <button type="button" onClick={closeCreateModal} className="btn-ghost flex-1">
                    {t("common.cancel")}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                <div>
                  <h2 className="text-lg font-semibold" style={{ color: "var(--bt-text-1)" }}>Inviter des amis</h2>
                  <p className="text-xs mt-0.5" style={{ color: "var(--bt-text-3)" }}>
                    Recherche des utilisateurs à ajouter au groupe.
                  </p>
                </div>
                <input className="input text-sm" autoFocus
                  placeholder={t("groups.searchUser")}
                  value={createInviteQuery}
                  onChange={e => searchCreateInvite(e.target.value)} />
                {createInviteResults.length > 0 && (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {createInviteResults.map(p => (
                      <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-xl"
                        style={{ backgroundColor: "var(--bt-subtle)" }}>
                        <Avatar url={p.avatar_url} pseudo={displayName(p)} size={26} />
                        <span className="flex-1 text-sm font-medium truncate" style={{ color: "var(--bt-text-1)" }}>
                          {displayName(p)}
                          <span className="font-normal text-xs ml-1" style={{ color: "var(--bt-text-3)" }}>@{p.pseudo}</span>
                        </span>
                        <button onClick={() => inviteToNewGroup(p.id)}
                          className="text-xs font-semibold px-3 py-1 rounded-lg shrink-0"
                          style={{ backgroundColor: "#14B885", color: "#fff" }}>
                          Inviter
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={closeCreateModal} className="btn-primary w-full mt-1">
                  Terminer
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {viewUserId && (
        <UserProfileModal userId={viewUserId} onClose={() => setViewUserId(null)} />
      )}
    </Layout>
  );
}
