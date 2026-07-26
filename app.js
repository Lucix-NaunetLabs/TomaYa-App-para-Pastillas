const VAPID_PUBLIC_KEY = 'BIni-caAGLQiKSV82jnS__j3Jfrespxtyk67BygA9q0-rlWcDXSwZXXlJvlzL_pZbWb1SRWpwMju0h4FMQduF0k';
const BACKEND_URL = 'https://tomaya-app-para-pastillas.onrender.com';

function backendConfigurado() {
  return BACKEND_URL && !BACKEND_URL.includes('tu-backend') &&
    VAPID_PUBLIC_KEY && !VAPID_PUBLIC_KEY.includes('PEGA_AQUI');
}

const STORAGE_KEYS = {
  PILL: 'tomaya_pill',
  HISTORY: 'tomaya_history',
  STREAK: 'tomaya_streak',
  LAST_TAKEN: 'tomaya_lastTaken',
  LAST_CHECK: 'tomaya_lastCheck'
};

const DIAS_LABEL = { 0: 'D', 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S' };
const DIAS_ORDEN = [1, 2, 3, 4, 5, 6, 0]; // L M X J V S D

let state = {
  pill: null,          // { name, hour, minute, days: [1,3,5,...] }
  history: [],         // [{ date:'YYYY-MM-DD', time:'09:12 AM', status:'✅'|'❌' }]
  streak: 0,
  lastTaken: null,     // 'YYYY-MM-DD'
  lastCheck: null      // 'YYYY-MM-DD'
};

let notificationTimeoutId = null;

// ---------------------------------------------------------------------
// UTILIDADES DE FECHA
// ---------------------------------------------------------------------

function hoyISO(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function sumarDias(iso, dias) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + dias);
  return hoyISO(d);
}

function formatoFechaCorta(iso) {
  const d = new Date(iso + 'T00:00:00');
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${d.getDate()} ${meses[d.getMonth()]}`;
}

function formatoHora(date) {
  let h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, '0')}:${m} ${ampm}`;
}

function diaDeSemana(iso) {
  return new Date(iso + 'T00:00:00').getDay(); // 0=domingo ... 6=sábado
}

// ---------------------------------------------------------------------
// PERSISTENCIA
// ---------------------------------------------------------------------

function cargarEstado() {
  try {
    state.pill = JSON.parse(localStorage.getItem(STORAGE_KEYS.PILL)) || null;
    state.history = JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY)) || [];
    state.streak = Number(localStorage.getItem(STORAGE_KEYS.STREAK)) || 0;
    state.lastTaken = localStorage.getItem(STORAGE_KEYS.LAST_TAKEN) || null;
    state.lastCheck = localStorage.getItem(STORAGE_KEYS.LAST_CHECK) || null;
  } catch (e) {
    console.error('Error al cargar el estado guardado:', e);
  }
}

function guardarEstado() {
  localStorage.setItem(STORAGE_KEYS.PILL, JSON.stringify(state.pill));
  localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(state.history));
  localStorage.setItem(STORAGE_KEYS.STREAK, String(state.streak));
  localStorage.setItem(STORAGE_KEYS.LAST_TAKEN, state.lastTaken || '');
  localStorage.setItem(STORAGE_KEYS.LAST_CHECK, state.lastCheck || '');
}

// ---------------------------------------------------------------------
// LÓGICA DE RACHA Y DÍAS PERDIDOS
// ---------------------------------------------------------------------

// Revisa si hubo días programados desde la última comprobación en los que
// no se tomó la pastilla, registra un ❌ y reinicia la racha si corresponde.
function comprobarDiasPerdidos() {
  if (!state.pill) return;

  const hoy = hoyISO();
  let cursor = state.lastCheck ? sumarDias(state.lastCheck, 1) : hoy;
  let huboFallo = false;
  let salvaguarda = 0;

  while (cursor < hoy && salvaguarda < 60) {
    const esDiaProgramado = state.pill.days.includes(diaDeSemana(cursor));
    const yaRegistrado = state.history.some((h) => h.date === cursor);

    if (esDiaProgramado && !yaRegistrado) {
      state.history.unshift({ date: cursor, time: '—', status: '❌' });
      huboFallo = true;
    }
    cursor = sumarDias(cursor, 1);
    salvaguarda++;
  }

  if (huboFallo) {
    state.streak = 0;
  }

  state.history = state.history.slice(0, 30);
  state.lastCheck = hoy;
  guardarEstado();
}

