// ============================================================================
//  Tablero estilo Trello y calendario (igual que src/Nucleo/Organizacion.vb)
// ============================================================================

import { F } from './fecha.js';
import { Per, Fmt } from './formato.js';
import { nuevo, clonar } from './modelo.js';
import { ordenarEstable } from './motor.js';
import { nombreTipoExamen } from './estudio.js';

export const TipoEvento = { Tarea: 0, Examen: 1, Vencimiento: 2, Cierre: 3, Ingreso: 4, GastoFijo: 5 };
export const COLORES_ETIQUETA = [-16411031, -14326805, -8635667, -2414729, -2349530, -2525434, -16215630, -10193781];

export function tareasDe(l, listaId, incluirArchivadas = false) {
  return ordenarEstable(l.tareas.filter((t) => t.ListaId === listaId && (incluirArchivadas || !t.Archivada)), (a, b) => (a.Orden - b.Orden) || (a.Id - b.Id));
}

export function listaFinal(l, tableroId) {
  const finales = l.listasDe(tableroId).filter((x) => x.EsFinal);
  return finales.length ? finales[finales.length - 1] : null;
}

export function primeraLista(l, tableroId) {
  const listas = l.listasDe(tableroId);
  return listas.find((x) => !x.EsFinal) || listas[0] || null;
}

function siguienteOrden(l, listaId) {
  const enLista = l.tareas.filter((t) => t.ListaId === listaId);
  return enLista.length === 0 ? 0 : Math.max(...enLista.map((t) => t.Orden)) + 1;
}

/** Nueva tarjeta al final de una lista. */
export function nuevaTarea(l, lista, titulo, fecha = null, hoy = F.hoy()) {
  const t = nuevo('Tarea', { Id: l.nuevoId(), TableroId: lista.TableroId, ListaId: lista.Id, Titulo: titulo.trim(), Fecha: fecha,
    Orden: siguienteOrden(l, lista.Id), Hecha: lista.EsFinal, Creada: hoy });
  if (t.Hecha) t.FechaHecha = hoy;
  l.tareas.push(t);
  return t;
}

/** Mueve una tarjeta a otra lista (o a otra posición). Devuelve la tarjeta nueva si era repetitiva y se completó. */
export function mover(l, t, listaDestino, indice, hoy) {
  const origen = t.ListaId;
  const destino = tareasDe(l, listaDestino.Id).filter((x) => x !== t);
  indice = Math.max(0, Math.min(indice, destino.length));
  destino.splice(indice, 0, t);
  t.ListaId = listaDestino.Id;
  t.TableroId = listaDestino.TableroId;
  destino.forEach((x, i) => { x.Orden = i; });
  if (origen !== listaDestino.Id) tareasDe(l, origen).forEach((x, i) => { x.Orden = i; });
  let nueva = null;
  if (listaDestino.EsFinal && !t.Hecha) {
    t.Hecha = true;
    t.FechaHecha = hoy;
    nueva = repetir(l, t, hoy);
  } else if (!listaDestino.EsFinal && t.Hecha) {
    t.Hecha = false;
    t.FechaHecha = null;
  }
  return nueva;
}

/** Marca como hecha (la pasa a la lista final si existe) o la vuelve a abrir. */
export function marcarHecha(l, t, hecha, hoy) {
  if (hecha === t.Hecha) return null;
  if (hecha) {
    const fin = listaFinal(l, t.TableroId);
    if (fin && fin.Id !== t.ListaId) return mover(l, t, fin, 0, hoy);
    t.Hecha = true;
    t.FechaHecha = hoy;
    return repetir(l, t, hoy);
  }
  const li = l.lista(t.ListaId);
  if (li && li.EsFinal) {
    const pri = primeraLista(l, t.TableroId);
    if (pri && pri.Id !== li.Id) { mover(l, t, pri, 0, hoy); return null; }
  }
  t.Hecha = false;
  t.FechaHecha = null;
  return null;
}

function repetir(l, t, hoy) {
  if (t.Repetir === 'Nunca' || t.Fecha === null) return null;
  const sig = siguiente(t.Fecha, t.Repetir, diaAncla(t));
  if (l.tareas.some((x) => x !== t && !x.Archivada && x.TableroId === t.TableroId && x.Titulo === t.Titulo && x.Fecha === sig)) return null;
  const pri = primeraLista(l, t.TableroId);
  if (!pri) return null;
  const n = clonar(t);
  n.Id = l.nuevoId();
  n.ListaId = pri.Id;
  n.Fecha = sig;
  n.Hecha = false;
  n.FechaHecha = null;
  n.Creada = hoy;
  n.Checklist = checklist(t).map((c) => '[ ] ' + c.Texto).join('\r\n');
  n.Orden = siguienteOrden(l, pri.Id);
  n.DiaRepeticion = t.Repetir === 'Mensual' || t.Repetir === 'Anual' ? diaAncla(t) : 0;
  l.tareas.push(n);
  return n;
}

