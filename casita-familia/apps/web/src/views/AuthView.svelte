<script lang="ts">
  import { api } from "../lib/api";
  import { signIn, signUp, useDemoMode } from "../lib/session.svelte";

  let mode = $state<"login" | "registro">("registro");
  let email = $state("");
  let password = $state("");
  let displayName = $state("");
  let loading = $state(false);
  let error = $state<string | null>(null);

  let lead = $state({ name: "", email: "", phone: "", message: "" });
  let leadLoading = $state(false);
  let leadError = $state<string | null>(null);
  let leadOk = $state<string | null>(null);

  async function submit(e: Event) {
    e.preventDefault();
    loading = true;
    error = null;
    try {
      if (mode === "login") await signIn(email, password);
      else await signUp(email, password, displayName);
    } catch (err) {
      error = err instanceof Error ? err.message : "No se pudo autenticar";
    } finally {
      loading = false;
    }
  }

  async function submitLead(e: Event) {
    e.preventDefault();
    leadLoading = true;
    leadError = null;
    leadOk = null;
    try {
      const res = await api<{ message: string }>("/api/leads", {
        method: "POST",
        body: JSON.stringify({
          name: lead.name,
          email: lead.email,
          phone: lead.phone || null,
          message: lead.message || null,
        }),
      });
      leadOk = res.message;
      lead = { name: "", email: "", phone: "", message: "" };
    } catch (err) {
      leadError = err instanceof Error ? err.message : "No se pudo enviar";
    } finally {
      leadLoading = false;
    }
  }
</script>

<section class="auth">
  <div class="layout">
    <div class="panel">
      <p class="brand">Casita</p>
      <h1>{mode === "login" ? "Entrar al hogar" : "Crear cuenta nueva"}</h1>
      <p class="lead">
        Regístrate para ver tu dashboard: tareas, calendario, puntos y familia.
      </p>

      {#if useDemoMode}
        <p class="hint">
          Modo local activo (sin claves Supabase). Los usuarios se guardan en este navegador.
        </p>
      {/if}

      <div class="tabs">
        <button type="button" class:active={mode === "registro"} onclick={() => (mode = "registro")}
          >Registro</button
        >
        <button type="button" class:active={mode === "login"} onclick={() => (mode = "login")}
          >Entrar</button
        >
      </div>

      <form onsubmit={submit}>
        {#if mode === "registro"}
          <label>
            Nombre
            <input bind:value={displayName} required minlength="2" maxlength="60" placeholder="Ana" />
          </label>
        {/if}
        <label>
          Correo
          <input type="email" bind:value={email} required placeholder="ana@familia.com" />
        </label>
        <label>
          Contraseña
          <input type="password" bind:value={password} required minlength="6" placeholder="mínimo 6 caracteres" />
        </label>
        {#if error}<p class="error">{error}</p>{/if}
        <button class="primary" disabled={loading} type="submit">
          {loading ? "Espera…" : mode === "login" ? "Entrar al dashboard" : "Crear cuenta y continuar"}
        </button>
      </form>
    </div>

    <div class="panel lead-panel">
      <h2>¿Te interesa Casita?</h2>
      <p class="lead">Déjanos tus datos y te contactamos.</p>
      <form onsubmit={submitLead}>
        <label>
          Nombre
          <input bind:value={lead.name} required minlength="2" maxlength="80" placeholder="Tu nombre" />
        </label>
        <label>
          Correo
          <input type="email" bind:value={lead.email} required maxlength="120" placeholder="tu@correo.com" />
        </label>
        <label>
          Teléfono <span class="opt">(opcional)</span>
          <input bind:value={lead.phone} maxlength="40" placeholder="55 1234 5678" />
        </label>
        <label>
          Mensaje <span class="opt">(opcional)</span>
          <textarea bind:value={lead.message} maxlength="1000" rows="3" placeholder="Cuéntanos qué necesitas"></textarea>
        </label>
        {#if leadError}<p class="error">{leadError}</p>{/if}
        {#if leadOk}<p class="ok">{leadOk}</p>{/if}
        <button class="primary" disabled={leadLoading} type="submit">
          {leadLoading ? "Enviando…" : "Quiero más información"}
        </button>
      </form>
    </div>
  </div>
</section>

<style>
  .auth {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 1.5rem;
    background:
      radial-gradient(ellipse at 20% 0%, rgba(47, 107, 74, 0.18), transparent 50%),
      radial-gradient(ellipse at 90% 80%, rgba(196, 149, 74, 0.15), transparent 45%),
      var(--bg);
  }
  .layout {
    width: min(920px, 100%);
    display: grid;
    gap: 1.5rem;
    grid-template-columns: 1fr;
  }
  @media (min-width: 800px) {
    .layout {
      grid-template-columns: 1fr 1fr;
      align-items: start;
    }
  }
  .panel {
    width: 100%;
    background: rgba(255, 255, 255, 0.55);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 1.25rem 1.35rem 1.5rem;
  }
  .brand {
    font-family: var(--font-display);
    font-size: 2rem;
    font-weight: 700;
    color: var(--accent);
    margin: 0;
  }
  h1,
  h2 {
    font-family: var(--font-display);
    font-size: 1.6rem;
    margin: 0.4rem 0 0.35rem;
  }
  h2 {
    font-size: 1.35rem;
  }
  .lead {
    color: var(--muted);
    margin: 0 0 1rem;
  }
  .hint {
    background: rgba(47, 107, 74, 0.1);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 0.75rem 0.9rem;
    font-size: 0.9rem;
    color: var(--ink);
    margin: 0 0 1rem;
  }
  .tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  .tabs button {
    background: transparent;
    border: none;
    color: var(--muted);
    padding: 0.35rem 0.2rem;
    border-bottom: 2px solid transparent;
    cursor: pointer;
  }
  .tabs button.active {
    color: var(--ink);
    border-bottom-color: var(--accent);
  }
  form {
    display: grid;
    gap: 0.85rem;
  }
  label {
    display: grid;
    gap: 0.35rem;
    font-size: 0.9rem;
  }
  .opt {
    color: var(--muted);
    font-weight: 400;
  }
  input,
  textarea {
    border: 1px solid var(--line);
    background: #fff;
    border-radius: 10px;
    padding: 0.7rem 0.85rem;
    font: inherit;
    resize: vertical;
  }
  .error {
    color: #9b2c2c;
    margin: 0;
    font-size: 0.9rem;
  }
  .ok {
    color: var(--accent);
    margin: 0;
    font-size: 0.9rem;
  }
</style>
