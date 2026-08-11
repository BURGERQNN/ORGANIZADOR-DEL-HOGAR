-- Extiende Finanzas para recibos / comprobantes (OpenAI OCR)

DO $$ BEGIN
  CREATE TYPE public.finance_payment_status AS ENUM ('pagado', 'pendiente');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Nuevas categorías de servicios (recibos)
DO $$ BEGIN ALTER TYPE public.finance_category ADD VALUE IF NOT EXISTS 'luz'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE public.finance_category ADD VALUE IF NOT EXISTS 'agua'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE public.finance_category ADD VALUE IF NOT EXISTS 'gas'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE public.finance_category ADD VALUE IF NOT EXISTS 'internet'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE public.finance_category ADD VALUE IF NOT EXISTS 'telefono'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE public.finance_category ADD VALUE IF NOT EXISTS 'mantenimiento'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.finance_entries
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS payment_status public.finance_payment_status NOT NULL DEFAULT 'pagado',
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS period_start DATE,
  ADD COLUMN IF NOT EXISTS period_end DATE,
  ADD COLUMN IF NOT EXISTS reference_number TEXT,
  ADD COLUMN IF NOT EXISTS concept TEXT,
  ADD COLUMN IF NOT EXISTS receipt_path TEXT,
  ADD COLUMN IF NOT EXISTS receipt_mime TEXT,
  ADD COLUMN IF NOT EXISTS receipt_filename TEXT;

CREATE INDEX IF NOT EXISTS idx_finance_payment_status ON public.finance_entries (home_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_finance_due_date ON public.finance_entries (home_id, due_date);
CREATE INDEX IF NOT EXISTS idx_finance_provider ON public.finance_entries (home_id, provider);
CREATE INDEX IF NOT EXISTS idx_finance_reference ON public.finance_entries (home_id, reference_number);

-- Bucket de comprobantes (Storage)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipts',
  'receipts',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "receipts_home_read" ON storage.objects;
DROP POLICY IF EXISTS "receipts_home_write" ON storage.objects;

-- Lectura/escritura vía service role en API; políticas mínimas para authenticated
CREATE POLICY "receipts_auth_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'receipts');

CREATE POLICY "receipts_auth_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts');
