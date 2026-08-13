# PROJECT_CONTEXT.md
> Contexto persistente. Actualizar al terminar cada ticket.
> Última actualización: 2026-08-13 | Ticket: T-06 correos Resend

---

## Stack

- Framework front: Svelte 5 + Vite
- Backend: Node.js + Express
- Base de datos / Auth: Supabase project `bvarujfbnhfapzfmffue` (`https://bvarujfbnhfapzfmffue.supabase.co`)
- Storage: bucket privado `receipts`
- IA: OpenAI (`gpt-4o-mini`) via `OPENAI_API_KEY` en `apps/api/.env`
- Email: Resend via `RESEND_API_KEY` + `RESEND_FROM_EMAIL` en `apps/api/.env`
- Estilos: CSS variables (sin Tailwind)
- Gestor de paquetes: npm
- Deploy: pendiente

---

## Árbol de carpetas (nivel 3)

```
casita-familia/
  apps/
    api/
      src/
        index.js
        lib/
          catalogs.js
          email.js
          receipt-ai.js
          receipt-storage.js
          supabase.js
        middleware/
        routes/
    web/
      src/
        lib/
        views/
        App.svelte
  supabase/
    migrations/
  PROJECT_CONTEXT.md
  README.md
```

---

## Modelos existentes

| Modelo | Tabla | Campos clave | Notas |
|--------|-------|--------------|-------|
| Profile | profiles | home_id, role, points | |
| Home | homes | name, invite_code | |
| HomeEvent | home_events | type, status, starts_at, points_reward | Calendario/tareas |
| Reminder | reminders | remind_at, status | |
| Reward | rewards | cost_points, active | |
| Redemption | redemptions | status | Canjes |
| FinanceEntry | finance_entries | kind, category, amount, occurred_on, provider, payment_status, due_date, period_*, reference_number, concept, receipt_* | Ingresos/gastos + recibos |

---

## Endpoints existentes

| Método | Ruta | Qué hace | Rol |
|--------|------|----------|-----|
| POST | /api/auth/register | Crea usuario confirmado (service role) | público |
| GET | /api/me | Perfil actual | auth |
| PATCH | /api/me | Actualizar perfil | auth |
| POST | /api/homes | Crear hogar | auth |
| POST | /api/homes/join | Unirse con código | auth |
| GET | /api/homes/current | Datos del hogar + invite_code | home |
| GET | /api/homes/members | Listar miembros | home |
| POST | /api/homes/members | Admin crea usuario y lo une al hogar | admin |
| PATCH | /api/homes/members/:id/role | Cambiar rol | admin |
| GET/POST | /api/events | Listar/crear | home |
| PATCH/DELETE | /api/events/:id | Editar/borrar (+puntos al hecho) | home |
| GET/POST | /api/reminders | Listar/crear | home |
| PATCH | /api/reminders/:id | Actualizar | home |
| GET/POST | /api/rewards | Listar/crear | home / admin |
| POST | /api/rewards/:id/redeem | Canjear | home |
| GET | /api/rewards/redemptions | Listar canjes | home |
| PATCH | /api/rewards/redemptions/:id | Aprobar/rechazar | admin |
| GET | /api/finance | Listar + summary (filtros from/to/kind/category/payment_status/provider) | home |
| GET | /api/finance/catalogs | Catálogos finanzas | auth |
| POST | /api/finance | Crear movimiento | home (no invitado) |
| PATCH/DELETE | /api/finance/:id | Editar / eliminar (+borra receipt Storage) | home (no invitado) |
| POST | /api/finance/receipts/analyze | Sube PDF/imagen, OCR OpenAI, **no guarda gasto** | home (no invitado) |
| POST | /api/finance/receipts/confirm | Tras revisión: crea gasto + mueve comprobante; anti-duplicado | home (no invitado) |
| GET | /api/finance/:id/receipt | URL firmada del comprobante | home |
| GET | /api/emails/status | Si Resend está configurado | auth |
| POST | /api/emails/send | Correo libre (to/subject/html|text) | admin |
| POST | /api/emails/invite | Envía código de invitación del hogar | home (no invitado) |
| POST | /api/reminders/:id/send | Envía recordatorio por correo → status enviado | home (no invitado) |

