// ============================================================================
//  Asesor: avisos y sugerencias a partir de los datos (igual que Asesor.vb).
//  Niveles: Urgente > Atención > Sugerencia > Positivo > Info
// ============================================================================

import { Dec, D, CERO } from './decimal.js';
import { F } from './fecha.js';
import { Per, Fmt } from './formato.js';
import { EstadoResumen, TipoItem, ordenarEstable } from './motor.js';
import { esDeTarjeta } from './modelo.js';
import { esEsencial } from './categorias.js';

export const NivelAviso = { Urgente: 0, Atencion: 1, Sugerencia: 2, Positivo: 3, Info: 4 };
export const AccionAviso = { Ninguna: 0, PagarResumen: 1, VerTarjeta: 2, VerProyeccion: 3, VerFijos: 4, VerCuentas: 5, RegistrarFijo: 6, CargarTotalReal: 7, VerHistorial: 8 };

export function nuevoAviso(o) {
  return { Nivel: 0, Titulo: '', Detalle: '', Clave: '', Accion: 0, TextoAccion: '', TarjetaId: 0, Periodo: 0, Ocurrencia: null, Orden: 0, ...o };
}

export function ordenarAvisos(lista) {
  return ordenarEstable(lista, (a, b) => (a.Nivel - b.Nivel) || (a.Orden - b.Orden));
}

const pz = (v) => Fmt.pesos(v);
const pzR = (v) => Fmt.pesosR(v);
const C365 = D(365), C12 = D(12);
const yyyymmdd = (n) => { const { y, m, d } = F.ymd(n); return `${y}${F.dos(m)}${F.dos(d)}`; };

export class Asesor {
  constructor(motor) { this.M = motor; this.L = motor.L; }
  get Hoy() { return this.M.Hoy; }

  generar(incluirOcultos = false) {
    const res = [];
    const reglas = [this.vencimientos, this.liquidez, this.proyeccionNegativa, this.fijosAtrasados,
      this.ritmoTarjetas, this.presupuestos, this.mejorTarjetaHoy, this.cierresProximos,
      this.pagarAlVencimiento, this.dolaresConMEP, this.dineroOcioso, this.cargaCuotas,
      this.tasaDeAhorro, this.fondoEmergencia, this.suscripciones, this.inflacionYCuotas,
      this.gastosHormiga, this.categoriasEnAumento, this.totalRealPendiente,
      this.saldosSinActualizar, this.limites, this.rendimientos];
    for (const regla of reglas) {
      // Un aviso con error nunca debe romper la pantalla (lo que llegó a agregar antes del error queda, como en la PC)
      try { regla.call(this, res); } catch (e) { if (globalThis.__depurarAvisos) console.error(e); }
    }
    const filtrados = incluirOcultos ? res : res.filter((x) => !x.Clave || !this.L.avisoOculto(x.Clave));
    return ordenarAvisos(filtrados);
  }

  remunerada() {
    const cs = this.L.cuentas.filter((c) => c.Activa && c.Remunerada && c.Moneda === 'ARS' && c.TNA.signo > 0);
    return ordenarEstable(cs, (a, b) => b.TNA.cmp(a.TNA))[0] || null;
  }

  textoPendiente(r) {
    let s = pz(r.PendienteARS);
    if (r.PendienteUSD.signo > 0) s += ' + ' + Fmt.dolares(r.PendienteUSD);
    return s;
  }

