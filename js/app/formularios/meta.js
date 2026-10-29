// ============================================================================
//  Metas de ahorro (vivienda con crédito UVA, auto, viaje, fondo), igual que DlgMeta.
// ============================================================================

import { h, icono, abrirHoja, campo, entrada, entradaMonto, entradaFecha, selector, interruptor, grupo, toast, confirmar } from '../ui.js';
import { E, hoy, guardar, deshacer } from '../estado.js';
import { D, Dec, CERO, UNO } from '../../nucleo/decimal.js';
import { F } from '../../nucleo/fecha.js';
import { Fmt } from '../../nucleo/formato.js';
import { nuevo } from '../../nucleo/modelo.js';
import { DatosMercado } from '../../nucleo/mercado.js';
import { diagnosticar, estado } from '../../nucleo/inversiones.js';

export function textoMeses(meses) {
  if (meses < 12) return Fmt.plural(meses, 'mes', 'meses');
  const a = Math.trunc(meses / 12), r = meses % 12;
  return Fmt.plural(a, 'año', 'años') + (r > 0 ? ' y ' + Fmt.plural(r, 'mes', 'meses') : '');
}

/** Texto con el estado de una meta (igual que en la PC). */
export function textoEstado(e, largo = false) {
  const m = e.Meta;
  const f = (x) => Fmt.monto(x.redondear(0), m.Moneda).replace(',00', '');
  const partes = [];
  if (e.Vivienda) {
    const v = e.Vivienda;
    partes.push('Precio USD ' + Fmt.num(v.Precio, 0) + ': el banco te prestaría USD ' + Fmt.num(v.Prestamo, 0) +
      (v.LimitadoPorIngreso ? ' (tope por tu ingreso: cuota máxima ' + Fmt.pesosR(v.CuotaMaxima) + ')' : ' (' + Fmt.pct(v.Prestamo.div(Dec.max(UNO, v.Precio)), 0) + ' del valor)') +
      '; tenés que juntar el anticipo USD ' + Fmt.num(v.Anticipo, 0) + ' + gastos USD ' + Fmt.num(v.Gastos, 0) + ' = USD ' + Fmt.num(v.NecesitasAhorrar, 0) + '.');
    if (largo) partes.push('Cuota inicial ' + Fmt.pesosR(v.CuotaInicial) + ' (' + Fmt.pct(v.CuotaSobreIngreso, 0) + ' de tu ingreso), ' + v.PlazoAnios +
      ' años; se ajusta por inflación (UVA). Con lo que ya juntaste podrías comprar hasta USD ' + Fmt.num(v.PrecioMaximoHoy, 0) + '.');
  } else if (m.Tipo === 'Vivienda') {
    partes.push('Sin crédito: necesitás el precio más los gastos de compra = ' + f(e.Objetivo) + '.');
  }
  if (e.Faltante.signo <= 0) {
    partes.push('¡Ya tenés lo necesario!');
  } else {
    const aporte = f(e.AporteMensual) + ' por mes' + (e.AporteSugerido ? ' (sugerido' + (e.EsperaFondo > 0 ? ', después de completar el fondo de emergencia' : '') + ')' : '');
    const lejos = e.Meses === null || e.Meses > 60;
    if (e.Meses !== null && e.FechaEstimada !== null) {
      partes.push('Te faltan ' + f(e.Faltante) + '. Ahorrando ' + aporte + ' llegás en ' + textoMeses(e.Meses) + ' (' + Fmt.nombreMes(F.mes(e.FechaEstimada)) + ' ' + F.anio(e.FechaEstimada) + ').');
    } else if (e.AporteMensual.signo <= 0) {
      partes.push('Te faltan ' + f(e.Faltante) + '. Hoy no te queda ahorro mensual para aportar: primero conviene ajustar gastos o cuotas.');
    } else {
      partes.push('Te faltan ' + f(e.Faltante) + '. Con ' + aporte + ' tardarías más de 100 años.');
    }
    if (lejos && e.MesesConTodo !== null && e.AporteTodo.gt(e.AporteMensual)) partes.push('Aun destinando todo tu ahorro (~' + f(e.AporteTodo) + ' por mes) serían ' + textoMeses(e.MesesConTodo) + '.');
    if (e.AporteNecesario !== null && m.FechaObjetivo !== null) {
      partes.push('Para tenerla el ' + Fmt.fecha(m.FechaObjetivo) + ' tendrías que ahorrar ' + f(e.AporteNecesario) + ' por mes' + (e.AporteNecesario.gt(e.AporteTodo) && e.AporteTodo.signo > 0 ? ', más que todo tu ahorro actual.' : '.'));
    } else if (lejos && e.AporteEn5Anios.signo > 0) {
      partes.push('Para llegar en 5 años harían falta ' + f(e.AporteEn5Anios) + ' por mes.');
    }
    if (lejos && e.Vivienda && e.PrecioEn5Anios.signo > 0 && e.PrecioEn5Anios.lt(e.Vivienda.Precio)) {
      partes.push('Con tu ingreso y tu ahorro actuales, en 5 años podrías apuntar a una vivienda de hasta ~USD ' + Fmt.num(e.PrecioEn5Anios.div(D(1000)).redondear(0).por(D(1000)), 0) + ' (más chica o en otra zona), o sumar ingresos al pedir el crédito.');
    }
  }
  return partes.join(' ');
}

