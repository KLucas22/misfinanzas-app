// ============================================================================
//  Datos de mercado (igual que Mercado.vb). El iPhone usa los que baja la PC
//  (llegan con la sincronización) y también puede actualizarlos por su cuenta.
// ============================================================================

import { Dec, D, CERO, UNO } from './decimal.js';
import { F } from './fecha.js';
import { leerJson, jArr, jCampo, jTxt, jNum, jFecha } from './json.js';
import { ordenarEstable } from './motor.js';

export class InformeMercado {
  constructor() { this.Correctas = []; this.Fallidas = []; }
  texto() {
    if (!this.Fallidas.length) return 'Datos de mercado actualizados (' + this.Correctas.length + ' fuentes).';
    if (!this.Correctas.length) return 'No se pudo conectar con las fuentes de datos. Se muestran los últimos datos guardados.';
    return 'Se actualizaron ' + this.Correctas.length + ' de ' + (this.Correctas.length + this.Fallidas.length) +
      ' fuentes (sin respuesta: ' + this.Fallidas.join(', ') + ').';
  }
}

const hipo = (Entidad, TNA, PlazoAnios, Financiamiento, RelacionCuota) => ({ Entidad, TNA: D(TNA), PlazoAnios, Financiamiento: D(Financiamiento), RelacionCuota: D(RelacionCuota) });

/** Datos listos para usar. Si nunca se descargaron, usa la referencia del 27/10/2026 (esReferencia). */
export class DatosMercado {
  constructor() {
    this.Oficial = D('1560'); this.MEP = D('1577.5'); this.Blue = D('1575'); this.CCL = D('1682.5');
    this.Tarjeta = D('2028'); this.Cripto = D('1675.37'); this.Mayorista = D('1541');
    this.FechaDolar = F.de(2026, 10, 27);
    this.MEPHace30 = D('1557.3'); this.MEPHace90 = D('1535.8'); this.MEPHace365 = D('1449.3');
    this.InflacionMes = D('1.9'); this.FechaInflacion = F.de(2026, 9, 30); this.Inflacion12m = D('33.29');
    this.SerieInflacion = [];
    this.REMInflacionMes = D('1.7'); this.REMPeriodoMes = 'Oct-26'; this.REMInflacion12m = D('21.1'); this.REMDolar12m = D('1945');
    this.PFNacion = D('0.1925'); this.PFMejorGrande = D('0.21'); this.PFMejorGrandeEntidad = 'Banco Provincia / Macro';
    this.PFMejor = D('0.24'); this.PFMejorEntidad = 'Bancos y financieras chicas'; this.PFPromedio = D('0.2037');
    this.FCIMercadoPago = D('0.1902'); this.FCIMejor = D('0.2084'); this.FCIMejorNombre = 'Vinci Compass Liquidez';
    this.LecapCortaTEM = D('0.0192'); this.LecapCortaTicker = 'S13N6 (13/11/2026)';
    this.LecapLargaTEM = D('0.0217'); this.LecapLargaTicker = 'T30A7 (30/04/2027)';
    this.RiesgoPais = D('765'); this.UVA = D('2172.25');
    this.Hipotecarios = [hipo('Ciudad', '0.065', 25, '0.7', '0.25'), hipo('BNA', '0.067', 30, '0.75', '0.25'),
      hipo('ICBC', '0.069', 20, '0.75', '0.25'), hipo('BBVA', '0.075', 30, '0.8', '0.25')];
    this.Acciones = [];
    this.Actualizado = null;
    const serie = ['2.3', '2.5', '2.8', '2.9', '2.9', '3.4', '2.6', '2.1', '1.9', '2.1', '1.7', '1.9'];
    for (let i = 0; i < serie.length; i++) {
      const fin = F.sumarMeses(F.de(2025, 10, 1), i + 1) - 1;
      this.SerieInflacion.push([fin, D(serie[i])]);
    }
  }

  get EsReferencia() { return this.Actualizado === null; }
  /** Brecha entre el MEP y el oficial (fracción). */
  get Brecha() { return this.Oficial.signo <= 0 ? CERO : this.MEP.div(this.Oficial).menos(UNO); }
  get MejorHipoteca() { return ordenarEstable(this.Hipotecarios, (a, b) => a.TNA.cmp(b.TNA))[0] || null; }

