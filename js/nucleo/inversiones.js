// ============================================================================
//  Inversiones y metas (igual que Inversiones.vb). Es información, no asesoramiento.
// ============================================================================

import { Dec, D, CERO, UNO } from './decimal.js';
import { F } from './fecha.js';
import { Fmt } from './formato.js';
import { ordenarEstable } from './motor.js';
import { NivelAviso, nuevoAviso, ordenarAvisos } from './asesor.js';

const C100 = D(100), C30 = D(30), C365 = D(365), C1000 = D(1000), C60 = D(60);

export function nombrePerfil(perfil) {
  switch ((perfil || '').toLowerCase()) {
    case 'conservador': return 'Conservador';
    case 'agresivo': return 'Agresivo';
    default: return 'Moderado';
  }
}

/** Porcentajes del ahorro libre: pesos a tasa, dólares, acciones/CEDEARs. */
export function reparto(perfil) {
  switch ((perfil || '').toLowerCase()) {
    case 'conservador': return [D('0.6'), D('0.4'), D('0')];
    case 'agresivo': return [D('0.2'), D('0.35'), D('0.45')];
    default: return [D('0.35'), D('0.4'), D('0.25')];
  }
}

export class Diagnostico {
  constructor() {
    this.IngresoMensual = CERO; this.GastoMensual = CERO; this.AhorroMensual = CERO; this.TasaAhorro = CERO;
    this.LiquidezARS = CERO; this.LiquidezUSD = CERO; this.Patrimonio = CERO; this.Libre = CERO;
    this.MesesObjetivo = 0; this.FondoObjetivo = CERO; this.FondoMeses = CERO; this.FaltaFondo = CERO; this.Excedente = CERO;
    this.CuotasPendientes = CERO; this.CuotasProximoMes = CERO; this.SinRendimiento = CERO; this.MetasActivas = 0;
  }
  get FondoCompleto() { return this.FaltaFondo.signo <= 0; }
}

export function diagnosticar(m) {
  const l = m.L;
  const d = new Diagnostico();
  const proy = m.proyectar(7);
  let completos = proy.slice(1).filter((x) => x.Ingresos.signo > 0).slice(0, 4);
  if (!completos.length) completos = proy.slice(1, 5);
  if (completos.length) {
    d.IngresoMensual = Dec.promedio(completos.map((x) => x.Ingresos.mas(x.Rendimientos))).redondear(0);
    d.GastoMensual = Dec.promedio(completos.map((x) => x.Egresos)).redondear(0);
    d.AhorroMensual = Dec.promedio(completos.map((x) => x.Resultado)).redondear(0);
  }
  d.TasaAhorro = d.IngresoMensual.signo > 0 ? d.AhorroMensual.div(d.IngresoMensual) : CERO;
  d.LiquidezARS = m.disponibleARS();
  d.LiquidezUSD = m.disponibleUSD();
  d.Patrimonio = d.LiquidezARS.mas(d.LiquidezUSD.por(l.config.DolarMEP));
  d.Libre = Dec.max(CERO, m.libreDespuesDePagar(m.periodoAPagar()));
  d.MesesObjetivo = Math.max(1, l.config.MesesEmergencia);
  d.FondoObjetivo = d.GastoMensual.por(D(d.MesesObjetivo)).redondear(0);
  d.FondoMeses = d.GastoMensual.signo > 0 ? d.Libre.div(d.GastoMensual) : CERO;
  d.FaltaFondo = Dec.max(CERO, d.FondoObjetivo.menos(d.Libre));
  d.Excedente = Dec.max(CERO, d.Libre.menos(d.FondoObjetivo));
  d.CuotasPendientes = m.cuotasPendientesTotal().total;
  const cuotas = m.cuotasPorPeriodo(2);
  d.CuotasProximoMes = cuotas.length ? cuotas[0].Total : CERO;
  let sin = CERO;
  for (const c of l.cuentas) if (c.Activa && !c.Remunerada && c.Moneda === 'ARS') sin = sin.mas(Dec.max(CERO, m.saldo(c)));
  d.SinRendimiento = sin;
  d.MetasActivas = l.metas.filter((x) => x.Activa).length;
  return d;
}

