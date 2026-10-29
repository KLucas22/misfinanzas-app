// Piezas comunes de las pantallas.
import { h, icono } from '../ui.js';
import { E } from '../estado.js';
import { F } from '../../nucleo/fecha.js';
import { Fmt } from '../../nucleo/formato.js';

/** Pantalla principal (pestaña): título grande que se desplaza con el contenido. */
export function vistaPrincipal(ruta, { titulo, sub = null, derecha = null, contenido = [], barra = true }) {
  const v = h('main', { class: 'vista', dataset: { ruta } });
  v.append(
    h('header', { class: 'cabecera' },
      h('div', { class: 'fila-cabecera' },
        h('div', null, sub ? h('div', { class: 'fecha' }, sub) : null, h('h1', { class: 'titulo-grande' }, titulo)),
        derecha)),
    ...[].concat(contenido).filter(Boolean));
  if (!barra) v.classList.add('sin-tabs');
  return v;
}

/** Navegación: nombre de la pantalla anterior (lo completa main.js). */
export const NAV = { anterior: null };

/** Subpantalla con barra superior (volver + título). */
export function vistaSecundaria(ruta, { titulo, atras = null, alVolver = null, derecha = null, contenido = [], grande = true }) {
  if (!atras) atras = NAV.anterior && NAV.anterior !== titulo ? NAV.anterior : 'Más';
  const v = h('main', { class: 'vista', dataset: { ruta } });
  const barraSup = h('div', { class: 'barra-sup' },
    h('div', { class: 'lado' }, h('button', { class: 'boton-texto', type: 'button', onClick: alVolver || (() => history.length > 1 ? history.back() : (location.hash = '#/mas')) },
      icono('atras'), atras)),
    h('div', { class: 'titulo-chico' }, grande ? '' : titulo),
    h('div', { class: 'lado der' }, derecha));
  v.append(barraSup);
  if (grande) v.append(h('header', { class: 'cabecera' }, h('h1', { class: 'titulo-grande' }, titulo)));
  v.append(...[].concat(contenido).filter(Boolean));
  // El título chico aparece al desplazar
  if (grande) {
    v.addEventListener('scroll', () => {
      const pasado = v.scrollTop > 44;
      barraSup.classList.toggle('con-linea', pasado);
      barraSup.querySelector('.titulo-chico').textContent = pasado ? titulo : '';
    }, { passive: true });
  }
  return v;
}

export function saludo() {
  const hora = new Date().getHours();
  const s = hora < 5 || hora >= 20 ? 'Buenas noches' : hora < 13 ? 'Buen día' : 'Buenas tardes';
  const n = E.libro && E.libro.config.Nombre ? E.libro.config.Nombre.trim() : '';
  return n ? s + ', ' + n : s;
}

export const fechaLargaCap = (n) => Fmt.capital(Fmt.fechaLarga(n));

/** Días hasta una fecha, en palabras cortas para los talones. */
export function diasTexto(dias) {
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  if (dias < 0) return dias === -1 ? 'ayer' : 'hace ' + (-dias) + ' días';
  return 'días';
}

export const COLOR_NIVEL = ['var(--rojo)', 'var(--ambar-vivo)', 'var(--azul)', 'var(--acento)', 'var(--tinta-tenue)'];

export function nombreMedio(m) { return E.libro.nombreMedio(m); }

export function hoyTexto(n) { return Fmt.capital(Fmt.fechaDia(n)); }

export { F, Fmt };
