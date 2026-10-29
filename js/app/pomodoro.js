// ============================================================================
//  Pomodoro del iPhone (como Pomodoro.vb): bloques de concentración y descanso.
//  Cuenta con la hora del reloj, no con ticks: si bloqueás el teléfono o te vas
//  a otra app, sigue bien, y al volver se registra lo que corresponda.
// ============================================================================

import { E, guardar } from './estado.js';
import { F } from '../nucleo/fecha.js';
import { nuevo } from '../nucleo/modelo.js';
import * as almacen from './almacen.js';
import { toast } from './ui.js';

export const Fase = { Detenido: 'detenido', Foco: 'foco', Descanso: 'descanso' };

export const P = {
  fase: Fase.Detenido,
  materia: 0,
  /** Momento (ms) en que empezó la fase actual */
  inicioFase: 0,
  /** Duración de la fase (segundos) */
  total: 0,
  /** Momento (ms) en que se pausó (null si corre) */
  pausadoDesde: null,
  /** Tiempo en pausa acumulado en la fase (ms) */
  pausaAcum: 0,
  completados: 0,
  /** Inicio del bloque de concentración (fecha con hora, como la guarda la PC) */
  inicioFoco: null,
};

const oyentes = new Set();
let timer = null;
let audio = null;

export function escucharPomodoro(fn) { oyentes.add(fn); return () => oyentes.delete(fn); }
function avisar() { for (const fn of [...oyentes]) { try { fn(); } catch (e) { console.error(e); } } }

export const enCurso = () => P.fase !== Fase.Detenido;

/** Segundos corridos de la fase actual (sin las pausas). */
function corrido(ahora = Date.now()) {
  const fin = P.pausadoDesde !== null ? P.pausadoDesde : ahora;
  return Math.max(0, (fin - P.inicioFase - P.pausaAcum) / 1000);
}

export function restante() { return enCurso() ? Math.max(0, Math.ceil(P.total - corrido())) : 0; }
export function fraccion() { return enCurso() && P.total > 0 ? Math.min(1, corrido() / P.total) : 0; }
export function textoRestante(seg = restante()) { return F.dos(Math.floor(seg / 60)) + ':' + F.dos(seg % 60); }
export function nombreMateria() { const m = E.libro && E.libro.materia(P.materia); return m ? m.Nombre : 'Sin materia'; }
/** " de Auditoría" (o nada si no hay materia) */
const deMateria = () => { const m = E.libro && E.libro.materia(P.materia); return m ? ' de ' + m.Nombre : ''; };

function persistir() {
  const { fase, materia, inicioFase, total, pausadoDesde, pausaAcum, completados, inicioFoco } = P;
  almacen.escribir('pomodoro', { fase, materia, inicioFase, total, pausadoDesde, pausaAcum, completados, inicioFoco }).catch(() => {});
}

function arrancarReloj() {
  if (timer) return;
  timer = setInterval(() => { revisar(); avisar(); }, 1000);
}
function pararReloj() { clearInterval(timer); timer = null; }

/** Prepara el sonido (Safari sólo lo permite después de un toque). */
function prepararSonido() {
  try {
    if (!audio) { const C = window.AudioContext || window.webkitAudioContext; if (C) audio = new C(); }
    if (audio && audio.state === 'suspended') audio.resume();
  } catch { audio = null; }
}

function sonar() {
  if (!audio || document.visibilityState !== 'visible') return;
  try {
    const t0 = audio.currentTime + 0.02;
    for (const [i, f] of [[0, 880], [1, 1175]]) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + i * 0.22);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + i * 0.22 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.22 + 0.2);
      o.connect(g).connect(audio.destination);
      o.start(t0 + i * 0.22); o.stop(t0 + i * 0.22 + 0.22);
    }
  } catch { /* sin sonido */ }
}

/** Fecha con hora (como la guarda la PC) a partir de milisegundos. */
function fechaDeMs(ms) {
  const t = new Date(ms);
  return F.conHora(F.de(t.getFullYear(), t.getMonth() + 1, t.getDate()), t.getHours(), t.getMinutes(), t.getSeconds());
}

export function empezar(materia) {
  prepararSonido();
  P.materia = materia || 0;
  P.fase = Fase.Foco;
  P.total = Math.max(1, E.libro.config.PomodoroMin) * 60;
  P.inicioFase = Date.now();
  P.pausadoDesde = null;
  P.pausaAcum = 0;
  P.inicioFoco = fechaDeMs(P.inicioFase);
  persistir();
  arrancarReloj();
  avisar();
}