  // ------------------------------------------------------------------ Vencimientos
  vencimientos(res) {
    const M = this.M, L = this.L, Hoy = this.Hoy;
    for (const t of M.tarjetasActivas()) {
      let q = L.config.PeriodoInicial;
      const pa = M.periodoAbierto(t);
      while (q <= pa) {
        const r = M.resumenDe(t, q);
        const est = r.estado(Hoy);
        const pend = r.pendientePesos(M.Dolar);
        if ((est === EstadoResumen.Cerrado || est === EstadoResumen.Vencido) && pend.signo > 0) {
          const dias = r.Vencimiento - Hoy;
          const montoTxt = this.textoPendiente(r);
          const ctaDeb = t.DebitoAutomatico ? L.cuenta(t.CuentaPagoId) : null;
          if (ctaDeb && est === EstadoResumen.Cerrado) {
            const saldo = M.saldo(ctaDeb);
            let entra = CERO;
            for (const oc of M.ocurrencias(Per.primerDia(Per.de(Hoy)), r.Vencimiento)) {
              if (oc.Pendiente && oc.Rec.TarjetaId === 0 && oc.Rec.CuentaId === ctaDeb.Id && oc.Rec.Moneda === ctaDeb.Moneda) {
                entra = entra.mas(oc.Rec.Tipo === 'Ingreso' ? oc.Rec.Monto : oc.Rec.Monto.neg());
              }
            }
            const falta = pend.menos(saldo.mas(entra));
            if (falta.signo > 0 && dias <= 10) {
              res.push(nuevoAviso({ Nivel: dias <= 3 ? NivelAviso.Urgente : NivelAviso.Atencion, Orden: dias,
                Titulo: 'Faltan ' + pzR(falta) + ' en ' + ctaDeb.Nombre + ' para el débito de ' + t.Nombre,
                Detalle: 'El ' + Fmt.fechaDia(r.Vencimiento) + ' (' + Fmt.enDias(r.Vencimiento, Hoy) + ') se debitan ' + montoTxt + ' y hoy hay ' + pzR(saldo) +
                  (entra.signo > 0 ? ' (más ' + pzR(entra) + ' que esperás antes)' : '') + '. Transferí antes para que no rebote.',
                Accion: AccionAviso.VerCuentas, TextoAccion: 'Ver cuentas', TarjetaId: t.Id, Periodo: q }));
            } else if (dias <= 7) {
              res.push(nuevoAviso({ Nivel: NivelAviso.Info, Orden: dias,
                Titulo: t.Nombre + ' se debita ' + Fmt.enDias(r.Vencimiento, Hoy) + ' (' + Fmt.fechaDia(r.Vencimiento) + ')',
                Detalle: montoTxt + ' desde ' + ctaDeb.Nombre + '.' +
                  (saldo.ge(pend) ? ' Hay saldo suficiente.' : ' Se cubre con lo que entra antes (' + pzR(entra) + ').'),
                TarjetaId: t.Id, Periodo: q }));
            }
            q = Per.sumar(q, 1);
            continue;
          }
          if (est === EstadoResumen.Vencido) {
            res.push(nuevoAviso({ Nivel: NivelAviso.Urgente, Orden: dias,
              Titulo: 'Venció el resumen de ' + t.Nombre + ' (' + Fmt.fechaDia(r.Vencimiento) + ')',
              Detalle: 'Quedan ' + montoTxt + ' sin pagar. Después del vencimiento se cobran intereses punitorios: pagalo cuanto antes. Si ya lo pagaste, registrá el pago.',
              Accion: AccionAviso.PagarResumen, TextoAccion: 'Registrar pago', TarjetaId: t.Id, Periodo: q }));
          } else if (dias <= 3) {
            res.push(nuevoAviso({ Nivel: NivelAviso.Urgente, Orden: dias,
              Titulo: t.Nombre + ' vence ' + Fmt.enDias(r.Vencimiento, Hoy) + ' (' + Fmt.fechaDia(r.Vencimiento) + ')',
              Detalle: 'A pagar: ' + montoTxt + '. Pagá el total para no generar intereses.',
              Accion: AccionAviso.PagarResumen, TextoAccion: 'Registrar pago', TarjetaId: t.Id, Periodo: q }));
          } else if (dias <= 10) {
            res.push(nuevoAviso({ Nivel: NivelAviso.Atencion, Orden: dias,
              Titulo: t.Nombre + ' vence el ' + Fmt.fechaDia(r.Vencimiento) + ' (' + Fmt.enDias(r.Vencimiento, Hoy) + ')',
              Detalle: 'El resumen ya cerró. Total a pagar: ' + montoTxt + '.',
              Accion: AccionAviso.PagarResumen, TextoAccion: 'Registrar pago', TarjetaId: t.Id, Periodo: q }));
          }
        }
        q = Per.sumar(q, 1);
      }
    }
  }

  // ------------------------------------------------------------------ Liquidez
  liquidez(res) {
    const M = this.M, L = this.L, Hoy = this.Hoy;
    const p = M.periodoAPagar();
    const libre = M.libreDespuesDePagar(p);
    const aPagar = M.aPagarHasta(p);
    if (aPagar.signo <= 0) return;
    if (libre.signo < 0) {
      res.push(nuevoAviso({ Nivel: NivelAviso.Urgente, Orden: 0,
        Titulo: 'No te alcanza para los vencimientos de ' + Fmt.mesDe(p),
        Detalle: 'Te faltarían ' + pzR(libre.neg()) + '. Opciones: mover plata de otra cuenta, frenar consumos en las tarjetas que siguen abiertas o pedir un adelanto. Pagar el mínimo es la peor opción: el saldo financiado genera intereses altos.',
        Accion: AccionAviso.VerProyeccion, TextoAccion: 'Ver proyección' }));
    } else {
      const disponible = M.disponibleARS();
      let acumulado = CERO;
      const vencs = [];
      for (const t of M.tarjetasActivas()) {
        for (let q = L.config.PeriodoInicial; q <= p; q = Per.sumar(q, 1)) {
          const r = M.resumenDe(t, q);
          if (r.pendientePesos(M.Dolar).signo > 0) vencs.push(r);
        }
      }
      for (const r of ordenarEstable(vencs, (a, b) => a.Vencimiento - b.Vencimiento)) {
        acumulado = acumulado.mas(r.pendientePesos(M.Dolar));
        let ingresosAntes = CERO;
        for (const oc of M.ocurrencias(Per.primerDia(Per.de(Hoy)), r.Vencimiento)) {
          if (oc.Pendiente && oc.Rec.Tipo === 'Ingreso') ingresosAntes = ingresosAntes.mas(oc.Rec.Monto);
        }
        if (acumulado.gt(disponible.mas(ingresosAntes))) {
          res.push(nuevoAviso({ Nivel: NivelAviso.Atencion, Orden: 1,
            Titulo: 'Ojo con el ' + Fmt.fechaDia(r.Vencimiento) + ': vence ' + r.Tarjeta.Nombre,
            Detalle: 'Para esa fecha necesitás ' + pzR(acumulado) + ' acumulados y hoy tenés ' + pzR(disponible) +
              (ingresosAntes.signo > 0 ? ' (más ' + pzR(ingresosAntes) + ' de ingresos esperados)' : '') +
              '. Si el sueldo se demora, quizás tengas que mover fondos.',
            Accion: AccionAviso.VerCuentas, TextoAccion: 'Ver cuentas' }));
          break;
        }
      }
    }
  }

