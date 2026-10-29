// ============================================================================
//  Motor de cálculo (igual que src/Nucleo/Motor.vb): resúmenes de tarjeta, saldos
//  con intereses, fijos, proyecciones, cuotas e historial mensual.
// ============================================================================

import { Dec, D, CERO } from './decimal.js';
import { F } from './fecha.js';
import { Per, Fmt } from './formato.js';
import { nuevo, esDeTarjeta } from './modelo.js';

export const EstadoResumen = { Futuro: 0, Abierto: 1, Cerrado: 2, Vencido: 3, Pagado: 4, SinConsumos: 5 };
export const NOMBRE_ESTADO = ['Futuro', 'Abierto', 'Cerrado', 'Vencido', 'Pagado', 'SinConsumos'];
export const TipoItem = { Consumo: 0, Cuota: 1, Fijo: 2, Credito: 3 };

const C100 = D(100), C365 = D(365), C12 = D(12);

export class ItemResumen {
  constructor(o) {
    this.Mov = null; this.Rec = null; this.Fecha = 0; this.Descripcion = ''; this.Categoria = ''; this.Moneda = 'ARS';
    this.Monto = CERO; this.CuotaNum = 1; this.CuotaTotal = 1; this.Virtual = false;
    Object.assign(this, o);
  }
  get Tipo() {
    if (this.Monto.signo < 0) return TipoItem.Credito;
    if (this.Rec || (this.Mov && this.Mov.RecurrenteId !== 0)) return TipoItem.Fijo;
    if (this.CuotaTotal > 1) return TipoItem.Cuota;
    return TipoItem.Consumo;
  }
  get TextoTipo() {
    switch (this.Tipo) {
      case TipoItem.Cuota: return 'Cuota ' + this.CuotaNum + '/' + this.CuotaTotal;
      case TipoItem.Fijo: return this.Virtual ? 'Fijo (auto)' : (this.Mov && this.Mov.Monto.esCero ? 'Fijo (omitido)' : 'Fijo');
      case TipoItem.Credito: return 'Crédito';
      default: return 'Consumo';
    }
  }
  enPesos(dolar) { return this.Moneda === 'USD' ? this.Monto.por(dolar) : this.Monto; }
}

export class Resumen {
  constructor(t, p) {
    this.Tarjeta = t; this.Periodo = p; this.Inicio = 0; this.Cierre = 0; this.Vencimiento = 0; this.Items = [];
    this.TotalARS = CERO; this.TotalUSD = CERO; this.RealARS = null; this.RealUSD = null; this.PagadoARS = CERO; this.PagadoUSD = CERO;
    this.PesosPorUSD = CERO; this.MarcadoPagado = false; this.FechaUltimoPago = null; this.Nota = '';
  }
  get AbonarARS() { return this.RealARS !== null ? this.RealARS : this.TotalARS; }
  get AbonarUSD() { return this.RealUSD !== null ? this.RealUSD : this.TotalUSD; }
  get PendienteARS() { return this.MarcadoPagado ? CERO : Dec.max(CERO, this.AbonarARS.menos(this.PagadoARS)); }
  get PendienteUSD() { return this.MarcadoPagado ? CERO : Dec.max(CERO, this.AbonarUSD.menos(this.PagadoUSD)); }
  get TieneConsumos() { return this.Items.length > 0 || !this.AbonarARS.esCero || !this.AbonarUSD.esCero; }
  totalPesos(dolar) { return this.AbonarARS.mas(this.AbonarUSD.por(dolar)); }
  pendientePesos(dolar) { return this.PendienteARS.mas(this.PendienteUSD.por(dolar)); }
  estado(hoy) {
    if (this.MarcadoPagado) return EstadoResumen.Pagado;
    if (hoy < this.Inicio) return EstadoResumen.Futuro;
    if (hoy <= this.Cierre) return EstadoResumen.Abierto;
    if (!this.TieneConsumos || (this.AbonarARS.signo <= 0 && this.AbonarUSD.signo <= 0)) return EstadoResumen.SinConsumos;
    if (this.PendienteARS.le(D('0.5')) && this.PendienteUSD.le(D('0.005'))) return EstadoResumen.Pagado;
    if (hoy > this.Vencimiento) return EstadoResumen.Vencido;
    return EstadoResumen.Cerrado;
  }
  suma(tipo, dolar) {
    let s = CERO;
    for (const it of this.Items) if (it.Tipo === tipo) s = s.mas(it.enPesos(dolar));
    return s;
  }
  sumaMoneda(tipo, moneda) {
    let s = CERO;
    for (const it of this.Items) if (it.Tipo === tipo && it.Moneda === moneda) s = s.mas(it.Monto);
    return s;
  }
  static textoEstado(e) {
    return ['Próximo', 'Abierto', 'Cerrado', 'Vencido', 'Pagado', 'Sin consumos'][e];
  }
}

export class Ocurrencia {
  constructor(o) { this.Rec = null; this.Fecha = 0; this.Periodo = 0; this.Registrado = null; Object.assign(this, o); }
  get Pendiente() { return this.Registrado === null; }
}

export class MesProyeccion {
  constructor(o) {
    this.Periodo = 0; this.SaldoInicial = CERO; this.Ingresos = CERO; this.Rendimientos = CERO; this.FijosCuenta = CERO;
    this.TarjCuotas = CERO; this.TarjFijos = CERO; this.TarjConsumos = CERO; this.TarjEstimado = CERO; this.Simulado = CERO; this.SaldoFinal = CERO;
    this.Detalle = [];
    Object.assign(this, o);
  }
  get Tarjetas() { return this.TarjCuotas.mas(this.TarjFijos).mas(this.TarjConsumos).mas(this.TarjEstimado).mas(this.Simulado); }
  get Egresos() { return this.FijosCuenta.mas(this.Tarjetas); }
  get Resultado() { return this.Ingresos.mas(this.Rendimientos).menos(this.Egresos); }
}

