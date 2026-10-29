// ============================================================================
//  Categorías: las de siempre y la sugerencia según la descripción (Categorias.vb)
// ============================================================================

import { Fmt } from './formato.js';
import { nuevo } from './modelo.js';

export const OTROS = 'Otros';
export const OTROS_INGRESOS = 'Otros ingresos';
export const AJUSTES = 'Ajustes de saldo';

const REGLAS = [
  ['Transporte', ['SUBE', 'SUBTE', 'UBER', 'DIDI', 'CABIFY', 'TAXI', 'REMIS', 'NAFTA', 'YPF', 'SHELL', 'AXION', 'PUMA', 'PEAJE', 'TREN', 'COLECTIVO', 'ESTACIONAMIENTO', 'AUTOPISTA', 'BICI']],
  ['Supermercado', ['COTO', 'CARREFOUR', 'JUMBO', 'DISCO', 'CHANGOMAS', 'VEA', 'DIA ', 'SUPER', 'CHINO', 'VERDULERIA', 'CARNICERIA', 'ALMACEN', 'MAYORISTA', 'VITAL', 'MAKRO', 'LA ANONIMA']],
  ['Comida y salidas', ['PIZZA', 'CENA', 'ALMUERZO', 'RESTO', 'BAR ', 'CAFE', 'SABROSSIMO', 'MCDONALD', 'BURGER', 'MOSTAZA', 'RAPPI', 'PEDIDOSYA', 'PEDIDOS YA', 'HELADO', 'DELIVERY', 'PARRILLA', 'SUSHI', 'EMPANADA', 'STARBUCKS', 'CERVEZA', 'BOLICHE']],
  ['Kiosco y antojos', ['KIOSCO', 'KIOSKO', 'GOLOSINA', 'ALFAJOR', 'PANADERIA', 'FACTURAS']],
  ['Servicios', ['MOVISTAR', 'PERSONAL', 'CLARO', 'TELECENTRO', 'FIBERTEL', 'EDENOR', 'EDESUR', 'METROGAS', 'NATURGY', 'AYSA', 'LUZ', 'GAS', 'INTERNET', 'TELEFONO', 'CELULAR L', 'ABL', 'MUNICIPAL']],
  ['Suscripciones', ['NETFLIX', 'SPOTIFY', 'DISNEY', 'HBO', 'MAX ', 'PRIME', 'YOUTUBE', 'XBOX', 'PLAYSTATION', 'PS PLUS', 'DISCORD', 'F1TV', 'F1 TV', 'ADOBE', 'GOOGLE', 'ANTHROPIC', 'CLAUDE', 'CHATGPT', 'OPENAI', 'TWITTER', 'ICLOUD', 'APPLE', 'MELI', 'PARAMOUNT', 'CRUNCHYROLL', 'STAR+', 'DAZN', 'TWITCH', 'PATREON', 'MICROSOFT', 'OFFICE', 'CANVA', 'NOTION']],
  ['Tecnología', ['TECLADO', 'MOUSE', 'CELULAR', 'NOTEBOOK', 'AURICULAR', 'MONITOR', 'TABLET', 'CARGADOR', 'PENDRIVE', 'DISCO SSD', 'PC ', 'PLACA', 'JOYSTICK', 'CONSOLA']],
  ['Ropa', ['REMERA', 'ZAPATILLA', 'PANTALON', 'ROPA', 'CAMPERA', 'BUZO', 'CAMISA', 'JEAN', 'MEDIAS', 'CALZADO', 'ZAPATO', 'SHORT', 'VESTIDO']],
  ['Regalos y fiestas', ['JUGUETERIA', 'REGALO', 'HALLOWEEN', 'DECOFIESTA', 'CUMPLE', 'COTILLON', 'NAVIDAD', 'FIESTA', 'FLORES']],
  ['Salud', ['FARMACIA', 'MEDICO', 'OSDE', 'SWISS', 'GALENO', 'PREPAGA', 'OBRA SOCIAL', 'DENTISTA', 'ODONTO', 'ANALISIS', 'CLINICA', 'OPTICA']],
  ['Vivienda', ['ALQUILER', 'EXPENSAS', 'FERRETERIA', 'PINTURERIA', 'MUEBLE', 'HOGAR', 'LIMPIEZA']],
  ['Educación', ['FACULTAD', 'UBA', 'CURSO', 'LIBRO', 'APUNTE', 'FOTOCOPIA', 'LIBRERIA', 'INGLES', 'UDEMY', 'COURSERA']],
  ['Entretenimiento', ['CINE', 'TEATRO', 'RECITAL', 'ENTRADA', 'STEAM', 'JUEGO', 'PARTIDO', 'CANCHA', 'FUTBOL', 'BOWLING', 'PADEL']],
  ['Viajes', ['HOTEL', 'AIRBNB', 'VUELO', 'AEROLINEAS', 'FLYBONDI', 'JETSMART', 'DESPEGAR', 'MICRO', 'BOOKING', 'PASAJE']],
  ['Cuidado personal', ['PELUQUERIA', 'BARBERIA', 'PERFUME', 'GIMNASIO', 'GYM', 'MEGATLON', 'SMARTFIT', 'COSMETIC']],
  ['Impuestos y comisiones', ['IVA', 'SELLOS', 'COMISION', 'MANTENIMIENTO', 'IMPUESTO', 'PERCEPCION', 'INTERES', 'ARCA', 'AFIP', 'MONOTRIBUTO']],
];

