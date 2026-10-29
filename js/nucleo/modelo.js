// ============================================================================
//  Mis Finanzas · Modelo de datos (igual que src/Nucleo/Modelo.vb y ModeloV2.vb)
//  Cada entidad es un objeto con las mismas propiedades que en la PC. Se lee y se
//  escribe datos.xml con el mismo formato, así los dos lados entienden lo mismo.
// ============================================================================

import { Dec, CERO } from './decimal.js';
import { F } from './fecha.js';
import { Elemento, leerXml, escribirXml } from './xml.js';

export const ENUMS = {
  Moneda: ['ARS', 'USD'],
  TipoCuenta: ['Banco', 'Billetera', 'Efectivo', 'Inversion'],
  TipoMov: ['Gasto', 'Ingreso', 'Transferencia', 'PagoTarjeta', 'Ajuste'],
  Repeticion: ['Nunca', 'Diaria', 'Semanal', 'Mensual', 'Anual'],
  EstadoMateria: ['Cursando', 'Regular', 'Aprobada', 'Pendiente', 'Abandonada'],
  TipoExamen: ['Parcial', 'Final', 'Recuperatorio', 'TrabajoPractico', 'Entrega', 'Coloquio', 'Otro'],
  TipoRepaso: ['Concepto', 'MuyTomado', 'Distincion', 'Mnemotecnia', 'Trampa'],
  TipoMeta: ['Vivienda', 'Auto', 'Viaje', 'Fondo', 'Otra'],
};

const P = (n, t, d) => ({ n, t, d });

