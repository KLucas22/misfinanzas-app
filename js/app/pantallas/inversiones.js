// ============================================================================
//  Inversiones y metas: tu situación, qué conviene hacer con la plata según el
//  mercado de hoy, el plan mensual por perfil, tus metas y los datos de mercado.
// ============================================================================

import { h, icono, colorCss, textoMonto, seccion, grupo, fila, segmentado, barra, toast, preguntar } from '../ui.js';
import { E, hoy, guardar } from '../estado.js';
import { vistaSecundaria, Fmt, F } from './comun.js';
import { D, Dec } from '../../nucleo/decimal.js';
import { DatosMercado, actualizar } from '../../nucleo/mercado.js';
import { diagnosticar, opciones, plan, estado, mensualDiaria, nombrePerfil } from '../../nucleo/inversiones.js';
import { abrirMeta, textoEstado } from '../formularios/meta.js';
import { filaAviso } from './inicio.js';

let actualizando = false;
let intentoAuto = 0;

async function actualizarMercado(avisar, rerender) {
  if (actualizando) return;
  actualizando = true;
  if (rerender) rerender();
  try {
    const inf = await actualizar(E.libro, hoy());
    if (inf.Correctas.length) await guardar();
    if (avisar || !inf.Correctas.length) toast(inf.texto(), { error: !inf.Correctas.length, duracion: 6000 });
  } catch (e) {
    if (avisar) toast('No se pudieron actualizar los datos de mercado.', { error: true });
  } finally {
    actualizando = false;
    if (rerender) rerender();
  }
}

function dato(et, val, sub = null, clase = '') {
  return h('div', { class: 'cifra-caja' }, h('div', { class: 'et' }, et), h('div', { class: 'val ' + clase }, val), sub ? h('div', { class: 'sub' }, sub) : null);
}

