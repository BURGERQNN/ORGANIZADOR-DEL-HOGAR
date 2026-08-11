-- Casita Familia — módulo Finanzas

DO $$ BEGIN
  CREATE TYPE public.finance_kind AS ENUM ('ingreso', 'gasto');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.finance_category AS ENUM (
    'sueldo',
    'freelance',
    'otros_ingresos',
    'comida',
    'hogar',
    'transporte',
    'servicios',
    'salud',
    'entretenimiento',
    'otros_gastos'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.finance_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  kind public.finance_kind NOT NULL,
  category public.finance_category NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  title TEXT NOT NULL,
  notes TEXT,
  occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_home_date ON public.finance_entries (home_id, occurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_finance_home_kind ON public.finance_entries (home_id, kind);
CREATE INDEX IF NOT EXISTS idx_finance_home_category ON public.finance_entries (home_id, category);

ALTER TABLE public.finance_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance_member_all" ON public.finance_entries;
CREATE POLICY "finance_member_all" ON public.finance_entries
  FOR ALL TO authenticated
  USING (home_id = public.current_home_id())
  WITH CHECK (home_id = public.current_home_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_entries TO authenticated;
GRANT ALL ON public.finance_entries TO service_role;

DROP TRIGGER IF EXISTS update_finance_entries_updated_at ON public.finance_entries;
CREATE TRIGGER update_finance_entries_updated_at
BEFORE UPDATE ON public.finance_entries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