  /** Variación del MEP en un período (fracción). */
  variacionMEP(dias) {
    const base = dias <= 30 ? this.MEPHace30 : dias <= 90 ? this.MEPHace90 : this.MEPHace365;
    if (base.signo <= 0) return CERO;
    return this.MEP.div(base).menos(UNO);
  }

  /** Arma los datos desde lo guardado en la base (lo que falte queda con la referencia). */
  static desde(l) {
    const d = new DatosMercado();
    const v = (clave, fijar) => { const x = l.dato(clave); if (x) fijar(x); };
    v('dolar.oficial', (x) => { d.Oficial = x.Valor; });
    v('dolar.bolsa', (x) => { d.MEP = x.Valor; d.FechaDolar = x.Fecha; });
    v('dolar.blue', (x) => { d.Blue = x.Valor; });
    v('dolar.contadoconliqui', (x) => { d.CCL = x.Valor; });
    v('dolar.tarjeta', (x) => { d.Tarjeta = x.Valor; });
    v('dolar.cripto', (x) => { d.Cripto = x.Valor; });
    v('dolar.mayorista', (x) => { d.Mayorista = x.Valor; });
    v('mep.hace30', (x) => { d.MEPHace30 = x.Valor; });
    v('mep.hace90', (x) => { d.MEPHace90 = x.Valor; });
    v('mep.hace365', (x) => { d.MEPHace365 = x.Valor; });
    v('inflacion.mes', (x) => { d.InflacionMes = x.Valor; d.FechaInflacion = x.Fecha; });
    v('inflacion.12m', (x) => { d.Inflacion12m = x.Valor; });
    v('inflacion.serie', (x) => { const s = leerSerie(x.Texto); if (s.length) d.SerieInflacion = s; });
    v('rem.inflacion.mes', (x) => { d.REMInflacionMes = x.Valor; d.REMPeriodoMes = x.Texto; });
    v('rem.inflacion.12m', (x) => { d.REMInflacion12m = x.Valor; });
    v('rem.dolar.12m', (x) => { d.REMDolar12m = x.Valor; });
    v('pf.nacion', (x) => { d.PFNacion = x.Valor; });
    v('pf.mejor.grande', (x) => { d.PFMejorGrande = x.Valor; d.PFMejorGrandeEntidad = x.Texto; });
    v('pf.mejor', (x) => { d.PFMejor = x.Valor; d.PFMejorEntidad = x.Texto; });
    v('pf.promedio', (x) => { d.PFPromedio = x.Valor; });
    v('fci.mp', (x) => { d.FCIMercadoPago = x.Valor; });
    v('fci.mejor', (x) => { d.FCIMejor = x.Valor; d.FCIMejorNombre = x.Texto; });
    v('lecap.corta', (x) => { d.LecapCortaTEM = x.Valor; d.LecapCortaTicker = x.Texto; });
    v('lecap.larga', (x) => { d.LecapLargaTEM = x.Valor; d.LecapLargaTicker = x.Texto; });
    v('riesgo', (x) => { d.RiesgoPais = x.Valor; });
    v('uva', (x) => { d.UVA = x.Valor; });
    v('hipo.lista', (x) => { const h = leerHipotecarios(x.Texto); if (h.length) d.Hipotecarios = h; });
    for (const x of l.mercado) {
      if (!x.Clave.startsWith('accion.') && !x.Clave.startsWith('cedear.')) continue;
      const varia = Dec.intentar(x.Texto) || CERO;
      d.Acciones.push({ Simbolo: x.Clave.slice(x.Clave.indexOf('.') + 1), Precio: x.Valor, Variacion: varia, EsCedear: x.Clave.startsWith('cedear.') });
    }
    d.Actualizado = l.config.MercadoActualizado;
    return d;
  }
}

export function leerSerie(t) {
  const res = [];
  for (const parte of (t || '').split(';')) {
    const kv = parte.split('=');
    if (kv.length !== 2) continue;
    const f = /^\d{4}-\d{2}-\d{2}$/.test(kv[0]) ? F.leer(kv[0]) : null;
    const val = Dec.intentar(kv[1]);
    if (f !== null && val !== null) res.push([f, val]);
  }
  return res;
}

