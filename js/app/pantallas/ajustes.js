// ============================================================================
//  Ajustes (sincronización, tema, cotizaciones y datos), "Más" y la bienvenida.
// ============================================================================

import { h, icono, seccion, grupo, fila, vacio, campo, entrada, entradaMonto, segmentado, toast, confirmar, preguntar, abrirHoja } from '../ui.js';
import { E, hoy, guardar, usarTexto, aplicarTema, guardarEstadoSync } from '../estado.js';
import { vistaSecundaria, vistaPrincipal, Fmt, F } from './comun.js';
import { Libro } from '../../nucleo/modelo.js';
import { preparar, verificar, combinar } from '../../nucleo/integridad.js';
import { textoDe, DecisionInicial, ErrorNube } from '../../nucleo/sincro.js';
import { Asesor } from '../../nucleo/asesor.js';
import * as almacen from '../almacen.js';
import { S, sincronizar, configurar, desconectar, pausar, textoLargo, activa, normalizarRepo, escucharSync } from '../sincro.js';
import { filaAviso } from './inicio.js';

export const VERSION_APP = '2.1';

// ------------------------------------------------------------------ Más
export function pantallaMas() {
  const l = E.libro, m = E.motor;
  const ir = (r) => () => { location.hash = r; };
  const avisos = new Asesor(m).generar().length;
  return vistaPrincipal('#/mas', {
    titulo: 'Más',
    contenido: [
      seccion('Finanzas', grupo(
        fila({ icono: 'tarjeta', colorIcono: '#D97706', t1: 'Tarjetas', t2: 'Resúmenes, pagos y total real', chevron: true, onClick: ir('#/tarjetas') }),
        fila({ icono: 'cuenta', colorIcono: '#0EA5E9', t1: 'Cuentas', t2: 'Saldos, transferencias y ajustes', chevron: true, onClick: ir('#/cuentas') }),
        fila({ icono: 'fijos', colorIcono: '#64748B', t1: 'Fijos', t2: 'Sueldo, alquiler y suscripciones', chevron: true, onClick: ir('#/fijos') }),
        fila({ icono: 'historial', colorIcono: '#2563EB', t1: 'Historial y proyección', t2: 'Por mes, por categoría y lo que viene', chevron: true, onClick: ir('#/historial') }),
        fila({ icono: 'inversiones', colorIcono: '#16A34A', t1: 'Inversiones y metas', t2: 'Dólar, plazo fijo, LECAP y tus metas', chevron: true, onClick: ir('#/inversiones') }),
        fila({ icono: 'alerta', colorIcono: '#F59E0B', t1: 'Avisos', t2: avisos ? Fmt.plural(avisos, 'aviso', 'avisos') : 'Nada para revisar', chevron: true, onClick: ir('#/avisos') }))),
      seccion('Organización', grupo(
        fila({ icono: 'agenda', colorIcono: '#DB2777', t1: 'Calendario', chevron: true, onClick: ir('#/agenda') }),
        fila({ icono: 'tablero', colorIcono: '#2563EB', t1: 'Tablero', chevron: true, onClick: ir('#/agenda/tablero') }),
        fila({ icono: 'estudio', colorIcono: '#7C3AED', t1: 'Estudio', t2: 'Materias, exámenes, horas y repaso', chevron: true, onClick: ir('#/estudio') }))),
      seccion('Sistema', grupo(
        fila({ icono: 'nube', colorIcono: '#059669', t1: 'Sincronización con la PC', t2: activa() ? textoLargo() : 'No está activa', chevron: true, onClick: ir('#/ajustes') }),
        fila({ icono: 'ajustes', colorIcono: '#475569', t1: 'Ajustes', t2: 'Tema, cotizaciones y datos', chevron: true, onClick: ir('#/ajustes') }))),
      h('p', { class: 'nota-pie', style: { textAlign: 'center', margin: '22px 16px 0' } }, 'Mis Finanzas ' + VERSION_APP + ' para iPhone · mismos datos que la PC'),
    ],
  });
}

