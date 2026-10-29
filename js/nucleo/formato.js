// ============================================================================
//  Períodos AAAAMM y formatos en castellano rioplatense (igual que Formato.vb)
// ============================================================================

import { Dec, D, CERO } from './decimal.js';
import { F } from './fecha.js';

export const Per = {
  de(n) { const { y, m } = F.ymd(n); return y * 100 + m; },
  crear(y, m) { return y * 100 + m; },
  anio(p) { return Math.trunc(p / 100); },
  mes(p) { return p % 100; },
  sumar(p, meses) {
    const total = Per.anio(p) * 12 + (Per.mes(p) - 1) + meses;
    return Math.floor(total / 12) * 100 + (((total % 12) + 12) % 12) + 1;
  },
  /** Meses de a hasta b (b - a). */
  diferencia(a, b) { return (Per.anio(b) * 12 + Per.mes(b)) - (Per.anio(a) * 12 + Per.mes(a)); },
  primerDia(p) { return F.de(Per.anio(p), Per.mes(p), 1); },
  ultimoDia(p) { return F.de(Per.anio(p), Per.mes(p), F.diasEnMes(Per.anio(p), Per.mes(p))); },
  /** Día del mes (si el mes es más corto, el último). */
  diaEn(p, dia) {
    const max = F.diasEnMes(Per.anio(p), Per.mes(p));
    return F.de(Per.anio(p), Per.mes(p), Math.max(1, Math.min(dia, max)));
  },
  valido(p) { return p > 190001 && Per.mes(p) >= 1 && Per.mes(p) <= 12; },
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export const Fmt = {
  MESES, MESES_CORTOS, DIAS, DIAS_CORTOS,

  /** "N2" de .NET con punto de miles y coma decimal (redondeo lejos del cero). */
  num(v, decimales = 2) {
    let d = D(v).redondear(decimales, 'lejos');
    const neg = d.signo < 0;
    const abs = d.abs();
    let [ent, frac = ''] = abs.toString().split('.');
    frac = (frac + '0'.repeat(decimales)).slice(0, decimales);
    ent = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const s = decimales > 0 ? ent + ',' + frac : ent;
    return neg ? '-' + s : s;
  },
  /** $ 1.234.567,89 (o -$ 1.234,56) */
  pesos(v, decimales = 2) {
    v = D(v);
    const s = '$ ' + Fmt.num(v.abs(), decimales);
    return v.signo < 0 ? '-' + s : s;
  },
  /** $ 1.234.568 */
  pesosR(v) { return Fmt.pesos(D(v).redondear(0, 'lejos'), 0); },
  dolares(v) {
    v = D(v);
    const s = 'USD ' + Fmt.num(v.abs(), 2);
    return v.signo < 0 ? '-' + s : s;
  },
  monto(v, moneda) { return moneda === 'USD' ? Fmt.dolares(v) : Fmt.pesos(v); },
  /** 1,2 M / 850 k */
  corto(v) {
    v = D(v);
    const a = v.abs();
    const signo = v.signo < 0 ? '-' : '';
    if (a.ge(1000000)) return signo + Fmt.num(a.div(D(1000000)), a.ge(10000000) ? 0 : 1) + ' M';
    if (a.ge(1000)) return signo + Fmt.num(a.div(D(1000)), 0) + ' k';
    return signo + Fmt.num(a, 0);
  },
  /** 0,275 → "27,5 %" */
  pct(v, decimales = 1) { return Fmt.num(D(v).por(D(100)), decimales) + ' %'; },
  fecha(n) { const { y, m, d } = F.ymd(n); return `${F.dos(d)}/${F.dos(m)}/${y}`; },
  fechaCorta(n) { const { m, d } = F.ymd(n); return `${F.dos(d)}/${F.dos(m)}`; },
  /** "mar 03/11" */
  fechaDia(n) { return DIAS_CORTOS[F.diaSemana(n)] + ' ' + Fmt.fechaCorta(n); },
  /** "lunes 26 de octubre de 2026" */
  fechaLarga(n) { const { y, m, d } = F.ymd(n); return `${DIAS[F.diaSemana(n)]} ${d} de ${MESES[m - 1]} de ${y}`; },
  nombreMes(m) { return MESES[m - 1]; },
  capital(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; },
  /** 202611 → "Noviembre 2026" */
  periodo(p) { return Per.valido(p) ? Fmt.capital(MESES[Per.mes(p) - 1]) + ' ' + Per.anio(p) : '-'; },
  /** 202611 → "Nov 26" */
  periodoCorto(p) { return Per.valido(p) ? MESES_CORTOS[Per.mes(p) - 1] + ' ' + String(Per.anio(p) % 100).padStart(2, '0') : '-'; },
  /** 202611 → "noviembre" */
  mesDe(p) { return Per.valido(p) ? MESES[Per.mes(p) - 1] : '-'; },
  /** "hoy", "mañana", "en 8 días", "ayer", "hace 3 días" */
  enDias(d, hoy) {
    const n = Math.floor(d) - Math.floor(hoy);
    if (n === 0) return 'hoy';
    if (n === 1) return 'mañana';
    if (n === -1) return 'ayer';
    return n > 0 ? 'en ' + n + ' días' : 'hace ' + (-n) + ' días';
  },
  /** Interpreta montos escritos de cualquier forma: "1.500", "1500,50", "1.500,50", "1,500.50", "$ 2.000". null si no es un número. */
  parseMonto(texto) {
    if (texto === null || texto === undefined) return null;
    let s = String(texto).trim().replace(/\$/g, '').replace(/ARS/g, '').replace(/USD/g, '').replace(/U\$S/g, '').replace(/ /g, '').replace(/ /g, '');
    if (!s.length) return null;
    let negativo = false;
    if (s.startsWith('-')) { negativo = true; s = s.slice(1); }
    else if (s.startsWith('(') && s.endsWith(')')) { negativo = true; s = s.slice(1, -1); }
    if (!/^[\d.,]*$/.test(s)) return null;
    const iPunto = s.lastIndexOf('.'), iComa = s.lastIndexOf(',');
    let limpio;
    if (iPunto >= 0 && iComa >= 0) {
      limpio = iComa > iPunto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (iComa >= 0) {
      const cantidad = (s.match(/,/g) || []).length;
      const despues = s.length - iComa - 1;
      limpio = cantidad > 1 || (despues === 3 && iComa > 0 && !s.startsWith('0,')) ? s.replace(/,/g, '') : s.replace(',', '.');
    } else if (iPunto >= 0) {
      const cantidad = (s.match(/\./g) || []).length;
      const despues = s.length - iPunto - 1;
      limpio = cantidad > 1 || (despues === 3 && iPunto > 0) ? s.replace(/\./g, '') : s;
    } else limpio = s;
    if (!/^\d*\.?\d*$/.test(limpio) || limpio === '' || limpio === '.') return null;
    const d = Dec.intentar(limpio);
    if (d === null) return null;
    return negativo ? d.neg() : d;
  },
  titulo(s) {
    if (!s || !s.trim()) return '';
    return s.trim().toLowerCase().split(' ').filter((p) => p.length).map((p) => p[0].toUpperCase() + p.slice(1)).join(' ');
  },
  /** Texto sin tildes y en mayúsculas para comparar. */
  normalizar(s) {
    if (s === null || s === undefined) return '';
    return String(s).normalize('NFD').replace(/\p{Mn}/gu, '').normalize('NFC').toUpperCase().trim();
  },
  plural(n, singular, enPlural) { return n + ' ' + (n === 1 ? singular : enPlural); },
};

export { CERO };
