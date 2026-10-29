// ============================================================================
//  Formularios de estudio (como DlgEstudio de la PC): materias, exámenes y
//  entregas, horas estudiadas, tarjetas de repaso y la sesión de repaso.
// ============================================================================

import { h, icono, abrirHoja, campo, entrada, entradaFecha, selector, interruptor, grupo, toast, confirmar, preguntar, colorCss } from '../ui.js';
import { E, hoy, guardar, deshacer } from '../estado.js';
import { D } from '../../nucleo/decimal.js';
import { F } from '../../nucleo/fecha.js';
import { Fmt } from '../../nucleo/formato.js';
import { nuevo, ENUMS } from '../../nucleo/modelo.js';
import { nombreTipoExamen, nombreEstado, nombreRepaso, colorRepaso, horasSugeridas, responder, importarTarjetas } from '../../nucleo/estudio.js';
import { normalizarHora } from './tarea.js';

/** Colores de materia (los mismos que ofrece la PC). */
export const PALETA_MATERIAS = [0xFF7C3AED, 0xFF2563EB, 0xFF059669, 0xFFDB2777, 0xFFD97706, 0xFF0891B2, 0xFFDC2626, 0xFF4F46E5].map((x) => x | 0);

const ordenEstado = (e) => (e === 'Cursando' ? 0 : 1);

/** Opciones de materia para un selector (las que cursás primero). */
export function opcionesMaterias(conNinguna = true, soloActivas = false) {
  const l = E.libro;
  let lista = [...l.materias];
  if (soloActivas) lista = lista.filter((m) => m.Estado === 'Cursando' || m.Estado === 'Regular' || m.Estado === 'Pendiente');
  lista.sort((a, b) => (ordenEstado(a.Estado) - ordenEstado(b.Estado)) || a.Nombre.localeCompare(b.Nombre, 'es'));
  const ops = lista.map((m) => [m.Id, m.Nombre]);
  return conNinguna ? [[0, '(sin materia)'], ...ops] : ops;
}

/** Número con decimales (nota, horas). */
function entradaNumero(valor, { min = 0, max = 100 } = {}) {
  const el = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', value: valor === null || valor === undefined ? '' : Fmt.num(valor, 2).replace(/,00$/, '').replace(/(,\d)0$/, '$1') });
  el.leer = () => {
    const v = Fmt.parseMonto(el.value);
    if (v === null) return null;
    if (v.lt(D(min)) || v.gt(D(max))) return null;
    return v;
  };
  return el;
}

function coloresMateria(inicial, alElegir) {
  let color = inicial;
  const cont = h('div', { class: 'colores' });
  const pintar = () => {
    cont.innerHTML = '';
    const paleta = PALETA_MATERIAS.includes(color) || color === 0 ? PALETA_MATERIAS : [color, ...PALETA_MATERIAS];
    for (const c of paleta) cont.appendChild(h('button', { type: 'button', class: c === color ? 'activo' : '', style: { '--c': colorCss(c) }, 'aria-label': 'Color', onClick: () => { color = c; alElegir(c); pintar(); } }));
  };
  pintar();
  return cont;
}