export class ResumenMes {
  constructor(p) {
    this.Periodo = p; this.Ingresos = CERO; this.Rendimientos = CERO; this.GastosCuenta = CERO; this.Tarjetas = CERO;
    this.Resumenes = []; this.PorCategoria = new Map(); this.IngresosPorCategoria = new Map(); this.Gastos = [];
  }
  get Egresos() { return this.GastosCuenta.mas(this.Tarjetas); }
  get Resultado() { return this.Ingresos.mas(this.Rendimientos).menos(this.Egresos); }
  get TasaAhorro() {
    const ing = this.Ingresos.mas(this.Rendimientos);
    if (ing.signo <= 0) return CERO;
    return this.Resultado.div(ing);
  }
  get TieneDatos() { return !this.Ingresos.esCero || !this.Egresos.esCero; }
  /** Diccionario sin distinguir mayúsculas (como StringComparer.OrdinalIgnoreCase). */
  sumarCategoria(dic, cat, v) {
    const k = cat && cat.trim() ? cat : 'Sin categoría';
    const clave = [...dic.keys()].find((x) => x.toLowerCase() === k.toLowerCase());
    if (clave !== undefined) dic.set(clave, dic.get(clave).mas(v));
    else dic.set(k, CERO.mas(v));
  }
  categoria(dic, k) {
    const clave = [...dic.keys()].find((x) => x.toLowerCase() === k.toLowerCase());
    return clave !== undefined ? dic.get(clave) : CERO;
  }
}

export class Motor {
  constructor(libro) {
    this.L = libro;
    this.HoyFijo = null;
    this.invalidar();
  }

  get Hoy() { return this.HoyFijo !== null ? Math.floor(this.HoyFijo) : F.hoy(); }
  get Dolar() { return this.L.config.DolarTarjeta; }

  invalidar() {
    this.cacheResumen = new Map();
    this.cacheSaldo = new Map();
    this.cachePrimer = new Map();
    this.cacheInfo = null;
    this.cacheMovsTarjeta = null;
    this.cacheMaterial = null;
    this.cachePagos = null;
    this.cacheImpactos = null;
  }

  // ============================================================ Resúmenes
  info(tarjetaId, periodo) {
    if (!this.cacheInfo) {
      this.cacheInfo = new Map();
      for (const r of this.L.resumenes) this.cacheInfo.set(r.TarjetaId + '|' + r.Periodo, r);
    }
    return this.cacheInfo.get(tarjetaId + '|' + periodo) || null;
  }

  infoOCrear(tarjetaId, periodo) {
    let i = this.info(tarjetaId, periodo);
    if (!i) {
      i = nuevo('Resumen', { TarjetaId: tarjetaId, Periodo: periodo });
      this.L.resumenes.push(i);
      this.cacheInfo = null;
    }
    return i;
  }

  static vencimientoPorDefecto(t, p) {
    let d = Per.diaEn(p, t.DiaVencimiento);
    if (F.diaSemana(d) === 6) d += 2;
    if (F.diaSemana(d) === 0) d += 1;
    return d;
  }

  static cierrePorDefecto(t, p) {
    const pc = t.DiaVencimiento > t.DiaCierre ? p : Per.sumar(p, -1);
    let d = Per.diaEn(pc, t.DiaCierre);
    if (F.diaSemana(d) === 6) d -= 1;
    if (F.diaSemana(d) === 0) d -= 2;
    return d;
  }

  cierre(t, p) {
    const i = this.info(t.Id, p);
    if (i && i.Cierre !== null) return Math.floor(i.Cierre);
    return Motor.cierrePorDefecto(t, p);
  }

  vencimiento(t, p) {
    const i = this.info(t.Id, p);
    if (i && i.Vencimiento !== null) return Math.floor(i.Vencimiento);
    return Motor.vencimientoPorDefecto(t, p);
  }

  inicio(t, p) { return this.cierre(t, Per.sumar(p, -1)) + 1; }

  /** Mes de pago del resumen en el que cae una compra hecha en esa fecha. */
  periodoDeCompra(t, fecha) {
    const f = Math.floor(fecha);
    const mesCierre = F.dia(f) <= t.DiaCierre ? Per.de(f) : Per.sumar(Per.de(f), 1);
    let p = t.DiaVencimiento > t.DiaCierre ? mesCierre : Per.sumar(mesCierre, 1);
    let guarda = 0;
    while (f > this.cierre(t, p) && guarda < 36) { p = Per.sumar(p, 1); guarda++; }
    guarda = 0;
    while (f <= this.cierre(t, Per.sumar(p, -1)) && guarda < 36) { p = Per.sumar(p, -1); guarda++; }
    return p;
  }

  periodoAbierto(t) { return this.periodoDeCompra(t, this.Hoy); }

  primerPeriodo(m) {
    if (m.PeriodoForzado > 0) return m.PeriodoForzado;
    if (m.Id !== 0 && this.cachePrimer.has(m.Id)) return this.cachePrimer.get(m.Id);
    const t = this.L.tarjeta(m.TarjetaId);
    if (!t) return Per.de(m.Fecha);
    const p = this.periodoDeCompra(t, m.Fecha);
    if (m.Id !== 0) this.cachePrimer.set(m.Id, p);
    return p;
  }

  ultimoPeriodo(m) { return Per.sumar(this.primerPeriodo(m), Math.max(1, m.Cuotas) - 1); }

