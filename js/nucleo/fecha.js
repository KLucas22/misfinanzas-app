// ============================================================================
//  Fechas como número de día (días desde el 1/1/1970). La parte fraccionaria,
//  si la hay, es la hora del día (como el Date de .NET con hora).
// ============================================================================

const MS_DIA = 86400000;

export const F = {
  /** Día a partir de año, mes (1-12) y día. */
  de(y, m, d) { return Math.round(Date.UTC(y, m - 1, d) / MS_DIA); },
  ymd(n) {
    const dt = new Date(Math.floor(n) * MS_DIA);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
  },
  anio(n) { return F.ymd(n).y; },
  mes(n) { return F.ymd(n).m; },
  dia(n) { return F.ymd(n).d; },
  /** 0 = domingo ... 6 = sábado (como DayOfWeek de .NET). */
  diaSemana(n) { return (((Math.floor(n) % 7) + 7 + 4) % 7); },
  diasEnMes(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); },
  esBisiesto(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; },
  /** Sólo la fecha (sin hora). */
  fecha(n) { return Math.floor(n); },
  /** Segundos desde la medianoche. */
  segundos(n) { return Math.round((n - Math.floor(n)) * 86400); },
  /** AddMonths de .NET: si el mes es más corto, queda el último día. Conserva la hora. */
  sumarMeses(n, k) {
    const { y, m, d } = F.ymd(n);
    const total = y * 12 + (m - 1) + k;
    const ny = Math.floor(total / 12), nm = (total % 12) + 1;
    const nd = Math.min(d, F.diasEnMes(ny, nm));
    return F.de(ny, nm, nd) + (n - Math.floor(n));
  },
  sumarAnios(n, k) { return F.sumarMeses(n, 12 * k); },
  /** Fecha local de hoy (la del teléfono). */
  hoy() {
    const t = new Date();
    return F.de(t.getFullYear(), t.getMonth() + 1, t.getDate());
  },
  /** Fecha y hora local. */
  ahora() {
    const t = new Date();
    return F.de(t.getFullYear(), t.getMonth() + 1, t.getDate()) + (t.getHours() * 3600 + t.getMinutes() * 60 + t.getSeconds()) / 86400;
  },
  conHora(n, h, mi, s = 0) { return Math.floor(n) + (h * 3600 + mi * 60 + s) / 86400; },
  /** Lee "aaaa-mm-dd", "aaaa-mm-ddThh:mm:ss", "aaaa-mm-dd hh:mm:ss" o "aaaa-mm-ddThh:mm". null si no es válida. */
  leer(s) {
    if (!s) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(String(s).trim());
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > F.diasEnMes(y, mo)) return null;
    let n = F.de(y, mo, d);
    if (m[4] !== undefined) {
      const h = +m[4], mi = +m[5], se = m[6] !== undefined ? +m[6] : 0;
      if (h > 23 || mi > 59 || se > 59) return null;
      n += (h * 3600 + mi * 60 + se) / 86400;
    }
    return n;
  },
  dos(x) { return String(x).padStart(2, '0'); },
  /** "aaaa-mm-dd" (o con hora si la tiene), igual que los guarda la PC. */
  aTexto(n) {
    const { y, m, d } = F.ymd(n);
    const base = `${String(y).padStart(4, '0')}-${F.dos(m)}-${F.dos(d)}`;
    const s = F.segundos(n);
    if (s === 0 || s === 86400) return base;
    return `${base}T${F.dos(Math.floor(s / 3600))}:${F.dos(Math.floor((s % 3600) / 60))}:${F.dos(s % 60)}`;
  },
  /** "aaaa-mm-dd" */
  iso(n) { const { y, m, d } = F.ymd(n); return `${String(y).padStart(4, '0')}-${F.dos(m)}-${F.dos(d)}`; },
  /** "aaaa-mm-dd hh:mm:ss" (atributo Guardado) */
  textoGuardado(n) {
    const { y, m, d } = F.ymd(n);
    const s = F.segundos(n);
    return `${y}-${F.dos(m)}-${F.dos(d)} ${F.dos(Math.floor(s / 3600))}:${F.dos(Math.floor((s % 3600) / 60))}:${F.dos(s % 60)}`;
  },
  MINIMO: -719162,   // 0001-01-01 (Date.MinValue)
};