// ------------------------------------------------------------------ Materia
export function abrirMateria(m = null) {
  const l = E.libro;
  const d = hoy();
  const inNombre = entrada(m ? m.Nombre : '', { placeholder: 'Ej.: Auditoría de sistemas' });
  const inCuatri = entrada(m ? m.Cuatrimestre : (F.mes(d) <= 7 ? '1C ' : '2C ') + F.anio(d), { placeholder: '2C 2026' });
  const inComision = entrada(m ? m.Comision : '', { placeholder: 'Opcional' });
  const selEstado = selector(ENUMS.EstadoMateria.map((e) => [e, nombreEstado(e)]), m ? m.Estado : 'Cursando');
  const conNota = m ? m.Nota !== null : false;
  const inNota = entradaNumero(m && m.Nota !== null ? m.Nota : D(7), { min: 1, max: 10 });
  const filaNota = campo('Nota final', inNota);
  const swNota = interruptor(conNota, () => filaNota.classList.toggle('oculto', !swNota.input.checked));
  filaNota.classList.toggle('oculto', !conNota);
  const inHoras = entradaNumero(m ? m.HorasSemana : D(4), { min: 0, max: 60 });
  let color = m && m.ColorArgb !== 0 ? m.ColorArgb : PALETA_MATERIAS[l.materias.length % PALETA_MATERIAS.length];
  const inComentario = h('textarea', { rows: 3, placeholder: 'Profesor, días de cursada, links…' }, m ? m.Comentario : '');

  const pie = h('div', { class: 'botonera' });
  const contenido = h('div', { class: 'form' },
    grupo(campo('Nombre', inNombre), campo('Cuatrimestre', inCuatri), campo('Comisión', inComision)),
    h('div', { class: 'bloque' }, grupo(campo('Estado', selEstado), campo('Tiene nota', swNota), filaNota),
      h('p', { class: 'ayuda' }, 'La nota se usa para el promedio de la carrera.')),
    h('div', { class: 'bloque' }, grupo(campo('Horas por semana', inHoras)),
      h('p', { class: 'ayuda' }, 'Tu objetivo semanal: el pomodoro y las horas que registres se comparan contra eso.')),
    h('div', { class: 'bloque' }, h('div', { class: 'etiqueta-bloque' }, 'Color'), grupo(coloresMateria(color, (c) => { color = c; }))),
    h('div', { class: 'bloque' }, grupo(h('div', { class: 'campo vertical' }, h('label', null, 'Notas'), inComentario))),
    pie);

  const hoja = abrirHoja({
    titulo: m ? 'Editar materia' : 'Nueva materia', contenido, textoConfirmar: 'Guardar',
    alConfirmar: async () => {
      const nombre = inNombre.value.trim();
      if (!nombre) { toast('Escribí el nombre de la materia.', { error: true }); return false; }
      if (l.materias.some((x) => x !== m && x.Nombre.trim().toLowerCase() === nombre.toLowerCase())) { toast('Ya tenés una materia con ese nombre.', { error: true }); return false; }
      let nota = null;
      if (swNota.input.checked) {
        nota = inNota.leer();
        if (nota === null) { toast('La nota tiene que estar entre 1 y 10.', { error: true }); return false; }
      }
      const horas = inHoras.value.trim() === '' ? D(0) : inHoras.leer();
      if (horas === null) { toast('Las horas por semana tienen que estar entre 0 y 60.', { error: true }); return false; }
      const x = m || nuevo('Materia', { Id: l.nuevoId() });
      x.Nombre = nombre;
      x.Cuatrimestre = inCuatri.value.trim();
      x.Comision = inComision.value.trim();
      x.Estado = selEstado.value;
      x.Nota = nota;
      x.HorasSemana = horas;
      x.Comentario = inComentario.value.trim();
      x.ColorArgb = color;
      if (!m) l.materias.push(x);
      await guardar();
      toast(m ? 'Materia guardada' : 'Materia agregada');
      return true;
    },
  });

  if (m) {
    pie.append(h('button', { class: 'boton peligro', type: 'button', onClick: async () => {
      const cant = l.examenes.filter((x) => x.MateriaId === m.Id).length + l.sesiones.filter((x) => x.MateriaId === m.Id).length + l.repasos.filter((x) => x.MateriaId === m.Id).length;
      const op = cant === 0 ? ((await confirmar('¿Borrar la materia «' + m.Nombre + '»?', { si: 'Borrar', peligro: true })) ? 'conservar' : null)
        : await preguntar({ titulo: 'Borrar materia', texto: '«' + m.Nombre + '» tiene ' + Fmt.plural(cant, 'registro', 'registros') + ' (exámenes, horas y tarjetas de repaso).',
          opciones: [{ texto: 'Borrar la materia y conservar sus registros', valor: 'conservar', estilo: 'peligro' }, { texto: 'Borrar todo', valor: 'todo', estilo: 'peligro' }] });
      if (!op) return;
      if (op === 'todo') {
        l.examenes = l.examenes.filter((x) => x.MateriaId !== m.Id);
        l.sesiones = l.sesiones.filter((x) => x.MateriaId !== m.Id);
        l.repasos = l.repasos.filter((x) => x.MateriaId !== m.Id);
      } else {
        for (const lista of [l.examenes, l.sesiones, l.repasos]) for (const x of lista) if (x.MateriaId === m.Id) x.MateriaId = 0;
      }
      for (const t of l.tareas) if (t.MateriaId === m.Id) t.MateriaId = 0;
      l.materias.splice(l.materias.indexOf(m), 1);
      await guardar();
      hoja.cerrar();
      toast('Materia borrada', { accion: 'Deshacer', alAccionar: () => deshacer() });
    } }, icono('borrar'), 'Borrar materia'));
  } else setTimeout(() => inNombre.focus(), 380);
  return hoja;
}

