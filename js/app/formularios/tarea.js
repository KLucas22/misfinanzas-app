// ============================================================================
//  Tareas del tablero y del calendario (igual que DlgTarea de la PC), con
//  repetición diaria, semanal, mensual o anual.
// ============================================================================

import { h, icono, abrirHoja, campo, entrada, entradaFecha, selector, interruptor, grupo, toast, confirmar, colorCss } from '../ui.js';
import { E, hoy, guardar, deshacer } from '../estado.js';
import { F } from '../../nucleo/fecha.js';
import { Fmt } from '../../nucleo/formato.js';
import { COLORES_ETIQUETA, nuevaTarea, mover, marcarHecha, checklist, checklistATexto, primeraLista, textoRepeticion } from '../../nucleo/organizacion.js';
import { crearTableroInicial } from '../../nucleo/integridad.js';

const REPETICIONES = [['Nunca', 'No se repite'], ['Diaria', 'Todos los días'], ['Semanal', 'Todas las semanas'], ['Mensual', 'Todos los meses'], ['Anual', 'Todos los años']];

/** Normaliza "9", "9:5", "9.30", "18:30" → "HH:mm" (o null si no es válida). */
export function normalizarHora(s) {
  const t = (s || '').trim();
  if (!t) return '';
  const m = /^(\d{1,2})(?:[:.](\d{1,2}))?$/.exec(t);
  if (!m) return null;
  const hh = Number(m[1]), mm = m[2] !== undefined ? Number(m[2]) : 0;
  if (hh > 23 || mm > 59) return null;
  return F.dos(hh) + ':' + F.dos(mm);
}

