// ============================================================================
//  Arranque y navegación de la app del iPhone.
//  Pestañas: Inicio · Movimientos · (+) · Agenda · Más. Rutas con #/…
// ============================================================================

import { E, cargar, hoy, guardar, escuchar, tareasAutomaticas, aplicarTema, hayDatos } from './estado.js';
import { S, escucharSync, iniciarCiclo, sincronizar, programarSubida, activa, DecisionInicial } from './sincro.js';
import { h, icono, toast, preguntar } from './ui.js';
import * as almacen from './almacen.js';
import { retomar } from './pomodoro.js';
import { NAV } from './pantallas/comun.js';
import { pantallaInicio } from './pantallas/inicio.js';
import { pantallaMovimientos } from './pantallas/movimientos.js';
import { pantallaAgenda } from './pantallas/agenda.js';
import { pantallaMas, pantallaAvisos, pantallaAjustes, pantallaBienvenida } from './pantallas/ajustes.js';
import { pantallaTarjetas, pantallaTarjeta } from './pantallas/tarjetas.js';
import { pantallaCuentas, pantallaCuenta, pantallaFijos } from './pantallas/cuentas.js';
import { pantallaHistorial } from './pantallas/historial.js';
import { pantallaInversiones } from './pantallas/inversiones.js';
import { pantallaEstudio } from './pantallas/estudio.js';
import { abrirMovimiento } from './formularios/movimiento.js';
import { F } from '../nucleo/fecha.js';

const RUTAS = {
  inicio: { f: pantallaInicio, tab: 'inicio', nombre: 'Inicio' },
  movimientos: { f: pantallaMovimientos, tab: 'movimientos', nombre: 'Movimientos' },
  agenda: { f: pantallaAgenda, tab: 'agenda', nombre: 'Agenda' },
  mas: { f: pantallaMas, tab: 'mas', nombre: 'Más' },
  tarjetas: { f: pantallaTarjetas, tab: 'mas', nombre: 'Tarjetas' },
  tarjeta: { f: pantallaTarjeta, tab: 'mas', nombre: 'Tarjeta' },
  cuentas: { f: pantallaCuentas, tab: 'mas', nombre: 'Cuentas' },
  cuenta: { f: pantallaCuenta, tab: 'mas', nombre: 'Cuenta' },
  fijos: { f: pantallaFijos, tab: 'mas', nombre: 'Fijos' },
  historial: { f: pantallaHistorial, tab: 'mas', nombre: 'Historial' },
  inversiones: { f: pantallaInversiones, tab: 'mas', nombre: 'Inversiones' },
  estudio: { f: pantallaEstudio, tab: 'mas', nombre: 'Estudio' },
  avisos: { f: pantallaAvisos, tab: 'mas', nombre: 'Avisos' },
  ajustes: { f: pantallaAjustes, tab: 'mas', nombre: 'Ajustes' },
};

const app = document.getElementById('app');
let vista = null;          // <main> de la pantalla actual
let claveActual = '';      // hash completo de la pantalla actual
let tabs = null;
let diaMostrado = null;
let renderPedido = false;
let ultimaRuta = null;
/** Pantallas por las que pasaste (para saber si "volver" y recuperar dónde estabas) */
const pila = [];
const posiciones = new Map();

function ruta() {
  const partes = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const nombre = RUTAS[partes[0]] ? partes[0] : 'inicio';
  return { nombre, params: RUTAS[partes[0]] ? partes.slice(1) : [], clave: '#/' + [nombre, ...(RUTAS[partes[0]] ? partes.slice(1) : [])].join('/') };
}

/** Pide dibujar la pantalla (se juntan varios pedidos seguidos en uno). */
export function programarRender() {
  if (renderPedido) return;
  renderPedido = true;
  requestAnimationFrame(() => { renderPedido = false; render(); });
}

function pantallaFallo(e) {
  console.error(e);
  return h('main', { class: 'vista' }, h('div', { class: 'vacio' }, h('div', { class: 'grande' }, 'Algo salió mal en esta pantalla'),
    h('div', null, String(e && e.message ? e.message : e)),
    h('button', { class: 'boton', type: 'button', onClick: () => { location.hash = '#/inicio'; } }, 'Volver al inicio')));
}

