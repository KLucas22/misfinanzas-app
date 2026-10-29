// ============================================================================
//  Cuentas (saldos con intereses estimados) y fijos del mes.
// ============================================================================

import { h, icono, colorCss, textoMonto, seccion, grupo, fila, vacio } from '../ui.js';
import { E, hoy } from '../estado.js';
import { vistaSecundaria, Fmt } from './comun.js';
import { Per } from '../../nucleo/formato.js';
import { Motor } from '../../nucleo/motor.js';
import { abrirMovimiento, abrirAjuste, registrarFijo } from '../formularios/movimiento.js';
import { abrirCuenta, abrirFijo } from '../formularios/otros.js';
import { filaMovimiento } from './movimientos.js';

const ICONO_CUENTA = { Banco: 'cuenta', Billetera: 'tarjeta', Efectivo: 'dolar', Inversion: 'inversiones' };

export function pantallaCuentas() {
  const l = E.libro, m = E.motor, d = hoy();
  const activas = l.cuentas.filter((c) => c.Activa), inactivas = l.cuentas.filter((c) => !c.Activa);
  const filaCuenta = (c) => {
    const saldo = m.saldo(c);
    const t2 = [c.Remunerada ? 'Remunerada ' + Fmt.pct(c.TNA, 1) + ' TNA' : null, c.Nota || null].filter(Boolean).join(' · ') || (c.Moneda === 'USD' ? 'En dólares' : 'En pesos');
    return fila({ icono: ICONO_CUENTA[c.Tipo] || 'cuenta', colorIcono: c.Remunerada ? 'var(--acento)' : (c.Moneda === 'USD' ? '#16A34A' : '#64748B'), t1: c.Nombre, t2,
      derecha: h('span', { class: 'num' + (saldo.signo < 0 ? ' rojo' : '') }, textoMonto(saldo, c.Moneda)), chevron: true, onClick: () => { location.hash = '#/cuenta/' + c.Id; } });
  };
  return vistaSecundaria('#/cuentas', {
    titulo: 'Cuentas',
    derecha: h('button', { class: 'boton-texto', type: 'button', onClick: () => abrirCuenta(null) }, 'Agregar'),
    contenido: [
      h('div', { class: 'desglose', style: { padding: '0 16px' } },
        h('span', { class: 'dato' }, 'Disponible', h('b', null, textoMonto(m.disponibleARS(), 'ARS', true))),
        m.disponibleUSD().signo !== 0 ? h('span', { class: 'dato' }, 'Dólares', h('b', null, textoMonto(m.disponibleUSD(), 'USD'))) : null),
      activas.length ? h('section', { class: 'seccion', style: { marginTop: '14px' } }, grupo(...activas.map(filaCuenta))) : vacio('Sin cuentas', 'Cargá tus cuentas para saber cuánto tenés.', () => abrirCuenta(null), 'Agregar cuenta'),
      inactivas.length ? seccion('Inactivas', grupo(...inactivas.map(filaCuenta))) : null,
      h('section', { class: 'seccion' }, h('div', { class: 'botonera' },
        h('button', { class: 'boton secundario', type: 'button', onClick: () => abrirMovimiento({ tipo: 'Transferencia' }) }, icono('transferencia'), 'Transferir'),
        h('button', { class: 'boton secundario', type: 'button', onClick: () => abrirAjuste(null) }, icono('ajuste'), 'Ajustar saldo'))),
    ],
  });
}

export function pantallaCuenta([idTxt]) {
  const l = E.libro, m = E.motor, d = hoy();
  const c = l.cuenta(Number(idTxt));
  if (!c) return vistaSecundaria('#/cuenta', { titulo: 'Cuenta', atras: 'Cuentas', contenido: vacio('No encuentro esa cuenta', 'Puede que se haya borrado en la PC.') });
  const saldo = m.saldo(c);
  const interes = c.Remunerada ? m.interesEntre(c, Per.primerDia(Per.de(d)), d) : null;
  const movs = l.movimientos.filter((x) => (x.CuentaId === c.Id && Motor.impacto(x, c.Id).signo !== 0) || x.CuentaDestinoId === c.Id)
    .sort((a, b) => (b.Fecha - a.Fecha) || (b.Id - a.Id)).slice(0, 60);
  return vistaSecundaria('#/cuenta/' + c.Id, {
    titulo: c.Nombre, atras: 'Cuentas',
    derecha: h('button', { class: 'boton-texto', type: 'button', onClick: () => abrirCuenta(c) }, 'Editar'),
    contenido: [
      h('section', { class: 'heroe', style: { paddingTop: '0' } },
        h('p', { class: 'frase' }, 'Saldo hoy'),
        h('div', { class: 'cifra' + (saldo.signo < 0 ? ' negativa' : '') }, h('span', { class: 'signo' }, c.Moneda === 'USD' ? 'USD' : '$'), Fmt.num(saldo.abs(), 2)),
        h('div', { class: 'desglose' },
          c.Remunerada ? h('span', { class: 'dato' }, 'TNA', h('b', null, Fmt.pct(c.TNA, 2))) : null,
          interes ? h('span', { class: 'dato' }, 'Intereses del mes', h('b', null, textoMonto(interes, c.Moneda))) : null,
          h('span', { class: 'dato' }, 'Último ajuste', h('b', null, Fmt.fechaCorta(m.ultimoAjuste(c)))))),
      h('section', { class: 'seccion', style: { marginTop: '14px' } }, h('div', { class: 'botonera', style: { marginTop: 0 } },
        h('button', { class: 'boton secundario', type: 'button', onClick: () => abrirAjuste(c) }, 'Ajustar saldo'),
        h('button', { class: 'boton secundario', type: 'button', onClick: () => abrirMovimiento({ tipo: 'Transferencia', cuentaId: c.Id }) }, 'Transferir'))),
      movs.length ? seccion('Últimos movimientos', grupo(...movs.map(filaMovimiento))) : h('section', { class: 'seccion' }, vacio('Sin movimientos', null)),
    ],
  });
}

