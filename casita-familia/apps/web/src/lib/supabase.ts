import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function readEnv(name: string): string | undefined {
  const value = import.meta.env[name] as string | undefined;
  if (!value || !String(value).trim()) return undefined;
  return String(value).trim();
}

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

/** Keys nuevas no son JWT: no deben ir como Bearer. */
function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (isNewSupabaseApiKey(supabaseKey) && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

const url = readEnv("VITE_SUPABASE_URL");
const key = readEnv("VITE_SUPABASE_ANON_KEY") || readEnv("VITE_SUPABASE_PUBLISHABLE_KEY");

export const isSupabaseConfigured = Boolean(url && key);

export const supabaseConfigError = !url
  ? "Falta VITE_SUPABASE_URL en apps/web/.env"
  : !key
    ? "Falta VITE_SUPABASE_ANON_KEY (anon/publishable) en apps/web/.env"
    : null;

/**
 * Cliente browser: solo URL + anon/publishable.
 * Nunca service_role aquí.
 */
function createBrowserClient(): SupabaseClient {
  if (!url || !key) {
    throw new Error(
      supabaseConfigError ??
        "Supabase no está configurado. Revisa apps/web/.env y reinicia Vite.",
    );
  }
  if (isNewSupabaseApiKey(key) && key.startsWith("sb_secret_")) {
    throw new Error("No uses la service_role/secret key en el frontend.");
  }

  return createClient(url, key, {
    global: { fetch: createSupabaseFetch(key) },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

let _client: SupabaseClient | undefined;

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    if (!_client) _client = createBrowserClient();
    const value = Reflect.get(_client, prop, receiver);
    return typeof value === "function" ? value.bind(_client) : value;
  },
});