function render() {
  if (!hayDatos()) return;
  // Si estás escribiendo en un campo de la pantalla, se espera a que termines (para no cerrarte el teclado)
  const activo = document.activeElement;
  if (vista && activo && vista.contains(activo) && /^(INPUT|TEXTAREA|SELECT)$/.test(activo.tagName)) {
    activo.addEventListener('blur', () => programarRender(), { once: true });
    return;
  }
  const r = ruta();
  const misma = ultimaRuta && ultimaRuta.nombre === r.nombre && (ultimaRuta.params[0] || '') === (r.params[0] || '');
  let volver = false;
  if (r.clave !== claveActual) {
    if (vista && claveActual) posiciones.set(claveActual, vista.scrollTop);
    if (misma) {
      // La misma pantalla con otro dato (por ejemplo, otro resumen de la tarjeta): no es una pantalla nueva
      if (pila.length) pila[pila.length - 1] = r.clave; else pila.push(r.clave);
    } else {
      if (pila.length >= 2 && pila[pila.length - 2] === r.clave) { pila.pop(); volver = true; } else { pila.push(r.clave); if (pila.length > 60) pila.shift(); }
      NAV.anterior = pila.length >= 2 ? (RUTAS[pila[pila.length - 2].split('/')[1]] || {}).nombre || null : null;
    }
  }
  let nueva;
  try { nueva = RUTAS[r.nombre].f(r.params, programarRender); } catch (e) { nueva = pantallaFallo(e); }
  const arriba = vista ? vista.scrollTop : 0;
  const horizontales = vista ? [...vista.querySelectorAll('.tablero, .periodos')].map((x) => x.scrollLeft) : [];
  if (vista) vista.replaceWith(nueva); else app.prepend(nueva);
  vista = nueva;
  if (misma) {
    vista.scrollTop = arriba;
    [...vista.querySelectorAll('.tablero, .periodos')].forEach((x, i) => { if (horizontales[i] !== undefined) x.scrollLeft = horizontales[i]; });
  } else if (volver || RUTAS[r.nombre].tab === r.nombre) {
    // Al volver (o al cambiar de pestaña) se recupera dónde estabas
    const y = posiciones.get(r.clave);
    if (y) vista.scrollTop = y;
  }
  claveActual = r.clave;
  ultimaRuta = r;
  diaMostrado = hoy();
  marcarTab(RUTAS[r.nombre].tab);
  document.title = r.nombre === 'inicio' ? 'Mis Finanzas' : RUTAS[r.nombre].nombre + ' · Mis Finanzas';
}

// ------------------------------------------------------------------ Pestañas
function botonTab(nombre, texto, ico) {
  return h('button', { class: 'tab', type: 'button', dataset: { tab: nombre }, onClick: () => {
    const r = ruta();
    if (r.nombre === nombre && !r.params.length) { if (vista) vista.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    location.hash = '#/' + nombre;
  } }, icono(ico), h('span', null, texto));
}

function armarTabs() {
  if (tabs) return;
  tabs = h('nav', { class: 'tabs', 'aria-label': 'Secciones' },
    botonTab('inicio', 'Inicio', 'inicio'),
    botonTab('movimientos', 'Movimientos', 'movimientos'),
    h('button', { class: 'tab tab-mas-grande', type: 'button', 'aria-label': 'Cargar un gasto o un ingreso', onClick: () => abrirMovimiento({}) }, h('span', { class: 'circulo' }, icono('mas'))),
    botonTab('agenda', 'Agenda', 'agenda'),
    botonTab('mas', 'Más', 'menu'));
  app.append(tabs);
}

function marcarTab(nombre) {
  if (!tabs) return;
  for (const b of tabs.querySelectorAll('[data-tab]')) {
    const act = b.dataset.tab === nombre;
    b.classList.toggle('activo', act);
    if (act) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
}

// ------------------------------------------------------------------ Primera sincronización
/** La nube ya tiene datos y este iPhone también: ¿qué hacemos? */
async function preguntarPrimeraVez() {
  const v = await preguntar({
    titulo: 'En la nube ya hay datos de Mis Finanzas',
    texto: 'Este iPhone también tiene datos propios. Podés quedarte con los de la nube (los de este iPhone quedan en una copia de seguridad) o combinar los dos sin duplicar.',
    opciones: [{ texto: 'Usar los de la nube', valor: DecisionInicial.UsarNube, estilo: 'fuerte' }, { texto: 'Combinar los dos', valor: DecisionInicial.Combinar }],
  });
  return v || null;
}

// ------------------------------------------------------------------ Service worker (funciona sin conexión y se actualiza solo)
function registrarServiceWorker() {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol) || new URLSearchParams(location.search).has('sin-sw')) return;
  const habiaControlador = !!navigator.serviceWorker.controller;
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!habiaControlador || recargando) return;
    recargando = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const ofrecer = (sw) => {
      toast('Hay una versión nueva de la app.', { accion: 'Actualizar', alAccionar: () => sw.postMessage('activar'), duracion: 20000 });
    };
    if (reg.waiting && navigator.serviceWorker.controller) ofrecer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      if (!sw) return;
      sw.addEventListener('statechange', () => { if (sw.state === 'installed' && navigator.serviceWorker.controller) ofrecer(sw); });
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
}

