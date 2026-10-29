// ============================================================================
//  Inicio: cuánto te queda después de pagar las tarjetas, qué vence, con qué
//  tarjeta conviene comprar hoy, los avisos y la agenda de hoy.
// ============================================================================

import { h, icono, colorCss, textoMonto, seccion, grupo, fila, toast } from '../ui.js';
import { E, hoy } from '../estado.js';
import { vistaPrincipal, saludo, fechaLargaCap, Fmt } from './comun.js';
import { Per } from '../../nucleo/formato.js';
import { EstadoResumen } from '../../nucleo/motor.js';
import { Asesor, AccionAviso } from '../../nucleo/asesor.js';
import { eventos, vencidas } from '../../nucleo/organizacion.js';

import { S, textoCorto, activa, sincronizar } from '../sincro.js';
import { abrirPago, abrirMovimiento, registrarFijo, abrirResumen } from '../formularios/movimiento.js';
import { abrirEvento } from './agenda.js';
import { guardar } from '../estado.js';

export const avisosAbiertos = new Set();

export function pillSync() {
  const estado = !activa() ? '' : S.estado;
  const clase = estado === 'error' ? 'error' : estado === 'sincronizando' ? 'trabajando' : estado === 'al-dia' ? 'ok' : '';
  const ico = estado === 'error' ? 'nubeError' : estado === 'sincronizando' ? 'sincronizando' : estado === 'al-dia' ? 'nubeOk' : 'nube';
  return h('button', { class: 'pill-sync ' + clase, type: 'button', 'aria-label': 'Sincronización: ' + textoCorto(), onClick: async () => {
    if (!activa() || S.estado === 'error') { location.hash = '#/ajustes'; return; }
    await sincronizar();
    if (S.estado === 'al-dia') toast('Sincronizado: el iPhone y la PC tienen lo mismo.');
    else if (S.mensaje) toast(S.mensaje, { error: S.estado === 'error' });
  } }, icono(ico), textoCorto());
}

/** Resumen "a seguir" de cada tarjeta: el primero con saldo pendiente, o el abierto. */
export function talonesTarjetas() {
  const m = E.motor, l = E.libro, d = hoy();
  const res = [];
  for (const t of m.tarjetasActivas()) {
    const pa = m.periodoAbierto(t);
    let elegido = null;
    for (let q = l.config.PeriodoInicial; q <= pa; q = Per.sumar(q, 1)) {
      const r = m.resumenDe(t, q);
      const est = r.estado(d);
      if ((est === EstadoResumen.Cerrado || est === EstadoResumen.Vencido) && r.pendientePesos(m.Dolar).signo > 0) { elegido = r; break; }
    }
    let abierto = false;
    if (!elegido) {
      const r = m.resumenDe(t, pa);
      if (r.TieneConsumos || m.estimadoMensual(t).signo > 0) { elegido = r; abierto = true; }
    }
    if (elegido) res.push({ t, r: elegido, abierto });
  }
  return res.sort((a, b) => a.r.Vencimiento - b.r.Vencimiento);
}

function talon({ t, r, abierto }) {
  const m = E.motor, d = hoy();
  const dias = r.Vencimiento - d;
  const est = r.estado(d);
  const urgencia = est === EstadoResumen.Vencido || (!abierto && dias <= 3) ? ' urgente' : (!abierto && dias <= 10 ? ' pronto' : '');
  let montos, detalle;
  if (abierto) {
    montos = [h('span', null, textoMonto(m.totalEstimadoCierre(r), 'ARS', true))];
    detalle = 'Estimado al cierre (' + Fmt.fechaDia(r.Cierre) + ') · vence ' + Fmt.fechaCorta(r.Vencimiento);
  } else {
    montos = [h('span', null, textoMonto(r.PendienteARS, 'ARS', true)), r.PendienteUSD.signo > 0 ? h('span', { class: 'usd' }, '+ ' + textoMonto(r.PendienteUSD, 'USD')) : null];
    detalle = (est === EstadoResumen.Vencido ? 'Venció el ' : 'Vence el ') + Fmt.fechaDia(r.Vencimiento) + (r.RealARS === null ? ' · sin total real' : '');
  }
  const ladoNum = est === EstadoResumen.Vencido ? '!' : dias <= 0 ? '0' : String(dias);
  const ladoTxt = est === EstadoResumen.Vencido ? 'vencido' : dias === 0 ? 'vence hoy' : dias === 1 ? 'día' : 'días';
  return h('button', { class: 'talon' + urgencia, type: 'button', style: { '--color-tarjeta': colorCss(t.ColorArgb) },
    onClick: () => { location.hash = '#/tarjeta/' + t.Id + '/' + r.Periodo; } },
  h('div', { class: 'cuerpo' },
    h('div', { class: 'nombre' }, t.Nombre, abierto ? h('span', { class: 'sec', style: { fontWeight: 400 } }, ' · en curso') : null),
    h('div', { class: 'montos' }, ...montos),
    h('div', { class: 'detalle' }, detalle)),
  h('div', { class: 'lado' }, h('div', { class: 'dias' }, ladoNum), h('div', { class: 'dias-texto' }, ladoTxt)));
}

