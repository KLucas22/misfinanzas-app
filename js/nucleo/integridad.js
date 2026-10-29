// ============================================================================
//  Migración y verificación de datos (igual que src/Nucleo/Integridad.vb):
//  Id repetidos, resúmenes duplicados, registros automáticos dobles, referencias rotas.
// ============================================================================

import { D } from './decimal.js';
import { F } from './fecha.js';
import { Fmt } from './formato.js';
import { nuevo, clonar, VERSION_ACTUAL, ENUMS } from './modelo.js';
import { asegurar as asegurarCategoria } from './categorias.js';

export function preparar(l) {
  const hechos = [];
  if (l.config.VersionDatos < VERSION_ACTUAL) {
    hechos.push('Se actualizaron tus datos de la versión ' + l.config.VersionDatos + ' a la ' + VERSION_ACTUAL + ' (todo lo que tenías se conserva).');
    l.config.VersionDatos = VERSION_ACTUAL;
  }
  if (l.tableros.length === 0) {
    crearTableroInicial(l);
    hechos.push('Se creó el tablero «Personal» con las listas Por hacer, En curso y Hecho.');
  }
  return hechos;
}

export function crearTableroInicial(l, nombre = 'Personal') {
  const t = nuevo('Tablero', { Id: l.nuevoId(), Nombre: nombre, Orden: l.tableros.length, ColorArgb: -16411031 });
  l.tableros.push(t);
  l.listas.push(nuevo('Lista', { Id: l.nuevoId(), TableroId: t.Id, Nombre: 'Por hacer', Orden: 0 }));
  l.listas.push(nuevo('Lista', { Id: l.nuevoId(), TableroId: t.Id, Nombre: 'En curso', Orden: 1 }));
  l.listas.push(nuevo('Lista', { Id: l.nuevoId(), TableroId: t.Id, Nombre: 'Hecho', Orden: 2, EsFinal: true }));
  if (l.config.TableroActual === 0) l.config.TableroActual = t.Id;
  return t;
}

export class InformeIntegridad {
  constructor() { this.Reparado = []; this.Advertencias = []; this.PosiblesDuplicados = []; }
  get TodoBien() { return !this.Reparado.length && !this.Advertencias.length && !this.PosiblesDuplicados.length; }
  texto(nl = '\n') {
    if (this.TodoBien) return 'No se encontraron problemas: no hay datos repetidos ni referencias rotas.';
    const partes = [];
    if (this.Reparado.length) partes.push('Corregido automáticamente:' + nl + this.Reparado.map((x) => '  • ' + x).join(nl));
    if (this.Advertencias.length) partes.push('Para revisar:' + nl + this.Advertencias.map((x) => '  • ' + x).join(nl));
    if (this.PosiblesDuplicados.length) {
      const lineas = this.PosiblesDuplicados.slice(0, 12).map((g) => '  • ' + Fmt.fecha(g[0].Fecha) + '  ' + g[0].Descripcion + '  ' + Fmt.monto(g[0].Monto, g[0].Moneda) + '  (' + g.length + ' veces)');
      partes.push('Movimientos que parecen cargados más de una vez (revisalos; si son correctos, dejalos):' + nl + lineas.join(nl));
    }
    return partes.join(nl + nl);
  }
}

function fijo2(d) {
  const r = D(d).redondear(2, 'lejos');
  let [e, f = ''] = r.abs().toString().split('.');
  f = (f + '00').slice(0, 2);
  return (r.signo < 0 ? '-' : '') + e + '.' + f;
}

function mapear(mapa, id) {
  if (id === 0 || !mapa) return id;
  return mapa.has(id) ? mapa.get(id) : -id;   // sin equivalente: nunca coincide con un Id real
}

/** Huella de un movimiento para detectar repetidos (no incluye categoría ni nota). */
export function huella(m, mapaCuenta = null, mapaTarjeta = null, mapaFijo = null) {
  return [F.iso(m.Fecha), ENUMS.TipoMov.indexOf(m.Tipo), fijo2(m.Monto), ENUMS.Moneda.indexOf(m.Moneda), mapear(mapaCuenta, m.CuentaId),
    mapear(mapaTarjeta, m.TarjetaId), mapear(mapaCuenta, m.CuentaDestinoId), fijo2(m.MontoDestino), fijo2(m.MontoCuenta), m.Cuotas,
    m.PeriodoForzado, m.PeriodoResumen, mapear(mapaFijo, m.RecurrenteId), m.PeriodoRecurrente, Fmt.normalizar(m.Descripcion)].join('|');
}

