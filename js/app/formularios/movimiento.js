// ============================================================================
//  Cargar y editar movimientos (igual que en la PC): gastos, ingresos,
//  transferencias, pagos de resumen, total real del resumen y ajustes de saldo.
// ============================================================================

import { h, icono, abrirHoja, campo, entrada, entradaMonto, entradaFecha, selector, interruptor, chips, segmentado, grupo, toast, confirmar, preguntar, colorCss, textoMonto } from '../ui.js';
import { E, hoy, guardar, deshacer } from '../estado.js';
import { D, Dec, CERO } from '../../nucleo/decimal.js';

import { Fmt, Per } from '../../nucleo/formato.js';
import { nuevo, esDeTarjeta } from '../../nucleo/modelo.js';
import { Motor, EstadoResumen } from '../../nucleo/motor.js';
import { sugerir, asegurar, OTROS, OTROS_INGRESOS, AJUSTES } from '../../nucleo/categorias.js';

const NOMBRE_TIPO = { Gasto: 'gasto', Ingreso: 'ingreso', Transferencia: 'transferencia' };

function mesCerradoOk(p) {
  if (!E.motor.mesCerrado(p)) return Promise.resolve(true);
  return confirmar(Fmt.periodo(p) + ' está cerrado en el historial. ¿Querés modificarlo igual?', { titulo: 'Mes cerrado', si: 'Modificar' });
}

function periodoDe(m) { return esDeTarjeta(m) ? E.motor.primerPeriodo(m) : Per.de(m.Fecha); }

/** Medios para elegir: tarjetas (gasto) y cuentas activas. */
function medios(tipo) {
  const l = E.libro;
  const res = [];
  if (tipo === 'Gasto') for (const t of l.tarjetas.filter((x) => x.Activa)) res.push({ valor: 't' + t.Id, texto: t.Nombre, sub: 'tarjeta', color: colorCss(t.ColorArgb), tarjetaId: t.Id, cuentaId: 0 });
  for (const c of l.cuentas.filter((x) => x.Activa)) res.push({ valor: 'c' + c.Id, texto: c.Nombre, sub: c.Moneda === 'USD' ? 'USD' : (c.Tipo === 'Efectivo' ? 'efectivo' : 'cuenta'), color: null, tarjetaId: 0, cuentaId: c.Id });
  if (tipo === 'Ingreso') for (const t of l.tarjetas.filter((x) => x.Activa)) res.push({ valor: 't' + t.Id, texto: 'Reintegro ' + t.Nombre, sub: 'tarjeta', color: colorCss(t.ColorArgb), tarjetaId: t.Id, cuentaId: 0 });
  return res;
}

function medioMasUsado(tipo) {
  const desde = hoy() - 45;
  const cuenta = new Map();
  for (const m of E.libro.movimientos) {
    if (m.Tipo !== tipo || m.Fecha < desde || m.Auto) continue;
    const k = m.TarjetaId !== 0 ? 't' + m.TarjetaId : 'c' + m.CuentaId;
    cuenta.set(k, (cuenta.get(k) || 0) + 1);
  }
  let mejor = null, n = 0;
  for (const [k, v] of cuenta) if (v > n) { mejor = k; n = v; }
  return mejor;
}

/** Descripciones usadas antes (para tocar y completar). */
function sugerenciasDescripcion(tipo, texto) {
  const t = Fmt.normalizar(texto);
  const vistas = new Set();
  const res = [];
  const lista = [...E.libro.movimientos].filter((m) => m.Tipo === tipo && m.Descripcion).sort((a, b) => b.Fecha - a.Fecha);
  for (const m of lista) {
    const k = Fmt.normalizar(m.Descripcion);
    if (vistas.has(k)) continue;
    vistas.add(k);
    if (!t || (k.startsWith(t) && k !== t)) res.push(m.Descripcion);
    if (res.length >= 6) break;
  }
  return res;
}

// ============================================================================ Gasto / ingreso / transferencia
/**
 * Abre el formulario. o: { tipo, existente, tarjetaId, cuentaId, fecha, fijo (Ocurrencia) }
 */
export function abrirMovimiento(o = {}) {
  const l = E.libro;
  const existente = o.existente || null;
  if (existente && (existente.Tipo === 'PagoTarjeta' || existente.Tipo === 'Ajuste')) return editarEspecial(existente);
  let tipo = existente ? existente.Tipo : (o.tipo || 'Gasto');
  const permitirCambioTipo = !existente && !o.fijo;
  let categoriaTocada = !!existente || !!o.fijo;
  let cuerpoForm = null;
  let leer = null;

  const contenido = h('div', { class: 'form' });
  const cambioTipo = permitirCambioTipo ? h('div', { style: { margin: '2px 0 4px' } }, segmentado(
    [['Gasto', 'Gasto'], ['Ingreso', 'Ingreso'], ['Transferencia', 'Transferir'], ['Pago', 'Pagar tarjeta']], tipo, (v) => {
      if (v === 'Pago') { hoja.cerrar(); setTimeout(() => abrirPago(null), 320); return; }
      tipo = v; categoriaTocada = false; armar();
    })) : null;
  if (cambioTipo) contenido.appendChild(cambioTipo);
  const zona = h('div');
  contenido.appendChild(zona);

  let foco = null;
  let abierta = false;
  function armar() {
    zona.innerHTML = '';
    const r = tipo === 'Transferencia' ? formTransferencia(existente, o) : formGastoIngreso(tipo, existente, o, () => categoriaTocada, (v) => { categoriaTocada = v; });
    cuerpoForm = r.el; leer = r.leer;
    zona.appendChild(cuerpoForm);
    foco = !existente ? r.foco : null;
    if (abierta && foco) enfocar(foco);
  }
  armar();

  const titulo = existente ? 'Editar ' + NOMBRE_TIPO[tipo] : (o.fijo ? 'Registrar ' + o.fijo.Rec.Descripcion : 'Nuevo movimiento');
  const hoja = abrirHoja({
    titulo, contenido, textoConfirmar: 'Guardar',
    alConfirmar: async () => {
      const r = leer();
      if (r.error) { toast(r.error, { error: true }); return false; }
      if (existente) {
        const ok = await mesCerradoOk(periodoDe(existente));
        if (!ok) return false;
      }
      aplicar(r, existente, tipo, o.fijo);
      await guardar();
      toast(r.resumen, { accion: existente ? null : 'Deshacer', alAccionar: async () => { await deshacer(); toast('Listo, se deshizo.'); } });
      return true;
    },
  });

  // Pie: borrar o "guardar y cargar otro"
  const pie = h('div', { class: 'botonera', style: { padding: '0 16px 10px' } });
  if (existente && l.movimientos.includes(existente)) {
    pie.appendChild(h('button', { class: 'boton peligro', type: 'button', onClick: async () => { if (await borrarMovimiento(existente)) hoja.cerrar(); } }, icono('borrar'), 'Borrar'));
  } else if (!existente && !o.fijo) {
    pie.appendChild(h('button', { class: 'boton secundario', type: 'button', onClick: async () => {
      const r = leer();
      if (r.error) { toast(r.error, { error: true }); return; }
      aplicar(r, null, tipo, null);
      await guardar();
      toast(r.resumen);
      categoriaTocada = false;
      armar();
    } }, 'Guardar y cargar otro'));
  }
  if (pie.children.length) hoja.cuerpo.appendChild(pie);
  abierta = true;
  // El monto queda listo para escribir (en el mismo toque, así el iPhone abre el teclado numérico)
  if (foco) enfocar(foco);
  return hoja;
}