  // ------------------------------------------------------------------ Proyección negativa
  proyeccionNegativa(res) {
    const proy = this.M.proyectar(6);
    const negativo = proy.find((x) => x.SaldoFinal.signo < 0);
    if (negativo) {
      res.push(nuevoAviso({ Nivel: NivelAviso.Atencion, Orden: 2,
        Titulo: 'Saldo proyectado negativo en ' + Fmt.mesDe(negativo.Periodo),
        Detalle: 'Con tus ingresos, fijos, cuotas y el consumo habitual de las tarjetas, terminarías ' + Fmt.mesDe(negativo.Periodo) + ' con ' + pzR(negativo.SaldoFinal) + '. Conviene ajustar gastos desde ahora.',
        Accion: AccionAviso.VerProyeccion, TextoAccion: 'Ver proyección' }));
      return;
    }
    if (proy.length >= 4) {
      let caidas = 0;
      for (let i = 1; i < proy.length; i++) if (proy[i].Resultado.signo < 0) caidas++;
      if (caidas >= 3) {
        const prom = Dec.promedio(proy.slice(1).map((x) => x.Resultado));
        res.push(nuevoAviso({ Nivel: NivelAviso.Atencion, Orden: 3,
          Titulo: 'Tu saldo viene bajando mes a mes',
          Detalle: 'En ' + caidas + ' de los próximos meses gastarías más de lo que ingresa (en promedio ' + pzR(prom.neg()) + ' por mes). Revisá las categorías más grandes en Historial.',
          Accion: AccionAviso.VerProyeccion, TextoAccion: 'Ver proyección' }));
      }
    }
  }

  // ------------------------------------------------------------------ Fijos atrasados
  fijosAtrasados(res) {
    const Hoy = this.Hoy;
    for (const oc of this.M.ocurrencias(Per.primerDia(Per.de(Hoy)), Hoy + 3)) {
      if (!oc.Pendiente || oc.Rec.AutoRegistrar) continue;
      const esIngreso = oc.Rec.Tipo === 'Ingreso';
      const atrasado = oc.Fecha < Hoy;
      res.push(nuevoAviso({ Nivel: atrasado && !esIngreso ? NivelAviso.Atencion : NivelAviso.Info, Orden: 5,
        Titulo: esIngreso ? '¿Ya cobraste ' + oc.Rec.Descripcion + '?' : (atrasado ? 'Pendiente: ' : 'Se viene: ') + oc.Rec.Descripcion,
        Detalle: Fmt.monto(oc.Rec.Monto, oc.Rec.Moneda) + ' · ' + Fmt.fechaDia(oc.Fecha) + ' (' + Fmt.enDias(oc.Fecha, Hoy) + '). Registralo para que el disponible quede al día.',
        Accion: AccionAviso.RegistrarFijo, TextoAccion: 'Registrar', Ocurrencia: oc }));
    }
  }

  // ------------------------------------------------------------------ Ritmo de gasto
  ritmoTarjetas(res) {
    const M = this.M, L = this.L, Hoy = this.Hoy;
    for (const t of M.tarjetasActivas()) {
      const r = M.resumenDe(t, M.periodoAbierto(t));
      const trans = (Hoy - r.Inicio) + 1;
      const variable = M.consumoVariable(r);
      if (trans < 5 || variable.signo <= 0) continue;
      const ritmo = M.ritmoCierre(r);
      const proyTotal = r.totalPesos(M.Dolar).menos(variable).mas(ritmo);
      const hist = [];
      let q = Per.sumar(r.Periodo, -1);
      while (q >= L.config.PeriodoInicial && hist.length < 3) {
        const v = M.consumoVariable(M.resumenDe(t, q));
        if (v.signo > 0) hist.push(v);
        q = Per.sumar(q, -1);
      }
      if (hist.length) {
        const prom = Dec.promedio(hist);
        if (ritmo.gt(prom.por(D('1.2'))) && ritmo.menos(prom).gt(D(20000))) {
          res.push(nuevoAviso({ Nivel: NivelAviso.Atencion, Orden: 10,
            Titulo: t.Nombre + ': venís gastando más que lo habitual',
            Detalle: 'Llevás ' + pzR(variable) + ' en ' + trans + ' días. A este ritmo los consumos cerrarían en ~' + pzR(ritmo) +
              ' (' + Fmt.pct(ritmo.menos(prom).div(prom), 0) + ' más que tu promedio de ' + pzR(prom) + '). El resumen cierra el ' + Fmt.fechaDia(r.Cierre) + '.',
            Accion: AccionAviso.VerTarjeta, TextoAccion: 'Ver resumen', TarjetaId: t.Id, Periodo: r.Periodo }));
        }
      } else {
        res.push(nuevoAviso({ Nivel: NivelAviso.Info, Orden: 12,
          Titulo: t.Nombre + ': a este ritmo cerrarías en ~' + pzR(proyTotal),
          Detalle: 'Llevás ' + pzR(variable) + ' de consumos en ' + trans + ' días de ' + ((r.Cierre - r.Inicio) + 1) +
            ', más cuotas y fijos. Cierra el ' + Fmt.fechaDia(r.Cierre) + ' y vence el ' + Fmt.fechaDia(r.Vencimiento) + '.',
          Accion: AccionAviso.VerTarjeta, TextoAccion: 'Ver resumen', TarjetaId: t.Id, Periodo: r.Periodo }));
      }
    }
  }