function yaTomadaHoy() {
  return state.lastTaken === hoyISO();
}

// ---------------------------------------------------------------------
// RENDERIZADO
// ---------------------------------------------------------------------

function render() {
  renderPillInfo();
  renderBotonTomar();
  renderHistorial();
  renderRacha();
}

function renderPillInfo() {
  const info = document.getElementById('pillInfo');
  const empty = document.getElementById('pillEmpty');

  if (!state.pill) {
    info.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }

  info.classList.remove('hidden');
  empty.classList.add('hidden');

  document.getElementById('pillName').textContent = state.pill.name;

  const horaTxt = formatoHoraDesdeHM(state.pill.hour, state.pill.minute);
  const diasTxt = DIAS_ORDEN.filter((d) => state.pill.days.includes(d))
    .map((d) => DIAS_LABEL[d])
    .join(' · ');

  document.getElementById('pillDetail').textContent = `${horaTxt} · ${diasTxt || 'Sin días seleccionados'}`;
}

function formatoHoraDesdeHM(hour, minute) {
  let h = hour % 12;
  if (h === 0) h = 12;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${ampm}`;
}

function renderBotonTomar() {
  const btn = document.getElementById('btnTomar');
  const hint = document.getElementById('tomarHint');

  if (!state.pill) {
    btn.disabled = true;
    hint.textContent = 'Configura tu pastilla para empezar.';
    return;
  }

  if (yaTomadaHoy()) {
    btn.disabled = true;
    hint.textContent = 'Ya la tomaste hoy. ¡Nos vemos mañana!';
  } else {
    btn.disabled = false;
    hint.textContent = '';
  }
}

function renderHistorial() {
  const lista = document.getElementById('historyList');
  lista.innerHTML = '';

  const ultimos = state.history.slice(0, 5);

  if (ultimos.length === 0) {
    lista.innerHTML = '<li class="history-empty">Todavía no hay registros.</li>';
    return;
  }

  ultimos.forEach((item) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span>${formatoFechaCorta(item.date)} – ${item.time}</span>
      <span class="history-emoji">${item.status}</span>
    `;
    lista.appendChild(li);
  });
}

function renderRacha() {
  document.getElementById('rachaCount').textContent = state.streak;
}

// ---------------------------------------------------------------------
// ACCIONES
// ---------------------------------------------------------------------

function tomarPastilla() {
  if (!state.pill || yaTomadaHoy()) return;

  const ahora = new Date();
  const hoy = hoyISO();
  const ayer = sumarDias(hoy, -1);

  // Elimina un posible registro ❌ del día de hoy generado por comprobarDiasPerdidos
  state.history = state.history.filter((h) => h.date !== hoy);

  state.history.unshift({
    date: hoy,
    time: formatoHora(ahora),
    status: '✅'
  });
  state.history = state.history.slice(0, 30);

  // Racha: consecutiva si ayer se tomó, o si es el primer registro
  if (state.lastTaken === ayer || state.streak === 0) {
    state.streak += 1;
  } else {
    state.streak = 1;
  }

  state.lastTaken = hoy;
  state.lastCheck = hoy;

  guardarEstado();
  render();
  notificarTomaAlBackend(hoy);
}

