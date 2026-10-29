// Íconos de línea (24×24) dibujados para la app.
const RUTAS = {
  inicio: '<path d="M3.5 10.6 12 3.8l8.5 6.8V19a1.5 1.5 0 0 1-1.5 1.5h-4.2v-5.6H9.2v5.6H5A1.5 1.5 0 0 1 3.5 19z"/>',
  movimientos: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1.1" fill="currentColor"/><circle cx="4" cy="12" r="1.1" fill="currentColor"/><circle cx="4" cy="18" r="1.1" fill="currentColor"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  agenda: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><circle cx="8.5" cy="14.5" r="1" fill="currentColor"/><circle cx="12" cy="14.5" r="1" fill="currentColor"/>',
  menu: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8"/>',
  tarjeta: '<rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><path d="M2.5 9.5h19M6 15h4"/>',
  cuenta: '<path d="M3 9.5 12 4l9 5.5M4.5 10v8M9.5 10v8M14.5 10v8M19.5 10v8M3 20.5h18"/>',
  fijos: '<path d="M17 2.8 20.2 6 17 9.2"/><path d="M4 11V9.8A3.8 3.8 0 0 1 7.8 6h12.4M7 21.2 3.8 18 7 14.8"/><path d="M20 13v1.2a3.8 3.8 0 0 1-3.8 3.8H3.8"/>',
  historial: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  inversiones: '<path d="m3.5 17 6-6 4 4 7-7.5"/><path d="M14.5 7.5h6v6"/>',
  estudio: '<path d="M2.5 9 12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11v5c0 1.3 2.5 3 5.5 3s5.5-1.7 5.5-3v-5M21.5 9v6"/>',
  ajustes: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  nube: '<path d="M7 18.5h10.2a4 4 0 0 0 .6-8 6 6 0 0 0-11.5 1.7A3.2 3.2 0 0 0 7 18.5z"/>',
  nubeOk: '<path d="M7 18.5h10.2a4 4 0 0 0 .6-8 6 6 0 0 0-11.5 1.7A3.2 3.2 0 0 0 7 18.5z"/><path d="m9.3 13.6 2 2 3.6-3.8"/>',
  nubeError: '<path d="M7 18.5h10.2a4 4 0 0 0 .6-8 6 6 0 0 0-11.5 1.7A3.2 3.2 0 0 0 7 18.5z"/><path d="M12 10.5v3M12 16v.2"/>',
  sincronizando: '<path d="M20 12a8 8 0 0 1-13.7 5.6M4 12a8 8 0 0 1 13.7-5.6"/><path d="M18 3v4h-4M6 21v-4h4"/>',
  buscar: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  cerrar: '<path d="M6 6l12 12M18 6 6 18"/>',
  borrar: '<path d="M4.5 7h15M10 11v6M14 11v6M6 7l1 12.5A1.6 1.6 0 0 0 8.6 21h6.8a1.6 1.6 0 0 0 1.6-1.5L18 7M9 7V4.5h6V7"/>',
  editar: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  derecha: '<path d="m9 5 7 7-7 7"/>',
  izquierda: '<path d="m15 5-7 7 7 7"/>',
  atras: '<path d="m14.5 5-7 7 7 7"/>',
  abajo: '<path d="m5 9 7 7 7-7"/>',
  reloj: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  alerta: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17v.2"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>',
  tablero: '<rect x="3.5" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="16.5" y="4" width="4" height="7" rx="1.5"/>',
  repetir: '<path d="M17 2.8 20.2 6 17 9.2"/><path d="M4 11V9.8A3.8 3.8 0 0 1 7.8 6h12.4M7 21.2 3.8 18 7 14.8"/><path d="M20 13v1.2a3.8 3.8 0 0 1-3.8 3.8H3.8"/>',
  gasto: '<path d="M12 4v16M6 14l6 6 6-6"/>',
  ingreso: '<path d="M12 20V4M6 10l6-6 6 6"/>',
  transferencia: '<path d="M4 8h15M15 4l4 4-4 4M20 16H5M9 12l-4 4 4 4"/>',
  pago: '<rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><path d="m8 12.5 2.5 2.5 5-5"/>',
  ajuste: '<path d="M5 9h14M5 15h14"/>',
  dolar: '<path d="M12 3v18M16.5 7.5c-.6-1.6-2.3-2.5-4.5-2.5-2.6 0-4.5 1.3-4.5 3.3 0 4.8 9.5 2.4 9.5 7.3 0 2.1-2 3.4-5 3.4-2.4 0-4.2-1-5-2.8"/>',
  compartir: '<path d="M12 3.5v11M8 7.5l4-4 4 4"/><path d="M6.5 11H5.5A1.5 1.5 0 0 0 4 12.5v6A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-6a1.5 1.5 0 0 0-1.5-1.5h-1"/>',
  archivo: '<path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5M9 13h6M9 16.5h6"/>',
  meta: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  casa: '<path d="M3.5 10.6 12 3.8l8.5 6.8V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19z"/>',
  luna: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  libro: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>',
  tarjetasRepaso: '<rect x="3.5" y="7" width="13" height="13" rx="2"/><path d="M7.5 7V5.5A1.5 1.5 0 0 1 9 4h10a1.5 1.5 0 0 1 1.5 1.5v10A1.5 1.5 0 0 1 19 17h-2.5"/>',
  copia: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
  llave: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8.5-8.5M16.5 6.5l2.5 2.5M14 9l2 2"/>',
  pausa: '<path d="M9 5v14M15 5v14"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  filtro: '<path d="M4 5h16l-6 7.5V19l-4 1.5v-8z"/>',
  grafico: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
};

export function icono(nombre, clase = '') {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  if (clase) svg.setAttribute('class', clase);
  svg.innerHTML = RUTAS[nombre] || RUTAS.info;
  return svg;
}
