// ============================================================================
//  Estudio (como VistaEstudio de la PC): pomodoro, plan para cada examen,
//  repaso espaciado, materias y las horas de los últimos 14 días.
// ============================================================================

import { h, icono, colorCss, seccion, grupo, fila, vacio, selector, chips, toast, preguntar, confirmar, barra } from '../ui.js';
import { E, hoy } from '../estado.js';
import { vistaSecundaria, Fmt, F } from './comun.js';
import { D, Dec } from '../../nucleo/decimal.js';
import * as Est from '../../nucleo/estudio.js';
import { ENUMS } from '../../nucleo/modelo.js';
import { P, Fase, escucharPomodoro, enCurso, fraccion, textoRestante, empezar, pausarOReanudar, parar, saltar } from '../pomodoro.js';
import { abrirMateria, abrirExamen, abrirSesion, abrirTarjetaRepaso, abrirPegarTarjetas, abrirRepaso, opcionesMaterias } from '../formularios/estudio.js';

let materiaElegida = null;
const VIOLETA = '#7C3AED';

const horas = (min) => Fmt.num(D(min).div(D(60)), 1);

/** Repasar las tarjetas que tocan hoy (de una materia o de todas). */
export async function repasar(materiaId = 0) {
  const l = E.libro, d = hoy();
  const lista = Est.paraRepasar(l, d, materiaId);
  if (lista.length) { abrirRepaso(lista); return; }
  const todas = l.repasos.filter((r) => materiaId === 0 || r.MateriaId === materiaId);
  if (!todas.length) {
    if (await confirmar('Todavía no tenés tarjetas de repaso' + (materiaId ? ' de esta materia' : '') + '. ¿Querés crear algunas?', { titulo: 'Repaso', si: 'Crear tarjetas' })) abrirTarjetaRepaso(null, materiaId);
    return;
  }
  const prox = Math.min(...todas.map((r) => Math.floor(r.ProximaRevision)));
  toast('¡Estás al día! El próximo repaso es ' + Fmt.enDias(prox, d) + ' (' + Fmt.fechaDia(prox) + ').');
}

function irArriba() {
  const v = document.querySelector('main.vista');
  if (v) v.scrollTo({ top: 0, behavior: 'smooth' });
}