export function pantallaFijos() {
  const l = E.libro, m = E.motor, d = hoy();
  const p = Per.de(d);
  const ocs = m.ocurrencias(Per.primerDia(p), Per.ultimoDia(p));
  const deCuenta = l.recurrentes.filter((r) => r.TarjetaId === 0).sort((a, b) => (b.Activo - a.Activo) || (a.Dia - b.Dia));
  const deTarjeta = l.recurrentes.filter((r) => r.TarjetaId !== 0).sort((a, b) => (b.Activo - a.Activo) || a.Descripcion.localeCompare(b.Descripcion, 'es'));
  const filaFijo = (r) => {
    const oc = ocs.find((o) => o.Rec === r);
    let t2;
    if (r.TarjetaId !== 0) { const t = l.tarjeta(r.TarjetaId); t2 = (t ? t.Nombre : 'tarjeta') + ' · día ' + r.Dia; }
    else { const c = l.cuenta(r.CuentaId); t2 = (c ? c.Nombre : 'cuenta') + ' · día ' + r.Dia + (r.AutoRegistrar ? ' · se registra solo' : ''); }
    if (!r.Activo) t2 = 'Pausado · ' + t2;
    else if (oc) t2 = (oc.Pendiente ? (oc.Fecha < d ? 'Pendiente' : 'Este mes el ' + Fmt.fechaCorta(oc.Fecha)) : 'Registrado este mes') + ' · ' + t2;
    return fila({ icono: r.Tipo === 'Ingreso' ? 'ingreso' : (r.TarjetaId ? 'tarjeta' : 'fijos'), colorIcono: r.Tipo === 'Ingreso' ? 'var(--acento)' : (r.TarjetaId ? colorCss((l.tarjeta(r.TarjetaId) || {}).ColorArgb) : '#64748B'),
      t1: r.Descripcion, t2, derecha: h('span', { class: 'num' + (r.Tipo === 'Ingreso' ? ' verde' : '') }, textoMonto(r.Monto, r.Moneda)),
      onClick: () => (oc && oc.Pendiente && r.Activo ? elegirFijo(r, oc) : abrirFijo(r)) });
  };
  return vistaSecundaria('#/fijos', {
    titulo: 'Fijos',
    derecha: h('button', { class: 'boton-texto', type: 'button', onClick: () => abrirFijo(null) }, 'Agregar'),
    contenido: [
      deCuenta.length ? seccion('De cuentas', grupo(...deCuenta.map(filaFijo)), { pie: 'Sueldo, alquiler y lo que se paga desde una cuenta. Si no se registran solos, te aparecen como pendientes.' }) : null,
      deTarjeta.length ? seccion('En tarjetas', grupo(...deTarjeta.map(filaFijo)), { pie: 'Suscripciones y débitos en tarjeta: se suman solos a cada resumen.' }) : null,
      !l.recurrentes.length ? vacio('Sin fijos', 'Cargá el sueldo, el alquiler o tus suscripciones para que la proyección sepa lo que viene.', () => abrirFijo(null), 'Agregar fijo') : null,
    ],
  });
}

async function elegirFijo(r, oc) {
  const { preguntar } = await import('../ui.js');
  const v = await preguntar({ titulo: r.Descripcion, opciones: [{ texto: 'Registrar el de ' + Fmt.mesDe(oc.Periodo), valor: 'reg', estilo: 'fuerte' }, { texto: 'Editar el fijo', valor: 'edit' }] });
  if (v === 'reg') registrarFijo(oc); else if (v === 'edit') abrirFijo(r);
}
