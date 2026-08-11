import type {
  FinanceEntry,
  HomeEvent,
  HomeRole,
  Member,
  Profile,
  Reminder,
  Reward,
} from "./types";

const KEY = "casita_demo_v1";

type DemoUser = {
  id: string;
  email: string;
  password: string;
  profile: Profile;
};

type DemoHome = {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
};

type DemoReminder = Reminder & { home_id: string; user_id: string };
type DemoReward = Reward & { home_id: string };

type DemoDb = {
  users: DemoUser[];
  homes: DemoHome[];
  events: HomeEvent[];
  reminders: DemoReminder[];
  rewards: DemoReward[];
  finance: FinanceEntry[];
  sessionUserId: string | null;
};

function uid() {
  return crypto.randomUUID();
}

function blank(): DemoDb {
  return {
    users: [],
    homes: [],
    events: [],
    reminders: [],
    rewards: [],
    finance: [],
    sessionUserId: null,
  };
}

function load(): DemoDb {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    return { ...blank(), ...JSON.parse(raw) } as DemoDb;
  } catch {
    return blank();
  }
}

function save(db: DemoDb) {
  localStorage.setItem(KEY, JSON.stringify(db));
}

function requireUser(db: DemoDb) {
  const user = db.users.find((u) => u.id === db.sessionUserId);
  if (!user) throw new Error("No autenticado");
  return user;
}

