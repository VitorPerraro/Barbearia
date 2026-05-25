/* ============================================================
   NOIR BARBER — Script.js
   Vanilla JS — Scroll Animations, Nav, Calendário, Agendamento
   ============================================================ */

/* ────────────────────────────────────────────────
   1. HEADER SCROLL EFFECT
   ──────────────────────────────────────────────── */
const header = document.getElementById('header');

window.addEventListener('scroll', () => {
  if (window.scrollY > 60) {
    header.classList.add('scrolled');
  } else {
    header.classList.remove('scrolled');
  }
}, { passive: true });


/* ────────────────────────────────────────────────
   2. MENU MOBILE (HAMBURGER)
   ──────────────────────────────────────────────── */
const hamburger = document.getElementById('hamburger');
const navLinks  = document.getElementById('navLinks');

hamburger.addEventListener('click', () => {
  navLinks.classList.toggle('open');
});

// Fecha o menu ao clicar em um link
navLinks.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => navLinks.classList.remove('open'));
});


/* ────────────────────────────────────────────────
   3. REVEAL ON SCROLL (Intersection Observer)
   ──────────────────────────────────────────────── */
const revealElements = document.querySelectorAll('.reveal');

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry, idx) => {
      if (entry.isIntersecting) {
        // Pequeno delay escalonado para cards adjacentes
        const delay = entry.target.closest('.services-grid, .gallery-grid')
          ? Array.from(entry.target.parentElement.children).indexOf(entry.target) * 80
          : 0;

        setTimeout(() => {
          entry.target.classList.add('visible');
        }, delay);

        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12, rootMargin: '0px 0px -60px 0px' }
);

revealElements.forEach(el => revealObserver.observe(el));


/* ────────────────────────────────────────────────
   4. SISTEMA DE AGENDAMENTO
   ──────────────────────────────────────────────── */

// ── Estado global do agendamento ──
const booking = {
  year:        null,
  month:       null,
  day:         null,
  time:        null,
  displayDate: '',
};

// Horários disponíveis (ocupados vêm do armazenamento compartilhado)
const ALL_TIMES = ['09:00','09:30','10:00','10:30','11:00','11:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','17:00','17:30','18:00'];

async function getBookedForDay(year, month, day) {
  if (typeof NoirStorage !== 'undefined' && NoirStorage.isReady()) {
    return NoirStorage.getBookedTimesForDay(year, month, day);
  }
  return [];
}

// ── Referências de elementos ──
const step1       = document.getElementById('step1');
const step2       = document.getElementById('step2');
const step3       = document.getElementById('step3');
const stepSuccess = document.getElementById('stepSuccess');
const indicators  = [
  document.getElementById('step-indicator-1'),
  document.getElementById('step-indicator-2'),
  document.getElementById('step-indicator-3'),
];

const calDays       = document.getElementById('calDays');
const calMonthName  = document.getElementById('calMonthName');
const prevMonthBtn  = document.getElementById('prevMonth');
const nextMonthBtn  = document.getElementById('nextMonth');
const timeGrid      = document.getElementById('timeGrid');
const selectedDateLabel = document.getElementById('selectedDateLabel');
const bookingSummary    = document.getElementById('bookingSummary');
const confirmBtn        = document.getElementById('confirmBtn');
const resetBookingBtn   = document.getElementById('resetBooking');
const successMessage    = document.getElementById('successMessage');

// ── Exibe/oculta etapas ──
function showStep(stepNum) {
  [step1, step2, step3, stepSuccess].forEach(s => s.classList.add('hidden'));
  indicators.forEach((ind, i) => {
    ind.classList.remove('active', 'done');
    if (i + 1 < stepNum) ind.classList.add('done');
    if (i + 1 === stepNum) ind.classList.add('active');
  });

  if (stepNum === 1)     step1.classList.remove('hidden');
  else if (stepNum === 2) step2.classList.remove('hidden');
  else if (stepNum === 3) step3.classList.remove('hidden');
  else                   stepSuccess.classList.remove('hidden');
}

