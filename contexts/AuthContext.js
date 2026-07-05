import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase, pseudoToEmail, isOfflineDev } from "../lib/supabaseClient";

const AuthContext = createContext(null);

const PROFILE_COLUMNS = [
  "id",
  "pseudo",
  "first_name",
  "last_name",
  "university",
  "study_field",
  "study_year",
  "bio",
  "avatar_url",
  "created_at",
  "is_admin",
  "locked",
  "studying_since",
  "referral_code",
  "referred_by",
  "bonus_xp",
  "lang",
  "planning_public",
].join(",");

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (uid) => {
    if (!uid) {
      setProfile(null);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", uid)
      .maybeSingle();
    if (!data) {
      setProfile(null);
      return;
    }

    let email = null;
    try {
      const { data: rpcEmail } = await supabase.rpc("get_my_email");
      if (typeof rpcEmail === "string") email = rpcEmail;
    } catch {}
    if (!email) {
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user?.id === uid) email = userData.user.email || null;
    }

    setProfile({ ...data, email });
  }, []);

  useEffect(() => {
    let mounted = true;

    // Hard safety net: the UI must never stay stuck on "Chargement…".
    const safety = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 6000);

    // IMPORTANT: the onAuthStateChange callback must stay synchronous.
    // Awaiting a Supabase query here deadlocks the internal auth lock
    // (this was the cause of the infinite loading on refresh). We defer
    // the profile fetch outside the callback with setTimeout.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      setLoading(false);
      const uid = session?.user?.id;
      if (uid) {
        setTimeout(() => {
          if (mounted) loadProfile(uid);
        }, 0);
      } else {
        setProfile(null);
      }
    });

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!mounted) return;
        setUser(session?.user ?? null);
        setLoading(false);
        const uid = session?.user?.id;
        if (uid) setTimeout(() => mounted && loadProfile(uid), 0);
      })
      .catch((e) => {
        console.error("Auth init error:", e);
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
      clearTimeout(safety);
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  // ---------------------------------------------------------------
  // signUp — nouveaux utilisateurs avec vrai email
  //   Anciens utilisateurs : toujours via pseudoToEmail (inchangé)
  // ---------------------------------------------------------------
  const signUp = useCallback(async (pseudo, password, email, firstName, lastName, university, referralCode) => {
    const clean = pseudo.trim();
    const fn    = (firstName  || "").trim();
    const ln    = (lastName   || "").trim();
    const uni   = (university || "").trim() || null;
    const em    = (email      || "").trim().toLowerCase();
    const ref   = (referralCode || "").trim().toUpperCase() || null;

    if (clean.length < 3)   return { error: "Le pseudo doit faire au moins 3 caractères." };
    if (!fn || !ln)          return { error: "Le prénom et le nom sont obligatoires." };
    if (password.length < 6) return { error: "Le mot de passe doit faire au moins 6 caractères." };
    if (!em)                 return { error: "L'adresse email est obligatoire." };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em))
      return { error: "L'adresse email n'est pas valide." };

    // Vérifier disponibilité du pseudo
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("pseudo", clean)
      .maybeSingle();
    if (existing) return { error: "Ce pseudo est déjà pris." };

    // Note : la vérification de l'unicité de l'email est gérée
    // par Supabase Auth et l'index unique sur profiles.email.

    // Créer le compte Supabase Auth avec le vrai email
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "");
    const { data, error } = await supabase.auth.signUp({
      email: em,
      password,
      options: { emailRedirectTo: `${siteUrl}/dashboard` },
    });
    if (error) return { error: error.message };

    const uid = data.user?.id;
    if (uid) {
      const { error: pErr } = await supabase
        .from("profiles")
        .insert({ id: uid, pseudo: clean, email: em, first_name: fn, last_name: ln, university: uni });
      if (pErr) return { error: "Compte créé mais profil non enregistré : " + pErr.message };

      // Parrainage : si un code valide a été stocké à l'arrivée, on l'applique
      // côté serveur via RPC SECURITY DEFINER. Erreurs silencieuses : un code
      // invalide ne doit pas bloquer la création du compte.
      if (ref) {
        try {
          await supabase.rpc("apply_referral", { p_code: ref });
        } catch (_) {
          // Pas critique. Le code reste en localStorage si jamais on veut retry.
        }
        try { localStorage.removeItem("bt_ref_code"); } catch (_) {}
      }

      await loadProfile(uid);
    }
    return { error: null };
  }, [loadProfile]);

  // ---------------------------------------------------------------
  // signIn — accepte un pseudo OU un email directement.
  //   Si loginId contient '@' → signInWithPassword direct (email connu côté client).
  //   Sinon → POST /api/login (résolution email côté serveur via service_role)
  //   Cela évite l'exposition des emails via get_login_email côté anon.
  // ---------------------------------------------------------------
  const signIn = useCallback(async (loginId, password) => {
    const clean = (loginId || "").trim();

    if (isOfflineDev) {
      const { error } = await supabase.auth.signInWithPassword({
        email: clean.includes("@") ? clean.toLowerCase() : pseudoToEmail(clean || "mathias"),
        password,
      });
      if (error) return { error: "LOGIN_INVALID_CREDENTIALS" };
      return { error: null };
    }

    // Cas 1 : email fourni → signin direct
    if (clean.includes("@")) {
      const { error } = await supabase.auth.signInWithPassword({
        email: clean.toLowerCase(),
        password,
      });
      if (error) return { error: "LOGIN_INVALID_CREDENTIALS" };
      return { error: null };
    }

    // Cas 2 : pseudo → résolution serveur via /api/login
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pseudo: clean, password }),
      });

      if (res.status === 429) {
        return { error: "LOGIN_RATE_LIMITED" };
      }
      if (!res.ok) {
        return { error: "LOGIN_INVALID_CREDENTIALS" };
      }

      const { session } = await res.json();
      if (!session?.access_token || !session?.refresh_token) {
        return { error: "LOGIN_INVALID_CREDENTIALS" };
      }

      const { error } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      if (error) return { error: "LOGIN_INVALID_CREDENTIALS" };

      return { error: null };
    } catch (e) {
      // Erreur réseau / serveur — fallback : on tente l'ancien chemin
      // (utile si le déploiement n'a pas encore l'API route).
      try {
        const fallback = pseudoToEmail(clean);
        const { error } = await supabase.auth.signInWithPassword({
          email: fallback,
          password,
        });
        if (error) return { error: "LOGIN_INVALID_CREDENTIALS" };
        return { error: null };
      } catch {
        return { error: "LOGIN_INVALID_CREDENTIALS" };
      }
    }
  }, []);

  // ---------------------------------------------------------------
  // updateEmail — utilisé dans la page profil pour les anciens
  //   utilisateurs qui veulent ajouter leur email
  // ---------------------------------------------------------------
  const updateEmail = useCallback(async (newEmail) => {
    const em = (newEmail || "").trim().toLowerCase();
    if (!em) return { error: "L'adresse email est obligatoire." };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em))
      return { error: "L'adresse email n'est pas valide." };

	    // Sauvegarder dans profiles
	    const { error: pErr } = await supabase
	      .from("profiles")
	      .update({ email: em })
	      .eq("id", (await supabase.auth.getUser()).data.user?.id);
	    if (pErr) {
	      if (pErr.code === "23505") return { error: "Cet email est déjà utilisé." };
	      return { error: pErr.message };
	    }

    // Mettre à jour l'email Supabase Auth (envoie un email de confirmation)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const { error: aErr } = await supabase.auth.updateUser(
      { email: em },
      { emailRedirectTo: `${siteUrl}/reset-password` }
    );
    if (aErr) return { error: aErr.message };

    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    if (user) {
      await supabase.from("profiles").update({ studying_since: null }).eq("id", user.id);
    }
    await supabase.auth.signOut();
    setProfile(null);
  }, [user]);

  const refreshProfile = useCallback(() => loadProfile(user?.id), [user, loadProfile]);

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, signUp, signIn, signOut, refreshProfile, updateEmail }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