/** Propiedades de cada entidad en el mismo orden que la clase de la PC (así se escriben los atributos). */
export const ESQUEMAS = {
  Cuenta: [P('Id', 'int', 0), P('Nombre', 'str', ''), P('Tipo', 'enum:TipoCuenta', 'Banco'), P('Moneda', 'enum:Moneda', 'ARS'),
    P('SaldoInicial', 'dec', '0'), P('FechaSaldoInicial', 'date', 'hoy'), P('Remunerada', 'bool', false), P('TNA', 'dec', '0'),
    P('Activa', 'bool', true), P('Nota', 'str', '')],
  Tarjeta: [P('Id', 'int', 0), P('Nombre', 'str', ''), P('DiaCierre', 'int', 20), P('DiaVencimiento', 'int', 5), P('CuentaPagoId', 'int', 0),
    P('Limite', 'dec', '0'), P('ColorArgb', 'int', -14326805), P('ConsumoEstimado', 'dec', '0'), P('DebitoAutomatico', 'bool', false), P('Activa', 'bool', true)],
  Resumen: [P('TarjetaId', 'int', 0), P('Periodo', 'int', 0), P('Cierre', 'date?', null), P('Vencimiento', 'date?', null),
    P('TotalRealARS', 'dec?', null), P('TotalRealUSD', 'dec?', null), P('Pagado', 'bool', false), P('DebitoRegistrado', 'bool', false), P('Nota', 'str', '')],
  Movimiento: [P('Id', 'int', 0), P('Fecha', 'date', 'hoy'), P('Tipo', 'enum:TipoMov', 'Gasto'), P('Descripcion', 'str', ''), P('Categoria', 'str', ''),
    P('Monto', 'dec', '0'), P('Moneda', 'enum:Moneda', 'ARS'), P('CuentaId', 'int', 0), P('TarjetaId', 'int', 0), P('CuentaDestinoId', 'int', 0),
    P('MontoDestino', 'dec', '0'), P('MontoCuenta', 'dec', '0'), P('Cuotas', 'int', 1), P('PeriodoForzado', 'int', 0), P('PeriodoResumen', 'int', 0),
    P('RecurrenteId', 'int', 0), P('PeriodoRecurrente', 'int', 0), P('Auto', 'bool', false), P('Nota', 'str', '')],
  Fijo: [P('Id', 'int', 0), P('Descripcion', 'str', ''), P('Categoria', 'str', ''), P('Tipo', 'enum:TipoMov', 'Gasto'), P('Monto', 'dec', '0'),
    P('Moneda', 'enum:Moneda', 'ARS'), P('CuentaId', 'int', 0), P('TarjetaId', 'int', 0), P('Dia', 'int', 1), P('Desde', 'date', 'hoy'),
    P('Hasta', 'date?', null), P('AutoRegistrar', 'bool', false), P('Activo', 'bool', true)],
  Categoria: [P('Nombre', 'str', ''), P('EsIngreso', 'bool', false), P('Esencial', 'bool', false), P('Presupuesto', 'dec', '0'), P('ColorArgb', 'int', 0)],
  Cierre: [P('Periodo', 'int', 0), P('FechaCierre', 'date', 'min'), P('Ingresos', 'dec', '0'), P('Egresos', 'dec', '0'), P('SaldoARS', 'dec', '0'),
    P('SaldoUSD', 'dec', '0'), P('Nota', 'str', '')],
  Configuracion: [P('Nombre', 'str', ''), P('DolarTarjeta', 'dec', '2015'), P('DolarMEP', 'dec', '1562.27'), P('FechaCotizacion', 'date', '2026-10-23'),
    P('InflacionMensual', 'dec', '0.02'), P('TNAReferencia', 'dec', '0.19'), P('MetaAhorro', 'dec', '0.2'), P('MesesEmergencia', 'int', 3),
    P('PeriodoInicial', 'int', 202611), P('AvisosOcultos', 'str', ''), P('VentanaAncho', 'int', 0), P('VentanaAlto', 'int', 0),
    P('VentanaMaximizada', 'bool', false), P('VersionDatos', 'int', 2), P('ModoTema', 'str', 'claro'), P('PantallaInicio', 'str', 'panel'),
    P('PerfilInversor', 'str', 'moderado'), P('PomodoroMin', 'int', 25), P('DescansoMin', 'int', 5), P('DescansoLargoMin', 'int', 15),
    P('PomodorosPorCiclo', 'int', 4), P('MetaHorasEstudio', 'dec', '10'), P('Carrera', 'str', ''), P('TotalMaterias', 'int', 0),
    P('MenuColapsado', 'str', ''), P('CalVerTareas', 'bool', true), P('CalVerEstudio', 'bool', true), P('CalVerFinanzas', 'bool', true),
    P('TableroActual', 'int', 0), P('MercadoAuto', 'bool', true), P('MercadoActualizado', 'date?', null), P('PrecioM2Referencia', 'dec', '2476')],
  Tablero: [P('Id', 'int', 0), P('Nombre', 'str', ''), P('Orden', 'int', 0), P('ColorArgb', 'int', 0), P('Archivado', 'bool', false)],
  Lista: [P('Id', 'int', 0), P('TableroId', 'int', 0), P('Nombre', 'str', ''), P('Orden', 'int', 0), P('EsFinal', 'bool', false)],
  Tarea: [P('Id', 'int', 0), P('TableroId', 'int', 0), P('ListaId', 'int', 0), P('Titulo', 'str', ''), P('Descripcion', 'str', ''), P('Orden', 'int', 0),
    P('Fecha', 'date?', null), P('Hora', 'str', ''), P('Etiqueta', 'str', ''), P('ColorArgb', 'int', 0), P('Prioridad', 'int', 0), P('Hecha', 'bool', false),
    P('FechaHecha', 'date?', null), P('Checklist', 'str', ''), P('Repetir', 'enum:Repeticion', 'Nunca'), P('MateriaId', 'int', 0),
    P('Archivada', 'bool', false), P('Creada', 'date', 'hoy'), P('DiaRepeticion', 'int', 0)],
  Materia: [P('Id', 'int', 0), P('Nombre', 'str', ''), P('Cuatrimestre', 'str', ''), P('Estado', 'enum:EstadoMateria', 'Cursando'), P('Nota', 'dec?', null),
    P('ColorArgb', 'int', 0), P('HorasSemana', 'dec', '0'), P('Comision', 'str', ''), P('Comentario', 'str', '')],
  Examen: [P('Id', 'int', 0), P('MateriaId', 'int', 0), P('Tipo', 'enum:TipoExamen', 'Parcial'), P('Fecha', 'date', 'hoy'), P('Hora', 'str', ''),
    P('Temas', 'str', ''), P('HorasObjetivo', 'dec', '0'), P('Nota', 'dec?', null), P('Rendido', 'bool', false)],
  Sesion: [P('Id', 'int', 0), P('MateriaId', 'int', 0), P('Inicio', 'date', 'ahora'), P('Minutos', 'int', 0), P('Pomodoro', 'bool', false), P('Comentario', 'str', '')],
  Repaso: [P('Id', 'int', 0), P('MateriaId', 'int', 0), P('Frente', 'str', ''), P('Dorso', 'str', ''), P('Tipo', 'enum:TipoRepaso', 'Concepto'),
    P('Caja', 'int', 1), P('ProximaRevision', 'date', 'hoy'), P('UltimaRevision', 'date?', null), P('Aciertos', 'int', 0), P('Errores', 'int', 0), P('Creada', 'date', 'hoy')],
  Meta: [P('Id', 'int', 0), P('Nombre', 'str', ''), P('Tipo', 'enum:TipoMeta', 'Otra'), P('Moneda', 'enum:Moneda', 'USD'), P('Monto', 'dec', '0'),
    P('Ahorrado', 'dec', '0'), P('AporteMensual', 'dec', '0'), P('FechaObjetivo', 'date?', null), P('Prioridad', 'int', 0), P('Activa', 'bool', true),
    P('Comentario', 'str', ''), P('UsaCredito', 'bool', false), P('PctFinanciado', 'dec', '0.75'), P('PlazoAnios', 'int', 20), P('TNACredito', 'dec', '0.067'),
    P('GastosCompraPct', 'dec', '0.07'), P('M2', 'dec', '0'), P('PrecioM2', 'dec', '0')],
  Dato: [P('Clave', 'str', ''), P('Valor', 'dec', '0'), P('Texto', 'str', ''), P('Fecha', 'date', 'hoy'), P('Obtenido', 'date', 'ahora'), P('Fuente', 'str', '')],
  Dispositivo: [P('Ranura', 'int', 0), P('Nombre', 'str', ''), P('Tipo', 'str', ''), P('Alta', 'date', 'hoy'), P('ProximoId', 'int', 0)],
};

