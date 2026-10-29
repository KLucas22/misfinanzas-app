// ============================================================================
//  Agenda: calendario del mes (con todas las repeticiones: diarias, semanales,
//  mensuales y anuales) y el tablero de tareas.
// ============================================================================

import { h, icono, colorCss, grupo, fila, vacio, segmentado, chips, toast } from '../ui.js';
import { E, hoy, guardar, deshacer } from '../estado.js';
import { vistaPrincipal, Fmt, F } from './comun.js';
import { Per } from '../../nucleo/formato.js';
import { eventos, TipoEvento, tareasDe, marcarHecha, checklist, estadoFecha, textoRepeticion } from '../../nucleo/organizacion.js';
import { crearTableroInicial } from '../../nucleo/integridad.js';
import { abrirTarea } from '../formularios/tarea.js';
import { registrarFijo, abrirMovimiento } from '../formularios/movimiento.js';

const estadoCal = { mes: null, dia: null, modo: 'calendario', tablero: 0 };

/** Abre lo que corresponde a un evento del calendario. */
export async function abrirEvento(ev) {
  switch (ev.Tipo) {
    case TipoEvento.Tarea:
      abrirTarea(ev.Referencia, ev.Proyectado ? { aviso: 'Esta es una repetición (' + Fmt.fechaDia(ev.Fecha) + '). Lo que cambies se aplica a toda la serie; la próxima fecha es la de la tarjeta.' } : {});
      break;
    case TipoEvento.Examen: {
      const { abrirExamen } = await import('../formularios/estudio.js');
      abrirExamen(ev.Referencia);
      break;
    }
    case TipoEvento.Vencimiento: case TipoEvento.Cierre:
      location.hash = '#/tarjeta/' + ev.Referencia.Tarjeta.Id + '/' + ev.Referencia.Periodo;
      break;
    case TipoEvento.Ingreso: case TipoEvento.GastoFijo: {
      const oc = ev.Referencia;
      if (oc.Pendiente) registrarFijo(oc); else abrirMovimiento({ existente: oc.Registrado });
      break;
    }
    default: break;
  }
}

function filaEvento(ev) {
  const repite = ev.Repite || ev.Proyectado;
  return h('button', { class: 'fila' + (ev.Hecho ? ' hecha' : ''), type: 'button', onClick: () => abrirEvento(ev) },
    h('span', { class: 'barra-evento', style: { '--c': colorCss(ev.ColorArgb) } }),
    ev.Hora ? h('span', { class: 'evento-hora' }, ev.Hora) : null,
    h('div', { class: 'textos' },
      h('div', { class: 't1 multi' }, ev.Titulo),
      ev.Detalle || repite ? h('div', { class: 't2' }, repite ? h('span', { class: 'repite' }, icono('repetir'), ' ') : null, ev.Detalle) : null),
    icono('derecha', 'chevron'));
}