export function leerHipotecarios(t) {
  const res = [];
  for (const parte of (t || '').split(';')) {
    const c = parte.split('|');
    if (c.length !== 5) continue;
    const plazo = /^\s*[+-]?\d+\s*$/.test(c[2]) ? parseInt(c[2], 10) : 0;
    const h = { Entidad: c[0], TNA: Dec.intentar(c[1]) || CERO, PlazoAnios: plazo, Financiamiento: Dec.intentar(c[3]) || CERO, RelacionCuota: Dec.intentar(c[4]) || CERO };
    if (h.TNA.signo > 0) res.push(h);
  }
  return res;
}

// ============================================================================ Fuentes

export const URL = {
  Dolares: 'https://dolarapi.com/v1/dolares',
  HistoriaMEP: 'https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa',
  Inflacion: 'https://api.argentinadatos.com/v1/finanzas/indices/inflacion',
  PlazoFijo: 'https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijo',
  FCI: 'https://api.argentinadatos.com/v1/finanzas/fci/comparatasas',
  FCIUltimo: 'https://api.argentinadatos.com/v1/finanzas/fci/mercadoDinero/ultimo',
  FCIPenultimo: 'https://api.argentinadatos.com/v1/finanzas/fci/mercadoDinero/penultimo',
  Letras: 'https://api.argentinadatos.com/v1/finanzas/letras',
  Riesgo: 'https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo',
  UVA: 'https://api.argentinadatos.com/v1/finanzas/indices/uva',
  Hipotecarios: 'https://api.argentinadatos.com/v1/finanzas/creditos/hipotecariosUva',
  REM: 'https://api.argentinadatos.com/v1/finanzas/rem/ultimo',
  REMAlternativa: 'https://api.argentinadatos.com/v1/rems/ultimo',
  Acciones: 'https://data912.com/live/arg_stocks',
  Cedears: 'https://data912.com/live/arg_cedears',
};

export const ACCIONES_SEGUIDAS = ['GGAL', 'YPFD', 'PAMP', 'BMA', 'TXAR', 'ALUA', 'CEPU', 'TGSU2'];
export const CEDEARS_SEGUIDOS = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'MELI', 'KO', 'GOOGL', 'NVDA'];
const NOMBRE_BANCO_NACION = 'BANCO DE LA NACION ARGENTINA';
const BANCOS_GRANDES = ['BANCO DE LA NACION', 'BANCO SANTANDER', 'BANCO DE GALICIA', 'BANCO BBVA', 'BANCO MACRO',
  'INDUSTRIAL AND COMMERCIAL BANK OF CHINA', 'BANCO DE LA PROVINCIA DE BUENOS AIRES', 'BANCO CREDICOOP',
  'BANCO DE LA CIUDAD', 'BANCO PATAGONIA', 'HSBC', 'BANCO SUPERVIELLE'];

/** Descarga con 15 segundos de espera. */
export async function descargar(url) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = ctl ? setTimeout(() => ctl.abort(), 15000) : null;
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctl ? ctl.signal : undefined, cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally { if (t) clearTimeout(t); }
}

const MAX_D = (lista, f) => lista.reduce((m, x) => (m === null || f(x).gt(m) ? f(x) : m), null);

/**
 * Actualiza todo lo que pueda; cada fuente es independiente. "bajar" permite reemplazar la descarga (pruebas).
 * "ahora" es la fecha y hora (para Obtenido y MercadoActualizado).
 */
