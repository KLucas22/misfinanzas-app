// ============================================================================
//  Mis Finanzas · Decimal con la misma semántica que System.Decimal de .NET
//  (mantisa entera de 96 bits y escala 0..28). Así las cuentas del iPhone dan
//  exactamente igual que las de la PC, centavo por centavo.
// ============================================================================

const MAX = (1n << 96n) - 1n;
const P10 = [];
for (let i = 0; i <= 80; i++) P10.push(10n ** BigInt(i));
const abs = (x) => (x < 0n ? -x : x);
const DPOT10 = [];
for (let i = 0; i <= 80; i++) DPOT10.push(Number('1e' + i));
const vistaDoble = new DataView(new ArrayBuffer(8));
function exponenteBinario(d) {
  vistaDoble.setFloat64(0, d);
  return (vistaDoble.getUint16(0) >> 4) & 0x7ff;
}

/** Redondea m / 10^n según el modo ('par' = al par, 'lejos' = lejos del cero, 'trunc'). */
function dividirRedondeando(m, n, modo) {
  if (n <= 0) return m * P10[-n];
  const d = P10[n];
  let q = m / d;           // trunca hacia 0
  const r = m % d;
  if (r === 0n || modo === 'trunc') return q;
  const r2 = abs(r) * 2n;
  const neg = m < 0n;
  let subir;
  if (modo === 'lejos') subir = r2 >= d;
  else if (modo === 'techo') subir = !neg;          // hacia +∞
  else if (modo === 'piso') subir = neg;            // hacia -∞
  else subir = r2 > d || (r2 === d && (abs(q) & 1n) === 1n);
  if (subir) q += neg ? -1n : 1n;
  return q;
}

/** Ajusta mantisa y escala para que entren en 96 bits con escala ≤ 28 (redondeo al par, como .NET). */
function ajustar(m, e) {
  if (e < 0) { m = m * P10[-e]; e = 0; }
  if (e <= 28 && abs(m) <= MAX) return new Dec(m, e);
  // Mínima cantidad de dígitos a sacar
  let n = Math.max(0, e - 28);
  while (true) {
    const q = dividirRedondeando(m, n, 'par');
    if (abs(q) <= MAX) {
      if (e - n < 0) throw new RangeError('Desborde de Decimal');
      return new Dec(q, e - n);
    }
    n++;
    if (n > e) throw new RangeError('Desborde de Decimal');
  }
}

export class Dec {
  constructor(m, e) {
    this.m = m;   // BigInt
    this.e = e;   // escala (cantidad de decimales)
  }

  static de(x) {
    if (x instanceof Dec) return x;
    if (typeof x === 'bigint') return new Dec(x, 0);
    if (typeof x === 'number') {
      if (Number.isInteger(x) && Math.abs(x) <= Number.MAX_SAFE_INTEGER) return new Dec(BigInt(x), 0);
      return Dec.deDoble(x);
    }
    if (typeof x === 'string') return Dec.parse(x);
    throw new TypeError('No es un número: ' + x);
  }