/** Rendimiento mensual de una TNA con capitalización diaria (cuenta remunerada / FCI). */
export function mensualDiaria(tna) {
  return Dec.deDoble(Math.pow(1.0 + tna.aDoble() / 365.0, 30.0) - 1.0);
}

const pct = (v, dec = 1) => Fmt.pct(v, dec);

export function opciones(d, mk, perfil) {
  const res = [];
  const infEsperada = mk.REMInflacionMes.div(C100);
  const mFci = mensualDiaria(mk.FCIMercadoPago);
  const mPfNacion = mk.PFNacion.por(C30).div(C365);
  const mPfMejor = mk.PFMejorGrande.por(C30).div(C365);
  const mLecap = mk.LecapCortaTEM;
  const mLecapLarga = mk.LecapLargaTEM;
  const pesos12 = Dec.deDoble(Math.pow(1.0 + mLecapLarga.aDoble(), 12.0) - 1.0);
  const devaluacionEsperada = mk.Mayorista.signo > 0 ? mk.REMDolar12m.div(mk.Mayorista).menos(UNO) : CERO;
  const realDolar = UNO.mas(mk.variacionMEP(365)).div(UNO.mas(mk.Inflacion12m.div(C100))).menos(UNO);

  // 1) Fondo de emergencia
  if (d.GastoMensual.signo > 0) {
    if (!d.FondoCompleto) {
      res.push(nuevoAviso({ Nivel: NivelAviso.Atencion, Orden: 1,
        Titulo: 'Primero: completá el fondo de emergencia (faltan ' + Fmt.pesosR(d.FaltaFondo) + ')',
        Detalle: 'Para ' + d.MesesObjetivo + ' meses de gastos (~' + Fmt.pesosR(d.GastoMensual) + ' por mes) necesitás ' +
          Fmt.pesosR(d.FondoObjetivo) + '; hoy te quedan ' + Fmt.pesosR(d.Libre) + ' libres después de pagar las tarjetas (' + Fmt.num(d.FondoMeses, 1) + ' meses). ' +
          'Hasta completarlo, lo que ahorres dejalo líquido: cuenta remunerada o fondo money market (Mercado Pago ~' + pct(mk.FCIMercadoPago) +
          ' TNA, ' + pct(mFci, 2) + ' por mes), que se retira en el día.' }));
    } else {
      res.push(nuevoAviso({ Nivel: NivelAviso.Positivo, Orden: 1,
        Titulo: 'Fondo de emergencia completo: cubrís ' + Fmt.num(d.FondoMeses, 1) + ' meses de gastos',
        Detalle: 'Por encima de los ' + d.MesesObjetivo + ' meses recomendados tenés ~' + Fmt.pesosR(d.Excedente) +
          ' que podrías invertir según cuándo los vas a necesitar.' }));
    }
  }

  // 2) Cuotas
  if (d.IngresoMensual.signo > 0 && d.CuotasProximoMes.div(d.IngresoMensual).gt(D('0.3'))) {
    res.push(nuevoAviso({ Nivel: NivelAviso.Atencion, Orden: 2,
      Titulo: 'Las cuotas se llevan el ' + pct(d.CuotasProximoMes.div(d.IngresoMensual), 0) + ' de tu ingreso',
      Detalle: 'Antes de invertir en algo de riesgo conviene bajar esa carga a menos del 30 %: evitá sumar cuotas nuevas hasta que terminen las actuales.' }));
  }

  // 3) Pesos a 1-6 meses
  const mejorPesos = Dec.max(Dec.max(mFci, mPfMejor), mLecap);
  const real = UNO.mas(mejorPesos).div(UNO.mas(infEsperada)).menos(UNO);
  let detallePesos = 'Rendimiento por mes: fondo money market ' + pct(mFci, 2) + ' · plazo fijo Banco Nación ' + pct(mPfNacion, 2) +
    ' (TNA ' + pct(mk.PFNacion) + ') · mejor banco grande ' + pct(mPfMejor, 2) + ' · LECAP ' + mk.LecapCortaTicker + ' ' + pct(mLecap, 2) +
    '. Inflación esperada para ' + mk.REMPeriodoMes + ': ' + pct(infEsperada, 1) + ' (REM del BCRA). ';
  if (real.gt(D('0.001'))) {
    detallePesos += 'Hoy las LECAP le ganan a la inflación esperada por ~' + pct(real, 2) + ' al mes; el plazo fijo de los bancos grandes queda ' +
      (mPfMejor.ge(infEsperada) ? 'apenas arriba.' : 'por debajo.') + ' Las LECAP se compran desde una cuenta de inversión (bróker o la sección Inversiones de tu banco).';
  } else {
    detallePesos += 'Hoy ninguna opción en pesos le gana con claridad a la inflación esperada: para lo que no vas a usar en meses, conviene combinar con dólares.';
  }
  res.push(nuevoAviso({ Nivel: NivelAviso.Sugerencia, Orden: 3,
    Titulo: 'Pesos que no usás en 1 a 6 meses: la LECAP rinde ' + pct(mLecap, 2) + ' mensual', Detalle: detallePesos }));

  // 4) Dólares
  const tituloDolar = realDolar.signo < 0
    ? 'El dólar MEP está ' + pct(realDolar.neg(), 0) + ' más barato que hace un año (descontada la inflación)'
    : 'El dólar MEP está ' + pct(realDolar, 0) + ' más caro que hace un año (descontada la inflación)';
  res.push(nuevoAviso({ Nivel: NivelAviso.Sugerencia, Orden: 4, Titulo: tituloDolar,
    Detalle: 'En 12 meses el MEP pasó de ' + Fmt.pesosR(mk.MEPHace365) + ' a ' + Fmt.pesosR(mk.MEP) + ' (' + pct(mk.variacionMEP(365), 1) + ') y la inflación fue ' +
      Fmt.num(mk.Inflacion12m, 1) + ' %. Brecha con el oficial: ' + pct(mk.Brecha, 1) + '. El REM espera el mayorista en ' + Fmt.pesosR(mk.REMDolar12m) +
      ' dentro de un año (' + (devaluacionEsperada.signo >= 0 ? '+' : '') + pct(devaluacionEsperada, 0) + '), contra ~' + pct(pesos12, 0) +
      ' anual de las LECAP. Para ahorro de largo plazo o metas en dólares (como una vivienda), comprar MEP todos los meses por partes iguales evita depender del momento.' }));

  // 5) Acciones y CEDEARs
  const spy = mk.Acciones.find((a) => a.Simbolo === 'SPY') || null;
  if (d.FondoCompleto && (perfil || '').toLowerCase() !== 'conservador') {
    res.push(nuevoAviso({ Nivel: NivelAviso.Info, Orden: 5,
      Titulo: 'A 3 años o más: una parte en CEDEARs de índice',
      Detalle: 'Un CEDEAR como SPY (las 500 empresas más grandes de EE. UU.) da diversificación y cotiza al dólar CCL' +
        (spy ? ' (hoy ' + Fmt.pesosR(spy.Precio) + ', ' + (spy.Variacion.signo >= 0 ? '+' : '') + Fmt.num(spy.Variacion, 2) + ' % en el día)' : '') +
        '. Puede bajar 20-30 % en un mal año: sólo con plata que no vas a necesitar y comprando de a poco. Las acciones argentinas suben y bajan más todavía (riesgo país ' +
        Fmt.num(mk.RiesgoPais, 0) + ' puntos).' }));
  } else if (!d.FondoCompleto) {
    res.push(nuevoAviso({ Nivel: NivelAviso.Info, Orden: 5,
      Titulo: 'Acciones y CEDEARs: después del fondo de emergencia',
      Detalle: 'Son para plazos largos y pueden caer fuerte en el corto plazo. Primero asegurá la liquidez; después, con perfil moderado, una parte del ahorro mensual.' }));
  }

  // 6) Vivienda (si no hay meta cargada)
  if (d.MetasActivas === 0 && d.IngresoMensual.signo > 0) {
    const h = mk.Hipotecarios.find((x) => x.Entidad === 'BNA') || mk.MejorHipoteca;
    if (h) {
      const c = vivienda(CERO, d.IngresoMensual, mk, h.TNA, h.PlazoAnios, h.Financiamiento, h.RelacionCuota, D('0.07'), CERO, h.Entidad);
      res.push(nuevoAviso({ Nivel: NivelAviso.Info, Orden: 6,
        Titulo: '¿Casa propia? Con tu ingreso, un crédito UVA llegaría a ~USD ' + Fmt.num(c.PrestamoMaxUSD, 0),
        Detalle: h.Entidad + ' presta al ' + pct(h.TNA, 1) + ' + UVA a ' + h.PlazoAnios + ' años, con cuota de hasta el ' +
          pct(h.RelacionCuota, 0) + ' del ingreso (' + Fmt.pesosR(c.CuotaMaxima) + ') y hasta el ' + pct(h.Financiamiento, 0) +
          ' del valor. Cargá una meta de vivienda para ver cuánto tenés que juntar y para cuándo.',
        TextoAccion: 'Simular vivienda' }));
    }
  }

  // 7) Contexto
  res.push(nuevoAviso({ Nivel: NivelAviso.Info, Orden: 7,
    Titulo: 'Inflación: ' + Fmt.num(mk.InflacionMes, 1) + ' % en ' + Fmt.nombreMes(F.mes(mk.FechaInflacion)) + '; se espera ' + Fmt.num(mk.REMInflacion12m, 1) + ' % en 12 meses',
    Detalle: 'Últimos 12 meses: ' + Fmt.num(mk.Inflacion12m, 1) + ' %. Una inversión en pesos tiene que rendir más que eso para que no pierdas poder de compra.' }));
  return ordenarAvisos(res);
}