export async function actualizar(l, hoy, bajar = descargar, ahora = null) {
  const inf = new InformeMercado();
  const hoyF = Math.floor(hoy);
  const paso = async (nombre, accion) => {
    try { await accion(); inf.Correctas.push(nombre); } catch { inf.Fallidas.push(nombre); }
  };
  await paso('dólar', async () => procesarDolares(l, await bajar(URL.Dolares), hoyF));
  await paso('historia del MEP', async () => procesarHistoriaMEP(l, await bajar(URL.HistoriaMEP), hoyF));
  await paso('inflación', async () => procesarInflacion(l, await bajar(URL.Inflacion)));
  await paso('plazo fijo', async () => procesarPlazoFijo(l, await bajar(URL.PlazoFijo), hoyF));
  await paso('fondos money market', async () => {
    try { procesarFCI(l, await bajar(URL.FCI), hoyF); } catch { procesarFCIMercadoDinero(l, await bajar(URL.FCIUltimo), await bajar(URL.FCIPenultimo), hoyF); }
  });
  await paso('LECAP', async () => procesarLetras(l, await bajar(URL.Letras), hoyF));
  await paso('riesgo país', async () => procesarRiesgo(l, await bajar(URL.Riesgo), hoyF));
  await paso('UVA', async () => procesarUVA(l, await bajar(URL.UVA), hoyF));
  await paso('hipotecarios UVA', async () => procesarHipotecarios(l, await bajar(URL.Hipotecarios), hoyF));
  await paso('expectativas REM', async () => {
    try { procesarREM(l, await bajar(URL.REM), hoyF); } catch { procesarREM(l, await bajar(URL.REMAlternativa), hoyF); }
  });
  await paso('acciones y CEDEARs', async () => {
    let n = procesarAcciones(l, await bajar(URL.Acciones), false, hoyF);
    n += procesarAcciones(l, await bajar(URL.Cedears), true, hoyF);
    if (n === 0) throw new Error('sin cotizaciones');
  });
  if (inf.Correctas.length) {
    l.config.MercadoActualizado = ahora !== null ? ahora : F.ahora();
    const t = l.dato('dolar.tarjeta');
    const mep = l.dato('dolar.bolsa');
    if (t && t.Valor.signo > 0 && mep && mep.Valor.signo > 0) {
      l.config.DolarTarjeta = t.Valor;
      l.config.DolarMEP = mep.Valor;
      l.config.FechaCotizacion = hoyF;
    }
  }
  return inf;
}

export function procesarDolares(l, json, hoy) {
  let n = 0;
  for (const x of jArr(leerJson(json))) {
    const casa = jTxt(x, 'casa').toLowerCase();
    const venta = jNum(x, 'venta');
    if (!casa.length || venta === null || venta.signo <= 0) continue;
    const compra = jNum(x, 'compra');
    const fecha = jFecha(x, 'fechaActualizacion') ?? jFecha(x, 'fecha');
    l.fijarDato('dolar.' + casa, venta, compra !== null ? compra.toString() : '', fecha ?? hoy, 'DolarApi');
    n++;
  }
  if (n === 0) throw new Error('sin cotizaciones');
}

const porFecha = (lista) => ordenarEstable(lista, (a, b) => a.Fecha - b.Fecha);

export function procesarHistoriaMEP(l, json, hoy) {
  const puntos = porFecha(jArr(leerJson(json)).map((x) => ({ Fecha: jFecha(x, 'fecha'), Venta: jNum(x, 'venta') }))
    .filter((p) => p.Fecha !== null && p.Venta !== null && p.Venta.signo > 0));
  if (!puntos.length) throw new Error('sin datos');
  for (const dias of [30, 90, 365]) {
    const objetivo = hoy - dias;
    let p = null;
    for (const x of puntos) if (x.Fecha <= objetivo) p = x;
    if (p) l.fijarDato('mep.hace' + dias, p.Venta, '', p.Fecha, 'ArgentinaDatos');
  }
  if (!l.dato('dolar.bolsa')) {
    const ult = puntos[puntos.length - 1];
    l.fijarDato('dolar.bolsa', ult.Venta, '', ult.Fecha, 'ArgentinaDatos');
  }
}

export function procesarInflacion(l, json) {
  const puntos = porFecha(jArr(leerJson(json)).map((x) => ({ Fecha: jFecha(x, 'fecha'), Valor: jNum(x, 'valor') }))
    .filter((p) => p.Fecha !== null && p.Valor !== null));
  if (!puntos.length) throw new Error('sin datos');
  const ult = puntos[puntos.length - 1];
  const { y, m } = F.ymd(ult.Fecha);
  l.fijarDato('inflacion.mes', ult.Valor, `${y}-${F.dos(m)}`, ult.Fecha, 'INDEC vía ArgentinaDatos');
  const ultimos12 = puntos.slice(Math.max(0, puntos.length - 12));
  let acumulado = UNO;
  for (const p of ultimos12) acumulado = acumulado.por(UNO.mas(p.Valor.div(D(100))));
  l.fijarDato('inflacion.12m', acumulado.menos(UNO).por(D(100)).redondear(2), '', ult.Fecha, 'INDEC vía ArgentinaDatos');
  l.fijarDato('inflacion.serie', D(ultimos12.length), ultimos12.map((p) => F.iso(p.Fecha) + '=' + p.Valor.toString()).join(';'), ult.Fecha, 'INDEC vía ArgentinaDatos');
}