/** Pone el cursor en un campo sin mover la pantalla. */
function enfocar(el) {
  try { el.focus({ preventScroll: true }); } catch { try { el.focus(); } catch { /* nada */ } }
}

function formGastoIngreso(tipo, existente, o, tocada, fijarTocada) {
  const l = E.libro, m = E.motor;
  const ops = medios(tipo);
  let medioSel = null;
  if (existente) medioSel = existente.TarjetaId !== 0 ? 't' + existente.TarjetaId : 'c' + existente.CuentaId;
  else if (o.fijo) medioSel = 'c' + o.fijo.Rec.CuentaId;
  else if (o.tarjetaId) medioSel = 't' + o.tarjetaId;
  else if (o.cuentaId) medioSel = 'c' + o.cuentaId;
  else medioSel = medioMasUsado(tipo);
  if (!ops.some((x) => x.valor === medioSel)) medioSel = ops.length ? ops[0].valor : null;

  let moneda = existente ? existente.Moneda : (o.fijo ? o.fijo.Rec.Moneda : 'ARS');
  const inMonto = entradaMonto(existente ? existente.Monto : (o.fijo ? o.fijo.Rec.Monto : null), { 'aria-label': 'Monto' });
  const lblMoneda = h('button', { class: 'moneda', type: 'button', style: { border: 0, background: 'none', padding: 0 } }, moneda === 'USD' ? 'USD' : '$');
  lblMoneda.addEventListener('click', () => {
    const med = ops.find((x) => x.valor === medioSel);
    if (med && med.cuentaId) return;   // la cuenta define la moneda
    moneda = moneda === 'USD' ? 'ARS' : 'USD';
    lblMoneda.textContent = moneda === 'USD' ? 'USD' : '$';
    info();
  });
  const zonaMonto = h('div', { class: 'monto-grande' }, lblMoneda, inMonto);

  const inDesc = entrada(existente ? existente.Descripcion : (o.fijo ? o.fijo.Rec.Descripcion : ''), { placeholder: tipo === 'Gasto' ? 'Supermercado, Uber…' : 'Sueldo, reintegro…', enterkeyhint: 'next' });
  const zonaSug = h('div', { class: 'sugerencias' });
  const inFecha = entradaFecha(existente ? Math.floor(existente.Fecha) : (o.fijo ? Math.min(o.fijo.Fecha, hoy()) : (o.fecha ?? hoy())));

  // Categoría
  const cats = l.categorias.filter((c) => c.EsIngreso === (tipo === 'Ingreso')).map((c) => c.Nombre).sort((a, b) => a.localeCompare(b, 'es'));
  const catInicial = existente ? existente.Categoria : (o.fijo ? o.fijo.Rec.Categoria : (tipo === 'Ingreso' ? OTROS_INGRESOS : OTROS));
  if (catInicial && !cats.some((c) => c.toLowerCase() === catInicial.toLowerCase())) cats.unshift(catInicial);
  const selCat = selector([...cats.map((c) => [c, c]), ['__nueva', 'Nueva categoría…']], catInicial);
  let catNueva = null;
  selCat.addEventListener('change', async () => {
    fijarTocada(true);
    if (selCat.value === '__nueva') {
      const nombre = prompt('Nombre de la categoría nueva');
      if (nombre && nombre.trim()) {
        catNueva = nombre.trim();
        selCat.insertBefore(h('option', { value: catNueva }, catNueva), selCat.firstChild);
        selCat.value = catNueva;
      } else selCat.value = catInicial || (tipo === 'Ingreso' ? OTROS_INGRESOS : OTROS);
    }
  });
  const ponerCategoria = (c) => {
    if (![...selCat.options].some((x) => x.value === c)) selCat.insertBefore(h('option', { value: c }, c), selCat.firstChild);
    selCat.value = c;
  };

  // Cuotas y resumen (sólo tarjeta)
  const selCuotas = selector([...Array.from({ length: 24 }, (_, i) => [i + 1, i === 0 ? '1 pago' : (i + 1) + ' cuotas']), [30, '30 cuotas'], [36, '36 cuotas'], [48, '48 cuotas']],
    existente ? existente.Cuotas : 1);
  const swValorCuota = interruptor(false, () => info());
  const filaValorCuota = campo('Monto por cuota', swValorCuota);
  const selResumen = h('select');
  const filaCuotas = campo('Cuotas', selCuotas);
  const filaResumen = campo('Resumen', selResumen);
  const inNota = entrada(existente ? existente.Nota : '', { placeholder: 'Opcional' });
  const cajaInfo = h('div', { class: 'info-form' });

  const medioActual = () => ops.find((x) => x.valor === medioSel) || null;
  const tarjetaSel = () => { const x = medioActual(); return x && x.tarjetaId ? l.tarjeta(x.tarjetaId) : null; };
  const cuentaSel = () => { const x = medioActual(); return x && x.cuentaId ? l.cuenta(x.cuentaId) : null; };

  function refrescarResumenes() {
    const t = tarjetaSel();
    selResumen.innerHTML = '';
    if (!t) return;
    const fecha = inFecha.leer() ?? hoy();
    const auto = m.periodoDeCompra(t, fecha);
    const forzado = existente && existente.PeriodoForzado > 0 ? existente.PeriodoForzado : 0;
    selResumen.appendChild(h('option', { value: '0' }, 'Automático: ' + Fmt.periodo(auto)));
    for (let k = -2; k <= 3; k++) {
      if (k === 0) continue;
      const p = Per.sumar(auto, k);
      selResumen.appendChild(h('option', { value: String(p) }, Fmt.periodo(p) + ' (vence ' + Fmt.fechaCorta(m.vencimiento(t, p)) + ')'));
    }
    selResumen.value = forzado && [...selResumen.options].some((x) => x.value === String(forzado)) ? String(forzado) : '0';
  }

  function actualizarControles() {
    const t = tarjetaSel(), c = cuentaSel();
    if (c) { moneda = c.Moneda; lblMoneda.textContent = moneda === 'USD' ? 'USD' : '$'; lblMoneda.style.opacity = '1'; }
    lblMoneda.title = c ? 'La moneda la define la cuenta' : 'Tocá para cambiar entre pesos y dólares';
    const esT = !!t && tipo === 'Gasto';
    filaCuotas.classList.toggle('oculto', !esT);
    filaResumen.classList.toggle('oculto', !esT);
    filaValorCuota.classList.toggle('oculto', !esT || Number(selCuotas.value) <= 1);
  }

  const cuotas = () => (tarjetaSel() && tipo === 'Gasto' ? Number(selCuotas.value) : 1);
  const montoTotal = () => {
    const v = inMonto.leer();
    if (v === null) return null;
    return swValorCuota.input.checked && cuotas() > 1 ? v.por(D(cuotas())) : v;
  };

  function info() {
    let txt = '';
    try {
      const fecha = inFecha.leer() ?? hoy();
      const t = tarjetaSel(), c = cuentaSel();
      const total = montoTotal() || CERO;
      if (t && tipo === 'Gasto') {
        const pe = Number(selResumen.value || 0);
        const p1 = pe !== 0 ? pe : m.periodoDeCompra(t, fecha);
        const venc = m.vencimiento(t, p1), cierre = m.cierre(t, p1);
        const n = cuotas();
        if (n <= 1) txt = 'Entra en el resumen de ' + t.Nombre + ' que cierra el ' + Fmt.fechaDia(cierre) + ' y vence el ' + Fmt.fechaDia(venc) + ': se paga en ' + Fmt.mesDe(p1) + '.';
        else txt = n + ' cuotas de ' + Fmt.monto(Motor.cuotaMonto({ Monto: total, Cuotas: n }, 1), moneda) + ' (total ' + Fmt.monto(total, moneda) + '): la primera vence el ' + Fmt.fechaDia(venc) + ' y la última en ' + Fmt.periodo(Per.sumar(p1, n - 1)) + '.';
        const dias = venc - fecha;
        if (dias > 0) txt += ' Lo pagás en ' + dias + ' días.';
        // ¿Otra tarjeta da más días?
        let mejor = null;
        for (const x of m.tarjetasActivas()) { const dd = m.diasFinanciacion(x, fecha); if (!mejor || dd > mejor.dd) mejor = { x, dd }; }
        if (mejor && mejor.x.Id !== t.Id && mejor.dd - dias >= 10) txt += ' Con ' + mejor.x.Nombre + ' lo pagarías en ' + mejor.dd + ' días.';
      } else if (t) {
        txt = 'Se descuenta del resumen de ' + t.Nombre + ' de ' + Fmt.mesDe(m.periodoDeCompra(t, fecha)) + '.';
      } else if (c) {
        let saldo = m.saldo(c);
        if (existente && l.movimientos.includes(existente)) saldo = saldo.menos(Motor.impacto(existente, c.Id));
        const nuevoSaldo = tipo === 'Ingreso' ? saldo.mas(total) : saldo.menos(total);
        txt = (tipo === 'Ingreso' ? 'Se suma a ' : 'Se descuenta de ') + c.Nombre + '. Saldo después: ' + Fmt.monto(nuevoSaldo, c.Moneda) + '.';
        if (fecha > hoy()) txt += ' (Fecha futura: impacta ese día.)';
        if (nuevoSaldo.signo < 0 && tipo === 'Gasto') txt += ' ¡Queda en negativo!';
      }
      if (o.fijo) txt += ' Queda registrado como el fijo de ' + Fmt.mesDe(o.fijo.Periodo) + '.';
    } catch (e) { txt = ''; }
    cajaInfo.textContent = txt;
    cajaInfo.classList.toggle('oculto', !txt);
  }

  function sugerirCategoria() {
    if (tocada() || inDesc.value.trim().length < 3) return;
    ponerCategoria(sugerir(inDesc.value, l, tipo === 'Ingreso'));
  }

  function refrescarSug() {
    zonaSug.innerHTML = '';
    for (const s of sugerenciasDescripcion(tipo, inDesc.value)) {
      zonaSug.appendChild(h('button', { type: 'button', onClick: () => { inDesc.value = s; zonaSug.innerHTML = ''; sugerirCategoria(); info(); } }, s));
    }
  }

  inDesc.addEventListener('input', () => { sugerirCategoria(); refrescarSug(); });
  inDesc.addEventListener('blur', () => setTimeout(() => { zonaSug.innerHTML = ''; }, 200));
  inDesc.addEventListener('focus', refrescarSug);
  inMonto.addEventListener('input', info);
  inFecha.addEventListener('change', () => { refrescarResumenes(); info(); });
  selCuotas.addEventListener('change', () => { actualizarControles(); info(); });
  selResumen.addEventListener('change', info);

  const chipsMedio = chips(ops.map((x) => ({ valor: x.valor, texto: x.texto, color: x.color })), medioSel, (v) => {
    medioSel = v; refrescarResumenes(); actualizarControles(); info();
  });

  const el = h('div', null,
    zonaMonto,
    h('div', { class: 'bloque' }, h('div', { class: 'etiqueta-bloque' }, tipo === 'Gasto' ? 'Pagado con' : 'Entra en'), chipsMedio),
    h('div', { class: 'bloque' }, grupo(campo('Descripción', inDesc), zonaSug, campo('Categoría', selCat), campo('Fecha', inFecha), filaCuotas, filaValorCuota, filaResumen, campo('Nota', inNota))),
    cajaInfo);

  refrescarResumenes();
  actualizarControles();
  info();

  return {
    el, foco: inMonto,
    leer: () => {
      const med = medioActual();
      if (!med) return { error: 'Elegí con qué se pagó (tarjeta o cuenta).' };
      const total = montoTotal();
      if (total === null || total.signo <= 0) return { error: 'Escribí un monto mayor a cero.' };
      if (!inDesc.value.trim()) return { error: 'Escribí una descripción (por ejemplo: Supermercado, Uber, Sueldo).' };
      const fecha = inFecha.leer();
      if (fecha === null) return { error: 'Elegí la fecha.' };
      return { tipo, med, total, montoBase: inMonto.leer(), moneda, desc: inDesc.value.trim(), categoria: selCat.value === '__nueva' ? (catNueva || OTROS) : selCat.value,
        fecha, cuotas: cuotas(), periodo: Number(selResumen.value || 0), nota: inNota.value.trim() };
    },
  };
}