/** Día del mes de la serie (mensual o anual). */
export function diaAncla(t) {
  if (t.DiaRepeticion >= 1 && t.DiaRepeticion <= 31) return t.DiaRepeticion;
  return t.Fecha !== null ? F.dia(t.Fecha) : 1;
}

/** Fecha siguiente de una serie (en mensual y anual respeta el día de la serie). */
export function siguiente(fecha, r, diaSerie = 0) {
  const dia = diaSerie >= 1 && diaSerie <= 31 ? diaSerie : F.dia(fecha);
  const f = Math.floor(fecha);
  switch (r) {
    case 'Diaria': return f + 1;
    case 'Semanal': return f + 7;
    case 'Mensual': return Per.diaEn(Per.sumar(Per.de(f), 1), dia);
    case 'Anual': return Per.diaEn(Per.sumar(Per.de(f), 12), dia);
    default: return f;
  }
}

export function textoRepeticion(r) {
  return { Diaria: 'todos los días', Semanal: 'todas las semanas', Mensual: 'todos los meses', Anual: 'todos los años' }[r] || '';
}

/** Fechas en que cae una tarea que se repite, entre dos fechas (incluye la de la tarjeta si está en el rango). */
export function fechasDeSerie(t, desde, hasta) {
  const res = [];
  if (t.Fecha === null) return res;
  const inicio = Math.floor(t.Fecha);
  const d1 = Math.floor(desde), d2 = Math.floor(hasta);
  if (d2 < inicio || d2 < d1) return res;
  switch (t.Repetir) {
    case 'Diaria': case 'Semanal': {
      const paso = t.Repetir === 'Diaria' ? 1 : 7;
      let d = inicio;
      if (d1 > d) d = inicio + Math.ceil((d1 - inicio) / paso) * paso;
      for (; d <= d2; d += paso) res.push(d);
      break;
    }
    case 'Mensual': case 'Anual': {
      const paso = t.Repetir === 'Mensual' ? 1 : 12;
      const dia = diaAncla(t);
      const p0 = Per.de(inicio);
      let k = 0;
      if (d1 > inicio) k = Math.max(0, Math.trunc(Per.diferencia(p0, Per.de(d1)) / paso) - 1);
      while (true) {
        const f = k === 0 ? inicio : Per.diaEn(Per.sumar(p0, k * paso), dia);
        if (f > d2) break;
        if (f >= d1) res.push(f);
        k++;
      }
      break;
    }
    default:
      if (inicio >= d1 && inicio <= d2) res.push(inicio);
  }
  return res;
}

// ------------------------------------------------------------------ Checklist
export function checklist(t) {
  const res = [];
  for (const linea of (t.Checklist || '').replace(/\r/g, '').split('\n')) {
    const s = linea.trim();
    if (!s.length) continue;
    if (s.toLowerCase().startsWith('[x]')) res.push({ Hecho: true, Texto: s.slice(3).trim() });
    else if (s.startsWith('[ ]') || s.startsWith('[]')) res.push({ Hecho: false, Texto: s.slice(s.startsWith('[]') ? 2 : 3).trim() });
    else res.push({ Hecho: false, Texto: s });
  }
  return res;
}

export function checklistATexto(items) {
  return items.filter((i) => i.Texto.trim().length > 0).map((i) => (i.Hecho ? '[x] ' : '[ ] ') + i.Texto.trim()).join('\r\n');
}

/** "vencida", "hoy", "pronto" (≤ 2 días) o "". */
export function estadoFecha(t, hoy) {
  if (t.Fecha === null || t.Hecha) return '';
  const dias = Math.floor(t.Fecha) - Math.floor(hoy);
  if (dias < 0) return 'vencida';
  if (dias === 0) return 'hoy';
  if (dias <= 2) return 'pronto';
  return '';
}

export function pendientes(l) { return l.tareas.filter((t) => !t.Hecha && !t.Archivada); }

export function vencidas(l, hoy) {
  return ordenarEstable(pendientes(l).filter((t) => t.Fecha !== null && Math.floor(t.Fecha) < Math.floor(hoy)), (a, b) => a.Fecha - b.Fecha);
}