  // ------------------------------------------------------------------ Presupuestos
  presupuestos(res) {
    const conPresupuesto = this.L.categorias.filter((c) => c.Presupuesto.signo > 0 && !c.EsIngreso);
    if (!conPresupuesto.length) return;
    const p = this.M.periodoAPagar();
    const rm = this.M.resumenDelMes(p);
    for (const c of conPresupuesto) {
      const gastado = rm.categoria(rm.PorCategoria, c.Nombre);
      const pct = gastado.div(c.Presupuesto);
      if (pct.ge(D(1))) {
        res.push(nuevoAviso({ Nivel: NivelAviso.Atencion, Orden: 15,
          Titulo: 'Superaste el presupuesto de ' + c.Nombre,
          Detalle: 'Llevás ' + pzR(gastado) + ' de ' + pzR(c.Presupuesto) + ' (' + Fmt.pct(pct, 0) + ') para lo que pagás en ' + Fmt.mesDe(p) + '.' }));
      } else if (pct.ge(D('0.8'))) {
        res.push(nuevoAviso({ Nivel: NivelAviso.Info, Orden: 16,
          Titulo: c.Nombre + ': usaste el ' + Fmt.pct(pct, 0) + ' del presupuesto',
          Detalle: 'Te quedan ' + pzR(c.Presupuesto.menos(gastado)) + ' para ' + Fmt.mesDe(p) + '.' }));
      }
    }
  }

  // ------------------------------------------------------------------ Mejor tarjeta para comprar hoy
  mejorTarjetaHoy(res) {
    const M = this.M;
    const ts = M.tarjetasActivas();
    if (ts.length < 2) return;
    const info = ordenarEstable(ts.map((t) => ({ T: t, Dias: M.diasFinanciacion(t), Venc: M.vencimiento(t, M.periodoAbierto(t)) })), (a, b) => b.Dias - a.Dias);
    const mejor = info[0];
    const peor = info[info.length - 1];
    if (mejor.Dias - peor.Dias < 10) return;
    let det = 'Si comprás hoy con ' + mejor.T.Nombre + ' lo pagás el ' + Fmt.fechaDia(mejor.Venc) + ' (' + mejor.Dias + ' días). Con ' +
      peor.T.Nombre + ' lo pagarías el ' + Fmt.fechaDia(peor.Venc) + ' (' + peor.Dias + ' días).';
    const cr = this.remunerada();
    if (cr) {
      const ganancia = D(100000).por(cr.TNA).div(C365).por(D(mejor.Dias - peor.Dias));
      det += ' Mientras tanto, cada $ 100.000 en ' + cr.Nombre + ' rinden ~' + pzR(ganancia) + ' extra.';
    }
    res.push(nuevoAviso({ Nivel: NivelAviso.Sugerencia, Orden: 20,
      Titulo: 'Para compras de hoy conviene ' + mejor.T.Nombre, Detalle: det,
      Clave: 'mejor-' + mejor.T.Id + '-' + yyyymmdd(this.Hoy) }));
  }

  // ------------------------------------------------------------------ Cierres próximos
  cierresProximos(res) {
    const M = this.M, Hoy = this.Hoy;
    for (const t of M.tarjetasActivas()) {
      const p = M.periodoAbierto(t);
      const r = M.resumenDe(t, p);
      const dias = r.Cierre - Hoy;
      if (dias < 0 || dias > 4) continue;
      const vSig = M.vencimiento(t, Per.sumar(p, 1));
      res.push(nuevoAviso({ Nivel: NivelAviso.Info, Orden: 22,
        Titulo: t.Nombre + ' cierra ' + Fmt.enDias(r.Cierre, Hoy) + ' (' + Fmt.fechaDia(r.Cierre) + ')',
        Detalle: 'Si tenés una compra grande en mente, hacela desde el ' + Fmt.fechaDia(r.Cierre + 1) + ': entra en el resumen siguiente y la pagás recién el ' +
          Fmt.fechaDia(vSig) + ' (' + (vSig - (r.Cierre + 1)) + ' días de financiación sin interés).',
        Clave: 'cierre-' + t.Id + '-' + p }));
    }
  }

  // ------------------------------------------------------------------ Pagar el día del vencimiento
  pagarAlVencimiento(res) {
    const M = this.M, L = this.L, Hoy = this.Hoy;
    const cr = this.remunerada();
    if (!cr) return;
    let total = CERO, ganancia = CERO;
    const partes = [];
    for (const t of M.tarjetasActivas()) {
      for (let q = L.config.PeriodoInicial; q <= M.periodoAbierto(t); q = Per.sumar(q, 1)) {
        const r = M.resumenDe(t, q);
        const est = r.estado(Hoy);
        const pend = r.pendientePesos(M.Dolar);
        const dias = r.Vencimiento - Hoy;
        if ((est === EstadoResumen.Cerrado || est === EstadoResumen.Abierto) && pend.signo > 0 && dias >= 3 && dias <= 31) {
          total = total.mas(pend);
          ganancia = ganancia.mas(pend.por(cr.TNA).div(C365).por(D(dias)));
          partes.push(t.Nombre + ' el ' + Fmt.fechaCorta(r.Vencimiento));
        }
      }
    }
    const enCuenta = Dec.max(CERO, M.saldo(cr));
    if (total.gt(enCuenta) && total.signo > 0) {
      ganancia = ganancia.por(enCuenta).div(total);
      total = enCuenta;
    }
    if (ganancia.lt(D(300))) return;
    res.push(nuevoAviso({ Nivel: NivelAviso.Sugerencia, Orden: 25,
      Titulo: 'Pagá las tarjetas el día del vencimiento, no antes',
      Detalle: 'Dejando ' + pzR(total) + ' en ' + cr.Nombre + ' (' + Fmt.pct(cr.TNA, 0) + ' TNA) hasta cada vencimiento (' + partes.join(', ') +
        ') ganás ~' + pzR(ganancia) + ' de intereses. Programá el pago o poné un recordatorio.',
      Clave: 'pagar-al-venc-' + Per.de(Hoy) }));
  }

