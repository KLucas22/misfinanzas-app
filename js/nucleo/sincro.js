// ============================================================================
//  Sincronización con la nube (igual que el Sincronizador de la PC).
//  Los dos dispositivos guardan el MISMO datos.xml en un repositorio privado de
//  GitHub. Cada uno recuerda la última versión sincronizada ("base") y, si los dos
//  cambiaron algo, se fusiona por entidad y por atributo.
// ============================================================================

import { F } from './fecha.js';
import { leerXml, escribirXml } from './xml.js';
import { Libro, nuevo, VERSION_ACTUAL, TAM_RANURA } from './modelo.js';
import { preparar, verificar, combinar } from './integridad.js';
import { fusionar, mismosDatos, describirCambios, atr } from './fusion.js';
import { leerJson, jTxt, jCampo } from './json.js';

export class ErrorNube extends Error {
  /** tipo: "token", "permiso", "repositorio", "red", "formato", "version", "limite", "vacia" */
  constructor(tipo, mensaje) { super(mensaje); this.tipo = tipo; }
}

export const AccionSync = { AlDia: 0, Subido: 1, Bajado: 2, Fusionado: 3, PrimeraVez: 4, Reintentar: 5 };
export const DecisionInicial = { Ninguna: 0, UsarNube: 1, Combinar: 2, SubirLocal: 3 };

// ---------------------------------------------------------------- Texto ↔ base64 (UTF-8)
export function aBase64(texto) {
  const bytes = new TextEncoder().encode(texto);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function deBase64(s) {
  const limpio = String(s).replace(/[\r\n ]/g, '');
  const bin = atob(limpio);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  let txt = new TextDecoder('utf-8').decode(bytes);
  if (txt.charCodeAt(0) === 0xfeff) txt = txt.slice(1);
  return txt;
}

/** Texto JSON igual que JsonTexto de la PC. */
export function jsonTexto(s) {
  let r = '"';
  for (const ch of s || '') {
    switch (ch) {
      case '"': r += '\\"'; break;
      case '\\': r += '\\\\'; break;
      case '\n': r += '\\n'; break;
      case '\r': r += '\\r'; break;
      case '\t': r += '\\t'; break;
      default: r += ch.charCodeAt(0) < 32 ? '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0') : ch;
    }
  }
  return r + '"';
}

// ---------------------------------------------------------------- GitHub
/** Guarda datos.xml en un repositorio de GitHub con la API de contenidos (un commit por subida). */
export class TransporteGitHub {
  constructor({ repositorio, token, ruta = 'datos.xml', baseUrl = 'https://api.github.com', timeoutMs = 20000, fetchFn = null }) {
    this.Repositorio = repositorio;
    this.Token = token;
    this.Ruta = ruta || 'datos.xml';
    this.BaseUrl = baseUrl || 'https://api.github.com';
    this.TimeoutMs = timeoutMs;
    this.fetch = fetchFn || ((...a) => globalThis.fetch(...a));
  }

  repo() { return this.Repositorio.trim().replace(/^\/+|\/+$/g, ''); }
  base() { return this.BaseUrl.replace(/\/+$/, ''); }
  urlArchivo() {
    const partes = (this.Ruta || 'datos.xml').replace(/^\/+|\/+$/g, '').split('/').map((p) => encodeURIComponent(p));
    return this.base() + '/repos/' + this.repo() + '/contents/' + partes.join('/');
  }

