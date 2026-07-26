// server.js — Backend de notificaciones push para TomaYa
//
// Qué hace:
//  1. Guarda la suscripción push y la configuración de la pastilla de cada dispositivo.
//  2. Cada minuto revisa si a algún dispositivo le toca la pastilla y aún no la ha
//     registrado como tomada: si es así, envía una notificación push real
//     (funciona con el navegador/app cerrada).
//  3. Si no se marca como tomada, repite el aviso cada 10 minutos hasta medianoche.
//
// Requiere Node 18+ y estar desplegado en algún sitio con HTTPS (Render, Railway,
// Fly.io, un VPS con Nginx + certificado, etc.) — los navegadores exigen HTTPS
// para Push, salvo en localhost durante pruebas.

require('dotenv').config();
const express = require('express');
const webpush = require('web-push');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const DATA_FILE = path.join(__dirname, 'data.json');

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:tucorreo@ejemplo.com';

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error('Faltan las claves VAPID. Ejecuta "npm run generate-keys" y ponlas en tu archivo .env');
  process.exit(1);
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const app = express();
app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------
// ALMACENAMIENTO SIMPLE EN JSON
// (suficiente para uso personal; si esto crece, cambia a una base real)
// ---------------------------------------------------------------------

function leerDatos() {
  if (!fs.existsSync(DATA_FILE)) return { subscriptions: {} };
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return { subscriptions: {} };
  }
}

function guardarDatos(datos) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(datos, null, 2));
}

// ---------------------------------------------------------------------
// RUTAS
// ---------------------------------------------------------------------

// Registrar/actualizar la suscripción push junto con la pastilla configurada
app.post('/api/subscribe', (req, res) => {
  const { subscription, pill } = req.body;
  if (!subscription || !subscription.endpoint || !pill) {
    return res.status(400).json({ error: 'Faltan datos de suscripción o pastilla' });
  }

  const datos = leerDatos();
  const existente = datos.subscriptions[subscription.endpoint] || {};

  datos.subscriptions[subscription.endpoint] = {
    subscription,
    pill,
    takenDates: existente.takenDates || [],
    lastNotifiedAt: existente.lastNotifiedAt || null
  };

  guardarDatos(datos);
  res.json({ ok: true });
});

// Marcar la pastilla como tomada hoy → deja de recordar el resto del día
app.post('/api/taken', (req, res) => {
  const { endpoint, date } = req.body;
  if (!endpoint || !date) return res.status(400).json({ error: 'Faltan datos' });

  const datos = leerDatos();
  const entrada = datos.subscriptions[endpoint];
  if (!entrada) return res.status(404).json({ error: 'Suscripción no encontrada' });

  if (!entrada.takenDates.includes(date)) {
    entrada.takenDates.push(date);
    entrada.takenDates = entrada.takenDates.slice(-14);
  }
  entrada.lastNotifiedAt = null;

  guardarDatos(datos);
  res.json({ ok: true });
});

// Eliminar una suscripción (por ejemplo, si el usuario desinstala la app)
app.post('/api/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'Falta endpoint' });

  const datos = leerDatos();
  delete datos.subscriptions[endpoint];
  guardarDatos(datos);
  res.json({ ok: true });
});

app.get('/', (req, res) => res.send('TomaYa backend activo ✅'));

// ---------------------------------------------------------------------
// LÓGICA DE RECORDATORIOS (a la hora + cada 10 min hasta tomarla)
// ---------------------------------------------------------------------

function hoyISO(fecha) {
  const d = fecha ? new Date(fecha) : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function revisarYNotificar() {
  const datos = leerDatos();
  const ahora = new Date();
  const hoy = hoyISO();
  const diaSemana = ahora.getDay();
  let cambios = false;

  for (const endpoint of Object.keys(datos.subscriptions)) {
    const entrada = datos.subscriptions[endpoint];
    const { pill, takenDates, subscription } = entrada;

    if (!pill || !Array.isArray(pill.days) || !pill.days.includes(diaSemana)) continue;
    if (takenDates.includes(hoy)) continue;

    const horaPastilla = new Date(ahora);
    horaPastilla.setHours(pill.hour, pill.minute, 0, 0);

    if (ahora < horaPastilla) continue; // todavía no toca

    const ultimaNotificacion = entrada.lastNotifiedAt ? new Date(entrada.lastNotifiedAt) : null;
    const pasaronDiezMin = !ultimaNotificacion || (ahora - ultimaNotificacion) >= 10 * 60 * 1000;
    if (!pasaronDiezMin) continue;

    const esPrimerAviso = !ultimaNotificacion || hoyISO(ultimaNotificacion) !== hoy;
    const cuerpo = esPrimerAviso
      ? `Es hora de tomar: ${pill.name} 💊`
      : `Todavía no has tomado: ${pill.name} 💊`;

    try {
      await webpush.sendNotification(subscription, JSON.stringify({
        title: 'TomaYa',
        body: cuerpo
      }));
      entrada.lastNotifiedAt = ahora.toISOString();
      cambios = true;
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        // La suscripción ya no es válida (app desinstalada, permiso revocado, etc.)
        delete datos.subscriptions[endpoint];
        cambios = true;
      } else {
        console.error('Error al enviar notificación:', err.message);
      }
    }
  }

  if (cambios) guardarDatos(datos);
}

// Revisa cada minuto si toca avisar
cron.schedule('* * * * *', revisarYNotificar);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor TomaYa escuchando en el puerto ${PORT}`));
