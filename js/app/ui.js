// ============================================================================
//  Piezas de la interfaz: creación de elementos, listas agrupadas, hojas que
//  suben desde abajo, preguntas, avisos rápidos y controles de formulario.
// ============================================================================

import { icono } from './iconos.js';
import { Fmt } from '../nucleo/formato.js';
import { D } from '../nucleo/decimal.js';
import { F } from '../nucleo/fecha.js';

/** Crea un elemento: h('div', { class: 'x', onClick }, hijo1, 'texto', [más hijos]) */
export function h(tag, props, ...hijos) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v)) {
          if (sv === null || sv === undefined) continue;
          if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv;
        }
      } else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (k === 'disabled') el.disabled = !!v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  agregar(el, hijos);
  return el;
}

function agregar(el, hijos) {
  for (const x of hijos) {
    if (x === null || x === undefined || x === false || x === '') continue;
    if (Array.isArray(x)) agregar(el, x);
    else if (x instanceof Node) el.appendChild(x);
    else el.appendChild(document.createTextNode(String(x)));
  }
}

export { icono };

/** Color ARGB de .NET (entero con signo) → CSS. */
export function colorCss(argb, defecto = '#2563EB') {
  if (argb === null || argb === undefined || argb === 0) return defecto;
  const v = argb >>> 0;
  const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  return `rgb(${r}, ${g}, ${b})`;
}

/** ¿El color es claro? (para elegir texto oscuro encima) */
export function esClaro(argb) {
  const v = argb >>> 0;
  const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62;
}

/** Monto con su moneda y el espacio duro para que no se corte. */
export function textoMonto(v, moneda = 'ARS', redondo = false) {
  const s = moneda === 'USD' ? Fmt.dolares(v) : (redondo ? Fmt.pesosR(v) : Fmt.pesos(v));
  return s.replace('$ ', '$ ').replace('USD ', 'USD ');
}

export function monto(v, moneda = 'ARS', { redondo = false, clase = '' } = {}) {
  return h('span', { class: 'num ' + clase }, textoMonto(v, moneda, redondo));
}

// ------------------------------------------------------------------ Listas
export function grupo(...filas) { return h('div', { class: 'grupo' }, ...filas); }

export function seccion(titulo, contenido, { enlace = null, alEnlace = null, pie = null } = {}) {
  return h('section', { class: 'seccion' },
    titulo ? h('div', { class: 'titulo-seccion' }, h('h2', null, titulo), enlace ? h('button', { class: 'enlace', onClick: alEnlace }, enlace) : null) : null,
    contenido,
    pie ? h('p', { class: 'nota-pie' }, pie) : null);
}

/**
 * Fila de lista: { icono, colorIcono, punto, t1, t2, derecha, derecha2, onClick, chevron, clase, multi }
 */
export function fila(o) {
  const tag = o.onClick ? 'button' : 'div';
  const conIcono = !!o.icono;
  return h(tag, { class: 'fila' + (conIcono ? ' con-icono' : '') + (o.clase ? ' ' + o.clase : ''), onClick: o.onClick, type: o.onClick ? 'button' : null,
    style: o.punto ? { '--color-punto': o.punto } : null },
  conIcono ? h('span', { class: 'icono-fila ' + (o.claseIcono || ''), style: o.colorIcono ? { '--fondo-icono': o.colorIcono } : null }, icono(o.icono)) : null,
  o.punto ? h('span', { class: 'punto' }) : null,
  h('div', { class: 'textos' },
    h('div', { class: 't1' + (o.multi ? ' multi' : '') }, o.t1),
    o.t2 ? h('div', { class: 't2' + (o.t2una ? ' una' : '') }, o.t2) : null),
  (o.derecha !== undefined && o.derecha !== null) || o.derecha2 ? h('div', { class: 'derecha' }, o.derecha, o.derecha2 ? h('div', { class: 't2' }, o.derecha2) : null) : null,
  o.chevron ? icono('derecha', 'chevron') : null);
}

export function vacio(titulo, texto, accion = null, textoAccion = '') {
  return h('div', { class: 'vacio' }, h('div', { class: 'grande' }, titulo), texto ? h('div', null, texto) : null,
    accion ? h('button', { class: 'boton', onClick: accion }, textoAccion) : null);
}