  /** Como Decimal.Parse(s, NumberStyles.Number | AllowExponent, Invariant). Devuelve null si no es válido. */
  static intentar(s) {
    if (s === null || s === undefined) return null;
    const t = String(s).trim();
    const mm = /^([+-])?(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(t);
    if (!mm || (mm[2] === '' && (mm[3] === undefined || mm[3] === ''))) return null;
    const ent = mm[2] || '';
    const frac = mm[3] || '';
    let e = frac.length - (mm[4] ? parseInt(mm[4], 10) : 0);
    let m = BigInt((ent + frac) || '0');
    if (mm[1] === '-') m = -m;
    try { return ajustar(m, e); } catch { return null; }
  }

  static parse(s) {
    const d = Dec.intentar(s);
    if (d === null) throw new SyntaxError('Número inválido: ' + s);
    return d;
  }

  /**
   * Conversión desde double igual que CDec(double) en .NET (VarDecFromR8): lleva el número a 15 cifras
   * multiplicando en double, redondea al par y saca ceros de más (hasta 14 y sin pasar la escala usada).
   */
  static deDoble(x) {
    if (!Number.isFinite(x)) throw new RangeError('Número no finito');
    if (x === 0) return CERO;
    const neg = x < 0;
    let dbl = Math.abs(x);
    const exp = exponenteBinario(dbl) - 1022;
    if (exp < -94) return CERO;
    if (exp > 96) throw new RangeError('Desborde de Decimal');
    let power = 14 - ((exp * 19728) >> 16);
    if (power >= 0) {
      if (power > 28) power = 28;
      dbl *= DPOT10[power];
    } else {
      if (power !== -1 || dbl >= 1e15) dbl /= DPOT10[-power];
      else power = 0;
    }
    if (dbl < 1e14 && power < 28) { dbl *= 10; power++; }
    let mant = Math.trunc(dbl);
    const resto = dbl - mant;
    if (resto > 0.5 || (resto === 0.5 && mant % 2 === 1)) mant++;
    if (mant === 0) return CERO;
    let m = BigInt(mant);
    let e;
    if (power < 0) {
      m *= P10[-power];
      e = 0;
    } else {
      let lmax = Math.min(power, 14);
      e = power;
      while (lmax > 0 && m % 10n === 0n) { m /= 10n; e--; lmax--; }
    }
    return new Dec(neg ? -m : m, e);
  }

  aDoble() { return Number(this.toString()); }

  /** Quita ceros a la derecha (1.500 → 1.5). */
  sinCeros() {
    let m = this.m, e = this.e;
    while (e > 0 && m % 10n === 0n) { m /= 10n; e--; }
    return new Dec(m, e);
  }

  toString() {
    const neg = this.m < 0n;
    let s = abs(this.m).toString();
    if (this.e > 0) {
      if (s.length <= this.e) s = '0'.repeat(this.e - s.length + 1) + s;
      s = s.slice(0, s.length - this.e) + '.' + s.slice(s.length - this.e);
    }
    return (neg ? '-' : '') + s;
  }

  // ---------------------------------------------------------------- Comparación
  cmp(b) {
    b = Dec.de(b);
    const e = Math.max(this.e, b.e);
    const x = this.m * P10[e - this.e], y = b.m * P10[e - b.e];
    return x < y ? -1 : x > y ? 1 : 0;
  }
  eq(b) { return this.cmp(b) === 0; }
  lt(b) { return this.cmp(b) < 0; }
  le(b) { return this.cmp(b) <= 0; }
  gt(b) { return this.cmp(b) > 0; }
  ge(b) { return this.cmp(b) >= 0; }
  get esCero() { return this.m === 0n; }
  get signo() { return this.m < 0n ? -1 : this.m > 0n ? 1 : 0; }

  // ---------------------------------------------------------------- Operaciones
  mas(b) {
    b = Dec.de(b);
    const e = Math.max(this.e, b.e);
    return ajustar(this.m * P10[e - this.e] + b.m * P10[e - b.e], e);
  }
  menos(b) {
    b = Dec.de(b);
    const e = Math.max(this.e, b.e);
    return ajustar(this.m * P10[e - this.e] - b.m * P10[e - b.e], e);
  }
  por(b) {
    b = Dec.de(b);
    const m = this.m * b.m;
    // .NET: un producto cero devuelve 0 sin decimales salvo cuando los dos factores entran en 32 bits
    if (m === 0n && (abs(this.m) > 0xffffffffn || abs(b.m) > 0xffffffffn)) return CERO;
    return ajustar(m, this.e + b.e);
  }
  /** División como .NET: exacta con la menor escala posible, o con la máxima precisión (redondeo al par). */
  div(b) {
    b = Dec.de(b);
    if (b.m === 0n) throw new RangeError('División por cero');
    const neg = (this.m < 0n) !== (b.m < 0n);
    let num = abs(this.m), den = abs(b.m);
    let escala = this.e - b.e;
    if (escala < 0) { num *= P10[-escala]; escala = 0; }
    let q = num / den, r = num % den;
    if (q > MAX) throw new RangeError('Desborde de Decimal');
    // Si la división no es exacta en la escala natural, .NET agrega dígitos y al final saca los ceros de más
    const sacarCeros = r !== 0n;
    while (r !== 0n && escala < 28) {
      const q2 = q * 10n + (r * 10n) / den;
      if (q2 > MAX) break;
      r = (r * 10n) % den;
      q = q2;
      escala++;
    }
    if (r !== 0n) {
      const r2 = r * 2n;
      if (r2 > den || (r2 === den && (q & 1n) === 1n)) q += 1n;
      if (q > MAX) return ajustar(neg ? -q : q, escala);
    }
    if (sacarCeros) while (escala > 0 && q % 10n === 0n) { q /= 10n; escala--; }
    return new Dec(neg ? -q : q, escala);
  }
  neg() { return new Dec(-this.m, this.e); }
  abs() { return this.m < 0n ? new Dec(-this.m, this.e) : this; }

  /** Math.Round(d, decimales, modo): 'par' (por defecto en .NET) o 'lejos' (AwayFromZero). */
  redondear(decimales = 0, modo = 'par') {
    if (this.e <= decimales) return this;
    return new Dec(dividirRedondeando(this.m, this.e - decimales, modo), decimales);
  }
  /** Math.Ceiling */
  techo() { return this.e === 0 ? this : new Dec(dividirRedondeando(this.m, this.e, 'techo'), 0); }
  /** Math.Floor */
  piso() { return this.e === 0 ? this : new Dec(dividirRedondeando(this.m, this.e, 'piso'), 0); }
  /** Decimal.Truncate */
  truncar() { return this.e === 0 ? this : new Dec(dividirRedondeando(this.m, this.e, 'trunc'), 0); }
  /** Entero (CInt redondea al par en VB) */
  aEntero() { return Number(this.redondear(0, 'par').m); }

  static max(a, b) { a = Dec.de(a); b = Dec.de(b); return a.ge(b) ? a : b; }
  static min(a, b) { a = Dec.de(a); b = Dec.de(b); return a.lt(b) ? a : b; }   // como Decimal.Min: si son iguales devuelve b
  static suma(lista) { let s = CERO; for (const x of lista) s = s.mas(x); return s; }
  /** Enumerable.Average de decimales */
  static promedio(lista) {
    if (lista.length === 0) throw new RangeError('Lista vacía');
    return Dec.suma(lista).div(Dec.de(lista.length));
  }
}

export const CERO = new Dec(0n, 0);
export const UNO = new Dec(1n, 0);
export const D = (x) => Dec.de(x);
