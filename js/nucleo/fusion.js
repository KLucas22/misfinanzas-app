// ============================================================================
//  Fusión de tres vías de dos copias de datos.xml (igual que Fusion en
//  Sincronizacion.vb). Trabaja sobre los elementos XML, así conserva todo lo que
//  la PC escriba aunque el iPhone no lo conozca.
// ============================================================================

import { Dec } from './decimal.js';
import { F } from './fecha.js';
import { Fmt } from './formato.js';
import { Elemento } from './xml.js';

/** Secciones conocidas, en el orden en que se escriben (contenedor, elemento). */
export const SECCIONES_XML = [
  ['Cuentas', 'Cuenta'], ['Tarjetas', 'Tarjeta'], ['Resumenes', 'Resumen'], ['Fijos', 'Fijo'], ['Categorias', 'Categoria'], ['Cierres', 'Cierre'],
  ['Movimientos', 'Movimiento'], ['Tableros', 'Tablero'], ['Listas', 'Lista'], ['Tareas', 'Tarea'], ['Materias', 'Materia'], ['Examenes', 'Examen'],
  ['Sesiones', 'Sesion'], ['Repasos', 'Repaso'], ['Metas', 'Meta'], ['Mercado', 'Dato'], ['Dispositivos', 'Dispositivo']];

/** Preferencias de cada dispositivo: no viajan (cada uno conserva las suyas). */
export const ATRIBUTOS_LOCALES = ['VentanaAncho', 'VentanaAlto', 'VentanaMaximizada', 'ModoTema', 'PantallaInicio',
  'MenuColapsado', 'CalVerTareas', 'CalVerEstudio', 'CalVerFinanzas', 'TableroActual'];

export class ResultadoFusion {
  constructor() {
    this.Doc = null;
    this.NuevosRemoto = 0; this.ModificadosRemoto = 0; this.BorradosRemoto = 0;
    this.NuevosLocal = 0; this.ModificadosLocal = 0; this.BorradosLocal = 0;
    this.Conflictos = [];
  }
  get CambiosRemotos() { return this.NuevosRemoto + this.ModificadosRemoto + this.BorradosRemoto; }
  get CambiosLocales() { return this.NuevosLocal + this.ModificadosLocal + this.BorradosLocal; }
  textoRemoto() {
    const partes = [];
    if (this.NuevosRemoto > 0) partes.push(Fmt.plural(this.NuevosRemoto, 'nuevo', 'nuevos'));
    if (this.ModificadosRemoto > 0) partes.push(Fmt.plural(this.ModificadosRemoto, 'modificado', 'modificados'));
    if (this.BorradosRemoto > 0) partes.push(Fmt.plural(this.BorradosRemoto, 'borrado', 'borrados'));
    return partes.join(', ');
  }
}

export function atr(x, nombre) {
  if (!x) return '';
  const v = x.attr(nombre);
  return v === null ? '' : v;
}

const ordinal = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Identidad de una entidad dentro de su sección. */
export function clave(item, x) {
  switch (item) {
    case 'Resumen': return atr(x, 'TarjetaId') + '|' + atr(x, 'Periodo');
    case 'Categoria': return atr(x, 'Nombre').trim().toLowerCase();
    case 'Cierre': return atr(x, 'Periodo');
    case 'Dato': return atr(x, 'Clave').toLowerCase();
    case 'Dispositivo': return atr(x, 'Ranura');
    default: break;
  }
  const id = atr(x, 'Id');
  if (id.length > 0) return id;
  return [...x.attrs].sort((a, b) => ordinal(a[0], b[0])).map((a) => a[0] + '=' + a[1]).join('|');
}

function esNumero(s) {
  for (const ch of s) if (!(/\p{Nd}/u.test(ch) || ch === '.' || ch === '-' || ch === 'E' || ch === 'e' || ch === '+')) return false;
  return s.length > 0 && /\p{Nd}/u.test(s[s.length - 1]);
}

function sinHoraCero(s) {
  if (s.length === 19 && (s.endsWith('T00:00:00') || s.endsWith(' 00:00:00'))) return s.slice(0, 10);
  return s;
}

/** Dos valores son iguales aunque estén escritos distinto (1500 = 1500.00; fecha con hora 00:00:00 = fecha). */
export function mismoValor(a, b) {
  a = a || ''; b = b || '';
  if (a === b) return true;
  if (!a.length || !b.length) return false;
  if (esNumero(a) && esNumero(b)) {
    const da = Dec.intentar(a), db = Dec.intentar(b);
    if (da !== null && db !== null) return da.eq(db);
  }
  return sinHoraCero(a) === sinHoraCero(b);
}