/** Clave de ocurrencia única: un fijo una vez por período y un débito automático una vez por resumen y moneda. */
export function claveUnica(m, mapaTarjeta = null, mapaFijo = null) {
  if (m.RecurrenteId !== 0 && m.PeriodoRecurrente !== 0 && (m.Tipo === 'Gasto' || m.Tipo === 'Ingreso')) return 'REC|' + mapear(mapaFijo, m.RecurrenteId) + '|' + m.PeriodoRecurrente;
  if (m.Tipo === 'PagoTarjeta' && m.Auto && m.PeriodoResumen !== 0) return 'DEB|' + mapear(mapaTarjeta, m.TarjetaId) + '|' + m.PeriodoResumen + '|' + ENUMS.Moneda.indexOf(m.Moneda);
  return '';
}

function agrupar(lista, clave) {
  const mapa = new Map();
  for (const x of lista) {
    const k = clave(x);
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(x);
  }
  return [...mapa.values()];
}

function renumerarRepetidos(l, lista, nombre, inf, reparar) {
  const vistos = new Set();
  let repetidos = 0;
  for (const x of lista) {
    if (x.Id <= 0 || vistos.has(x.Id)) {
      repetidos++;
      if (reparar) { const nuevoId = l.nuevoId(); x.Id = nuevoId; vistos.add(nuevoId); }
    } else vistos.add(x.Id);
  }
  if (repetidos > 0) inf.Reparado.push('Había ' + Fmt.plural(repetidos, 'Id repetido', 'Id repetidos') + ' en ' + nombre + ': se renumeraron.');
}

function avisarRepetidos(ids, nombre, inf) {
  if (agrupar(ids, (x) => x).some((g) => g.length > 1)) inf.Advertencias.push('Hay ' + nombre + ' con el mismo Id interno: revisalas en la app.');
}