export function pantallaInversiones(_p, rerender) {
  const l = E.libro, m = E.motor, d = hoy(), cfg = l.config;
  const mk = DatosMercado.desde(l);
  const dg = diagnosticar(m);
  const perfil = (cfg.PerfilInversor || 'moderado').toLowerCase();

  // Actualización automática (una vez por día, como en la PC)
  const vencido = cfg.MercadoActualizado === null || Math.floor(cfg.MercadoActualizado) < d;
  if (cfg.MercadoAuto && vencido && E.hoyFijo === null && Date.now() - intentoAuto > 10 * 60 * 1000) {
    intentoAuto = Date.now();
    setTimeout(() => actualizarMercado(false, rerender), 300);
  }

  const fuente = mk.EsReferencia ? 'Datos de referencia del 27/10/2026 (todavía no se descargaron)'
    : 'Datos del ' + Fmt.fecha(cfg.MercadoActualizado) + ' a las ' + F.dos(Math.floor(F.segundos(cfg.MercadoActualizado) / 3600)) + ':' + F.dos(Math.floor((F.segundos(cfg.MercadoActualizado) % 3600) / 60));

  // ---- Tu situación
  const situacion = h('div', { class: 'cifras' },
    dato('Ahorro mensual', textoMonto(dg.AhorroMensual, 'ARS', true), dg.IngresoMensual.signo > 0 ? Fmt.pct(dg.TasaAhorro, 0) + ' de lo que entra' : null, dg.AhorroMensual.signo < 0 ? 'rojo' : ''),
    dato('Fondo de emergencia', Fmt.num(Dec.min(dg.FondoMeses, D(99)), 1) + ' meses', 'de ' + dg.MesesObjetivo + ' recomendados', dg.FondoCompleto ? 'verde' : ''),
    dato('Libre después de pagar', textoMonto(dg.Libre, 'ARS', true)),
    dato('Cuotas pendientes', textoMonto(dg.CuotasPendientes, 'ARS', true), 'el mes que viene ' + textoMonto(dg.CuotasProximoMes, 'ARS', true)));

  // ---- Qué conviene
  const ops = opciones(dg, mk, perfil);
  const secOpciones = seccion('Qué conviene hacer con tu plata', grupo(...ops.map((a) => filaAviso(a, rerender))), { pie: 'Es información para decidir vos, no un consejo de inversión.' });

  // ---- Plan mensual
  const filasPlan = plan(dg, mk, perfil);
  const secPlan = seccion('Plan mensual · perfil ' + nombrePerfil(perfil).toLowerCase(), h('div', null,
    h('div', { style: { marginBottom: '10px' } }, segmentado([['conservador', 'Conservador'], ['moderado', 'Moderado'], ['agresivo', 'Agresivo']], perfil, async (v) => {
      cfg.PerfilInversor = v; await guardar();
    })),
    filasPlan.length ? h('div', null,
      h('div', { class: 'reparto' }, ...filasPlan.map((f) => h('i', { style: { '--c': colorCss(f.ColorArgb), flex: f.MontoMensual.toString() } }))),
      grupo(...filasPlan.map((f) => fila({ punto: colorCss(f.ColorArgb), t1: f.Destino, t2: f.Instrumento + ' · riesgo ' + f.Riesgo.toLowerCase() + ' · ' + f.Rendimiento,
        derecha: h('span', { class: 'num' }, textoMonto(f.MontoMensual, 'ARS', true)), derecha2: Fmt.pct(f.Porcentaje, 0) })))) :
      grupo(fila({ t1: 'Hoy no te queda ahorro mensual', t2: 'Cuando entre más de lo que sale, acá aparece cómo repartirlo.' }))));

  // ---- Metas
  const activas = l.metas.filter((x) => x.Activa).length;
  const filasMetas = l.metas.map((mt) => {
    const e = estado(mt, dg, mk, d, activas);
    return h('button', { class: 'fila', type: 'button', style: { display: 'block' }, onClick: () => abrirMeta(mt) },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '10px' } }, h('span', { class: 't1', style: { fontWeight: 600 } }, mt.Nombre + (mt.Activa ? '' : ' (pausada)')),
        h('span', { class: 'num' }, Fmt.monto(mt.Ahorrado, mt.Moneda).replace(',00', '') + ' de ' + Fmt.monto(e.Objetivo, mt.Moneda).replace(',00', ''))),
      barra(Number(e.Progreso.toString()), 'var(--acento)'),
      h('div', { class: 't2', style: { marginTop: '6px' } }, textoEstado(e)));
  });
  const secMetas = seccion('Tus metas', h('div', null,
    filasMetas.length ? grupo(...filasMetas) : null,
    h('div', { class: 'botonera' }, h('button', { class: 'boton secundario', type: 'button', onClick: async () => {
      const t = await preguntar({ titulo: 'Nueva meta', opciones: [['Vivienda', 'Vivienda (con crédito UVA)'], ['Auto', 'Auto'], ['Viaje', 'Viaje'], ['Fondo', 'Fondo de emergencia'], ['Otra', 'Otra']].map(([v, t]) => ({ texto: t, valor: v })) });
      if (t) abrirMeta(null, t);
    } }, icono('mas'), 'Agregar meta'))));

  // ---- Mercado
  const varMEP = mk.variacionMEP(30);
  const secDolar = seccion('Dólar', h('div', { class: 'cifras' },
    dato('MEP', textoMonto(mk.MEP, 'ARS', true), (varMEP.signo >= 0 ? '+' : '') + Fmt.pct(varMEP, 1) + ' en 30 días'),
    dato('Oficial', textoMonto(mk.Oficial, 'ARS', true), 'Brecha ' + Fmt.pct(mk.Brecha, 1)),
    dato('Blue', textoMonto(mk.Blue, 'ARS', true)),
    dato('Tarjeta', textoMonto(mk.Tarjeta, 'ARS', true)),
    dato('CCL', textoMonto(mk.CCL, 'ARS', true)),
    dato('Cripto', textoMonto(mk.Cripto, 'ARS', true))));
  const secTasas = seccion('Tasas en pesos', grupo(
    fila({ t1: 'Fondo money market', t2: 'Mercado Pago · ' + Fmt.pct(mk.FCIMercadoPago, 1) + ' TNA', derecha: h('span', { class: 'num' }, Fmt.pct(mensualDiaria(mk.FCIMercadoPago), 2)), derecha2: 'por mes' }),
    fila({ t1: 'Plazo fijo Banco Nación', t2: Fmt.pct(mk.PFNacion, 1) + ' TNA', derecha: h('span', { class: 'num' }, Fmt.pct(mk.PFNacion.por(D(30)).div(D(365)), 2)), derecha2: 'por mes' }),
    fila({ t1: 'Mejor banco grande', t2: mk.PFMejorGrandeEntidad + ' · ' + Fmt.pct(mk.PFMejorGrande, 1) + ' TNA', derecha: h('span', { class: 'num' }, Fmt.pct(mk.PFMejorGrande.por(D(30)).div(D(365)), 2)), derecha2: 'por mes' }),
    fila({ t1: 'LECAP corta', t2: mk.LecapCortaTicker, derecha: h('span', { class: 'num' }, Fmt.pct(mk.LecapCortaTEM, 2)), derecha2: 'por mes' }),
    fila({ t1: 'LECAP a 6 meses', t2: mk.LecapLargaTicker, derecha: h('span', { class: 'num' }, Fmt.pct(mk.LecapLargaTEM, 2)), derecha2: 'por mes' })));
  const secInfl = seccion('Inflación', h('div', { class: 'cifras' },
    dato(Fmt.capital(Fmt.nombreMes(F.mes(mk.FechaInflacion))), Fmt.num(mk.InflacionMes, 1) + ' %', 'INDEC'),
    dato('Últimos 12 meses', Fmt.num(mk.Inflacion12m, 1) + ' %'),
    dato('Esperada ' + mk.REMPeriodoMes, Fmt.num(mk.REMInflacionMes, 1) + ' %', 'REM del BCRA'),
    dato('Esperada 12 meses', Fmt.num(mk.REMInflacion12m, 1) + ' %', 'Riesgo país ' + Fmt.num(mk.RiesgoPais, 0))));
  const acciones = [...mk.Acciones].sort((a, b) => (a.EsCedear - b.EsCedear) || a.Simbolo.localeCompare(b.Simbolo));
  const secAcciones = acciones.length ? seccion('Acciones y CEDEARs', grupo(...acciones.map((a) => fila({ t1: a.Simbolo, t2: a.EsCedear ? 'CEDEAR' : 'Acción argentina',
    derecha: h('span', { class: 'num' }, textoMonto(a.Precio, 'ARS', true)), derecha2: h('span', { class: a.Variacion.signo < 0 ? 'rojo' : 'verde' }, (a.Variacion.signo >= 0 ? '+' : '') + Fmt.num(a.Variacion, 2) + ' %') }))),
  { pie: 'Precios en pesos, demorados.' }) : null;
  const secHipo = seccion('Créditos hipotecarios UVA', grupo(...mk.Hipotecarios.slice(0, 8).map((x) => fila({ t1: x.Entidad, t2: 'Hasta ' + x.PlazoAnios + ' años · financia ' + Fmt.pct(x.Financiamiento, 0) + ' · cuota hasta ' + Fmt.pct(x.RelacionCuota, 0) + ' del ingreso',
    derecha: h('span', { class: 'num' }, Fmt.pct(x.TNA, 1)), derecha2: '+ UVA' }))));

  return vistaSecundaria('#/inversiones', {
    titulo: 'Inversiones',
    derecha: h('button', { class: 'boton-texto', type: 'button', disabled: actualizando, onClick: () => actualizarMercado(true, rerender) }, actualizando ? 'Actualizando…' : 'Actualizar'),
    contenido: [
      h('p', { class: 'nota-pie', style: { margin: '0 20px 12px' } }, fuente),
      h('section', { class: 'seccion', style: { marginTop: 0 } }, situacion),
      secOpciones, secPlan, secMetas, secDolar, secTasas, secInfl, secAcciones, secHipo,
    ],
  });
}
