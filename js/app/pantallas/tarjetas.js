// ============================================================================
//  Tarjetas: cada una con su resumen abierto, y el detalle de cada resumen
//  (consumos, cuotas, fijos, pagos, total real y estado).
// ============================================================================

import { h, icono, colorCss, esClaro, textoMonto, seccion, grupo, fila, vacio } from '../ui.js';
import { E, hoy } from '../estado.js';
import { vistaSecundaria, Fmt } from './comun.js';
import { Per } from '../../nucleo/formato.js';
import { EstadoResumen, NOMBRE_ESTADO, TipoItem } from '../../nucleo/motor.js';
import { abrirPago, abrirResumen, abrirMovimiento, editarItem } from '../formularios/movimiento.js';
import { abrirTarjeta } from '../formularios/otros.js';

export function pantallaTarjetas() {
  const l = E.libro, m = E.motor, d = hoy();
  const filas = [];
  for (const t of [...l.tarjetas].sort((a, b) => (b.Activa - a.Activa) || a.Nombre.localeCompare(b.Nombre, 'es'))) {
    const pa = m.periodoAbierto(t);
    const r = m.resumenDe(t, pa);
    let pendiente = null;
    for (let q = l.config.PeriodoInicial; q < pa; q = Per.sumar(q, 1)) {
      const rr = m.resumenDe(t, q);
      if (rr.pendientePesos(m.Dolar).signo > 0) { pendiente = rr; break; }
    }
    const t2 = !t.Activa ? 'Inactiva'
      : (pendiente ? 'A pagar ' + textoMonto(pendiente.pendientePesos(m.Dolar), 'ARS', true) + ' el ' + Fmt.fechaDia(pendiente.Vencimiento) + ' · ' : '') +
        'cierra ' + Fmt.fechaCorta(r.Cierre) + ', vence ' + Fmt.fechaCorta(r.Vencimiento);
    filas.push(fila({ icono: 'tarjeta', colorIcono: colorCss(t.ColorArgb), t1: t.Nombre, t2, derecha: h('span', { class: 'num' }, textoMonto(r.totalPesos(m.Dolar), 'ARS', true)),
      derecha2: 'en curso', chevron: true, onClick: () => { location.hash = '#/tarjeta/' + t.Id + '/' + (pendiente ? pendiente.Periodo : pa); } }));
  }
  return vistaSecundaria('#/tarjetas', {
    titulo: 'Tarjetas',
    derecha: h('button', { class: 'boton-texto', type: 'button', onClick: () => abrirTarjeta(null) }, 'Agregar'),
    contenido: [
      filas.length ? h('section', { class: 'seccion', style: { marginTop: '8px' } }, grupo(...filas)) : vacio('Sin tarjetas', 'Cargá tus tarjetas para saber en qué resumen cae cada compra.', () => abrirTarjeta(null), 'Agregar tarjeta'),
      filas.length ? h('section', { class: 'seccion' }, h('button', { class: 'boton ancho', type: 'button', onClick: () => abrirPago(null) }, icono('pago'), 'Registrar un pago')) : null,
    ],
  });
}