// ------------------------------------------------------------------ Calendario
/** Todo lo que pasa entre dos fechas: tareas (con sus repeticiones), exámenes y (opcional) vencimientos, cierres y fijos. */
export function eventos(l, m, desde, hasta, verTareas, verEstudio, verFinanzas) {
  const res = [];
  const d1 = Math.floor(desde), d2 = Math.floor(hasta);
  if (verTareas) {
    for (const t of l.tareas.filter((x) => !x.Archivada && x.Fecha !== null)) {
      const repite = t.Repetir !== 'Nunca';
      const fechas = repite && !t.Hecha ? fechasDeSerie(t, d1, d2)
        : (Math.floor(t.Fecha) >= d1 && Math.floor(t.Fecha) <= d2 ? [Math.floor(t.Fecha)] : []);
      if (!fechas.length) continue;
      const tab = l.tablero(t.TableroId);
      const lista = l.lista(t.ListaId);
      const donde = (tab ? tab.Nombre : '') + (lista ? ' · ' + lista.Nombre : '');
      const color = t.ColorArgb !== 0 ? t.ColorArgb : (tab && tab.ColorArgb !== 0 ? tab.ColorArgb : -14326805);
      for (const f of fechas) {
        const proyectado = f !== Math.floor(t.Fecha);
        res.push({ Fecha: f, Hora: t.Hora, Titulo: t.Titulo, Tipo: TipoEvento.Tarea, ColorArgb: color, Hecho: t.Hecha && !proyectado,
          Movible: !proyectado, Referencia: t, Repite: repite, Proyectado: proyectado,
          Detalle: (repite ? 'Se repite ' + textoRepeticion(t.Repetir) + (donde.length ? ' · ' : '') : '') + donde });
      }
    }
  }
  if (verEstudio) {
    for (const ex of l.examenes.filter((x) => Math.floor(x.Fecha) >= d1 && Math.floor(x.Fecha) <= d2)) {
      const mat = l.materia(ex.MateriaId);
      res.push({ Fecha: Math.floor(ex.Fecha), Hora: ex.Hora, Titulo: nombreTipoExamen(ex.Tipo) + ': ' + (mat ? mat.Nombre : '(sin materia)'),
        Tipo: TipoEvento.Examen, ColorArgb: mat && mat.ColorArgb !== 0 ? mat.ColorArgb : -8635667, Hecho: ex.Rendido, Movible: true,
        Referencia: ex, Repite: false, Proyectado: false, Detalle: ex.Temas });
    }
  }
  if (verFinanzas && m) {
    for (const t of m.tarjetasActivas()) {
      for (let p = Per.sumar(Per.de(d1), -1); p <= Per.sumar(Per.de(d2), 2); p = Per.sumar(p, 1)) {
        const r = m.resumenDe(t, p);
        if (r.Vencimiento >= d1 && r.Vencimiento <= d2) {
          const pend = r.pendientePesos(m.Dolar);
          res.push({ Fecha: r.Vencimiento, Hora: '', Titulo: 'Vence ' + t.Nombre, Tipo: TipoEvento.Vencimiento,
            ColorArgb: t.ColorArgb !== 0 ? t.ColorArgb : -14326805, Hecho: pend.le('0.5'), Movible: false, Referencia: r, Repite: false, Proyectado: false,
            Detalle: (pend.gt('0.5') ? 'A pagar ' + Fmt.pesosR(pend) : 'Pagado') + ' · resumen de ' + Fmt.mesDe(p) });
        }
        if (r.Cierre >= d1 && r.Cierre <= d2) {
          res.push({ Fecha: r.Cierre, Hora: '', Titulo: 'Cierra ' + t.Nombre, Tipo: TipoEvento.Cierre,
            ColorArgb: t.ColorArgb !== 0 ? t.ColorArgb : -14326805, Hecho: false, Movible: false, Referencia: r, Repite: false, Proyectado: false,
            Detalle: 'Desde el día siguiente las compras van al resumen de ' + Fmt.mesDe(Per.sumar(p, 1)) });
        }
      }
    }
    for (const oc of m.ocurrencias(d1, d2)) {
      if (oc.Rec.TarjetaId !== 0) continue;
      const ing = oc.Rec.Tipo === 'Ingreso';
      res.push({ Fecha: oc.Fecha, Hora: '', Titulo: oc.Rec.Descripcion + ' ' + Fmt.monto(oc.Rec.Monto, oc.Rec.Moneda),
        Tipo: ing ? TipoEvento.Ingreso : TipoEvento.GastoFijo, ColorArgb: ing ? -16411031 : -10193781, Hecho: !oc.Pendiente,
        Movible: false, Referencia: oc, Repite: false, Proyectado: false, Detalle: ing ? 'Ingreso fijo' : 'Gasto fijo' });
    }
  }
  return ordenarEstable(res, (a, b) => (a.Fecha - b.Fecha) || compararOrdinalHora(a.Hora, b.Hora) || (a.Tipo - b.Tipo));
}

/** ThenBy(Hora vacía = "99") con la comparación de textos de .NET (las horas son "HH:mm"). */
function compararOrdinalHora(a, b) {
  const x = a ? a : '99', y = b ? b : '99';
  return x < y ? -1 : x > y ? 1 : 0;
}