export const demoStore = {
  getSession() {
    const db = load();
    const user = db.users.find((u) => u.id === db.sessionUserId) ?? null;
    return user
      ? { token: `demo:${user.id}`, email: user.email, profile: structuredClone(user.profile) }
      : { token: null as string | null, email: null as string | null, profile: null as Profile | null };
  },

  signUp(email: string, password: string, displayName: string) {
    const db = load();
    if (db.users.some((u) => u.email === email.trim().toLowerCase())) {
      throw new Error("Ese correo ya tiene una cuenta");
    }
    const id = uid();
    const user: DemoUser = {
      id,
      email: email.trim().toLowerCase(),
      password,
      profile: {
        id,
        display_name: displayName.trim(),
        avatar_url: null,
        home_id: null,
        role: "miembro",
        points: 0,
      },
    };
    db.users.push(user);
    db.sessionUserId = id;
    save(db);
    return this.getSession();
  },

  signIn(email: string, password: string) {
    const db = load();
    const user = db.users.find(
      (u) => u.email === email.trim().toLowerCase() && u.password === password,
    );
    if (!user) throw new Error("Correo o contraseña incorrectos");
    db.sessionUserId = user.id;
    save(db);
    return this.getSession();
  },

  signOut() {
    const db = load();
    db.sessionUserId = null;
    save(db);
  },

  refreshProfile(): Profile | null {
    return this.getSession().profile;
  },

  createHome(name: string) {
    const db = load();
    const user = requireUser(db);
    if (user.profile.home_id) throw new Error("Ya perteneces a un hogar");
    const home: DemoHome = {
      id: uid(),
      name: name.trim(),
      invite_code: Math.random().toString(16).slice(2, 8),
      created_by: user.id,
    };
    db.homes.push(home);
    user.profile.home_id = home.id;
    user.profile.role = "admin";
    save(db);
    return { home, profile: structuredClone(user.profile) };
  },

  joinHome(inviteCode: string) {
    const db = load();
    const user = requireUser(db);
    if (user.profile.home_id) throw new Error("Ya perteneces a un hogar");
    const home = db.homes.find((h) => h.invite_code === inviteCode.trim().toLowerCase());
    if (!home) throw new Error("Código inválido");
    user.profile.home_id = home.id;
    user.profile.role = "miembro";
    save(db);
    return { home, profile: structuredClone(user.profile) };
  },

  getHome() {
    const db = load();
    const user = db.users.find((u) => u.id === db.sessionUserId);
    if (!user?.profile.home_id) return null;
    return db.homes.find((h) => h.id === user.profile.home_id) ?? null;
  },

  members(): Array<Member & { email?: string }> {
    const db = load();
    const user = requireUser(db);
    if (!user.profile.home_id) return [];
    return db.users
      .filter((u) => u.profile.home_id === user.profile.home_id)
      .map((u) => ({
        id: u.id,
        display_name: u.profile.display_name,
        avatar_url: u.profile.avatar_url,
        role: u.profile.role,
        points: u.profile.points,
        email: u.email,
      }))
      .sort((a, b) => b.points - a.points);
  },

  addMember(input: {
    email: string;
    password: string;
    display_name: string;
    role: HomeRole;
  }) {
    const db = load();
    const admin = requireUser(db);
    if (!admin.profile.home_id) throw new Error("Únete o crea un hogar primero");
    if (admin.profile.role !== "admin") throw new Error("Solo el admin puede agregar usuarios");
    if (db.users.some((u) => u.email === input.email.trim().toLowerCase())) {
      throw new Error("Ese correo ya existe");
    }
    const id = uid();
    db.users.push({
      id,
      email: input.email.trim().toLowerCase(),
      password: input.password,
      profile: {
        id,
        display_name: input.display_name.trim(),
        avatar_url: null,
        home_id: admin.profile.home_id,
        role: input.role,
        points: 0,
      },
    });
    save(db);
    return {
      member: {
        id,
        display_name: input.display_name.trim(),
        avatar_url: null as string | null,
        role: input.role,
        points: 0,
        email: input.email.trim().toLowerCase(),
      },
    };
  },

  setRole(memberId: string, role: HomeRole) {
    const db = load();
    const admin = requireUser(db);
    if (admin.profile.role !== "admin") throw new Error("Sin permiso");
    const member = db.users.find((u) => u.id === memberId);
    if (!member || member.profile.home_id !== admin.profile.home_id) {
      throw new Error("Miembro no encontrado");
    }
    member.profile.role = role;
    save(db);
  },

  events(): HomeEvent[] {
    const db = load();
    const user = db.users.find((u) => u.id === db.sessionUserId);
    if (!user?.profile.home_id) return [];
    return db.events
      .filter((e) => e.home_id === user.profile.home_id)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  },

  createEvent(input: {
    title: string;
    starts_at: string;
    event_type: HomeEvent["event_type"];
    points_reward: number;
    assignee_id: string | null;
  }) {
    const db = load();
    const user = requireUser(db);
    if (!user.profile.home_id) throw new Error("Sin hogar");
    const event: HomeEvent = {
      id: uid(),
      home_id: user.profile.home_id,
      title: input.title,
      description: null,
      event_type: input.event_type,
      status: "pendiente",
      starts_at: input.starts_at,
      ends_at: null,
      assignee_id: input.assignee_id,
      points_reward: input.points_reward,
    };
    db.events.push(event);
    save(db);
    return event;
  },

  completeEvent(id: string) {
    const db = load();
    const user = requireUser(db);
    const event = db.events.find((e) => e.id === id);
    if (!event || event.home_id !== user.profile.home_id) throw new Error("Evento no encontrado");
    if (event.status !== "hecho") {
      event.status = "hecho";
      const assigneeId = event.assignee_id || user.id;
      const assignee = db.users.find((u) => u.id === assigneeId);
      if (assignee) assignee.profile.points += event.points_reward;
    }
    save(db);
  },

  reminders(): Reminder[] {
    const db = load();
    const user = db.users.find((u) => u.id === db.sessionUserId);
    if (!user?.profile.home_id) return [];
    return db.reminders
      .filter((r) => r.home_id === user.profile.home_id)
      .sort((a, b) => a.remind_at.localeCompare(b.remind_at));
  },

  createReminder(title: string, remind_at: string) {
    const db = load();
    const user = requireUser(db);
    if (!user.profile.home_id) throw new Error("Sin hogar");
    const rem: DemoReminder = {
      id: uid(),
      title,
      remind_at,
      status: "programado",
      event_id: null,
      home_id: user.profile.home_id,
      user_id: user.id,
    };
    db.reminders.push(rem);
    save(db);
  },

  rewards(): Reward[] {
    const db = load();
    const user = db.users.find((u) => u.id === db.sessionUserId);
    if (!user?.profile.home_id) return [];
    return db.rewards.filter((r) => r.home_id === user.profile.home_id);
  },

  createReward(title: string, cost_points: number, description = "") {
    const db = load();
    const user = requireUser(db);
    if (!user.profile.home_id || user.profile.role !== "admin") throw new Error("Sin permiso");
    db.rewards.push({
      id: uid(),
      title,
      description,
      cost_points,
      home_id: user.profile.home_id,
    });
    save(db);
  },

  redeem(rewardId: string) {
    const db = load();
    const user = requireUser(db);
    const reward = db.rewards.find((r) => r.id === rewardId);
    if (!reward || reward.home_id !== user.profile.home_id) throw new Error("Recompensa no encontrada");
    if (user.profile.points < reward.cost_points) throw new Error("Puntos insuficientes");
    user.profile.points -= reward.cost_points;
    save(db);
  },

  financeList(filters: {
    from?: string;
    to?: string;
    kind?: string;
    category?: string;
    payment_status?: string;
    provider?: string;
  } = {}) {
    const db = load();
    const user = requireUser(db);
    if (!user.profile.home_id) return [];
    const providerQ = filters.provider?.trim().toLowerCase();
    return db.finance
      .filter((e) => e.home_id === user.profile.home_id)
      .filter((e) => !filters.from || e.occurred_on >= filters.from)
      .filter((e) => !filters.to || e.occurred_on <= filters.to)
      .filter((e) => !filters.kind || e.kind === filters.kind)
      .filter((e) => !filters.category || e.category === filters.category)
      .filter((e) => !filters.payment_status || e.payment_status === filters.payment_status)
      .filter(
        (e) =>
          !providerQ ||
          (e.provider || "").toLowerCase().includes(providerQ),
      )
      .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));
  },

  financeCreate(input: Omit<FinanceEntry, "id" | "home_id" | "created_by">) {
    const db = load();
    const user = requireUser(db);
    if (!user.profile.home_id) throw new Error("Sin hogar");
    if (user.profile.role === "invitado") throw new Error("Sin permiso");
    const entry: FinanceEntry = {
      id: uid(),
      home_id: user.profile.home_id,
      created_by: user.id,
      payment_status: input.payment_status || "pagado",
      ...input,
    };
    db.finance.push(entry);
    save(db);
    return entry;
  },

  financeUpdate(id: string, patch: Partial<Omit<FinanceEntry, "id" | "home_id" | "created_by">>) {
    const db = load();
    const user = requireUser(db);
    if (user.profile.role === "invitado") throw new Error("Sin permiso");
    const entry = db.finance.find((e) => e.id === id && e.home_id === user.profile.home_id);
    if (!entry) throw new Error("Movimiento no encontrado");
    Object.assign(entry, patch);
    save(db);
    return entry;
  },

  financeDelete(id: string) {
    const db = load();
    const user = requireUser(db);
    if (user.profile.role === "invitado") throw new Error("Sin permiso");
    db.finance = db.finance.filter((e) => !(e.id === id && e.home_id === user.profile.home_id));
    save(db);
  },
};