export function pausarOReanudar() {
  if (!enCurso()) return;
  prepararSonido();
  if (P.pausadoDesde !== null) { P.pausaAcum += Date.now() - P.pausadoDesde; P.pausadoDesde = null; }
  else P.pausadoDesde = Date.now();
  persistir();
  avisar();
}

/** Corta el pomodoro. Si estabas concentrado 5 minutos o más, se registran. */
export async function parar() {
  if (P.fase === Fase.Foco) {
    const seg = Math.floor(corrido());
    if (seg >= 300) await registrar(Math.floor(seg / 60), false);
  }
  P.fase = Fase.Detenido;
  P.pausadoDesde = null;
  P.pausaAcum = 0;
  pararReloj();
  persistir();
  avisar();
}

/** Termina ya el bloque actual (si era de concentración, cuenta como completo). */
export async function saltar() {
  if (!enCurso()) return;
  await terminar(Date.now(), true);
  avisar();
}

async function registrar(minutos, completo) {
  if (minutos <= 0 || !E.libro) return;
  const l = E.libro;
  l.sesiones.push(nuevo('Sesion', { Id: l.nuevoId(), MateriaId: l.materia(P.materia) ? P.materia : 0, Inicio: P.inicioFoco ?? F.ahora(), Minutos: minutos, Pomodoro: completo }));
  await guardar();
}

/** Pasa a la fase siguiente. fin: momento (ms) en que terminó la fase. */
async function terminar(fin, enVivo) {
  const cfg = E.libro.config;
  if (P.fase === Fase.Foco) {
    const minutos = Math.max(1, Math.floor(P.total / 60));
    await registrar(minutos, true);
    P.completados++;
    const largo = cfg.PomodorosPorCiclo > 0 && P.completados % cfg.PomodorosPorCiclo === 0;
    P.fase = Fase.Descanso;
    P.total = Math.max(1, largo ? cfg.DescansoLargoMin : cfg.DescansoMin) * 60;
    P.inicioFase = fin;
    P.pausadoDesde = null;
    P.pausaAcum = 0;
    if (enVivo) {
      sonar();
      toast('¡Pomodoro' + deMateria() + ' terminado! Quedó registrado. Descanso de ' + Math.round(P.total / 60) + ' minutos.', { duracion: 6000 });
    }
  } else {
    P.fase = Fase.Detenido;
    pararReloj();
    if (enVivo) {
      sonar();
      toast('Terminó el descanso. Cuando quieras, arrancá el próximo pomodoro.', { duracion: 6000 });
    }
  }
  persistir();
}

/** Revisa si terminaron fases (por ejemplo, mientras el iPhone estaba bloqueado). */
let revisando = false;
export async function revisar() {
  // En segundo plano no se hace nada: al volver a la app se pone al día
  if (revisando || !enCurso() || P.pausadoDesde !== null || !E.libro || document.visibilityState !== 'visible') return;
  revisando = true;
  try {
    let atrasadas = 0, registrados = 0, terminadas = 0;
    while (enCurso() && P.pausadoDesde === null && corrido() >= P.total) {
      const fin = P.inicioFase + P.pausaAcum + P.total * 1000;
      const eraFoco = P.fase === Fase.Foco;
      const atrasada = Date.now() - fin > 5000;
      await terminar(fin, !atrasada);
      terminadas++;
      if (!atrasada) break;
      atrasadas++;
      if (eraFoco) registrados++;
    }
    if (atrasadas) {
      let txt = registrados ? 'Mientras no estabas terminó tu pomodoro' + deMateria() + ' y quedó registrado.' : 'Terminó el descanso.';
      if (registrados && P.fase === Fase.Descanso) txt += ' Ahora estás en el descanso.';
      else if (registrados && P.fase === Fase.Detenido) txt += ' El descanso también terminó.';
      toast(txt, { duracion: 7000 });
    }
    if (terminadas) avisar();
  } finally { revisando = false; }
}

/** Al abrir la app: retoma un pomodoro que haya quedado corriendo. */
export async function retomar() {
  try {
    const g = await almacen.leer('pomodoro');
    if (g && g.fase && g.fase !== Fase.Detenido) {
      Object.assign(P, g);
      arrancarReloj();
      await revisar();
    }
  } catch { /* nada que retomar */ }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { revisar(); avisar(); } });
}
