import { supabaseAdmin } from "../lib/supabase.js";

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No autenticado" });

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ error: "Token inválido" });

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, avatar_url, home_id, role, points")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError) return res.status(500).json({ error: profileError.message });

  req.user = data.user;
  req.profile = profile;
  req.accessToken = token;
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.profile) return res.status(401).json({ error: "Sin perfil" });
    if (!roles.includes(req.profile.role)) {
      return res.status(403).json({ error: "Sin permiso para esta acción" });
    }
    next();
  };
}

export function requireHome(req, res, next) {
  if (!req.profile?.home_id) {
    return res.status(400).json({ error: "Únete o crea un hogar primero" });
  }
  next();
}