/** Revisa la base. Con reparar=true corrige lo que se puede corregir sin perder datos. */
export function verificar(l, reparar = true) {
  const inf = new InformeIntegridad();
  renumerarRepetidos(l, l.movimientos, 'movimientos', inf, reparar);
  renumerarRepetidos(l, l.tareas, 'tarjetas del tablero', inf, reparar);
  renumerarRepetidos(l, l.examenes, 'exámenes', inf, reparar);
  renumerarRepetidos(l, l.sesiones, 'sesiones de estudio', inf, reparar);
  renumerarRepetidos(l, l.repasos, 'tarjetas de repaso', inf, reparar);
  renumerarRepetidos(l, l.metas, 'metas', inf, reparar);
  avisarRepetidos(l.cuentas.map((x) => x.Id), 'cuentas', inf);
  avisarRepetidos(l.tarjetas.map((x) => x.Id), 'tarjetas de crédito', inf);
  avisarRepetidos(l.recurrentes.map((x) => x.Id), 'fijos', inf);
  avisarRepetidos(l.materias.map((x) => x.Id), 'materias', inf);
  avisarRepetidos(l.listas.map((x) => x.Id), 'listas del tablero', inf);
  avisarRepetidos(l.tableros.map((x) => x.Id), 'tableros', inf);

  // Contador de Id (ranura 0)
  const maxId = l.maximoIdEn(0);
  if (l.proximoId <= maxId) {
    if (reparar) l.proximoId = maxId + 1;
    inf.Reparado.push('El contador interno de Id estaba atrasado (podía repetir Id).');
  }

  // Datos de resumen duplicados para la misma tarjeta y mes
  for (const lista of agrupar(l.resumenes, (r) => r.TarjetaId + '|' + r.Periodo).filter((g) => g.length > 1)) {
    if (reparar) {
      const primero = lista[0];
      for (const otro of lista.slice(1)) {
        if (primero.Cierre === null) primero.Cierre = otro.Cierre;
        if (primero.Vencimiento === null) primero.Vencimiento = otro.Vencimiento;
        if (primero.TotalRealARS === null) primero.TotalRealARS = otro.TotalRealARS;
        if (primero.TotalRealUSD === null) primero.TotalRealUSD = otro.TotalRealUSD;
        primero.Pagado = primero.Pagado || otro.Pagado;
        primero.DebitoRegistrado = primero.DebitoRegistrado || otro.DebitoRegistrado;
        if (!primero.Nota) primero.Nota = otro.Nota;
        l.resumenes.splice(l.resumenes.indexOf(otro), 1);
      }
    }
    inf.Reparado.push('Había datos repetidos de un mismo resumen (' + Fmt.periodoCorto(lista[0].Periodo) + '): se unificaron.');
  }

  // Categorías con el mismo nombre
  for (const grupo of agrupar(l.categorias, (c) => c.Nombre.trim().toLowerCase()).filter((g) => g.length > 1)) {
    if (reparar) for (const otra of grupo.slice(1)) l.categorias.splice(l.categorias.indexOf(otra), 1);
    inf.Reparado.push('La categoría «' + grupo[0].Nombre + '» estaba repetida.');
  }

  // Registros automáticos dobles
  const vistos = new Set();
  const sobrantes = [];
  for (const m of [...l.movimientos].map((x, i) => [x, i]).sort((a, b) => (a[0].Id - b[0].Id) || (a[1] - b[1])).map((x) => x[0])) {
    const k = claveUnica(m);
    if (!k) continue;
    if (vistos.has(k)) { if (m.Auto) sobrantes.push(m); } else vistos.add(k);
  }
  if (sobrantes.length) {
    if (reparar) for (const m of sobrantes) l.movimientos.splice(l.movimientos.indexOf(m), 1);
    inf.Reparado.push(Fmt.plural(sobrantes.length, 'registro automático repetido', 'registros automáticos repetidos') + ' (fijos o débitos registrados dos veces).');
  }

  // Referencias rotas en finanzas
  const idsCuentas = new Set(l.cuentas.map((x) => x.Id));
  const idsTarjetas = new Set(l.tarjetas.map((x) => x.Id));
  const rotos = l.movimientos.filter((m) => (m.CuentaId !== 0 && !idsCuentas.has(m.CuentaId)) || (m.TarjetaId !== 0 && !idsTarjetas.has(m.TarjetaId)) ||
    (m.CuentaDestinoId !== 0 && !idsCuentas.has(m.CuentaDestinoId))).length;
  if (rotos > 0) inf.Advertencias.push(Fmt.plural(rotos, 'movimiento apunta', 'movimientos apuntan') + ' a una cuenta o tarjeta que ya no existe.');
  const fijosRotos = l.recurrentes.filter((r) => (r.CuentaId !== 0 && !idsCuentas.has(r.CuentaId)) || (r.TarjetaId !== 0 && !idsTarjetas.has(r.TarjetaId))).length;
  if (fijosRotos > 0) inf.Advertencias.push(Fmt.plural(fijosRotos, 'fijo apunta', 'fijos apuntan') + ' a una cuenta o tarjeta que ya no existe.');

  // Tablero: listas y tarjetas sin tablero/lista
  if (l.tableros.length > 0) {
    const idsTab = new Set(l.tableros.map((x) => x.Id));
    const primerTablero = [...l.tableros].map((x, i) => [x, i]).sort((a, b) => (a[0].Orden - b[0].Orden) || (a[1] - b[1]))[0][0];
    const huerfanas = l.listas.filter((x) => !idsTab.has(x.TableroId));
    if (huerfanas.length) {
      if (reparar) for (const x of huerfanas) x.TableroId = primerTablero.Id;
      inf.Reparado.push(Fmt.plural(huerfanas.length, 'lista sin tablero se movió', 'listas sin tablero se movieron') + ' a «' + primerTablero.Nombre + '».');
    }
    const idsListas = new Set(l.listas.map((x) => x.Id));
    const sueltas = l.tareas.filter((x) => !idsListas.has(x.ListaId));
    if (sueltas.length) {
      if (reparar) {
        for (const x of sueltas) {
          let destino = l.listasDe(idsTab.has(x.TableroId) ? x.TableroId : primerTablero.Id)[0] || null;
          if (!destino) destino = l.listasDe(primerTablero.Id)[0] || null;
          if (destino) { x.ListaId = destino.Id; x.TableroId = destino.TableroId; }
        }
      }
      inf.Reparado.push(Fmt.plural(sueltas.length, 'tarjeta sin lista se ubicó', 'tarjetas sin lista se ubicaron') + ' en la primera lista.');
    }
    for (const x of l.tareas) {
      const li = l.lista(x.ListaId);
      if (li && li.TableroId !== x.TableroId && reparar) x.TableroId = li.TableroId;
    }
  }

  // Estudio: referencias a materias borradas
  const idsMat = new Set(l.materias.map((x) => x.Id));
  const rotasMat = (lista) => lista.filter((x) => x.MateriaId !== 0 && !idsMat.has(x.MateriaId));
  const sinMateria = rotasMat(l.examenes).length + rotasMat(l.sesiones).length + rotasMat(l.repasos).length;
  if (sinMateria > 0) {
    if (reparar) for (const lista of [l.examenes, l.sesiones, l.repasos]) for (const x of rotasMat(lista)) x.MateriaId = 0;
    inf.Reparado.push(Fmt.plural(sinMateria, 'registro de estudio quedó', 'registros de estudio quedaron') + ' «sin materia» (la materia ya no existía).');
  }

  // Movimientos cargados a mano que parecen repetidos (sólo aviso)
  for (const grupo of agrupar(l.movimientos.filter((m) => !m.Auto && m.Tipo !== 'Ajuste'), huella).filter((g) => g.length > 1)) {
    inf.PosiblesDuplicados.push([...grupo].sort((a, b) => a.Id - b.Id));
  }
  return inf;
}