  // ------------------------------------------------------------------ Dólares de la tarjeta con MEP
  dolaresConMEP(res) {
    const M = this.M, cfg = this.L.config;
    if (cfg.DolarMEP.signo <= 0 || cfg.DolarTarjeta.le(cfg.DolarMEP)) return;
    let usd = CERO;
    const tarjetas = [];
    const pPagar = M.periodoAPagar();
    for (const q of M.periodosPendientes().filter((x) => x <= pPagar)) {
      for (const t of M.tarjetasActivas()) {
        const r = M.resumenDe(t, q);
        if (r.PendienteUSD.signo > 0) {
          usd = usd.mas(r.PendienteUSD);
          if (!tarjetas.includes(t.Nombre)) tarjetas.push(t.Nombre);
        }
      }
    }
    if (usd.signo <= 0) return;
    const ahorro = usd.por(cfg.DolarTarjeta.menos(cfg.DolarMEP));
    res.push(nuevoAviso({ Nivel: NivelAviso.Sugerencia, Orden: 26,
      Titulo: 'Pagá los dólares de la tarjeta con dólares',
      Detalle: 'Tenés ' + Fmt.dolares(usd) + ' en ' + tarjetas.join(' y ') + '. A dólar tarjeta (' + pz(cfg.DolarTarjeta) + ') son ' + pzR(usd.por(cfg.DolarTarjeta)) +
        '; comprando dólares MEP (' + pz(cfg.DolarMEP) + ') y pagando esa parte en USD gastás ' + pzR(usd.por(cfg.DolarMEP)) + ' (ahorro ~' + pzR(ahorro) + ' por mes). Hace falta tener caja de ahorro en dólares.',
      Clave: 'mep-' + Per.de(this.Hoy) }));
  }

  // ------------------------------------------------------------------ Dinero sin rendimiento
  dineroOcioso(res) {
    const M = this.M, L = this.L, Hoy = this.Hoy;
    let tna = L.config.TNAReferencia;
    const cr = this.remunerada();
    if (cr) tna = Dec.max(tna, cr.TNA);
    if (tna.signo <= 0) return;
    const reservar = M.aPagarHasta(M.periodoAPagar()).mas(M.fijosPendientes(Per.ultimoDia(Per.de(Hoy)), false));
    const enRem = cr ? M.saldo(cr) : CERO;
    for (const c of L.cuentas) {
      if (!c.Activa || c.Remunerada || c.Moneda !== 'ARS') continue;
      const s = M.saldo(c);
      const reservaAqui = Dec.max(CERO, reservar.menos(enRem));
      const ocioso = s.menos(reservaAqui);
      if (ocioso.lt(D(100000))) continue;
      const mensual = ocioso.por(tna).div(C12);
      const esEfectivo = c.Tipo === 'Efectivo';
      res.push(nuevoAviso({ Nivel: NivelAviso.Sugerencia, Orden: 27,
        Titulo: 'Tenés ' + pzR(ocioso) + ' sin rendimiento en ' + c.Nombre,
        Detalle: (esEfectivo ? 'Si no lo necesitás en mano, depositándolo en ' : 'Pasándolo a ') + (cr ? cr.Nombre : 'una cuenta remunerada o FCI money market') + ' (' + Fmt.pct(tna, 0) + ' TNA) ganarías ~' + pzR(mensual) +
          ' por mes.' + (esEfectivo ? '' : ' Dejá en ' + c.Nombre + ' sólo lo necesario para débitos y pagos.'),
        Accion: AccionAviso.VerCuentas, TextoAccion: 'Ver cuentas',
        Clave: 'ocioso-' + c.Id + '-' + Per.de(Hoy) }));
    }
  }