  static cuotaMonto(m, k) {
    const n = Math.max(1, m.Cuotas);
    if (n === 1) return m.Monto;
    const c = m.Monto.div(D(n)).redondear(2, 'lejos');
    if (k < n) return c;
    return m.Monto.menos(c.por(D(n - 1)));
  }

  movsTarjeta(tarjetaId) {
    if (!this.cacheMovsTarjeta) {
      this.cacheMovsTarjeta = new Map();
      for (const m of this.L.movimientos) {
        if (!esDeTarjeta(m)) continue;
        if (!this.cacheMovsTarjeta.has(m.TarjetaId)) this.cacheMovsTarjeta.set(m.TarjetaId, []);
        this.cacheMovsTarjeta.get(m.TarjetaId).push(m);
      }
    }
    return this.cacheMovsTarjeta.get(tarjetaId) || [];
  }

  /** Movimiento ya registrado para un fijo en un período (null si no hay). */
  movimientoDeFijo(recId, periodo) {
    if (!this.cacheMaterial) {
      this.cacheMaterial = new Map();
      for (const m of this.L.movimientos) {
        if (m.RecurrenteId !== 0) {
          const k = m.RecurrenteId + '|' + m.PeriodoRecurrente;
          if (!this.cacheMaterial.has(k)) this.cacheMaterial.set(k, m);
        }
      }
    }
    return this.cacheMaterial.get(recId + '|' + periodo) || null;
  }

  pagos(tarjetaId, periodo) {
    if (!this.cachePagos) {
      this.cachePagos = new Map();
      for (const m of this.L.movimientos) {
        if (m.Tipo !== 'PagoTarjeta') continue;
        const k = m.TarjetaId + '|' + m.PeriodoResumen;
        if (!this.cachePagos.has(k)) this.cachePagos.set(k, []);
        this.cachePagos.get(k).push(m);
      }
    }
    return this.cachePagos.get(tarjetaId + '|' + periodo) || [];
  }

  static vigente(r, desde, hasta) {
    if (!r.Activo) return false;
    if (Math.floor(r.Desde) > Math.floor(hasta)) return false;
    if (r.Hasta !== null && Math.floor(r.Hasta) < Math.floor(desde)) return false;
    return true;
  }

  static fechaEnCiclo(dia, inicio, cierre) {
    let f = Per.diaEn(Per.de(inicio), dia);
    if (f < inicio) f = Per.diaEn(Per.sumar(Per.de(inicio), 1), dia);
    if (f > cierre) f = cierre;
    return f;
  }

  resumenDe(t, p) {
    const k = t.Id + '|' + p;
    if (this.cacheResumen.has(k)) return this.cacheResumen.get(k);
    const r = new Resumen(t, p);
    r.Cierre = this.cierre(t, p);
    r.Vencimiento = this.vencimiento(t, p);
    r.Inicio = this.inicio(t, p);

    const items = [];
    for (const m of this.movsTarjeta(t.Id)) {
      const n = Math.max(1, m.Cuotas);
      const c = Per.diferencia(this.primerPeriodo(m), p) + 1;
      if (c < 1 || c > n) continue;
      const signo = m.Tipo === 'Ingreso' ? D(-1) : D(1);
      items.push(new ItemResumen({ Mov: m, Fecha: m.Fecha, Descripcion: m.Descripcion, Categoria: m.Categoria, Moneda: m.Moneda,
        Monto: signo.por(Motor.cuotaMonto(m, c)), CuotaNum: c, CuotaTotal: n }));
    }
    // Fijos de tarjeta todavía no registrados (suscripciones, etc.)
    if (p >= this.L.config.PeriodoInicial) {
      for (const rc of this.L.recurrentes) {
        if (rc.TarjetaId !== t.Id || rc.Tipo !== 'Gasto') continue;
        if (!Motor.vigente(rc, r.Inicio, r.Cierre)) continue;
        if (this.movimientoDeFijo(rc.Id, p) !== null) continue;
        items.push(new ItemResumen({ Rec: rc, Virtual: true, Fecha: Motor.fechaEnCiclo(rc.Dia, r.Inicio, r.Cierre),
          Descripcion: rc.Descripcion, Categoria: rc.Categoria, Moneda: rc.Moneda, Monto: rc.Monto }));
      }
    }
    r.Items = ordenarEstable(items, (a, b) => (a.Fecha - b.Fecha) || compararTexto(a.Descripcion, b.Descripcion));
    for (const it of r.Items) {
      if (it.Moneda === 'USD') r.TotalUSD = r.TotalUSD.mas(it.Monto); else r.TotalARS = r.TotalARS.mas(it.Monto);
    }
    const inf = this.info(t.Id, p);
    if (inf) {
      r.RealARS = inf.TotalRealARS;
      r.RealUSD = inf.TotalRealUSD;
      r.MarcadoPagado = inf.Pagado;
      r.Nota = inf.Nota;
    }
    for (const pg of this.pagos(t.Id, p)) {
      if (pg.Moneda === 'USD') {
        r.PagadoUSD = r.PagadoUSD.mas(pg.Monto);
        const cta = this.L.cuenta(pg.CuentaId);
        if (cta && cta.Moneda === 'ARS') r.PesosPorUSD = r.PesosPorUSD.mas(!pg.MontoCuenta.esCero ? pg.MontoCuenta : pg.Monto);
      } else {
        r.PagadoARS = r.PagadoARS.mas(pg.Monto);
      }
      if (r.FechaUltimoPago === null || pg.Fecha > r.FechaUltimoPago) r.FechaUltimoPago = pg.Fecha;
    }
    this.cacheResumen.set(k, r);
    return r;
  }

