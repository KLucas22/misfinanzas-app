// ============================================================================
//  Movimientos: todo lo cargado, por día, con búsqueda y filtro por mes.
// ============================================================================

import { h, icono, colorCss, textoMonto, grupo, fila, vacio, chips } from '../ui.js';
import { E, hoy } from '../estado.js';
import { vistaPrincipal, Fmt, F } from './comun.js';
import { Per } from '../../nucleo/formato.js';
import { esDeTarjeta } from '../../nucleo/modelo.js';
import { CERO } from '../../nucleo/decimal.js';
import { abrirMovimiento } from '../formularios/movimiento.js';

const filtro = { texto: '', mes: null, clase: 'todo' };

const ICONO_TIPO = { Gasto: ['gasto', 'gasto'], Ingreso: ['ingreso', 'ingreso'], Transferencia: ['transferencia', 'transferencia'], PagoTarjeta: ['pago', 'pago'], Ajuste: ['ajuste', 'ajuste'] };

export function filaMovimiento(m) {
  const l = E.libro;
  const [ic, clase] = ICONO_TIPO[m.Tipo] || ['info', ''];
  let detalle = l.nombreMedio(m);
  if (esDeTarjeta(m) && m.Cuotas > 1) detalle += ' · ' + m.Cuotas + ' cuotas';
  if (m.Categoria && (m.Tipo === 'Gasto' || m.Tipo === 'Ingreso')) detalle += ' · ' + m.Categoria;
  const positivo = m.Tipo === 'Ingreso' || (m.Tipo === 'Ajuste' && m.Monto.signo > 0);
  const t = esDeTarjeta(m) ? l.tarjeta(m.TarjetaId) : null;
  return fila({ icono: ic, claseIcono: 'icono-mov ' + clase, colorIcono: t ? colorCss(t.ColorArgb) : null,
    t1: [m.Descripcion || '(sin descripción)', m.Auto ? h('span', { class: 'etiqueta-auto' }, 'auto') : null],
    t2: detalle, t2una: true,
    derecha: h('span', { class: 'num monto-mov' + (positivo ? ' positivo' : '') }, (positivo ? '+' : '') + textoMonto(m.Monto, m.Moneda)),
    onClick: () => abrirMovimiento({ existente: m }) });
}

