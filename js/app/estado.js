// ============================================================================
//  Estado de la app: los datos cargados, el motor de cálculo y el guardado.
//  Cada cambio se guarda en el iPhone al instante y se programa la subida a la nube.
// ============================================================================

import { F } from '../nucleo/fecha.js';
import { Libro } from '../nucleo/modelo.js';
import { Motor } from '../nucleo/motor.js';
import { preparar, verificar } from '../nucleo/integridad.js';
import { textoDe, EstadoSync } from '../nucleo/sincro.js';
import { ATRIBUTOS_LOCALES } from '../nucleo/fusion.js';
import * as almacen from './almacen.js';

export const E = {
  libro: null,
  motor: null,
  /** Texto de lo último guardado (datos.xml) */
  texto: '',
  /** Para "Deshacer" */
  textoAnterior: '',
  sync: new EstadoSync(),
  /** Fecha fija para capturas y pruebas */
  hoyFijo: null,
  oyentes: new Set(),
  alGuardar: null,   // lo fija la sincronización
};

export function hoy() { return E.hoyFijo !== null ? E.hoyFijo : F.hoy(); }

export function escuchar(fn) { E.oyentes.add(fn); return () => E.oyentes.delete(fn); }
export function avisarCambio() { for (const fn of [...E.oyentes]) { try { fn(); } catch (e) { console.error(e); } } }

function nuevoMotor() {
  const m = new Motor(E.libro);
  m.HoyFijo = E.hoyFijo;
  return m;
}

/** Pone en uso unos datos (texto de datos.xml). */
export function usarTexto(texto) {
  const l = Libro.desdeXml(texto);
  l.ranura = E.sync.Ranura;
  E.libro = l;
  E.motor = nuevoMotor();
  E.texto = texto;
}

export const hayDatos = () => !!E.libro;

/** Tareas al abrir la app (como la PC): fijos que ya llegaron, fijos de tarjeta de resúmenes cerrados y débitos automáticos. */
export function tareasAutomaticas() {
  if (!E.libro) return { hechos: [], cambio: false };
  const hechos = [];
  const m = E.motor;
  const regs = m.registrarAutomaticos();
  for (const x of regs) hechos.push((x.Tipo === 'Ingreso' ? 'Se registró el ingreso ' : 'Se registró el gasto ') + x.Descripcion);
  const mats = m.materializarFijosDeTarjeta();
  const debs = m.registrarDebitosAutomaticos();
  if (debs.length) hechos.push('Se registraron ' + debs.length + (debs.length === 1 ? ' débito automático' : ' débitos automáticos') + ' de tarjeta');
  m.invalidar();
  return { hechos, cambio: regs.length + mats.length + debs.length > 0 };
}

/** Guarda los datos en el iPhone y programa la subida a la nube. */
export async function guardar({ sinSubir = false, guardarDeshacer = true } = {}) {
  E.motor.invalidar();
  const texto = textoDe(E.libro.aElemento(F.ahora()));
  if (guardarDeshacer) E.textoAnterior = E.texto;
  E.texto = texto;
  await almacen.guardarDatos(texto);
  avisarCambio();
  if (!sinSubir && E.alGuardar) E.alGuardar();
}

/** Vuelve a lo que había antes del último cambio. */
export async function deshacer() {
  if (!E.textoAnterior) return false;
  const previo = E.textoAnterior;
  usarTexto(previo);
  E.textoAnterior = '';
  await guardar({ guardarDeshacer: false });
  return true;
}

/** Carga lo guardado en el iPhone. Devuelve false si todavía no hay datos. */
export async function cargar() {
  const est = await almacen.leer('estadoSync');
  E.sync = new EstadoSync(est || {});
  E.sync.Token = await almacen.leerToken();
  const texto = await almacen.leerDatos();
  if (!texto) return false;
  usarTexto(texto);
  const hechos = preparar(E.libro);
  const inf = verificar(E.libro, true);
  if (hechos.length || inf.Reparado.length) await guardar({ guardarDeshacer: false });
  return true;
}

/** Reemplaza los datos (por ejemplo, al bajarlos de la nube) conservando las preferencias propias del iPhone. */
export function conservarPreferencias(raizNueva) {
  if (!E.libro) return;
  const cfg = raizNueva.hijo('Configuracion');
  if (!cfg) return;
  const propia = E.libro.config;
  for (const n of ATRIBUTOS_LOCALES) {
    const v = propia[n];
    if (v === undefined || v === null) continue;
    if (typeof v === 'boolean') cfg.fijar(n, v ? '1' : '0');
    else if (typeof v === 'number') cfg.fijar(n, String(v));
    else if (v === '') cfg.quitar(n);
    else cfg.fijar(n, String(v));
  }
}

export async function guardarEstadoSync(extra = {}) {
  await almacen.escribirVarios({ estadoSync: E.sync.aObjeto(), ...extra });
}

/** Tema: "claro", "oscuro" o "sistema". */
export function aplicarTema() {
  const modo = E.libro ? (E.libro.config.ModoTema || 'sistema') : 'sistema';
  const raiz = document.documentElement;
  if (modo === 'claro' || modo === 'oscuro') raiz.dataset.tema = modo; else delete raiz.dataset.tema;
  const oscuro = modo === 'oscuro' || (modo !== 'claro' && matchMedia('(prefers-color-scheme: dark)').matches);
  let meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
  meta.content = oscuro ? '#0B1220' : '#F3F5F9';
}