  resumenes(t, desde, hasta) {
    const res = [];
    for (let p = desde; p <= hasta; p = Per.sumar(p, 1)) res.push(this.resumenDe(t, p));
    return res;
  }

  tarjetasActivas() { return this.L.tarjetas.filter((t) => t.Activa); }

  /** Días hasta pagar una compra hecha hoy con esa tarjeta. */
  diasFinanciacion(t, fecha = null) {
    const f = fecha !== null ? Math.floor(fecha) : this.Hoy;
    const p = this.periodoDeCompra(t, f);
    return this.vencimiento(t, p) - f;
  }

  // ============================================================ Cuentas y saldos
  static impacto(m, cuentaId) {
    switch (m.Tipo) {
      case 'Gasto': if (m.TarjetaId === 0 && m.CuentaId === cuentaId) return m.Monto.neg(); break;
      case 'Ingreso': if (m.TarjetaId === 0 && m.CuentaId === cuentaId) return m.Monto; break;
      case 'Ajuste': if (m.CuentaId === cuentaId) return m.Monto; break;
      case 'Transferencia': {
        let r = CERO;
        if (m.CuentaId === cuentaId) r = r.menos(m.Monto);
        if (m.CuentaDestinoId === cuentaId) r = r.mas(!m.MontoDestino.esCero ? m.MontoDestino : m.Monto);
        return r;
      }
      case 'PagoTarjeta': if (m.CuentaId === cuentaId) return (!m.MontoCuenta.esCero ? m.MontoCuenta : m.Monto).neg(); break;
    }
    return CERO;
  }

  impactosPorDia(cuentaId) {
    if (!this.cacheImpactos) {
      this.cacheImpactos = new Map();
      for (const m of this.L.movimientos) {
        const cuentas = new Set();
        if (m.CuentaId !== 0) cuentas.add(m.CuentaId);
        if (m.CuentaDestinoId !== 0) cuentas.add(m.CuentaDestinoId);
        for (const cid of cuentas) {
          const imp = Motor.impacto(m, cid);
          if (imp.esCero) continue;
          if (!this.cacheImpactos.has(cid)) this.cacheImpactos.set(cid, new Map());
          const dic = this.cacheImpactos.get(cid);
          const dia = Math.floor(m.Fecha);
          dic.set(dia, (dic.get(dia) || CERO).mas(imp));
        }
      }
    }
    return this.cacheImpactos.get(cuentaId) || new Map();
  }

  /** Saldo de la cuenta al final del día (con intereses estimados hasta el día anterior). */
  saldo(c, fecha = null) {
    const f = Math.floor(fecha === null ? this.Hoy : fecha);
    const k = c.Id + '|' + f;
    if (this.cacheSaldo.has(k)) return this.cacheSaldo.get(k);
    const v = this.saldoConInteres(c, f, Infinity).saldo;
    this.cacheSaldo.set(k, v);
    return v;
  }

  /** Simula día por día. Devuelve { saldo, interes } (interés ganado en los días >= interesDesde). */
  saldoConInteres(c, fecha, interesDesde) {
    let interes = CERO;
    const inicio = Math.floor(c.FechaSaldoInicial);
    const f = Math.floor(fecha);
    if (f < inicio) return { saldo: c.SaldoInicial, interes };
    const porDia = this.impactosPorDia(c.Id);
    if (!c.Remunerada || c.TNA.signo <= 0) {
      let s = c.SaldoInicial;
      for (const [dia, v] of porDia) if (dia >= inicio && dia <= f) s = s.mas(v);
      return { saldo: s, interes };
    }
    const tasa = c.TNA.div(C365);
    let saldoDia = c.SaldoInicial;
    for (let d = inicio; d <= f; d++) {
      const imp = porDia.get(d);
      if (imp !== undefined) saldoDia = saldoDia.mas(imp);
      if (d < f) {
        const gan = saldoDia.signo > 0 ? saldoDia.por(tasa).redondear(2, 'lejos') : CERO;
        saldoDia = saldoDia.mas(gan);
        if (d >= interesDesde) interes = interes.mas(gan);
      }
    }
    return { saldo: saldoDia, interes };
  }

  /** Intereses estimados ganados entre dos fechas (inclusive), hasta ayer. */
  interesEntre(c, desde, hasta) {
    if (!c.Remunerada || c.TNA.signo <= 0) return CERO;
    const limite = hasta + 1 < this.Hoy ? hasta + 1 : this.Hoy;
    if (limite <= desde) return CERO;
    return this.saldoConInteres(c, limite, desde).interes;
  }

  disponibleARS(fecha = null) {
    const f = fecha === null ? this.Hoy : fecha;
    let s = CERO;
    for (const c of this.L.cuentas) if (c.Activa && c.Moneda === 'ARS') s = s.mas(this.saldo(c, f));
    return s;
  }

  disponibleUSD(fecha = null) {
    const f = fecha === null ? this.Hoy : fecha;
    let s = CERO;
    for (const c of this.L.cuentas) if (c.Activa && c.Moneda === 'USD') s = s.mas(this.saldo(c, f));
    return s;
  }

  ultimoAjuste(c) {
    let ult = Math.floor(c.FechaSaldoInicial);
    for (const m of this.L.movimientos) if (m.Tipo === 'Ajuste' && m.CuentaId === c.Id && m.Fecha > ult) ult = Math.floor(m.Fecha);
    return ult;
  }