export function segmentado(opciones, valor, alCambiar, clase = '') {
  const cont = h('div', { class: 'segmentado ' + clase, role: 'tablist' });
  for (const [v, texto] of opciones) {
    const b = h('button', { type: 'button', class: v === valor ? 'activo' : '', role: 'tab', 'aria-selected': v === valor ? 'true' : 'false' }, texto);
    b.addEventListener('click', () => {
      for (const x of cont.children) { x.classList.remove('activo'); x.setAttribute('aria-selected', 'false'); }
      b.classList.add('activo');
      b.setAttribute('aria-selected', 'true');
      alCambiar(v);
    });
    cont.appendChild(b);
  }
  return cont;
}

/** Fila de chips con selección única. opciones: [{ valor, texto, sub, color }] */
export function chips(opciones, valor, alCambiar) {
  const cont = h('div', { class: 'chips' });
  for (const o of opciones) {
    const b = h('button', { type: 'button', class: 'chip' + (o.valor === valor ? ' activo' : ''), style: o.color ? { '--color-chip': o.color } : null },
      o.color ? h('span', { class: 'marca-color' }) : null, o.texto, o.sub ? h('span', { class: 'sub' }, o.sub) : null);
    b.addEventListener('click', () => {
      for (const x of cont.children) x.classList.remove('activo');
      b.classList.add('activo');
      alCambiar(o.valor);
    });
    cont.appendChild(b);
  }
  setTimeout(() => { const act = cont.querySelector('.activo'); if (act) act.scrollIntoView({ inline: 'center', block: 'nearest' }); }, 0);
  return cont;
}

// ------------------------------------------------------------------ Formularios
export function campo(etiqueta, control, { vertical = false, clase = '' } = {}) {
  const id = control.id || ('c' + Math.random().toString(36).slice(2, 9));
  if (control.tagName && ['INPUT', 'SELECT', 'TEXTAREA'].includes(control.tagName)) control.id = id;
  return h('div', { class: 'campo' + (vertical ? ' vertical' : '') + (clase ? ' ' + clase : '') }, h('label', { for: id }, etiqueta), control);
}

export function entrada(valor = '', props = {}) {
  return h('input', { type: 'text', value: valor, autocomplete: 'off', autocapitalize: 'sentences', ...props });
}

/** Campo de monto: acepta "1.500,50", "1500.5", "$ 2.000". */
export function entradaMonto(valor = null, props = {}) {
  const el = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0', ...props });
  if (valor !== null && valor !== undefined) el.value = Fmt.num(valor, 2).replace(/,00$/, '');
  el.addEventListener('blur', () => {
    const v = Fmt.parseMonto(el.value);
    if (v !== null) el.value = Fmt.num(v, 2).replace(/,00$/, '');
  });
  el.leer = () => (el.value.trim() === '' ? null : Fmt.parseMonto(el.value));
  return el;
}

export function entradaFecha(n) {
  const el = h('input', { type: 'date', value: n === null || n === undefined ? '' : F.iso(n) });
  el.leer = () => (el.value ? F.leer(el.value) : null);
  return el;
}

export function selector(opciones, valor) {
  const el = h('select', null, ...opciones.map(([v, t]) => h('option', { value: String(v), selected: String(v) === String(valor) ? true : null }, t)));
  el.value = String(valor);
  return el;
}

export function interruptor(marcado, alCambiar = null) {
  const input = h('input', { type: 'checkbox', checked: marcado, role: 'switch' });
  if (alCambiar) input.addEventListener('change', () => alCambiar(input.checked));
  const cont = h('label', { class: 'interruptor' }, input, h('span'));
  cont.input = input;
  return cont;
}

// ------------------------------------------------------------------ Hojas
let hojasAbiertas = 0;
export const hojaAbierta = () => hojasAbiertas > 0;
const alCerrarHojas = new Set();
export function cuandoNoHayHojas(fn) { if (hojasAbiertas === 0) fn(); else alCerrarHojas.add(fn); }

/**
 * Abre una hoja con título, botón Cancelar y (opcional) botón de confirmar.
 * contenido: elemento o función (cerrar) → elemento. alConfirmar: async () → true para cerrar.
 */