function formTransferencia(existente, o) {
  const l = E.libro, m = E.motor;
  const cuentas = l.cuentas.filter((c) => c.Activa);
  const opc = cuentas.map((c) => [c.Id, c.Nombre + (c.Moneda === 'USD' ? ' (USD)' : '')]);
  let origenId = existente ? existente.CuentaId : (o.cuentaId || (cuentas[0] ? cuentas[0].Id : 0));
  let destinoId = existente ? existente.CuentaDestinoId : 0;
  if (!destinoId) {
    const remu = cuentas.find((c) => c.Remunerada && c.Id !== origenId);
    destinoId = remu ? remu.Id : (cuentas.find((c) => c.Id !== origenId) || { Id: 0 }).Id;
  }
  const selOrigen = selector(opc, origenId);
  const selDestino = selector(opc, destinoId);
  const inMonto = entradaMonto(existente ? existente.Monto : null);
  const inMontoDest = entradaMonto(existente && !existente.MontoDestino.esCero ? existente.MontoDestino : null, { placeholder: 'Sólo si cambia la moneda' });
  const filaDest = campo('Se acreditan', inMontoDest);
  const inDesc = entrada(existente ? existente.Descripcion : 'Transferencia');
  const inFecha = entradaFecha(existente ? Math.floor(existente.Fecha) : (o.fecha ?? hoy()));
  const inNota = entrada(existente ? existente.Nota : '', { placeholder: 'Opcional' });
  const cajaInfo = h('div', { class: 'info-form' });
  const lblMoneda = h('span', { class: 'moneda' }, '$');
  const zonaMonto = h('div', { class: 'monto-grande' }, lblMoneda, inMonto);

  function actualizar() {
    const or = l.cuenta(Number(selOrigen.value)), de = l.cuenta(Number(selDestino.value));
    lblMoneda.textContent = or && or.Moneda === 'USD' ? 'USD' : '$';
    const distinta = or && de && or.Moneda !== de.Moneda;
    filaDest.classList.toggle('oculto', !distinta);
    let txt = '';
    if (or && de) {
      txt = 'Sale de ' + or.Nombre + ' (saldo hoy ' + Fmt.monto(m.saldo(or), or.Moneda) + ') y entra en ' + de.Nombre + '.';
      const a = inMonto.leer(), b = inMontoDest.leer();
      if (distinta && a && b && a.signo > 0 && b.signo > 0) {
        const cot = or.Moneda === 'ARS' ? a.div(b) : b.div(a);
        txt += ' Cotización: ' + Fmt.pesos(cot) + ' por dólar.';
      }
      if (de.Remunerada) txt += ' ' + de.Nombre + ' rinde ' + Fmt.pct(de.TNA, 0) + ' TNA.';
    }
    cajaInfo.textContent = txt;
    cajaInfo.classList.toggle('oculto', !txt);
  }
  for (const x of [selOrigen, selDestino]) x.addEventListener('change', actualizar);
  for (const x of [inMonto, inMontoDest]) x.addEventListener('input', actualizar);
  actualizar();

  const el = h('div', null, zonaMonto,
    h('div', { class: 'bloque' }, grupo(campo('Desde', selOrigen), campo('Hacia', selDestino), filaDest, campo('Descripción', inDesc), campo('Fecha', inFecha), campo('Nota', inNota))),
    cajaInfo);
  return {
    el, foco: inMonto,
    leer: () => {
      const or = l.cuenta(Number(selOrigen.value)), de = l.cuenta(Number(selDestino.value));
      if (!or) return { error: 'Elegí la cuenta de origen.' };
      if (!de || de.Id === or.Id) return { error: 'Elegí una cuenta de destino distinta a la de origen.' };
      const a = inMonto.leer();
      if (a === null || a.signo <= 0) return { error: 'Escribí un monto mayor a cero.' };
      let b = CERO;
      if (or.Moneda !== de.Moneda) {
        b = inMontoDest.leer();
        if (b === null || b.signo <= 0) return { error: 'Las cuentas tienen distinta moneda: escribí cuánto se acreditó en destino.' };
      }
      const fecha = inFecha.leer();
      if (fecha === null) return { error: 'Elegí la fecha.' };
      return { tipo: 'Transferencia', origen: or, destino: de, total: a, montoDestino: b, desc: inDesc.value.trim() || 'Transferencia', fecha, nota: inNota.value.trim() };
    },
  };
}