  // ============================================================ Fijos
  ocurrencias(desde, hasta) {
    const res = [];
    const pIni = Math.max(Per.de(desde), this.L.config.PeriodoInicial);
    const pFin = Per.de(hasta);
    for (const rc of this.L.recurrentes) {
      if (rc.TarjetaId !== 0 || rc.CuentaId === 0 || !rc.Activo) continue;
      for (let p = pIni; p <= pFin; p = Per.sumar(p, 1)) {
        const f = Per.diaEn(p, rc.Dia);
        if (f >= Math.floor(desde) && f <= Math.floor(hasta) && f >= Math.floor(rc.Desde) && (rc.Hasta === null || f <= Math.floor(rc.Hasta))) {
          res.push(new Ocurrencia({ Rec: rc, Fecha: f, Periodo: p, Registrado: this.movimientoDeFijo(rc.Id, p) }));
        }
      }
    }
    return ordenarEstable(res, (a, b) => (a.Fecha - b.Fecha) || compararTexto(a.Rec.Descripcion, b.Rec.Descripcion));
  }

  /** Registra los fijos con "registrar automáticamente" cuyo día ya llegó. */
  registrarAutomaticos() {
    const creados = [];
    for (const oc of this.ocurrencias(Per.primerDia(this.L.config.PeriodoInicial), this.Hoy)) {
      if (!oc.Pendiente || !oc.Rec.AutoRegistrar) continue;
      const m = nuevo('Movimiento', { Id: this.L.nuevoId(), Fecha: oc.Fecha, Tipo: oc.Rec.Tipo, Descripcion: oc.Rec.Descripcion,
        Categoria: oc.Rec.Categoria, Monto: oc.Rec.Monto, Moneda: oc.Rec.Moneda, CuentaId: oc.Rec.CuentaId,
        RecurrenteId: oc.Rec.Id, PeriodoRecurrente: oc.Periodo, Auto: true });
      this.L.movimientos.push(m);
      creados.push(m);
    }
    if (creados.length) this.invalidar();
    return creados;
  }

  /** Cuando un resumen ya cerró, sus fijos automáticos se registran como movimientos reales. */
  materializarFijosDeTarjeta() {
    const creados = [];
    for (const t of this.L.tarjetas) {
      const pAbierto = this.periodoAbierto(t);
      for (let p = this.L.config.PeriodoInicial; p < pAbierto; p = Per.sumar(p, 1)) {
        const r = this.resumenDe(t, p);
        for (const it of r.Items.filter((x) => x.Virtual)) {
          const m = nuevo('Movimiento', { Id: this.L.nuevoId(), Fecha: it.Fecha, Tipo: 'Gasto', Descripcion: it.Rec.Descripcion,
            Categoria: it.Rec.Categoria, Monto: it.Rec.Monto, Moneda: it.Rec.Moneda, TarjetaId: t.Id,
            Cuotas: 1, RecurrenteId: it.Rec.Id, PeriodoRecurrente: p, PeriodoForzado: p, Auto: true });
          this.L.movimientos.push(m);
          creados.push(m);
        }
      }
    }
    if (creados.length) this.invalidar();
    return creados;
  }

  /** Tarjetas con débito automático: el día del vencimiento se registra solo el pago del total. */
  registrarDebitosAutomaticos() {
    const creados = [];
    for (const t of this.L.tarjetas) {
      if (!t.Activa || !t.DebitoAutomatico) continue;
      const cta = this.L.cuenta(t.CuentaPagoId);
      if (!cta || cta.Moneda !== 'ARS') continue;
      const pa = this.periodoAbierto(t);
      for (let q = this.L.config.PeriodoInicial; q <= pa; q = Per.sumar(q, 1)) {
        const r = this.resumenDe(t, q);
        const inf = this.info(t.Id, q);
        const yaProcesado = inf !== null && inf.DebitoRegistrado;
        if (!yaProcesado && r.Vencimiento <= this.Hoy && this.Hoy > r.Cierre && !r.MarcadoPagado) {
          const antes = creados.length;
          const desc = 'Débito automático resumen ' + t.Nombre + ' ' + Fmt.periodoCorto(q);
          if (r.PendienteARS.gt(D('0.5'))) {
            creados.push(nuevo('Movimiento', { Id: this.L.nuevoId(), Fecha: r.Vencimiento, Tipo: 'PagoTarjeta', Descripcion: desc,
              Categoria: 'Pago de tarjeta', Monto: r.PendienteARS, Moneda: 'ARS', CuentaId: cta.Id, TarjetaId: t.Id, PeriodoResumen: q, Auto: true }));
          }
          if (r.PendienteUSD.gt(D('0.005'))) {
            const m = nuevo('Movimiento', { Id: this.L.nuevoId(), Fecha: r.Vencimiento, Tipo: 'PagoTarjeta', Descripcion: desc + ' (USD)',
              Categoria: 'Pago de tarjeta', Monto: r.PendienteUSD, Moneda: 'USD', CuentaId: cta.Id, TarjetaId: t.Id, PeriodoResumen: q, Auto: true });
            m.MontoCuenta = r.PendienteUSD.por(this.Dolar).redondear(2);
            m.Nota = 'Dólar tarjeta ' + Fmt.pesos(this.Dolar);
            creados.push(m);
          }
          if (creados.length > antes) {
            this.infoOCrear(t.Id, q).DebitoRegistrado = true;
            this.L.movimientos.push(...creados.slice(antes));
            this.invalidar();
          }
        }
      }
    }
    return creados;
  }

  noDebitarVencidos(t) {
    const pa = this.periodoAbierto(t);
    for (let q = this.L.config.PeriodoInicial; q <= pa; q = Per.sumar(q, 1)) {
      if (this.vencimiento(t, q) < this.Hoy) this.infoOCrear(t.Id, q).DebitoRegistrado = true;
    }
    this.invalidar();
  }