function nombres(...xs) {
  const res = [];
  const vistos = new Set();
  for (const x of xs) {
    if (!x) continue;
    for (const [n] of x.attrs) if (!vistos.has(n)) { vistos.add(n); res.push(n); }
  }
  return res;
}

/** Misma entidad con los mismos valores (ignorando atributos indicados). */
export function mismaEntidad(a, b, ignorar = null) {
  if (!a || !b) return !a && !b;
  for (const n of nombres(a, b)) {
    if (ignorar && ignorar.has(n)) continue;
    if (!mismoValor(atr(a, n), atr(b, n))) return false;
  }
  return true;
}

function contenedores(raiz) {
  const res = SECCIONES_XML.map((s) => s[0]);
  if (raiz) {
    for (const e of raiz.hijos) {
      const n = e.nombre;
      if (n !== 'Configuracion' && !res.includes(n) && e.hijos.length > 0) res.push(n);
    }
  }
  return res;
}

function itemDe(contenedor, ...raices) {
  const conocida = SECCIONES_XML.find((s) => s[0] === contenedor);
  if (conocida) return conocida[1];
  for (const r of raices) {
    if (!r) continue;
    const c = r.hijo(contenedor);
    if (c && c.hijos.length > 0) return c.hijos[0].nombre;
  }
  return '';
}

function mapa(raiz, contenedor, item, orden) {
  const res = new Map();
  if (!raiz) return res;
  const c = raiz.hijo(contenedor);
  if (!c) return res;
  for (const x of c.hijosLlamados(item)) {
    const k = clave(item, x);
    if (res.has(k)) continue;   // repetido dentro del mismo archivo: queda el primero
    res.set(k, x);
    if (orden) orden.push(k);
  }
  return res;
}

function describir(item, x) {
  let nombre = atr(x, 'Descripcion');
  if (!nombre.length) nombre = atr(x, 'Titulo');
  if (!nombre.length) nombre = atr(x, 'Nombre');
  if (!nombre.length) nombre = atr(x, 'Clave');
  return item + (nombre.length > 0 ? ' «' + nombre + '»' : ' ' + clave(item, x));
}

function entero(s) { return /^\s*[+-]?\d+\s*$/.test(s || '') ? parseInt(s, 10) : 0; }

function valor3(bv, lv, rv, alChocar) {
  if (mismoValor(lv, rv)) return lv;
  if (mismoValor(lv, bv)) return rv;
  if (mismoValor(rv, bv)) return lv;
  if (alChocar) alChocar();
  return lv;
}

function unirListas(a, b) {
  const res = [];
  for (const s of ((a || '') + '|' + (b || '')).split('|')) if (s.length > 0 && !res.includes(s)) res.push(s);
  while (res.length > 200) res.shift();
  return res.join('|');
}

/**
 * Fusiona "local" y "remoto" sabiendo que los dos salieron de "base" (raíces de los documentos).
 * Si base es null se toma vacía: se unen las dos copias y, si chocan, gana local.
 * "ahora" es la fecha y hora para el atributo Guardado.
 */