// ------------------------------------------------------------------ Avisos
export function pantallaAvisos(_p, rerender) {
  const avisos = new Asesor(E.motor).generar();
  const ocultos = E.libro.config.AvisosOcultos ? E.libro.config.AvisosOcultos.split('|').filter(Boolean).length : 0;
  return vistaSecundaria('#/avisos', {
    titulo: 'Avisos',
    contenido: [
      avisos.length ? h('section', { class: 'seccion', style: { marginTop: '8px' } }, grupo(...avisos.map((a) => filaAviso(a, rerender)))) : vacio('Todo en orden', 'No hay avisos para revisar.'),
      ocultos ? h('section', { class: 'seccion' }, h('button', { class: 'boton secundario ancho', type: 'button', onClick: async () => {
        E.libro.config.AvisosOcultos = '';
        await guardar();
        toast('Se volvieron a mostrar los avisos ocultos');
      } }, 'Mostrar los ' + ocultos + ' avisos ocultos')) : null,
    ],
  });
}

// ------------------------------------------------------------------ Ayuda para crear el token
export function ayudaToken() {
  return h('details', { class: 'ayuda-pasos' },
    h('summary', null, '¿Cómo creo el repositorio y el token?'),
    h('ol', { class: 'pasos' },
      h('li', null, 'Si todavía no lo hiciste, en la PC andá a Configuración → iPhone y nube: ahí está el paso a paso para crear el repositorio privado (por ejemplo ', h('code', null, 'misfinanzas-datos'), ') y subir tus datos.'),
      h('li', null, 'En el iPhone, abrí github.com en Safari e iniciá sesión. Tocá tu foto → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.'),
      h('li', null, 'Nombre: «iPhone». Vencimiento: el que quieras (por ejemplo 1 año). En Repository access elegí «Only select repositories» y marcá solamente tu repositorio de datos.'),
      h('li', null, 'En Permissions → Repository permissions → Contents elegí «Read and write». Tocá Generate token y copiá el token (empieza con ', h('code', null, 'github_pat_'), ').'),
      h('li', null, 'Pegalo acá abajo. Queda guardado cifrado en este iPhone y sólo sirve para ese repositorio.')));
}