  /** Si un movimiento nuevo coincide con un fijo pendiente del mismo mes, lo vincula. */
  vincularConFijo(m) {
    if (m.RecurrenteId !== 0 || m.CuentaId === 0 || m.TarjetaId !== 0) return;
    if (m.Tipo !== 'Ingreso' && m.Tipo !== 'Gasto') return;
    const desc = Fmt.normalizar(m.Descripcion);
    if (desc.length < 3) return;
    for (const oc of this.ocurrencias(Per.primerDia(Per.de(m.Fecha)), Per.ultimoDia(Per.de(m.Fecha)))) {
      if (!oc.Pendiente || oc.Rec.Tipo !== m.Tipo || oc.Rec.CuentaId !== m.CuentaId) continue;
      const dr = Fmt.normalizar(oc.Rec.Descripcion);
      if (dr === desc || dr.includes(desc) || desc.includes(dr)) {
        m.RecurrenteId = oc.Rec.Id;
        m.PeriodoRecurrente = oc.Periodo;
        return;
      }
    }
  }

  // ============================================================ Estimaciones de tarjeta
  consumoVariable(r) { return r.suma(TipoItem.Consumo, this.Dolar); }

  ritmoCierre(r) {
    const dias = Math.max(1, (r.Cierre - r.Inicio) + 1);
    const trans = (this.Hoy - r.Inicio) + 1;
    const v = this.consumoVariable(r);
    if (trans < 1) return CERO;
    if (trans >= dias || trans < 4) return v;
    return v.div(D(trans)).por(D(dias)).redondear(2);
  }

  /** Consumo variable mensual esperado. Devuelve { valor, origen }. */
  estimadoMensualConOrigen(t) {
    if (t.ConsumoEstimado.signo > 0) return { valor: t.ConsumoEstimado, origen: 'valor que cargaste' };
    const pAbierto = this.periodoAbierto(t);
    const historicos = [];
    for (let p = Per.sumar(pAbierto, -1); p >= this.L.config.PeriodoInicial && historicos.length < 3; p = Per.sumar(p, -1)) {
      const v = this.consumoVariable(this.resumenDe(t, p));
      if (v.signo > 0) historicos.push(v);
    }
    if (historicos.length > 0) {
      return { valor: Dec.promedio(historicos).redondear(2),
        origen: historicos.length === 1 ? 'último resumen' : 'promedio de los últimos ' + historicos.length + ' resúmenes' };
    }
    const ritmo = this.ritmoCierre(this.resumenDe(t, pAbierto));
    if (ritmo.signo > 0) return { valor: ritmo, origen: 'ritmo del resumen actual' };
    return { valor: CERO, origen: 'sin datos todavía' };
  }

  estimadoMensual(t) { return this.estimadoMensualConOrigen(t).valor; }

  estimadoPendiente(r) {
    if (this.Hoy > r.Cierre) return CERO;
    const dias = Math.max(1, (r.Cierre - r.Inicio) + 1);
    const restantes = this.Hoy < r.Inicio ? dias : (r.Cierre - this.Hoy);
    return this.estimadoMensual(r.Tarjeta).por(D(restantes)).div(D(dias)).redondear(2);
  }

  totalEstimadoCierre(r) { return r.totalPesos(this.Dolar).mas(this.estimadoPendiente(r)); }

  // ============================================================ Compromisos
  periodosPendientes() {
    const conj = new Set();
    for (const t of this.tarjetasActivas()) {
      const pa = this.periodoAbierto(t);
      for (let q = this.L.config.PeriodoInicial; q <= pa; q = Per.sumar(q, 1)) {
        const e = this.resumenDe(t, q).estado(this.Hoy);
        if (e === EstadoResumen.Abierto || e === EstadoResumen.Cerrado || e === EstadoResumen.Vencido) conj.add(q);
      }
    }
    return [...conj].sort((a, b) => a - b);
  }

  periodoAPagar() {
    for (const q of this.periodosPendientes()) {
      for (const t of this.tarjetasActivas()) {
        if (this.resumenDe(t, q).pendientePesos(this.Dolar).signo > 0) return q;
      }
    }
    return Math.max(this.L.config.PeriodoInicial, Per.sumar(Per.de(this.Hoy), 1));
  }

  aPagarHasta(periodo) {
    let s = CERO;
    for (const t of this.tarjetasActivas()) {
      for (let q = this.L.config.PeriodoInicial; q <= periodo; q = Per.sumar(q, 1)) s = s.mas(this.resumenDe(t, q).pendientePesos(this.Dolar));
    }
    return s;
  }

  fijosPendientes(hasta, ingresos) {
    let s = CERO;
    for (const oc of this.ocurrencias(Per.primerDia(Per.de(this.Hoy)), hasta)) {
      if (!oc.Pendiente) continue;
      if ((oc.Rec.Tipo === 'Ingreso') !== ingresos) continue;
      s = s.mas(oc.Rec.Monto.por(oc.Rec.Moneda === 'USD' ? this.L.config.DolarMEP : D(1)));
    }
    return s;
  }

  libreDespuesDePagar(periodo) {
    const fin = Per.ultimoDia(periodo);
    return this.disponibleARS().mas(this.fijosPendientes(fin, true)).menos(this.fijosPendientes(fin, false)).menos(this.aPagarHasta(periodo));
  }