  // ------------------------------------------------------------------ Peso de las cuotas
  cargaCuotas(res) {
    const M = this.M, L = this.L;
    const cuotas = M.cuotasPorPeriodo(18);
    if (!cuotas.length || cuotas.every((c) => c.Total.esCero)) return;
    let sueldo = CERO;
    for (const r of L.recurrentes) {
      if (r.Activo && r.Tipo === 'Ingreso' && r.CuentaId !== 0) sueldo = sueldo.mas(r.Moneda === 'USD' ? r.Monto.por(L.config.DolarMEP) : r.Monto);
    }
    const proximo = cuotas.find((c) => c.Total.signo > 0);
    if (!proximo) return;
    const libera = cuotas.find((c) => c.Terminan.length > 0);
    let txtLibera = '';
    if (libera) {
      const monto = Dec.suma(libera.Terminan.map((i) => i.enPesos(M.Dolar)));
      txtLibera = ' Después de ' + Fmt.mesDe(libera.Periodo) + ' se termina ' + [...new Set(libera.Terminan.map((i) => i.Descripcion))].join(', ') +
        ' y liberás ' + pzR(monto) + ' por mes.';
    }
    const { total, ultimoPeriodo: ultimo } = M.cuotasPendientesTotal();
    if (sueldo.signo > 0 && proximo.Total.div(sueldo).gt(D('0.3'))) {
      res.push(nuevoAviso({ Nivel: NivelAviso.Atencion, Orden: 30,
        Titulo: 'Las cuotas se llevan el ' + Fmt.pct(proximo.Total.div(sueldo), 0) + ' de tus ingresos fijos',
        Detalle: 'En ' + Fmt.mesDe(proximo.Periodo) + ' pagás ' + pzR(proximo.Total) + ' sólo en cuotas. Evitá sumar compras en cuotas hasta que se liberen.' + txtLibera }));
    } else {
      res.push(nuevoAviso({ Nivel: NivelAviso.Info, Orden: 31,
        Titulo: 'Cuotas pendientes: ' + pzR(total) + (ultimo > 0 ? ' hasta ' + Fmt.mesDe(ultimo) + ' de ' + Per.anio(ultimo) : ''),
        Detalle: 'En ' + Fmt.mesDe(proximo.Periodo) + ' pagás ' + pzR(proximo.Total) + ' de cuotas.' + txtLibera,
        Accion: AccionAviso.VerProyeccion, TextoAccion: 'Ver cuotas' }));
    }
  }

  // ------------------------------------------------------------------ Tasa de ahorro
  tasaDeAhorro(res) {
    const proy = this.M.proyectar(3);
    const mes = proy.find((x) => x.Ingresos.signo > 0);
    if (!mes) return;
    const ing = mes.Ingresos.mas(mes.Rendimientos);
    const tasa = mes.Resultado.div(ing);
    const meta = this.L.config.MetaAhorro;
    if (tasa.signo < 0) {
      res.push(nuevoAviso({ Nivel: NivelAviso.Atencion, Orden: 35,
        Titulo: 'En ' + Fmt.mesDe(mes.Periodo) + ' gastarías más de lo que ingresa',
        Detalle: 'Ingresos esperados ' + pzR(ing) + ' contra egresos de ' + pzR(mes.Egresos) + ' (tarjetas ' + pzR(mes.Tarjetas) + '). Para equilibrar necesitás recortar ~' + pzR(mes.Resultado.neg()) + '.' + this.topPrescindibles(),
        Accion: AccionAviso.VerProyeccion, TextoAccion: 'Ver proyección' }));
    } else if (tasa.lt(meta)) {
      res.push(nuevoAviso({ Nivel: NivelAviso.Sugerencia, Orden: 36,
        Titulo: 'Ahorro proyectado de ' + Fmt.mesDe(mes.Periodo) + ': ' + Fmt.pct(tasa, 0) + ' (meta ' + Fmt.pct(meta, 0) + ')',
        Detalle: 'Te quedarían ' + pzR(mes.Resultado) + '. Para llegar a la meta te faltan ~' + pzR(ing.por(meta).menos(mes.Resultado)) + '.' + this.topPrescindibles(),
        Clave: 'ahorro-' + mes.Periodo }));
    } else {
      res.push(nuevoAviso({ Nivel: NivelAviso.Positivo, Orden: 37,
        Titulo: '¡Vas bien! Ahorrarías el ' + Fmt.pct(tasa, 0) + ' en ' + Fmt.mesDe(mes.Periodo),
        Detalle: 'Te quedarían ' + pzR(mes.Resultado) + '. Lo que no vayas a usar ponelo a rendir (cuenta remunerada, plazo fijo o FCI) para que no lo coma la inflación.',
        Clave: 'ahorro-ok-' + mes.Periodo }));
    }
  }

  topPrescindibles() {
    const rm = this.M.resumenDelMes(this.M.periodoAPagar());
    const top = ordenarEstable([...rm.PorCategoria.entries()].filter(([k, v]) => !esEsencial(this.L, k) && v.signo > 0), (a, b) => b[1].cmp(a[1])).slice(0, 3);
    if (!top.length) return '';
    return ' Lo prescindible más grande: ' + top.map(([k, v]) => k + ' ' + pzR(v)).join(', ') + '.';
  }

  // ------------------------------------------------------------------ Fondo de emergencia
  fondoEmergencia(res) {
    const M = this.M;
    const proy = M.proyectar(4);
    const futuros = proy.slice(1).filter((x) => x.Egresos.signo > 0);
    if (!futuros.length) return;
    const gastoMensual = Dec.promedio(futuros.map((x) => x.Egresos));
    if (gastoMensual.signo <= 0) return;
    const libre = M.libreDespuesDePagar(M.periodoAPagar());
    const meses = Dec.max(CERO, libre).div(gastoMensual);
    const objetivo = this.L.config.MesesEmergencia;
    if (meses.lt(D(objetivo))) {
      res.push(nuevoAviso({ Nivel: NivelAviso.Sugerencia, Orden: 40,
        Titulo: 'Fondo de emergencia: cubrís ' + Fmt.num(meses, 1) + ' meses de gastos',
        Detalle: 'Lo recomendable son ' + objetivo + ' meses (' + pzR(gastoMensual.por(D(objetivo))) + '). Separá un monto fijo cada vez que cobrás, en una cuenta que rinda, hasta llegar.',
        Clave: 'emergencia-' + Per.de(this.Hoy) }));
    } else {
      res.push(nuevoAviso({ Nivel: NivelAviso.Positivo, Orden: 41,
        Titulo: 'Tu colchón cubre ' + Fmt.num(meses, 1) + ' meses de gastos',
        Detalle: 'Superás los ' + objetivo + ' meses recomendados. El excedente (' + pzR(libre.menos(gastoMensual.por(D(objetivo)))) + ') podrías invertirlo a más largo plazo.',
        Clave: 'emergencia-ok-' + Per.de(this.Hoy) }));
    }
  }