// ============================================================================ Combinar sin duplicar

export class InformeCombinacion {
  constructor() {
    this.Cuentas = 0; this.Tarjetas = 0; this.Categorias = 0; this.Fijos = 0; this.Movimientos = 0; this.MovimientosRepetidos = 0;
    this.Resumenes = 0; this.Cierres = 0; this.Tareas = 0; this.TareasRepetidas = 0; this.Materias = 0; this.Examenes = 0;
    this.Sesiones = 0; this.Repasos = 0; this.Metas = 0;
  }
  get TotalAgregado() {
    return this.Cuentas + this.Tarjetas + this.Categorias + this.Fijos + this.Movimientos + this.Resumenes + this.Cierres + this.Tareas +
      this.Materias + this.Examenes + this.Sesiones + this.Repasos + this.Metas;
  }
  texto() {
    const partes = [];
    const agregar = (n, sing, plur) => { if (n > 0) partes.push(Fmt.plural(n, sing, plur)); };
    agregar(this.Movimientos, 'movimiento', 'movimientos');
    agregar(this.Fijos, 'fijo', 'fijos');
    agregar(this.Cuentas, 'cuenta', 'cuentas');
    agregar(this.Tarjetas, 'tarjeta de crédito', 'tarjetas de crédito');
    agregar(this.Categorias, 'categoría', 'categorías');
    agregar(this.Resumenes, 'dato de resumen', 'datos de resumen');
    agregar(this.Cierres, 'mes cerrado', 'meses cerrados');
    agregar(this.Tareas, 'tarjeta del tablero', 'tarjetas del tablero');
    agregar(this.Materias, 'materia', 'materias');
    agregar(this.Examenes, 'examen', 'exámenes');
    agregar(this.Sesiones, 'sesión de estudio', 'sesiones de estudio');
    agregar(this.Repasos, 'tarjeta de repaso', 'tarjetas de repaso');
    agregar(this.Metas, 'meta', 'metas');
    let s = partes.length === 0 ? 'No hay nada nuevo para agregar' : 'Se agregan ' + partes.join(', ');
    const rep = this.MovimientosRepetidos + this.TareasRepetidas;
    if (rep > 0) s += '. ' + Fmt.plural(rep, 'registro ya estaba', 'registros ya estaban') + ' y no se duplica' + (rep === 1 ? '' : 'n');
    return s + '.';
  }
}

const mismoNombre = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
const mapearO0 = (mapa, id) => (id === 0 ? 0 : (mapa.has(id) ? mapa.get(id) : 0));

/**
 * Combina "origen" dentro de "destino" SIN duplicar (igual que Combinador.Combinar de la PC): cuentas, tarjetas y fijos
 * por nombre; movimientos por su huella; fijos y débitos automáticos por su ocurrencia. Lo que ya existe no se toca.
 */