/* ── 4.1 CALENDÁRIO ── */
const MONTHS_PT = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];

const today = new Date();
let   calYear  = today.getFullYear();
let   calMonth = today.getMonth(); // 0-indexed

function renderCalendar() {
  calDays.innerHTML = '';
  calMonthName.textContent = `${MONTHS_PT[calMonth]} ${calYear}`;

  const firstDay  = new Date(calYear, calMonth, 1).getDay();
  const daysTotal = new Date(calYear, calMonth + 1, 0).getDate();
  const todayDate = new Date();

  // Espaços em branco antes do dia 1
  for (let i = 0; i < firstDay; i++) {
    const blank = document.createElement('div');
    blank.classList.add('cal-day', 'empty');
    calDays.appendChild(blank);
  }

  for (let d = 1; d <= daysTotal; d++) {
    const dayEl = document.createElement('div');
    dayEl.classList.add('cal-day');
    dayEl.textContent = d;

    const thisDate = new Date(calYear, calMonth, d);

    // Dias passados e domingos = desativados
    if (thisDate < new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate())
        || thisDate.getDay() === 0) {
      dayEl.classList.add('disabled');
    } else {
      // Marca hoje
      if (d === todayDate.getDate()
          && calMonth === todayDate.getMonth()
          && calYear  === todayDate.getFullYear()) {
        dayEl.classList.add('today');
      }
      // Marca dia já selecionado
      if (booking.day   === d
          && booking.month === calMonth
          && booking.year  === calYear) {
        dayEl.classList.add('selected');
      }

      dayEl.addEventListener('click', () => selectDay(d, calYear, calMonth));
    }

    calDays.appendChild(dayEl);
  }
}

async function selectDay(d, y, m) {
  booking.day   = d;
  booking.year  = y;
  booking.month = m;

  const dayNames = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const dayOfWeek = new Date(y, m, d).getDay();
  booking.displayDate = `${dayNames[dayOfWeek]}, ${d} de ${MONTHS_PT[m]}`;

  selectedDateLabel.textContent = booking.displayDate;
  timeGrid.innerHTML = '<p class="step-label" style="text-align:center;">Carregando horários...</p>';
  showStep(2);
  await renderTimeGrid(d);
}

prevMonthBtn.addEventListener('click', () => {
  calMonth--;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar();
});

nextMonthBtn.addEventListener('click', () => {
  calMonth++;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
});

/* ── 4.2 GRADE DE HORÁRIOS ── */
async function renderTimeGrid(day) {
  timeGrid.innerHTML = '';
  let booked = [];
  try {
    booked = await getBookedForDay(booking.year, booking.month, day);
  } catch (err) {
    timeGrid.innerHTML = `<p class="step-label" style="color:#e87a7a;">Erro ao carregar horários. Verifique a configuração do Supabase.</p>`;
    console.error(err);
    return;
  }

  const bookedSet = new Set(booked);

  ALL_TIMES.forEach(t => {
    const slot = document.createElement('div');
    slot.classList.add('time-slot');
    slot.textContent = t;

    if (bookedSet.has(t)) {
      slot.classList.add('booked');
      slot.title = 'Horário indisponível ou bloqueado';
    } else {
      slot.addEventListener('click', () => selectTime(t, slot));
    }
    timeGrid.appendChild(slot);
  });
}

async function selectTime(t, slotEl) {
  if (slotEl.classList.contains('booked')) return;

  if (NoirStorage?.isReady?.()) {
    const ok = await NoirStorage.isSlotAvailable(booking.year, booking.month, booking.day, t);
    if (!ok) {
      slotEl.classList.add('booked');
      slotEl.title = 'Horário indisponível ou bloqueado';
      alert('Este horário não está disponível. Pode estar bloqueado ou já reservado.');
      await renderTimeGrid(booking.day);
      return;
    }
  }

  timeGrid.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
  slotEl.classList.add('selected');
  booking.time = t;

  setTimeout(() => {
    bookingSummary.textContent = `${booking.displayDate} às ${booking.time}`;
    showStep(3);
  }, 260);
}