const REGLAS_INGRESO = [
  ['Sueldo', ['SUELDO', 'SALARIO', 'HABERES', 'GRANT', 'NOMINA']],
  ['Aguinaldo', ['AGUINALDO', 'SAC']],
  ['Rendimientos', ['RENDIMIENTO', 'INTERES', 'PLAZO FIJO', 'FCI', 'DIVIDENDO']],
  ['Reintegros', ['REINTEGRO', 'DEVOLUCION', 'CASHBACK', 'BONIFICACION']],
  ['Trabajos extra', ['FREELANCE', 'HONORARIO', 'CLASE', 'TRABAJO', 'FACTURA']],
];

/** Sugiere categoría: primero lo que usaste antes con esa descripción, después reglas. */
export function sugerir(descripcion, l, esIngreso) {
  const n = Fmt.normalizar(descripcion);
  if (!n.length) return esIngreso ? OTROS_INGRESOS : OTROS;
  let previo = null;
  for (const m of l.movimientos) {
    if ((m.Tipo === 'Ingreso') !== esIngreso || (m.Tipo !== 'Gasto' && m.Tipo !== 'Ingreso') || !m.Categoria) continue;
    if (Fmt.normalizar(m.Descripcion) !== n) continue;
    if (!previo || m.Fecha > previo.Fecha) previo = m;
  }
  if (previo) return previo.Categoria;
  const texto = ' ' + n + ' ';
  for (const [cat, palabras] of esIngreso ? REGLAS_INGRESO : REGLAS) {
    for (const p of palabras) {
      if (texto.includes(' ' + p) || texto.includes(p + ' ') || n === p.trim() || n.startsWith(p.trim())) return cat;
    }
  }
  return esIngreso ? OTROS_INGRESOS : OTROS;
}

const PALETA = [-15817239, -429290, -7643914, -15681151, -2024120, -10262799, -680437, -15419226];

/** Agrega la categoría si no existe. */
export function asegurar(l, nombre, esIngreso) {
  if (!nombre || !nombre.trim()) return esIngreso ? OTROS_INGRESOS : OTROS;
  const c = l.categoria(nombre.trim());
  if (c) return c.Nombre;
  l.categorias.push(nuevo('Categoria', { Nombre: nombre.trim(), EsIngreso: esIngreso, ColorArgb: PALETA[l.categorias.length % PALETA.length] }));
  return nombre.trim();
}

export function colorDe(l, nombre) {
  const c = l.categoria(nombre);
  return !c || c.ColorArgb === 0 ? -7035976 : c.ColorArgb;
}

export function esEsencial(l, nombre) {
  const c = l.categoria(nombre);
  return !!c && c.Esencial;
}
