import { createClient } from "@supabase/supabase-js";
import { getBearerToken, getClientIp, requireJson, setBaseSecurityHeaders } from "../../../lib/apiSecurity";
import { rateLimit } from "../../../lib/rateLimit";
import { storagePathFromReference } from "../../../lib/security";

export const config = {
  api: {
    bodyParser: { sizeLimit: "8kb" },
  },
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function publicUrlFor(bucket, path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

async function userCanAccessDmAttachment(admin, userId, path) {
  const refs = [`dm:${path}`, publicUrlFor("dm", path)];

  for (const ref of refs) {
    const { data, error } = await admin
      .from("private_messages")
      .select("id")
      .eq("attachment_url", ref)
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .limit(1)
      .maybeSingle();

    if (error) return false;
    if (data?.id) return true;
  }
  return false;
}

export default async function handler(req, res) {
  setBaseSecurityHeaders(res);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!requireJson(req, res)) return;

  const ip = getClientIp(req);
  const limited = rateLimit(`storage-sign:${ip}`, 60, 60_000);
  if (!limited.ok) {
    return res.status(429).json({ error: "Too many requests" });
  }

  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Server misconfigured" });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { bucket, ref } = req.body || {};
  if (bucket !== "dm" || typeof ref !== "string" || ref.length > 500) {
    return res.status(400).json({ error: "Invalid file reference" });
  }

  const path = storagePathFromReference(ref, bucket);
  if (!path || path.length > 400 || path.includes("..") || path.startsWith("/")) {
    return res.status(400).json({ error: "Invalid file reference" });
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userError || !userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const allowed = await userCanAccessDmAttachment(admin, userId, path);
  if (!allowed) {
    console.warn("storage/sign forbidden dm attachment request", {
      user: `${userId.slice(0, 8)}...`,
      path: `${path.slice(0, 24)}...`,
    });
    return res.status(403).json({ error: "Forbidden" });
  }

  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, 5 * 60);
  if (error || !data?.signedUrl) {
    console.warn("storage/sign failed", { bucket, code: error?.statusCode || null });
    return res.status(500).json({ error: "Could not sign file" });
  }

  return res.status(200).json({ signedUrl: data.signedUrl });
}
