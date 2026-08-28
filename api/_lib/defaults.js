// Copia servidor de los mismos valores por defecto que usa src/App.jsx
// (permisosPorDefecto / notificacionesPorDefecto), para no depender del
// bundle del frontend dentro de una función serverless.

const SECCIONES_PERMISOS = ["resumen", "clientes", "vigilancia", "contabilidad", "contenido", "documentos"];

export function permisosPorDefecto(rol) {
  if (rol === "Administrador" || rol === "Abogado") {
    return Object.fromEntries(SECCIONES_PERMISOS.map((s) => [s, true]));
  }
  return { resumen: true, clientes: true, vigilancia: false, contabilidad: false, contenido: false, documentos: true };
}

export function notificacionesPorDefecto() {
  return { firmas: true, clientes: true, pagos: true, contenido: true };
}
