// ============================================================================
//  Lector de JSON igual al de la PC (Json.vb): los números quedan como Decimal
//  exactos (no como double), así las tasas y cotizaciones dan lo mismo.
// ============================================================================

import { Dec } from './decimal.js';
import { F } from './fecha.js';

export function leerJson(texto) {
  if (texto === null || texto === undefined) throw new SyntaxError('JSON vacío');
  const s = String(texto);
  const pos = { i: 0 };
  const v = valor(s, pos);
  espacios(s, pos);
  if (pos.i < s.length) throw new SyntaxError('Sobra texto después del JSON (posición ' + pos.i + ')');
  return v;
}

function espacios(s, p) { while (p.i < s.length && /\s/.test(s[p.i])) p.i++; }

function valor(s, p) {
  espacios(s, p);
  if (p.i >= s.length) throw new SyntaxError('JSON incompleto');
  const c = s[p.i];
  if (c === '{') return objeto(s, p);
  if (c === '[') return lista(s, p);
  if (c === '"') return cadena(s, p);
  if (c === 't') return palabra(s, p, 'true', true);
  if (c === 'f') return palabra(s, p, 'false', false);
  if (c === 'n') return palabra(s, p, 'null', null);
  return numero(s, p);
}

function palabra(s, p, w, v) {
  if (s.substr(p.i, w.length) !== w) throw new SyntaxError('Valor inválido en la posición ' + p.i);
  p.i += w.length;
  return v;
}

function objeto(s, p) {
  const d = new Map();
  p.i++;
  espacios(s, p);
  if (p.i < s.length && s[p.i] === '}') { p.i++; return d; }
  for (;;) {
    espacios(s, p);
    if (p.i >= s.length || s[p.i] !== '"') throw new SyntaxError('Se esperaba un nombre de campo');
    const k = cadena(s, p);
    espacios(s, p);
    if (p.i >= s.length || s[p.i] !== ':') throw new SyntaxError("Se esperaba ':'");
    p.i++;
    d.set(k, valor(s, p));
    espacios(s, p);
    if (p.i >= s.length) throw new SyntaxError('Objeto sin cerrar');
    if (s[p.i] === ',') p.i++;
    else if (s[p.i] === '}') { p.i++; return d; }
    else throw new SyntaxError("Se esperaba ',' o '}'");
  }
}

function lista(s, p) {
  const l = [];
  p.i++;
  espacios(s, p);
  if (p.i < s.length && s[p.i] === ']') { p.i++; return l; }
  for (;;) {
    l.push(valor(s, p));
    espacios(s, p);
    if (p.i >= s.length) throw new SyntaxError('Lista sin cerrar');
    if (s[p.i] === ',') p.i++;
    else if (s[p.i] === ']') { p.i++; return l; }
    else throw new SyntaxError("Se esperaba ',' o ']'");
  }
}

function cadena(s, p) {
  let r = '';
  p.i++;
  while (p.i < s.length) {
    const c = s[p.i];
    if (c === '"') { p.i++; return r; }
    if (c === '\\') {
      p.i++;
      if (p.i >= s.length) break;
      const e = s[p.i];
      switch (e) {
        case 'b': r += '\b'; break;
        case 'f': r += '\f'; break;
        case 'n': r += '\n'; break;
        case 'r': r += '\r'; break;
        case 't': r += '\t'; break;
        case 'u':
          if (p.i + 4 >= s.length) throw new SyntaxError('Escape \\u incompleto');
          r += String.fromCharCode(parseInt(s.substr(p.i + 1, 4), 16));
          p.i += 4;
          break;
        default: r += e;
      }
      p.i++;
    } else { r += c; p.i++; }
  }
  throw new SyntaxError('Texto sin cerrar');
}

function numero(s, p) {
  const ini = p.i;
  while (p.i < s.length && '0123456789+-.eE'.includes(s[p.i])) p.i++;
  const t = s.slice(ini, p.i);
  if (!t.length) throw new SyntaxError('Valor inválido en la posición ' + ini);
  let d = null;
  try { d = Dec.intentar(t); } catch { d = null; }
  if (d !== null) return d;
  const n = Number(t);
  if (Number.isNaN(n)) throw new SyntaxError('Número inválido: ' + t);
  return n;
}

// ---------------------------------------------------------------- Ayudas

export const jObj = (o) => (o instanceof Map ? o : null);
export const jArr = (o) => (Array.isArray(o) ? o : []);
export function jCampo(o, nombre) {
  const d = jObj(o);
  if (!d) return null;
  return d.has(nombre) ? d.get(nombre) : null;
}
export function jTxt(o, nombre) {
  const v = jCampo(o, nombre);
  if (v === null || v === undefined) return '';
  if (v instanceof Dec) return v.toString();
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  return String(v);
}
/** Número de un campo (acepta números o textos numéricos). null si no hay. */
export function jNum(o, nombre) {
  const v = jCampo(o, nombre);
  if (v === null || v === undefined) return null;
  if (v instanceof Dec) return v;
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || Math.abs(v) > 7.9e28) return null;
    return Dec.deDoble(v);
  }
  if (typeof v === 'string') {
    try { return Dec.intentar(v); } catch { return null; }
  }
  return null;
}
/** Fecha de un campo "aaaa-mm-dd" (también acepta fecha y hora ISO). */
export function jFecha(o, nombre) {
  const t = jTxt(o, nombre);
  if (t.length < 10) return null;
  return F.leer(t.slice(0, 10));
}
