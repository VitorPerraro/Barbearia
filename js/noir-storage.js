/* NOIR BARBER — Armazenamento via Supabase */
(function (global) {
  function dateKey(year, month, day) {
    const m = String(month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${m}-${d}`;
  }

  function parseDateKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return { year: y, month: m - 1, day: d };
  }

  function mapBooking(row) {
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      service: row.service,
      date: row.booking_date,
      time: row.booking_time,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  let supportsEndTimeColumn = null;

  async function checkEndTimeColumn() {
    if (supportsEndTimeColumn !== null) return supportsEndTimeColumn;
    const { error } = await db().from('blocked_slots').select('end_time').limit(1);
    if (error && isEndTimeColumnMissing(error)) {
      supportsEndTimeColumn = false;
    } else {
      supportsEndTimeColumn = true;
    }
    return supportsEndTimeColumn;
  }

  function mapBlocked(row) {
    const start = normalizeSlotTime(row.slot_time);
    const end = row.end_time != null
      ? normalizeSlotTime(row.end_time)
      : start;
    return {
      id: row.id,
      date: row.slot_date,
      start,
      end,
      time: start,
      reason: row.reason || '',
      createdAt: row.created_at,
    };
  }

  /** Agrupa vários slots de 30min em um único período na interface */
  function consolidateBlockedSlots(slots) {
    const T = global.NoirTime;
    if (!T || !slots.length) return [];

    const byDate = {};
    slots.forEach((s) => {
      if (!byDate[s.date]) byDate[s.date] = [];
      byDate[s.date].push(s);
    });

    const groups = [];

    Object.keys(byDate).sort().forEach((date) => {
      const items = byDate[date].sort((a, b) => T.toMinutes(a.start) - T.toMinutes(b.start));
      let i = 0;

      while (i < items.length) {
        const item = items[i];

        if (T.toMinutes(item.end) > T.toMinutes(item.start)) {
          groups.push({
            date,
            start: item.start,
            end: item.end,
            reason: item.reason,
            ids: [item.id],
          });
          i += 1;
          continue;
        }

        let start = item.start;
        let end = item.start;
        const ids = [item.id];
        const reason = item.reason;
        i += 1;

        while (i < items.length) {
          const next = items[i];
          if (T.toMinutes(next.end) > T.toMinutes(next.start)) break;
          if ((next.reason || '') !== (reason || '')) break;
          if (T.toMinutes(next.start) !== T.toMinutes(end) + T.BOOKING_SLOT_MINUTES) break;
          end = next.start;
          ids.push(next.id);
          i += 1;
        }

        groups.push({ date, start, end, reason, ids });
      }
    });

    return groups;
  }

  async function clearBlockedRange(date, start, end) {
    const T = global.NoirTime;
    const startM = T.toMinutes(start);
    const endM = T.toMinutes(end);
    const hasEnd = await checkEndTimeColumn();

    if (!hasEnd) {
      const slots = T.expandRangeToBookingSlots(start, end, T.BOOKING_SLOTS);
      for (const time of slots) {
        await db().from('blocked_slots').delete().eq('slot_date', date).eq('slot_time', time);
      }
      return;
    }

    const { data, error } = await db()
      .from('blocked_slots')
      .select('id, slot_time, end_time')
      .eq('slot_date', date);

    if (error) throw new Error(error.message);

    const ids = (data || [])
      .filter((row) => {
        const rs = T.toMinutes(normalizeSlotTime(row.slot_time));
        const re = T.toMinutes(normalizeSlotTime(row.end_time || row.slot_time));
        return rs <= endM && re >= startM;
      })
      .map((row) => row.id);

    if (ids.length) {
      const { error: delErr } = await db().from('blocked_slots').delete().in('id', ids);
      if (delErr) throw new Error(delErr.message);
    }
  }

  function db() {
    return global.NoirSupabase.getClient();
  }

  function isEndTimeColumnMissing(error) {
    const msg = (error?.message || '').toLowerCase();
    return msg.includes('end_time') && (
      msg.includes('column') || msg.includes('schema') || msg.includes('does not exist')
    );
  }

  async function fetchBlockedSlots() {
    const hasEnd = await checkEndTimeColumn();
    const cols = hasEnd
      ? 'id, slot_date, slot_time, end_time, reason, created_at'
      : 'id, slot_date, slot_time, reason, created_at';

    const { data, error } = await db()
      .from('blocked_slots')
      .select(cols)
      .order('slot_date', { ascending: false });

    if (error) throw new Error(error.message);
    return (data || []).map(mapBlocked);
  }

  function normalizeSlotTime(t) {
    if (!t) return '';
    if (global.NoirTime?.normalizeTime) return global.NoirTime.normalizeTime(t);
    const m = String(t).trim().match(/^(\d{1,2}):(\d{2})/);
    return m ? `${m[1].padStart(2, '0')}:${m[2]}` : String(t).trim();
  }

  const NoirStorage = {
    dateKey,
    parseDateKey,

    isReady() {
      return global.NoirSupabase?.isConfigured?.() ?? false;
    },

    async getBookings(filters = {}) {
      let q = db().from('bookings').select('*').order('booking_date').order('booking_time');

      if (filters.date) q = q.eq('booking_date', filters.date);
      if (filters.status) q = q.eq('status', filters.status);
      if (filters.from) q = q.gte('booking_date', filters.from);
      if (filters.to) q = q.lte('booking_date', filters.to);

      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data || []).map(mapBooking);
    },

    async isSlotAvailable(year, month, day, time) {
      const key = dateKey(year, month, day);
      const slot = normalizeSlotTime(time);

      const { data, error } = await db().rpc('is_slot_available', {
        p_date: key,
        p_time: slot,
      });

      if (!error && typeof data === 'boolean') return data;

      const busy = await this.getBookedTimesForDay(year, month, day);
      return !busy.includes(slot);
    },

    async addBooking({ name, phone, service, year, month, day, time }) {
      const slot = normalizeSlotTime(time);
      const available = await this.isSlotAvailable(year, month, day, slot);
      if (!available) {
        throw new Error('Este horário não está disponível (ocupado ou bloqueado). Escolha outro horário.');
      }

      const row = {
        name,
        phone,
        service,
        booking_date: dateKey(year, month, day),
        booking_time: slot,
        status: 'pending',
      };
      const { data, error } = await db().from('bookings').insert(row).select().single();
      if (error) throw new Error(error.message);
      return mapBooking(data);
    },

    async updateBooking(id, patch) {
      const row = {};
      if (patch.status) row.status = patch.status;
      if (patch.name) row.name = patch.name;
      if (patch.phone) row.phone = patch.phone;
      if (patch.service) row.service = patch.service;

      const { data, error } = await db()
        .from('bookings')
        .update(row)
        .eq('id', id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return mapBooking(data);
    },

    async deleteBooking(id) {
      const { error } = await db().from('bookings').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },

    async getBookedTimesForDay(year, month, day) {
      const key = dateKey(year, month, day);
      const T = global.NoirTime;

      const { data, error } = await db().rpc('get_busy_times', { p_date: key });

      if (!error) {
        const times = (data || []).map((r) => normalizeSlotTime(r.slot_time)).filter(Boolean);
        return [...new Set(times)];
      }

      if (isEndTimeColumnMissing(error)) {
        const times = [];

        const fromBookings = await db()
          .from('bookings')
          .select('booking_time')
          .eq('booking_date', key)
          .neq('status', 'cancelled');

        if (!fromBookings.error && fromBookings.data) {
          fromBookings.data.forEach((r) => times.push(normalizeSlotTime(r.booking_time)));
        }

        const fromBlocked = await db()
          .from('blocked_slots')
          .select('slot_time')
          .eq('slot_date', key);

        if (!fromBlocked.error && fromBlocked.data) {
          fromBlocked.data.forEach((r) => times.push(normalizeSlotTime(r.slot_time)));
        }

        if (times.length) return [...new Set(times.filter(Boolean))];

        throw new Error(
          'Atualize o banco no Supabase: execute o arquivo supabase/fix-end-time-column.sql no SQL Editor.'
        );
      }

      throw new Error(error.message);
    },

    async getAll() {
      const bookingsRes = await db()
        .from('bookings')
        .select('*')
        .order('booking_date', { ascending: false });

      if (bookingsRes.error) throw new Error(bookingsRes.error.message);

      const blockedSlots = await fetchBlockedSlots();

      return {
        bookings: (bookingsRes.data || []).map(mapBooking),
        blockedSlots,
      };
    },

    async blockRange(date, startTime, endTime, reason = '') {
      const T = global.NoirTime;
      const { start, end, isSingle } = T.validateRange(startTime, endTime);
      const reasonVal = reason || null;
      const hasEnd = await checkEndTimeColumn();

      await clearBlockedRange(date, start, end);

      if (hasEnd) {
        const { error } = await db().from('blocked_slots').insert({
          slot_date: date,
          slot_time: start,
          end_time: isSingle ? start : end,
          reason: reasonVal,
        });
        if (error) throw new Error(error.message);
        return;
      }

      const slots = isSingle
        ? [start]
        : T.expandRangeToBookingSlots(start, end, T.BOOKING_SLOTS);

      if (!slots.length) {
        throw new Error('Nenhum horário do site corresponde a este intervalo.');
      }

      const rows = slots.map((time) => ({
        slot_date: date,
        slot_time: time,
        reason: reasonVal,
      }));

      const { error } = await db().from('blocked_slots').insert(rows);
      if (error) throw new Error(error.message);
    },

    getConsolidatedBlockedSlots(slots) {
      return consolidateBlockedSlots(slots);
    },

    /** @deprecated use blockRange */
    async blockSlot(date, time, reason = '') {
      return this.blockRange(date, time, time, reason);
    },

    async unblockById(id) {
      const { error } = await db().from('blocked_slots').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },

    async unblockByIds(ids) {
      if (!ids?.length) return;
      const { error } = await db().from('blocked_slots').delete().in('id', ids);
      if (error) throw new Error(error.message);
    },

    async unblockSlot(date, time) {
      const { error } = await db()
        .from('blocked_slots')
        .delete()
        .eq('slot_date', date)
        .eq('slot_time', time);
      if (error) throw new Error(error.message);
    },

    async getStats() {
      const bookings = (await this.getBookings()).filter((b) => b.status !== 'cancelled');
      const today = new Date();
      const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());

      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const ws = dateKey(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate());
      const we = dateKey(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate());

      return {
        today: bookings.filter((b) => b.date === todayKey).length,
        pending: bookings.filter((b) => b.status === 'pending').length,
        week: bookings.filter((b) => b.date >= ws && b.date <= we).length,
        total: bookings.length,
      };
    },
  };

  global.NoirStorage = NoirStorage;
})(typeof window !== 'undefined' ? window : globalThis);