/** Secciones de datos.xml en el orden en que las escribe la PC: [contenedor, elemento, propiedad del Libro]. */
export const SECCIONES = [
  ['Cuentas', 'Cuenta', 'cuentas'], ['Tarjetas', 'Tarjeta', 'tarjetas'], ['Resumenes', 'Resumen', 'resumenes'], ['Fijos', 'Fijo', 'recurrentes'],
  ['Categorias', 'Categoria', 'categorias'], ['Cierres', 'Cierre', 'cierres'], ['Movimientos', 'Movimiento', 'movimientos'],
  ['Tableros', 'Tablero', 'tableros'], ['Listas', 'Lista', 'listas'], ['Tareas', 'Tarea', 'tareas'], ['Materias', 'Materia', 'materias'],
  ['Examenes', 'Examen', 'examenes'], ['Sesiones', 'Sesion', 'sesiones'], ['Repasos', 'Repaso', 'repasos'], ['Metas', 'Meta', 'metas'],
  ['Mercado', 'Dato', 'mercado'], ['Dispositivos', 'Dispositivo', 'dispositivos']];

export const VERSION_ACTUAL = 2;
export const TAM_RANURA = 100000000;

// ------------------------------------------------------------------ Valores
function valorDefecto(p) {
  switch (p.t) {
    case 'dec': return Dec.parse(p.d);
    case 'date':
      if (p.d === 'hoy') return F.hoy();
      if (p.d === 'ahora') return F.ahora();
      if (p.d === 'min') return F.MINIMO;
      return F.leer(p.d);
    default: return p.d;
  }
}

