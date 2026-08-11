import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { supabase, pseudoToEmail, isOfflineDev } from "../lib/supabaseClient";
import { classifyAuthError } from "../lib/authLogin.mjs";
import {
  canStartProfileRequest,
  isCurrentProfileRequest,
} from "../lib/authProfile.mjs";
import { getSiteUrl } from "../lib/siteUrl";

const AuthContext = createContext(null);

function detectTimezone() {
  if (typeof Intl === "undefined") return "Europe/Paris";
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris";
}

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
  "timezone",
].join(",");

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileStatus, setProfileStatus] = useState("idle");
  const profileRequestRef = useRef(0);
  const activeUserIdRef = useRef(null);

  const loadProfile = useCallback(async (uid) => {
    if (!uid) {
      profileRequestRef.current += 1;
      setProfile(null);
      setProfileStatus("idle");
      return;
    }
    // A callback retained by a component from the previous account must not
    // even start a request, otherwise it could cancel and overwrite B with A.
    if (!canStartProfileRequest(uid, activeUserIdRef.current)) return;

    const requestId = ++profileRequestRef.current;
    const requestIsCurrent = () => isCurrentProfileRequest({
      requestId,
      currentRequestId: profileRequestRef.current,
      requestedUserId: uid,
      activeUserId: activeUserIdRef.current,
    });

    setProfileStatus("loading");
    let data = null;
    let email = null;
    const retryDelays = [0, 250, 750];

    // A transient network failure immediately after sign-in must not strand a
    // valid user on the login form. Retry briefly, while every await remains
    // tied to both the request generation and the active Auth UUID.
    for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
      if (retryDelays[attempt] > 0) {
        await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
      }
      if (!requestIsCurrent()) return;

      try {
        const profileResult = await supabase
          .from("profiles")
          .select(PROFILE_COLUMNS)
          .eq("id", uid)
          .maybeSingle();
        if (!requestIsCurrent()) return;
        if (profileResult.error) throw profileResult.error;

        // Supabase Auth is the only trusted source for the login/recovery
        // email. A profile is never committed until its UUID is confirmed by
        // the Auth server, even though profile rows are broadly readable.
        const userResult = await supabase.auth.getUser();
        if (!requestIsCurrent()) return;
        if (userResult.error || userResult.data?.user?.id !== uid) {
          throw userResult.error || new Error("profile_auth_mismatch");
        }

        if (!profileResult.data) {
          setProfile(null);
          setProfileStatus("missing");
          return;
        }

        data = profileResult.data;
        const authEmail = userResult.data.user.email || "";
        if (authEmail && !/@blocus\.local$/i.test(authEmail)) email = authEmail;
        break;
      } catch {
        if (!requestIsCurrent()) return;
        if (attempt === retryDelays.length - 1) {
          setProfile(null);
          setProfileStatus("error");
          return;
        }
      }
    }

    if (!data || !requestIsCurrent()) return;

    const deviceTimezone = detectTimezone();
    if (deviceTimezone && data.timezone !== deviceTimezone) {
      let timezoneError = null;
      try {
        ({ error: timezoneError } = await supabase
          .from("profiles")
          .update({ timezone: deviceTimezone })
          .eq("id", uid));
      } catch {
        timezoneError = new Error("timezone_update_failed");
      }
      if (!requestIsCurrent()) return;
      if (!timezoneError) data.timezone = deviceTimezone;
    }

    if (!requestIsCurrent()) return;
    setProfile({ ...data, email });
    setProfileStatus("ready");
  }, []);

  useEffect(() => {
    let mounted = true;

    // Last-resort UI fallback. Normal initialization completes through the
    // INITIAL_SESSION event; later auth events still repair state if this fires.
    const safety = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 12000);

    // IMPORTANT: the onAuthStateChange callback must stay synchronous.
    // Awaiting a Supabase query here deadlocks the internal auth lock
    // (this was the cause of the infinite loading on refresh). We defer
    // the profile fetch outside the callback with setTimeout.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      clearTimeout(safety);
      setUser(session?.user ?? null);
      setLoading(false);
      const uid = session?.user?.id;
      if (activeUserIdRef.current !== (uid || null)) setProfile(null);
      activeUserIdRef.current = uid || null;
      if (uid) {
        // Cancel an in-flight request for the previous account immediately;
        // the deferred fetch below receives its own generation number.
        profileRequestRef.current += 1;
        setProfileStatus("loading");
        setTimeout(() => {
          if (mounted) loadProfile(uid);
        }, 0);
      } else {
        loadProfile(null);
      }
    });

    return () => {
      mounted = false;
      activeUserIdRef.current = null;
      profileRequestRef.current += 1;
      clearTimeout(safety);
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  // ---------------------------------------------------------------
  // signUp — nouveaux utilisateurs avec vrai email
  //   Anciens utilisateurs : toujours via pseudoToEmail (inchangé)
  // ---------------------------------------------------------------
  const signUp = useCallback(async (pseudo, password, email, firstName, lastName, university, referralCode, studyField = "", studyYear = "") => {
    const clean = pseudo.trim();
    const fn    = (firstName  || "").trim();
    const ln    = (lastName   || "").trim();
    const uni   = (university || "").trim() || null;
    const field = (studyField || "").trim() || null;
    const year  = (studyYear  || "").trim() || null;
    const em    = (email      || "").trim().toLowerCase();
    const ref   = (referralCode || "").trim().toUpperCase() || null;

    if (clean.length < 3)   return { error: "Le pseudo doit faire au moins 3 caractères." };
    if (!fn || !ln)          return { error: "Le prénom et le nom sont obligatoires." };
    if (!uni)                return { error: "L'établissement est obligatoire." };
    if (password.length < 6) return { error: "Le mot de passe doit faire au moins 6 caractères." };
    if (!em)                 return { error: "L'adresse email est obligatoire." };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em))
      return { error: "L'adresse email n'est pas valide." };

    // Vérifier disponibilité du pseudo
    let { data: pseudoAvailable, error: availabilityError } = await supabase
      .rpc("is_pseudo_available", { p_pseudo: clean });
    // Rolling-deploy compatibility: the frontend may reach production a few
    // minutes before the manual v37 migration. This path becomes unusable as
    // soon as v37 revokes anonymous profile SELECT.
    if (availabilityError?.code === "PGRST202") {
      const legacy = await supabase
        .from("profiles")
        .select("id")
        .eq("pseudo", clean)
        .maybeSingle();
      pseudoAvailable = !legacy.data;
      availabilityError = legacy.error;
    }
    if (availabilityError) {
      return {
        error: "Impossible de vérifier ce pseudo pour le moment.",
        errorCode: "PSEUDO_CHECK_FAILED",
      };
    }
    if (pseudoAvailable !== true) {
      return { error: "Ce pseudo est déjà pris.", errorCode: "PSEUDO_TAKEN" };
    }

    // Note : la vérification de l'unicité de l'email est gérée
    // par Supabase Auth et l'index unique sur profiles.email.

    // Une création Auth réussie suivie d'un INSERT profiles en échec laisse
    // une session valide sans profil. Réutiliser cette session permet au même
    // formulaire de terminer l'inscription au lieu d'afficher "email pris".
    let uid = null;
    const { data: currentAuthData } = await supabase.auth.getUser();
    const currentAuthUser = currentAuthData?.user || null;

    if (currentAuthUser?.id) {
      if ((currentAuthUser.email || "").toLowerCase() !== em) {
        return { error: "Une autre session est déjà active.", errorCode: "ACTIVE_SESSION" };
      }

      const { data: existingProfile, error: profileLookupError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", currentAuthUser.id)
        .maybeSingle();
      if (profileLookupError) {
        return { error: "Impossible de vérifier le profil pour le moment.", errorCode: "PROFILE_CHECK_FAILED" };
      }
      if (existingProfile) {
        return { error: "Cet email est déjà utilisé.", errorCode: "EMAIL_TAKEN" };
      }
      uid = currentAuthUser.id;
    }

    if (!uid) {
      // Créer le compte Supabase Auth avec le vrai email.
      const siteUrl = getSiteUrl();
      const { data, error } = await supabase.auth.signUp({
        email: em,
        password,
        options: { emailRedirectTo: `${siteUrl}/onboarding` },
      });

      if (error) {
        const alreadyRegistered = error.code === "user_already_exists"
          || /already (?:been )?registered/i.test(error.message || "");

        if (!alreadyRegistered) return { error: error.message, errorCode: "AUTH_SIGNUP_FAILED" };

        // Répare aussi un compte incomplet depuis un autre navigateur : le mot
        // de passe fourni doit être valide et aucun profil ne doit déjà exister.
        const { data: recoveredAuth, error: recoveryError } = await supabase.auth.signInWithPassword({
          email: em,
          password,
        });
        if (recoveryError || !recoveredAuth.user?.id) {
          return { error: error.message, errorCode: "EMAIL_TAKEN" };
        }

        const { data: recoveredProfile, error: recoveredProfileError } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", recoveredAuth.user.id)
          .maybeSingle();

        if (recoveredProfileError || recoveredProfile) {
          await supabase.auth.signOut({ scope: "local" });
          return {
            error: recoveredProfileError ? "Impossible de vérifier le profil pour le moment." : error.message,
            errorCode: recoveredProfileError ? "PROFILE_CHECK_FAILED" : "EMAIL_TAKEN",
          };
        }
        uid = recoveredAuth.user.id;
      } else {
        uid = data.user?.id || null;
      }
    }

    if (!uid) {
      return { error: "Le compte n'a pas pu être initialisé.", errorCode: "AUTH_SIGNUP_FAILED" };
    }

    if (uid) {
      const { error: pErr } = await supabase
        .from("profiles")
        .insert({
          id: uid, pseudo: clean, email: em, first_name: fn, last_name: ln,
          university: uni, study_field: field, study_year: year,
          timezone: detectTimezone(),
        });
      if (pErr) {
        const pseudoConflict = pErr.code === "23505" && /pseudo/i.test(`${pErr.message || ""} ${pErr.details || ""}`);
        return {
          error: pseudoConflict ? "Ce pseudo est déjà pris." : "Le profil n'a pas pu être enregistré.",
          errorCode: pseudoConflict ? "PSEUDO_TAKEN" : "PROFILE_CREATE_FAILED",
        };
      }

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
    return { error: null, errorCode: null, userId: uid || null };
  }, [loadProfile]);

  // ---------------------------------------------------------------
  // signIn — accepte un pseudo OU un email directement.
  //   Si loginId contient '@' → signInWithPassword direct (email connu côté client).
  //   Sinon → POST /api/login (résolution email côté serveur via service_role)
  //   Cela évite l'exposition des emails via get_login_email côté anon.
  // ---------------------------------------------------------------
  const signIn = useCallback(async (loginId, password) => {
    const clean = (loginId || "").trim();

    const loginError = (error) => {
      const kind = classifyAuthError(error);
      if (kind === "rate_limited") return "LOGIN_RATE_LIMITED";
      if (kind === "unavailable") return "LOGIN_UNAVAILABLE";
      return "LOGIN_INVALID_CREDENTIALS";
    };

    if (isOfflineDev) {
      const { error } = await supabase.auth.signInWithPassword({
        email: clean.includes("@") ? clean.toLowerCase() : pseudoToEmail(clean || "mathias"),
        password,
      });
      if (error) return { error: loginError(error) };
      return { error: null };
    }

    // Cas 1 : email fourni → signin direct
    if (clean.includes("@")) {
      try {
        const { error } = await supabase.auth.signInWithPassword({
          email: clean.toLowerCase(),
          password,
        });
        if (error) return { error: loginError(error) };
        return { error: null };
      } catch {
        return { error: "LOGIN_UNAVAILABLE" };
      }
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
      if (res.status === 400 || res.status === 401) {
        return { error: "LOGIN_INVALID_CREDENTIALS" };
      }
      if (!res.ok) return { error: "LOGIN_UNAVAILABLE" };

      const { session } = await res.json();
      if (!session?.access_token || !session?.refresh_token) {
        return { error: "LOGIN_INVALID_CREDENTIALS" };
      }

      const { error } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      if (error) return { error: "LOGIN_UNAVAILABLE" };

      return { error: null };
    } catch {
      // A server/network failure is not proof that the credentials are wrong.
      // Never fall back to a guessed Auth email: that could target another user.
      return { error: "LOGIN_UNAVAILABLE" };
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

    // Supabase Auth validates the change first. The database trigger copies
    // only the confirmed Auth email to profiles afterwards.
    const siteUrl = getSiteUrl();
    const { error: aErr } = await supabase.auth.updateUser(
      { email: em },
      { emailRedirectTo: `${siteUrl}/profile?email-change=confirmed` }
    );
    if (aErr) {
      if (classifyAuthError(aErr) === "rate_limited") {
        return { error: "Un email vient déjà d'être envoyé. Réessaie dans une minute." };
      }
      if (aErr.code === "email_exists" || aErr.code === "user_already_exists") {
        return { error: "Cet email est déjà utilisé." };
      }
      return { error: "L'adresse email n'a pas pu être modifiée pour le moment." };
    }

    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    if (user) {
      await supabase.from("profiles").update({ studying_since: null }).eq("id", user.id);
    }
    await supabase.auth.signOut({ scope: "local" });
    await loadProfile(null);
  }, [user, loadProfile]);

  const refreshProfile = useCallback(() => loadProfile(user?.id), [user, loadProfile]);

  return (
    <AuthContext.Provider
      value={{ user, profile, profileStatus, loading, signUp, signIn, signOut, refreshProfile, updateEmail }}
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