export function pantallaMovimientos(_p, rerender) {
  const l = E.libro, d = hoy();
  if (filtro.mes === null) filtro.mes = Per.de(d);
  // Meses con movimientos (y el actual)
  const meses = new Set([Per.de(d)]);
  for (const m of l.movimientos) meses.add(Per.de(m.Fecha));
  const listaMeses = [...meses].sort((a, b) => b - a).slice(0, 24);

  const caja = h('input', { type: 'search', placeholder: 'Buscar', value: filtro.texto, autocomplete: 'off', enterkeyhint: 'search' });
  let timer = null;
  caja.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { filtro.texto = caja.value; pintarLista(); }, 180); });

  const zonaLista = h('div');
  function pintarLista() {
    zonaLista.innerHTML = '';
    const n = Fmt.normalizar(filtro.texto);
    const movs = l.movimientos.filter((m) => {
      if (n) {
        const texto = Fmt.normalizar(m.Descripcion + ' ' + m.Categoria + ' ' + l.nombreMedio(m) + ' ' + m.Nota);
        if (!texto.includes(n)) return false;
      } else if (filtro.mes !== 0 && Per.de(m.Fecha) !== filtro.mes) return false;
      if (filtro.clase === 'gastos' && m.Tipo !== 'Gasto') return false;
      if (filtro.clase === 'ingresos' && m.Tipo !== 'Ingreso') return false;
      if (filtro.clase === 'tarjetas' && !esDeTarjeta(m)) return false;
      if (filtro.clase === 'cuentas' && esDeTarjeta(m)) return false;
      return true;
    }).sort((a, b) => (b.Fecha - a.Fecha) || (b.Id - a.Id));
    if (!movs.length) {
      zonaLista.appendChild(vacio(n ? 'No hay resultados' : 'Sin movimientos este mes', n ? 'Probá con otra palabra.' : 'Tocá + para cargar un gasto.'));
      return;
    }
    // Totales del filtro
    let gastos = CERO, ingresos = CERO;
    for (const m of movs) {
      const v = m.Moneda === 'USD' ? m.Monto.por(l.config.DolarTarjeta) : m.Monto;
      if (m.Tipo === 'Gasto') gastos = gastos.mas(v); else if (m.Tipo === 'Ingreso') ingresos = ingresos.mas(v);
    }
    zonaLista.appendChild(h('div', { class: 'desglose', style: { padding: '2px 16px 0' } },
      h('span', { class: 'dato' }, 'Gastos', h('b', null, textoMonto(gastos, 'ARS', true))),
      h('span', { class: 'dato' }, 'Ingresos', h('b', null, textoMonto(ingresos, 'ARS', true))),
      h('span', { class: 'dato' }, Fmt.plural(movs.length, 'movimiento', 'movimientos'))));
    let i = 0;
    const MAX = 400;
    while (i < movs.length && i < MAX) {
      const dia = Math.floor(movs[i].Fecha);
      const delDia = [];
      while (i < movs.length && Math.floor(movs[i].Fecha) === dia && i < MAX) { delDia.push(movs[i]); i++; }
      let tot = CERO;
      for (const m of delDia) if (m.Tipo === 'Gasto') tot = tot.mas(m.Moneda === 'USD' ? m.Monto.por(l.config.DolarTarjeta) : m.Monto);
      const titulo = dia === d ? 'Hoy' : dia === d - 1 ? 'Ayer' : Fmt.capital(Fmt.fechaDia(dia)) + (F.anio(dia) !== F.anio(d) ? '/' + F.anio(dia) : '');
      zonaLista.appendChild(h('div', { class: 'dia-mov' },
        h('div', { class: 'titulo-dia' }, h('span', null, titulo), tot.signo > 0 ? h('span', { class: 'num' }, textoMonto(tot, 'ARS', true)) : null),
        grupo(...delDia.map(filaMovimiento))));
    }
    if (movs.length > MAX) zonaLista.appendChild(h('p', { class: 'nota-pie', style: { margin: '12px 20px' } }, 'Se muestran los ' + MAX + ' más recientes. Buscá para ver otros.'));
  }

  const chipsMes = chips([{ valor: 0, texto: 'Todos' }, ...listaMeses.map((p) => ({ valor: p, texto: Fmt.capital(Fmt.mesDe(p)) + (Per.anio(p) !== Per.anio(Per.de(d)) ? ' ' + Per.anio(p) : '') }))],
    filtro.mes, (v) => { filtro.mes = v; pintarLista(); });
  const chipsClase = chips([{ valor: 'todo', texto: 'Todo' }, { valor: 'gastos', texto: 'Gastos' }, { valor: 'ingresos', texto: 'Ingresos' }, { valor: 'tarjetas', texto: 'Con tarjeta' }, { valor: 'cuentas', texto: 'De cuentas' }],
    filtro.clase, (v) => { filtro.clase = v; pintarLista(); });
  pintarLista();

  return vistaPrincipal('#/movimientos', {
    titulo: 'Movimientos',
    derecha: h('button', { class: 'boton-icono', type: 'button', 'aria-label': 'Nuevo movimiento', onClick: () => abrirMovimiento({}) }, icono('mas')),
    contenido: [
      h('div', { class: 'buscador' }, h('div', { class: 'caja-busqueda' }, icono('buscar'), caja)),
      h('div', { style: { padding: '0 16px' } }, chipsMes),
      h('div', { style: { padding: '6px 16px 0' } }, chipsClase),
      zonaLista,
    ],
  });
}
