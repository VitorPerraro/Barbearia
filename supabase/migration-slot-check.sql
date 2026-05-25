-- Validação de horário disponível (agendamentos + bloqueios por intervalo)
-- Execute no SQL Editor do Supabase

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
    WHERE booking_date = p_date
      AND status <> 'cancelled'
      AND booking_time::time = t
  ) THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.blocked_slots b
    WHERE b.slot_date = p_date
      AND t >= b.slot_time::time
      AND t <= COALESCE(b.end_time, b.slot_time)::time
  ) THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_slot_available(DATE, TEXT) TO anon, authenticated;

-- Atualiza get_busy_times (intervalos bloqueados + formato consistente)
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