export function procesarPlazoFijo(l, json, hoy) {
  const bancos = jArr(leerJson(json)).map((x) => ({ Entidad: jTxt(x, 'entidad'), TNA: jNum(x, 'tnaClientes') }))
    .filter((b) => b.TNA !== null && b.TNA.signo > 0 && b.TNA.lt(D(5)));
  if (!bancos.length) throw new Error('sin tasas');
  const nacion = bancos.find((b) => b.Entidad.toUpperCase().startsWith(NOMBRE_BANCO_NACION));
  if (nacion) l.fijarDato('pf.nacion', nacion.TNA, titulo(nacion.Entidad), hoy, 'BCRA vía ArgentinaDatos');
  const grandes = bancos.filter((b) => BANCOS_GRANDES.some((g) => b.Entidad.toUpperCase().startsWith(g)));
  if (grandes.length) {
    const tope = MAX_D(grandes, (b) => b.TNA);
    l.fijarDato('pf.mejor.grande', tope, grandes.filter((b) => b.TNA.eq(tope)).map((b) => titulo(b.Entidad)).slice(0, 2).join(' / '), hoy, 'BCRA vía ArgentinaDatos');
  }
  const mejor = ordenarEstable(bancos, (a, b) => b.TNA.cmp(a.TNA))[0];
  l.fijarDato('pf.mejor', mejor.TNA, titulo(mejor.Entidad), hoy, 'BCRA vía ArgentinaDatos');
  l.fijarDato('pf.promedio', Dec.promedio(bancos.map((b) => b.TNA)).redondear(4), bancos.length + ' entidades', hoy, 'BCRA vía ArgentinaDatos');
}

export function procesarFCI(l, json, hoy) {
  const raiz = leerJson(json);
  const fondos = jArr(jCampo(raiz, 'fondos')).filter((f) => jTxt(f, 'tipoRenta') === 'Mercado de Dinero' && jTxt(f, 'moneda').startsWith('Peso'))
    .map((f) => ({ Nombre: jTxt(f, 'nombre'), TNA: jNum(jCampo(f, 'rendimientos'), 'tnaEstimada'), Patrimonio: jNum(f, 'patrimonio') ?? CERO }))
    .filter((f) => f.TNA !== null && f.TNA.signo > 0);
  if (!fondos.length) throw new Error('sin fondos');
  const mp = fondos.find((f) => f.Nombre.toLowerCase().startsWith('mercado fondo'));
  if (mp) l.fijarDato('fci.mp', mp.TNA.div(D(100)).redondear(4), mp.Nombre, hoy, 'CAFCI vía ArgentinaDatos');
  let grandes = fondos.filter((f) => f.Patrimonio.ge(D('50000000000')));
  if (!grandes.length) grandes = fondos;
  const mejor = ordenarEstable(grandes, (a, b) => b.TNA.cmp(a.TNA))[0];
  l.fijarDato('fci.mejor', mejor.TNA.div(D(100)).redondear(4), mejor.Nombre, hoy, 'CAFCI vía ArgentinaDatos');
}

