import { api } from "./api";
import { demoStore } from "./demo-store";
import { isSupabaseConfigured, supabase, supabaseConfigError } from "./supabase";
import type { Profile } from "./types";

/** Sin claves Supabase, la app corre en modo local (localStorage). */
export const useDemoMode = !isSupabaseConfigured;

export type SessionState = {
  token: string | null;
  email: string | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  demo: boolean;
};

let state = $state<SessionState>({
  token: null,
  email: null,
  profile: null,
  loading: true,
  error: null,
  demo: useDemoMode,
});

export function getSession() {
  return state;
}

function applyLocalSession() {
  const s = demoStore.getSession();
  state.token = s.token;
  state.email = s.email;
  state.profile = s.profile;
}

function applyFrom(s: { token: string | null; email: string | null; profile: Profile | null }) {
  state.token = s.token;
  state.email = s.email;
  state.profile = s.profile;
  state.error = null;
}

export async function initSession() {
  state.loading = true;
  state.error = null;
  state.demo = useDemoMode;

  if (useDemoMode) {
    applyLocalSession();
    state.loading = false;
    return;
  }

  const { data } = await supabase.auth.getSession();
  state.token = data.session?.access_token ?? null;
  state.email = data.session?.user?.email ?? null;
  if (state.token) {
    try {
      const me = await api<{ profile: Profile }>("/api/me", { token: state.token });
      state.profile = me.profile;
    } catch (e) {
      // Perfil puede faltar si aún no corrieron las migraciones; no tumba la sesión.
      state.error = e instanceof Error ? e.message : "No se pudo cargar el perfil";
    }
  }
  state.loading = false;

  supabase.auth.onAuthStateChange(async (_event, session) => {
    state.token = session?.access_token ?? null;
    state.email = session?.user?.email ?? null;
    if (state.token) {
      try {
        const me = await api<{ profile: Profile }>("/api/me", { token: state.token });
        state.profile = me.profile;
      } catch {
        state.profile = null;
      }
    } else {
      state.profile = null;
    }
  });
}

export async function signIn(email: string, password: string) {
  if (useDemoMode) {
    applyFrom(demoStore.signIn(email, password));
    return;
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.message.toLowerCase().includes("invalid login credentials")) {
      throw new Error(
        "Correo o contraseña incorrectos. Si acabas de registrarte, usa el mismo correo/contraseña o crea la cuenta de nuevo en Registro.",
      );
    }
    if (error.message.toLowerCase().includes("email not confirmed")) {
      throw new Error("Debes confirmar tu correo antes de entrar.");
    }
    throw error;
  }
}

export async function signUp(email: string, password: string, displayName: string) {
  if (useDemoMode) {
    applyFrom(demoStore.signUp(email, password, displayName));
    return;
  }

  // Registro por API (service role + email_confirm) para evitar rate limit / confirmación.
  await api("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      display_name: displayName,
    }),
  });

  // Misma instancia de Supabase del frontend para iniciar sesión.
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  if (useDemoMode) {
    demoStore.signOut();
  } else {
    await supabase.auth.signOut();
  }
  state.token = null;
  state.email = null;
  state.profile = null;
}

export async function refreshProfile() {
  if (useDemoMode) {
    state.profile = demoStore.refreshProfile();
    return;
  }
  if (!state.token) return;
  const me = await api<{ profile: Profile }>("/api/me", { token: state.token });
  state.profile = me.profile;
}

export { supabaseConfigError };