export function abrirHoja({ titulo, contenido, textoConfirmar = null, alConfirmar = null, media = false, izquierda = 'Cancelar', alCerrar = null }) {
  hojasAbiertas++;
  const velo = h('div', { class: 'velo' });
  const hoja = h('div', { class: 'hoja' + (media ? ' media' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo });
  let cerrada = false;
  const cerrar = () => {
    if (cerrada) return;
    cerrada = true;
    hoja.classList.remove('visible');
    velo.classList.remove('visible');
    setTimeout(() => {
      hoja.remove(); velo.remove();
      hojasAbiertas--;
      if (alCerrar) alCerrar();
      if (hojasAbiertas === 0) { const fs = [...alCerrarHojas]; alCerrarHojas.clear(); for (const f of fs) f(); }
    }, 300);
  };
  const btnConfirmar = textoConfirmar ? h('button', { class: 'boton-texto fuerte', type: 'button' }, textoConfirmar) : null;
  if (btnConfirmar) {
    btnConfirmar.addEventListener('click', async () => {
      btnConfirmar.disabled = true;
      try {
        const ok = await alConfirmar();
        if (ok !== false) cerrar();
      } catch (e) {
        toast(e.message || String(e), { error: true });
      } finally { btnConfirmar.disabled = false; }
    });
  }
  const cuerpo = h('div', { class: 'hoja-cuerpo' });
  hoja.append(h('div', { class: 'asa' }),
    h('div', { class: 'hoja-cabecera' },
      h('div', { class: 'izq' }, izquierda ? h('button', { class: 'boton-texto', type: 'button', onClick: cerrar }, izquierda) : null),
      h('div', { class: 'titulo-hoja' }, titulo),
      h('div', { class: 'der' }, btnConfirmar)),
    cuerpo);
  const c = typeof contenido === 'function' ? contenido(cerrar) : contenido;
  agregar(cuerpo, [c]);
  velo.addEventListener('click', cerrar);
  document.body.append(velo, hoja);
  requestAnimationFrame(() => requestAnimationFrame(() => { velo.classList.add('visible'); hoja.classList.add('visible'); }));
  return { cerrar, hoja, cuerpo };
}

// ------------------------------------------------------------------ Preguntas
/** opciones: [{ texto, valor, estilo: 'peligro' | 'fuerte' }]. Devuelve el valor elegido o null. */
export function preguntar({ titulo = '', texto = '', opciones = [], cancelar = 'Cancelar' }) {
  return new Promise((resolver) => {
    const velo = h('div', { class: 'velo acc' });
    const caja = h('div', { class: 'caja' });
    if (titulo || texto) caja.appendChild(h('div', { class: 'encabezado-acc' }, titulo ? h('div', { class: 't' }, titulo) : null, texto ? h('div', { class: 'd' }, texto) : null));
    const panel = h('div', { class: 'acciones', role: 'alertdialog', 'aria-label': titulo || texto }, caja);
    const terminar = (v) => {
      panel.classList.remove('visible');
      velo.classList.remove('visible');
      setTimeout(() => { panel.remove(); velo.remove(); }, 280);
      resolver(v);
    };
    for (const o of opciones) caja.appendChild(h('button', { type: 'button', class: o.estilo || '', onClick: () => terminar(o.valor) }, o.texto));
    if (cancelar) panel.appendChild(h('button', { type: 'button', class: 'cancelar', onClick: () => terminar(null) }, cancelar));
    velo.addEventListener('click', () => terminar(null));
    document.body.append(velo, panel);
    requestAnimationFrame(() => requestAnimationFrame(() => { velo.classList.add('visible'); panel.classList.add('visible'); }));
  });
}

export async function confirmar(texto, { titulo = '', si = 'Confirmar', peligro = false } = {}) {
  const r = await preguntar({ titulo, texto, opciones: [{ texto: si, valor: true, estilo: peligro ? 'peligro' : 'fuerte' }] });
  return r === true;
}

// ------------------------------------------------------------------ Avisos rápidos
let toastActual = null;
export function toast(texto, { accion = null, alAccionar = null, error = false, duracion = 3800 } = {}) {
  if (toastActual) toastActual.remove();
  const el = h('div', { class: 'toast' + (error ? ' error' : ''), role: 'status', 'aria-live': 'polite' },
    h('div', { class: 'texto-toast' }, texto),
    accion ? h('button', { type: 'button', onClick: () => { quitar(); if (alAccionar) alAccionar(); } }, accion) : null);
  toastActual = el;
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('visible')));
  let t = setTimeout(quitar, duracion);
  function quitar() {
    clearTimeout(t);
    el.classList.remove('visible');
    setTimeout(() => el.remove(), 260);
    if (toastActual === el) toastActual = null;
  }
  return quitar;
}

/** Barra de progreso (0..1) */
export function barra(fraccion, color = null) {
  const pct = Math.max(0, Math.min(1, Number(fraccion))) * 100;
  return h('div', { class: 'barra', style: color ? { '--c': color } : null }, h('i', { style: { width: pct.toFixed(1) + '%' } }));
}

export const decimal = D;