  // ------------------------------------------------------------------ Suscripciones
  suscripciones(res) {
    const L = this.L;
    const subs = L.recurrentes.filter((r) => r.Activo && r.Tipo === 'Gasto' && (r.Categoria || '').toLowerCase() === 'suscripciones');
    if (subs.length < 3) return;
    const enPesos = (r) => (r.Moneda === 'USD' ? r.Monto.por(L.config.DolarTarjeta) : r.Monto);
    const mensual = Dec.suma(subs.map(enPesos));
    const top = ordenarEstable(subs, (a, b) => enPesos(b).cmp(enPesos(a))).slice(0, 3).map((r) => r.Descripcion + ' ' + pzR(enPesos(r)));
    res.push(nuevoAviso({ Nivel: NivelAviso.Sugerencia, Orden: 45,
      Titulo: subs.length + ' suscripciones: ' + pzR(mensual) + ' por mes (' + pzR(mensual.por(C12)) + ' al año)',
      Detalle: 'Las más caras: ' + top.join(', ') + '. Revisá si usás todas: cada una que des de baja suma ahorro todos los meses. Las que se cobran en dólares suben con el tipo de cambio.',
      Accion: AccionAviso.VerFijos, TextoAccion: 'Ver fijos',
      Clave: 'subs-' + Per.de(this.Hoy) }));
  }

  // ------------------------------------------------------------------ Inflación y cuotas
  inflacionYCuotas(res) {
    const inf = this.L.config.InflacionMensual;
    if (inf.signo <= 0) return;
    const cuotas = this.M.cuotasPorPeriodo(36);
    let nominal = CERO, actual = CERO;
    const infD = inf.aDoble();
    for (let i = 0; i < cuotas.length; i++) {
      if (cuotas[i].Total.esCero) continue;
      nominal = nominal.mas(cuotas[i].Total);
      actual = actual.mas(cuotas[i].Total.div(Dec.deDoble(Math.pow(1.0 + infD, i))));
    }
    if (nominal.signo <= 0 || nominal.menos(actual).lt(D(1000))) return;
    res.push(nuevoAviso({ Nivel: NivelAviso.Info, Orden: 50,
      Titulo: 'Las cuotas sin interés juegan a tu favor',
      Detalle: 'Con una inflación estimada de ' + Fmt.pct(inf, 1) + ' mensual, tus cuotas pendientes (' + pzR(nominal) + ') equivalen a ~' + pzR(actual) +
        ' de hoy: ahorrás ~' + pzR(nominal.menos(actual)) + ' en términos reales. Ojo: sólo conviene si no tienen interés y no te hacen gastar de más.',
      Clave: 'inflacion-' + Per.de(this.Hoy) }));
  }

  // ------------------------------------------------------------------ Gastos hormiga
  gastosHormiga(res) {
    const M = this.M, L = this.L, Hoy = this.Hoy;
    let chicos = 0, total = CERO;
    const diez = D(10000);
    for (const t of M.tarjetasActivas()) {
      const r = M.resumenDe(t, M.periodoAbierto(t));
      for (const it of r.Items) {
        if (it.Tipo === TipoItem.Consumo && it.enPesos(M.Dolar).lt(diez)) {
          chicos++;
          total = total.mas(it.enPesos(M.Dolar));
        }
      }
    }
    const d1 = Hoy - 30;
    for (const mv of L.movimientos) {
      if (mv.Tipo === 'Gasto' && !esDeTarjeta(mv) && mv.Fecha >= d1 && mv.Fecha <= Hoy && mv.Monto.lt(diez)) {
        chicos++;
        total = total.mas(mv.Monto);
      }
    }
    if (chicos < 8) return;
    res.push(nuevoAviso({ Nivel: NivelAviso.Info, Orden: 55,
      Titulo: 'Gastos chicos: ' + chicos + ' compras de menos de $ 10.000 suman ' + pzR(total),
      Detalle: 'Son los que menos se notan. Al año serían unos ' + pzR(total.por(C12)) + '. Si muchos son de transporte (SUBE), revisá si te conviene otra forma de viajar o cargar menos veces.',
      Clave: 'hormiga-' + Per.de(Hoy) }));
  }