// ------------------------------------------------------------------ Pomodoro
function tarjetaPomodoro(rerender) {
  const l = E.libro, cfg = l.config, d = hoy();
  const ops = opcionesMaterias(true, true);
  if (enCurso()) materiaElegida = P.materia;
  if (materiaElegida === null || !ops.some(([id]) => id === materiaElegida)) {
    const plan = Est.planes(l, d).find((p) => p.Materia && ops.some(([id]) => id === p.Materia.Id));
    materiaElegida = plan ? plan.Materia.Id : 0;
  }
  const R = 86, C = 2 * Math.PI * R;
  const anillo = h('div', { class: 'anillo', html: '<svg viewBox="0 0 200 200" aria-hidden="true"><circle class="pista" cx="100" cy="100" r="' + R + '"/>' +
    '<circle class="arco" cx="100" cy="100" r="' + R + '" transform="rotate(-90 100 100)" stroke-dasharray="' + C.toFixed(2) + '"/></svg>' });
  const tiempo = h('div', { class: 'tiempo' });
  const etapa = h('div', { class: 'etapa' });
  anillo.append(h('div', { class: 'centro' }, tiempo, etapa));
  const arco = anillo.querySelector('.arco');
  const cont = h('div', { class: 'pomodoro' });
  const pausado = () => P.pausadoDesde !== null;
  const pintar = () => {
    tiempo.textContent = enCurso() ? textoRestante() : F.dos(Math.max(1, cfg.PomodoroMin)) + ':00';
    etapa.textContent = P.fase === Fase.Foco ? (pausado() ? 'En pausa' : 'Concentración') : P.fase === Fase.Descanso ? (pausado() ? 'En pausa' : 'Descanso') : 'Listo para empezar';
    cont.dataset.fase = P.fase;
    cont.classList.toggle('pausado', pausado());
    arco.setAttribute('stroke-dashoffset', (C * (1 - fraccion())).toFixed(2));
  };
  pintar();

  const deHoy = l.sesiones.filter((s) => Math.floor(s.Inicio) === d);
  const info = 'Hoy: ' + Fmt.plural(deHoy.filter((s) => s.Pomodoro).length, 'pomodoro', 'pomodoros') + ' · ' + Fmt.plural(deHoy.reduce((a, s) => a + s.Minutos, 0), 'minuto', 'minutos');
  let controles;
  if (!enCurso()) {
    const sel = selector(ops, materiaElegida);
    sel.addEventListener('change', () => { materiaElegida = Number(sel.value) || 0; });
    controles = [
      grupo(h('div', { class: 'campo' }, h('label', null, 'Materia'), sel)),
      h('button', { class: 'boton ancho', type: 'button', style: { marginTop: '12px' }, onClick: () => { empezar(materiaElegida); } }, icono('play'), 'Empezar'),
    ];
  } else {
    const ma = l.materia(P.materia);
    controles = [
      h('div', { class: 'estudiando' }, h('span', { class: 'punto', style: { '--color-punto': ma && ma.ColorArgb ? colorCss(ma.ColorArgb) : VIOLETA } }), ma ? ma.Nombre : 'Sin materia'),
      h('div', { class: 'botonera', style: { marginTop: '10px' } },
        h('button', { class: 'boton secundario', type: 'button', onClick: () => pausarOReanudar() }, icono(pausado() ? 'play' : 'pausa'), pausado() ? 'Seguir' : 'Pausar'),
        h('button', { class: 'boton secundario', type: 'button', onClick: () => saltar() }, 'Saltar'),
        h('button', { class: 'boton peligro', type: 'button', onClick: () => parar() }, 'Parar')),
    ];
  }
  cont.append(anillo, h('div', { class: 'controles-pomodoro' }, ...controles,
    h('p', { class: 'nota-pie', style: { margin: '10px 2px 0' } }, info + '. Bloques de ' + cfg.PomodoroMin + ' min + ' + cfg.DescansoMin + ' de descanso (' + cfg.DescansoLargoMin + ' cada ' + cfg.PomodorosPorCiclo +
      '). Cada bloque queda registrado solo; si bloqueás el iPhone, el reloj sigue.')));

  let faseDibujada = P.fase, pausaDibujada = pausado();
  const quitar = escucharPomodoro(() => {
    if (!document.body.contains(cont)) { quitar(); return; }
    if (P.fase !== faseDibujada || pausado() !== pausaDibujada) { faseDibujada = P.fase; pausaDibujada = pausado(); rerender(); return; }
    pintar();
  });
  return cont;
}