/** o: { lista, fecha, aviso } */
export function abrirTarea(t = null, o = {}) {
  const l = E.libro;
  if (!l.tableros.length) crearTableroInicial(l);
  const tableros = [...l.tableros].filter((x) => !x.Archivado || (t && x.Id === t.TableroId)).sort((a, b) => a.Orden - b.Orden);
  const tableroInicial = t ? t.TableroId : (o.lista ? o.lista.TableroId : (l.tablero(l.config.TableroActual) ? l.config.TableroActual : tableros[0].Id));
  const inTitulo = entrada(t ? t.Titulo : '', { placeholder: 'Qué hay que hacer' });
  const inDesc = h('textarea', { rows: 3, placeholder: 'Detalles (opcional)' }, t ? t.Descripcion : '');
  const selTablero = selector(tableros.map((x) => [x.Id, x.Nombre]), tableroInicial);
  const selLista = h('select');
  const llenarListas = (sel) => {
    selLista.innerHTML = '';
    for (const li of l.listasDe(Number(selTablero.value))) selLista.appendChild(h('option', { value: String(li.Id) }, li.Nombre + (li.EsFinal ? ' ✓' : '')));
    if (sel && [...selLista.options].some((x) => x.value === String(sel))) selLista.value = String(sel);
  };
  selTablero.addEventListener('change', () => llenarListas(0));
  llenarListas(t ? t.ListaId : (o.lista ? o.lista.Id : (primeraLista(l, tableroInicial) || {}).Id));

  const conFecha = t ? t.Fecha !== null : o.fecha !== undefined && o.fecha !== null;
  const swFecha = interruptor(conFecha, () => mostrarFecha());
  const inFecha = entradaFecha(t && t.Fecha !== null ? t.Fecha : (o.fecha ?? hoy()));
  const inHora = h('input', { type: 'time', value: t ? t.Hora : '' });
  const selRepetir = selector(REPETICIONES, t ? t.Repetir : 'Nunca');
  const ayudaRep = h('p', { class: 'ayuda' });
  const filaFecha = campo('Fecha', inFecha), filaHora = campo('Hora', inHora), filaRep = campo('Repetir', selRepetir);
  const actualizarAyuda = () => {
    const r = selRepetir.value;
    const f = inFecha.leer();
    if (r === 'Nunca' || f === null) { ayudaRep.textContent = 'Las tareas con fecha aparecen también en el calendario.'; return; }
    let txt = 'Se repite ' + textoRepeticion(r);
    if (r === 'Semanal') txt += ' (los ' + Fmt.DIAS[F.diaSemana(f)] + ')';
    if (r === 'Mensual') txt += ' (el ' + F.dia(f) + ')';
    if (r === 'Anual') txt += ' (cada ' + F.dia(f) + ' de ' + Fmt.nombreMes(F.mes(f)) + ')';
    ayudaRep.textContent = txt + '. El calendario la marca en cada repetición; al completarla, pasa a la fecha siguiente.';
  };
  function mostrarFecha() {
    const on = swFecha.input.checked;
    for (const x of [filaFecha, filaHora, filaRep]) x.classList.toggle('oculto', !on);
    if (!on) selRepetir.value = 'Nunca';
    actualizarAyuda();
  }
  selRepetir.addEventListener('change', actualizarAyuda);
  inFecha.addEventListener('change', actualizarAyuda);

  const inEtiqueta = entrada(t ? t.Etiqueta : '', { placeholder: 'Trabajo, Facu, Casa…' });
  let color = t ? t.ColorArgb : 0;
  const colores = h('div', { class: 'colores' });
  const pintar = () => {
    colores.innerHTML = '';
    colores.appendChild(h('button', { type: 'button', class: 'ninguno' + (color === 0 ? ' activo' : ''), style: { '--c': 'var(--borde-fuerte)' }, 'aria-label': 'Sin color', onClick: () => { color = 0; pintar(); } }, icono('cerrar')));
    for (const c of COLORES_ETIQUETA) colores.appendChild(h('button', { type: 'button', class: c === color ? 'activo' : '', style: { '--c': colorCss(c) }, 'aria-label': 'Color', onClick: () => { color = c; pintar(); } }));
  };
  pintar();
  const selPrioridad = selector([[0, 'Normal'], [1, 'Alta'], [2, 'Urgente']], t ? Math.max(0, Math.min(2, t.Prioridad)) : 0);
  const selMateria = selector([[0, '(ninguna)'], ...[...l.materias].sort((a, b) => a.Nombre.localeCompare(b.Nombre, 'es')).map((x) => [x.Id, x.Nombre])], t ? t.MateriaId : 0);

  // Lista de control
  const items = t ? checklist(t).map((x) => ({ ...x })) : [];
  const zonaCheck = h('div');
  const inItem = entrada('', { placeholder: 'Agregar ítem', enterkeyhint: 'done' });
  const pintarCheck = () => {
    zonaCheck.innerHTML = '';
    items.forEach((it, i) => {
      const chk = h('input', { type: 'checkbox', checked: it.Hecho, style: { width: '22px', height: '22px', accentColor: 'var(--acento)', flex: 'none' } });
      chk.addEventListener('change', () => { it.Hecho = chk.checked; });
      zonaCheck.appendChild(h('div', { class: 'campo' }, chk, h('span', { style: { flex: 1, textDecoration: it.Hecho ? 'line-through' : 'none' } }, it.Texto),
        h('button', { class: 'boton-icono', type: 'button', 'aria-label': 'Quitar', style: { margin: 0, color: 'var(--tinta-tenue)' }, onClick: () => { items.splice(i, 1); pintarCheck(); } }, icono('cerrar'))));
    });
  };
  const agregarItem = () => { const s = inItem.value.trim(); if (!s) return; items.push({ Hecho: false, Texto: s }); inItem.value = ''; pintarCheck(); };
  inItem.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); agregarItem(); } });
  pintarCheck();

  const pie = h('div', { class: 'botonera', style: { flexWrap: 'wrap' } });
  const contenido = h('div', { class: 'form' },
    grupo(campo('Título', inTitulo), h('div', { class: 'campo vertical' }, h('label', null, 'Descripción'), inDesc)),
    h('div', { class: 'bloque' }, grupo(campo('Tablero', selTablero), campo('Lista', selLista))),
    h('div', { class: 'bloque' }, grupo(campo('Con fecha', swFecha), filaFecha, filaHora, filaRep), ayudaRep),
    h('div', { class: 'bloque' }, grupo(campo('Etiqueta', inEtiqueta), colores, campo('Prioridad', selPrioridad), l.materias.length ? campo('Materia', selMateria) : null)),
    h('div', { class: 'bloque' }, h('div', { class: 'etiqueta-bloque' }, 'Lista de control'), grupo(zonaCheck, h('div', { class: 'campo' }, inItem,
      h('button', { class: 'boton chico suave', type: 'button', onClick: agregarItem }, 'Agregar')))),
    pie);
  mostrarFecha();

  const hoja = abrirHoja({
    titulo: t ? 'Editar tarea' : 'Nueva tarea', contenido, textoConfirmar: 'Guardar',
    alConfirmar: async () => {
      const titulo = inTitulo.value.trim();
      if (!titulo) { toast('Escribí un título.', { error: true }); return false; }
      const lista = l.lista(Number(selLista.value));
      if (!lista) { toast('Elegí una lista.', { error: true }); return false; }
      let hora = '';
      if (swFecha.input.checked) {
        hora = normalizarHora(inHora.value);
        if (hora === null) { toast('La hora tiene que ser como 9:00 o 18:30.', { error: true }); return false; }
      }
      const fecha = swFecha.input.checked ? inFecha.leer() : null;
      if (swFecha.input.checked && fecha === null) { toast('Elegí la fecha.', { error: true }); return false; }
      const fechaAntes = t ? t.Fecha : null;
      const repetirAntes = t ? t.Repetir : 'Nunca';
      const x = t || nuevaTarea(l, lista, titulo, null, hoy());
      x.Titulo = titulo;
      x.Descripcion = inDesc.value.trim();
      x.Fecha = fecha;
      x.Hora = swFecha.input.checked ? hora : '';
      x.Repetir = swFecha.input.checked ? selRepetir.value : 'Nunca';
      if (x.Fecha !== null && (x.Repetir === 'Mensual' || x.Repetir === 'Anual')) {
        // El día de la serie se toma de la fecha elegida (si no se tocó la fecha, se conserva: una del 31 sigue siendo del 31)
        if (fechaAntes !== x.Fecha || repetirAntes !== x.Repetir || x.DiaRepeticion === 0) x.DiaRepeticion = F.dia(x.Fecha);
      } else x.DiaRepeticion = 0;
      x.Etiqueta = inEtiqueta.value.trim();
      x.ColorArgb = color;
      x.Prioridad = Number(selPrioridad.value);
      x.MateriaId = Number(selMateria.value) || 0;
      x.Checklist = checklistATexto(items);
      if (x.ListaId !== lista.Id) mover(l, x, lista, Number.MAX_SAFE_INTEGER, hoy());
      l.config.TableroActual = x.TableroId;
      await guardar();
      toast(t ? 'Tarea guardada' : 'Tarea agregada' + (x.Repetir !== 'Nunca' ? ' (se repite ' + textoRepeticion(x.Repetir) + ')' : ''));
      return true;
    },
  });

  if (t) {
    pie.append(
      h('button', { class: 'boton suave', type: 'button', onClick: async () => {
        const nueva = marcarHecha(l, t, !t.Hecha, hoy());
        await guardar();
        hoja.cerrar();
        toast(t.Hecha ? (nueva ? 'Hecha. La próxima es el ' + Fmt.fechaDia(nueva.Fecha) : 'Tarea hecha') : 'Tarea reabierta', { accion: 'Deshacer', alAccionar: () => deshacer() });
      } }, icono('check'), t.Hecha ? 'Reabrir' : 'Marcar hecha'),
      h('button', { class: 'boton secundario', type: 'button', onClick: async () => {
        t.Archivada = !t.Archivada;
        await guardar();
        hoja.cerrar();
        toast(t.Archivada ? 'Tarea archivada' : 'Tarea desarchivada', { accion: 'Deshacer', alAccionar: () => deshacer() });
      } }, t.Archivada ? 'Desarchivar' : 'Archivar'),
      h('button', { class: 'boton peligro', type: 'button', onClick: async () => {
        if (!(await confirmar('¿Borrar la tarea «' + t.Titulo + '»?', { si: 'Borrar', peligro: true }))) return;
        l.tareas.splice(l.tareas.indexOf(t), 1);
        await guardar();
        hoja.cerrar();
        toast('Tarea borrada', { accion: 'Deshacer', alAccionar: () => deshacer() });
      } }, icono('borrar'), 'Borrar'));
    if (o.aviso) contenido.insertBefore(h('div', { class: 'info-form', style: { marginTop: 0, marginBottom: '12px' } }, o.aviso), contenido.firstChild);
  } else {
    try { inTitulo.focus({ preventScroll: true }); } catch { inTitulo.focus(); }
  }
  return hoja;
}
