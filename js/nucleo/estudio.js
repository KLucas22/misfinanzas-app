// ============================================================================
//  Estudio: horas, racha, plan para cada examen y repaso espaciado (Estudio.vb)
// ============================================================================

import { Dec, D, CERO } from './decimal.js';
import { F } from './fecha.js';
import { Fmt } from './formato.js';
import { nuevo } from './modelo.js';
import { ordenarEstable, compararTexto } from './motor.js';

/** Días hasta el próximo repaso según la caja (Leitner). */
export const INTERVALOS_CAJA = [0, 1, 3, 7, 14, 30];

export function nombreTipoExamen(t) {
  return { Parcial: 'Parcial', Final: 'Final', Recuperatorio: 'Recuperatorio', TrabajoPractico: 'Trabajo práctico', Entrega: 'Entrega', Coloquio: 'Coloquio' }[t] || 'Examen';
}

export function nombreEstado(e) {
  return { Cursando: 'Cursando', Regular: 'Regular (final pendiente)', Aprobada: 'Aprobada', Pendiente: 'Por cursar' }[e] || 'Abandonada';
}

export function nombreRepaso(t) {
  return { MuyTomado: 'Muy tomado', Distincion: 'Distinción clave', Mnemotecnia: 'Regla mnemotécnica', Trampa: 'Trampa típica' }[t] || 'Concepto';
}

export function colorRepaso(t) {
  return { MuyTomado: -2349530, Distincion: -3503612, Mnemotecnia: -15293622, Trampa: -8635667 }[t] || -10193781;
}

export function horasSugeridas(t) {
  return D({ Final: 20, Parcial: 12, Recuperatorio: 10, Coloquio: 8 }[t] || 6);
}

/** resultado: 0 = no la sabía, 1 = dudé, 2 = la sabía. */
export function responder(t, resultado, hoy) {
  let caja = Math.max(1, Math.min(5, t.Caja));
  const h = Math.floor(hoy);
  if (resultado === 2) {
    caja = Math.min(5, caja + 1);
    t.Aciertos++;
    t.ProximaRevision = h + INTERVALOS_CAJA[caja];
  } else if (resultado === 1) {
    t.ProximaRevision = h + Math.max(1, Math.trunc(INTERVALOS_CAJA[caja] / 2));
  } else {
    caja = 1;
    t.Errores++;
    t.ProximaRevision = h + 1;
  }
  t.Caja = caja;
  t.UltimaRevision = h;
}

export function paraRepasar(l, hoy, materiaId = 0, tipo = null) {
  return ordenarEstable(l.repasos.filter((r) => Math.floor(r.ProximaRevision) <= Math.floor(hoy) && (materiaId === 0 || r.MateriaId === materiaId) && (tipo === null || r.Tipo === tipo)),
    (a, b) => (a.Caja - b.Caja) || (a.ProximaRevision - b.ProximaRevision) || (a.Id - b.Id));
}

export function inicioSemana(d) {
  const dif = (F.diaSemana(d) + 6) % 7;   // lunes = 0
  return Math.floor(d) - dif;
}

export function minutos(l, desde, hasta, materiaId = 0) {
  let s = 0;
  for (const x of l.sesiones) {
    const f = Math.floor(x.Inicio);
    if (f >= Math.floor(desde) && f <= Math.floor(hasta) && (materiaId === 0 || x.MateriaId === materiaId)) s += x.Minutos;
  }
  return s;
}

export function minutosSemana(l, hoy, materiaId = 0) { return minutos(l, inicioSemana(hoy), hoy, materiaId); }

export function racha(l, hoy) {
  const dias = new Set(l.sesiones.filter((s) => s.Minutos > 0).map((s) => Math.floor(s.Inicio)));
  let d = Math.floor(hoy);
  if (!dias.has(d)) d -= 1;
  let n = 0;
  while (dias.has(d)) { n++; d--; }
  return n;
}

export function serieDiaria(l, hoy, dias) {
  const res = [];
  for (let i = dias - 1; i >= 0; i--) {
    const d = Math.floor(hoy) - i;
    res.push({ fecha: d, minutos: minutos(l, d, d) });
  }
  return res;
}

