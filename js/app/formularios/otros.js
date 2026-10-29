// ============================================================================
//  Fijos, cuentas y tarjetas (igual que DlgFijo y DlgCuentas de la PC).
// ============================================================================

import { h, icono, abrirHoja, campo, entrada, entradaMonto, entradaFecha, selector, interruptor, segmentado, grupo, toast, confirmar, colorCss } from '../ui.js';
import { E, hoy, guardar, deshacer } from '../estado.js';
import { D, CERO } from '../../nucleo/decimal.js';
import { F } from '../../nucleo/fecha.js';
import { Fmt } from '../../nucleo/formato.js';
import { nuevo } from '../../nucleo/modelo.js';
import { sugerir, asegurar, OTROS, OTROS_INGRESOS } from '../../nucleo/categorias.js';

// ============================================================================ Fijos
export function abrirFijo(r = null) {
  const l = E.libro;
  let tipo = r ? (r.Tipo === 'Ingreso' ? 'Ingreso' : 'Gasto') : 'Gasto';
  const inDesc = entrada(r ? r.Descripcion : '', { placeholder: 'Alquiler, Netflix, Sueldo…' });
  const inMonto = entradaMonto(r ? r.Monto : null);
  const selMoneda = selector([['ARS', 'Pesos'], ['USD', 'Dólares']], r ? r.Moneda : 'ARS');
  const selMedio = h('select');
  const selDia = selector(Array.from({ length: 31 }, (_, i) => [i + 1, 'Día ' + (i + 1)]), r ? r.Dia : 1);
  const selCat = h('select');
  const inDesde = entradaFecha(r ? r.Desde : hoy());
  const swHasta = interruptor(r ? r.Hasta !== null : false, () => filaHasta.classList.toggle('oculto', !swHasta.input.checked));
  const inHasta = entradaFecha(r && r.Hasta !== null ? r.Hasta : F.sumarMeses(hoy(), 12));
  const filaHasta = campo('Hasta', inHasta);
  const swAuto = interruptor(r ? r.AutoRegistrar : false, () => info());
  const filaAuto = campo('Registrar solo', swAuto);
  const swActivo = interruptor(r ? r.Activo : true);
  const cajaInfo = h('div', { class: 'info-form' });

  function llenar() {
    const previo = selMedio.value;
    selMedio.innerHTML = '';
    if (tipo === 'Gasto') for (const t of l.tarjetas.filter((x) => x.Activa)) selMedio.appendChild(h('option', { value: 't' + t.Id }, 'Tarjeta ' + t.Nombre));
    for (const c of l.cuentas.filter((x) => x.Activa)) selMedio.appendChild(h('option', { value: 'c' + c.Id }, 'Cuenta ' + c.Nombre + (c.Moneda === 'USD' ? ' (USD)' : '')));
    const inicial = r ? (r.TarjetaId !== 0 ? 't' + r.TarjetaId : 'c' + r.CuentaId) : previo;
    if ([...selMedio.options].some((o) => o.value === inicial)) selMedio.value = inicial;
    const texto = selCat.value || (r ? r.Categoria : '');
    selCat.innerHTML = '';
    const cats = l.categorias.filter((c) => c.EsIngreso === (tipo === 'Ingreso')).map((c) => c.Nombre).sort((a, b) => a.localeCompare(b, 'es'));
    for (const c of cats) selCat.appendChild(h('option', { value: c }, c));
    const elegir = r ? r.Categoria : (tipo === 'Ingreso' ? 'Sueldo' : (texto || OTROS));
    if (![...selCat.options].some((o) => o.value === elegir)) selCat.insertBefore(h('option', { value: elegir }, elegir), selCat.firstChild);
    selCat.value = elegir;
    info();
  }
  function info() {
    const esT = selMedio.value.startsWith('t');
    filaAuto.classList.toggle('oculto', esT);
    let txt;
    if (esT) txt = 'Se va a sumar solo a cada resumen de esta tarjeta desde el ' + Fmt.fechaCorta(inDesde.leer() ?? hoy()) + '. Si un mes cambia el precio, lo editás en ese resumen.';
    else if (tipo === 'Ingreso') txt = 'Cada mes, el día ' + selDia.value + ', se suma a la proyección. ' + (swAuto.input.checked ? 'Se registra solo.' : 'Te va a aparecer para confirmarlo cuando llegue.');
    else txt = 'Cada mes, el día ' + selDia.value + ', se descuenta en la proyección. ' + (swAuto.input.checked ? 'Se registra solo.' : 'Te va a aparecer como pendiente.');
    const v = inMonto.leer();
    if (v && v.signo > 0) txt += ' Al año: ' + Fmt.monto(v.por(D(12)), selMoneda.value) + '.';
    cajaInfo.textContent = txt;
  }
  inDesc.addEventListener('blur', () => {
    if (!r && (!selCat.value || selCat.value === OTROS || selCat.value === OTROS_INGRESOS)) {
      const s = sugerir(inDesc.value, l, tipo === 'Ingreso');
      if (![...selCat.options].some((o) => o.value === s)) selCat.insertBefore(h('option', { value: s }, s), selCat.firstChild);
      selCat.value = s;
    }
  });
  for (const x of [selMedio, selDia, inDesde, selMoneda]) x.addEventListener('change', info);
  inMonto.addEventListener('input', info);

  const contenido = h('div', { class: 'form' },
    segmentado([['Gasto', 'Gasto'], ['Ingreso', 'Ingreso']], tipo, (v) => { tipo = v; llenar(); }),
    h('div', { class: 'bloque' }, grupo(campo('Descripción', inDesc), campo('Monto', inMonto), campo('Moneda', selMoneda), campo('Con', selMedio), campo('Día del mes', selDia), campo('Categoría', selCat))),
    h('div', { class: 'bloque' }, grupo(campo('Desde', inDesde), campo('Termina', swHasta), filaHasta, filaAuto, campo('Activo', swActivo))),
    cajaInfo,
    r ? h('div', { class: 'botonera' }, h('button', { class: 'boton peligro', type: 'button', onClick: async () => {
      if (!(await confirmar('¿Borrar el fijo «' + r.Descripcion + '»? Lo que ya se registró queda.', { si: 'Borrar', peligro: true }))) return;
      l.recurrentes.splice(l.recurrentes.indexOf(r), 1);
      await guardar();
      hoja.cerrar();
      toast('Fijo borrado', { accion: 'Deshacer', alAccionar: () => deshacer() });
    } }, icono('borrar'), 'Borrar fijo')) : null);
  filaHasta.classList.toggle('oculto', !swHasta.input.checked);
  llenar();

  const hoja = abrirHoja({
    titulo: r ? 'Editar fijo' : 'Nuevo fijo', contenido, textoConfirmar: 'Guardar',
    alConfirmar: async () => {
      if (!inDesc.value.trim()) { toast('Escribí una descripción.', { error: true }); return false; }
      const monto = inMonto.leer();
      if (!monto || monto.signo <= 0) { toast('Escribí un monto mayor a cero.', { error: true }); return false; }
      if (!selMedio.value) { toast('Elegí la cuenta o tarjeta.', { error: true }); return false; }
      const esT = selMedio.value.startsWith('t');
      const id = Number(selMedio.value.slice(1));
      if (!esT) {
        const c = l.cuenta(id);
        if (c && c.Moneda !== selMoneda.value) { toast('La cuenta ' + c.Nombre + ' es en ' + (c.Moneda === 'USD' ? 'dólares' : 'pesos') + ': cambiá la moneda del fijo.', { error: true }); return false; }
      }
      const desde = inDesde.leer(), hasta = swHasta.input.checked ? inHasta.leer() : null;
      if (desde === null) { toast('Elegí la fecha de inicio.', { error: true }); return false; }
      if (hasta !== null && hasta < desde) { toast('La fecha de fin no puede ser anterior al inicio.', { error: true }); return false; }
      const x = r || nuevo('Fijo', { Id: l.nuevoId() });
      x.Tipo = tipo;
      x.Descripcion = inDesc.value.trim();
      x.Monto = monto;
      x.Moneda = selMoneda.value;
      x.CuentaId = esT ? 0 : id;
      x.TarjetaId = esT ? id : 0;
      x.Dia = Number(selDia.value);
      x.Categoria = asegurar(l, selCat.value, tipo === 'Ingreso');
      x.Desde = desde;
      x.Hasta = hasta;
      x.AutoRegistrar = swAuto.input.checked && !esT;
      x.Activo = swActivo.input.checked;
      if (!r) l.recurrentes.push(x);
      E.motor.invalidar();
      await guardar();
      toast(r ? 'Fijo actualizado' : 'Fijo agregado');
      return true;
    },
  });
  return hoja;
}

