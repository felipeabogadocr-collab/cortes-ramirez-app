// Funciones puras (sin dependencias del navegador ni de React) usadas en
// varias pestañas — separadas de App.jsx para poder importarlas en pruebas
// automatizadas sin arrastrar todo el árbol de componentes.

export function diasDesde(fechaISO) {
  if (!fechaISO) return null;
  const ms = Date.now() - new Date(fechaISO).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function diasHasta(fechaISO) {
  if (!fechaISO) return null;
  const ms = new Date(fechaISO).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function calcularProximaFechaPorFrecuencia(fechaBaseStr, frecuencia) {
  const fecha = new Date(`${fechaBaseStr}T12:00:00`);
  if (frecuencia === "Semanal") fecha.setDate(fecha.getDate() + 7);
  else if (frecuencia === "Quincenal") fecha.setDate(fecha.getDate() + 15);
  else if (frecuencia === "Mensual") fecha.setMonth(fecha.getMonth() + 1);
  return fecha.toISOString().slice(0, 10);
}

export function formatoCOP(valor) {
  const numero = Number(valor) || 0;
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(numero);
}

export function calcularEstado(firmantes) {
  const abogadoFirmo = (firmantes || []).some((f) => f.rol === "abogado");
  const clienteFirmo = (firmantes || []).some((f) => f.rol !== "abogado");
  if (abogadoFirmo && clienteFirmo) return "listo";
  if (clienteFirmo) return "falta_abogado";
  return "pendiente";
}

export function numeroWhatsappCliente(telefono) {
  const digitos = (telefono || "").replace(/[^0-9]/g, "");
  if (!digitos) return "";
  return digitos.length <= 10 ? `57${digitos}` : digitos;
}

export function textoEstadoPago(dias) {
  if (dias < 0) return `Atrasado ${Math.abs(dias)} día${Math.abs(dias) !== 1 ? "s" : ""}`;
  if (dias === 0) return "Debe pagar hoy";
  return `Debe pagar en ${dias} día${dias !== 1 ? "s" : ""}`;
}

// Tope de tamaño para cualquier archivo que el navegador procese (subida de
// documentos, adjuntos al asistente con IA): protege contra que un archivo
// enorme (a propósito o por error) trabe la pestaña convirtiéndolo a base64,
// o dispare un cobro innecesario al enviarlo entero a la IA.
export const TAMANO_MAX_ARCHIVO_MB = 8;

export function archivoDemasiadoGrande(file) {
  return file.size > TAMANO_MAX_ARCHIVO_MB * 1024 * 1024;
}

export const SECCIONES_PERMISOS = [
  { id: "resumen", nombre: "Resumen" },
  { id: "agenda", nombre: "Agenda" },
  { id: "clientes", nombre: "Clientes" },
  { id: "vigilancia", nombre: "Vigilancia judicial" },
  { id: "contabilidad", nombre: "Contabilidad" },
  { id: "contenido", nombre: "Calendario de contenido" },
  { id: "documentos", nombre: "Firmar documentos" },
  { id: "reportes", nombre: "Reportes" },
];

export function permisosPorDefecto(rol) {
  const todos = Object.fromEntries(SECCIONES_PERMISOS.map((s) => [s.id, true]));
  if (rol === "Administrador" || rol === "Abogado") return todos;
  return { resumen: true, agenda: true, clientes: true, casos: true, vigilancia: false, contabilidad: false, contenido: false, documentos: true, reportes: false };
}

export const NOTIF_CATEGORIAS = [
  { id: "firmas", nombre: "Firmas nuevas" },
  { id: "clientes", nombre: "Clientes sin actividad" },
  { id: "pagos", nombre: "Pagos pendientes" },
  { id: "contenido", nombre: "Contenido pendiente o vencido" },
  { id: "vigilancia", nombre: "Novedades judiciales" },
  { id: "radicados", nombre: "Clientes sin radicado" },
];

export function notificacionesPorDefecto() {
  return Object.fromEntries(NOTIF_CATEGORIAS.map((n) => [n.id, true]));
}
