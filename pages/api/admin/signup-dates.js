import { getClientIp, setBaseSecurityHeaders } from "../../../lib/apiSecurity";
import { rateLimit } from "../../../lib/rateLimit";
import { requireAdmin } from "../../../lib/server/adminAuth";

export const config = {
  api: {
    bodyParser: false,
  },
};

const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

export default async function handler(req, res) {
  setBaseSecurityHeaders(res);

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const limited = rateLimit(`admin-signup-dates:${getClientIp(req)}`, 15, 60_000);
  if (!limited.ok) {
    return res.status(429).json({ error: "Too many requests" });
  }

  const ctx = await requireAdmin(req, res, "admin/signup-dates");
  if (!ctx) return;
  const { admin } = ctx;

  // La vraie date d'inscription vit dans auth.users, pas dans profiles : une
  // fiche recréée après coup (compte à moitié créé, puis réparé) porte la date
  // de la réparation, ce qui faisait passer un ancien membre pour un nouveau.
  const signupDates = {};
  let truncated = false;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) {
      console.error("admin/signup-dates listUsers failed", { code: error.status || null });
      return res.status(502).json({ error: "Unable to load signup dates" });
    }
    // On ne renvoie QUE l'id et la date : listUsers expose aussi les emails,
    // qui ne doivent jamais transiter vers le navigateur.
    const users = data?.users || [];
    users.forEach((user) => {
      if (user?.id && user.created_at) signupDates[user.id] = user.created_at;
    });
    if (users.length < PAGE_SIZE) break;
    if (page === MAX_PAGES) truncated = true;
  }

  return res.status(200).json({
    signupDates,
    total: Object.keys(signupDates).length,
    truncated,
  });
}