function aplicar(r, existente, tipo, fijo) {
  const l = E.libro, m = E.motor;
  const mv = existente || nuevo('Movimiento', { Id: l.nuevoId() });
  mv.Fecha = r.fecha;
  mv.Nota = r.nota || '';
  mv.Tipo = tipo;
  if (tipo === 'Transferencia') {
    mv.CuentaId = r.origen.Id;
    mv.CuentaDestinoId = r.destino.Id;
    mv.Monto = r.total;
    mv.MontoDestino = r.montoDestino;
    mv.Moneda = r.origen.Moneda;
    mv.Descripcion = r.desc;
    mv.Categoria = 'Transferencias';
    mv.TarjetaId = 0;
    mv.Cuotas = 1;
    r.resumen = 'Transferencia de ' + Fmt.monto(mv.Monto, mv.Moneda) + ' registrada';
  } else {
    mv.Descripcion = r.desc;
    mv.Moneda = r.moneda;
    mv.Categoria = asegurar(l, r.categoria, tipo === 'Ingreso');
    if (r.med.tarjetaId) {
      const t = l.tarjeta(r.med.tarjetaId);
      mv.TarjetaId = t.Id;
      mv.CuentaId = 0;
      mv.Cuotas = r.cuotas;
      mv.Monto = r.total;
      if (!(mv.RecurrenteId !== 0 && mv.PeriodoRecurrente !== 0 && r.periodo === 0)) mv.PeriodoForzado = tipo === 'Gasto' ? r.periodo : 0;
      m.invalidar();
      const p1 = m.primerPeriodo(mv);
      r.resumen = (tipo === 'Gasto' ? 'Gasto' : 'Reintegro') + ' cargado en ' + t.Nombre + ': ' + Fmt.monto(mv.Monto, mv.Moneda) + (mv.Cuotas > 1 ? ' en ' + mv.Cuotas + ' cuotas' : '') + ' · se paga en ' + Fmt.mesDe(p1);
    } else {
      mv.CuentaId = r.med.cuentaId;
      mv.TarjetaId = 0;
      mv.Cuotas = 1;
      mv.PeriodoForzado = 0;
      mv.Monto = r.montoBase;
      r.resumen = (tipo === 'Gasto' ? 'Gasto' : 'Ingreso') + ' registrado: ' + mv.Descripcion + ' ' + Fmt.monto(mv.Monto, mv.Moneda);
    }
    if (fijo) { mv.RecurrenteId = fijo.Rec.Id; mv.PeriodoRecurrente = fijo.Periodo; }
  }
  if (!existente) {
    l.movimientos.push(mv);
    if (!fijo) { m.invalidar(); m.vincularConFijo(mv); }
  }
  m.invalidar();
}