export function procesarFCIMercadoDinero(l, jsonUltimo, jsonPenultimo, hoy) {
  const ult = jArr(leerJson(jsonUltimo));
  const pen = jArr(leerJson(jsonPenultimo));
  const calc = (nombre) => {
    const a = ult.find((x) => jTxt(x, 'fondo') === nombre);
    const b = pen.find((x) => jTxt(x, 'fondo') === nombre);
    if (!a || !b) return null;
    const va = jNum(a, 'vcp'), vb = jNum(b, 'vcp');
    const fa = jFecha(a, 'fecha'), fb = jFecha(b, 'fecha');
    if (va === null || vb === null || fa === null || fb === null || vb.signo <= 0) return null;
    const dias = fa - fb;
    if (dias <= 0 || dias > 7) return null;
    return va.div(vb).menos(UNO).por(D(365)).div(D(dias)).redondear(4);
  };
  const tnaMp = calc('Mercado Fondo - Clase A');
  if (tnaMp === null) throw new Error('sin datos del fondo');
  l.fijarDato('fci.mp', tnaMp, 'Mercado Fondo - Clase A', hoy, 'CAFCI vía ArgentinaDatos');
}

export function procesarLetras(l, json, hoy) {
  const raiz = leerJson(json);
  const lista = jArr(jCampo(raiz, 'letras') ?? raiz);
  const letras = ordenarEstable(lista.map((x) => ({ Ticker: jTxt(x, 'ticker'), TEM: jNum(x, 'temPorcentaje'), Vence: jFecha(x, 'fechaVencimiento') }))
    .filter((x) => x.TEM !== null && x.TEM.signo > 0 && x.TEM.lt(D(15)) && x.Vence !== null && x.Vence > hoy), (a, b) => a.Vence - b.Vence);
  if (!letras.length) throw new Error('sin letras');
  const corta = letras.find((x) => x.Vence - hoy > 10) || letras[0];
  const candidatas = letras.filter((x) => x.Vence - hoy <= 400);
  const larga = ordenarEstable(candidatas, (a, b) => Math.abs(a.Vence - hoy - 180) - Math.abs(b.Vence - hoy - 180))[0];
  if (!larga) throw new Error('sin letras');
  const desc = (t, v) => t + ' (' + fechaDMY(v) + ')';
  l.fijarDato('lecap.corta', corta.TEM.div(D(100)).redondear(4), desc(corta.Ticker, corta.Vence), hoy, 'ArgentinaDatos');
  l.fijarDato('lecap.larga', larga.TEM.div(D(100)).redondear(4), desc(larga.Ticker, larga.Vence), hoy, 'ArgentinaDatos');
}

function fechaDMY(n) { const { y, m, d } = F.ymd(n); return `${F.dos(d)}/${F.dos(m)}/${y}`; }

export function procesarRiesgo(l, json, hoy) {
  const raiz = leerJson(json);
  const x = Array.isArray(raiz) ? (raiz.length ? raiz[raiz.length - 1] : null) : raiz;
  const v = jNum(x, 'valor');
  if (v === null) throw new Error('sin valor');
  l.fijarDato('riesgo', v, '', jFecha(x, 'fecha') ?? hoy, 'ArgentinaDatos');
}

export function procesarUVA(l, json, hoy) {
  const p = porFecha(jArr(leerJson(json)).map((x) => ({ Fecha: jFecha(x, 'fecha'), Valor: jNum(x, 'valor') }))
    .filter((x) => x.Fecha !== null && x.Valor !== null && x.Fecha <= hoy));
  if (!p.length) throw new Error('sin valor');
  const u = p[p.length - 1];
  l.fijarDato('uva', u.Valor, '', u.Fecha, 'BCRA vía ArgentinaDatos');
}

function porcentaje(t) {
  const s = (t || '').replace(/%/g, '').trim();
  const v = Dec.intentar(s);
  if (v === null) return CERO;
  return v.gt(UNO) ? v.div(D(100)) : v;
}

export function procesarHipotecarios(l, json, hoy) {
  let lista = [];
  for (const x of jArr(leerJson(json))) {
    const tna = jNum(x, 'tna');
    if (tna === null || tna.signo <= 0) continue;
    const valorTna = tna.gt(UNO) ? tna.div(D(100)) : tna;
    const meta = jCampo(x, 'metadata');
    const plazo = jNum(meta, 'plazo_max_anios');
    const fin = porcentaje(jTxt(meta, 'financiamiento'));
    const rel = porcentaje(jTxt(meta, 'relacion_cuota_ingreso'));
    let nombre = jTxt(x, 'nombreComercial');
    if (!nombre.length) nombre = titulo(jTxt(x, 'entidad'));
    lista.push({ Entidad: nombre, TNA: valorTna, PlazoAnios: plazo !== null ? plazo.aEntero() : 20,
      Financiamiento: fin.signo > 0 ? fin : D('0.75'), RelacionCuota: rel.signo > 0 ? rel : D('0.25') });
  }
  if (!lista.length) throw new Error('sin créditos');
  lista = ordenarEstable(lista, (a, b) => a.TNA.cmp(b.TNA));
  l.fijarDato('hipo.lista', D(lista.length), lista.map((h) => h.Entidad.replace(/\|/g, ' ').replace(/;/g, ' ') + '|' + h.TNA.toString() + '|' + h.PlazoAnios + '|' +
    h.Financiamiento.toString() + '|' + h.RelacionCuota.toString()).join(';'), hoy, 'ArgentinaDatos');
}

