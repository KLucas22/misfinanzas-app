// ============================================================================
//  Sincronización en segundo plano (como Sincro.vb en la PC):
//  sube los cambios unos segundos después de cada guardado, trae lo de la PC al
//  abrir la app y cada tanto mientras está abierta, y si mientras tanto cambiaste
//  algo acá, lo une sin perder nada.
// ============================================================================

import { F } from '../nucleo/fecha.js';
import { leerXml } from '../nucleo/xml.js';
import { Libro } from '../nucleo/modelo.js';
import { preparar, verificar } from '../nucleo/integridad.js';
import { fusionar, mismosDatos } from '../nucleo/fusion.js';
import { TransporteGitHub, Sincronizador, AccionSync, DecisionInicial, ErrorNube, textoDe } from '../nucleo/sincro.js';
import { E, usarTexto, avisarCambio, conservarPreferencias, guardarEstadoSync } from './estado.js';
import * as almacen from './almacen.js';
import { hojaAbierta, cuandoNoHayHojas, toast } from './ui.js';

export const S = {
  estado: 'inactiva',     // inactiva | al-dia | sincronizando | pendiente | sin-conexion | error
  mensaje: '',
  tipoError: '',
  ocupado: false,
  pendiente: false,
  timerSubida: null,
  timerTirar: null,
  fallas: 0,
  ultimoIntento: 0,
  oyentes: new Set(),
  /** Para pruebas: reemplaza fetch */
  fetchFn: null,
  /** Cuando la nube ya tiene datos y este iPhone también: la pantalla pregunta qué hacer */
  alPreguntar: null,
};

const ESPERA_SUBIDA = 2500;
const CADA = 90 * 1000;

function fijarEstado(estado, mensaje = '', tipoError = '') {
  S.estado = estado; S.mensaje = mensaje; S.tipoError = tipoError;
  for (const fn of [...S.oyentes]) { try { fn(); } catch (e) { console.error(e); } }
}

export function escucharSync(fn) { S.oyentes.add(fn); return () => S.oyentes.delete(fn); }

export const activa = () => E.sync.Activa && E.sync.Configurada;

/** Texto corto para el indicador de la pantalla de inicio. */
export function textoCorto() {
  if (!activa()) return 'Sin nube';
  switch (S.estado) {
    case 'sincronizando': return 'Sincronizando';
    case 'pendiente': return 'Por subir';
    case 'sin-conexion': return 'Sin conexión';
    case 'error': return 'Revisar nube';
    default: return E.sync.UltimaSync ? 'Al día' : 'Nube';
  }
}

export function textoLargo() {
  if (!activa()) return 'La sincronización no está activa.';
  const ultima = E.sync.UltimaSync ? 'Última sincronización: ' + horaTexto(E.sync.UltimaSync) + '.' : 'Todavía no se sincronizó.';
  if (S.estado === 'error' || S.estado === 'sin-conexion') return S.mensaje + ' ' + ultima;
  if (S.estado === 'sincronizando') return 'Sincronizando con la nube…';
  return ultima;
}

function horaTexto(n) {
  const hoy = F.hoy();
  const s = F.segundos(n);
  const hh = F.dos(Math.floor(s / 3600)) + ':' + F.dos(Math.floor((s % 3600) / 60));
  const d = Math.floor(n);
  if (d === hoy) return 'hoy a las ' + hh;
  if (d === hoy - 1) return 'ayer a las ' + hh;
  const { m, d: dia } = F.ymd(n);
  return F.dos(dia) + '/' + F.dos(m) + ' a las ' + hh;
}

/** Después de cada guardado: subir en unos segundos. */
export function programarSubida(ms = ESPERA_SUBIDA) {
  if (!activa()) return;
  clearTimeout(S.timerSubida);
  if (S.estado !== 'sincronizando') fijarEstado('pendiente', '');
  S.timerSubida = setTimeout(() => sincronizar(), ms);
}

export function iniciarCiclo() {
  clearInterval(S.timerTirar);
  S.timerTirar = setInterval(() => {
    if (document.visibilityState === 'visible' && Date.now() - S.ultimoIntento > CADA - 1000) sincronizar();
  }, 15000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - S.ultimoIntento > 15000) sincronizar();
  });
  window.addEventListener('online', () => sincronizar());
  window.addEventListener('pagehide', () => { if (S.estado === 'pendiente') sincronizar(); });
}