export function fusionar(raizB, raizL, raizR, ahora = F.ahora()) {
  const res = new ResultadoFusion();
  const raiz = new Elemento('MisFinanzas');
  for (const n of nombres(raizL, raizR)) {
    if (n === 'Version' || n === 'ProximoId' || n === 'Revision') {
      raiz.fijar(n, String(Math.max(entero(atr(raizL, n)), entero(atr(raizR, n)))));
    } else if (n === 'Guardado') {
      raiz.fijar(n, F.textoGuardado(ahora));
    } else {
      const v = valor3(atr(raizB, n), atr(raizL, n), atr(raizR, n), null);
      if (v.length > 0) raiz.fijar(n, v);
    }
  }
  // ---- Configuración
  const cfgB = raizB ? raizB.hijo('Configuracion') : null;
  const cfgL = raizL.hijo('Configuracion'), cfgR = raizR.hijo('Configuracion');
  if (cfgL || cfgR) {
    const cfg = new Elemento('Configuracion');
    for (const n of nombres(cfgL, cfgR, cfgB)) {
      const bv = atr(cfgB, n), lv = atr(cfgL, n), rv = atr(cfgR, n);
      let v;
      if (ATRIBUTOS_LOCALES.includes(n)) {
        v = cfgL && cfgL.tiene(n) ? lv : rv;
      } else if (n === 'AvisosOcultos') {
        v = unirListas(lv, rv);
      } else if (n === 'MercadoActualizado') {
        // Datos de mercado: queda la descarga más nueva (sin avisar: se actualizan solos)
        v = ordinal(lv, rv) >= 0 ? lv : rv;
      } else if (n === 'DolarMEP' || n === 'DolarTarjeta' || n === 'FechaCotizacion') {
        // Cotizaciones: si cambiaron en los dos, quedan las más nuevas
        let choque = false;
        v = valor3(bv, lv, rv, () => { choque = true; });
        if (choque && ordinal(atr(cfgR, 'FechaCotizacion'), atr(cfgL, 'FechaCotizacion')) > 0) v = rv;
      } else {
        let choque = false;
        v = valor3(bv, lv, rv, () => { choque = true; });
        if (choque) res.Conflictos.push('Configuración: «' + n + '» cambió en los dos dispositivos (quedó el valor de este).');
      }
      if (v.length > 0) cfg.fijar(n, v);
    }
    raiz.hijos.push(cfg);
  }
  // ---- Secciones
  const conts = contenedores(raizL);
  for (const c of contenedores(raizR)) if (!conts.includes(c)) conts.push(c);
  for (const cont of conts) {
    const item = itemDe(cont, raizL, raizR, raizB);
    if (!item.length) continue;
    const ordenL = [], ordenR = [];
    const mB = mapa(raizB, cont, item, null);
    const mL = mapa(raizL, cont, item, ordenL);
    const mR = mapa(raizR, cont, item, ordenR);
    const salida = new Elemento(cont);
    const claves = ordenL.concat(ordenR.filter((k) => !mL.has(k)));
    for (const k of claves) {
      const x = fusionarEntidad(item, mB.get(k) || null, mL.get(k) || null, mR.get(k) || null, res);
      if (x) salida.hijos.push(x);
    }
    if (salida.hijos.length > 0 || raizL.hijo(cont) || raizR.hijo(cont)) raiz.hijos.push(salida);
  }
  res.Doc = raiz;
  return res;
}

function fusionarEntidad(item, b, lo, r, res) {
  if (!lo && !r) return null;
  if (!b) {
    if (!r) { res.NuevosLocal++; return lo.clonar(); }
    if (!lo) { res.NuevosRemoto++; return r.clonar(); }
    if (mismaEntidad(lo, r)) return lo.clonar();
    return fusionarAtributos(item, null, lo, r, res);
  }
  if (!lo) {
    // La borraste acá
    if (!r || mismaEntidad(r, b)) {
      if (r) res.BorradosLocal++;
      return null;
    }
    res.Conflictos.push(describir(item, r) + ': la borraste en este dispositivo pero se modificó en el otro; se conserva.');
    res.ModificadosRemoto++;
    return r.clonar();
  }
  if (!r) {
    // Se borró en el otro dispositivo
    if (mismaEntidad(lo, b)) { res.BorradosRemoto++; return null; }
    res.Conflictos.push(describir(item, lo) + ': se borró en el otro dispositivo pero la modificaste acá; se conserva.');
    return lo.clonar();
  }
  const cambioL = !mismaEntidad(lo, b);
  const cambioR = !mismaEntidad(r, b);
  if (!cambioR) {
    if (cambioL) res.ModificadosLocal++;
    return lo.clonar();
  }
  if (!cambioL) { res.ModificadosRemoto++; return r.clonar(); }
  res.ModificadosRemoto++;
  res.ModificadosLocal++;
  if (item === 'Dato') {
    // Datos de mercado: queda el que se descargó último
    return (ordinal(atr(r, 'Obtenido'), atr(lo, 'Obtenido')) > 0 ? r : lo).clonar();
  }
  return fusionarAtributos(item, b, lo, r, res);
}

function fusionarAtributos(item, b, lo, r, res) {
  const x = new Elemento(lo.nombre);
  const choques = [];
  for (const n of nombres(lo, r, b)) {
    const bv = atr(b, n), lv = atr(lo, n), rv = atr(r, n);
    let v;
    if (item === 'Dispositivo' && n === 'ProximoId') {
      v = String(Math.max(entero(lv), entero(rv)));
    } else if (!b) {
      v = lv.length > 0 ? lv : rv;
      if (lv.length > 0 && rv.length > 0 && !mismoValor(lv, rv)) choques.push(n);
    } else {
      v = valor3(bv, lv, rv, () => choques.push(n));
    }
    if (v.length > 0) x.fijar(n, v);
  }
  if (choques.length) res.Conflictos.push(describir(item, lo) + ': cambió en los dos dispositivos (' + choques.join(', ') + '); quedó lo de este.');
  return x;
}