export function procesarREM(l, json, hoy) {
  const filas = jArr(leerJson(json)).filter((x) => jTxt(x, 'muestra') === 'todos');
  const ipc = filas.filter((x) => jTxt(x, 'indicador').startsWith('Precios minoristas (IPC nivel general'));
  const tc = filas.filter((x) => jTxt(x, 'indicador').startsWith('Tipo de cambio'));
  if (!ipc.length) throw new Error('sin expectativas');
  const mensual = ordenarEstable(ipc.filter((x) => jTxt(x, 'periodoTipo') === 'mensual' && jFecha(x, 'periodoHasta') !== null && jFecha(x, 'periodoHasta') >= hoy),
    (a, b) => (jFecha(a, 'periodoDesde') ?? F.MINIMO) - (jFecha(b, 'periodoDesde') ?? F.MINIMO))[0];
  if (mensual && jNum(mensual, 'mediana') !== null) l.fijarDato('rem.inflacion.mes', jNum(mensual, 'mediana'), jTxt(mensual, 'periodo'), hoy, 'REM del BCRA');
  const doce = ipc.find((x) => jTxt(x, 'periodoTipo') === 'proximos_12_meses');
  if (doce && jNum(doce, 'mediana') !== null) l.fijarDato('rem.inflacion.12m', jNum(doce, 'mediana'), '', hoy, 'REM del BCRA');
  const tc12 = tc.find((x) => jTxt(x, 'periodoTipo') === 'proximos_12_meses');
  if (tc12 && jNum(tc12, 'mediana') !== null) l.fijarDato('rem.dolar.12m', jNum(tc12, 'mediana'), '', hoy, 'REM del BCRA');
}

export function procesarAcciones(l, json, cedears, hoy) {
  const seguidos = cedears ? CEDEARS_SEGUIDOS : ACCIONES_SEGUIDAS;
  let n = 0;
  for (const x of jArr(leerJson(json))) {
    const sim = jTxt(x, 'symbol').toUpperCase();
    if (!seguidos.includes(sim)) continue;
    let precio = jNum(x, 'c');
    if (precio === null || precio.signo <= 0) precio = jNum(x, 'px_ask');
    if (precio === null || precio.signo <= 0) continue;
    const varia = jNum(x, 'pct_change') ?? CERO;
    l.fijarDato((cedears ? 'cedear.' : 'accion.') + sim, precio, varia.toString(), hoy, 'Data912 (demorado)');
    n++;
  }
  return n;
}

/** "BANCO DE GALICIA Y BUENOS AIRES S.A." → "Banco de Galicia y Buenos Aires". */
export function titulo(entidad) {
  let t = (entidad || '').trim();
  for (const fin of [' S.A.U.', ' S.A.', ' SAU', ' S.A', ' COOPERATIVO LIMITADO']) {
    if (t.toUpperCase().endsWith(fin.toUpperCase())) t = t.slice(0, t.length - fin.length);
  }
  if (t.toUpperCase() !== t) return t;
  let res = '';
  let enPalabra = false;
  for (const ch of t.toLowerCase()) {
    const letra = /\p{L}/u.test(ch);
    res += letra && !enPalabra ? ch.toUpperCase() : ch;
    enPalabra = letra || (enPalabra && /['’\p{Nd}]/u.test(ch));
  }
  for (const chica of [' De ', ' Del ', ' La ', ' Y ', ' Las ', ' Los ']) res = res.split(chica).join(chica.toLowerCase());
  return res;
}