function ordenEstado(e) { return { Cursando: 0, Regular: 1, Pendiente: 2, Aprobada: 3 }[e] ?? 4; }

export function porMateria(l, hoy) {
  const ini = inicioSemana(hoy);
  const res = l.materias.map((ma) => ({
    Materia: ma, MinutosSemana: minutos(l, ini, hoy, ma.Id),
    MinutosTotal: l.sesiones.filter((s) => s.MateriaId === ma.Id).reduce((a, s) => a + s.Minutos, 0),
    RepasoPendiente: l.repasos.filter((r) => r.MateriaId === ma.Id && Math.floor(r.ProximaRevision) <= Math.floor(hoy)).length }));
  return ordenarEstable(res, (a, b) => (ordenEstado(a.Materia.Estado) - ordenEstado(b.Materia.Estado)) || compararTexto(a.Materia.Nombre, b.Materia.Nombre));
}

/** Próximos exámenes con las horas ya estudiadas y el ritmo necesario. */
export function planes(l, hoy) {
  const res = [];
  const h = Math.floor(hoy);
  const proximos = ordenarEstable(l.examenes.filter((x) => !x.Rendido && Math.floor(x.Fecha) >= h), (a, b) => a.Fecha - b.Fecha);
  for (const ex of proximos) {
    const p = { Examen: ex, Materia: l.materia(ex.MateriaId), DiasRestantes: Math.floor(ex.Fecha) - h };
    p.HorasObjetivo = ex.HorasObjetivo.signo > 0 ? ex.HorasObjetivo : horasSugeridas(ex.Tipo);
    let desde = Math.floor(ex.Fecha) - 45;
    const anteriores = ordenarEstable(l.examenes.filter((x) => x !== ex && x.MateriaId === ex.MateriaId && Math.floor(x.Fecha) < Math.floor(ex.Fecha)), (a, b) => b.Fecha - a.Fecha);
    const anterior = anteriores[0] || null;
    if (anterior && Math.floor(anterior.Fecha) + 1 > desde) desde = Math.floor(anterior.Fecha) + 1;
    p.HorasHechas = D(minutos(l, desde, h, ex.MateriaId)).div(D(60)).redondear(1);
    const falta = Dec.max(CERO, p.HorasObjetivo.menos(p.HorasHechas));
    p.MinutosPorDia = falta.por(D(60)).div(D(Math.max(1, p.DiasRestantes))).techo().aEntero();
    p.Progreso = p.HorasObjetivo.signo <= 0 ? D(1) : Dec.min(D(1), p.HorasHechas.div(p.HorasObjetivo));
    res.push(p);
  }
  return res;
}

export function promedio(l) {
  const notas = l.materias.filter((m) => m.Estado === 'Aprobada' && m.Nota !== null).map((m) => m.Nota);
  if (!notas.length) return null;
  return Dec.promedio(notas).redondear(2);
}

export function aprobadas(l) { return l.materias.filter((m) => m.Estado === 'Aprobada').length; }

/** "Pregunta | Respuesta" por renglón. Devuelve las tarjetas creadas. */
export function importarTarjetas(l, texto, materiaId, tipo, hoy) {
  const res = [];
  for (const linea of (texto || '').replace(/\r/g, '').split('\n')) {
    const s = linea.trim();
    if (!s) continue;
    let partes = null;
    for (const sep of ['|', '\t', ' - ', ';']) {
      const i = s.indexOf(sep);
      if (i > 0) { partes = [s.slice(0, i).trim(), s.slice(i + sep.length).trim()]; break; }
    }
    if (!partes || !partes[0] || !partes[1]) continue;
    const frente = partes[0];
    if (l.repasos.some((r) => r.MateriaId === materiaId && Fmt.normalizar(r.Frente) === Fmt.normalizar(frente))) continue;
    const t = nuevo('Repaso', { Id: l.nuevoId(), MateriaId: materiaId, Frente: frente, Dorso: partes[1], Tipo: tipo, ProximaRevision: Math.floor(hoy), Creada: Math.floor(hoy) });
    l.repasos.push(t);
    res.push(t);
  }
  return res;
}