  async pedir(url, metodo = 'GET', cuerpo = null) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), this.TimeoutMs) : null;
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + this.Token.trim(),
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (cuerpo !== null) headers['Content-Type'] = 'application/json; charset=utf-8';
    try {
      const r = await this.fetch(url, { method: metodo, headers, body: cuerpo, cache: 'no-store', signal: ctl ? ctl.signal : undefined });
      const texto = await r.text();
      return { estado: r.status, texto };
    } catch (e) {
      return { estado: 0, texto: '', error: e };
    } finally { if (t) clearTimeout(t); }
  }

  fallo(codigo, cuerpo, error) {
    switch (codigo) {
      case 401: return new ErrorNube('token', 'GitHub no aceptó el token (puede haber vencido). Generá uno nuevo y pegalo en Ajustes → Sincronización.');
      case 403: case 429:
        if (/rate limit/i.test(cuerpo || '')) return new ErrorNube('limite', 'GitHub pidió esperar un rato (límite de pedidos). Se reintenta solo.');
        return new ErrorNube('permiso', 'El token no tiene permiso para escribir en «' + this.Repositorio + '». En GitHub, dale acceso a ese repositorio con «Contents: Read and write».');
      case 404: return new ErrorNube('repositorio', 'No encuentro el repositorio «' + this.Repositorio + '» (revisá el nombre y que el token tenga acceso a él).');
      case 0: return new ErrorNube('red', 'Sin conexión con GitHub' + (error && error.message ? ' (' + error.message + ')' : '') + '. Se reintenta solo.');
      default: return new ErrorNube('red', 'GitHub respondió con un error (' + codigo + '). Se reintenta solo.');
    }
  }

  async obtener() {
    const r = await this.pedir(this.urlArchivo() + '?t=' + Date.now());
    if (r.estado === 200) {
      const o = leerJson(r.texto);
      const sha = jTxt(o, 'sha');
      const contenido = jTxt(o, 'content');
      let texto;
      if (contenido.length > 0) texto = deBase64(contenido);
      else {
        // Archivos de más de 1 MB: la API de contenidos no trae el texto; se pide el blob
        const r2 = await this.pedir(this.base() + '/repos/' + this.repo() + '/git/blobs/' + sha);
        if (r2.estado !== 200) throw this.fallo(r2.estado, r2.texto, r2.error);
        texto = deBase64(jTxt(leerJson(r2.texto), 'content'));
      }
      return { Existe: true, Sha: sha, Contenido: texto };
    }
    if (r.estado === 404) {
      // ¿Falta el archivo o falta el repositorio? (un repo privado sin acceso también da 404)
      const r3 = await this.pedir(this.base() + '/repos/' + this.repo());
      if (r3.estado === 200) return { Existe: false, Sha: '', Contenido: '' };
      throw this.fallo(r3.estado, r3.texto, r3.error);
    }
    throw this.fallo(r.estado, r.texto, r.error);
  }

  async subir(contenido, shaAnterior, mensaje) {
    let cuerpo = '{"message":' + jsonTexto(mensaje) + ',"content":"' + aBase64(contenido) + '"';
    if (shaAnterior) cuerpo += ',"sha":' + jsonTexto(shaAnterior);
    cuerpo += '}';
    const r = await this.pedir(this.urlArchivo(), 'PUT', cuerpo);
    if (r.estado === 200 || r.estado === 201) {
      const o = leerJson(r.texto);
      return { Ok: true, Conflicto: false, Sha: jTxt(jCampo(o, 'content'), 'sha') };
    }
    if (r.estado === 409 || (r.estado === 422 && /sha/i.test(r.texto))) return { Ok: false, Conflicto: true, Sha: '' };
    throw this.fallo(r.estado, r.texto, r.error);
  }
}

// ---------------------------------------------------------------- Estado de este dispositivo
/** Configuración y memoria de la sincronización de ESTE dispositivo (no viaja a la nube). */
export class EstadoSync {
  constructor(o = {}) {
    this.Activa = false; this.Repositorio = ''; this.Ruta = 'datos.xml'; this.Token = ''; this.BaseUrl = 'https://api.github.com';
    this.Ranura = 0; this.NombreDispositivo = ''; this.Sha = ''; this.Revision = 0; this.BaseXml = ''; this.UltimaSync = null; this.UltimoError = '';
    Object.assign(this, o);
  }
  get TieneBase() { return !!this.BaseXml && !!this.Sha; }
  get Configurada() { return this.Repositorio.trim().length > 0 && this.Token.trim().length > 0; }
  base() { return this.BaseXml ? leerXml(this.BaseXml).raiz : null; }
  fijar(sha, contenido, revision) {
    this.Sha = sha; this.BaseXml = contenido; this.Revision = revision; this.UltimaSync = F.ahora(); this.UltimoError = '';
  }
  olvidar() { this.Sha = ''; this.BaseXml = ''; this.Revision = 0; this.UltimaSync = null; }
  clonar() { return new EstadoSync({ ...this }); }
  /** Para guardar (sin el token, que se guarda aparte y cifrado). */
  aObjeto() {
    const { Token, ...resto } = this;
    return resto;
  }
}

// ---------------------------------------------------------------- Sincronizador
export function validar(contenido) {
  let raiz;
  try { raiz = leerXml(contenido).raiz; } catch (e) {
    throw new ErrorNube('formato', 'El archivo de la nube no se puede leer (' + e.message + '). No se tocó nada.');
  }
  if (!raiz || raiz.nombre !== 'MisFinanzas') throw new ErrorNube('formato', 'El archivo de la nube no es de Mis Finanzas. No se tocó nada.');
  const v = parseInt(atr(raiz, 'Version'), 10) || 0;
  if (v > VERSION_ACTUAL) throw new ErrorNube('version', 'Los datos de la nube son de una versión más nueva de Mis Finanzas: actualizá la app (recargala desde Safari).');
  return raiz;
}

