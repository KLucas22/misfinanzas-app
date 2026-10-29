// ============================================================================
//  XML mínimo para datos.xml: lee y escribe exactamente como la PC (.NET XDocument):
//  sangría de 2 espacios, atributos entre comillas dobles, "<X />" si no tiene hijos
//  y los mismos escapes (&amp; &lt; &gt; &quot; &#xA; &#xD; &#x9;).
// ============================================================================

export class Elemento {
  constructor(nombre, attrs = [], hijos = []) {
    this.nombre = nombre;
    this.attrs = attrs;   // [[nombre, valor], ...] en orden
    this.hijos = hijos;
  }
  attr(n) {
    for (const a of this.attrs) if (a[0] === n) return a[1];
    return null;
  }
  tiene(n) { return this.attrs.some((a) => a[0] === n); }
  fijar(n, v) {
    for (const a of this.attrs) if (a[0] === n) { a[1] = v; return; }
    this.attrs.push([n, v]);
  }
  quitar(n) { this.attrs = this.attrs.filter((a) => a[0] !== n); }
  hijo(n) { return this.hijos.find((h) => h.nombre === n) || null; }
  hijosLlamados(n) { return this.hijos.filter((h) => h.nombre === n); }
  clonar() { return new Elemento(this.nombre, this.attrs.map((a) => [a[0], a[1]]), this.hijos.map((h) => h.clonar())); }
}

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decodificar(s) {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTIDADES[e];
  });
}

/** Lee un documento. Devuelve { raiz: Elemento } o lanza un error con un mensaje claro. */
export function leerXml(texto) {
  let s = String(texto);
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  let i = 0;
  const n = s.length;
  const pila = [];
  let raiz = null;
  const error = (msg) => { throw new SyntaxError('XML inválido: ' + msg + ' (posición ' + i + ')'); };
  while (i < n) {
    const lt = s.indexOf('<', i);
    if (lt < 0) break;
    // Texto entre etiquetas: sólo se admiten espacios (este formato no tiene texto)
    i = lt;
    if (s.startsWith('<?', i)) { const fin = s.indexOf('?>', i); if (fin < 0) error('declaración sin cerrar'); i = fin + 2; continue; }
    if (s.startsWith('<!--', i)) { const fin = s.indexOf('-->', i); if (fin < 0) error('comentario sin cerrar'); i = fin + 3; continue; }
    if (s.startsWith('<!', i)) { const fin = s.indexOf('>', i); i = fin + 1; continue; }
    if (s.startsWith('</', i)) {
      const fin = s.indexOf('>', i);
      if (fin < 0) error('etiqueta sin cerrar');
      const nombre = s.slice(i + 2, fin).trim();
      const abierto = pila.pop();
      if (!abierto || abierto.nombre !== nombre) error('cierre inesperado </' + nombre + '>');
      i = fin + 1;
      continue;
    }
    // Etiqueta de apertura
    let j = i + 1;
    while (j < n && !/[\s/>]/.test(s[j])) j++;
    const nombre = s.slice(i + 1, j);
    if (!nombre) error('etiqueta sin nombre');
    const el = new Elemento(nombre);
    while (true) {
      while (j < n && /\s/.test(s[j])) j++;
      if (j >= n) error('fin inesperado');
      if (s[j] === '/') {
        if (s[j + 1] !== '>') error('se esperaba />');
        j += 2;
        if (pila.length) pila[pila.length - 1].hijos.push(el); else if (!raiz) raiz = el; else error('más de una raíz');
        break;
      }
      if (s[j] === '>') {
        j += 1;
        if (pila.length) pila[pila.length - 1].hijos.push(el); else if (!raiz) raiz = el; else error('más de una raíz');
        pila.push(el);
        break;
      }
      let k = j;
      while (k < n && s[k] !== '=' && !/\s/.test(s[k])) k++;
      const an = s.slice(j, k);
      while (k < n && /\s/.test(s[k])) k++;
      if (s[k] !== '=') error('atributo sin valor: ' + an);
      k++;
      while (k < n && /\s/.test(s[k])) k++;
      const q = s[k];
      if (q !== '"' && q !== "'") error('valor sin comillas: ' + an);
      const fin = s.indexOf(q, k + 1);
      if (fin < 0) error('valor sin cerrar: ' + an);
      // Los saltos de línea literales en un atributo se normalizan a espacio (como cualquier lector XML)
      const crudo = s.slice(k + 1, fin).replace(/[\r\n\t]/g, ' ');
      el.attrs.push([an, decodificar(crudo)]);
      j = fin + 1;
    }
    i = j;
  }
  if (pila.length) error('falta cerrar <' + pila[pila.length - 1].nombre + '>');
  if (!raiz) error('documento vacío');
  return { raiz };
}

function escaparAtributo(v) {
  let r = '';
  for (const ch of String(v)) {
    switch (ch) {
      case '&': r += '&amp;'; break;
      case '<': r += '&lt;'; break;
      case '>': r += '&gt;'; break;
      case '"': r += '&quot;'; break;
      case '\n': r += '&#xA;'; break;
      case '\r': r += '&#xD;'; break;
      case '\t': r += '&#x9;'; break;
      default: r += ch;
    }
  }
  return r;
}

export const COMENTARIO = ' Datos de Mis Finanzas. Se puede abrir con el Bloc de notas, pero conviene editar desde la aplicación. ';

/** Escribe el documento igual que la PC (Windows usa \r\n). */
export function escribirXml(raiz, nl = '\r\n', comentario = COMENTARIO) {
  const partes = ['<?xml version="1.0" encoding="utf-8" standalone="yes"?>', nl];
  if (comentario !== null) partes.push('<!--', comentario, '-->', nl);
  const escribir = (el, sangria) => {
    partes.push(sangria, '<', el.nombre);
    for (const [a, v] of el.attrs) partes.push(' ', a, '="', escaparAtributo(v), '"');
    if (el.hijos.length === 0) { partes.push(' />'); return; }
    partes.push('>');
    for (const h of el.hijos) { partes.push(nl); escribir(h, sangria + '  '); }
    partes.push(nl, sangria, '</', el.nombre, '>');
  };
  escribir(raiz, '');
  return partes.join('');
}