  // ============================================================ Cuotas
  cuotasPorPeriodo(meses) {
    const res = [];
    const p0 = Math.max(Per.de(this.Hoy), this.L.config.PeriodoInicial);
    for (let i = 0; i < meses; i++) {
      const p = Per.sumar(p0, i);
      const cp = { Periodo: p, Total: CERO, Items: [], Terminan: [] };
      for (const t of this.tarjetasActivas()) {
        const r = this.resumenDe(t, p);
        if (r.estado(this.Hoy) === EstadoResumen.Pagado) continue;
        for (const it of r.Items) {
          if (it.Tipo !== TipoItem.Cuota) continue;
          cp.Items.push(it);
          cp.Total = cp.Total.mas(it.enPesos(this.Dolar));
          if (it.CuotaNum === it.CuotaTotal) cp.Terminan.push(it);
        }
      }
      res.push(cp);
    }
    return res;
  }

  /** Total de cuotas que faltan pagar. Devuelve { total, ultimoPeriodo }. */
  cuotasPendientesTotal() {
    let total = CERO, ultimoPeriodo = 0;
    for (const m of this.L.movimientos) {
      if (!esDeTarjeta(m) || m.Cuotas <= 1 || m.Tipo !== 'Gasto') continue;
      const t = this.L.tarjeta(m.TarjetaId);
      if (!t) continue;
      const p1 = this.primerPeriodo(m);
      for (let k = 1; k <= m.Cuotas; k++) {
        const pk = Per.sumar(p1, k - 1);
        if (pk < this.L.config.PeriodoInicial) continue;
        if (this.resumenDe(t, pk).estado(this.Hoy) === EstadoResumen.Pagado) continue;
        total = total.mas(m.Moneda === 'USD' ? Motor.cuotaMonto(m, k).por(this.Dolar) : Motor.cuotaMonto(m, k));
        if (pk > ultimoPeriodo) ultimoPeriodo = pk;
      }
    }
    return { total, ultimoPeriodo };
  }

  // ============================================================ Proyección
  proyectar(meses, sim = null, incluirEstimado = true) {
    const res = [];
    let saldoAcum = this.disponibleARS();
    const remuneradas = this.L.cuentas.filter((c) => c.Activa && c.Remunerada && c.Moneda === 'ARS' && c.TNA.signo > 0);
    let baseRem = CERO, tnaPond = CERO;
    for (const c of remuneradas) {
      const s = Dec.max(CERO, this.saldo(c));
      baseRem = baseRem.mas(s);
      tnaPond = tnaPond.mas(s.por(c.TNA));
    }
    const tnaRem = baseRem.signo > 0 ? tnaPond.div(baseRem) : (remuneradas.length > 0 ? Dec.promedio(remuneradas.map((c) => c.TNA)) : CERO);

    const simPorPeriodo = new Map();
    if (sim && sim.Monto.signo > 0) {
      const ts = this.L.tarjeta(sim.TarjetaId);
      if (ts) {
        const p1 = this.periodoDeCompra(ts, sim.Fecha);
        const falso = { Monto: sim.Monto, Cuotas: Math.max(1, sim.Cuotas) };
        for (let k = 1; k <= falso.Cuotas; k++) {
          const pk = Per.sumar(p1, k - 1);
          simPorPeriodo.set(pk, (simPorPeriodo.get(pk) || CERO).mas(Motor.cuotaMonto(falso, k)));
        }
      } else {
        simPorPeriodo.set(Per.de(sim.Fecha), sim.Monto);
      }
    }

    const pHoy = Per.de(this.Hoy);
    for (let i = 0; i < meses; i++) {
      const p = Per.sumar(pHoy, i);
      const mp = new MesProyeccion({ Periodo: p, SaldoInicial: saldoAcum });
      const desde = Per.primerDia(p), hasta = Per.ultimoDia(p);
      for (const oc of this.ocurrencias(desde, hasta)) {
        if (!oc.Pendiente) continue;
        const v = oc.Rec.Monto.por(oc.Rec.Moneda === 'USD' ? this.L.config.DolarMEP : D(1));
        if (oc.Rec.Tipo === 'Ingreso') mp.Ingresos = mp.Ingresos.mas(v); else mp.FijosCuenta = mp.FijosCuenta.mas(v);
      }
      if (p >= this.L.config.PeriodoInicial) {
        for (const t of this.tarjetasActivas()) {
          const periodos = [];
          if (i === 0) for (let q = this.L.config.PeriodoInicial; q < p; q = Per.sumar(q, 1)) periodos.push(q);
          periodos.push(p);
          for (const q of periodos) {
            const r = this.resumenDe(t, q);
            const est = r.estado(this.Hoy);
            if (est === EstadoResumen.Pagado || est === EstadoResumen.SinConsumos) continue;
            let cuotas = r.suma(TipoItem.Cuota, this.Dolar);
            let fijos = r.suma(TipoItem.Fijo, this.Dolar);
            let consumos = r.suma(TipoItem.Consumo, this.Dolar).mas(r.suma(TipoItem.Credito, this.Dolar));
            consumos = consumos.mas(r.totalPesos(this.Dolar).menos(r.TotalARS.mas(r.TotalUSD.por(this.Dolar))));
            const total = cuotas.mas(fijos).mas(consumos);
            const pagado = r.PagadoARS.mas(r.PagadoUSD.por(this.Dolar));
            if (pagado.signo > 0 && total.signo > 0) {
              const fr = Dec.max(CERO, total.menos(pagado).div(total));
              cuotas = cuotas.por(fr); fijos = fijos.por(fr); consumos = consumos.por(fr);
            }
            mp.TarjCuotas = mp.TarjCuotas.mas(cuotas);
            mp.TarjFijos = mp.TarjFijos.mas(fijos);
            mp.TarjConsumos = mp.TarjConsumos.mas(consumos);
            if (incluirEstimado && r.Cierre >= this.Hoy) mp.TarjEstimado = mp.TarjEstimado.mas(this.estimadoPendiente(r));
          }
        }
      }
      if (simPorPeriodo.has(p)) mp.Simulado = simPorPeriodo.get(p);
      if (tnaRem.signo > 0 && baseRem.signo > 0) {
        const base = Dec.max(CERO, Dec.min(baseRem, saldoAcum));
        const dias = i === 0 ? (hasta - this.Hoy) + 1 : F.diasEnMes(Per.anio(p), Per.mes(p));
        mp.Rendimientos = base.por(tnaRem).div(C365).por(D(dias)).redondear(2);
      }
      mp.SaldoFinal = saldoAcum.mas(mp.Ingresos).mas(mp.Rendimientos).menos(mp.Egresos);
      saldoAcum = mp.SaldoFinal;
      res.push(mp);
    }
    return res;
  }