/** Pagos de resumen y ajustes no se editan: se borran y se vuelven a cargar (igual que en la PC). */
async function editarEspecial(mv) {
  const que = mv.Tipo === 'PagoTarjeta' ? 'un pago de resumen' : 'un ajuste de saldo';
  const r = await preguntar({ titulo: mv.Descripcion, texto: 'Es ' + que + ' (' + Fmt.monto(mv.Monto, mv.Moneda) + ' del ' + Fmt.fecha(mv.Fecha) + '). Para corregirlo, borralo y registralo de nuevo.',
    opciones: [{ texto: 'Borrar', valor: 'borrar', estilo: 'peligro' }] });
  if (r === 'borrar') {
    if (!(await mesCerradoOk(periodoDe(mv)))) return;
    E.libro.movimientos.splice(E.libro.movimientos.indexOf(mv), 1);
    await guardar();
    toast('Movimiento borrado', { accion: 'Deshacer', alAccionar: async () => { await deshacer(); } });
  }
}

export async function borrarMovimiento(mv) {
  if (!(await mesCerradoOk(periodoDe(mv)))) return false;
  let txt = '¿Borrar «' + mv.Descripcion + '» por ' + Fmt.monto(mv.Monto, mv.Moneda) + '?';
  if (mv.Cuotas > 1 && esDeTarjeta(mv)) txt += ' Se borra la compra completa (' + mv.Cuotas + ' cuotas).';
  if (mv.RecurrenteId !== 0) txt += ' Es un fijo: si lo borrás, para ese mes vuelve a figurar como pendiente o automático.';
  if (!(await confirmar(txt, { si: 'Borrar', peligro: true }))) return false;
  const i = E.libro.movimientos.indexOf(mv);
  if (i >= 0) E.libro.movimientos.splice(i, 1);
  await guardar();
  toast('Movimiento borrado', { accion: 'Deshacer', alAccionar: async () => { await deshacer(); } });
  return true;
}

/** Registrar un fijo del mes (sueldo, alquiler…): formulario precargado. */
export function registrarFijo(oc) {
  if (!oc || !oc.Pendiente) return;
  return abrirMovimiento({ tipo: oc.Rec.Tipo, fijo: oc });
}

/** Ítem de un resumen: si es un fijo automático, pregunta qué cambiar (igual que la PC). */
export async function editarItem(it, r) {
  if (!it.Virtual) return abrirMovimiento({ existente: it.Mov });
  const op = await preguntar({ titulo: 'Fijo automático', texto: '«' + it.Descripcion + '» se agrega solo a cada resumen. ¿Qué querés cambiar?',
    opciones: [{ texto: 'El monto sólo en este resumen', valor: 0 }, { texto: 'El fijo (de acá en adelante)', valor: 1 }, { texto: 'No cobrarlo en este resumen', valor: 2, estilo: 'peligro' }] });
  if (op === null) return;
  const l = E.libro;
  const materializar = (monto) => nuevo('Movimiento', { Id: l.nuevoId(), Fecha: it.Fecha, Tipo: 'Gasto', Descripcion: it.Rec.Descripcion, Categoria: it.Rec.Categoria,
    Monto: monto, Moneda: it.Rec.Moneda, TarjetaId: r.Tarjeta.Id, Cuotas: 1, RecurrenteId: it.Rec.Id, PeriodoRecurrente: r.Periodo, PeriodoForzado: r.Periodo });
  if (op === 0) {
    const mv = materializar(it.Rec.Monto);
    l.movimientos.push(mv);
    E.motor.invalidar();
    abrirMovimiento({ existente: mv });
  } else if (op === 1) {
    const { abrirFijo } = await import('./otros.js');
    abrirFijo(it.Rec);
  } else {
    const mv = materializar(CERO);
    mv.Nota = 'Omitido en este resumen';
    l.movimientos.push(mv);
    await guardar();
    toast('No se cobra en este resumen', { accion: 'Deshacer', alAccionar: async () => { await deshacer(); } });
  }
}

// ============================================================================ Pago de resumen
function pendientes(t) {
  const m = E.motor, res = [];
  for (let q = E.libro.config.PeriodoInicial; q <= m.periodoAbierto(t); q = Per.sumar(q, 1)) {
    const r = m.resumenDe(t, q);
    if (r.pendientePesos(m.Dolar).signo > 0) res.push(r);
  }
  return res;
}

