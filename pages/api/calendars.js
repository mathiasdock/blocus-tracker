import { createClient } from "@supabase/supabase-js";
import { getBearerToken, getClientIp, setBaseSecurityHeaders } from "../../lib/apiSecurity";
import { rateLimit } from "../../lib/rateLimit";
import { CalendarError } from "../../lib/server/calendarFeed.mjs";
import { createCalendarHandler } from "../../lib/server/calendarSync.mjs";

export const config = { api: { bodyParser: { sizeLimit: "8kb" } }, maxDuration: 30 };

async function authenticate(req) {
  const token = getBearerToken(req);
  if (!token) throw new CalendarError("unauthorized", 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !secret) throw new CalendarError("server_misconfigured", 500);
  const auth = { autoRefreshToken: false, persistSession: false };
  const userClient = createClient(url, key, { auth, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data?.user?.id) throw new CalendarError("unauthorized", 401);
  return { userClient, userId: data.user.id, admin: createClient(url, secret, { auth }) };
}

export default createCalendarHandler({ authenticate, setHeaders: setBaseSecurityHeaders, rateLimit, getIp: getClientIp });
