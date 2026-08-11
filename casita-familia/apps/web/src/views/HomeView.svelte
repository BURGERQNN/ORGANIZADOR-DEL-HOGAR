<script lang="ts">
  import { api } from "../lib/api";
  import { demoStore } from "../lib/demo-store";
  import { getSession, refreshProfile, useDemoMode } from "../lib/session.svelte";
  import type { HomeEvent, HomeRole, Member, Reminder, Reward } from "../lib/types";

  const session = getSession();

  let homeName = $state("");
  let inviteCode = $state("");
  let homeInvite = $state<string | null>(null);
  let members = $state<Array<Member & { email?: string }>>([]);
  let events = $state<HomeEvent[]>([]);
  let reminders = $state<Reminder[]>([]);
  let rewards = $state<Reward[]>([]);
  let message = $state<string | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(false);

  let newUser = $state({
    display_name: "",
    email: "",
    password: "",
    role: "miembro" as HomeRole,
  });

  let newTask = $state({
    title: "",
    starts_at: "",
    event_type: "tarea" as const,
    points_reward: 10,
  });
  let newReminder = $state({ title: "", remind_at: "" });
  let newReward = $state({ title: "", cost_points: 50, description: "" });

  async function loadAll() {
    if (!session.token || !session.profile?.home_id) return;
    loading = true;
    error = null;
    try {
      if (useDemoMode) {
        members = demoStore.members();
        events = demoStore.events();
        reminders = demoStore.reminders();
        rewards = demoStore.rewards();
        homeInvite = demoStore.getHome()?.invite_code ?? null;
      } else {
        const [m, e, r, rw, h] = await Promise.all([
          api<{ members: Member[] }>("/api/homes/members", { token: session.token }),
          api<{ events: HomeEvent[] }>("/api/events", { token: session.token }),
          api<{ reminders: Reminder[] }>("/api/reminders", { token: session.token }),
          api<{ rewards: Reward[] }>("/api/rewards", { token: session.token }),
          api<{ home: { invite_code: string } }>("/api/homes/current", { token: session.token }),
        ]);
        members = m.members;
        events = e.events;
        reminders = r.reminders;
        rewards = rw.rewards;
        homeInvite = h.home.invite_code;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Error al cargar";
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (session.profile?.home_id) loadAll();
  });

  async function createHome() {
    error = null;
    try {
      if (useDemoMode) {
        demoStore.createHome(homeName);
      } else {
        await api("/api/homes", {
          method: "POST",
          token: session.token,
          body: JSON.stringify({ name: homeName }),
        });
      }
      await refreshProfile();
      message = "Hogar creado. Ya puedes ver tu dashboard.";
    } catch (err) {
      error = err instanceof Error ? err.message : "No se pudo crear";
    }
  }

  async function joinHome() {
    error = null;
    try {
      if (useDemoMode) {
        demoStore.joinHome(inviteCode);
      } else {
        await api("/api/homes/join", {
          method: "POST",
          token: session.token,
          body: JSON.stringify({ invite_code: inviteCode }),
        });
      }
      await refreshProfile();
      message = "Te uniste al hogar. Aquí está tu dashboard.";
    } catch (err) {
      error = err instanceof Error ? err.message : "No se pudo unir";
    }
  }

  async function addUser() {
    error = null;
    message = null;
    try {
      if (useDemoMode) {
        const { member } = demoStore.addMember(newUser);
        message = `Usuario ${member.display_name} agregado. Puede entrar con ${member.email}.`;
      } else {
        const res = await api<{ message: string; email: string }>("/api/homes/members", {
          method: "POST",
          token: session.token,
          body: JSON.stringify(newUser),
        });
        message = res.message;
      }
      newUser = { display_name: "", email: "", password: "", role: "miembro" };
      await loadAll();
    } catch (err) {
      error = err instanceof Error ? err.message : "No se pudo agregar usuario";
    }
  }

  async function createEvent() {
    if (!newTask.title || !newTask.starts_at) return;
    try {
      if (useDemoMode) {
        demoStore.createEvent({
          ...newTask,
          starts_at: new Date(newTask.starts_at).toISOString(),
          assignee_id: session.profile?.id ?? null,
        });
      } else {
        await api("/api/events", {
          method: "POST",
          token: session.token,
          body: JSON.stringify({
            ...newTask,
            starts_at: new Date(newTask.starts_at).toISOString(),
            assignee_id: session.profile?.id,
          }),
        });
      }
      newTask = { title: "", starts_at: "", event_type: "tarea", points_reward: 10 };
      await loadAll();
      await refreshProfile();
    } catch (err) {
      error = err instanceof Error ? err.message : "No se pudo crear tarea";
    }
  }

  async function completeEvent(id: string) {
    try {
      if (useDemoMode) {
        demoStore.completeEvent(id);
      } else {
        await api(`/api/events/${id}`, {
          method: "PATCH",
          token: session.token,
          body: JSON.stringify({ status: "hecho" }),
        });
      }
      await refreshProfile();
      await loadAll();
    } catch (err) {
      error = err instanceof Error ? err.message : "No se pudo completar";
    }
  }

  async function createReminder() {
    try {
      if (useDemoMode) {
        demoStore.createReminder(newReminder.title, new Date(newReminder.remind_at).toISOString());
      } else {
        await api("/api/reminders", {
          method: "POST",
          token: session.token,
          body: JSON.stringify({
            title: newReminder.title,
            remind_at: new Date(newReminder.remind_at).toISOString(),
          }),
        });
      }
      newReminder = { title: "", remind_at: "" };
      await loadAll();
    } catch (err) {
      error = err instanceof Error ? err.message : "No se pudo crear recordatorio";
    }
  }

  async function createReward() {
    try {
      if (useDemoMode) {
        demoStore.createReward(newReward.title, newReward.cost_points, newReward.description);
      } else {
        await api("/api/rewards", {
          method: "POST",
          token: session.token,
          body: JSON.stringify(newReward),
        });
      }
      newReward = { title: "", cost_points: 50, description: "" };
      await loadAll();
    } catch (err) {
      error = err instanceof Error ? err.message : "No se pudo crear recompensa";
    }
  }

  async function redeem(id: string) {
    try {
      if (useDemoMode) {
        demoStore.redeem(id);
      } else {
        await api(`/api/rewards/${id}/redeem`, { method: "POST", token: session.token });
      }
      await refreshProfile();
      message = "Canje solicitado";
      await loadAll();
    } catch (err) {
      error = err instanceof Error ? err.message : "No se pudo canjear";
    }
  }

  async function setRole(id: string, role: string) {
    try {
      if (useDemoMode) {
        demoStore.setRole(id, role as HomeRole);
      } else {
        await api(`/api/homes/members/${id}/role`, {
          method: "PATCH",
          token: session.token,
          body: JSON.stringify({ role }),
        });
      }
      await loadAll();
    } catch (err) {
      error = err instanceof Error ? err.message : "No se pudo cambiar rol";
    }
  }

  function fmt(iso: string) {
    return new Date(iso).toLocaleString("es-MX", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }
</script>

{#if !session.profile?.home_id}
  <section class="setup">
    <h2>Bienvenido, {session.profile?.display_name || "familia"}</h2>
    <p>Para ver tu dashboard, crea un hogar o únete con un código.</p>
    <div class="grid-2">
      <div class="block">
        <h3>Crear hogar</h3>
        <input placeholder="Nombre del hogar" bind:value={homeName} />
        <button class="primary" onclick={createHome}>Crear y abrir dashboard</button>
      </div>
      <div class="block">
        <h3>Unirse</h3>
        <input placeholder="Código de invitación" bind:value={inviteCode} />
        <button class="primary" onclick={joinHome}>Entrar al dashboard</button>
      </div>
    </div>
    {#if error}<p class="error">{error}</p>{/if}
  </section>
{:else}
  <section class="dash">
    <header class="hero-strip">
      <div>
        <p class="eyebrow">Dashboard del hogar</p>
        <h2>Hola, {session.profile.display_name || "familia"}</h2>
        {#if homeInvite}
          <p class="muted">Código para invitar: <strong>{homeInvite}</strong></p>
        {/if}
      </div>
      <div class="points">
        <span>{session.profile.points}</span>
        <small>puntos · {session.profile.role}</small>
      </div>
    </header>

    {#if message}<p class="ok">{message}</p>{/if}
    {#if error}<p class="error">{error}</p>{/if}
    {#if loading}<p class="muted">Cargando dashboard…</p>{/if}

    <div class="layout">
      {#if session.profile.role === "admin"}
        <article class="span-2">
          <h3>Agregar nuevo usuario</h3>
          <p class="muted">Crea la cuenta de un familiar. Luego podrá iniciar sesión y ver su dashboard.</p>
          <div class="form-row">
            <input placeholder="Nombre" bind:value={newUser.display_name} />
            <input type="email" placeholder="Correo" bind:value={newUser.email} />
            <input type="password" placeholder="Contraseña temporal" bind:value={newUser.password} minlength="6" />
            <select bind:value={newUser.role}>
              <option value="miembro">miembro</option>
              <option value="admin">admin</option>
              <option value="invitado">invitado</option>
            </select>
            <button
              class="primary"
              onclick={addUser}
              disabled={!newUser.display_name || !newUser.email || newUser.password.length < 6}
            >
              Agregar usuario
            </button>
          </div>
        </article>
      {/if}

      <article>
        <h3>Calendario / tareas</h3>
        <div class="form-row">
          <input placeholder="Nueva tarea" bind:value={newTask.title} />
          <input type="datetime-local" bind:value={newTask.starts_at} />
          <input type="number" min="0" bind:value={newTask.points_reward} title="Puntos" />
          <button class="primary" onclick={createEvent}>Agregar</button>
        </div>
        <ul class="list">
          {#each events as ev}
            <li>
              <div>
                <strong>{ev.title}</strong>
                <span class="muted">{ev.event_type} · {fmt(ev.starts_at)} · +{ev.points_reward} pts</span>
              </div>
              {#if ev.status === "pendiente"}
                <button onclick={() => completeEvent(ev.id)}>Hecho</button>
              {:else}
                <span class="badge">{ev.status}</span>
              {/if}
            </li>
          {:else}
            <li class="muted">Sin eventos todavía</li>
          {/each}
        </ul>
      </article>

      <article>
        <h3>Recordatorios</h3>
        <div class="form-row">
          <input placeholder="Recordatorio" bind:value={newReminder.title} />
          <input type="datetime-local" bind:value={newReminder.remind_at} />
          <button class="primary" onclick={createReminder}>Agregar</button>
        </div>
        <ul class="list">
          {#each reminders as rem}
            <li>
              <div>
                <strong>{rem.title}</strong>
                <span class="muted">{fmt(rem.remind_at)} · {rem.status}</span>
              </div>
            </li>
          {:else}
            <li class="muted">Sin recordatorios</li>
          {/each}
        </ul>
      </article>

      <article>
        <h3>Recompensas</h3>
        {#if session.profile.role === "admin"}
          <div class="form-row">
            <input placeholder="Recompensa" bind:value={newReward.title} />
            <input type="number" min="1" bind:value={newReward.cost_points} />
            <button class="primary" onclick={createReward}>Crear</button>
          </div>
        {/if}
        <ul class="list">
          {#each rewards as rw}
            <li>
              <div>
                <strong>{rw.title}</strong>
                <span class="muted">{rw.cost_points} puntos</span>
              </div>
              <button onclick={() => redeem(rw.id)}>Canjear</button>
            </li>
          {:else}
            <li class="muted">Sin recompensas</li>
          {/each}
        </ul>
      </article>

      <article>
        <h3>Usuarios del hogar</h3>
        <ul class="list">
          {#each members as m}
            <li>
              <div>
                <strong>{m.display_name || "Sin nombre"}</strong>
                <span class="muted"
                  >{m.role} · {m.points} pts{#if m.email} · {m.email}{/if}</span
                >
              </div>
              {#if session.profile.role === "admin" && m.id !== session.profile.id}
                <select value={m.role} onchange={(e) => setRole(m.id, e.currentTarget.value)}>
                  <option value="admin">admin</option>
                  <option value="miembro">miembro</option>
                  <option value="invitado">invitado</option>
                </select>
              {/if}
            </li>
          {/each}
        </ul>
      </article>
    </div>
  </section>
{/if}

<style>
  .setup,
  .dash {
    display: grid;
    gap: 1.25rem;
  }
  .hero-strip {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: end;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--line);
  }
  .eyebrow {
    margin: 0;
    color: var(--muted);
    font-size: 0.85rem;
  }
  h2,
  h3 {
    font-family: var(--font-display);
    margin: 0.2rem 0;
  }
  .points {
    text-align: right;
  }
  .points span {
    display: block;
    font-family: var(--font-display);
    font-size: 2rem;
    color: var(--accent);
    line-height: 1;
  }
  .layout {
    display: grid;
    gap: 1.25rem;
  }
  @media (min-width: 900px) {
    .layout {
      grid-template-columns: 1.2fr 1fr;
    }
    .span-2 {
      grid-column: 1 / -1;
    }
  }
  article {
    background: rgba(255, 255, 255, 0.55);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 1rem 1.1rem;
  }
  .form-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0.75rem 0;
  }
  .form-row input,
  .block input,
  select {
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 0.55rem 0.7rem;
    font: inherit;
    background: #fff;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.65rem;
  }
  .list li {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: center;
    padding: 0.55rem 0;
    border-bottom: 1px solid var(--line);
  }
  .list li > div {
    display: grid;
    gap: 0.15rem;
  }
  .muted {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .badge {
    font-size: 0.8rem;
    color: var(--accent);
  }
  .ok {
    color: var(--accent);
  }
  .error {
    color: #9b2c2c;
  }
  .grid-2 {
    display: grid;
    gap: 1rem;
  }
  @media (min-width: 700px) {
    .grid-2 {
      grid-template-columns: 1fr 1fr;
    }
  }
  .block {
    display: grid;
    gap: 0.6rem;
    padding: 1rem;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.55);
  }
</style>
