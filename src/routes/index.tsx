import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Repeat, Users, ListChecks } from "lucide-react";
import heroImg from "@/assets/hero-hogar.jpg";

const TITLE = "Casita — Organiza las tareas del hogar en familia";
const DESC =
  "Crea pendientes recurrentes, reparte responsabilidades y mira de un vistazo qué falta, qué ya se hizo y quién es responsable.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
    ],
  }),
  component: Index,
});

const features = [
  {
    icon: Repeat,
    title: "Pendientes recurrentes",
    text: "Sacar la basura los martes, lavar sábanas cada quincena. Se crean solos, sin recordatorios en el refri.",
  },
  {
    icon: Users,
    title: "Responsables claros",
    text: "Cada tarea tiene nombre y apellido. Se acabó el “yo pensé que te tocaba a ti”.",
  },
  {
    icon: ListChecks,
    title: "Pendiente o hecho",
    text: "Un tablero simple con lo que falta hoy y lo que ya se completó esta semana.",
  },
];

const tareas = [
  { t: "Lavar los trastes", q: "Ana", hecho: true },
  { t: "Sacar la basura", q: "Luis", hecho: true },
  { t: "Regar las plantas", q: "Sofía", hecho: false },
  { t: "Cambiar sábanas", q: "Ana", hecho: false },
];

function Index() {
  return (
    <main className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6">
        <span className="font-display text-xl font-bold text-primary">Casita</span>
        <Link
          to="/auth"
          className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Empezar gratis
        </Link>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-6 md:grid-cols-2 md:pb-24">
        <div>
          <p className="mb-4 inline-block rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
            Para familias, roomies y casas compartidas
          </p>
          <h1 className="text-4xl leading-[1.1] md:text-6xl">
            La casa se organiza sola cuando todos saben qué les toca.
          </h1>
          <p className="mt-5 max-w-md text-base text-muted-foreground md:text-lg">{DESC}</p>
          <div className="mt-8 flex flex-wrap gap-3" id="empezar">
            <Link
              to="/auth"
              className="rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-[var(--shadow-soft)] transition-transform hover:-translate-y-0.5"
            >
              Crear mi hogar
            </Link>
            <a
              href="#tablero"
              className="rounded-full border border-border px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Ver cómo funciona
            </a>
          </div>
        </div>

        <div className="relative">
          <img
            src={heroImg}
            alt="Familia organizando las tareas del hogar en la cocina"
            width={1280}
            height={960}
            className="w-full rounded-3xl object-cover shadow-[var(--shadow-soft)]"
          />
        </div>
      </section>

      <section className="bg-card py-16 md:py-24">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 md:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-background p-6">
              <f.icon className="h-6 w-6 text-primary" aria-hidden />
              <h2 className="mt-4 text-xl">{f.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="tablero" className="mx-auto max-w-3xl px-5 py-16 md:py-24">
        <h2 className="text-3xl md:text-4xl">Así se ve tu semana</h2>
        <p className="mt-3 text-muted-foreground">
          Todo en una lista: lo pendiente arriba, lo hecho tachado y siempre con su responsable.
        </p>
        <ul className="mt-8 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {tareas.map((x) => (
            <li key={x.t} className="flex items-center gap-3 px-5 py-4">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                  x.hecho ? "border-accent bg-accent text-accent-foreground" : "border-border"
                }`}
              >
                {x.hecho && <Check className="h-3.5 w-3.5" aria-hidden />}
              </span>
              <span className={x.hecho ? "text-muted-foreground line-through" : "font-medium"}>
                {x.t}
              </span>
              <span className="ml-auto rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                {x.q}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-20">
        <div
          className="rounded-3xl px-6 py-14 text-center"
          style={{ backgroundImage: "var(--gradient-warm)" }}
        >
          <h2 className="text-3xl md:text-4xl">Reparte las tareas, no los reclamos</h2>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            Arma tu hogar en un minuto e invita a los demás integrantes.
          </p>
          <Link
            to="/auth"
            className="mt-7 inline-block rounded-full bg-primary px-7 py-3 text-sm font-medium text-primary-foreground transition-transform hover:-translate-y-0.5"
          >
            Empezar gratis
          </Link>
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        Casita · Hecho para casas más tranquilas
      </footer>
    </main>
  );
}
