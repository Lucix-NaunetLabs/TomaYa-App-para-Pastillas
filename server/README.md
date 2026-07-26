# TomaYa — Backend de notificaciones push

Este servidor es lo que permite que TomaYa te avise **aunque tengas la app
cerrada**: a la hora de la toma, y luego cada 10 minutos hasta que la
registres en la app.

## 1. Instalar dependencias

```bash
cd server
npm install
```

## 2. Generar las claves VAPID (solo una vez)

```bash
npm run generate-keys
```

Esto imprime algo así:

```
VAPID_PUBLIC_KEY=BN7...
VAPID_PRIVATE_KEY=abc...
```

## 3. Configurar el archivo .env

Copia `.env.example` a `.env` y pega ahí las claves generadas:

```bash
cp .env.example .env
```

```
VAPID_PUBLIC_KEY=BN7...
VAPID_PRIVATE_KEY=abc...
VAPID_SUBJECT=mailto:tucorreo@ejemplo.com
PORT=3000
```

## 4. Arrancar el servidor

```bash
npm start
```

Deberías ver: `Servidor TomaYa escuchando en el puerto 3000`.

## 5. Desplegarlo en algún sitio con HTTPS

Los navegadores exigen HTTPS para Push (salvo en `localhost` durante
pruebas). Opciones sencillas y con capa gratuita:

- **Render.com** → "New Web Service", conecta el repo, comando de arranque
  `npm start`, define las variables de entorno del `.env` en su panel.
- **Railway.app** → similar a Render.
- **Fly.io** → requiere su CLI, más control.
- Un VPS propio con Nginx como proxy inverso y certificado (Let's Encrypt).

Cuando lo tengas desplegado, tendrás una URL tipo
`https://tomaya-backend.onrender.com`.

## 6. Conectar la app con el backend

Abre `app.js` (el de la carpeta principal, no el del servidor) y edita
estas dos líneas al principio del archivo:

```js
const VAPID_PUBLIC_KEY = 'PEGA_AQUI_TU_VAPID_PUBLIC_KEY';
const BACKEND_URL = 'https://tomaya-backend.onrender.com'; // tu URL real
```

Vuelve a abrir la app, acepta el permiso de notificaciones y configura tu
pastilla: a partir de ahí, el backend se encarga del resto.

## Notas

- `data.json` guarda las suscripciones. Si despliegas en un servicio con
  sistema de archivos efímero (como el plan gratuito de algunos hosts),
  ese archivo puede borrarse al reiniciar — para uso serio, cambia esa
  parte por una base de datos real (SQLite persistente, Postgres, etc.).
- Solo hay un backend para las dos vías: si `BACKEND_URL` no está
  configurada, la app sigue funcionando con notificaciones locales
  (solo mientras la tengas abierta), como respaldo.