function transporte() {
  return new TransporteGitHub({ repositorio: E.sync.Repositorio, token: E.sync.Token, ruta: E.sync.Ruta, baseUrl: E.sync.BaseUrl, fetchFn: S.fetchFn });
}

function esperaPorFallas() { return Math.min(10 * 60 * 1000, 30000 * Math.pow(2, Math.max(0, S.fallas - 1))); }

/**
 * Sincroniza ya. decision: para la primera vez (UsarNube/Combinar).
 * Devuelve el resultado (o null si no corresponde).
 */
export async function sincronizar(decision = DecisionInicial.Ninguna, { permitirNubeVacia = false } = {}) {
  if (!activa()) return null;
  if (S.ocupado) { S.pendiente = true; return null; }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    fijarEstado('sin-conexion', 'Sin conexión: los cambios quedan guardados en el iPhone y se suben cuando vuelva internet.');
    return null;
  }
  S.ocupado = true;
  S.ultimoIntento = Date.now();
  clearTimeout(S.timerSubida);
  fijarEstado('sincronizando');
  const instantanea = E.texto || vacio();
  const est = E.sync.clonar();
  try {
    const s = new Sincronizador(transporte(), est, { tipo: 'iPhone' });
    // Primera vez: si este iPhone no tiene datos propios, se usan los de la nube sin preguntar
    let dec = decision;
    if (!est.TieneBase && dec === DecisionInicial.Ninguna && !tieneDatosPropios()) dec = DecisionInicial.UsarNube;
    let res = await s.sincronizar(instantanea, dec, { permitirNubeVacia });
    if (res.Accion === AccionSync.PrimeraVez) {
      const elegida = S.alPreguntar ? await S.alPreguntar(res) : DecisionInicial.UsarNube;
      if (!elegida) { fijarEstado('error', 'Elegí qué hacer con los datos de la nube para empezar a sincronizar.', 'decision'); return res; }
      res = await s.sincronizar(instantanea, elegida, { permitirNubeVacia });
    }
    if (res.Accion === AccionSync.Reintentar) {
      fijarEstado('pendiente', res.Mensaje);
      S.timerSubida = setTimeout(() => sincronizar(), 20000);
      return res;
    }
    await aplicar(res, instantanea, est);
    S.fallas = 0;
    fijarEstado('al-dia');
    return res;
  } catch (e) {
    S.fallas++;
    const tipo = e instanceof ErrorNube ? e.tipo : 'red';
    const msg = e instanceof ErrorNube ? e.message : 'No se pudo sincronizar (' + (e && e.message ? e.message : e) + ').';
    E.sync.UltimoError = msg;
    await guardarEstadoSync().catch(() => {});
    const grave = ['token', 'permiso', 'repositorio', 'formato', 'version', 'vacia'].includes(tipo);
    fijarEstado(tipo === 'red' ? 'sin-conexion' : 'error', msg, tipo);
    if (!grave) S.timerSubida = setTimeout(() => sincronizar(), esperaPorFallas());
    if (decision !== DecisionInicial.Ninguna || permitirNubeVacia) throw e;
    return null;
  } finally {
    S.ocupado = false;
    if (S.pendiente) { S.pendiente = false; programarSubida(800); }
  }
}

function vacio() {
  const l = new Libro();
  return textoDe(l.aElemento(F.ahora()));
}

/** ¿Este iPhone tiene datos cargados por el usuario (no sólo lo que bajó de la nube)? */
function tieneDatosPropios() {
  const l = E.libro;
  if (!l) return false;
  return l.movimientos.length > 0 || l.cuentas.length > 0 || l.tarjetas.length > 0 || l.tareas.length > 0;
}