  // ============================================================ Historial
  resumenDelMes(p) {
    const rm = new ResumenMes(p);
    const d1 = Per.primerDia(p), d2 = Per.ultimoDia(p);
    for (const m of this.L.movimientos) {
      if (esDeTarjeta(m)) continue;
      const f = Math.floor(m.Fecha);
      if (f < d1 || f > d2) continue;
      const v = m.Moneda === 'USD' ? m.Monto.por(this.L.config.DolarMEP) : m.Monto;
      if (m.Tipo === 'Ingreso') {
        rm.Ingresos = rm.Ingresos.mas(v);
        rm.sumarCategoria(rm.IngresosPorCategoria, m.Categoria, v);
      } else if (m.Tipo === 'Gasto') {
        rm.GastosCuenta = rm.GastosCuenta.mas(v);
        rm.sumarCategoria(rm.PorCategoria, m.Categoria, v);
        rm.Gastos.push({ Fecha: m.Fecha, Descripcion: m.Descripcion, Categoria: m.Categoria, Medio: this.L.nombreMedio(m), Monto: v, Detalle: '' });
      }
    }
    if (p >= this.L.config.PeriodoInicial) {
      for (const t of this.L.tarjetas) {
        const r = this.resumenDe(t, p);
        if (!r.TieneConsumos) continue;
        rm.Resumenes.push(r);
        const dolarUsado = r.PagadoUSD.signo > 0 && r.PesosPorUSD.signo > 0 ? r.PesosPorUSD.div(r.PagadoUSD) : this.Dolar;
        rm.Tarjetas = rm.Tarjetas.mas(r.AbonarARS.mas(r.AbonarUSD.por(dolarUsado)));
        for (const it of r.Items) {
          const v = it.enPesos(dolarUsado);
          rm.sumarCategoria(rm.PorCategoria, it.Categoria, v);
          rm.Gastos.push({ Fecha: it.Fecha, Descripcion: it.Descripcion, Categoria: it.Categoria, Medio: t.Nombre, Monto: v,
            Detalle: it.Tipo === TipoItem.Consumo ? '' : it.TextoTipo });
        }
        const dif = r.AbonarARS.menos(r.TotalARS).mas(r.AbonarUSD.menos(r.TotalUSD).por(dolarUsado));
        if (!dif.esCero) {
          rm.sumarCategoria(rm.PorCategoria, 'Impuestos y comisiones', dif);
          rm.Gastos.push({ Fecha: r.Cierre, Descripcion: 'Impuestos y cargos del resumen', Categoria: 'Impuestos y comisiones', Medio: t.Nombre, Monto: dif, Detalle: '' });
        }
      }
    }
    for (const c of this.L.cuentas) if (c.Remunerada) rm.Rendimientos = rm.Rendimientos.mas(this.interesEntre(c, d1, d2));
    return rm;
  }

  mesCerrado(p) { return this.L.cierres.some((c) => c.Periodo === p); }

  cerrarMes(p, nota) {
    const rm = this.resumenDelMes(p);
    const fechaSaldo = Per.ultimoDia(p) < this.Hoy ? Per.ultimoDia(p) : this.Hoy;
    this.L.cierres = this.L.cierres.filter((c) => c.Periodo !== p);
    const cm = nuevo('Cierre', { Periodo: p, FechaCierre: this.Hoy, Ingresos: rm.Ingresos.mas(rm.Rendimientos), Egresos: rm.Egresos,
      SaldoARS: this.disponibleARS(fechaSaldo), SaldoUSD: this.disponibleUSD(fechaSaldo), Nota: nota || '' });
    this.L.cierres.push(cm);
    return cm;
  }

  periodosHistorial() {
    let desde = this.L.config.PeriodoInicial;
    for (const m of this.L.movimientos) {
      if (!esDeTarjeta(m) && (m.Tipo === 'Gasto' || m.Tipo === 'Ingreso')) desde = Math.min(desde, Per.de(m.Fecha));
    }
    let hasta = Math.max(Per.de(this.Hoy), this.L.config.PeriodoInicial);
    for (const t of this.tarjetasActivas()) hasta = Math.max(hasta, this.periodoAbierto(t));
    const res = [];
    for (let p = desde; p <= hasta; p = Per.sumar(p, 1)) res.push(p);
    return res;
  }
}

/** OrderBy estable de .NET. */
export function ordenarEstable(lista, cmp) {
  return lista.map((x, i) => [x, i]).sort((a, b) => cmp(a[0], b[0]) || (a[1] - b[1])).map((x) => x[0]);
}

/** Comparación de textos como el OrderBy de .NET con la cultura es-AR (sin distinguir tildes de más ni mayúsculas primero). */
const colador = new Intl.Collator('es-AR');
export function compararTexto(a, b) { return colador.compare(a || '', b || ''); }
