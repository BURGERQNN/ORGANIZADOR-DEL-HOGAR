-- NOTA: En el proyecto Supabase ya existe public.leads con columnas
-- nombre, email, telefono, servicios, respuestas, propuesta, estado, etc.
-- No crear una tabla nueva. Esta migración es no-op de seguridad si alguien
-- la corre en un entorno vacío sin esa tabla previa.

-- Si leads NO existiera (entorno limpio), crear esquema compatible mínimo:
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL,
  telefono TEXT NOT NULL DEFAULT '',
  empresa TEXT,
  servicios TEXT[] NOT NULL DEFAULT '{}',
  respuestas JSONB NOT NULL DEFAULT '{}'::jsonb,
  propuesta TEXT NOT NULL DEFAULT '',
  propuesta_html TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente_revision',
  notas_internas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  aprobado_at TIMESTAMPTZ,
  enviado_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_email ON public.leads (email);
