import { useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../contexts/AuthContext";
import { useConsent } from "../contexts/ConsentContext";
import { supabase, isOfflineDev } from "../lib/supabaseClient";
import {
  claimCampaignForUser, cleanCampaignSlug, clearCampaignStorage, pruneCampaignStorage, recordCampaignLanding,
} from "../lib/campaignAttribution.mjs";

// Mounted once in _app. A campaign in the URL can live briefly in memory
// before the visitor chooses analytics consent; no optional browser storage or
// network call happens before that choice.
export default function CampaignCapture() {
  const router = useRouter();
  const { user } = useAuth();
  const { allows, hydrated, consent } = useConsent();
  const slugRef = useRef(null);
  const recordedRef = useRef(null);
  const claimRef = useRef(null);
  const revokeRef = useRef(null);
  const allowed = hydrated && allows("analytics");
  const explicitlyDenied = hydrated && Boolean(consent.decidedAt) && !allowed;

  useEffect(() => {
    const slug = cleanCampaignSlug(router.query.campaign);
    if (slug) slugRef.current = slug;
  }, [router.query.campaign]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    if (!allowed) {
      clearCampaignStorage(window.localStorage);
      recordedRef.current = null;
      return;
    }
    pruneCampaignStorage(window.localStorage);
    const slug = slugRef.current;
    if (!slug || isOfflineDev || recordedRef.current === slug) return;
    recordedRef.current = slug;
    recordCampaignLanding(supabase, window.localStorage, slug, Date.now(), allowed).then((result) => {
      if (!result) recordedRef.current = null;
    }).catch(() => { recordedRef.current = null; });
  }, [allowed, hydrated, router.query.campaign]);

  useEffect(() => {
    if (!hydrated || !user?.id || isOfflineDev || typeof window === "undefined") return;
    const signature = `${user.id}:${user.user_metadata?.pending_campaign_visit_id || ""}:${allowed}`;
    if (claimRef.current === signature) return;
    claimRef.current = signature;
    claimCampaignForUser(supabase, window.localStorage, user, allowed, explicitlyDenied).catch(() => {
      claimRef.current = null;
    });
  }, [user, hydrated, allowed, explicitlyDenied]);

  useEffect(() => {
    if (!user?.id || !explicitlyDenied || isOfflineDev) return;
    const signature = `${user.id}:${consent.decidedAt}`;
    if (revokeRef.current === signature) return;
    revokeRef.current = signature;
    supabase.rpc("revoke_acquisition_attribution").then(({ error }) => {
      if (error) revokeRef.current = null;
    }).catch(() => { revokeRef.current = null; });
    if (user.user_metadata?.pending_campaign_visit_id) {
      supabase.auth.updateUser({ data: { pending_campaign_visit_id: null } });
    }
  }, [user, explicitlyDenied, consent.decidedAt]);

  return null;
}