// ------------------------------------------------------------------ Indicadores
function indicadores() {
  const l = E.libro, cfg = l.config, d = hoy();
  const minSemana = Est.minutosSemana(l, d);
  const meta = cfg.MetaHorasEstudio;
  const cumplida = meta.signo > 0 && D(minSemana).ge(meta.por(D(60)));
  const racha = Est.racha(l, d);
  const hoyMin = Est.minutos(l, d, d);
  const repasar_ = Est.paraRepasar(l, d).length;
  const aprob = Est.aprobadas(l);
  const prom = Est.promedio(l);
  const cursando = l.materias.filter((x) => x.Estado === 'Cursando').length;
  const caja = (et, val, sub, clase = '', onClick = null) => h(onClick ? 'button' : 'div', { class: 'cifra-caja' + (onClick ? ' tocable' : ''), type: onClick ? 'button' : null, onClick },
    h('div', { class: 'et' }, et), h('div', { class: 'val ' + clase }, val), sub ? h('div', { class: 'sub' }, sub) : null);
  return h('div', { class: 'cifras' },
    caja('Esta semana', horas(minSemana) + ' h', meta.signo > 0 ? 'Meta ' + Fmt.num(meta, 0) + ' h (' + Fmt.pct(Dec.min(D(1), D(minSemana).div(D(60)).div(meta)), 0) + ')' : 'Sin meta semanal', cumplida ? 'verde' : ''),
    caja('Racha', Fmt.plural(racha, 'día', 'días'), hoyMin > 0 ? 'Hoy: ' + Fmt.plural(hoyMin, 'minuto', 'minutos') : (racha > 0 ? 'Estudiá algo hoy para no cortarla' : 'Arrancá hoy con un pomodoro'), racha >= 3 ? 'ambar' : ''),
    caja('Para repasar hoy', Fmt.plural(repasar_, 'tarjeta', 'tarjetas'), l.repasos.length ? Fmt.plural(l.repasos.length, 'tarjeta', 'tarjetas') + ' en total · tocá para repasar' : 'Creá tarjetas con lo más importante',
      repasar_ > 0 ? 'rojo' : '', () => repasar(0)),
    caja('Carrera', cfg.TotalMaterias > 0 ? aprob + ' de ' + cfg.TotalMaterias : Fmt.plural(aprob, 'aprobada', 'aprobadas'),
      (prom !== null ? 'Promedio ' + Fmt.num(prom, 2) : 'Sin notas cargadas') + ' · ' + cursando + ' cursando'));
}

// ------------------------------------------------------------------ Exámenes
function filaPlan(p, d) {
  const ex = p.Examen;
  const c = p.Materia && p.Materia.ColorArgb ? colorCss(p.Materia.ColorArgb) : VIOLETA;
  const cumplido = p.Progreso.ge(D(1));
  const ritmo = cumplido ? '¡Objetivo cumplido!' : (p.DiasRestantes === 0 ? 'es hoy' : p.MinutosPorDia + ' min por día');
  const urgente = p.DiasRestantes <= 3 && !cumplido;
  const fila_ = h('div', { class: 'fila examen tocable', role: 'button', tabindex: '0', onClick: () => abrirExamen(ex) },
    h('div', { class: 'fecha-examen', style: { '--c': c } }, h('b', null, String(F.dia(ex.Fecha))), h('span', null, Fmt.MESES_CORTOS[F.mes(ex.Fecha) - 1].toUpperCase())),
    h('div', { class: 'textos' },
      h('div', { class: 't1', style: { fontWeight: 600 } }, Est.nombreTipoExamen(ex.Tipo) + ' · ' + (p.Materia ? p.Materia.Nombre : '(sin materia)')),
      h('div', { class: 't2' + (urgente ? ' rojo' : '') }, Fmt.fechaDia(ex.Fecha) + (ex.Hora ? ' ' + ex.Hora : '') + ' · ' + Fmt.enDias(ex.Fecha, d) + ' · ' + ritmo),
      h('div', { class: 'progreso-examen' }, barra(Number(p.Progreso.toString()), cumplido ? 'var(--acento)' : c),
        h('span', { class: 'num' }, Fmt.num(p.HorasHechas, 1) + ' de ' + Fmt.num(p.HorasObjetivo, 0) + ' h'))),
    h('button', { class: 'boton chico suave', type: 'button', 'aria-label': 'Estudiar con el pomodoro', onClick: (e) => {
      e.stopPropagation();
      if (enCurso()) { toast('Ya hay un pomodoro en curso.'); irArriba(); return; }
      materiaElegida = p.Materia ? p.Materia.Id : 0;
      empezar(materiaElegida);
      irArriba();
    } }, icono('play'), 'Estudiar'));
  return fila_;
}

