-- ============================================================
-- NOIR BARBER — Schema Supabase
-- Execute no SQL Editor do painel Supabase (Run)
-- ============================================================

-- Agendamentos de clientes
CREATE TABLE IF NOT EXISTS public.bookings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL,
  service       TEXT NOT NULL,
  booking_date  DATE NOT NULL,
  booking_time  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookings_date ON public.bookings (booking_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings (status);

-- Horários bloqueados pelo barbeiro (intervalo: slot_time = início, end_time = fim)
CREATE TABLE IF NOT EXISTS public.blocked_slots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_date   DATE NOT NULL,
  slot_time   TEXT NOT NULL,
  end_time    TEXT,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blocked_slots_date ON public.blocked_slots (slot_date);

-- Atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bookings_updated_at ON public.bookings;
CREATE TRIGGER bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Horários ocupados (site público — sem expor dados dos clientes)
CREATE OR REPLACE FUNCTION public.get_busy_times(p_date DATE)
RETURNS TABLE (slot_time TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_char(booking_time::time, 'HH24:MI') AS slot_time
  FROM public.bookings
  WHERE booking_date = p_date AND status <> 'cancelled'

  UNION

  SELECT to_char(b.slot_time::time, 'HH24:MI')
  FROM public.blocked_slots b
  WHERE b.slot_date = p_date
    AND (b.end_time IS NULL OR b.end_time = b.slot_time)

  UNION

  SELECT to_char(slot_ts, 'HH24:MI')
  FROM public.blocked_slots b
  CROSS JOIN LATERAL generate_series(
    0,
    CEIL(
      EXTRACT(EPOCH FROM (COALESCE(b.end_time, b.slot_time)::time - b.slot_time::time)) / 1800
    )::int
  ) AS gs(n)
  CROSS JOIN LATERAL (
    SELECT (b.slot_time::time + (gs.n * interval '30 minutes'))::time AS slot_ts
  ) t
  WHERE b.slot_date = p_date
    AND b.end_time IS NOT NULL
    AND b.end_time <> b.slot_time
    AND COALESCE(b.end_time, b.slot_time)::time > b.slot_time::time
    AND t.slot_ts <= COALESCE(b.end_time, b.slot_time)::time;
$$;

GRANT EXECUTE ON FUNCTION public.get_busy_times(DATE) TO anon, authenticated;

-- Verifica se horário está livre (reserva + bloqueio por intervalo)
CREATE OR REPLACE FUNCTION public.is_slot_available(p_date DATE, p_time TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t TIME := p_time::time;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.bookings
    WHERE booking_date = p_date AND status <> 'cancelled' AND booking_time::time = t
  ) THEN RETURN FALSE; END IF;

  IF EXISTS (
    SELECT 1 FROM public.blocked_slots b
    WHERE b.slot_date = p_date
      AND t >= b.slot_time::time
      AND t <= COALESCE(b.end_time, b.slot_time)::time
  ) THEN RETURN FALSE; END IF;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_slot_available(DATE, TEXT) TO anon, authenticated;

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_slots ENABLE ROW LEVEL SECURITY;

-- Clientes: criar agendamento pelo site (anon)
DROP POLICY IF EXISTS "anon_insert_bookings" ON public.bookings;
CREATE POLICY "anon_insert_bookings"
  ON public.bookings FOR INSERT TO anon
  WITH CHECK (true);

-- Barbeiro autenticado: controle total dos agendamentos
DROP POLICY IF EXISTS "auth_all_bookings" ON public.bookings;
CREATE POLICY "auth_all_bookings"
  ON public.bookings FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Barbeiro: horários bloqueados
DROP POLICY IF EXISTS "auth_all_blocked" ON public.blocked_slots;
CREATE POLICY "auth_all_blocked"
  ON public.blocked_slots FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