/** Pasa el resultado a los datos del iPhone (si mientras tanto cambiaste algo, se une). */
async function aplicar(res, instantanea, est) {
  const aplicarYa = async () => {
    let nuevo = res.Nuevo;
    let otraVez = false;
    if (nuevo) {
      const cambiaronMientras = E.texto !== instantanea && E.libro;
      if (E.libro) conservarPreferencias(nuevo);
      else {
        // Primera vez en este iPhone: el tema sigue al del sistema (la PC conserva el suyo)
        const cfg = nuevo.hijo('Configuracion');
        if (cfg) cfg.fijar('ModoTema', 'sistema');
      }
      if (cambiaronMientras) {
        // Cambios hechos durante la sincronización: fusión de tres vías (base = lo que se mandó)
        const fus = fusionar(leerXml(instantanea).raiz, leerXml(E.texto).raiz, nuevo);
        const l = Libro.desdeElemento(fus.Doc);
        l.ranura = est.Ranura;
        preparar(l);
        verificar(l, true);
        l.revision = res.RevisionNube;
        nuevo = l.aElemento(F.ahora());
        otraVez = true;
      }
      const textoNuevo = textoDe(nuevo);
      const actual = E.texto ? leerXml(E.texto).raiz : null;
      const cambia = !actual || !mismosDatos(actual, nuevo);
      const trajoAjenos = res.Accion === AccionSync.Bajado || res.Accion === AccionSync.Fusionado;
      if (cambia && trajoAjenos && E.texto) await almacen.guardarCopia(E.texto, 'antes de traer cambios de la nube');
      E.sync = est;
      if (cambia || !E.libro) {
        const primeraVez = !E.libro;
        usarTexto(textoNuevo);
        await almacen.escribirVarios({ datos: textoNuevo, estadoSync: E.sync.aObjeto() });
        avisarCambio();
        // Aviso discreto cuando llega algo hecho en la PC (como hace la PC con lo del iPhone)
        if (!primeraVez && trajoAjenos) {
          const f = res.Fusion;
          let txt = f && f.CambiosRemotos > 0 ? 'Llegaron cambios de la PC u otro equipo (' + f.textoRemoto() + ').' : 'Se actualizó con lo último de la PC.';
          if (f && f.Conflictos.length) txt += ' ' + f.Conflictos[0];
          toast(txt, { duracion: f && f.Conflictos.length ? 9000 : 4500 });
        }
      } else {
        // Mismos datos: se conserva lo que está en pantalla y sólo se anotan la revisión y el texto
        E.texto = textoNuevo;
        E.libro.ranura = est.Ranura;
        E.libro.revision = res.RevisionNube || E.libro.revision;
        await almacen.escribirVarios({ datos: textoNuevo, estadoSync: E.sync.aObjeto() });
      }
    } else {
      E.sync = est;
      await guardarEstadoSync();
    }
    if (otraVez) programarSubida(1000);
  };
  // Con un formulario abierto se espera a que se cierre (así no cambian los datos que estás editando)
  if (hojaAbierta() && res.Nuevo) {
    await new Promise((resolver) => cuandoNoHayHojas(async () => { await aplicarYa(); resolver(); }));
  } else {
    await aplicarYa();
  }
}

/** Configura y activa la sincronización (desde la bienvenida o Ajustes). */
export async function configurar({ repositorio, token, nombre, baseUrl = null }) {
  E.sync.Repositorio = normalizarRepo(repositorio);
  E.sync.Token = token.trim();
  E.sync.NombreDispositivo = nombre.trim() || 'iPhone';
  if (baseUrl) E.sync.BaseUrl = baseUrl;
  E.sync.Activa = true;
  E.sync.UltimoError = '';
  await almacen.guardarToken(E.sync.Token);
  await guardarEstadoSync();
}

/** Deja de sincronizar y borra el token de este iPhone (los datos quedan acá y en la nube). */
export async function desconectar() {
  E.sync.Activa = false;
  E.sync.olvidar();
  E.sync.Token = '';
  await almacen.guardarToken('');
  await guardarEstadoSync();
  fijarEstado('inactiva');
}

export async function pausar(pausa) {
  E.sync.Activa = !pausa;
  await guardarEstadoSync();
  fijarEstado(pausa ? 'inactiva' : 'al-dia');
  if (!pausa) sincronizar();
}

/** "https://github.com/usuario/repo(.git)" o "usuario/repo" → "usuario/repo" */
export function normalizarRepo(s) {
  let r = (s || '').trim();
  r = r.replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/^git@github\.com:/i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
  const partes = r.split('/').filter(Boolean);
  return partes.length >= 2 ? partes[0] + '/' + partes[1] : r;
}

export { AccionSync, DecisionInicial };