---

## Componentes reutilizables

| Componente | Archivo | Cuándo usarlo |
|-----------|---------|---------------|
| AuthView | views/AuthView.svelte | Login/registro |
| HomeView | views/HomeView.svelte | Dashboard hogar |
| FinanceView | views/FinanceView.svelte | Finanzas + subir/revisar recibos |

---

## Servicios y lógica de negocio

| Servicio | Archivo | Qué maneja |
|---------|---------|-----------|
| email | apps/api/src/lib/email.js | Resend: sendEmail + plantillas welcome/invite/reminder |
| receipt-ai | apps/api/src/lib/receipt-ai.js | OCR/extracción recibos |
| receipt-storage | apps/api/src/lib/receipt-storage.js | Storage bucket receipts |

---

## Catálogos

Archivo: `apps/api/src/lib/catalogs.js`

| Catálogo | Valores |
|---------|---------|
| HOME_ROLES | admin, miembro, invitado |
| EVENT_TYPES | tarea, evento, recordatorio |
| EVENT_STATUSES | pendiente, hecho, cancelado |
| REMINDER_STATUSES | programado, enviado, cancelado |
| REDEMPTION_STATUSES | pendiente, aprobado, rechazado |
| FINANCE_KINDS | ingreso, gasto |
| FINANCE_PAYMENT_STATUSES | pagado, pendiente |
| FINANCE_INCOME_CATEGORIES | sueldo, freelance, otros_ingresos |
| FINANCE_EXPENSE_CATEGORIES | comida, hogar, transporte, servicios, luz, agua, gas, internet, telefono, mantenimiento, salud, entretenimiento, otros_gastos |

---

## Reglas del proyecto

- Front no escribe SQL; API usa service role (cuando hay claves).
- Sin `VITE_SUPABASE_ANON_KEY` el front corre en **modo local** (`demo-store` / localStorage).
- Roles cerrados; invitados no crean eventos ni finanzas ni suben recibos.
- Completar tarea suma `points_reward` al assignee.
- Canje resta puntos al instante; rechazo los devuelve.
- Solo `admin` puede agregar usuarios al hogar.
- Totales financieros se calculan en API (y en demo-store en modo local).
- Recibos: **nunca** auto-guardar datos de IA; siempre pantalla de revisión.
- PDF con texto: se lee con `pdf-parse` + heurísticas **sin OpenAI**; si hay `OPENAI_API_KEY`, se mejora con IA.
- Fotos JPG/PNG: requieren OpenAI Vision.
- `OPENAI_API_KEY` solo en backend (`apps/api/.env`), nunca en Vite.
- `RESEND_API_KEY` / `RESEND_FROM_EMAIL` solo en backend; sin key el alta de miembros sigue funcionando (sin correo).
- Anti-duplicado: referencia / proveedor + periodo + importe; confirm con `force: true` si el usuario insiste.

---

## Tickets completados

| Ticket | Qué se construyó |
|--------|-----------------|
| T-01 | Bootstrap monorepo Svelte+Node+Supabase con MVP completo |
| T-02 | Alta de usuarios (admin), onboarding a hogar y dashboard; modo local sin claves |
| T-03 | Fix auth: env unificada, register API con email_confirm, sin demo key en front |
| T-04 | Módulo Finanzas: CRUD, totales, filtros, gráficas, tabla finance_entries |
| T-05 | Recibos: migración campos+Storage, analyze/confirm OpenAI, revisión UI, dashboard pendiente/vencidos |
| T-06 | Correos Resend: lib/email, /api/emails, welcome al crear miembro, invite + send recordatorio |