export function combinar(destino, origen) {
  const inf = new InformeCombinacion();
  const mapaCuenta = new Map();
  for (const c of origen.cuentas) {
    const igual = destino.cuentas.find((x) => mismoNombre(x.Nombre, c.Nombre) && x.Moneda === c.Moneda);
    if (!igual) {
      const nueva = clonar(c);
      nueva.Id = destino.nuevoId();
      destino.cuentas.push(nueva);
      mapaCuenta.set(c.Id, nueva.Id);
      inf.Cuentas++;
    } else mapaCuenta.set(c.Id, igual.Id);
  }
  const mapaTarjeta = new Map();
  for (const t of origen.tarjetas) {
    const igual = destino.tarjetas.find((x) => mismoNombre(x.Nombre, t.Nombre));
    if (!igual) {
      const nueva = clonar(t);
      nueva.Id = destino.nuevoId();
      nueva.CuentaPagoId = mapearO0(mapaCuenta, t.CuentaPagoId);
      destino.tarjetas.push(nueva);
      mapaTarjeta.set(t.Id, nueva.Id);
      inf.Tarjetas++;
    } else mapaTarjeta.set(t.Id, igual.Id);
  }
  for (const c of origen.categorias) {
    if (!destino.categoria(c.Nombre)) { destino.categorias.push(clonar(c)); inf.Categorias++; }
  }
  const mapaFijo = new Map();
  for (const r of origen.recurrentes) {
    const cta = mapearO0(mapaCuenta, r.CuentaId);
    const tar = mapearO0(mapaTarjeta, r.TarjetaId);
    const igual = destino.recurrentes.find((x) => Fmt.normalizar(x.Descripcion) === Fmt.normalizar(r.Descripcion) && x.Tipo === r.Tipo &&
      x.Moneda === r.Moneda && x.CuentaId === cta && x.TarjetaId === tar);
    if (!igual) {
      const n = clonar(r);
      n.Id = destino.nuevoId();
      n.CuentaId = cta;
      n.TarjetaId = tar;
      destino.recurrentes.push(n);
      mapaFijo.set(r.Id, n.Id);
      inf.Fijos++;
    } else mapaFijo.set(r.Id, igual.Id);
  }
  for (const ri of origen.resumenes) {
    const tar = mapearO0(mapaTarjeta, ri.TarjetaId);
    if (tar === 0) continue;
    const igual = destino.resumenes.find((x) => x.TarjetaId === tar && x.Periodo === ri.Periodo);
    if (!igual) {
      const n = clonar(ri);
      n.TarjetaId = tar;
      destino.resumenes.push(n);
      inf.Resumenes++;
    } else {
      if (igual.Cierre === null) igual.Cierre = ri.Cierre;
      if (igual.Vencimiento === null) igual.Vencimiento = ri.Vencimiento;
      if (igual.TotalRealARS === null) igual.TotalRealARS = ri.TotalRealARS;
      if (igual.TotalRealUSD === null) igual.TotalRealUSD = ri.TotalRealUSD;
      igual.Pagado = igual.Pagado || ri.Pagado;
      igual.DebitoRegistrado = igual.DebitoRegistrado || ri.DebitoRegistrado;
      if (!igual.Nota) igual.Nota = ri.Nota;
    }
  }
  // Movimientos: por huella (multiconjunto) y por ocurrencia única
  const cuenta = new Map();
  const unicas = new Set();
  for (const m of destino.movimientos) {
    const h = huella(m);
    cuenta.set(h, (cuenta.get(h) || 0) + 1);
    const u = claveUnica(m);
    if (u.length) unicas.add(u);
  }
  const ordenados = origen.movimientos.map((x, i) => [x, i]).sort((a, b) => (a[0].Fecha - b[0].Fecha) || (a[0].Id - b[0].Id) || (a[1] - b[1])).map((x) => x[0]);
  for (const m of ordenados) {
    const h = huella(m, mapaCuenta, mapaTarjeta, mapaFijo);
    const u = claveUnica(m, mapaTarjeta, mapaFijo);
    const n = cuenta.get(h) || 0;
    if (n > 0) { cuenta.set(h, n - 1); inf.MovimientosRepetidos++; continue; }
    if (u.length && unicas.has(u)) { inf.MovimientosRepetidos++; continue; }
    const nm = clonar(m);
    nm.Id = destino.nuevoId();
    nm.CuentaId = mapearO0(mapaCuenta, m.CuentaId);
    nm.TarjetaId = mapearO0(mapaTarjeta, m.TarjetaId);
    nm.CuentaDestinoId = mapearO0(mapaCuenta, m.CuentaDestinoId);
    nm.RecurrenteId = mapearO0(mapaFijo, m.RecurrenteId);
    if (!destino.categoria(nm.Categoria) && nm.Categoria && (nm.Tipo === 'Gasto' || nm.Tipo === 'Ingreso')) {
      asegurarCategoria(destino, nm.Categoria, nm.Tipo === 'Ingreso');
    }
    destino.movimientos.push(nm);
    if (u.length) unicas.add(u);
    inf.Movimientos++;
  }
  for (const c of origen.cierres) {
    if (!destino.cierres.some((x) => x.Periodo === c.Periodo)) { destino.cierres.push(clonar(c)); inf.Cierres++; }
  }
  // Organización
  const mapaTablero = new Map();
  for (const t of origen.tableros) {
    const igual = destino.tableros.find((x) => mismoNombre(x.Nombre, t.Nombre));
    if (!igual) {
      const n = clonar(t);
      n.Id = destino.nuevoId();
      n.Orden = destino.tableros.length;
      destino.tableros.push(n);
      mapaTablero.set(t.Id, n.Id);
    } else mapaTablero.set(t.Id, igual.Id);
  }
  const mapaLista = new Map();
  for (const li of origen.listas) {
    const tab = mapearO0(mapaTablero, li.TableroId);
    if (tab === 0) continue;
    const igual = destino.listas.find((x) => x.TableroId === tab && mismoNombre(x.Nombre, li.Nombre));
    if (!igual) {
      const n = clonar(li);
      n.Id = destino.nuevoId();
      n.TableroId = tab;
      destino.listas.push(n);
      mapaLista.set(li.Id, n.Id);
    } else mapaLista.set(li.Id, igual.Id);
  }
  const mapaMateria = new Map();
  for (const ma of origen.materias) {
    const igual = destino.materias.find((x) => mismoNombre(x.Nombre, ma.Nombre));
    if (!igual) {
      const n = clonar(ma);
      n.Id = destino.nuevoId();
      destino.materias.push(n);
      mapaMateria.set(ma.Id, n.Id);
      inf.Materias++;
    } else mapaMateria.set(ma.Id, igual.Id);
  }
  for (const ta of origen.tareas) {
    const lista = mapearO0(mapaLista, ta.ListaId);
    if (lista === 0) continue;
    const tab = destino.lista(lista).TableroId;
    const existe = destino.tareas.some((x) => x.TableroId === tab && Fmt.normalizar(x.Titulo) === Fmt.normalizar(ta.Titulo) && x.Fecha === ta.Fecha);
    if (existe) { inf.TareasRepetidas++; continue; }
    const n = clonar(ta);
    n.Id = destino.nuevoId();
    n.ListaId = lista;
    n.TableroId = tab;
    n.MateriaId = mapearO0(mapaMateria, ta.MateriaId);
    destino.tareas.push(n);
    inf.Tareas++;
  }
  for (const ex of origen.examenes) {
    const mat = mapearO0(mapaMateria, ex.MateriaId);
    if (destino.examenes.some((x) => x.MateriaId === mat && x.Tipo === ex.Tipo && Math.floor(x.Fecha) === Math.floor(ex.Fecha))) continue;
    const n = clonar(ex);
    n.Id = destino.nuevoId();
    n.MateriaId = mat;
    destino.examenes.push(n);
    inf.Examenes++;
  }
  for (const se of origen.sesiones) {
    const mat = mapearO0(mapaMateria, se.MateriaId);
    if (destino.sesiones.some((x) => x.MateriaId === mat && x.Inicio === se.Inicio && x.Minutos === se.Minutos)) continue;
    const n = clonar(se);
    n.Id = destino.nuevoId();
    n.MateriaId = mat;
    destino.sesiones.push(n);
    inf.Sesiones++;
  }
  for (const rp of origen.repasos) {
    const mat = mapearO0(mapaMateria, rp.MateriaId);
    if (destino.repasos.some((x) => x.MateriaId === mat && Fmt.normalizar(x.Frente) === Fmt.normalizar(rp.Frente))) continue;
    const n = clonar(rp);
    n.Id = destino.nuevoId();
    n.MateriaId = mat;
    destino.repasos.push(n);
    inf.Repasos++;
  }
  for (const me of origen.metas) {
    if (destino.metas.some((x) => mismoNombre(x.Nombre, me.Nombre))) continue;
    const n = clonar(me);
    n.Id = destino.nuevoId();
    destino.metas.push(n);
    inf.Metas++;
  }
  for (const d of origen.mercado) {
    const actual = destino.dato(d.Clave);
    if (!actual) destino.mercado.push(clonar(d));
    else if (d.Obtenido > actual.Obtenido) {
      actual.Valor = d.Valor; actual.Texto = d.Texto; actual.Fecha = d.Fecha; actual.Obtenido = d.Obtenido; actual.Fuente = d.Fuente;
    }
  }
  if (destino.proximoId <= destino.maximoIdEn(0)) destino.proximoId = destino.maximoIdEn(0) + 1;
  return inf;
}
