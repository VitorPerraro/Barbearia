-- ============================================================
-- Migração: bloqueio por intervalo (início → fim)
-- Execute no SQL Editor do Supabase se o projeto já existia
-- ============================================================

ALTER TABLE public.blocked_slots
  ADD COLUMN IF NOT EXISTS end_time TEXT;

-- Registros antigos: intervalo de um único horário
UPDATE public.blocked_slots
SET end_time = slot_time
WHERE end_time IS NULL;

ALTER TABLE public.blocked_slots
  DROP CONSTRAINT IF EXISTS blocked_slots_slot_date_slot_time_key;

-- Horários ocupados — inclui expansão de intervalos bloqueados
CREATE OR REPLACE FUNCTION public.get_busy_times(p_date DATE)
RETURNS TABLE (slot_time TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT booking_time AS slot_time
  FROM public.bookings
  WHERE booking_date = p_date AND status <> 'cancelled'

  UNION

  SELECT b.slot_time
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