const TIPOS = [['Vivienda', 'Vivienda'], ['Auto', 'Auto'], ['Viaje', 'Viaje'], ['Fondo', 'Fondo de emergencia'], ['Otra', 'Otra']];

export function abrirMeta(original = null, tipoInicial = 'Vivienda') {
  const l = E.libro, mk = DatosMercado.desde(l), diag = diagnosticar(E.motor);
  const fuente = original;
  const inNombre = entrada(fuente ? fuente.Nombre : '', { placeholder: 'Departamento, auto…' });
  const selTipo = selector(TIPOS, fuente ? fuente.Tipo : tipoInicial);
  const selMoneda = selector([['ARS', 'Pesos'], ['USD', 'Dólares']], fuente ? fuente.Moneda : (tipoInicial === 'Viaje' || tipoInicial === 'Fondo' ? 'ARS' : 'USD'));
  const inMonto = entradaMonto(fuente && fuente.Monto.signo > 0 ? fuente.Monto : null, { placeholder: 'Precio u objetivo' });
  const inM2 = entradaMonto(fuente && fuente.M2.signo > 0 ? fuente.M2 : null, { placeholder: 'm²' });
  const inPrecioM2 = entradaMonto(fuente && fuente.PrecioM2.signo > 0 ? fuente.PrecioM2 : l.config.PrecioM2Referencia);
  const inAhorrado = entradaMonto(fuente && fuente.Ahorrado.signo > 0 ? fuente.Ahorrado : null, { placeholder: '0' });
  const inAporte = entradaMonto(fuente && fuente.AporteMensual.signo > 0 ? fuente.AporteMensual : null, { placeholder: 'Sugerido' });
  const swFecha = interruptor(fuente ? fuente.FechaObjetivo !== null : false, () => { filaFecha.classList.toggle('oculto', !swFecha.input.checked); recalcular(); });
  const inFecha = entradaFecha(fuente && fuente.FechaObjetivo !== null ? fuente.FechaObjetivo : F.sumarAnios(hoy(), 2));
  const filaFecha = campo('Para el', inFecha);
  const swCredito = interruptor(fuente ? fuente.UsaCredito : true, () => { ajustar(); recalcular(); });
  const bancos = mk.Hipotecarios;
  const selBanco = selector(bancos.map((b, i) => [i, b.Entidad + ' · ' + Fmt.pct(b.TNA, 1) + ' + UVA']), Math.max(0, bancos.findIndex((b) => b.Entidad === 'BNA')));
  const inFinanciado = entradaMonto(fuente ? fuente.PctFinanciado.por(D(100)) : D(75));
  const inPlazo = entradaMonto(fuente ? D(fuente.PlazoAnios) : D(20));
  const inTNA = entradaMonto(fuente ? fuente.TNACredito.por(D(100)) : D('6.7'));
  const inGastos = entradaMonto(fuente ? fuente.GastosCompraPct.por(D(100)) : D(7));
  const inComentario = entrada(fuente ? fuente.Comentario : '', { placeholder: 'Opcional' });
  const cajaCalc = h('div', { class: 'info-form' });
  const filasViv = [campo('Metros (m²)', inM2), campo('USD por m²', inPrecioM2), campo('Con crédito', swCredito)];
  const filasCred = [campo('Banco', selBanco), campo('Financia (%)', inFinanciado), campo('Plazo (años)', inPlazo), campo('Tasa (% + UVA)', inTNA)];
  filaFecha.classList.toggle('oculto', !swFecha.input.checked);

  const esViv = () => selTipo.value === 'Vivienda';
  function ajustar() {
    selMoneda.disabled = esViv();
    if (esViv()) selMoneda.value = 'USD';
    for (const x of filasViv) x.classList.toggle('oculto', !esViv());
    for (const x of filasCred) x.classList.toggle('oculto', !esViv() || !swCredito.input.checked);
  }
  function aplicarBanco() {
    const b = bancos[Number(selBanco.value)];
    if (!b) return;
    inTNA.value = Fmt.num(b.TNA.por(D(100)).redondear(2), 2).replace(/,00$/, '');
    inPlazo.value = String(b.PlazoAnios);
    inFinanciado.value = Fmt.num(b.Financiamiento.por(D(100)).redondear(0), 0);
  }
  const leerNum = (x, def) => { const v = x.leer(); return v === null ? def : v; };
  function leer(m) {
    m.Nombre = inNombre.value.trim();
    m.Tipo = selTipo.value;
    m.Moneda = esViv() || selMoneda.value === 'USD' ? 'USD' : 'ARS';
    m.Monto = leerNum(inMonto, CERO);
    m.M2 = esViv() ? leerNum(inM2, CERO) : CERO;
    m.PrecioM2 = esViv() ? leerNum(inPrecioM2, CERO) : CERO;
    // Si cargó los metros y no el precio, el precio sale de los metros
    if (esViv() && m.Monto.signo <= 0 && m.M2.signo > 0) m.Monto = m.M2.por(m.PrecioM2.signo > 0 ? m.PrecioM2 : l.config.PrecioM2Referencia).redondear(0);
    m.Ahorrado = leerNum(inAhorrado, CERO);
    m.AporteMensual = leerNum(inAporte, CERO);
    m.FechaObjetivo = swFecha.input.checked ? inFecha.leer() : null;
    m.UsaCredito = esViv() && swCredito.input.checked;
    m.PctFinanciado = leerNum(inFinanciado, D(75)).div(D(100));
    m.PlazoAnios = Math.max(1, Math.min(40, Math.round(Number(leerNum(inPlazo, D(20)).toString()))));
    m.TNACredito = leerNum(inTNA, D('6.7')).div(D(100));
    m.GastosCompraPct = leerNum(inGastos, D(7)).div(D(100));
    m.Comentario = inComentario.value.trim();
  }
  function recalcular() {
    try {
      const tmp = nuevo('Meta');
      leer(tmp);
      if (tmp.Monto.signo <= 0) { cajaCalc.textContent = 'Cargá el precio o el objetivo para ver el cálculo.'; return; }
      const cantidad = Math.max(1, l.metas.filter((x) => x.Activa && x !== original).length + 1);
      cajaCalc.textContent = textoEstado(estado(tmp, diag, mk, hoy(), cantidad), true);
    } catch (e) { cajaCalc.textContent = 'No se pudo calcular: ' + e.message; }
  }
  if (!fuente) {
    if (tipoInicial === 'Vivienda') { inNombre.value = 'Departamento'; inM2.value = '50'; inMonto.value = Fmt.num(D(50).por(l.config.PrecioM2Referencia).redondear(0), 0); aplicarBanco(); }
    else if (tipoInicial === 'Auto') inNombre.value = 'Auto';
    else if (tipoInicial === 'Viaje') inNombre.value = 'Viaje';
    else if (tipoInicial === 'Fondo') { inNombre.value = 'Fondo de emergencia'; inMonto.value = Fmt.num(Dec.max(CERO, diag.FondoObjetivo), 0); }
  }
  selTipo.addEventListener('change', () => { ajustar(); recalcular(); });
  selBanco.addEventListener('change', () => { aplicarBanco(); recalcular(); });
  inM2.addEventListener('input', () => { const m2 = inM2.leer(), p = inPrecioM2.leer(); if (m2 && p) inMonto.value = Fmt.num(m2.por(p).redondear(0), 0); recalcular(); });
  for (const x of [inMonto, inAhorrado, inAporte, inFinanciado, inPlazo, inTNA, inGastos, inPrecioM2]) x.addEventListener('input', recalcular);
  for (const x of [selMoneda, inFecha]) x.addEventListener('change', recalcular);
  ajustar();
  recalcular();

  const contenido = h('div', { class: 'form' },
    grupo(campo('Nombre', inNombre), campo('Tipo', selTipo), campo('Moneda', selMoneda), campo('Precio / objetivo', inMonto), ...filasViv),
    h('div', { class: 'bloque' }, grupo(...filasCred, campo('Gastos compra (%)', inGastos))),
    h('div', { class: 'bloque' }, grupo(campo('Ya juntaste', inAhorrado), campo('Aporte por mes', inAporte), campo('Fecha objetivo', swFecha), filaFecha, campo('Nota', inComentario)),
      h('p', { class: 'ayuda' }, 'Si dejás el aporte vacío, la app sugiere uno según tu ahorro mensual.')),
    cajaCalc,
    original ? h('div', { class: 'botonera' }, h('button', { class: 'boton peligro', type: 'button', onClick: async () => {
      if (!(await confirmar('¿Borrar la meta «' + original.Nombre + '»?', { si: 'Borrar', peligro: true }))) return;
      l.metas.splice(l.metas.indexOf(original), 1);
      await guardar();
      hoja.cerrar();
      toast('Meta borrada', { accion: 'Deshacer', alAccionar: () => deshacer() });
    } }, icono('borrar'), 'Borrar meta')) : null);
  const hoja = abrirHoja({
    titulo: original ? 'Editar meta' : 'Nueva meta', contenido, textoConfirmar: 'Guardar',
    alConfirmar: async () => {
      if (!inNombre.value.trim()) { toast('Poné un nombre a la meta.', { error: true }); return false; }
      for (const x of [inMonto, inAhorrado, inAporte]) if (x.value.trim() && x.leer() === null) { toast('Revisá los montos.', { error: true }); return false; }
      const tmp = nuevo('Meta');
      leer(tmp);
      if (tmp.Monto.signo <= 0) { toast('Cargá el precio o el objetivo.', { error: true }); return false; }
      let m = original;
      if (!m) { m = nuevo('Meta', { Id: l.nuevoId(), Prioridad: l.metas.length }); l.metas.push(m); }
      leer(m);
      m.Activa = true;
      await guardar();
      toast(original ? 'Meta guardada' : 'Meta agregada');
      return true;
    },
  });
  return hoja;
}
