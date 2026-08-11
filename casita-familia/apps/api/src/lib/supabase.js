import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const anonKey = (
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  ""
).trim();

export const isApiSupabaseConfigured = Boolean(url && serviceKey);

if (!isApiSupabaseConfigured) {
  console.warn(
    "[api] Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en apps/api/.env (solo backend).",
  );
}

export const supabaseAdmin = createClient(url || "http://127.0.0.1", serviceKey || "missing", {
  auth: { persistSession: false, autoRefreshToken: false },
});

export function supabaseAsUser(accessToken) {
  const key = anonKey || serviceKey;
  if (!url || !key) {
    throw new Error("Supabase no configurado en el API");
  }
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