// ------------------------------------------------------------------ Plan de ahorro
export function plan(d, mk, perfil) {
  const filas = [];
  const ahorro = Dec.max(CERO, d.AhorroMensual);
  if (ahorro.signo <= 0) return filas;
  let libre = ahorro;
  const fila = (o) => ({ Destino: '', Instrumento: '', Porcentaje: CERO, MontoMensual: CERO, Riesgo: '', Liquidez: '', Rendimiento: '', ColorArgb: 0, ...o });
  if (!d.FondoCompleto) {
    const alFondo = ahorro.por(D('0.7')).redondear(0);
    filas.push(fila({ Destino: 'Fondo de emergencia', Instrumento: 'Cuenta remunerada / FCI money market', Porcentaje: D('0.7'), MontoMensual: alFondo,
      Riesgo: 'Bajo', Liquidez: 'Inmediata', Rendimiento: Fmt.pct(mk.FCIMercadoPago, 1) + ' TNA', ColorArgb: -16411031 }));
    libre = ahorro.menos(alFondo);
  }
  const r = reparto(perfil);
  const baseLibre = d.FondoCompleto ? UNO : D('0.3');
  const pesosTasa = Dec.max(Dec.max(mensualDiaria(mk.FCIMercadoPago), mk.PFMejorGrande.por(C30).div(C365)), mk.LecapCortaTEM);
  filas.push(fila({ Destino: 'Pesos a tasa (1-6 meses)', Instrumento: 'LECAP / plazo fijo / FCI', Porcentaje: r[0].por(baseLibre),
    MontoMensual: libre.por(r[0]).redondear(0), Riesgo: 'Bajo', Liquidez: '30 días a 6 meses',
    Rendimiento: '~' + Fmt.pct(pesosTasa, 2) + ' mensual', ColorArgb: -14326805 }));
  filas.push(fila({ Destino: 'Dólares (ahorro y metas)', Instrumento: 'Dólar MEP (desde el home banking)', Porcentaje: r[1].por(baseLibre),
    MontoMensual: libre.por(r[1]).redondear(0), Riesgo: 'Medio', Liquidez: 'Inmediata',
    Rendimiento: '≈ USD ' + Fmt.num(libre.por(r[1]).div(Dec.max(UNO, mk.MEP)), 0) + ' por mes', ColorArgb: -15293622 }));
  if (r[2].signo > 0) {
    filas.push(fila({ Destino: 'Largo plazo (3+ años)', Instrumento: 'CEDEARs de índice (SPY) / acciones', Porcentaje: r[2].por(baseLibre),
      MontoMensual: libre.por(r[2]).redondear(0), Riesgo: 'Alto', Liquidez: 'Inmediata (con riesgo de precio)',
      Rendimiento: 'Variable', ColorArgb: -8635667 }));
  }
  return filas;
}

