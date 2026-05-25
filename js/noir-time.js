/* NOIR BARBER — Utilitários de horário */
(function (global) {
  const BOOKING_SLOT_MINUTES = 30;

  const BOOKING_SLOTS = [
    '09:00','09:30','10:00','10:30','11:00','11:30',
    '13:00','13:30','14:00','14:30','15:00','15:30',
    '16:00','17:00','17:30','18:00',
  ];

  function normalizeTime(value) {
    if (!value) return '';
    const v = String(value).trim();
    if (/^\d{1,2}:\d{2}$/.test(v)) {
      const [h, m] = v.split(':').map(Number);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    return v;
  }

  function toMinutes(time) {
    const t = normalizeTime(time);
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }

  function fromMinutes(total) {
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /** Intervalo [start, end] — o horário final também entra no bloqueio */
  function slotOverlapsRange(slotTime, rangeStart, rangeEnd) {
    const slot = toMinutes(slotTime);
    const start = toMinutes(rangeStart);
    const end = toMinutes(rangeEnd);
    if (end <= start) return slot === start;
    return slot >= start && slot <= end;
  }

  function expandRangeToBookingSlots(startTime, endTime, allSlots) {
    const start = normalizeTime(startTime);
    const end = normalizeTime(endTime);
    if (toMinutes(end) <= toMinutes(start)) {
      return allSlots.includes(start) ? [start] : [];
    }
    return allSlots.filter((slot) => slotOverlapsRange(slot, start, end));
  }

  function formatRangeLabel(startTime, endTime) {
    const start = normalizeTime(startTime);
    const end = normalizeTime(endTime);
    if (!end || end === start || toMinutes(end) <= toMinutes(start)) {
      return start;
    }
    return `${start} – ${end}`;
  }

  function validateRange(startTime, endTime) {
    const start = normalizeTime(startTime);
    const end = normalizeTime(endTime);
    if (!start || !end) throw new Error('Informe o horário de início e de término.');
    if (toMinutes(end) < toMinutes(start)) {
      throw new Error('O horário de término deve ser depois do início.');
    }
    if (toMinutes(end) === toMinutes(start)) {
      return { start, end: start, isSingle: true };
    }
    return { start, end, isSingle: false };
  }

  global.NoirTime = {
    BOOKING_SLOT_MINUTES,
    BOOKING_SLOTS,
    normalizeTime,
    toMinutes,
    fromMinutes,
    slotOverlapsRange,
    expandRangeToBookingSlots,
    formatRangeLabel,
    validateRange,
  };
})(typeof window !== 'undefined' ? window : globalThis);