export function abrirPago(resumenInicial) {
  const l = E.libro, m = E.motor;
  const tarjetas = l.tarjetas.filter((x) => x.Activa);
  if (!tarjetas.length) { toast('Primero cargá una tarjeta (Más → Tarjetas).'); return; }
  let r0 = resumenInicial;
  if (!r0) {
    for (const t of tarjetas) for (const rr of pendientes(t)) if (!r0 || rr.Vencimiento < r0.Vencimiento) r0 = rr;
  }
  let tarjetaId = r0 ? r0.Tarjeta.Id : tarjetas[0].Id;
  const selTarjeta = selector(tarjetas.map((t) => [t.Id, t.Nombre]), tarjetaId);
  const selResumen = h('select');
  const inARS = entradaMonto(null);
  const cuentasARS = l.cuentas.filter((c) => c.Activa && c.Moneda === 'ARS');
  const selCuentaARS = selector(cuentasARS.map((c) => [c.Id, c.Nombre + ' (' + Fmt.pesosR(m.saldo(c)) + ')']), cuentasARS[0] ? cuentasARS[0].Id : '');
  const inUSD = entradaMonto(null);
  let modoUSD = 'pesos';
  const segModo = segmentado([['pesos', 'Con pesos'], ['dolares', 'Con dólares']], modoUSD, (v) => { modoUSD = v; llenarCuentaUSD(); actualizar(); });
  const inCotiz = entradaMonto(l.config.DolarTarjeta);
  const filaCotiz = campo('Dólar tarjeta', inCotiz);
  const selCuentaUSD = h('select');
  const inFecha = entradaFecha(hoy());
  const cajaInfo = h('div', { class: 'info-form alerta' });
  const zonaUSD = h('div', { class: 'bloque' });
  let resumenes = [];

  const tarjeta = () => l.tarjeta(Number(selTarjeta.value));
  const resumen = () => resumenes[Number(selResumen.value)] || null;

  function llenarResumenes(seleccion) {
    const t = tarjeta();
    resumenes = pendientes(t);
    if (!resumenes.length) resumenes = [m.resumenDe(t, m.periodoAbierto(t))];
    selResumen.innerHTML = '';
    resumenes.forEach((rr, i) => {
      const txt = Fmt.periodo(rr.Periodo) + ' · vence ' + Fmt.fechaCorta(rr.Vencimiento) + (rr.pendientePesos(m.Dolar).signo > 0 ? '' : ' · sin saldo');
      selResumen.appendChild(h('option', { value: String(i) }, txt));
    });
    let sel = resumenes.findIndex((rr) => seleccion && rr.Periodo === seleccion);
    if (sel < 0) sel = resumenes.findIndex((rr) => { const e = rr.estado(hoy()); return e === EstadoResumen.Cerrado || e === EstadoResumen.Vencido; });
    selResumen.value = String(Math.max(0, sel));
    if (cuentasARS.some((c) => c.Id === t.CuentaPagoId)) selCuentaARS.value = String(t.CuentaPagoId);
    alCambiarResumen();
  }

  function llenarCuentaUSD() {
    const mon = modoUSD === 'dolares' ? 'USD' : 'ARS';
    const cs = l.cuentas.filter((c) => c.Activa && c.Moneda === mon);
    selCuentaUSD.innerHTML = '';
    for (const c of cs) selCuentaUSD.appendChild(h('option', { value: String(c.Id) }, c.Nombre + ' (' + Fmt.monto(m.saldo(c), c.Moneda) + ')'));
    const t = tarjeta();
    if (cs.some((c) => c.Id === t.CuentaPagoId)) selCuentaUSD.value = String(t.CuentaPagoId);
    filaCotiz.classList.toggle('oculto', modoUSD !== 'pesos');
  }

  function alCambiarResumen() {
    const rr = resumen();
    if (!rr) return;
    inARS.value = rr.PendienteARS.signo > 0 ? Fmt.num(rr.PendienteARS, 2).replace(/,00$/, '') : '';
    inUSD.value = rr.PendienteUSD.signo > 0 ? Fmt.num(rr.PendienteUSD, 2).replace(/,00$/, '') : '';
    zonaUSD.classList.toggle('oculto', !(rr.PendienteUSD.signo > 0 || rr.AbonarUSD.signo > 0));
    actualizar();
  }

  function saldosInsuficientes() {
    const uso = new Map();
    const sumar = (c, v) => { if (!c || !v || v.signo <= 0) return; uso.set(c, (uso.get(c) || CERO).mas(v)); };
    const a = inARS.leer();
    if (a && a.signo > 0) sumar(l.cuenta(Number(selCuentaARS.value)), a);
    const u = inUSD.leer();
    if (u && u.signo > 0 && !zonaUSD.classList.contains('oculto')) {
      const c = l.cuenta(Number(selCuentaUSD.value));
      if (c) sumar(c, c.Moneda === 'ARS' ? u.por(inCotiz.leer() || CERO) : u);
    }
    const partes = [];
    const f = inFecha.leer() ?? hoy();
    for (const [c, v] of uso) {
      const queda = m.saldo(c, f).menos(v);
      if (queda.signo < 0) partes.push(c.Nombre + ' quedaría en ' + Fmt.monto(queda, c.Moneda));
    }
    return partes.join(' y ');
  }

  function actualizar() {
    const rr = resumen();
    if (!rr) return;
    const a = inARS.leer() || CERO, u = (zonaUSD.classList.contains('oculto') ? CERO : inUSD.leer()) || CERO;
    const faltaARS = rr.PendienteARS.menos(a), faltaUSD = rr.PendienteUSD.menos(u);
    let txt;
    if (faltaARS.gt(D('0.5')) || faltaUSD.gt(D('0.005'))) {
      txt = 'Quedarían sin pagar ' + Fmt.pesos(Dec.max(CERO, faltaARS)) + (faltaUSD.gt(D('0.005')) ? ' + ' + Fmt.dolares(faltaUSD) : '') + '. Sobre el saldo que no pagues el banco cobra intereses: si podés, pagá el total.';
    } else {
      txt = 'Pagás el total del resumen. Si el banco te mostró otro total (impuestos, cargos), cargalo en la tarjeta → «Total real y fechas».';
    }
    if (modoUSD === 'pesos' && u.signo > 0) {
      const cot = inCotiz.leer();
      if (cot && cot.signo > 0) txt += ' Los ' + Fmt.dolares(u) + ' son ' + Fmt.pesos(u.por(cot).redondear(2)) + '.';
    }
    const faltan = saldosInsuficientes();
    if (faltan) txt += ' Ojo: ' + faltan + '.';
    cajaInfo.textContent = txt;
  }

  selTarjeta.addEventListener('change', () => { llenarResumenes(0); llenarCuentaUSD(); });
  selResumen.addEventListener('change', alCambiarResumen);
  for (const x of [inARS, inUSD, inCotiz]) x.addEventListener('input', actualizar);
  for (const x of [selCuentaARS, selCuentaUSD, inFecha]) x.addEventListener('change', actualizar);

  zonaUSD.append(h('div', { class: 'etiqueta-bloque' }, 'Parte en dólares'),
    grupo(campo('Monto USD', inUSD), h('div', { style: { padding: '8px 14px' } }, segModo), filaCotiz, campo('Desde', selCuentaUSD)));
  const contenido = h('div', { class: 'form' },
    grupo(campo('Tarjeta', selTarjeta), campo('Resumen', selResumen)),
    h('div', { class: 'bloque' }, h('div', { class: 'etiqueta-bloque' }, 'Parte en pesos'), grupo(campo('Monto', inARS), campo('Desde', selCuentaARS))),
    zonaUSD,
    h('div', { class: 'bloque' }, grupo(campo('Fecha de pago', inFecha))),
    cajaInfo);

  llenarCuentaUSD();
  llenarResumenes(r0 ? r0.Periodo : 0);

  return abrirHoja({
    titulo: 'Registrar pago', contenido, textoConfirmar: 'Registrar',
    alConfirmar: async () => {
      const rr = resumen();
      if (!rr) { toast('Elegí el resumen que vas a pagar.', { error: true }); return false; }
      const a = inARS.leer() || CERO;
      const u = zonaUSD.classList.contains('oculto') ? CERO : (inUSD.leer() || CERO);
      if (a.signo <= 0 && u.signo <= 0) { toast('El pago tiene que ser mayor a cero.', { error: true }); return false; }
      if (a.signo > 0 && !l.cuenta(Number(selCuentaARS.value))) { toast('Elegí la cuenta de donde salen los pesos.', { error: true }); return false; }
      if (u.signo > 0) {
        if (!l.cuenta(Number(selCuentaUSD.value))) { toast(modoUSD === 'dolares' ? 'No tenés cuentas en dólares cargadas. Elegí pagar con pesos.' : 'Elegí la cuenta para pagar los dólares.', { error: true }); return false; }
        if (modoUSD === 'pesos' && !(inCotiz.leer() && inCotiz.leer().signo > 0)) { toast('Escribí la cotización del dólar tarjeta.', { error: true }); return false; }
      }
      const faltan = saldosInsuficientes();
      if (faltan && !(await confirmar('Ojo: ' + faltan + '. ¿Registrar el pago igual? (Si la plata está en otra cuenta, conviene registrar antes una transferencia.)', { titulo: 'Saldo insuficiente', si: 'Registrar igual' }))) return false;
      const t = rr.Tarjeta;
      const fecha = inFecha.leer() ?? hoy();
      const desc = 'Pago resumen ' + t.Nombre + ' ' + Fmt.periodoCorto(rr.Periodo);
      const partes = [];
      if (a.signo > 0) {
        l.movimientos.push(nuevo('Movimiento', { Id: l.nuevoId(), Fecha: fecha, Tipo: 'PagoTarjeta', Descripcion: desc, Categoria: 'Pago de tarjeta', Monto: a, Moneda: 'ARS',
          CuentaId: Number(selCuentaARS.value), TarjetaId: t.Id, PeriodoResumen: rr.Periodo }));
        partes.push(Fmt.pesos(a));
      }
      if (u.signo > 0) {
        const c = l.cuenta(Number(selCuentaUSD.value));
        const mv = nuevo('Movimiento', { Id: l.nuevoId(), Fecha: fecha, Tipo: 'PagoTarjeta', Descripcion: desc + ' (USD)', Categoria: 'Pago de tarjeta', Monto: u, Moneda: 'USD',
          CuentaId: c.Id, TarjetaId: t.Id, PeriodoResumen: rr.Periodo });
        if (c.Moneda === 'ARS') {
          const cot = inCotiz.leer();
          mv.MontoCuenta = u.por(cot).redondear(2);
          mv.Nota = 'Dólar tarjeta ' + Fmt.pesos(cot);
        }
        l.movimientos.push(mv);
        partes.push(Fmt.dolares(u));
      }
      m.invalidar();
      await guardar();
      toast('Pago registrado: ' + t.Nombre + ' ' + Fmt.periodo(rr.Periodo) + ' (' + partes.join(' + ') + ')', { accion: 'Deshacer', alAccionar: async () => { await deshacer(); } });
      return true;
    },
  });
}