// ------------------------------------------------------------------ Vivienda con crédito UVA
/** Cuota de un préstamo (sistema francés). */
export function cuotaFrances(capital, tna, meses) {
  if (meses <= 0) return CERO;
  const i = tna.aDoble() / 12.0;
  if (i <= 0.0) return capital.div(D(meses));
  return Dec.deDoble(capital.aDoble() * i / (1.0 - Math.pow(1.0 + i, -meses)));
}

/** precioUSD = 0 sólo calcula el crédito máximo. ahorroUSD = lo ya juntado. El crédito se toma en pesos (UVA) al dólar oficial. */
export function vivienda(precioUSD, ingresoARS, mk, tna, plazoAnios, financiamiento, relacionCuota, gastosPct, ahorroUSD, entidad = '') {
  const c = { Precio: precioUSD, Entidad: entidad, TNA: tna, PlazoAnios: plazoAnios, Financiamiento: financiamiento, RelacionCuota: relacionCuota,
    GastosPct: gastosPct, CuotaMaxima: CERO, PrestamoMaxARS: CERO, PrestamoMaxUSD: CERO, Prestamo: CERO, Anticipo: CERO, Gastos: CERO,
    NecesitasAhorrar: CERO, CuotaInicial: CERO, CuotaSobreIngreso: CERO, LimitadoPorIngreso: false, UVAs: CERO, PrecioMaximoHoy: CERO };
  const oficial = Dec.max(UNO, mk.Oficial);
  const meses = Math.max(1, plazoAnios * 12);
  c.CuotaMaxima = ingresoARS.por(relacionCuota).redondear(0);
  const millon = D(1000000);
  const cuotaPorPeso = cuotaFrances(millon, tna, meses).div(millon);
  c.PrestamoMaxARS = cuotaPorPeso.signo > 0 ? c.CuotaMaxima.div(cuotaPorPeso).redondear(0) : CERO;
  c.PrestamoMaxUSD = c.PrestamoMaxARS.div(oficial).redondear(0);
  if (precioUSD.signo > 0) {
    const porFinanciamiento = precioUSD.por(financiamiento);
    c.LimitadoPorIngreso = porFinanciamiento.gt(c.PrestamoMaxUSD);
    c.Prestamo = Dec.min(porFinanciamiento, c.PrestamoMaxUSD).redondear(0);
    c.Anticipo = precioUSD.menos(c.Prestamo);
    c.Gastos = precioUSD.por(gastosPct).redondear(0);
    c.NecesitasAhorrar = c.Anticipo.mas(c.Gastos);
    c.CuotaInicial = cuotaFrances(c.Prestamo.por(oficial), tna, meses).redondear(0);
    c.CuotaSobreIngreso = ingresoARS.signo > 0 ? c.CuotaInicial.div(ingresoARS) : CERO;
    c.UVAs = mk.UVA.signo > 0 ? c.Prestamo.por(oficial).div(mk.UVA).redondear(0) : CERO;
  }
  const divisor1 = UNO.menos(financiamiento).mas(gastosPct);
  const p1 = divisor1.signo > 0 ? ahorroUSD.div(divisor1) : CERO;
  if (p1.por(financiamiento).le(c.PrestamoMaxUSD)) c.PrecioMaximoHoy = p1.redondear(0);
  else c.PrecioMaximoHoy = ahorroUSD.mas(c.PrestamoMaxUSD).div(UNO.mas(gastosPct)).redondear(0);
  return c;
}

