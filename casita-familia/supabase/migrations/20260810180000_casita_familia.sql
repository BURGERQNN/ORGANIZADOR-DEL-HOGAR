-- Casita Familia — schema MVP (hogar, roles, calendario, recordatorios, puntos)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Roles del hogar (catálogo cerrado)
DO $$ BEGIN
  CREATE TYPE public.home_role AS ENUM ('admin', 'miembro', 'invitado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.event_type AS ENUM ('tarea', 'evento', 'recordatorio');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.event_status AS ENUM ('pendiente', 'hecho', 'cancelado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.reminder_status AS ENUM ('programado', 'enviado', 'cancelado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.redemption_status AS ENUM ('pendiente', 'aprobado', 'rechazado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Hogares
CREATE TABLE IF NOT EXISTS public.homes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(4), 'hex'),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Extiende profiles (si ya existe la tabla de Lovable)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS home_id UUID REFERENCES public.homes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS role public.home_role NOT NULL DEFAULT 'miembro',
  ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0);

-- Eventos / tareas / calendario
CREATE TABLE IF NOT EXISTS public.home_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  event_type public.event_type NOT NULL DEFAULT 'tarea',
  status public.event_status NOT NULL DEFAULT 'pendiente',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  assignee_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  points_reward INTEGER NOT NULL DEFAULT 10 CHECK (points_reward >= 0),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_home_events_home_starts ON public.home_events (home_id, starts_at);

-- Recordatorios
CREATE TABLE IF NOT EXISTS public.reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  event_id UUID REFERENCES public.home_events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  remind_at TIMESTAMPTZ NOT NULL,
  status public.reminder_status NOT NULL DEFAULT 'programado',
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reminders_user_at ON public.reminders (user_id, remind_at);

-- Recompensas
CREATE TABLE IF NOT EXISTS public.rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  cost_points INTEGER NOT NULL CHECK (cost_points > 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Canjes
CREATE TABLE IF NOT EXISTS public.redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  reward_id UUID NOT NULL REFERENCES public.rewards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status public.redemption_status NOT NULL DEFAULT 'pendiente',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- RLS
ALTER TABLE public.homes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redemptions ENABLE ROW LEVEL SECURITY;

-- Policies: acceso por home_id del profile (service_role bypasea; API usa service role)
CREATE OR REPLACE FUNCTION public.current_home_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT home_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE POLICY "homes_select_member" ON public.homes
  FOR SELECT TO authenticated USING (id = public.current_home_id() OR created_by = auth.uid());

CREATE POLICY "homes_insert_auth" ON public.homes
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

CREATE POLICY "events_member_all" ON public.home_events
  FOR ALL TO authenticated USING (home_id = public.current_home_id())
  WITH CHECK (home_id = public.current_home_id());

CREATE POLICY "reminders_own" ON public.reminders
  FOR ALL TO authenticated USING (user_id = auth.uid() OR home_id = public.current_home_id())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "rewards_member" ON public.rewards
  FOR ALL TO authenticated USING (home_id = public.current_home_id())
  WITH CHECK (home_id = public.current_home_id());

CREATE POLICY "redemptions_member" ON public.redemptions
  FOR ALL TO authenticated USING (home_id = public.current_home_id())
  WITH CHECK (home_id = public.current_home_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.homes, public.home_events, public.reminders, public.rewards, public.redemptions TO authenticated;
GRANT ALL ON public.homes, public.home_events, public.reminders, public.rewards, public.redemptions TO service_role;