export function revisionDe(raiz) {
  if (!raiz) return 0;
  const s = atr(raiz, 'Revision');
  return /^\s*[+-]?\d+\s*$/.test(s) ? parseInt(s, 10) : 0;
}

/** Primera ranura libre (1..20) para un dispositivo que se suma a datos que ya existen. */
export function ranuraLibre(raiz) {
  const l = Libro.desdeElemento(raiz);
  const usadas = new Set(l.dispositivos.map((d) => d.Ranura));
  usadas.add(0);
  for (let r = 1; r <= 20; r++) if (!usadas.has(r) && l.maximoIdEn(r) === 0) return r;
  throw new ErrorNube('formato', 'Ya hay demasiados dispositivos registrados en estos datos.');
}

/** Texto del archivo tal como lo escribe la PC (con \r\n, como en Windows). */
export const textoDe = (raiz) => escribirXml(raiz, '\r\n');

export class Sincronizador {
  constructor(transporte, estado, { tipo = 'iPhone', esperar = null, hoy = null, ahora = null } = {}) {
    this.nube = transporte;
    this.estado = estado;
    this.TipoDispositivo = tipo;
    this.esperar = esperar || ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.hoyFijo = hoy;
    this.ahoraFijo = ahora;
  }
  get Hoy() { return this.hoyFijo !== null ? this.hoyFijo : F.hoy(); }
  get Ahora() { return this.ahoraFijo !== null ? this.ahoraFijo : F.ahora(); }

  /** Normaliza unos datos: los carga, completa lo que falte y quita duplicados automáticos. */
  normalizar(raiz, revision) {
    const l = Libro.desdeElemento(raiz);
    l.ranura = this.estado.Ranura;
    preparar(l);
    verificar(l, true);
    this.asegurarDispositivo(l);
    l.revision = revision;
    return l.aElemento(this.Ahora);
  }

  asegurarDispositivo(l) {
    let d = l.dispositivo(this.estado.Ranura);
    if (!d) {
      d = nuevo('Dispositivo', { Ranura: this.estado.Ranura, Alta: this.Hoy, Tipo: this.TipoDispositivo,
        ProximoId: this.estado.Ranura === 0 ? 0 : this.estado.Ranura * TAM_RANURA + 1 });
      l.dispositivos.push(d);
    }
    if (!d.Nombre || d.Nombre.startsWith('Dispositivo ')) d.Nombre = this.estado.NombreDispositivo;
    if (!d.Tipo) d.Tipo = this.TipoDispositivo;
  }

  mensaje(antes, despues) {
    const que = antes === null ? 'datos iniciales' : describirCambios(antes, despues);
    return 'Mis Finanzas · ' + (this.estado.NombreDispositivo || this.TipoDispositivo) + ': ' + que;
  }