/** Texto → valor, como TextoAValor de la PC (null = valor inválido: se queda el de por defecto). */
function leerValor(s, p) {
  const t = p.t;
  if (t === 'str') return s;
  const nullable = t.endsWith('?');
  if (s === '' && nullable) return { nulo: true };
  if (t === 'int') {
    const m = /^\s*[+-]?\d+\s*$/.exec(s);
    if (!m) return undefined;
    const v = parseInt(s, 10);
    return v >= -2147483648 && v <= 2147483647 ? v : undefined;
  }
  if (t === 'dec' || t === 'dec?') { const d = Dec.intentar(s); return d === null ? undefined : d; }
  if (t === 'bool') return s === '1' || s.toLowerCase() === 'true';
  if (t === 'date' || t === 'date?') { const f = F.leer(s); return f === null ? undefined : f; }
  if (t.startsWith('enum:')) {
    const nombres = ENUMS[t.slice(5)];
    const k = nombres.findIndex((x) => x.toLowerCase() === s.trim().toLowerCase());
    if (k >= 0) return nombres[k];
    if (/^\s*\d+\s*$/.test(s)) { const i = parseInt(s, 10); return i < nombres.length ? nombres[i] : String(i); }
    return undefined;
  }
  return undefined;
}

/** Valor → texto, como ValorATexto de la PC (null = no se escribe el atributo). */
export function textoValor(v, p) {
  if (v === null || v === undefined) return null;
  switch (p.t) {
    case 'str': return v.length === 0 ? null : v;
    case 'int': return String(v);
    case 'dec': case 'dec?': return v.toString();
    case 'bool': return v ? '1' : '0';
    case 'date': case 'date?': return F.aTexto(v);
    default: return String(v);   // enum
  }
}

/** Entidad nueva con los valores por defecto (como "New Movimiento With {...}"). */
export function nuevo(tipo, valores = {}) {
  const o = {};
  for (const p of ESQUEMAS[tipo]) o[p.n] = valorDefecto(p);
  Object.defineProperty(o, '_tipo', { value: tipo, enumerable: false, writable: true });
  Object.defineProperty(o, '_extra', { value: [], enumerable: false, writable: true });
  return Object.assign(o, valores);
}

export function clonar(o) {
  const c = nuevo(o._tipo);
  for (const p of ESQUEMAS[o._tipo]) c[p.n] = o[p.n];
  c._extra = o._extra.map((a) => [a[0], a[1]]);
  return c;
}

function desdeElemento(tipo, el) {
  const o = nuevo(tipo);
  const esq = ESQUEMAS[tipo];
  for (const [n, s] of el.attrs) {
    const p = esq.find((x) => x.n === n);
    if (!p) { o._extra.push([n, s]); continue; }
    const v = leerValor(s, p);
    if (v === undefined) continue;   // inválido: queda el de por defecto
    o[n] = v && v.nulo ? null : v;
  }
  return o;
}

function aElemento(o, nombreElemento) {
  const el = new Elemento(nombreElemento);
  for (const p of ESQUEMAS[o._tipo]) {
    const s = textoValor(o[p.n], p);
    if (s !== null) el.attrs.push([p.n, s]);
  }
  for (const [n, v] of o._extra) if (!el.tiene(n)) el.attrs.push([n, v]);
  return el;
}