// ------------------------------------------------------------------ Repaso espaciado
function seccionRepaso() {
  const l = E.libro, d = hoy();
  const pendientes = Est.paraRepasar(l, d);
  const proximos = l.repasos.filter((r) => Math.floor(r.ProximaRevision) > d && Math.floor(r.ProximaRevision) <= d + 7).length;
  const dominadas = l.repasos.filter((r) => r.Caja >= 4).length;
  const texto = l.repasos.length === 0
    ? 'Anotá las preguntas que seguro toman (una tarjeta = una pregunta). La app te las vuelve a mostrar justo antes de que se te olviden: mañana, en 3 días, en una semana, en dos y en un mes.'
    : pendientes.length + ' para hoy · ' + Fmt.plural(proximos, 'vuelve', 'vuelven') + ' en 7 días · ' + Fmt.plural(dominadas, 'dominada', 'dominadas') + ' (caja 4 o 5).';
  const porTipo = ENUMS.TipoRepaso.map((t) => [t, pendientes.filter((r) => r.Tipo === t).length]).filter(([, n]) => n > 0);
  return seccion('Repaso espaciado', h('div', null,
    h('div', { class: 'cifra-caja' },
      h('div', { style: { fontSize: '15px', lineHeight: 1.4 } }, texto),
      porTipo.length ? h('div', { class: 'etiquetas-repaso' }, ...porTipo.map(([t, n]) => h('span', { class: 'etq-repaso', style: { '--c': colorCss(Est.colorRepaso(t)) } }, Est.nombreRepaso(t) + ' ' + n))) : null,
      h('div', { class: 'botonera', style: { flexWrap: 'wrap' } },
        h('button', { class: 'boton', type: 'button', onClick: () => repasar(0) }, 'Repasar' + (pendientes.length ? ' (' + pendientes.length + ')' : '')),
        h('button', { class: 'boton secundario', type: 'button', onClick: () => abrirTarjetaRepaso(null, 0) }, icono('mas'), 'Tarjeta'))),
    h('div', { class: 'botonera', style: { marginTop: '8px' } },
      h('button', { class: 'boton-texto', type: 'button', style: { fontSize: '15px' }, onClick: () => abrirPegarTarjetas(0) }, 'Pegar varias'),
      l.repasos.length ? h('button', { class: 'boton-texto', type: 'button', style: { fontSize: '15px', marginLeft: 'auto' }, onClick: () => { location.hash = '#/estudio/tarjetas'; } }, 'Ver todas (' + l.repasos.length + ')') : null)));
}

// ------------------------------------------------------------------ Materias
async function menuMateria(ma) {
  const l = E.libro, d = hoy();
  const pend = Est.paraRepasar(l, d, ma.Id).length;
  const v = await preguntar({ titulo: ma.Nombre, opciones: [
    { texto: 'Empezar pomodoro', valor: 'pomo', estilo: 'fuerte' },
    { texto: 'Nuevo examen o entrega', valor: 'examen' },
    { texto: 'Registrar horas', valor: 'horas' },
    { texto: 'Repasar sus tarjetas (' + pend + ' para hoy)', valor: 'repasar' },
    { texto: 'Nueva tarjeta de repaso', valor: 'tarjeta' },
    { texto: 'Editar materia', valor: 'editar' }] });
  switch (v) {
    case 'pomo':
      if (enCurso()) { toast('Ya hay un pomodoro en curso.'); irArriba(); return; }
      materiaElegida = ma.Id; empezar(ma.Id); irArriba(); break;
    case 'examen': abrirExamen(null, { materia: ma.Id }); break;
    case 'horas': abrirSesion(ma.Id); break;
    case 'repasar': repasar(ma.Id); break;
    case 'tarjeta': abrirTarjetaRepaso(null, ma.Id); break;
    case 'editar': abrirMateria(ma); break;
    default: break;
  }
}