  /**
   * Sincroniza. Devuelve { Accion, Nuevo (raíz o null), Fusion, RevisionNube, Remoto, Mensaje }.
   * Actualiza el estado (sha, revisión y base) pero no lo guarda.
   * permitirNubeVacia: si la nube está vacía, sube estos datos (en el iPhone sólo si el usuario lo pide).
   */
  async sincronizar(localXml, decision = DecisionInicial.Ninguna, { permitirNubeVacia = false } = {}) {
    const local = leerXml(localXml).raiz;
    for (let intento = 0; intento <= 5; intento++) {
      if (intento > 0) await this.esperar(400 * intento);
      const archivo = await this.nube.obtener();
      if (!archivo.Existe) {
        if (!permitirNubeVacia) {
          throw new ErrorNube('vacia', 'En el repositorio todavía no hay datos. Primero activá la sincronización en la PC (Configuración → iPhone y nube) para subirlos.');
        }
        if (!this.estado.TieneBase) this.estado.Ranura = 0;
        const rev0 = Math.max(this.estado.Revision, revisionDe(local)) + 1;
        const inicial = this.normalizar(local, rev0);
        const texto0 = textoDe(inicial);
        const r0 = await this.nube.subir(texto0, null, this.mensaje(null, inicial));
        if (r0.Conflicto) continue;
        this.estado.fijar(r0.Sha, texto0, rev0);
        return { Accion: AccionSync.Subido, Nuevo: inicial, RevisionNube: rev0, Fusion: null, Mensaje: 'Se subieron tus datos a la nube por primera vez.' };
      }
      const remoto = validar(archivo.Contenido);
      const revR = revisionDe(remoto);

      if (!this.estado.TieneBase) {
        if (decision === DecisionInicial.Ninguna) {
          return { Accion: AccionSync.PrimeraVez, Remoto: remoto, RevisionNube: revR, Nuevo: null, Fusion: null, Mensaje: 'En la nube ya hay datos de Mis Finanzas.' };
        }
        if (decision === DecisionInicial.UsarNube) {
          this.estado.Ranura = ranuraLibre(remoto);
          const n = this.normalizar(remoto, revR + 1);
          const t1 = textoDe(n);
          const r1 = await this.nube.subir(t1, archivo.Sha, this.mensaje(remoto, n));
          if (r1.Conflicto) continue;
          this.estado.fijar(r1.Sha, t1, revR + 1);
          return { Accion: AccionSync.Bajado, Nuevo: n, RevisionNube: revR + 1, Fusion: null, Mensaje: 'Se bajaron los datos de la nube.' };
        }
        if (decision === DecisionInicial.Combinar) {
          this.estado.Ranura = ranuraLibre(remoto);
          const destino = Libro.desdeElemento(remoto);
          destino.ranura = this.estado.Ranura;
          const inf = combinar(destino, Libro.desdeElemento(local));
          const n = this.normalizar(destino.aElemento(this.Ahora), revR + 1);
          const t2 = textoDe(n);
          const r2 = await this.nube.subir(t2, archivo.Sha, this.mensaje(remoto, n));
          if (r2.Conflicto) continue;
          this.estado.fijar(r2.Sha, t2, revR + 1);
          return { Accion: AccionSync.Fusionado, Nuevo: n, RevisionNube: revR + 1, Fusion: null,
            Mensaje: 'Se combinaron los datos de este iPhone con los de la nube: ' + inf.texto() };
        }
        if (decision === DecisionInicial.SubirLocal) {
          this.estado.Ranura = 0;
          const n = this.normalizar(local, revR + 1);
          const t3 = textoDe(n);
          const r3 = await this.nube.subir(t3, archivo.Sha, this.mensaje(remoto, n));
          if (r3.Conflicto) continue;
          this.estado.fijar(r3.Sha, t3, revR + 1);
          return { Accion: AccionSync.Subido, Nuevo: n, RevisionNube: revR + 1, Fusion: null,
            Mensaje: 'Los datos de este iPhone reemplazaron a los de la nube (los anteriores quedan en el historial del repositorio).' };
        }
      }

      const baseDoc = this.estado.base();
      if (archivo.Sha === this.estado.Sha) {
        // La nube no cambió desde la última vez
        if (mismosDatos(local, baseDoc)) return { Accion: AccionSync.AlDia, RevisionNube: revR, Nuevo: null, Fusion: null, Mensaje: '' };
        const rev = Math.max(this.estado.Revision, revR) + 1;
        const subir = this.normalizar(local, rev);
        const t4 = textoDe(subir);
        const r4 = await this.nube.subir(t4, archivo.Sha, this.mensaje(baseDoc, subir));
        if (r4.Conflicto) continue;
        this.estado.fijar(r4.Sha, t4, rev);
        return { Accion: AccionSync.Subido, Nuevo: subir, RevisionNube: rev, Fusion: null, Mensaje: '' };
      }
      if (revR < this.estado.Revision) continue;   // GitHub devolvió una versión anterior (caché): se vuelve a pedir
      const fus = fusionar(baseDoc, local, remoto, this.Ahora);
      const fusionado = this.normalizar(fus.Doc, revR);
      fus.Doc = fusionado;
      if (mismosDatos(fusionado, remoto)) {
        this.estado.fijar(archivo.Sha, archivo.Contenido, revR);
        return { Accion: mismosDatos(local, remoto) ? AccionSync.AlDia : AccionSync.Bajado, Nuevo: fusionado, Fusion: fus, RevisionNube: revR, Mensaje: '' };
      }
      const revN = revR + 1;
      const aSubir = this.normalizar(fus.Doc, revN);
      const t5 = textoDe(aSubir);
      const r5 = await this.nube.subir(t5, archivo.Sha, this.mensaje(remoto, aSubir));
      if (r5.Conflicto) continue;
      this.estado.fijar(r5.Sha, t5, revN);
      return { Accion: fus.CambiosRemotos > 0 ? AccionSync.Fusionado : AccionSync.Subido, Nuevo: aSubir, Fusion: fus, RevisionNube: revN, Mensaje: '' };
    }
    return { Accion: AccionSync.Reintentar, Nuevo: null, Fusion: null, Mensaje: 'La nube cambió varias veces seguidas; se vuelve a intentar en un rato.' };
  }
}