// ------------------------------------------------------------------ Libro
export class Libro {
  constructor() {
    this.config = nuevo('Configuracion');
    for (const [, , prop] of SECCIONES) this[prop] = [];
    this.proximoId = 1;
    this.revision = 0;
    /** Ranura de Id de este dispositivo (no se guarda en el archivo). */
    this.ranura = 0;
    this.extraRaiz = [];        // atributos desconocidos de la raíz
    this.extraSecciones = [];   // secciones desconocidas (se conservan tal cual)
  }

  static desdeXml(texto) { return Libro.desdeElemento(leerXml(texto).raiz); }

  static desdeElemento(raiz) {
    if (!raiz || raiz.nombre !== 'MisFinanzas') throw new Error('El archivo no es un archivo de datos de Mis Finanzas.');
    const l = new Libro();
    const cfg = raiz.hijo('Configuracion');
    if (cfg) l.config = desdeElemento('Configuracion', cfg);
    const conocidas = new Set(['Configuracion']);
    for (const [cont, item, prop] of SECCIONES) {
      conocidas.add(cont);
      const c = raiz.hijo(cont);
      if (!c) continue;
      for (const x of c.hijosLlamados(item)) l[prop].push(desdeElemento(item, x));
    }
    for (const h of raiz.hijos) if (!conocidas.has(h.nombre)) l.extraSecciones.push(h.clonar());
    for (const [n, v] of raiz.attrs) {
      if (n === 'ProximoId') { if (/^\s*[+-]?\d+\s*$/.test(v)) l.proximoId = parseInt(v, 10); }
      else if (n === 'Revision') { if (/^\s*[+-]?\d+\s*$/.test(v)) l.revision = parseInt(v, 10); }
      else if (n !== 'Version' && n !== 'Guardado') l.extraRaiz.push([n, v]);
    }
    const maxId = l.maximoIdEn(0);
    if (l.proximoId <= maxId || l.proximoId >= TAM_RANURA) l.proximoId = maxId + 1;
    return l;
  }

  aElemento(guardado = F.ahora()) {
    const raiz = new Elemento('MisFinanzas', [['Version', String(VERSION_ACTUAL)], ['Guardado', F.textoGuardado(guardado)], ['ProximoId', String(this.proximoId)]]);
    if (this.revision > 0) raiz.attrs.push(['Revision', String(this.revision)]);
    for (const [n, v] of this.extraRaiz) if (!raiz.tiene(n)) raiz.attrs.push([n, v]);
    raiz.hijos.push(aElemento(this.config, 'Configuracion'));
    for (const [cont, item, prop] of SECCIONES) {
      let lista = this[prop];
      if (prop === 'dispositivos') {
        if (lista.length === 0) continue;
        lista = [...lista].sort((a, b) => a.Ranura - b.Ranura);
      }
      if (prop === 'movimientos') lista = [...lista].sort((a, b) => (a.Fecha - b.Fecha) || (a.Id - b.Id));
      const c = new Elemento(cont);
      for (const o of lista) c.hijos.push(aElemento(o, item));
      raiz.hijos.push(c);
    }
    for (const h of this.extraSecciones) raiz.hijos.push(h.clonar());
    return raiz;
  }

  aXml(nl = '\r\n', guardado = F.ahora()) { return escribirXml(this.aElemento(guardado), nl); }

  clonar() { return Libro.desdeElemento(this.aElemento()); }

  // ---------------------------------------------------------------- Búsquedas
  cuenta(id) { return id === 0 ? null : this.cuentas.find((c) => c.Id === id) || null; }
  tarjeta(id) { return id === 0 ? null : this.tarjetas.find((t) => t.Id === id) || null; }
  recurrente(id) { return id === 0 ? null : this.recurrentes.find((r) => r.Id === id) || null; }
  categoria(nombre) {
    if (!nombre) return null;
    const n = nombre.toLowerCase();
    return this.categorias.find((c) => c.Nombre.toLowerCase() === n) || null;
  }
  tablero(id) { return id === 0 ? null : this.tableros.find((t) => t.Id === id) || null; }
  lista(id) { return id === 0 ? null : this.listas.find((t) => t.Id === id) || null; }
  listasDe(tableroId) { return this.listas.filter((x) => x.TableroId === tableroId).sort((a, b) => (a.Orden - b.Orden) || (a.Id - b.Id)); }
  materia(id) { return id === 0 ? null : this.materias.find((t) => t.Id === id) || null; }
  dato(clave) { const k = clave.toLowerCase(); return this.mercado.find((x) => x.Clave.toLowerCase() === k) || null; }
  dispositivo(ranura) { return this.dispositivos.find((d) => d.Ranura === ranura) || null; }