// ============================================================================ Total real y fechas del resumen
export function abrirResumen(t, p) {
  const m = E.motor;
  const r = m.resumenDe(t, p);
  const info = m.info(t.Id, p);
  const inCierre = entradaFecha(r.Cierre);
  const inVenc = entradaFecha(r.Vencimiento);
  const inRealARS = entradaMonto(info && info.TotalRealARS !== null ? info.TotalRealARS : null, { placeholder: Fmt.num(r.TotalARS, 2) });
  const inRealUSD = entradaMonto(info && info.TotalRealUSD !== null ? info.TotalRealUSD : null, { placeholder: Fmt.num(r.TotalUSD, 2) });
  const swPagado = interruptor(info ? info.Pagado : false);
  const inNota = entrada(info ? info.Nota : '', { placeholder: 'Opcional' });
  const contenido = h('div', { class: 'form' },
    grupo(campo('Cierre', inCierre), campo('Vencimiento', inVenc)),
    h('p', { class: 'ayuda' }, 'Lo que compres hasta el cierre (inclusive) entra en este resumen. Hoy figura: compras del ' + Fmt.fechaCorta(r.Inicio) + ' al ' + Fmt.fechaCorta(r.Cierre) + '.'),
    h('div', { class: 'bloque' }, h('div', { class: 'etiqueta-bloque' }, 'Total que figura en el resumen del banco'),
      grupo(campo('En pesos', inRealARS), campo('En dólares', inRealUSD)),
      h('p', { class: 'ayuda' }, 'Vacío = usar la suma de lo cargado. La diferencia se toma como impuestos y cargos.')),
    h('div', { class: 'bloque' }, grupo(campo('Ya está pagado', swPagado), campo('Nota', inNota)),
      h('p', { class: 'ayuda' }, 'Marcalo como pagado sólo si lo pagaste desde una cuenta que no llevás en la app. Si no, mejor «Registrar pago».')));
  return abrirHoja({
    titulo: 'Resumen ' + Fmt.periodo(p), contenido, textoConfirmar: 'Guardar',
    alConfirmar: async () => {
      const cierre = inCierre.leer(), venc = inVenc.leer();
      if (cierre === null || venc === null) { toast('Revisá las fechas.', { error: true }); return false; }
      const anterior = m.cierre(t, Per.sumar(p, -1)), siguiente = m.cierre(t, Per.sumar(p, 1));
      if (cierre <= anterior) { toast('El cierre tiene que ser posterior al cierre del resumen anterior (' + Fmt.fecha(anterior) + ').', { error: true }); return false; }
      if (cierre >= siguiente) { toast('El cierre tiene que ser anterior al cierre del resumen siguiente (' + Fmt.fecha(siguiente) + ').', { error: true }); return false; }
      if (venc < cierre) { toast('El vencimiento no puede ser antes del cierre.', { error: true }); return false; }
      const realARS = inRealARS.value.trim() ? inRealARS.leer() : null;
      const realUSD = inRealUSD.value.trim() ? inRealUSD.leer() : null;
      if ((inRealARS.value.trim() && realARS === null) || (inRealUSD.value.trim() && realUSD === null)) { toast('Revisá los totales.', { error: true }); return false; }
      const inf = m.infoOCrear(t.Id, p);
      inf.Cierre = cierre === Motor.cierrePorDefecto(t, p) ? null : cierre;
      inf.Vencimiento = venc === Motor.vencimientoPorDefecto(t, p) ? null : venc;
      inf.TotalRealARS = realARS;
      inf.TotalRealUSD = realUSD;
      inf.Pagado = swPagado.input.checked;
      inf.Nota = inNota.value.trim();
      if (inf.Cierre === null && inf.Vencimiento === null && inf.TotalRealARS === null && inf.TotalRealUSD === null && !inf.Pagado && !inf.Nota) {
        E.libro.resumenes.splice(E.libro.resumenes.indexOf(inf), 1);
      }
      m.invalidar();
      await guardar();
      toast('Resumen actualizado');
      return true;
    },
  });
}