/** ¿Tienen los mismos datos? (ignora fecha de guardado, revisión, contadores y preferencias de cada dispositivo) */
export function mismosDatos(a, b) {
  if (!a || !b) return a === b;
  if (!mismaEntidad(a, b, new Set(['Guardado', 'Revision', 'ProximoId']))) return false;
  if (!mismaEntidad(a.hijo('Configuracion'), b.hijo('Configuracion'), new Set(ATRIBUTOS_LOCALES))) return false;
  const ignorarDisp = new Set(['ProximoId']);
  const conts = contenedores(a);
  for (const c of contenedores(b)) if (!conts.includes(c)) conts.push(c);
  for (const cont of conts) {
    const item = itemDe(cont, a, b);
    if (!item.length) continue;
    const ma = mapa(a, cont, item, null), mb = mapa(b, cont, item, null);
    if (ma.size !== mb.size) return false;
    for (const [k, v] of ma) {
      const otro = mb.get(k);
      if (!otro) return false;
      if (!mismaEntidad(v, otro, item === 'Dispositivo' ? ignorarDisp : null)) return false;
    }
  }
  return true;
}

const NOMBRES_ITEM = {
  Movimiento: ['movimiento', 'movimientos'], Tarea: ['tarea', 'tareas'], Cuenta: ['cuenta', 'cuentas'],
  Tarjeta: ['tarjeta', 'tarjetas'], Fijo: ['fijo', 'fijos'], Resumen: ['resumen', 'resúmenes'],
  Meta: ['meta', 'metas'], Examen: ['examen', 'exámenes'], Sesion: ['sesión de estudio', 'sesiones de estudio'],
  Repaso: ['tarjeta de repaso', 'tarjetas de repaso'], Materia: ['materia', 'materias'], Lista: ['lista', 'listas'],
  Tablero: ['tablero', 'tableros'], Categoria: ['categoría', 'categorías'], Cierre: ['mes cerrado', 'meses cerrados'],
  Dato: ['dato de mercado', 'datos de mercado'], Dispositivo: ['dispositivo', 'dispositivos'] };

/** Resumen corto de lo que cambió de "antes" a "despues" (para el historial de la nube). */
export function describirCambios(antes, despues) {
  const partes = [];
  const conts = contenedores(despues);
  for (const c of contenedores(antes)) if (!conts.includes(c)) conts.push(c);
  for (const cont of conts) {
    const item = itemDe(cont, despues, antes);
    if (!item.length) continue;
    const ma = mapa(antes, cont, item, null), md = mapa(despues, cont, item, null);
    const nuevos = [...md.keys()].filter((k) => !ma.has(k)).length;
    const borrados = [...ma.keys()].filter((k) => !md.has(k)).length;
    const cambiados = [...md].filter(([k, v]) => ma.has(k) && !mismaEntidad(v, ma.get(k))).length;
    const nom = NOMBRES_ITEM[item] || [item.toLowerCase(), item.toLowerCase()];
    if (item === 'Dato') { if (nuevos + cambiados > 0) partes.push('datos de mercado'); continue; }
    if (item === 'Dispositivo') { if (nuevos > 0) partes.push(Fmt.plural(nuevos, 'dispositivo nuevo', 'dispositivos nuevos')); continue; }
    const fem = nom[0].endsWith('a') || nom[0].endsWith('ón');
    if (nuevos > 0) partes.push(Fmt.plural(nuevos, nom[0], nom[1]) + (nuevos === 1 ? ' nuevo' : ' nuevos').replace(' nuevo', fem ? ' nueva' : ' nuevo'));
    if (cambiados > 0) partes.push(Fmt.plural(cambiados, nom[0], nom[1]) + ' editad' + (fem ? 'a' : 'o') + (cambiados === 1 ? '' : 's'));
    if (borrados > 0) partes.push(Fmt.plural(borrados, nom[0], nom[1]) + ' borrad' + (fem ? 'a' : 'o') + (borrados === 1 ? '' : 's'));
  }
  if (!partes.length) return 'configuración';
  return partes.slice(0, 6).join(', ');
}