// ------------------------------------------------------------------ Examen o entrega
export function abrirExamen(e = null, { materia = 0, fecha = null } = {}) {
  const l = E.libro;
  const selMateria = selector(opcionesMaterias(), e ? e.MateriaId : materia);
  const selTipo = selector(ENUMS.TipoExamen.map((t) => [t, nombreTipoExamen(t)]), e ? e.Tipo : 'Parcial');
  const inFecha = entradaFecha(e ? e.Fecha : (fecha ?? hoy() + 14));
  const inHora = h('input', { type: 'time', value: e ? e.Hora : '' });
  const inTemas = h('textarea', { rows: 3, placeholder: 'Unidades, bibliografía, qué entra' }, e ? e.Temas : '');
  let horasTocadas = !!e;
  const inHoras = entradaNumero(e ? (e.HorasObjetivo.signo > 0 ? e.HorasObjetivo : horasSugeridas(e.Tipo)) : horasSugeridas('Parcial'), { min: 1, max: 200 });
  inHoras.addEventListener('input', () => { horasTocadas = true; });
  selTipo.addEventListener('change', () => { if (!horasTocadas) inHoras.value = Fmt.num(horasSugeridas(selTipo.value), 0); });
  const inNota = entradaNumero(e && e.Nota !== null ? e.Nota : D(7), { min: 0, max: 10 });
  const filaNota = campo('Nota', inNota);
  const swRendido = interruptor(e ? e.Rendido : false, () => filaNota.classList.toggle('oculto', !swRendido.input.checked));
  filaNota.classList.toggle('oculto', !(e && e.Rendido));

  const pie = h('div', { class: 'botonera' });
  const contenido = h('div', { class: 'form' },
    grupo(campo('Materia', selMateria), campo('Tipo', selTipo)),
    h('div', { class: 'bloque' }, grupo(campo('Fecha', inFecha), campo('Hora', inHora))),
    h('div', { class: 'bloque' }, grupo(h('div', { class: 'campo vertical' }, h('label', null, 'Temas'), inTemas))),
    h('div', { class: 'bloque' }, grupo(campo('Horas objetivo', inHoras)),
      h('p', { class: 'ayuda' }, 'Cuántas horas querés estudiar antes. El plan te dice cuántos minutos por día te faltan.')),
    h('div', { class: 'bloque' }, grupo(campo('Ya lo rendí', swRendido), filaNota)),
    pie);

  const hoja = abrirHoja({
    titulo: e ? 'Editar examen' : 'Nuevo examen o entrega', contenido, textoConfirmar: 'Guardar',
    alConfirmar: async () => {
      const f = inFecha.leer();
      if (f === null) { toast('Elegí la fecha.', { error: true }); return false; }
      const hora = normalizarHora(inHora.value);
      if (hora === null) { toast('La hora tiene que ser como 9:00 o 18:30.', { error: true }); return false; }
      const horas = inHoras.leer();
      if (horas === null) { toast('Las horas objetivo tienen que estar entre 1 y 200.', { error: true }); return false; }
      let nota = null;
      if (swRendido.input.checked) {
        nota = inNota.leer();
        if (nota === null) { toast('La nota tiene que estar entre 0 y 10.', { error: true }); return false; }
      }
      const x = e || nuevo('Examen', { Id: l.nuevoId() });
      x.MateriaId = Number(selMateria.value) || 0;
      x.Tipo = selTipo.value;
      x.Fecha = f;
      x.Hora = hora;
      x.Temas = inTemas.value.trim();
      x.HorasObjetivo = horas;
      x.Rendido = swRendido.input.checked;
      x.Nota = nota;
      if (!e) l.examenes.push(x);
      await guardar();
      toast(e ? 'Examen guardado' : nombreTipoExamen(x.Tipo) + ' agregado: aparece en el calendario y en el plan de estudio');
      return true;
    },
  });
  if (e) {
    pie.append(h('button', { class: 'boton peligro', type: 'button', onClick: async () => {
      if (!(await confirmar('¿Borrar este examen?', { si: 'Borrar', peligro: true }))) return;
      l.examenes.splice(l.examenes.indexOf(e), 1);
      await guardar();
      hoja.cerrar();
      toast('Examen borrado', { accion: 'Deshacer', alAccionar: () => deshacer() });
    } }, icono('borrar'), 'Borrar'));
  }
  return hoja;
}