function guardarPastilla() {
  const nombre = document.getElementById('inputNombre').value.trim();
  const hora = Number(document.getElementById('selectHora').value);
  const minuto = Number(document.getElementById('selectMinuto').value);
  const diasSeleccionados = Array.from(
    document.querySelectorAll('.dia-btn.activo')
  ).map((btn) => Number(btn.dataset.dia));

  if (!nombre) {
    alert('Ponle un nombre a tu pastilla.');
    return;
  }
  if (diasSeleccionados.length === 0) {
    alert('Selecciona al menos un día de la semana.');
    return;
  }

  state.pill = { name: nombre, hour: hora, minute: minuto, days: diasSeleccionados };
  state.lastCheck = state.lastCheck || hoyISO();
  guardarEstado();
  cerrarModal();
  render();
  programarNotificacion();
  sincronizarConBackend();
}

// ---------------------------------------------------------------------
// MODAL
// ---------------------------------------------------------------------

function poblarSelectsHora() {
  const selectHora = document.getElementById('selectHora');
  const selectMinuto = document.getElementById('selectMinuto');

  selectHora.innerHTML = '';
  for (let h = 0; h < 24; h++) {
    const opt = document.createElement('option');
    opt.value = h;
    opt.textContent = String(h).padStart(2, '0');
    selectHora.appendChild(opt);
  }

  selectMinuto.innerHTML = '';
  for (let m = 0; m < 60; m += 5) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = String(m).padStart(2, '0');
    selectMinuto.appendChild(opt);
  }
}

function abrirModal() {
  poblarSelectsHora();

  const nombreInput = document.getElementById('inputNombre');
  const diaBtns = document.querySelectorAll('.dia-btn');

  if (state.pill) {
    nombreInput.value = state.pill.name;
    document.getElementById('selectHora').value = state.pill.hour;
    document.getElementById('selectMinuto').value = String(Math.round(state.pill.minute / 5) * 5 % 60);
    diaBtns.forEach((btn) => {
      const dia = Number(btn.dataset.dia);
      btn.classList.toggle('activo', state.pill.days.includes(dia));
    });
  } else {
    nombreInput.value = '';
    document.getElementById('selectHora').value = 9;
    document.getElementById('selectMinuto').value = 0;
    diaBtns.forEach((btn) => btn.classList.remove('activo'));
  }

  document.getElementById('modalOverlay').classList.remove('hidden');
}

function cerrarModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
}

function toggleDia(event) {
  event.currentTarget.classList.toggle('activo');
}

// ---------------------------------------------------------------------
// NOTIFICACIONES
// ---------------------------------------------------------------------
// Hay dos vías, y ambas pueden convivir:
//  1. Backend real (carpeta /server): manda push aunque la app esté
//     cerrada, a la hora exacta y cada 10 min hasta marcar la toma.
//     Se activa solo si configuraste VAPID_PUBLIC_KEY y BACKEND_URL.
//  2. Local (lo de aquí abajo, con setTimeout): funciona sin backend,
//     pero solo mientras la app/pestaña siga cargada en el dispositivo.
//     Sirve como respaldo si no has desplegado el servidor.

async function pedirPermisoNotificaciones() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Crea (o recupera) la suscripción push real del navegador.
// Esta es la que permite recibir avisos con la app cerrada.
async function suscribirsePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  if (Notification.permission !== 'granted') return null;

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }
    return sub;
  } catch (e) {
    console.error('No se pudo crear la suscripción push:', e);
    return null;
  }
}

// Envía la suscripción + la pastilla configurada al backend, para que
// sea él quien dispare las notificaciones a la hora de la toma y cada
// 10 minutos hasta que se registre como tomada (avisos reales, con la
// app cerrada).
async function sincronizarConBackend() {
  if (!backendConfigurado() || !state.pill) return;

  const sub = await suscribirsePush();
  if (!sub) return;

  try {
    await fetch(`${BACKEND_URL}/api/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub, pill: state.pill })
    });
  } catch (e) {
    console.error('No se pudo sincronizar con el backend de notificaciones:', e);
  }
}

// Avisa al backend de que ya se tomó la pastilla hoy, para que deje de
// repetir el recordatorio cada 10 minutos.
async function notificarTomaAlBackend(fechaISO) {
  if (!backendConfigurado()) return;

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;

    await fetch(`${BACKEND_URL}/api/taken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint, date: fechaISO })
    });
  } catch (e) {
    console.error('No se pudo avisar al backend de que ya se tomó la pastilla:', e);
  }
}

