// Generado por herramientas/construir.mjs (no editar a mano).
// Guarda la app en el iPhone para que abra al instante y funcione sin conexión.
// Los datos NO pasan por acá: GitHub y las fuentes de mercado van siempre directo a internet.
const VERSION = '7b3d1ceceb18';
const CACHE = 'mis-finanzas-' + VERSION;
const ARCHIVOS = [
  "./",
  "css/app.css",
  "fuentes/rubik-latin-400-normal.woff2",
  "fuentes/rubik-latin-500-normal.woff2",
  "fuentes/rubik-latin-600-normal.woff2",
  "fuentes/rubik-latin-700-normal.woff2",
  "iconos/favicon.png",
  "iconos/icono-180.png",
  "iconos/icono-192.png",
  "iconos/icono-512.png",
  "iconos/icono-maskable-512.png",
  "index.html",
  "js/app/almacen.js",
  "js/app/estado.js",
  "js/app/formularios/estudio.js",
  "js/app/formularios/meta.js",
  "js/app/formularios/movimiento.js",
  "js/app/formularios/otros.js",
  "js/app/formularios/tarea.js",
  "js/app/iconos.js",
  "js/app/main.js",
  "js/app/pantallas/agenda.js",
  "js/app/pantallas/ajustes.js",
  "js/app/pantallas/comun.js",
  "js/app/pantallas/cuentas.js",
  "js/app/pantallas/estudio.js",
  "js/app/pantallas/historial.js",
  "js/app/pantallas/inicio.js",
  "js/app/pantallas/inversiones.js",
  "js/app/pantallas/movimientos.js",
  "js/app/pantallas/tarjetas.js",
  "js/app/pomodoro.js",
  "js/app/sincro.js",
  "js/app/ui.js",
  "js/nucleo/asesor.js",
  "js/nucleo/categorias.js",
  "js/nucleo/decimal.js",
  "js/nucleo/estudio.js",
  "js/nucleo/fecha.js",
  "js/nucleo/formato.js",
  "js/nucleo/fusion.js",
  "js/nucleo/integridad.js",
  "js/nucleo/inversiones.js",
  "js/nucleo/json.js",
  "js/nucleo/mercado.js",
  "js/nucleo/modelo.js",
  "js/nucleo/motor.js",
  "js/nucleo/organizacion.js",
  "js/nucleo/sincro.js",
  "js/nucleo/xml.js",
  "manifest.webmanifest"
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('mis-finanzas-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

// La app pide activar la versión nueva cuando tocás "Actualizar"
self.addEventListener('message', (e) => { if (e.data === 'activar') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const pedido = e.request;
  if (pedido.method !== 'GET') return;
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const guardado = (await cache.match(pedido, { ignoreSearch: true })) || (pedido.mode === 'navigate' ? await cache.match('./') : undefined);
    if (guardado) return guardado;
    try {
      return await fetch(pedido);
    } catch (err) {
      if (pedido.mode === 'navigate') { const inicio = await cache.match('./'); if (inicio) return inicio; }
      throw err;
    }
  })());
});