// ------------------------------------------------------------------ Horas estudiadas (sin pomodoro)
export function abrirSesion(materia = 0) {
  const l = E.libro;
  const ahora = new Date();
  const selMateria = selector(opcionesMaterias(), materia);
  const inFecha = entradaFecha(hoy());
  const inHora = h('input', { type: 'time', value: F.dos(Math.max(0, ahora.getHours() - 1)) + ':00' });
  const selMin = selector([15, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300, 360].map((x) => [x, x < 60 ? x + ' min' : (x % 60 === 0 ? (x / 60) + ' h' : Math.floor(x / 60) + ' h ' + (x % 60) + ' min')]), 60);
  const inComentario = entrada('', { placeholder: 'Opcional' });
  const contenido = h('div', { class: 'form' },
    grupo(campo('Materia', selMateria), campo('Día', inFecha), campo('Desde las', inHora), campo('Duración', selMin), campo('Qué estudiaste', inComentario)),
    h('p', { class: 'ayuda' }, 'Para lo que estudiaste sin el pomodoro (en la biblioteca, en una consulta…).'));
  return abrirHoja({
    titulo: 'Registrar horas', contenido, textoConfirmar: 'Guardar', media: true,
    alConfirmar: async () => {
      const f = inFecha.leer();
      if (f === null) { toast('Elegí el día.', { error: true }); return false; }
      let hora = normalizarHora(inHora.value);
      if (hora === null) { toast('La hora tiene que ser como 9:00 o 18:30.', { error: true }); return false; }
      if (hora === '') hora = '12:00';
      const [hh, mm] = hora.split(':').map(Number);
      l.sesiones.push(nuevo('Sesion', { Id: l.nuevoId(), MateriaId: Number(selMateria.value) || 0, Inicio: F.conHora(f, hh, mm), Minutos: Number(selMin.value), Comentario: inComentario.value.trim() }));
      await guardar();
      toast('Se registraron ' + selMin.options[selMin.selectedIndex].text + ' de estudio', { accion: 'Deshacer', alAccionar: () => deshacer() });
      return true;
    },
  });
}