function programarNotificacion() {
  if (notificationTimeoutId) {
    clearTimeout(notificationTimeoutId);
    notificationTimeoutId = null;
  }

  if (!state.pill || !('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  const proxima = proximaOcurrencia(state.pill);
  if (!proxima) return;

  const ms = proxima.getTime() - Date.now();

  notificationTimeoutId = setTimeout(async () => {
    await mostrarNotificacion();
    programarNotificacion(); // reprograma para la siguiente ocurrencia
  }, Math.min(ms, 2147483000)); // límite máximo de setTimeout
}

function proximaOcurrencia(pill) {
  if (!pill.days.length) return null;

  const ahora = new Date();

  for (let i = 0; i < 8; i++) {
    const candidata = new Date(ahora);
    candidata.setDate(ahora.getDate() + i);
    candidata.setHours(pill.hour, pill.minute, 0, 0);

    const esDiaValido = pill.days.includes(candidata.getDay());
    const esFutura = candidata.getTime() > ahora.getTime();

    if (esDiaValido && esFutura) return candidata;
  }
  return null;
}

async function mostrarNotificacion() {
  if (!state.pill) return;
  const cuerpo = `Es hora de tomar: ${state.pill.name} 💊`;

  try {
    if (navigator.serviceWorker) {
      const reg = await navigator.serviceWorker.ready;
      reg.showNotification('TomaYa', {
        body: cuerpo,
        icon: './icono.png',
        badge: './icono.png',
        tag: 'tomaya-recordatorio'
      });
      return;
    }
  } catch (e) {
    console.error('No se pudo mostrar la notificación vía Service Worker:', e);
  }

  // Respaldo si no hay service worker disponible
  new Notification('TomaYa', { body: cuerpo, icon: './icono.png' });
}

// ---------------------------------------------------------------------
// SERVICE WORKER
// ---------------------------------------------------------------------

async function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');

    // Intenta activar Periodic Background Sync si el navegador lo soporta
    if ('periodicSync' in reg) {
      try {
        const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
        if (status.state === 'granted') {
          await reg.periodicSync.register('tomaya-check-pill', {
            minInterval: 12 * 60 * 60 * 1000 // cada 12 horas aprox.
          });
        }
      } catch (e) {
        // No soportado o no permitido: no es crítico, seguimos con setTimeout.
      }
    }
  } catch (e) {
    console.error('Error al registrar el service worker:', e);
  }
}

// ---------------------------------------------------------------------
// INICIALIZACIÓN
// ---------------------------------------------------------------------

function initEventListeners() {
  document.getElementById('btnAbrirModal').addEventListener('click', abrirModal);
  document.getElementById('btnConfigurarAhora').addEventListener('click', abrirModal);
  document.getElementById('btnCerrarModal').addEventListener('click', cerrarModal);
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'modalOverlay') cerrarModal();
  });
  document.getElementById('btnGuardarPastilla').addEventListener('click', guardarPastilla);
  document.getElementById('btnTomar').addEventListener('click', tomarPastilla);

  document.querySelectorAll('.dia-btn').forEach((btn) => {
    btn.addEventListener('click', toggleDia);
  });

  // Vuelve a comprobar días perdidos y a renderizar si la pestaña
  // recupera el foco (por ejemplo, al abrir la app al día siguiente).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      comprobarDiasPerdidos();
      render();
    }
  });
}

async function init() {
  cargarEstado();
  comprobarDiasPerdidos();
  render();
  initEventListeners();
  await registrarServiceWorker();
  await pedirPermisoNotificaciones();
  programarNotificacion();
  sincronizarConBackend();
}

document.addEventListener('DOMContentLoaded', init);