// ------------------------------------------------------------------ Arranque
function arrancar(mensaje = '') {
  app.querySelectorAll('.arranque, .bienvenida-vista').forEach((x) => x.remove());
  aplicarTema();
  const { hechos, cambio } = tareasAutomaticas();
  armarTabs();
  render();
  if (cambio) guardar({ guardarDeshacer: false });
  window.addEventListener('hashchange', programarRender);
  escuchar(programarRender);
  escucharSync(() => { const n = ruta().nombre; if (n === 'inicio' || n === 'mas') programarRender(); });
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', aplicarTema); } catch { /* Safari viejo */ }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !hayDatos()) return;
    if (hoy() !== diaMostrado) {
      // Cambió el día con la app abierta: fijos y débitos del día, y todo se vuelve a calcular
      const r = tareasAutomaticas();
      if (r.cambio) guardar({ guardarDeshacer: false }); else programarRender();
      if (r.hechos.length) toast(r.hechos.join('. ') + '.');
    }
  });
  iniciarCiclo();
  retomar();
  if (activa()) sincronizar();
  almacen.pedirPersistencia();
  const textos = [mensaje, hechos.length ? hechos.join('. ') + '.' : ''].filter(Boolean);
  if (textos.length) setTimeout(() => toast(textos.join(' '), { duracion: 6500 }), 400);
}

function mostrarBienvenida() {
  app.querySelectorAll('.arranque').forEach((x) => x.remove());
  aplicarTema();
  const v = pantallaBienvenida((mensaje) => {
    v.remove();
    arrancar(mensaje);
  });
  v.classList.add('bienvenida-vista');
  app.prepend(v);
}

async function iniciar() {
  const q = new URLSearchParams(location.search);
  if (q.has('simular-iphone')) document.documentElement.classList.add('simular-iphone');
  const fijo = q.get('hoy');
  if (fijo && F.leer(fijo) !== null) E.hoyFijo = Math.floor(F.leer(fijo));
  aplicarTema();
  registrarServiceWorker();
  S.alPreguntar = preguntarPrimeraVez;
  E.alGuardar = () => programarSubida();
  let hay;
  try {
    hay = await cargar();
  } catch (e) {
    console.error(e);
    app.querySelectorAll('.arranque').forEach((x) => x.remove());
    app.prepend(h('main', { class: 'vista sin-tabs' }, h('div', { class: 'vacio' }, h('div', { class: 'grande' }, 'No se pudieron abrir tus datos'),
      h('div', null, String(e && e.message ? e.message : e)),
      h('div', { style: { marginTop: '10px' } }, 'Si el problema sigue, en Safari podés borrar los datos del sitio y volver a conectar la nube: lo que esté en la nube no se pierde.'))));
    return;
  }
  if (!hay) mostrarBienvenida(); else arrancar();
}

// Con el teclado abierto, los formularios dejan lugar abajo para poder desplazarse por encima de él
if (window.visualViewport) {
  const teclado = () => {
    const alto = Math.max(0, Math.round(window.innerHeight - visualViewport.height - visualViewport.offsetTop));
    document.documentElement.style.setProperty('--teclado', (alto > 80 ? alto : 0) + 'px');
  };
  visualViewport.addEventListener('resize', teclado);
  visualViewport.addEventListener('scroll', teclado);
}

window.addEventListener('error', (e) => console.error('Error:', e.message));
iniciar();