// ============================================================================ Cuentas
export function abrirCuenta(c = null) {
  const l = E.libro;
  const inNombre = entrada(c ? c.Nombre : '', { placeholder: 'Banco, billetera…' });
  const selTipo = selector([['Banco', 'Banco'], ['Billetera', 'Billetera virtual'], ['Efectivo', 'Efectivo'], ['Inversion', 'Inversión']], c ? c.Tipo : 'Banco');
  const selMoneda = selector([['ARS', 'Pesos'], ['USD', 'Dólares']], c ? c.Moneda : 'ARS');
  if (c && l.movimientos.some((m) => m.CuentaId === c.Id || m.CuentaDestinoId === c.Id)) selMoneda.disabled = true;
  const inSaldo = entradaMonto(c ? c.SaldoInicial : CERO);
  const inFecha = entradaFecha(c ? c.FechaSaldoInicial : hoy());
  const swRem = interruptor(c ? c.Remunerada : false, () => filaTNA.classList.toggle('oculto', !swRem.input.checked));
  const inTNA = entradaMonto(c && c.Remunerada ? c.TNA.por(D(100)) : null, { placeholder: 'ej. 19' });
  const filaTNA = campo('TNA (%)', inTNA);
  const swActiva = interruptor(c ? c.Activa : true);
  const inNota = entrada(c ? c.Nota : '', { placeholder: 'Opcional' });
  filaTNA.classList.toggle('oculto', !swRem.input.checked);
  const contenido = h('div', { class: 'form' },
    grupo(campo('Nombre', inNombre), campo('Tipo', selTipo), campo('Moneda', selMoneda)),
    h('div', { class: 'bloque' }, grupo(campo(c ? 'Saldo inicial' : 'Saldo de hoy', inSaldo), campo(c ? 'Fecha saldo' : 'Al día', inFecha)),
      h('p', { class: 'ayuda' }, c ? 'Es el saldo con el que empezó a usarse en la app. Para corregir el saldo de hoy usá «Ajustar saldo».' : 'El saldo al empezar ese día (antes de los movimientos de ese día).')),
    h('div', { class: 'bloque' }, grupo(campo('Remunerada', swRem), filaTNA, campo('Activa', swActiva), campo('Nota', inNota)),
      h('p', { class: 'ayuda' }, 'Las remuneradas generan intereses estimados todos los días. Las activas se suman al disponible.')));
  return abrirHoja({
    titulo: c ? 'Editar cuenta' : 'Nueva cuenta', contenido, textoConfirmar: 'Guardar',
    alConfirmar: async () => {
      const nombre = inNombre.value.trim();
      if (!nombre) { toast('Escribí un nombre para la cuenta.', { error: true }); return false; }
      if (l.cuentas.some((x) => x !== c && x.Nombre.toLowerCase() === nombre.toLowerCase())) { toast('Ya hay una cuenta con ese nombre.', { error: true }); return false; }
      const saldo = inSaldo.value.trim() ? inSaldo.leer() : CERO;
      if (saldo === null) { toast('Revisá el saldo.', { error: true }); return false; }
      let tna = CERO;
      if (swRem.input.checked) {
        const v = inTNA.leer();
        if (!v || v.signo <= 0 || v.gt(D(500))) { toast('Escribí la tasa anual (por ejemplo 19).', { error: true }); return false; }
        tna = v.div(D(100));
      }
      const x = c || nuevo('Cuenta', { Id: l.nuevoId() });
      x.Nombre = nombre; x.Tipo = selTipo.value; x.Moneda = selMoneda.value; x.SaldoInicial = saldo; x.FechaSaldoInicial = inFecha.leer() ?? hoy();
      x.Remunerada = swRem.input.checked; x.TNA = tna; x.Activa = swActiva.input.checked; x.Nota = inNota.value.trim();
      if (!c) l.cuentas.push(x);
      E.motor.invalidar();
      await guardar();
      toast(c ? 'Cuenta actualizada' : 'Cuenta agregada');
      return true;
    },
  });
}