function campoToken(valor = '') {
  const inToken = h('input', { type: 'password', value: valor, placeholder: 'github_pat_…', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const ver = h('button', { class: 'boton-texto', type: 'button', style: { fontSize: '15px' } }, 'Ver');
  ver.addEventListener('click', () => { const v = inToken.type === 'password'; inToken.type = v ? 'text' : 'password'; ver.textContent = v ? 'Ocultar' : 'Ver'; });
  const pegar = navigator.clipboard && navigator.clipboard.readText ? h('button', { class: 'boton-texto', type: 'button', style: { fontSize: '15px' }, onClick: async () => {
    try { inToken.value = (await navigator.clipboard.readText()).trim(); } catch { toast('No se pudo pegar: mantené apretado el campo y elegí Pegar.'); }
  } }, 'Pegar') : null;
  const fila = h('div', { class: 'campo' }, h('label', { for: 'token' }, 'Token'), inToken, pegar, ver);
  inToken.id = 'token';
  return { fila, input: inToken };
}

/** Conecta con la nube y baja los datos. Devuelve true si salió bien. */
async function conectar({ repo, token, nombre }, boton) {
  const r = normalizarRepo(repo);
  if (!/^[^/\s]+\/[^/\s]+$/.test(r)) { toast('Escribí el repositorio como usuario/repositorio (por ejemplo tu-usuario/misfinanzas-datos).', { error: true }); return false; }
  if (token.trim().length < 20) { toast('Pegá el token de GitHub (es largo y empieza con github_pat_).', { error: true }); return false; }
  const textoBoton = boton ? boton.textContent : '';
  if (boton) { boton.disabled = true; boton.textContent = 'Conectando…'; }
  try {
    await configurar({ repositorio: r, token, nombre });
    const res = await sincronizar(DecisionInicial.Ninguna);
    if (!res) throw new Error(S.mensaje || 'No se pudo sincronizar.');
    if (!E.libro) throw new Error('No llegaron datos de la nube.');
    return true;
  } catch (e) {
    // Mensajes pensados para cuando recién estás conectando (todavía no hay reintentos automáticos)
    let msg = e instanceof ErrorNube ? e.message : (e.message || String(e));
    const tipo = e instanceof ErrorNube ? e.tipo : S.tipoError;
    if (tipo === 'token') msg = 'GitHub no aceptó el token. Revisá que esté copiado entero (empieza con github_pat_) y que no haya vencido.';
    else if (tipo === 'red') msg = 'No hay conexión con GitHub. Revisá que el iPhone tenga internet y probá de nuevo.';
    toast(msg, { error: true, duracion: 9000 });
    E.sync.Activa = false;
    await guardarEstadoSync().catch(() => {});
    return false;
  } finally {
    if (boton) { boton.disabled = false; boton.textContent = textoBoton; }
  }
}

// ------------------------------------------------------------------ Bienvenida
export function pantallaBienvenida(alListo) {
  const inRepo = entrada(E.sync.Repositorio || '', { placeholder: 'usuario/misfinanzas-datos', autocapitalize: 'off', spellcheck: 'false' });
  const tk = campoToken(E.sync.Token || '');
  const inNombre = entrada(E.sync.NombreDispositivo || 'iPhone', { placeholder: 'iPhone' });
  const boton = h('button', { class: 'boton ancho', type: 'button' }, 'Conectar y bajar mis datos');
  boton.addEventListener('click', async () => {
    if (await conectar({ repo: inRepo.value, token: tk.input.value, nombre: inNombre.value }, boton)) alListo('Listo: tus datos ya están en el iPhone (' + Fmt.plural(E.libro.movimientos.length, 'movimiento', 'movimientos') + ').');
  });
  const archivo = h('input', { type: 'file', accept: '.xml,text/xml,application/xml', class: 'sr' });
  archivo.addEventListener('change', async () => {
    const f = archivo.files && archivo.files[0];
    if (!f) return;
    try {
      const texto = await f.text();
      const l = Libro.desdeXml(texto);
      preparar(l); verificar(l, true);
      const t = textoDe(l.aElemento(F.ahora()));
      await almacen.guardarDatos(t);
      usarTexto(t);
      E.libro.config.ModoTema = 'sistema';
      await guardar({ sinSubir: true });
      alListo('Se abrió el archivo (' + Fmt.plural(l.movimientos.length, 'movimiento', 'movimientos') + '). Para que se actualice solo, conectá la nube en Ajustes.');
    } catch (e) { toast('Ese archivo no es un datos.xml de Mis Finanzas.', { error: true }); }
  });
  // Abierta en Safari sin instalar: primero conviene agregarla a la pantalla de inicio (la app instalada guarda sus datos aparte)
  const esIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const instalada = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const aviso = esIOS && !instalada ? h('div', { class: 'banner info', style: { margin: '0 0 18px' } }, icono('compartir'),
    h('div', null, h('b', null, 'Primero instalala: '), 'tocá Compartir y elegí «Agregar a pantalla de inicio». Después abrila desde el ícono «Finanzas» y conectala ahí (la app instalada guarda sus datos aparte de Safari).')) : null;
  const v = h('main', { class: 'vista sin-tabs' },
    h('div', { class: 'bienvenida' },
      aviso,
      h('img', { class: 'logo', src: 'iconos/icono-180.png', alt: '' }),
      h('h1', null, 'Tus finanzas, también en el iPhone'),
      h('p', null, 'Conectá el iPhone a la nube donde la PC guarda tus datos. Lo que cargues en uno aparece en el otro, sin duplicar nada.'),
      grupo(campo('Repositorio', inRepo), tk.fila, campo('Este equipo', inNombre)),
      h('div', { style: { marginTop: '16px' } }, boton),
      ayudaToken(),
      h('p', { style: { marginTop: '22px', fontSize: '14px' } }, '¿Sin nube por ahora? ',
        h('label', { style: { color: 'var(--acento)', fontWeight: 600 } }, archivo, 'Abrir un datos.xml'), ' que te pases desde la PC (por AirDrop o Archivos).')));
  return v;
}

// ------------------------------------------------------------------ Ajustes
export function pantallaAjustes(_p, rerender) {
  const l = E.libro;
  const cfg = l.config;
  const contenido = [];

  // ---- Sincronización
  const est = E.sync;
  const estadoTxt = !est.Configurada ? 'Sin conectar' : !est.Activa ? 'Pausada' : S.estado === 'error' ? 'Con problemas' : S.estado === 'sincronizando' ? 'Sincronizando…' : 'Activa';
  const conProblema = est.Configurada && est.Activa && (S.estado === 'error' || S.estado === 'sin-conexion');
  const filasSync = [
    fila({ icono: conProblema ? 'nubeError' : (est.Configurada && est.Activa ? 'nubeOk' : 'nube'), colorIcono: conProblema ? 'var(--rojo)' : (est.Configurada && est.Activa ? 'var(--acento)' : '#94A3B8'),
      t1: estadoTxt, t2: est.Configurada ? textoLargo() : 'Conectá este iPhone a la nube de la PC para tener siempre los mismos datos en los dos.', multi: true }),
    est.Repositorio ? fila({ t1: 'Repositorio', derecha: h('span', { class: 'valor-sec' }, est.Repositorio) }) : null,
    est.NombreDispositivo ? fila({ t1: 'Este equipo', derecha: h('span', { class: 'valor-sec' }, est.NombreDispositivo + (est.Ranura ? ' · rango ' + est.Ranura : '')) }) : null,
  ];
  const botonesSync = h('div', { class: 'botonera', style: { flexWrap: 'wrap' } });
  if (est.Configurada) {
    botonesSync.append(
      h('button', { class: 'boton', type: 'button', disabled: !est.Activa, onClick: async () => { await sincronizar(); rerender(); toast(S.estado === 'error' ? S.mensaje : 'Sincronizado'); } }, 'Sincronizar ahora'),
      h('button', { class: 'boton secundario', type: 'button', onClick: async () => { await pausar(est.Activa); rerender(); } }, est.Activa ? 'Pausar' : 'Reanudar'));
  }
  contenido.push(seccion('Sincronización con la PC', h('div', null, grupo(...filasSync), botonesSync,
    h('div', { class: 'botonera', style: { marginTop: '8px' } },
      h('button', { class: 'boton secundario', type: 'button', onClick: () => cambiarConexion(rerender) }, est.Configurada ? 'Cambiar repositorio o token' : 'Conectar con la nube'),
      est.Configurada ? h('button', { class: 'boton peligro', type: 'button', onClick: async () => {
        if (!(await confirmar('Este iPhone deja de sincronizar. Tus datos quedan acá y en la nube; para volver a conectar vas a necesitar el token.', { titulo: 'Desconectar', si: 'Desconectar', peligro: true }))) return;
        await desconectar(); rerender();
      } }, 'Desconectar') : null)),
  { pie: 'Los datos viajan a tu repositorio privado de GitHub. El token se guarda cifrado en este iPhone y sólo puede leer y escribir ese repositorio.' }));

  // ---- Apariencia
  contenido.push(seccion('Apariencia', grupo(h('div', { style: { padding: '10px 14px' } },
    segmentado([['sistema', 'Como el iPhone'], ['claro', 'Claro'], ['oscuro', 'Oscuro']], cfg.ModoTema === 'claro' || cfg.ModoTema === 'oscuro' ? cfg.ModoTema : 'sistema', async (v) => {
      cfg.ModoTema = v; aplicarTema(); await guardar({ sinSubir: true, guardarDeshacer: false });
    })))));

  // ---- Datos generales (viajan a la PC)
  const inNombre = entrada(cfg.Nombre, { placeholder: 'Tu nombre' });
  const inTarjeta = entradaMonto(cfg.DolarTarjeta);
  const inMEP = entradaMonto(cfg.DolarMEP);
  const guardarGenerales = async () => {
    const t = inTarjeta.leer(), mep = inMEP.leer();
    if (!t || t.signo <= 0 || !mep || mep.signo <= 0) { toast('Revisá las cotizaciones.', { error: true }); return; }
    const cambio = cfg.Nombre !== inNombre.value.trim() || !cfg.DolarTarjeta.eq(t) || !cfg.DolarMEP.eq(mep);
    if (!cambio) return;
    cfg.Nombre = inNombre.value.trim();
    if (!cfg.DolarTarjeta.eq(t) || !cfg.DolarMEP.eq(mep)) { cfg.DolarTarjeta = t; cfg.DolarMEP = mep; cfg.FechaCotizacion = hoy(); }
    await guardar();
    toast('Guardado');
  };
  for (const x of [inNombre, inTarjeta, inMEP]) x.addEventListener('change', guardarGenerales);
  contenido.push(seccion('Datos generales', grupo(campo('Tu nombre', inNombre), campo('Dólar tarjeta', inTarjeta), campo('Dólar MEP', inMEP)),
    { pie: 'Cotizaciones del ' + Fmt.fecha(cfg.FechaCotizacion) + '. Se actualizan solas cuando se bajan los datos de mercado (en la PC o en Inversiones).' }));

  // ---- Datos
  contenido.push(seccion('Tus datos', grupo(
    fila({ icono: 'compartir', colorIcono: '#2563EB', t1: 'Exportar datos.xml', t2: 'Una copia para guardar o pasar a la PC', onClick: exportar }),
    fila({ icono: 'copia', colorIcono: '#7C3AED', t1: 'Copias de seguridad', t2: 'Las que se hacen antes de traer cambios de la nube', chevron: true, onClick: () => copias(rerender) }),
    fila({ icono: 'check', colorIcono: '#059669', t1: 'Verificar datos', t2: 'Busca repetidos y referencias rotas', onClick: verificarDatos }),
    fila({ icono: 'archivo', colorIcono: '#64748B', t1: 'Importar un datos.xml', t2: 'Combinar o reemplazar con un archivo', onClick: importar }))));

  contenido.push(h('p', { class: 'nota-pie', style: { textAlign: 'center', margin: '22px 16px 0' } }, 'Mis Finanzas ' + VERSION_APP + ' para iPhone'));
  const v = vistaSecundaria('#/ajustes', { titulo: 'Ajustes', contenido });
  const quitar = escucharSync(() => { if (document.body.contains(v)) rerender(); else quitar(); });
  return v;
}

function cambiarConexion(rerender) {
  const inRepo = entrada(E.sync.Repositorio || '', { placeholder: 'usuario/misfinanzas-datos', autocapitalize: 'off', spellcheck: 'false' });
  const tk = campoToken(E.sync.Token || '');
  const inNombre = entrada(E.sync.NombreDispositivo || 'iPhone');
  const contenido = h('div', { class: 'form' }, grupo(campo('Repositorio', inRepo), tk.fila, campo('Este equipo', inNombre)), ayudaToken());
  abrirHoja({
    titulo: 'Conexión con la nube', contenido, textoConfirmar: 'Conectar',
    alConfirmar: async () => {
      const mismoRepo = normalizarRepo(inRepo.value) === E.sync.Repositorio;
      if (!mismoRepo && E.sync.TieneBase) E.sync.olvidar();
      const ok = await conectar({ repo: inRepo.value, token: tk.input.value, nombre: inNombre.value }, null);
      if (ok) { toast('Conectado'); rerender(); }
      return ok;
    },
  });
}

async function exportar() {
  const texto = E.texto;
  const nombre = 'datos_' + F.iso(hoy()) + '.xml';
  try {
    const archivo = new File([texto], nombre, { type: 'application/xml' });
    if (navigator.canShare && navigator.canShare({ files: [archivo] })) { await navigator.share({ files: [archivo], title: 'Mis Finanzas' }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = h('a', { href: URL.createObjectURL(new Blob([texto], { type: 'application/xml' })), download: nombre });
  document.body.appendChild(a); a.click(); a.remove();
}

async function copias(rerender) {
  const lista = await almacen.listarCopias();
  const contenido = h('div', { class: 'form' }, lista.length ? grupo(...lista.map((c) => {
    const d = new Date(c.fecha);
    return fila({ icono: 'copia', colorIcono: '#7C3AED', t1: d.toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' }), t2: c.motivo, onClick: async () => {
      if (!(await confirmar('Tus datos vuelven a como estaban en esa copia (antes se guarda una copia de los actuales). Si sincronizás, la restauración también llega a la PC.', { titulo: 'Restaurar copia', si: 'Restaurar' }))) return;
      await almacen.guardarCopia(E.texto, 'antes de restaurar una copia');
      usarTexto(c.texto);
      await guardar();
      hoja.cerrar();
      toast('Copia restaurada');
    } });
  })) : vacio('Sin copias todavía', 'Se hace una cada vez que llegan cambios de la nube.'));
  const hoja = abrirHoja({ titulo: 'Copias de seguridad', contenido, izquierda: 'Cerrar' });
}

async function verificarDatos() {
  const inf = verificar(E.libro, true);
  if (inf.Reparado.length) await guardar();
  const contenido = h('div', { class: 'form' }, h('div', { class: 'info-form' + (inf.TodoBien ? '' : ' alerta'), style: { whiteSpace: 'pre-line' } }, inf.texto('\n')));
  abrirHoja({ titulo: 'Verificación', contenido, izquierda: 'Cerrar', media: true });
}

function importar() {
  const archivo = h('input', { type: 'file', accept: '.xml,text/xml,application/xml' });
  archivo.addEventListener('change', async () => {
    const f = archivo.files && archivo.files[0];
    if (!f) return;
    let otro;
    try { otro = Libro.desdeXml(await f.text()); preparar(otro); verificar(otro, true); } catch { toast('Ese archivo no es un datos.xml de Mis Finanzas.', { error: true }); return; }
    const v = await preguntar({ titulo: f.name, texto: Fmt.plural(otro.movimientos.length, 'movimiento', 'movimientos') + ', ' + Fmt.plural(otro.cuentas.length, 'cuenta', 'cuentas') + '. ¿Qué hacemos?',
      opciones: [{ texto: 'Agregar lo que falta (sin duplicar)', valor: 'combinar', estilo: 'fuerte' }, { texto: 'Reemplazar mis datos', valor: 'reemplazar', estilo: 'peligro' }] });
    if (!v) return;
    await almacen.guardarCopia(E.texto, 'antes de importar ' + f.name);
    if (v === 'combinar') {
      const inf = combinar(E.libro, otro);
      verificar(E.libro, true);
      await guardar();
      toast(inf.texto(), { duracion: 7000 });
    } else {
      usarTexto(textoDe(otro.aElemento(F.ahora())));
      await guardar();
      toast('Se reemplazaron tus datos (hay una copia de los anteriores en Copias de seguridad).', { duracion: 7000 });
    }
  });
  archivo.click();
}
