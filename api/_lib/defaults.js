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

// Validación básica de formato (no exhaustiva a propósito): rechaza basura
// obvia antes de que llegue a Supabase Auth o a un correo, sin bloquear
// direcciones raras pero válidas.
export function esEmailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

// Exige al menos 10 caracteres, una letra y un número — evita contraseñas
// triviales tipo "12345678" sin ser tan estricto como para frustrar al
// usuario con símbolos obligatorios.
export function validarContrasena(contrasena) {
  if (!contrasena || contrasena.length < 10) {
    return "La contraseña debe tener al menos 10 caracteres";
  }
  if (!/[a-zA-Z]/.test(contrasena) || !/[0-9]/.test(contrasena)) {
    return "La contraseña debe combinar letras y números";
  }
  return null;
}
