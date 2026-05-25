/* NOIR BARBER — Painel do Barbeiro (Supabase) */
(function () {
  const ALL_TIMES = ['09:00','09:30','10:00','10:30','11:00','11:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','17:00','17:30','18:00'];
  const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const STATUS_LABELS = { pending: 'Pendente', confirmed: 'Confirmado', completed: 'Concluído', cancelled: 'Cancelado' };

  const loginScreen = document.getElementById('loginScreen');
  const dashboard   = document.getElementById('dashboard');
  const loginForm   = document.getElementById('loginForm');
  const loginError  = document.getElementById('loginError');
  const loginBtn    = document.getElementById('loginBtn');

  let agendaDate = new Date();
  let agendaFilterMode = 'all';
  let dashCalYear = agendaDate.getFullYear();
  let dashCalMonth = agendaDate.getMonth();
  let selectedCalDate = null;
  let cachedAllBookings = [];

  function formatDateLabel(d) {
    const days = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
    return `${days[d.getDay()]}, ${d.getDate()} de ${MONTHS_PT[d.getMonth()]} de ${d.getFullYear()}`;
  }

  function toInputDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function showConfigError(msg) {
    loginError.textContent = msg;
    loginError.classList.remove('hidden');
    loginBtn.disabled = true;
  }

  function showLogin() {
    loginScreen.classList.remove('hidden');
    dashboard.classList.add('hidden');
  }

  function showDashboard() {
    loginScreen.classList.add('hidden');
    dashboard.classList.remove('hidden');
    refreshAll();
    fillSettingsEmail();
  }

  async function fillSettingsEmail() {
    const email = await NoirAuth.getUserEmail();
    const el = document.getElementById('settingsEmail');
    if (el) el.value = email;
  }

  async function refreshStats() {
    try {
      const s = await NoirStorage.getStats();
      document.getElementById('statToday').textContent = s.today;
      document.getElementById('statPending').textContent = s.pending;
      document.getElementById('statWeek').textContent = s.week;
      document.getElementById('statTotal').textContent = s.total;
    } catch (err) {
      console.error(err);
    }
  }

  async function refreshAll() {
    document.getElementById('dashDateLabel').textContent = formatDateLabel(new Date());
    try {
      const data = await NoirStorage.getAll();
      cachedAllBookings = data.bookings;
      await refreshStats();
      await renderAgenda();
      renderDashCalendar();
      await renderBlockedList();
      initBlockForm();
    } catch (err) {
      showAgendaError(err.message);
    }
  }

  function showAgendaError(msg) {
    document.getElementById('agendaList').innerHTML = `
      <div class="agenda-empty">
        <p style="color:#e87a7a;">Erro ao carregar: ${escapeHtml(msg)}</p>
        <p style="font-size:.78rem;margin-top:8px;">Verifique SETUP-SUPABASE.md e sua conexão.</p>
      </div>`;
  }

  /* ── Inicialização ── */
  (async function init() {
    if (!NoirAuth.isConfigured()) {
      showConfigError('Configure js/supabase-config.js antes de usar o painel. Veja SETUP-SUPABASE.md.');
      return;
    }
    try {
      const session = await NoirAuth.init();
      if (session) showDashboard();
      else showLogin();
    } catch (err) {
      showConfigError(err.message);
    }

    NoirAuth.onAuthStateChange((session) => {
      if (session) showDashboard();
      else showLogin();
    });
  })();

  document.getElementById('togglePass')?.addEventListener('click', () => {
    const inp = document.getElementById('loginPass');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.classList.add('hidden');
    loginBtn.classList.add('loading');
    loginBtn.disabled = true;

    try {
      const email = document.getElementById('loginEmail').value;
      const pass = document.getElementById('loginPass').value;
      await NoirAuth.login(email, pass);
      showDashboard();
    } catch (err) {
      loginError.textContent = err.message;
      loginError.classList.remove('hidden');
    } finally {
      loginBtn.classList.remove('loading');
      loginBtn.disabled = false;
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await NoirAuth.logout();
    showLogin();
    loginForm.reset();
  });

  /* ── Navegação ── */
  const views = {
    agenda: { el: document.getElementById('viewAgenda'), title: 'Sua Agenda' },
    calendar: { el: document.getElementById('viewCalendar'), title: 'Calendário' },
    block: { el: document.getElementById('viewBlock'), title: 'Bloquear Horário' },
    settings: { el: document.getElementById('viewSettings'), title: 'Segurança' },
  };

  function switchView(name) {
    Object.values(views).forEach((v) => v.el.classList.add('hidden'));
    views[name].el.classList.remove('hidden');
    document.getElementById('dashTitle').textContent = views[name].title;
    document.querySelectorAll('.dash-nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === name);
    });
    document.getElementById('dashSidebar')?.classList.remove('open');
    if (name === 'settings') fillSettingsEmail();
    if (name === 'calendar') {
      renderDashCalendar();
      if (!selectedCalDate) {
        const todayKey = toInputDate(new Date());
        const hasToday = cachedAllBookings.some((b) => b.date === todayKey && b.status !== 'cancelled');
        if (hasToday) renderCalDayDetail(todayKey);
      }
    }
  }

  document.querySelectorAll('.dash-nav-item').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  document.getElementById('dashMenuBtn')?.addEventListener('click', () => {
    document.getElementById('dashSidebar').classList.toggle('open');
  });

  /* ── Agenda (todas + filtro por dia) ── */
  const agendaDatePicker = document.getElementById('agendaDatePicker');
  const agendaDayNav = document.getElementById('agendaDayNav');
  const agendaFilterSelect = document.getElementById('agendaFilterMode');
  const agendaCountEl = document.getElementById('agendaCount');
  agendaDatePicker.value = toInputDate(agendaDate);

  function formatBookingDateLabel(dateKey) {
    const { year, month, day } = NoirStorage.parseDateKey(dateKey);
    const d = new Date(year, month, day);
    const days = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
    return `${days[d.getDay()]}, ${day} de ${MONTHS_PT[month]} de ${year}`;
  }

  function normalizePhoneForWhatsApp(phone) {
    let digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
    else if (!digits.startsWith('55') && digits.length >= 10) digits = `55${digits}`;
    return digits;
  }

  function buildWhatsAppConfirmMessage(booking) {
    const dateLabel = formatBookingDateLabel(booking.date);
    return (
      `Olá ${booking.name}! ✅\n\n` +
      `Seu agendamento na *NOIR BARBER* foi *confirmado*!\n\n` +
      `📅 Data: ${dateLabel}\n` +
      `🕐 Horário: ${booking.time}\n` +
      `✂ Serviço: ${booking.service}\n\n` +
      `Aguardamos você! Qualquer dúvida, é só responder esta mensagem.`
    );
  }

  function getWhatsAppUrl(phone, message) {
    const normalized = normalizePhoneForWhatsApp(phone);
    if (!normalized) return null;
    const base = `https://wa.me/${normalized}`;
    return message ? `${base}?text=${encodeURIComponent(message)}` : base;
  }

  function openWhatsAppConfirmToClient(booking) {
    const url = getWhatsAppUrl(booking.phone, buildWhatsAppConfirmMessage(booking));
    if (!url || normalizePhoneForWhatsApp(booking.phone).length < 12) {
      alert('Telefone do cliente inválido. Confirme o agendamento, mas envie a mensagem manualmente pelo WhatsApp.');
      return false;
    }
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) {
      if (confirm('Não foi possível abrir o WhatsApp automaticamente. Deseja copiar o link da conversa?')) {
        navigator.clipboard?.writeText(url);
        alert('Link copiado. Cole no navegador para abrir o WhatsApp.');
      }
      return false;
    }
    return true;
  }

  function isTodayKey(dateKey) {
    return dateKey === toInputDate(new Date());
  }

  function updateAgendaFilterUI() {
    const isDay = agendaFilterMode === 'day';
    agendaDayNav.classList.toggle('hidden', !isDay);
  }

  function isArchivedStatus(status) {
    return status === 'completed' || status === 'cancelled';
  }

  function renderAgendaCard(b) {
    const archived = isArchivedStatus(b.status);
    return `
      <article class="agenda-card ${archived ? 'agenda-card--archived' : ''}" data-id="${b.id}">
        <div class="agenda-time">${b.time}</div>
        <div class="agenda-info">
          <h4>${escapeHtml(b.name)}</h4>
          <p>📱 ${escapeHtml(b.phone)}</p>
          <p class="agenda-service">${escapeHtml(b.service)}</p>
        </div>
        <div class="agenda-actions">
          <span class="status-badge status-${b.status}">${STATUS_LABELS[b.status] || b.status}</span>
          <div class="agenda-btns">
            ${b.status === 'pending' ? `<button class="btn-action primary" data-action="confirm" data-id="${b.id}">Confirmar</button>` : ''}
            ${b.status !== 'completed' && b.status !== 'cancelled' ? `<button class="btn-action" data-action="complete" data-id="${b.id}">Concluir</button>` : ''}
            ${b.status !== 'cancelled' ? `<button class="btn-action danger" data-action="cancel" data-id="${b.id}">Cancelar</button>` : ''}
            ${archived ? `<button class="btn-action delete-action" data-action="delete" data-id="${b.id}">Excluir</button>` : ''}
            ${!archived ? `<a class="btn-action" href="${getWhatsAppUrl(b.phone, `Olá ${b.name}, aqui é a NOIR BARBER!`)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
          </div>
        </div>
      </article>`;
  }

  function bindAgendaActions(container) {
    container.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const action = btn.dataset.action;

        if (action === 'delete') {
          if (!confirm('Excluir este agendamento permanentemente? Esta ação não pode ser desfeita.')) return;
        }

        btn.disabled = true;
        try {
          const booking = cachedAllBookings.find((b) => b.id === id);

          if (action === 'confirm') {
            if (!booking) throw new Error('Agendamento não encontrado.');
            await NoirStorage.updateBooking(id, { status: 'confirmed' });
            openWhatsAppConfirmToClient(booking);
          }
          if (action === 'complete') await NoirStorage.updateBooking(id, { status: 'completed' });
          if (action === 'cancel') await NoirStorage.updateBooking(id, { status: 'cancelled' });
          if (action === 'delete') await NoirStorage.deleteBooking(id);
          await refreshAll();
        } catch (err) {
          alert(err.message);
        }
      });
    });
  }

  function groupBookingsByDate(bookings) {
    const groups = new Map();
    bookings.forEach((b) => {
      if (!groups.has(b.date)) groups.set(b.date, []);
      groups.get(b.date).push(b);
    });
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }

  async function renderAgenda() {
    const list = document.getElementById('agendaList');
    updateAgendaFilterUI();

    try {
      let bookings = cachedAllBookings.length
        ? [...cachedAllBookings]
        : await NoirStorage.getBookings();

      if (agendaFilterMode === 'day') {
        const dateStr = toInputDate(agendaDate);
        bookings = bookings.filter((b) => b.date === dateStr);
      }

      const showArchived = document.getElementById('agendaShowArchived')?.checked;
      const archivedCount = bookings.filter((b) => isArchivedStatus(b.status)).length;

      if (!showArchived) {
        bookings = bookings.filter((b) => !isArchivedStatus(b.status));
      }

      bookings.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.time.localeCompare(b.time);
      });

      let countLabel = bookings.length === 1 ? '1 agendamento' : `${bookings.length} agendamentos`;
      if (!showArchived && archivedCount > 0) {
        countLabel += ` · ${archivedCount} oculto(s)`;
      }
      agendaCountEl.textContent = countLabel;

      if (!bookings.length) {
        const emptyMsg = !showArchived && archivedCount > 0
          ? 'Só há agendamentos concluídos/cancelados. Marque a opção abaixo para ver e excluir.'
          : agendaFilterMode === 'day'
            ? 'Nenhum agendamento ativo para este dia.'
            : 'Nenhum agendamento ativo no momento.';
        list.innerHTML = `
          <div class="agenda-empty">
            <div class="agenda-empty-icon">◷</div>
            <p>${emptyMsg}</p>
            <p style="font-size:.78rem;margin-top:8px;">Os clientes que agendarem pelo site aparecerão aqui.</p>
          </div>`;
        return;
      }

      if (agendaFilterMode === 'day') {
        list.innerHTML = bookings.map(renderAgendaCard).join('');
      } else {
        const grouped = groupBookingsByDate(bookings);
        list.innerHTML = grouped.map(([dateKey, dayBookings]) => `
          <section class="agenda-day-group">
            <div class="agenda-day-heading">
              <h3>${formatBookingDateLabel(dateKey)}</h3>
              <span class="day-badge">${dayBookings.length} ${dayBookings.length === 1 ? 'horário' : 'horários'}${isTodayKey(dateKey) ? ' · Hoje' : ''}</span>
            </div>
            ${dayBookings.map(renderAgendaCard).join('')}
          </section>
        `).join('');
      }

      bindAgendaActions(list);
    } catch (err) {
      showAgendaError(err.message);
    }
  }

  function setAgendaDayFilter(date) {
    agendaFilterMode = 'day';
    agendaFilterSelect.value = 'day';
    agendaDate = new Date(date);
    agendaDatePicker.value = toInputDate(agendaDate);
    updateAgendaFilterUI();
    renderAgenda();
  }

  agendaFilterSelect.addEventListener('change', () => {
    agendaFilterMode = agendaFilterSelect.value;
    updateAgendaFilterUI();
    renderAgenda();
  });

  document.getElementById('agendaShowArchived')?.addEventListener('change', () => {
    renderAgenda();
  });

  agendaDatePicker.addEventListener('change', () => {
    agendaDate = new Date(agendaDatePicker.value + 'T12:00:00');
    renderAgenda();
  });

  document.getElementById('agendaPrevDay').addEventListener('click', () => {
    agendaDate.setDate(agendaDate.getDate() - 1);
    agendaDatePicker.value = toInputDate(agendaDate);
    renderAgenda();
  });

  document.getElementById('agendaNextDay').addEventListener('click', () => {
    agendaDate.setDate(agendaDate.getDate() + 1);
    agendaDatePicker.value = toInputDate(agendaDate);
    renderAgenda();
  });

  document.getElementById('agendaTodayBtn').addEventListener('click', () => {
    agendaDate = new Date();
    agendaDatePicker.value = toInputDate(agendaDate);
    renderAgenda();
  });

  /* ── Calendário visual ── */
  function getBookingsForDateKey(dateKey) {
    return cachedAllBookings
      .filter((b) => b.date === dateKey && b.status !== 'cancelled')
      .sort((a, b) => a.time.localeCompare(b.time));
  }

  function renderCalMonthStats() {
    const statsEl = document.getElementById('calMonthStats');
    const monthPrefix = `${dashCalYear}-${String(dashCalMonth + 1).padStart(2, '0')}`;
    const monthBookings = cachedAllBookings.filter(
      (b) => b.date.startsWith(monthPrefix) && b.status !== 'cancelled'
    );
    const pending = monthBookings.filter((b) => b.status === 'pending').length;
    const daysWithBookings = new Set(monthBookings.map((b) => b.date)).size;

    statsEl.innerHTML = `
      <div class="cal-stat-pill cal-stat-pill--gold">
        <strong>${monthBookings.length}</strong>
        <span>${monthBookings.length === 1 ? 'agendamento' : 'agendamentos'} no mês</span>
      </div>
      <div class="cal-stat-pill">
        <strong>${pending}</strong>
        <span>${pending === 1 ? 'pendente' : 'pendentes'}</span>
      </div>
      <div class="cal-stat-pill cal-stat-pill--muted">
        <strong>${daysWithBookings}</strong>
        <span>${daysWithBookings === 1 ? 'dia ocupado' : 'dias ocupados'}</span>
      </div>`;
  }

  function renderCalDayDetail(dateKey) {
    const panel = document.getElementById('calDayDetail');
    if (!dateKey) {
      panel.classList.add('hidden');
      panel.innerHTML = '';
      return;
    }

    const bookings = getBookingsForDateKey(dateKey);
    const pending = bookings.filter((b) => b.status === 'pending').length;

    panel.classList.remove('hidden');

    if (!bookings.length) {
      panel.innerHTML = `
        <div class="cal-day-detail-header">
          <div>
            <h4>${formatBookingDateLabel(dateKey)}</h4>
            <p>Nenhum agendamento ativo neste dia.</p>
          </div>
        </div>`;
      return;
    }

    panel.innerHTML = `
      <div class="cal-day-detail-header">
        <div>
          <h4>${formatBookingDateLabel(dateKey)}</h4>
          <p>${bookings.length} ${bookings.length === 1 ? 'horário' : 'horários'}${pending ? ` · ${pending} pendente(s)` : ''}</p>
        </div>
        <button type="button" class="btn-ghost btn-sm" id="calOpenAgendaBtn">Ver na agenda →</button>
      </div>
      <div class="cal-day-detail-list">
        ${bookings.map((b) => `
          <div class="cal-detail-item">
            <span class="cal-detail-time">${b.time}</span>
            <div>
              <div class="cal-detail-name">${escapeHtml(b.name)}</div>
              <div class="cal-detail-service">${escapeHtml(b.service)}</div>
            </div>
            <span class="status-badge status-${b.status}">${STATUS_LABELS[b.status]}</span>
          </div>
        `).join('')}
      </div>`;

    document.getElementById('calOpenAgendaBtn')?.addEventListener('click', () => {
      const { year, month, day } = NoirStorage.parseDateKey(dateKey);
      setAgendaDayFilter(new Date(year, month, day));
      switchView('agenda');
    });
  }

  function renderDashCalendar() {
    const container = document.getElementById('dashCalDays');
    document.getElementById('dashCalMonth').textContent = `${MONTHS_PT[dashCalMonth]} ${dashCalYear}`;
    renderCalMonthStats();
    container.innerHTML = '';

    const firstDay = new Date(dashCalYear, dashCalMonth, 1).getDay();
    const daysTotal = new Date(dashCalYear, dashCalMonth + 1, 0).getDate();
    const todayKey = toInputDate(new Date());
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    for (let i = 0; i < firstDay; i++) {
      const blank = document.createElement('div');
      blank.className = 'cal-day cal-day-cell cal-day--empty';
      blank.setAttribute('aria-hidden', 'true');
      container.appendChild(blank);
    }

    for (let d = 1; d <= daysTotal; d++) {
      const key = NoirStorage.dateKey(dashCalYear, dashCalMonth, d);
      const dayBookings = getBookingsForDateKey(key);
      const count = dayBookings.length;
      const hasPending = dayBookings.some((b) => b.status === 'pending');
      const dayDate = new Date(dashCalYear, dashCalMonth, d);
      const isPast = dayDate < todayStart;
      const isToday = key === todayKey;
      const isSelected = key === selectedCalDate;

      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'cal-day cal-day-cell';
      if (isToday) el.classList.add('cal-day--today');
      if (isPast) el.classList.add('cal-day--past');
      if (count) el.classList.add('cal-day--busy');
      if (count >= 3) el.classList.add('cal-day--busy-high');
      if (hasPending) el.classList.add('cal-day--has-pending');
      if (isSelected) el.classList.add('cal-day--selected');

      const countClass = count >= 3 ? 'cal-day-count cal-day-count--high' : 'cal-day-count';
      const countLabel = count === 1 ? 'horário' : 'horários';

      el.innerHTML = `
        <span class="cal-day-num">${d}</span>
        <div class="cal-day-meta">
          ${count
            ? `<span class="${countClass}">${count}</span><span class="cal-day-label">${countLabel}</span>`
            : '<span class="cal-day-label" style="opacity:.35">—</span>'}
        </div>
        ${hasPending ? '<span class="cal-day-pending" title="Agendamento pendente"></span>' : ''}
      `;

      el.setAttribute('aria-label', `${d} de ${MONTHS_PT[dashCalMonth]}: ${count} agendamento(s)`);

      el.addEventListener('click', () => {
        selectedCalDate = key;
        renderDashCalendar();
        renderCalDayDetail(key);
      });

      container.appendChild(el);
    }

    if (selectedCalDate) {
      const selMonth = selectedCalDate.startsWith(
        `${dashCalYear}-${String(dashCalMonth + 1).padStart(2, '0')}`
      );
      if (selMonth) renderCalDayDetail(selectedCalDate);
      else {
        selectedCalDate = null;
        renderCalDayDetail(null);
      }
    }
  }

  document.getElementById('dashPrevMonth').addEventListener('click', () => {
    dashCalMonth--;
    if (dashCalMonth < 0) { dashCalMonth = 11; dashCalYear--; }
    renderDashCalendar();
  });

  document.getElementById('dashNextMonth').addEventListener('click', () => {
    dashCalMonth++;
    if (dashCalMonth > 11) { dashCalMonth = 0; dashCalYear++; }
    renderDashCalendar();
  });

  /* ── Bloquear período (intervalo dinâmico) ── */
  function initBlockForm() {
    const blockDate = document.getElementById('blockDate');
    if (!blockDate.value) blockDate.value = toInputDate(new Date());

    ['blockStart', 'blockEnd', 'blockDate'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', updateBlockPreview);
      document.getElementById(id)?.addEventListener('input', updateBlockPreview);
    });
    updateBlockPreview();
  }

  function updateBlockPreview() {
    const preview = document.getElementById('blockPreview');
    const start = document.getElementById('blockStart')?.value;
    const end = document.getElementById('blockEnd')?.value;
    if (!preview || !start || !end) return;

    try {
      const { start: s, end: e } = NoirTime.validateRange(start, end);
      const slots = NoirTime.expandRangeToBookingSlots(s, e, ALL_TIMES);
      const label = NoirTime.formatRangeLabel(s, e);

      if (NoirTime.toMinutes(e) <= NoirTime.toMinutes(s)) {
        preview.textContent = `Bloqueio pontual às ${s} (1 horário no site).`;
      } else if (!slots.length) {
        preview.textContent = `Período ${label} — nenhum slot de 30 min do site cai neste intervalo.`;
      } else {
        preview.textContent = `Bloqueará ${label} → ${slots.length} horário(s): ${slots.join(', ')}`;
      }
    } catch (err) {
      preview.textContent = err.message;
      preview.style.color = '#e87a7a';
      return;
    }
    preview.style.color = '';
  }

  async function renderBlockedList() {
    const data = await NoirStorage.getAll();
    const list = document.getElementById('blockedList');
    const groups = NoirStorage.getConsolidatedBlockedSlots(data.blockedSlots);

    if (!groups.length) {
      list.innerHTML = '<p style="font-size:.82rem;color:var(--text-muted);">Nenhum período bloqueado.</p>';
      return;
    }

    list.innerHTML = groups.map((g) => {
      const range = NoirTime.formatRangeLabel(g.start, g.end);
      const slots = NoirTime.expandRangeToBookingSlots(g.start, g.end, ALL_TIMES);
      const slotsHint = slots.length ? ` <span style="opacity:.7">(${slots.join(', ')})</span>` : '';
      const idsAttr = g.ids.join(',');
      return `
      <div class="blocked-item">
        <span>
          <strong>${formatBlockedDate(g.date)}</strong>
          <strong class="range-label"> ${range}</strong>${slotsHint}
          ${g.reason ? `<br/><span style="font-size:.78rem">${escapeHtml(g.reason)}</span>` : ''}
        </span>
        <button class="btn-action danger" data-unblock-ids="${idsAttr}">Remover</button>
      </div>`;
    }).join('');

    list.querySelectorAll('[data-unblock-ids]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const ids = btn.dataset.unblockIds.split(',').filter(Boolean);
        if (!confirm('Remover este período bloqueado?')) return;
        try {
          await NoirStorage.unblockByIds(ids);
          await refreshAll();
        } catch (err) {
          alert(err.message);
        }
      });
    });
  }

  function formatBlockedDate(key) {
    const { year, month, day } = NoirStorage.parseDateKey(key);
    return `${day}/${month + 1}/${year}`;
  }

  document.getElementById('blockBtn').addEventListener('click', async () => {
    const date = document.getElementById('blockDate').value;
    const start = document.getElementById('blockStart').value;
    const end = document.getElementById('blockEnd').value;
    const reason = document.getElementById('blockReason').value.trim();
    const btn = document.getElementById('blockBtn');

    if (!date || !start || !end) return;

    btn.disabled = true;
    try {
      await NoirStorage.blockRange(date, start, end, reason);
      document.getElementById('blockReason').value = '';
      await refreshAll();
      updateBlockPreview();
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  /* ── Senha ── */
  document.getElementById('changePassForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('passError');
    const okEl = document.getElementById('passSuccess');
    errEl.classList.add('hidden');
    okEl.classList.add('hidden');

    const email = document.getElementById('settingsEmail').value;
    const current = document.getElementById('currentPass').value;
    const newPass = document.getElementById('newPass').value;
    const confirm = document.getElementById('confirmPass').value;

    if (newPass !== confirm) {
      errEl.textContent = 'As senhas não coincidem.';
      errEl.classList.remove('hidden');
      return;
    }

    try {
      await NoirAuth.changePassword(email, current, newPass);
      okEl.textContent = 'Senha atualizada com sucesso no Supabase!';
      okEl.classList.remove('hidden');
      document.getElementById('changePassForm').reset();
      fillSettingsEmail();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})();