/* ── 4.3 CONFIRMAÇÃO ── */
confirmBtn.addEventListener('click', async () => {
  const name  = document.getElementById('clientName').value.trim();
  const phone = document.getElementById('clientPhone').value.trim();
  const serv  = document.getElementById('clientService').value;

  if (!name) {
    shakeField('clientName'); return;
  }
  if (!phone) {
    shakeField('clientPhone'); return;
  }
  if (!serv) {
    shakeField('clientService'); return;
  }

  const serviceName = serv.split('—')[0].trim();

  if (!NoirStorage?.isReady?.()) {
    alert('Agendamento online indisponível: configure o Supabase em js/supabase-config.js (veja SETUP-SUPABASE.md).');
    return;
  }

  confirmBtn.disabled = true;
  const prevText = confirmBtn.textContent;
  confirmBtn.textContent = 'Salvando...';

  try {
    await NoirStorage.addBooking({
      name,
      phone,
      service: serviceName,
      year: booking.year,
      month: booking.month,
      day: booking.day,
      time: booking.time,
    });

    successMessage.textContent =
      `${name}, seu agendamento para ${booking.displayDate} às ${booking.time} (${serviceName}) foi recebido com sucesso!`;

    indicators.forEach(ind => {
      ind.classList.remove('active', 'done');
      ind.classList.add('done');
    });

    showStep('success');
  } catch (err) {
    alert('Não foi possível confirmar o agendamento: ' + err.message);
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = prevText;
  }
});

// Pequena animação de shake para campo inválido
function shakeField(id) {
  const el = document.getElementById(id);
  el.style.borderColor = '#e05252';
  el.style.animation = 'none';
  requestAnimationFrame(() => {
    el.style.animation = 'shake .4s ease';
  });
  el.focus();
  setTimeout(() => { el.style.borderColor = ''; }, 1800);
}

// Adiciona keyframes de shake dinamicamente
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
  @keyframes shake {
    0%,100%{ transform: translateX(0) }
    20%    { transform: translateX(-8px) }
    40%    { transform: translateX(8px) }
    60%    { transform: translateX(-5px) }
    80%    { transform: translateX(5px) }
  }
`;
document.head.appendChild(shakeStyle);

/* ── 4.4 BOTÕES VOLTAR ── */
document.getElementById('backToStep1').addEventListener('click', () => {
  showStep(1);
  renderCalendar();
});
document.getElementById('backToStep2').addEventListener('click', async () => {
  showStep(2);
  await renderTimeGrid(booking.day);
});

/* ── 4.5 RESETAR ── */
resetBookingBtn.addEventListener('click', () => {
  booking.day = booking.month = booking.year = booking.time = null;
  booking.displayDate = '';
  document.getElementById('clientName').value  = '';
  document.getElementById('clientPhone').value = '';
  document.getElementById('clientService').value = '';
  calYear  = today.getFullYear();
  calMonth = today.getMonth();
  renderCalendar();
  showStep(1);
});


/* ────────────────────────────────────────────────
   5. INICIALIZAÇÃO
   ──────────────────────────────────────────────── */
renderCalendar();
showStep(1);


/* ────────────────────────────────────────────────
   6. SMOOTH SCROLL para âncoras
   ──────────────────────────────────────────────── */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', (e) => {
    const target = document.querySelector(anchor.getAttribute('href'));
    if (target) {
      e.preventDefault();
      const offset = 80;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  });
});


/* ────────────────────────────────────────────────
   7. EFEITO PARALLAX LEVE no texto de fundo do Hero
   ──────────────────────────────────────────────── */
const heroBgText = document.querySelector('.hero-bg-text');
if (heroBgText) {
  window.addEventListener('scroll', () => {
    const scrolled = window.scrollY;
    heroBgText.style.transform = `translateY(calc(-50% + ${scrolled * 0.18}px))`;
  }, { passive: true });
}
