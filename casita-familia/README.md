# Casita Familia

App de tareas del hogar: calendario, recordatorios, perfiles, roles, puntos y recompensas.

## Stack

- Front: Svelte + Vite (`apps/web`)
- API: Node + Express (`apps/api`)
- DB/Auth: Supabase

## Arranque

1. Aplica la migración SQL en Supabase SQL Editor:
   `supabase/migrations/20260810180000_casita_familia.sql`

2. Copia claves en:
   - `apps/api/.env` → `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `apps/web/.env` → `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

3. Terminals:

```bash
cd apps/api && npm install && npm run dev
cd apps/web && npm install && npm run dev
```

- API: http://localhost:4000
- Web: http://localhost:5173

## Funciones MVP

| Módulo | Qué hace |
|--------|----------|
| Auth | Login/registro vía Supabase |
| Hogar | Crear o unirse con código |
| Calendario | Crear tareas/eventos y marcar hecho (+puntos) |
| Recordatorios | Alta y listado por hogar |
| Perfiles/roles | admin, miembro, invitado |
| Recompensas | Crear (admin), canjear (puntos) |
