<script lang="ts">
  import { onMount } from "svelte";
  import AuthView from "./views/AuthView.svelte";
  import HomeView from "./views/HomeView.svelte";
  import FinanceView from "./views/FinanceView.svelte";
  import { getSession, initSession, signOut } from "./lib/session.svelte";

  const session = getSession();
  let tab = $state<"hogar" | "finanzas">("hogar");

  onMount(() => {
    initSession();
  });
</script>

{#if session.loading}
  <main class="boot">Cargando Casita…</main>
{:else if !session.token}
  <AuthView />
{:else}
  <div class="shell">
    <nav>
      <span class="brand">Casita</span>
      <div class="nav-right">
        {#if session.demo}
          <span class="badge">Modo local</span>
        {/if}
        <span class="email">{session.email}</span>
        <button onclick={() => signOut()}>Salir</button>
      </div>
    </nav>
    <div class="tabs">
      <button class:active={tab === "hogar"} onclick={() => (tab = "hogar")}>Hogar</button>
      <button class:active={tab === "finanzas"} onclick={() => (tab = "finanzas")}>Finanzas</button>
    </div>
    {#if session.error}
      <p class="banner">{session.error}</p>
    {/if}
    <main>
      {#if tab === "hogar"}
        <HomeView />
      {:else}
        <FinanceView />
      {/if}
    </main>
  </div>
{/if}

<style>
  .boot {
    min-height: 100vh;
    display: grid;
    place-items: center;
    color: var(--muted);
  }
  .shell {
    min-height: 100vh;
    background:
      linear-gradient(180deg, rgba(47, 107, 74, 0.08), transparent 28%),
      var(--bg);
  }
  nav {
    max-width: 1100px;
    margin: 0 auto;
    padding: 1.1rem 1.25rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .brand {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.35rem;
    color: var(--accent);
  }
  .nav-right {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }
  .email {
    color: var(--muted);
    font-size: 0.9rem;
  }
  .badge {
    font-size: 0.75rem;
    padding: 0.25rem 0.55rem;
    border-radius: 999px;
    background: rgba(47, 107, 74, 0.12);
    color: var(--accent);
    border: 1px solid var(--line);
  }
  .tabs {
    max-width: 1100px;
    margin: 0 auto;
    padding: 0 1.25rem;
    display: flex;
    gap: 0.5rem;
  }
  .tabs button {
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    color: var(--muted);
    padding: 0.4rem 0.2rem;
  }
  .tabs button.active {
    color: var(--ink);
    border-bottom-color: var(--accent);
  }
  main {
    max-width: 1100px;
    margin: 0 auto;
    padding: 0.5rem 1.25rem 2.5rem;
  }
  .banner {
    max-width: 1100px;
    margin: 0 auto 0.75rem;
    padding: 0.75rem 1.25rem;
    color: #9b2c2c;
  }
</style>