function seccionMaterias() {
  const l = E.libro, d = hoy();
  const stats = Est.porMateria(l, d);
  if (!stats.length) return seccion('Materias', vacio('Sin materias', 'Cargá las materias que cursás para llevar las horas, los exámenes y el repaso de cada una.', () => abrirMateria(null), 'Agregar materia'));
  return seccion('Materias', grupo(...stats.map((st) => {
    const ma = st.Materia;
    const obj = ma.HorasSemana.signo > 0 ? ' de ' + Fmt.num(ma.HorasSemana, 0) + ' h' : '';
    const nota = ma.Nota !== null ? ' · ' + Fmt.num(ma.Nota, ma.Nota.eq(ma.Nota.redondear(0)) ? 0 : 2) : '';
    const apagada = ma.Estado === 'Aprobada' || ma.Estado === 'Abandonada';
    const t2 = Est.nombreEstado(ma.Estado) + nota + ' · esta semana ' + horas(st.MinutosSemana) + ' h' + obj + (st.RepasoPendiente ? ' · ' + st.RepasoPendiente + ' para repasar' : '');
    return fila({ punto: ma.ColorArgb ? colorCss(ma.ColorArgb) : VIOLETA, t1: ma.Nombre, t2, clase: apagada ? 'apagada' : '',
      derecha: h('span', { class: 'num' }, horas(st.MinutosTotal) + ' h'), derecha2: 'en total', onClick: () => menuMateria(ma) });
  })), { pie: 'Tocá una materia para empezar un pomodoro, cargar un examen o repasar sus tarjetas.' });
}

// ------------------------------------------------------------------ Últimos 14 días
function grafico() {
  const l = E.libro, cfg = l.config, d = hoy();
  const serie = Est.serieDiaria(l, d, 14);
  const metaDia = cfg.MetaHorasEstudio.signo > 0 ? Number(cfg.MetaHorasEstudio.div(D(7)).redondear(1).toString()) : 0;
  const valores = serie.map((x) => Math.round(x.minutos / 6) / 10);
  const tope = Math.max(metaDia, ...valores, 0.5);
  const total = serie.reduce((a, x) => a + x.minutos, 0);
  return seccion('Últimos 14 días', h('div', { class: 'cifra-caja' },
    h('div', { class: 'grafico-dias' },
      h('div', { class: 'barras', role: 'img', 'aria-label': 'Horas de estudio por día en los últimos 14 días' },
        metaDia > 0 ? h('div', { class: 'linea-meta', style: { bottom: (metaDia / tope * 100).toFixed(1) + '%' } }) : null,
        ...serie.map((x, i) => h('div', { class: 'col' + (x.fecha === d ? ' hoy' : '') },
          valores[i] > 0 ? h('span', { class: 'v', style: { bottom: 'calc(' + (valores[i] / tope * 100).toFixed(1) + '% + 3px)' } }, Fmt.num(valores[i], 1)) : null,
          h('i', { style: { height: (valores[i] / tope * 100).toFixed(1) + '%' } })))),
      h('div', { class: 'etiquetas' }, ...serie.map((x) => h('span', { class: x.fecha === d ? 'hoy' : '' }, x.fecha === d ? 'hoy' : String(F.dia(x.fecha)))))),
    h('div', { class: 'sub', style: { marginTop: '8px' } }, 'Horas por día · ' + horas(total) + ' h en total' + (metaDia > 0 ? ' · la línea punteada es tu meta diaria (' + Fmt.num(metaDia, 1) + ' h)' : ''))));
}