// ============================================================================ Ajuste de saldo
export function abrirAjuste(cuenta) {
  const l = E.libro, m = E.motor;
  const cuentas = l.cuentas.filter((c) => c.Activa);
  const selCuenta = selector(cuentas.map((c) => [c.Id, c.Nombre + (c.Moneda === 'USD' ? ' (USD)' : '')]), cuenta ? cuenta.Id : (cuentas[0] ? cuentas[0].Id : ''));
  const inFecha = entradaFecha(hoy());
  const lblApp = h('span', { class: 'num', style: { marginLeft: 'auto', fontSize: '17px' } });
  const inReal = entradaMonto(null, { placeholder: 'Saldo real' });
  const lblDif = h('span', { class: 'num', style: { marginLeft: 'auto', fontSize: '17px' } }, '—');
  const motivos = [AJUSTES, 'Rendimientos', 'Gastos no registrados', 'Ingresos no registrados'];
  const selMotivo = selector(motivos.map((x) => [x, x]), AJUSTES);
  const cuentaSel = () => l.cuenta(Number(selCuenta.value));
  function recalcular() {
    const c = cuentaSel();
    if (!c) return;
    const saldo = m.saldo(c, inFecha.leer() ?? hoy());
    lblApp.textContent = textoMonto(saldo, c.Moneda);
    const real = inReal.value.trim() ? Fmt.parseMonto(inReal.value) : null;
    if (real === null) { lblDif.textContent = '—'; lblDif.className = 'num sec'; return; }
    const dif = real.menos(saldo);
    lblDif.textContent = (dif.signo >= 0 ? '+' : '') + textoMonto(dif, c.Moneda);
    lblDif.className = 'num ' + (dif.signo < 0 ? 'rojo' : dif.signo > 0 ? 'verde' : 'sec');
    if (dif.signo > 0 && c.Remunerada && selMotivo.value === AJUSTES) selMotivo.value = 'Rendimientos';
  }
  for (const x of [selCuenta, inFecha]) x.addEventListener('change', recalcular);
  inReal.addEventListener('input', recalcular);
  const contenido = h('div', { class: 'form' },
    grupo(campo('Cuenta', selCuenta), campo('Fecha', inFecha), h('div', { class: 'campo' }, h('span', { class: 'etiqueta' }, 'Según la app'), lblApp)),
    h('div', { class: 'bloque' }, grupo(campo('Saldo real', inReal), h('div', { class: 'campo' }, h('span', { class: 'etiqueta' }, 'Diferencia'), lblDif), campo('Motivo', selMotivo))),
    h('p', { class: 'ayuda' }, 'Escribí cuánto tenés hoy en la cuenta. La diferencia queda registrada como ajuste (los intereses estimados se corrigen solos).'));
  recalcular();
  return abrirHoja({
    titulo: 'Ajustar saldo real', contenido, textoConfirmar: 'Ajustar',
    alConfirmar: async () => {
      const c = cuentaSel();
      if (!c) { toast('Elegí una cuenta.', { error: true }); return false; }
      const real = inReal.value.trim() ? Fmt.parseMonto(inReal.value) : null;
      if (real === null) { toast('Escribí el saldo real.', { error: true }); return false; }
      const fecha = inFecha.leer() ?? hoy();
      const dif = real.menos(m.saldo(c, fecha));
      if (dif.esCero) { toast('El saldo ya coincide.'); return true; }
      l.movimientos.push(nuevo('Movimiento', { Id: l.nuevoId(), Fecha: fecha, Tipo: 'Ajuste', Descripcion: 'Ajuste de saldo', Categoria: selMotivo.value || AJUSTES,
        Monto: dif, Moneda: c.Moneda, CuentaId: c.Id, Nota: 'Saldo real ' + Fmt.monto(real, c.Moneda) }));
      m.invalidar();
      await guardar();
      toast('Saldo actualizado', { accion: 'Deshacer', alAccionar: async () => { await deshacer(); } });
      return true;
    },
  });
}