// ------------------------------------------------------------------ Metas
/** Parte del ahorro mensual que se sugiere destinar a metas (con el fondo de emergencia completo). */
export const PARTE_METAS = D('0.6');

export function estado(meta, d, mk, hoy, cantidadMetas = 1) {
  const e = { Meta: meta, Objetivo: CERO, Faltante: CERO, Progreso: CERO, AporteMensual: CERO, AporteSugerido: false, Meses: null,
    FechaEstimada: null, AporteNecesario: null, Vivienda: null, AporteTodo: CERO, MesesConTodo: null, EsperaFondo: 0, AporteEn5Anios: CERO, PrecioEn5Anios: CERO };
  if (meta.Tipo === 'Vivienda' && meta.Moneda === 'USD') {
    const precio = meta.Monto.signo > 0 ? meta.Monto : meta.M2.por(meta.PrecioM2.signo > 0 ? meta.PrecioM2 : D(2476));
    if (meta.UsaCredito) {
      e.Vivienda = vivienda(precio, d.IngresoMensual, mk, meta.TNACredito, meta.PlazoAnios, meta.PctFinanciado, D('0.25'), meta.GastosCompraPct, meta.Ahorrado);
      e.Objetivo = e.Vivienda.NecesitasAhorrar;
    } else {
      e.Objetivo = precio.por(UNO.mas(meta.GastosCompraPct)).redondear(0);
    }
  } else {
    e.Objetivo = meta.Monto;
  }
  e.Faltante = Dec.max(CERO, e.Objetivo.menos(meta.Ahorrado));
  e.Progreso = e.Objetivo.signo > 0 ? Dec.min(UNO, meta.Ahorrado.div(e.Objetivo)) : CERO;
  e.AporteTodo = ahorroEn(d, mk, meta.Moneda);
  if (meta.AporteMensual.signo > 0) {
    e.AporteMensual = meta.AporteMensual;
    e.Meses = mesesParaJuntar(e.Faltante, e.AporteMensual, 0);
  } else {
    e.AporteMensual = redondear(e.AporteTodo.por(PARTE_METAS).div(D(Math.max(1, cantidadMetas))), meta.Moneda);
    e.AporteSugerido = true;
    e.EsperaFondo = mesesHastaFondo(d);
    e.Meses = mesesParaJuntar(e.Faltante, e.AporteMensual, e.EsperaFondo);
  }
  if (e.Meses !== null) e.FechaEstimada = F.sumarMeses(hoy, e.Meses);
  e.MesesConTodo = mesesParaJuntar(e.Faltante, e.AporteTodo, 0);
  e.AporteEn5Anios = redondear(e.Faltante.div(C60), meta.Moneda);
  if (e.Vivienda) {
    const juntado = meta.Ahorrado.mas(e.AporteTodo.por(C60));
    e.PrecioEn5Anios = vivienda(CERO, d.IngresoMensual, mk, meta.TNACredito, meta.PlazoAnios, meta.PctFinanciado, D('0.25'), meta.GastosCompraPct, juntado).PrecioMaximoHoy;
  }
  if (meta.FechaObjetivo !== null && meta.FechaObjetivo > hoy && e.Faltante.signo > 0) {
    const fo = F.ymd(meta.FechaObjetivo), h = F.ymd(hoy);
    const mesesHasta = Math.max(1, ((fo.y - h.y) * 12) + fo.m - h.m);
    e.AporteNecesario = redondear(e.Faltante.div(D(mesesHasta)), meta.Moneda);
  }
  return e;
}