// ------------------------------------------------------------------ Tarjetas de repaso
export function abrirTarjetaRepaso(t = null, materia = 0) {
  const l = E.libro;
  const selMateria = selector(opcionesMaterias(), t ? t.MateriaId : materia);
  const selTipo = selector(ENUMS.TipoRepaso.map((x) => [x, nombreRepaso(x)]), t ? t.Tipo : 'Concepto');
  const inFrente = h('textarea', { rows: 3, placeholder: '¿Qué es…?' }, t ? t.Frente : '');
  const inDorso = h('textarea', { rows: 4, placeholder: 'La respuesta' }, t ? t.Dorso : '');
  let creadas = 0;
  const validar = () => {
    if (!inFrente.value.trim() || !inDorso.value.trim()) { toast('Completá la pregunta y la respuesta.', { error: true }); return false; }
    return true;
  };
  const aplicar = () => {
    let x = t;
    if (!x) { x = nuevo('Repaso', { Id: l.nuevoId(), ProximaRevision: hoy(), Creada: hoy() }); l.repasos.push(x); }
    x.MateriaId = Number(selMateria.value) || 0;
    x.Tipo = selTipo.value;
    x.Frente = inFrente.value.trim();
    x.Dorso = inDorso.value.trim();
  };
  const pie = h('div', { class: 'botonera' });
  const contenido = h('div', { class: 'form' },
    grupo(campo('Materia', selMateria), campo('Tipo', selTipo)),
    h('p', { class: 'ayuda' }, 'Muy tomado = alta probabilidad de examen · Distinción clave · Regla mnemotécnica · Trampa típica.'),
    h('div', { class: 'bloque' }, grupo(h('div', { class: 'campo vertical' }, h('label', null, 'Pregunta'), inFrente), h('div', { class: 'campo vertical' }, h('label', null, 'Respuesta'), inDorso)),
      h('p', { class: 'ayuda' }, 'La app te la vuelve a mostrar cada vez más espaciada si la sabés: mañana, en 3 días, en una semana, en dos y en un mes.')),
    pie);
  const hoja = abrirHoja({
    titulo: t ? 'Editar tarjeta' : 'Nueva tarjeta de repaso', contenido, textoConfirmar: 'Guardar',
    alConfirmar: async () => {
      if (!validar()) return false;
      aplicar();
      await guardar();
      toast(t ? 'Tarjeta guardada' : (creadas ? Fmt.plural(creadas + 1, 'tarjeta agregada', 'tarjetas agregadas') : 'Tarjeta agregada'));
      return true;
    },
  });
  if (t) {
    pie.append(h('button', { class: 'boton peligro', type: 'button', onClick: async () => {
      if (!(await confirmar('¿Borrar esta tarjeta?', { si: 'Borrar', peligro: true }))) return;
      l.repasos.splice(l.repasos.indexOf(t), 1);
      await guardar();
      hoja.cerrar();
      toast('Tarjeta borrada', { accion: 'Deshacer', alAccionar: () => deshacer() });
    } }, icono('borrar'), 'Borrar'));
  } else {
    pie.append(h('button', { class: 'boton secundario', type: 'button', onClick: async () => {
      if (!validar()) return;
      aplicar();
      creadas++;
      await guardar();
      inFrente.value = ''; inDorso.value = '';
      inFrente.focus();
      toast('Tarjeta guardada (' + creadas + ')');
    } }, 'Guardar y otra'));
    setTimeout(() => inFrente.focus(), 380);
  }
  return hoja;
}

export function abrirPegarTarjetas(materia = 0) {
  const l = E.libro;
  const selMateria = selector(opcionesMaterias(), materia);
  const selTipo = selector(ENUMS.TipoRepaso.map((x) => [x, nombreRepaso(x)]), 'Concepto');
  const txt = h('textarea', { rows: 9, placeholder: '¿Qué es COBIT? | Marco de gobierno y gestión de TI de ISACA', style: { fontSize: '15px' } });
  const contenido = h('div', { class: 'form' },
    grupo(campo('Materia', selMateria), campo('Tipo', selTipo)),
    h('div', { class: 'bloque' }, grupo(h('div', { class: 'campo vertical' }, h('label', null, 'Tarjetas'), txt)),
      h('p', { class: 'ayuda' }, 'Una por renglón: «pregunta | respuesta» (también sirve tabulación o « - »). Ideal para pasar un resumen o un glosario. Las preguntas repetidas se saltean.')));
  return abrirHoja({
    titulo: 'Agregar varias', contenido, textoConfirmar: 'Agregar',
    alConfirmar: async () => {
      const creadas = importarTarjetas(l, txt.value, Number(selMateria.value) || 0, selTipo.value, hoy());
      if (!creadas.length) { toast('No encontré tarjetas: escribí una por renglón, «pregunta | respuesta».', { error: true }); return false; }
      await guardar();
      toast(Fmt.plural(creadas.length, 'tarjeta agregada', 'tarjetas agregadas'), { accion: 'Deshacer', alAccionar: () => deshacer() });
      return true;
    },
  });
}