// ------------------------------------------------------------------ Calendario
function calendario(rerender) {
  const l = E.libro, m = E.motor, d = hoy();
  if (estadoCal.mes === null) estadoCal.mes = Per.de(d);
  if (estadoCal.dia === null) estadoCal.dia = d;
  const p = estadoCal.mes;
  const primero = Per.primerDia(p);
  const offset = (F.diaSemana(primero) + 6) % 7;   // semana empieza el lunes
  const inicio = primero - offset;
  const semanas = Math.ceil((offset + F.diasEnMes(Per.anio(p), Per.mes(p))) / 7);
  const fin = inicio + semanas * 7 - 1;
  const cfg = l.config;
  const evs = eventos(l, m, inicio, fin, cfg.CalVerTareas, cfg.CalVerEstudio, cfg.CalVerFinanzas);
  const porDia = new Map();
  for (const ev of evs) { if (!porDia.has(ev.Fecha)) porDia.set(ev.Fecha, []); porDia.get(ev.Fecha).push(ev); }

  const grilla = h('div', { class: 'grilla', role: 'grid' });
  for (let x = inicio; x <= fin; x++) {
    const lista = porDia.get(x) || [];
    const puntos = h('div', { class: 'puntos' }, ...lista.slice(0, 3).map((ev) => h('i', { class: ev.Hecho ? 'hueco' : '', style: { '--c': colorCss(ev.ColorArgb) } })));
    const clase = 'dia-cal' + (Per.de(x) !== p ? ' otro-mes' : '') + (x === d ? ' hoy' : '') + (x === estadoCal.dia ? ' sel' : '');
    grilla.appendChild(h('button', { class: clase, type: 'button', 'aria-label': Fmt.fechaLarga(x) + (lista.length ? ', ' + lista.length + ' cosas' : ''),
      onClick: () => { estadoCal.dia = x; if (Per.de(x) !== p) estadoCal.mes = Per.de(x); rerender(); } },
    h('span', { class: 'n' }, String(F.dia(x))), puntos));
  }
  const delDia = porDia.get(estadoCal.dia) || [];
  const tituloDia = estadoCal.dia === d ? 'Hoy' : estadoCal.dia === d + 1 ? 'Mañana' : Fmt.capital(Fmt.fechaDia(estadoCal.dia));
  const alternar = async (clave) => { cfg[clave] = !cfg[clave]; await guardar({ sinSubir: true, guardarDeshacer: false }); };
  const filtros = h('div', { class: 'chips' }, ...[['CalVerTareas', 'Tareas', -14326805], ['CalVerEstudio', 'Estudio', -8635667], ['CalVerFinanzas', 'Finanzas', -16411031]].map(([k, t, c]) =>
    h('button', { class: 'chip' + (cfg[k] ? ' activo' : ''), type: 'button', 'aria-pressed': cfg[k] ? 'true' : 'false', style: { '--color-chip': colorCss(c) }, onClick: () => alternar(k) },
      h('span', { class: 'marca-color' }), t)));

  return [
    h('div', { class: 'mes-cabecera' },
      h('h2', null, Fmt.periodo(p)),
      h('div', { class: 'flechas' },
        h('button', { class: 'boton-icono', type: 'button', 'aria-label': 'Mes anterior', onClick: () => { estadoCal.mes = Per.sumar(p, -1); rerender(); } }, icono('izquierda')),
        h('button', { class: 'boton-texto', type: 'button', onClick: () => { estadoCal.mes = Per.de(d); estadoCal.dia = d; rerender(); } }, 'Hoy'),
        h('button', { class: 'boton-icono', type: 'button', 'aria-label': 'Mes siguiente', onClick: () => { estadoCal.mes = Per.sumar(p, 1); rerender(); } }, icono('derecha')))),
    h('div', { class: 'calendario' },
      h('div', { class: 'dias-semana' }, ...['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((x) => h('span', null, x))),
      grilla),
    h('div', { style: { padding: '8px 16px 0' } }, filtros),
    h('section', { class: 'seccion', style: { marginTop: '14px' } },
      h('div', { class: 'titulo-seccion' }, h('h2', null, tituloDia),
        h('button', { class: 'enlace', type: 'button', onClick: () => abrirTarea(null, { fecha: estadoCal.dia }) }, 'Agregar tarea')),
      delDia.length ? grupo(...delDia.map(filaEvento)) : grupo(fila({ t1: 'Nada para este día', t2: 'Tocá «Agregar tarea» para sumar algo.' }))),
  ];
}

// ------------------------------------------------------------------ Tablero
function tarjetaTarea(t, rerender) {
  const l = E.libro, d = hoy();
  const est = estadoFecha(t, d);
  const items = checklist(t);
  const hechos = items.filter((x) => x.Hecho).length;
  const meta = [];
  if (t.Fecha !== null) {
    const txt = (t.Fecha === d ? 'Hoy' : t.Fecha === d + 1 ? 'Mañana' : Fmt.fechaDia(t.Fecha)) + (t.Hora ? ' ' + t.Hora : '');
    meta.push(h('span', { class: est === 'vencida' ? 'vencida' : est === 'hoy' ? 'hoy' : '' }, icono('agenda'), ' ', txt));
  }
  if (t.Repetir !== 'Nunca') meta.push(h('span', { class: 'repite' }, icono('repetir'), textoRepeticion(t.Repetir)));
  if (t.Etiqueta) meta.push(h('span', { class: 'etq', style: { '--c': t.ColorArgb ? colorCss(t.ColorArgb) : null } }, t.Etiqueta));
  if (items.length) meta.push(h('span', null, '☑ ' + hechos + '/' + items.length));
  if (t.Prioridad > 0) meta.push(h('span', { class: 'prioridad' }, t.Prioridad === 2 ? 'Urgente' : 'Alta'));
  const mat = t.MateriaId ? l.materia(t.MateriaId) : null;
  if (mat) meta.push(h('span', null, mat.Nombre));
  const btnHecha = h('button', { type: 'button', class: 'boton-icono', 'aria-label': t.Hecha ? 'Reabrir' : 'Marcar hecha',
    style: { position: 'absolute', right: '10px', top: '8px', margin: 0, color: t.Hecha ? 'var(--acento)' : 'var(--tinta-tenue)' },
    onClick: async (e) => {
      e.stopPropagation();
      const nueva = marcarHecha(l, t, !t.Hecha, d);
      await guardar();
      toast(t.Hecha ? (nueva ? 'Hecha. Se repite el ' + Fmt.fechaDia(nueva.Fecha) : 'Tarea hecha') : 'Tarea reabierta', { accion: 'Deshacer', alAccionar: () => deshacer() });
    } }, icono('check'));
  return h('button', { class: 'tarea-card' + (t.ColorArgb ? ' con-color' : '') + (t.Hecha ? ' hecha' : ''), type: 'button', style: { '--c': t.ColorArgb ? colorCss(t.ColorArgb) : null, paddingRight: '44px' },
    onClick: () => abrirTarea(t) },
  h('div', { class: 'tt', style: t.Hecha ? { textDecoration: 'line-through', color: 'var(--tinta-sec)' } : null }, t.Titulo),
  meta.length ? h('div', { class: 'meta' }, ...meta) : null,
  btnHecha);
}

function tablero(rerender) {
  const l = E.libro;
  if (!l.tableros.length) crearTableroInicial(l);
  const tableros = l.tableros.filter((x) => !x.Archivado).sort((a, b) => a.Orden - b.Orden);
  let tab = l.tablero(estadoCal.tablero) || l.tablero(l.config.TableroActual) || tableros[0];
  if (!tab) return [vacio('Sin tableros', null)];
  estadoCal.tablero = tab.Id;
  const selTab = tableros.length > 1 ? h('div', { style: { padding: '0 16px 8px' } }, chips(tableros.map((x) => ({ valor: x.Id, texto: x.Nombre, color: colorCss(x.ColorArgb) })), tab.Id, (v) => {
    estadoCal.tablero = v; l.config.TableroActual = v; guardar({ sinSubir: true, guardarDeshacer: false });
  })) : null;
  const columnas = l.listasDe(tab.Id).map((li) => {
    const tareas = tareasDe(l, li.Id);
    return h('div', { class: 'columna' },
      h('h3', null, li.Nombre, h('span', null, String(tareas.length))),
      ...tareas.map((t) => tarjetaTarea(t, rerender)),
      h('button', { class: 'agregar-tarea', type: 'button', onClick: () => abrirTarea(null, { lista: li }) }, '+ Agregar tarea'));
  });
  return [selTab, h('div', { class: 'tablero' }, ...columnas)];
}

export function pantallaAgenda(params, rerender) {
  if (params && params[0] === 'tablero') estadoCal.modo = 'tablero';
  const cuerpo = estadoCal.modo === 'tablero' ? tablero(rerender) : calendario(rerender);
  return vistaPrincipal('#/agenda', {
    titulo: 'Agenda',
    derecha: h('button', { class: 'boton-icono', type: 'button', 'aria-label': 'Nueva tarea', onClick: () => abrirTarea(null, estadoCal.modo === 'calendario' ? { fecha: estadoCal.dia ?? hoy() } : {}) }, icono('mas')),
    contenido: [
      h('div', { style: { padding: '0 16px 10px' } }, segmentado([['calendario', 'Calendario'], ['tablero', 'Tablero']], estadoCal.modo, (v) => { estadoCal.modo = v; rerender(); })),
      ...cuerpo,
    ],
  });
}