export function pantallaTarjeta([idTxt, perTxt]) {
  const l = E.libro, m = E.motor, d = hoy();
  const t = l.tarjeta(Number(idTxt));
  if (!t) return vistaSecundaria('#/tarjeta', { titulo: 'Tarjeta', atras: 'Tarjetas', contenido: vacio('No encuentro esa tarjeta', 'Puede que se haya borrado en la PC.') });
  const pa = m.periodoAbierto(t);
  const p = perTxt ? Number(perTxt) : pa;
  const r = m.resumenDe(t, p);
  const est = r.estado(d);
  const claro = esClaro(t.ColorArgb || -14326805);

  // Selector de resúmenes (deslizable)
  const periodos = [];
  for (let q = Per.sumar(pa, -4); q <= Per.sumar(pa, 6); q = Per.sumar(q, 1)) if (q >= Per.sumar(l.config.PeriodoInicial, -1)) periodos.push(q);
  const tira = h('div', { class: 'periodos' }, ...periodos.map((q) => {
    const rr = m.resumenDe(t, q);
    const e = rr.estado(d);
    return h('button', { class: 'periodo-btn' + (q === p ? ' activo' : ''), type: 'button', onClick: () => { location.replace('#/tarjeta/' + t.Id + '/' + q); } },
      h('div', { class: 'm' }, Fmt.capital(Fmt.mesDe(q)) + (Per.anio(q) !== Per.anio(d) ? ' ' + String(Per.anio(q) % 100).padStart(2, '0') : '')),
      h('div', { class: 'e' }, e === EstadoResumen.Abierto ? 'abierto' : e === EstadoResumen.Futuro ? 'próximo' : Fmt.capital(NOMBRE_ESTADO[e] === 'SinConsumos' ? 'sin consumos' : NOMBRE_ESTADO[e].toLowerCase())),
      h('div', { class: 'v' }, textoMonto(rr.totalPesos(m.Dolar), 'ARS', true)));
  }));
  setTimeout(() => { const a = tira.querySelector('.activo'); if (a) a.scrollIntoView({ inline: 'center', block: 'nearest' }); }, 0);

  const plastico = h('div', { class: 'plastico' + (claro ? ' claro' : ''), style: { '--color-tarjeta': colorCss(t.ColorArgb) } },
    h('div', { class: 'nombre' }, t.Nombre),
    h('div', { class: 'chip-oro' }),
    h('div', { class: 'fila-plastico' },
      h('div', null, 'Cierra', h('b', null, Fmt.fechaCorta(r.Cierre))),
      h('div', null, 'Vence', h('b', null, Fmt.fechaCorta(r.Vencimiento))),
      h('div', { style: { textAlign: 'right' } }, Fmt.capital(Fmt.mesDe(p)), h('b', null, textoMonto(r.totalPesos(m.Dolar), 'ARS', true)))));

  const nombreEstado = { 0: 'Próximo', 1: 'Abierto', 2: 'Cerrado', 3: 'Vencido', 4: 'Pagado', 5: 'Sin consumos' }[est];
  const totales = h('div', { class: 'resumen-totales' },
    h('div', { class: 'caja-total' }, h('div', { class: 'et' }, r.RealARS !== null ? 'Total real (pesos)' : 'Total en pesos'), h('div', { class: 'val' }, textoMonto(r.AbonarARS, 'ARS'))),
    h('div', { class: 'caja-total' }, h('div', { class: 'et' }, r.RealUSD !== null ? 'Total real (dólares)' : 'Total en dólares'), h('div', { class: 'val' }, textoMonto(r.AbonarUSD, 'USD'))),
    (r.PagadoARS.signo > 0 || r.PagadoUSD.signo > 0) ? h('div', { class: 'caja-total' }, h('div', { class: 'et' }, 'Pagado'), h('div', { class: 'val' }, textoMonto(r.PagadoARS, 'ARS', true)), r.PagadoUSD.signo > 0 ? h('div', { class: 'sec' }, '+ ' + textoMonto(r.PagadoUSD, 'USD')) : null) : null,
    (est === EstadoResumen.Cerrado || est === EstadoResumen.Vencido) ? h('div', { class: 'caja-total' }, h('div', { class: 'et' }, 'Falta pagar'), h('div', { class: 'val ' + (est === EstadoResumen.Vencido ? 'rojo' : '') }, textoMonto(r.pendientePesos(m.Dolar), 'ARS', true))) : null,
    est === EstadoResumen.Abierto ? h('div', { class: 'caja-total' }, h('div', { class: 'et' }, 'Estimado al cierre'), h('div', { class: 'val' }, textoMonto(m.totalEstimadoCierre(r), 'ARS', true))) : null);

  const botones = h('div', { class: 'botonera' },
    h('button', { class: 'boton', type: 'button', onClick: () => abrirPago(r) }, 'Registrar pago'),
    h('button', { class: 'boton secundario', type: 'button', onClick: () => abrirResumen(t, p) }, 'Total real y fechas'));

  // Ítems agrupados
  const grupos = [[TipoItem.Consumo, 'Consumos'], [TipoItem.Cuota, 'Cuotas'], [TipoItem.Fijo, 'Fijos y suscripciones'], [TipoItem.Credito, 'Créditos y reintegros']];
  const secciones = [];
  for (const [tipo, titulo] of grupos) {
    const items = r.Items.filter((it) => it.Tipo === tipo);
    if (!items.length) continue;
    let tot = null;
    const filas = items.map((it) => {
      tot = tot ? tot.mas(it.enPesos(m.Dolar)) : it.enPesos(m.Dolar);
      return fila({ t1: it.Descripcion, t2: Fmt.fechaDia(it.Fecha) + (it.Tipo !== TipoItem.Consumo ? ' · ' + it.TextoTipo : '') + (it.Categoria ? ' · ' + it.Categoria : ''),
        derecha: h('span', { class: 'num' + (it.Monto.signo < 0 ? ' verde' : '') }, textoMonto(it.Monto, it.Moneda)), onClick: () => editarItem(it, r) });
    });
    secciones.push(seccion(titulo + ' (' + items.length + ')', grupo(...filas), { pie: 'Total ' + textoMonto(tot, 'ARS') }));
  }
  const dif = r.AbonarARS.menos(r.TotalARS);
  if (r.RealARS !== null && !dif.esCero) secciones.push(h('p', { class: 'nota-pie', style: { margin: '10px 20px 0' } }, 'Impuestos y cargos del banco (diferencia con lo cargado): ' + textoMonto(dif, 'ARS') + '.'));
  const pagos = m.pagos(t.Id, p);
  if (pagos.length) {
    secciones.push(seccion('Pagos', grupo(...pagos.map((pg) => fila({ icono: 'pago', claseIcono: 'icono-mov pago', t1: pg.Descripcion, t2: Fmt.fechaDia(pg.Fecha) + ' · ' + E.libro.nombreMedio(pg),
      derecha: h('span', { class: 'num' }, textoMonto(pg.Monto, pg.Moneda)), onClick: () => abrirMovimiento({ existente: pg }) })))));
  }

  return vistaSecundaria('#/tarjeta/' + t.Id + '/' + p, {
    titulo: t.Nombre, grande: false,
    derecha: h('button', { class: 'boton-texto', type: 'button', onClick: () => abrirTarjeta(t) }, 'Editar'),
    contenido: [
      h('section', { class: 'seccion', style: { marginTop: '8px' } }, plastico, tira,
        h('div', { style: { marginTop: '10px' } }, h('span', { class: 'estado ' + NOMBRE_ESTADO[est] }, nombreEstado),
          h('span', { class: 'sec', style: { marginLeft: '8px', fontSize: '14px' } }, 'Compras del ' + Fmt.fechaCorta(r.Inicio) + ' al ' + Fmt.fechaCorta(r.Cierre))),
        totales, botones),
      ...secciones,
      !r.Items.length ? h('section', { class: 'seccion' }, vacio('Sin consumos en este resumen', null, () => abrirMovimiento({ tipo: 'Gasto', tarjetaId: t.Id }), 'Cargar un gasto')) : null,
    ],
  });
}