function mejorTarjeta() {
  const m = E.motor;
  const ts = m.tarjetasActivas();
  if (ts.length < 2) return null;
  let mejor = null;
  for (const t of ts) {
    const dias = m.diasFinanciacion(t);
    if (!mejor || dias > mejor.dias) mejor = { t, dias, venc: m.vencimiento(t, m.periodoAbierto(t)) };
  }
  return mejor;
}

/** Acción de un aviso (según lo que pide). */
export function accionAviso(a) {
  const l = E.libro;
  switch (a.Accion) {
    case AccionAviso.PagarResumen: {
      const t = l.tarjeta(a.TarjetaId);
      if (t) abrirPago(E.motor.resumenDe(t, a.Periodo));
      break;
    }
    case AccionAviso.VerTarjeta: location.hash = '#/tarjeta/' + a.TarjetaId + '/' + a.Periodo; break;
    case AccionAviso.CargarTotalReal: { const t = l.tarjeta(a.TarjetaId); if (t) abrirResumen(t, a.Periodo); break; }
    case AccionAviso.RegistrarFijo: if (a.Ocurrencia) registrarFijo(a.Ocurrencia); break;
    case AccionAviso.VerCuentas: location.hash = '#/cuentas'; break;
    case AccionAviso.VerFijos: location.hash = '#/fijos'; break;
    case AccionAviso.VerHistorial: location.hash = '#/historial'; break;
    case AccionAviso.VerProyeccion: location.hash = '#/historial'; break;
    default: break;
  }
}

export function filaAviso(a, alCambiar) {
  const abierto = avisosAbiertos.has(a.Titulo);
  const acciones = h('div', { class: 'acciones-aviso' },
    a.Accion !== AccionAviso.Ninguna && a.TextoAccion ? h('button', { class: 'boton chico suave', type: 'button', onClick: (e) => { e.stopPropagation(); accionAviso(a); } }, a.TextoAccion) : null,
    a.Clave ? h('button', { class: 'boton chico secundario', type: 'button', onClick: async (e) => {
      e.stopPropagation();
      E.libro.ocultarAviso(a.Clave);
      await guardar();
      toast('Aviso oculto');
    } }, 'Ocultar') : null);
  const el = h('div', { class: 'fila aviso tocable nivel-' + a.Nivel + (abierto ? ' abierto' : ''), role: 'button', tabindex: '0' },
    h('span', { class: 'marca-nivel' }),
    h('div', { class: 'textos' }, h('div', { class: 't1' }, a.Titulo), h('div', { class: 't2' }, a.Detalle), abierto ? acciones : null));
  el.addEventListener('click', () => {
    if (avisosAbiertos.has(a.Titulo)) avisosAbiertos.delete(a.Titulo); else avisosAbiertos.add(a.Titulo);
    if (alCambiar) alCambiar();
  });
  return el;
}