// ============================================================================ Tarjetas
// Los cinco primeros son los de la PC (en el mismo orden: una tarjeta nueva toma el mismo color que le daría la PC)
const PALETA_PC = [0xFF7C3AED, 0xFFDB2777, 0xFF0891B2, 0xFF65A30D, 0xFFEA580C].map((x) => x | 0);
const PALETA_TARJETAS = [...PALETA_PC, ...[0xFF2563EB, 0xFF059669, 0xFF475569].map((x) => x | 0)];

export function abrirTarjeta(t = null) {
  const l = E.libro, m = E.motor;
  const inNombre = entrada(t ? t.Nombre : '', { placeholder: 'Visa Galicia, Naranja X…' });
  const dias = Array.from({ length: 31 }, (_, i) => [i + 1, String(i + 1)]);
  const selCierre = selector(dias, t ? t.DiaCierre : 20);
  const selVenc = selector(dias, t ? t.DiaVencimiento : 5);
  const cuentasARS = l.cuentas.filter((x) => x.Activa && x.Moneda === 'ARS');
  const selCuenta = selector([[0, '(ninguna)'], ...cuentasARS.map((c) => [c.Id, c.Nombre])], t ? t.CuentaPagoId : (cuentasARS[0] ? cuentasARS[0].Id : 0));
  const swDebito = interruptor(t ? t.DebitoAutomatico : false);
  const inLimite = entradaMonto(t && t.Limite.signo > 0 ? t.Limite : null, { placeholder: 'Opcional' });
  const inEstimado = entradaMonto(t && t.ConsumoEstimado.signo > 0 ? t.ConsumoEstimado : null, { placeholder: 'Automático' });
  let color = t ? t.ColorArgb : PALETA_PC[l.tarjetas.length % PALETA_PC.length];
  const colores = h('div', { class: 'colores' });
  const pintarColores = () => {
    colores.innerHTML = '';
    const lista = PALETA_TARJETAS.includes(color) ? PALETA_TARJETAS : [color, ...PALETA_TARJETAS];
    for (const c of lista) {
      colores.appendChild(h('button', { type: 'button', class: c === color ? 'activo' : '', style: { '--c': colorCss(c) }, 'aria-label': 'Color', onClick: () => { color = c; pintarColores(); } }));
    }
  };
  pintarColores();
  const swActiva = interruptor(t ? t.Activa : true);
  let ayudaEst = 'Vacío = automático.';
  if (t) { const e = m.estimadoMensualConOrigen({ ...t, ConsumoEstimado: CERO }); ayudaEst += ' Hoy se calcula ' + Fmt.pesosR(e.valor) + ' (' + e.origen + ').'; }
  const contenido = h('div', { class: 'form' },
    grupo(campo('Nombre', inNombre), campo('Cierra el día', selCierre), campo('Vence el día', selVenc)),
    h('p', { class: 'ayuda' }, 'Valores típicos de cada mes. Si un mes el banco corre las fechas, se ajusta en ese resumen.'),
    h('div', { class: 'bloque' }, grupo(campo('Se paga desde', selCuenta), campo('Débito automático', swDebito)),
      h('p', { class: 'ayuda' }, 'Con débito automático la app registra sola el pago del total el día del vencimiento.')),
    h('div', { class: 'bloque' }, grupo(campo('Límite', inLimite), campo('Consumo mensual', inEstimado)), h('p', { class: 'ayuda' }, ayudaEst + ' Se usa para proyectar lo que todavía no cargaste.')),
    h('div', { class: 'bloque' }, h('div', { class: 'etiqueta-bloque' }, 'Color'), grupo(colores, campo('Activa', swActiva))));
  return abrirHoja({
    titulo: t ? 'Editar tarjeta' : 'Nueva tarjeta', contenido, textoConfirmar: 'Guardar',
    alConfirmar: async () => {
      const nombre = inNombre.value.trim();
      if (!nombre) { toast('Escribí el nombre de la tarjeta.', { error: true }); return false; }
      if (l.tarjetas.some((x) => x !== t && x.Nombre.toLowerCase() === nombre.toLowerCase())) { toast('Ya hay una tarjeta con ese nombre.', { error: true }); return false; }
      if (selCierre.value === selVenc.value) { toast('El día de cierre y el de vencimiento no pueden ser iguales.', { error: true }); return false; }
      const lim = inLimite.value.trim() ? inLimite.leer() : CERO;
      const est = inEstimado.value.trim() ? inEstimado.leer() : CERO;
      if (lim === null || est === null) { toast('Revisá los montos.', { error: true }); return false; }
      const x = t || nuevo('Tarjeta', { Id: l.nuevoId() });
      x.Nombre = nombre; x.DiaCierre = Number(selCierre.value); x.DiaVencimiento = Number(selVenc.value);
      x.CuentaPagoId = Number(selCuenta.value); x.Limite = lim; x.ConsumoEstimado = est; x.ColorArgb = color; x.Activa = swActiva.input.checked;
      const activaDebito = swDebito.input.checked && x.CuentaPagoId !== 0 && !x.DebitoAutomatico;
      x.DebitoAutomatico = swDebito.input.checked && x.CuentaPagoId !== 0;
      if (!t) l.tarjetas.push(x);
      m.invalidar();
      if (activaDebito) m.noDebitarVencidos(x);
      await guardar();
      toast(t ? 'Tarjeta actualizada' : 'Tarjeta agregada');
      return true;
    },
  });
}