// ------------------------------------------------------------------ Pantalla
export function pantallaEstudio(params, rerender) {
  if (params[0] === 'tarjetas') return pantallaTarjetasRepaso(rerender);
  const l = E.libro, d = hoy();
  const planes = Est.planes(l, d);
  const agregar = async () => {
    const v = await preguntar({ titulo: 'Agregar', opciones: [
      { texto: 'Examen o entrega', valor: 'examen', estilo: 'fuerte' }, { texto: 'Registrar horas', valor: 'horas' },
      { texto: 'Materia', valor: 'materia' }, { texto: 'Tarjeta de repaso', valor: 'tarjeta' }, { texto: 'Varias tarjetas', valor: 'varias' }] });
    if (v === 'examen') abrirExamen(null); else if (v === 'horas') abrirSesion(materiaElegida || 0); else if (v === 'materia') abrirMateria(null);
    else if (v === 'tarjeta') abrirTarjetaRepaso(null, 0); else if (v === 'varias') abrirPegarTarjetas(0);
  };
  return vistaSecundaria('#/estudio', {
    titulo: 'Estudio',
    derecha: h('button', { class: 'boton-texto', type: 'button', onClick: agregar }, 'Agregar'),
    contenido: [
      l.config.Carrera.trim() ? h('p', { class: 'nota-pie', style: { margin: '-6px 20px 10px', fontSize: '15px' } }, l.config.Carrera.trim()) : null,
      h('section', { class: 'seccion', style: { marginTop: '4px' } }, tarjetaPomodoro(rerender)),
      h('section', { class: 'seccion' }, indicadores()),
      seccion('Próximos exámenes y entregas', planes.length ? grupo(...planes.map((p) => filaPlan(p, d)))
        : grupo(fila({ t1: 'No hay exámenes próximos', t2: 'Cargá parciales, finales y entregas y te armo el plan de horas.', multi: true, onClick: () => abrirExamen(null) })),
      { pie: planes.length ? 'Horas estudiadas desde el examen anterior de la misma materia.' : null }),
      seccionRepaso(),
      seccionMaterias(),
      grafico(),
    ],
  });
}

// ------------------------------------------------------------------ Todas las tarjetas
const estTarjetas = { materia: -1 };
function pantallaTarjetasRepaso(rerender) {
  const l = E.libro, d = hoy();
  const conTarjetas = [...new Set(l.repasos.map((r) => r.MateriaId))];
  const opciones = [{ valor: -1, texto: 'Todas', sub: String(l.repasos.length) },
    ...conTarjetas.map((id) => ({ valor: id, texto: id ? (l.materia(id) || { Nombre: '(borrada)' }).Nombre : 'Sin materia', sub: String(l.repasos.filter((r) => r.MateriaId === id).length) }))];
  if (!opciones.some((o) => o.valor === estTarjetas.materia)) estTarjetas.materia = -1;
  const lista = l.repasos.filter((r) => estTarjetas.materia === -1 || r.MateriaId === estTarjetas.materia)
    .sort((a, b) => (Math.floor(a.ProximaRevision) - Math.floor(b.ProximaRevision)) || (a.Id - b.Id));
  return vistaSecundaria('#/estudio/tarjetas', {
    titulo: 'Tarjetas de repaso', atras: 'Estudio',
    derecha: h('button', { class: 'boton-texto', type: 'button', onClick: () => abrirTarjetaRepaso(null, Math.max(0, estTarjetas.materia)) }, 'Agregar'),
    contenido: [
      h('div', { style: { padding: '0 16px' } }, chips(opciones, estTarjetas.materia, (v) => { estTarjetas.materia = v; rerender(); })),
      lista.length ? h('section', { class: 'seccion', style: { marginTop: '14px' } }, grupo(...lista.map((r) => fila({
        punto: colorCss(Est.colorRepaso(r.Tipo)), t1: r.Frente, t2: r.Dorso, t2una: true,
        derecha2: Math.floor(r.ProximaRevision) <= d ? 'para hoy' : Fmt.enDias(r.ProximaRevision, d), derecha: h('span', { class: 'caja-repaso' }, 'caja ' + r.Caja),
        onClick: () => abrirTarjetaRepaso(r) })))) : vacio('Sin tarjetas', 'Agregá preguntas para repasar.'),
    ],
  });
}