export function pantallaInicio(_p, rerender) {
  const m = E.motor, l = E.libro, d = hoy();
  const disp = m.disponibleARS();
  const usd = m.disponibleUSD();
  const p = m.periodoAPagar();
  const aPagar = m.aPagarHasta(p);
  const fin = Per.ultimoDia(p);
  const cobros = m.fijosPendientes(fin, true);
  const pagosFijos = m.fijosPendientes(fin, false);
  const libre = m.libreDespuesDePagar(p);

  // ---- Lo principal: lo que queda libre
  const negativo = libre.signo < 0;
  const heroe = h('section', { class: 'heroe' },
    h('p', { class: 'frase' }, negativo ? 'Para pagar las tarjetas de ' + Fmt.mesDe(p) + ' te faltan' : 'Después de pagar las tarjetas de ' + Fmt.mesDe(p) + ' te quedan'),
    h('div', { class: 'cifra' + (negativo ? ' negativa' : '') }, h('span', { class: 'signo' }, '$'), Fmt.num(libre.abs(), 0)),
    h('div', { class: 'desglose' },
      h('span', { class: 'dato' }, 'Tenés', h('b', null, textoMonto(disp, 'ARS', true))),
      usd.signo !== 0 ? h('span', { class: 'dato' }, 'y', h('b', null, textoMonto(usd, 'USD'))) : null,
      cobros.signo > 0 ? h('span', { class: 'dato' }, 'Cobrás', h('b', null, textoMonto(cobros, 'ARS', true))) : null,
      aPagar.signo > 0 ? h('span', { class: 'dato' }, 'Tarjetas', h('b', null, textoMonto(aPagar, 'ARS', true))) : null,
      pagosFijos.signo > 0 ? h('span', { class: 'dato' }, 'Fijos', h('b', null, textoMonto(pagosFijos, 'ARS', true))) : null));

  // ---- Banner de la nube (sólo si hay algo que hacer)
  let banner = null;
  if (activa() && S.estado === 'error') {
    banner = h('div', { class: 'banner' }, icono('nubeError'),
      h('div', null, S.mensaje, h('div', null, h('button', { class: 'boton chico peligro', type: 'button', onClick: () => { location.hash = '#/ajustes'; } }, 'Revisar la sincronización'))));
  }

  // ---- Vencimientos
  const talones = talonesTarjetas();
  const secVenc = talones.length
    ? seccion('Tarjetas', h('div', { class: 'talones' }, ...talones.map(talon)), { enlace: 'Ver todas', alEnlace: () => { location.hash = '#/tarjetas'; } })
    : null;

  // ---- Con qué tarjeta conviene
  const mejor = mejorTarjeta();
  const secMejor = mejor ? h('section', { class: 'seccion', style: { marginTop: '12px' } },
    h('button', { class: 'conviene', type: 'button', style: { '--color-tarjeta': colorCss(mejor.t.ColorArgb) }, onClick: () => abrirMovimiento({ tipo: 'Gasto', tarjetaId: mejor.t.Id }) },
      h('span', { class: 'marca' }),
      h('span', { class: 'texto' }, 'Para comprar hoy conviene ', h('b', null, mejor.t.Nombre), ': lo pagás el ' + Fmt.fechaDia(mejor.venc) + ' (' + mejor.dias + ' días).'))) : null;

  // ---- Avisos
  const avisos = new Asesor(m).generar();
  const visibles = avisos.slice(0, 4);
  const secAvisos = avisos.length ? seccion('Avisos', grupo(...visibles.map((a) => filaAviso(a, rerender))),
    { enlace: avisos.length > 4 ? 'Ver los ' + avisos.length : null, alEnlace: () => { location.hash = '#/avisos'; } }) : null;

  // ---- Agenda de hoy y mañana
  const evs = eventos(l, m, d, d + 1, l.config.CalVerTareas, l.config.CalVerEstudio, l.config.CalVerFinanzas);
  const atrasadas = vencidas(l, d);
  const filasAgenda = [];
  for (const ev of evs) {
    filasAgenda.push(fila({ t1: ev.Titulo, t2: (ev.Fecha === d ? 'Hoy' : 'Mañana') + (ev.Hora ? ' · ' + ev.Hora : '') + (ev.Proyectado ? ' · se repite' : ''),
      punto: colorCss(ev.ColorArgb), clase: ev.Hecho ? 'hecha' : '', onClick: () => abrirEvento(ev) }));
  }
  if (atrasadas.length) {
    filasAgenda.unshift(fila({ t1: atrasadas.length === 1 ? '1 tarea atrasada' : atrasadas.length + ' tareas atrasadas', t2: atrasadas.slice(0, 3).map((t) => t.Titulo).join(' · '),
      punto: 'var(--rojo)', chevron: true, onClick: () => { location.hash = '#/agenda/tablero'; } }));
  }
  const secAgenda = seccion('Hoy y mañana', filasAgenda.length ? grupo(...filasAgenda) : grupo(fila({ t1: 'Nada agendado', t2: 'Tocá + en la agenda para sumar algo.', onClick: () => { location.hash = '#/agenda'; } })),
    { enlace: 'Agenda', alEnlace: () => { location.hash = '#/agenda'; } });

  return vistaPrincipal('#/inicio', {
    titulo: saludo(),
    sub: fechaLargaCap(d),
    derecha: pillSync(),
    contenido: [banner, heroe, secVenc, secMejor, secAvisos, secAgenda],
  });
}
