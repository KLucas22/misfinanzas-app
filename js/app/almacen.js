// ============================================================================
//  Guardado en el iPhone (IndexedDB): los datos (el mismo datos.xml de la PC),
//  el estado de la sincronización, el token cifrado y copias de seguridad.
//  El token se cifra con una clave que no se puede exportar (Safari la guarda
//  protegida por el llavero del iPhone).
// ============================================================================

const NOMBRE_BD = 'mis-finanzas';
const VERSION_BD = 1;
const ALMACEN = 'kv';
const MAX_COPIAS = 15;

let bdPromesa = null;
function bd() {
  if (!bdPromesa) {
    bdPromesa = new Promise((resolver, rechazar) => {
      const pedido = indexedDB.open(NOMBRE_BD, VERSION_BD);
      pedido.onupgradeneeded = () => { pedido.result.createObjectStore(ALMACEN); };
      pedido.onsuccess = () => resolver(pedido.result);
      pedido.onerror = () => rechazar(pedido.error);
    });
  }
  return bdPromesa;
}

async function tx(modo, fn) {
  const b = await bd();
  return new Promise((resolver, rechazar) => {
    const t = b.transaction(ALMACEN, modo);
    const st = t.objectStore(ALMACEN);
    let resultado;
    Promise.resolve(fn(st)).then((r) => { resultado = r; });
    t.oncomplete = () => resolver(resultado);
    t.onerror = () => rechazar(t.error);
    t.onabort = () => rechazar(t.error || new Error('Se canceló el guardado'));
  });
}

const pedido = (req) => new Promise((resolver, rechazar) => { req.onsuccess = () => resolver(req.result); req.onerror = () => rechazar(req.error); });

export async function leer(clave) { return tx('readonly', (st) => pedido(st.get(clave))); }
export async function escribir(clave, valor) { return tx('readwrite', (st) => { st.put(valor, clave); }); }
export async function borrar(clave) { return tx('readwrite', (st) => { st.delete(clave); }); }
/** Varias claves en una sola transacción (todo o nada). */
export async function escribirVarios(pares) {
  return tx('readwrite', (st) => { for (const [k, v] of Object.entries(pares)) { if (v === undefined) st.delete(k); else st.put(v, k); } });
}

// ---------------------------------------------------------------- Datos
export const leerDatos = () => leer('datos');
export const guardarDatos = (texto) => escribir('datos', texto);

// ---------------------------------------------------------------- Token cifrado
async function claveCifrado() {
  if (!globalThis.crypto || !crypto.subtle) return null;
  let k = await leer('claveToken');
  if (!k) {
    k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await escribir('claveToken', k);
  }
  return k;
}

export async function guardarToken(token) {
  if (!token) { await borrar('token'); return; }
  const k = await claveCifrado().catch(() => null);
  if (!k) { await escribir('token', { plano: token }); return; }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const datos = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(token));
  await escribir('token', { iv, datos });
}

export async function leerToken() {
  const t = await leer('token');
  if (!t) return '';
  if (t.plano) return t.plano;
  try {
    const k = await claveCifrado();
    const plano = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: t.iv }, k, t.datos);
    return new TextDecoder().decode(plano);
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------- Copias de seguridad
/** Guarda una copia de los datos actuales (antes de traer cambios de la nube, importar, etc.). */
export async function guardarCopia(texto, motivo) {
  if (!texto) return;
  const lista = (await leer('copias')) || [];
  lista.unshift({ fecha: Date.now(), motivo, texto });
  while (lista.length > MAX_COPIAS) lista.pop();
  await escribir('copias', lista);
}

export async function listarCopias() { return (await leer('copias')) || []; }

/** Pide al sistema que no borre los datos de la app (iOS lo respeta para apps en la pantalla de inicio). */
export async function pedirPersistencia() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch { /* sin soporte */ }
  return false;
}
