<script lang="ts">
  import { signIn, signUp, useDemoMode } from "../lib/session.svelte";

  let mode = $state<"login" | "registro">("registro");
  let email = $state("");
  let password = $state("");
  let displayName = $state("");
  let loading = $state(false);
  let error = $state<string | null>(null);

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
</script>

<section class="auth">
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
  .panel {
    width: min(420px, 100%);
  }
  .brand {
    font-family: var(--font-display);
    font-size: 2rem;
    font-weight: 700;
    color: var(--accent);
    margin: 0;
  }
  h1 {
    font-family: var(--font-display);
    font-size: 1.6rem;
    margin: 0.4rem 0 0.35rem;
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
  input {
    border: 1px solid var(--line);
    background: #fff;
    border-radius: 10px;
    padding: 0.7rem 0.85rem;
    font: inherit;
  }
  .error {
    color: #9b2c2c;
    margin: 0;
    font-size: 0.9rem;
  }
</style>
