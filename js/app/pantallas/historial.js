// ============================================================================
//  Historial (lo que pasó cada mes, por categoría) y proyección de los
//  próximos meses (ingresos, fijos, cuotas y tarjetas).
// ============================================================================

import { h, colorCss, textoMonto, seccion, grupo, fila, segmentado, chips, barra } from '../ui.js';
import { E, hoy } from '../estado.js';
import { vistaSecundaria, Fmt } from './comun.js';
import { Per } from '../../nucleo/formato.js';
import { colorDe } from '../../nucleo/categorias.js';
import { CERO } from '../../nucleo/decimal.js';

const est = { modo: 'mes', periodo: null };

function vistaMes(rerender) {
  const l = E.libro, m = E.motor, d = hoy();
  const periodos = m.periodosHistorial();
  // Por defecto, como la PC: el mes de pago más próximo
  if (est.periodo === null || !periodos.includes(est.periodo)) est.periodo = periodos.includes(m.periodoAPagar()) ? m.periodoAPagar() : periodos[periodos.length - 1];
  const rm = m.resumenDelMes(est.periodo);
  const cats = [...rm.PorCategoria.entries()].filter(([, v]) => v.signo > 0).sort((a, b) => b[1].cmp(a[1]));
  const maximo = cats.length ? cats[0][1] : CERO;
  const ing = rm.Ingresos.mas(rm.Rendimientos);
  // Mes en curso y próximos: resultado esperado (lo cargado + lo que falta cobrar y pagar), como en la PC
  let esperado = null;
  const pHoy = Per.de(d);
  if (est.periodo >= pHoy) {
    const n = Per.diferencia(pHoy, est.periodo) + 1;
    const mp = m.proyectar(Math.min(n, 24)).find((x) => x.Periodo === est.periodo);
    if (mp) esperado = rm.Ingresos.mas(mp.Ingresos).mas(rm.Rendimientos.mas(mp.Rendimientos)).menos(rm.GastosCuenta.mas(mp.FijosCuenta).mas(rm.Tarjetas).mas(mp.TarjEstimado));
  }
  const res = esperado !== null ? esperado : rm.Resultado;
  return [
    h('div', { style: { padding: '0 16px' } }, chips([...periodos].reverse().slice(0, 18).map((p) => ({ valor: p, texto: Fmt.capital(Fmt.mesDe(p)) + (Per.anio(p) !== Per.anio(Per.de(d)) ? ' ' + Per.anio(p) : '') })),
      est.periodo, (v) => { est.periodo = v; rerender(); })),
    h('section', { class: 'seccion', style: { marginTop: '14px' } }, h('div', { class: 'cifras' },
      h('div', { class: 'cifra-caja' }, h('div', { class: 'et' }, 'Ingresos'), h('div', { class: 'val verde' }, textoMonto(ing, 'ARS', true)), rm.Rendimientos.signo > 0 ? h('div', { class: 'sub' }, 'Incluye ' + textoMonto(rm.Rendimientos, 'ARS', true) + ' de intereses') : null),
      h('div', { class: 'cifra-caja' }, h('div', { class: 'et' }, 'Gastos'), h('div', { class: 'val' }, textoMonto(rm.Egresos, 'ARS', true)), h('div', { class: 'sub' }, 'Tarjetas ' + textoMonto(rm.Tarjetas, 'ARS', true))),
      h('div', { class: 'cifra-caja', style: { gridColumn: '1 / -1' } },
        h('div', { class: 'et' }, esperado !== null ? (res.signo >= 0 ? 'Te va a quedar' : 'Vas a gastar de más') : (res.signo >= 0 ? 'Te quedó' : 'Gastaste de más')),
        h('div', { class: 'val ' + (res.signo >= 0 ? 'verde' : 'rojo') }, textoMonto(res.abs(), 'ARS', true)),
        esperado !== null ? h('div', { class: 'sub' }, 'Resultado esperado: lo cargado más lo que falta cobrar y pagar en el mes (cargado hasta hoy: ' + textoMonto(rm.Resultado, 'ARS', true) + ').')
          : (ing.signo > 0 ? h('div', { class: 'sub' }, 'Ahorro: ' + Fmt.pct(rm.TasaAhorro, 0) + ' de lo que entró (meta ' + Fmt.pct(l.config.MetaAhorro, 0) + ')') : null)))),
    cats.length ? seccion('Por categoría', grupo(...cats.map(([k, v]) => h('div', { class: 'fila', style: { display: 'block' } },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '10px' } }, h('span', null, k), h('span', { class: 'num' }, textoMonto(v, 'ARS', true))),
      barra(maximo.signo > 0 ? Number(v.div(maximo).toString()) : 0, colorCss(colorDe(l, k), '#64748B'))))),
    { pie: 'Lo de tarjeta cuenta en el mes en que se paga el resumen (como en la PC).' }) : null,
  ];
}

function vistaProyeccion() {
  const m = E.motor;
  const proy = m.proyectar(7);
  return [seccion('Próximos meses', grupo(...proy.map((x, i) => fila({
    t1: Fmt.capital(Fmt.mesDe(x.Periodo)) + (i === 0 ? ' (este mes)' : ''),
    t2: 'Entra ' + textoMonto(x.Ingresos.mas(x.Rendimientos), 'ARS', true) + ' · tarjetas ' + textoMonto(x.Tarjetas, 'ARS', true) + (x.FijosCuenta.signo > 0 ? ' · fijos ' + textoMonto(x.FijosCuenta, 'ARS', true) : '') +
      (x.TarjCuotas.signo > 0 ? ' · cuotas ' + textoMonto(x.TarjCuotas, 'ARS', true) : ''),
    derecha: h('span', { class: 'num' + (x.SaldoFinal.signo < 0 ? ' rojo' : '') }, textoMonto(x.SaldoFinal, 'ARS', true)),
    derecha2: (x.Resultado.signo >= 0 ? '+' : '') + textoMonto(x.Resultado, 'ARS', true),
  }))), { pie: 'Saldo al final de cada mes con tus ingresos, fijos, cuotas y el consumo habitual de las tarjetas.' }),
  cuotasFuturas()];
}

function cuotasFuturas() {
  const m = E.motor;
  const cp = m.cuotasPorPeriodo(12).filter((x) => x.Total.signo > 0);
  if (!cp.length) return null;
  const { total, ultimoPeriodo } = m.cuotasPendientesTotal();
  return seccion('Cuotas', grupo(...cp.map((x) => fila({ t1: Fmt.capital(Fmt.mesDe(x.Periodo)) + ' ' + Per.anio(x.Periodo), t2: x.Terminan.length ? 'Termina: ' + [...new Set(x.Terminan.map((i) => i.Descripcion))].join(', ') : Fmt.plural(x.Items.length, 'cuota', 'cuotas'),
    derecha: h('span', { class: 'num' }, textoMonto(x.Total, 'ARS', true)) })))
  , { pie: 'En total faltan ' + textoMonto(total, 'ARS', true) + (ultimoPeriodo ? ', hasta ' + Fmt.mesDe(ultimoPeriodo) + ' de ' + Per.anio(ultimoPeriodo) : '') + '.' });
}

export function pantallaHistorial(_p, rerender) {
  return vistaSecundaria('#/historial', {
    titulo: 'Historial',
    contenido: [
      h('div', { style: { padding: '0 16px 12px' } }, segmentado([['mes', 'Mes a mes'], ['proy', 'Lo que viene']], est.modo, (v) => { est.modo = v; rerender(); })),
      ...(est.modo === 'mes' ? vistaMes(rerender) : vistaProyeccion()),
    ],
  });
}