/** Dólares sin decimales; pesos redondeados a miles. */
export function redondear(v, moneda) {
  if (moneda === 'USD') return v.redondear(0);
  return v.div(C1000).redondear(0).por(C1000);
}

/** Todo el ahorro mensual expresado en una moneda (los dólares al MEP). */
export function ahorroEn(d, mk, moneda) {
  const a = Dec.max(CERO, d.AhorroMensual);
  return moneda === 'USD' ? a.div(Dec.max(UNO, mk.MEP)).redondear(0) : a;
}

/** Meses hasta completar el fondo de emergencia, destinándole el 70 % del ahorro. */
export function mesesHastaFondo(d) {
  if (d.FondoCompleto || d.AhorroMensual.signo <= 0) return 0;
  return d.FaltaFondo.div(d.AhorroMensual.por(D('0.7'))).techo().aEntero();
}

/** Meses para juntar lo que falta. Durante "mesesFondo" meses se aporta el 30 %. null = más de 100 años o sin aporte. */
export function mesesParaJuntar(faltante, aporte, mesesFondo) {
  if (faltante.signo <= 0) return 0;
  if (aporte.signo <= 0) return null;
  let resto = faltante;
  let meses = 0;
  if (mesesFondo > 0) {
    const inicial = aporte.por(D('0.3'));
    if (inicial.por(D(mesesFondo)).ge(resto)) return resto.div(inicial).techo().aEntero();
    resto = resto.menos(inicial.por(D(mesesFondo)));
    meses = mesesFondo;
  }
  meses += resto.div(aporte).techo().aEntero();
  if (meses > 1200) return null;
  return meses;
}

export { ordenarEstable };