  // ------------------------------------------------------------------ Categorías que crecen
  categoriasEnAumento(res) {
    const M = this.M, L = this.L;
    const p = M.periodoAPagar();
    const actual = M.resumenDelMes(p);
    const previos = [];
    let q = Per.sumar(p, -1);
    while (previos.length < 3 && q >= Per.sumar(L.config.PeriodoInicial, -1)) {
      const rm = M.resumenDelMes(q);
      if (rm.TieneDatos) previos.push(rm);
      q = Per.sumar(q, -1);
    }
    if (previos.length < 2) return;
    let alertas = 0;
    for (const [k, v] of ordenarEstable([...actual.PorCategoria.entries()], (a, b) => b[1].cmp(a[1]))) {
      const prom = Dec.promedio(previos.map((r) => r.categoria(r.PorCategoria, k)));
      if (prom.signo > 0 && v.gt(prom.por(D('1.4'))) && v.menos(prom).gt(D(20000))) {
        res.push(nuevoAviso({ Nivel: NivelAviso.Atencion, Orden: 60,
          Titulo: k + ': ' + Fmt.pct(v.menos(prom).div(prom), 0) + ' más que tu promedio',
          Detalle: 'En ' + Fmt.mesDe(p) + ' llevás ' + pzR(v) + ' contra un promedio de ' + pzR(prom) + ' en los meses anteriores.',
          Accion: AccionAviso.VerHistorial, TextoAccion: 'Ver historial',
          Clave: 'cat-' + k + '-' + p }));
        alertas++;
        if (alertas >= 2) break;
      }
    }
  }

  // ------------------------------------------------------------------ Total real del resumen
  totalRealPendiente(res) {
    const M = this.M, L = this.L, Hoy = this.Hoy;
    for (const t of M.tarjetasActivas()) {
      for (let q = L.config.PeriodoInicial; q <= M.periodoAbierto(t); q = Per.sumar(q, 1)) {
        const r = M.resumenDe(t, q);
        if (r.estado(Hoy) === EstadoResumen.Cerrado && r.RealARS === null && (Hoy - r.Cierre) >= 2) {
          res.push(nuevoAviso({ Nivel: NivelAviso.Info, Orden: 65,
            Titulo: 'Cargá el total real del resumen de ' + t.Nombre,
            Detalle: 'El banco suele sumar impuestos y cargos (IVA, sellos, percepciones). Copiá el total del resumen que te llegó y el disponible queda exacto.',
            Accion: AccionAviso.CargarTotalReal, TextoAccion: 'Cargar total', TarjetaId: t.Id, Periodo: q,
            Clave: 'real-' + t.Id + '-' + q }));
        }
      }
    }
  }

  // ------------------------------------------------------------------ Saldos sin actualizar
  saldosSinActualizar(res) {
    const Hoy = this.Hoy;
    for (const c of this.L.cuentas) {
      if (!c.Activa || !c.Remunerada) continue;
      const dias = Math.trunc(Hoy - this.M.ultimoAjuste(c));
      if (dias < 30) continue;
      res.push(nuevoAviso({ Nivel: NivelAviso.Info, Orden: 70,
        Titulo: 'Actualizá el saldo real de ' + c.Nombre,
        Detalle: 'Hace ' + dias + ' días que no lo ajustás. Los intereses se calculan en forma estimada; con el saldo real todo queda exacto.',
        Accion: AccionAviso.VerCuentas, TextoAccion: 'Ajustar saldo',
        Clave: 'ajuste-' + c.Id + '-' + Per.de(Hoy) }));
    }
  }

  // ------------------------------------------------------------------ Límites de tarjeta
  limites(res) {
    const M = this.M, L = this.L;
    for (const t of M.tarjetasActivas()) {
      if (t.Limite.signo <= 0) continue;
      let usado = CERO;
      const pa = M.periodoAbierto(t);
      for (let q = L.config.PeriodoInicial; q <= Per.sumar(pa, 24); q = Per.sumar(q, 1)) {
        const r = M.resumenDe(t, q);
        usado = usado.mas(q <= pa ? r.pendientePesos(M.Dolar) : r.suma(TipoItem.Cuota, M.Dolar));
      }
      const pct = usado.div(t.Limite);
      if (pct.ge(D('0.8'))) {
        res.push(nuevoAviso({ Nivel: NivelAviso.Atencion, Orden: 75,
          Titulo: t.Nombre + ': usaste el ' + Fmt.pct(pct, 0) + ' del límite',
          Detalle: 'Entre resúmenes sin pagar y cuotas futuras tenés ' + pzR(usado) + ' de ' + pzR(t.Limite) + '. Te quedan ' + pzR(Dec.max(CERO, t.Limite.menos(usado))) + ' disponibles.' }));
      }
    }
  }

  // ------------------------------------------------------------------ Rendimientos
  rendimientos(res) {
    const M = this.M, Hoy = this.Hoy;
    let total = CERO;
    const d1 = Per.primerDia(Per.de(Hoy));
    for (const c of this.L.cuentas) if (c.Activa && c.Remunerada) total = total.mas(M.interesEntre(c, d1, Hoy));
    if (total.lt(D(100))) return;
    const cr = this.remunerada();
    const mensual = cr ? M.saldo(cr).por(cr.TNA).div(C12) : CERO;
    res.push(nuevoAviso({ Nivel: NivelAviso.Positivo, Orden: 80,
      Titulo: 'Tus cuentas remuneradas generaron ~' + pzR(total) + ' este mes',
      Detalle: 'A este ritmo son ~' + pzR(mensual) + ' por mes sin hacer nada. Es estimado: ajustá el saldo real de vez en cuando.',
      Clave: 'rend-' + Per.de(Hoy) }));
  }
}