  fijarDato(clave, valor, texto = '', fecha = null, fuente = '') {
    let d = this.dato(clave);
    if (!d) { d = nuevo('Dato', { Clave: clave }); this.mercado.push(d); }
    d.Valor = Dec.de(valor);
    d.Texto = texto || '';
    d.Fecha = fecha !== null ? fecha : F.hoy();
    d.Obtenido = F.ahora();
    d.Fuente = fuente || '';
  }

  // ---------------------------------------------------------------- Id
  *todosLosId() {
    for (const prop of ['cuentas', 'tarjetas', 'movimientos', 'recurrentes', 'tableros', 'listas', 'tareas', 'materias', 'examenes', 'sesiones', 'repasos', 'metas']) {
      for (const x of this[prop]) yield x.Id;
    }
  }
  maximoId() { let m = 0; for (const id of this.todosLosId()) if (id > m) m = id; return m; }
  maximoIdEn(ranura) {
    const desde = ranura * TAM_RANURA, hasta = desde + TAM_RANURA;
    let m = 0;
    for (const id of this.todosLosId()) if (id >= desde && id < hasta && id > m) m = id;
    return m;
  }
  /** Id nuevo dentro del rango de este dispositivo (así nunca se repite con la PC). */
  nuevoId() {
    if (this.ranura <= 0) {
      const tope = this.maximoIdEn(0);
      if (this.proximoId <= tope) this.proximoId = tope + 1;
      return this.proximoId++;
    }
    let d = this.dispositivo(this.ranura);
    if (!d) { d = nuevo('Dispositivo', { Ranura: this.ranura, Nombre: 'Dispositivo ' + this.ranura }); this.dispositivos.push(d); }
    const id = Math.max(d.ProximoId, this.ranura * TAM_RANURA + 1, this.maximoIdEn(this.ranura) + 1);
    d.ProximoId = id + 1;
    return id;
  }

  // ---------------------------------------------------------------- Otros
  nombreMedio(m) {
    if (m.TarjetaId !== 0 && m.Tipo !== 'PagoTarjeta') {
      const t = this.tarjeta(m.TarjetaId);
      return t ? t.Nombre : '(tarjeta borrada)';
    }
    const c = this.cuenta(m.CuentaId);
    let nombre = c ? c.Nombre : '';
    if (m.Tipo === 'Transferencia') {
      const d = this.cuenta(m.CuentaDestinoId);
      nombre += ' → ' + (d ? d.Nombre : '?');
    }
    return nombre;
  }
  avisoOculto(clave) {
    if (!this.config.AvisosOcultos) return false;
    return this.config.AvisosOcultos.split('|').includes(clave);
  }
  ocultarAviso(clave) {
    const lista = this.config.AvisosOcultos ? this.config.AvisosOcultos.split('|') : [];
    if (!lista.includes(clave)) lista.push(clave);
    while (lista.length > 200) lista.shift();
    this.config.AvisosOcultos = lista.join('|');
  }
}

/** Movimiento con tarjeta (gasto o crédito en la tarjeta). */
export const esDeTarjeta = (m) => m.TarjetaId !== 0 && (m.Tipo === 'Gasto' || m.Tipo === 'Ingreso');
export const CERO_DEC = CERO;