// ------------------------------------------------------------------ Sesión de repaso
/** Muestra las tarjetas de a una: pregunta → respuesta → «No la sabía / Dudé / La sabía». */
export function abrirRepaso(lista) {
  const l = E.libro;
  let i = 0, mostrando = false, aciertos = 0, dudas = 0, errores = 0, pendientesDeGuardar = false;
  const zona = h('div', { class: 'form' });
  const pintar = () => {
    zona.innerHTML = '';
    const t = lista[i] || null;
    if (!t) {
      zona.append(h('div', { class: 'flashcard final' },
        h('div', { class: 'grande-final' }, lista.length ? '¡Listo!' : '¡Al día!'),
        h('div', null, lista.length ? 'Repasaste ' + Fmt.plural(lista.length, 'tarjeta', 'tarjetas') + '.' : 'No hay tarjetas para repasar hoy.'),
        lista.length ? h('div', { class: 'resultado-repaso' },
          h('span', { class: 'verde' }, 'La sabías: ' + aciertos), h('span', null, 'Dudaste: ' + dudas), h('span', { class: 'rojo' }, 'No la sabías: ' + errores)) : null,
        lista.length ? h('div', { class: 'sec', style: { fontSize: '15px', marginTop: '10px' } }, 'Las que fallaste vuelven mañana; las que sabías, más adelante.') : null),
      h('button', { class: 'boton ancho', type: 'button', style: { marginTop: '16px' }, onClick: () => hoja.cerrar() }, 'Terminar'));
      return;
    }
    const mat = l.materia(t.MateriaId);
    const col = colorCss(colorRepaso(t.Tipo));
    zona.append(
      h('div', { class: 'cabeza-repaso' }, h('span', null, (i + 1) + ' de ' + lista.length + ' · ' + (mat ? mat.Nombre : 'Sin materia')),
        h('span', { class: 'etq-repaso', style: { '--c': col } }, nombreRepaso(t.Tipo))),
      h('div', { class: 'barra', style: { '--c': 'var(--violeta)', marginTop: '6px' } }, h('i', { style: { width: (i / lista.length * 100).toFixed(1) + '%' } })),
      h('button', { class: 'flashcard', type: 'button', style: { '--c': col, marginTop: '12px', width: '100%' }, onClick: () => { if (!mostrando) { mostrando = true; pintar(); } } },
        h('div', { class: 'frente' }, t.Frente),
        mostrando ? h('div', { class: 'dorso' }, t.Dorso) : h('div', { class: 'pista' }, 'Pensá la respuesta y tocá para darla vuelta · caja ' + t.Caja + ' de 5')),
      mostrando ? h('div', { class: 'botonera respuestas' },
        h('button', { class: 'boton peligro', type: 'button', onClick: () => contestar(0) }, 'No la sabía'),
        h('button', { class: 'boton secundario', type: 'button', onClick: () => contestar(1) }, 'Dudé'),
        h('button', { class: 'boton', type: 'button', onClick: () => contestar(2) }, 'La sabía'))
        : h('button', { class: 'boton ancho', type: 'button', style: { marginTop: '14px' }, onClick: () => { mostrando = true; pintar(); } }, 'Mostrar respuesta'));
  };
  const contestar = async (r) => {
    const t = lista[i];
    if (!t || !mostrando) return;
    responder(t, r, hoy());
    if (r === 2) aciertos++; else if (r === 1) dudas++; else errores++;
    pendientesDeGuardar = true;
    i++;
    mostrando = false;
    pintar();
    if (i >= lista.length) { pendientesDeGuardar = false; await guardar(); }
  };
  const hoja = abrirHoja({
    titulo: 'Repaso', contenido: zona, izquierda: 'Cerrar',
    alCerrar: () => { if (pendientesDeGuardar) { pendientesDeGuardar = false; guardar(); } },
  });
  pintar();
  return hoja;
}
