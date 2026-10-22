import { useState, useEffect, useRef, useCallback, useMemo, Fragment, Component, lazy, Suspense } from "react";
// Dos copias del mismo logo, a propósito: la pantalla (<img>, el <canvas>
// del recibo) usa el WebP — mismos píxeles exactos (sin pérdida), pero 43%
// más liviano, y se descarga en CADA visita a la app. El PNG original se
// deja intacto y solo se usa para incrustarlo en PDF/Word (jsPDF.addImage
// SÍ soporta WebP, pero la librería "docx" no — cambiar el formato ahí
// habría roto los contratos en Word), y ese solo se descarga cuando
// alguien de verdad genera un recibo o documento, no en cada carga.
import logoNomosUrl from "./assets/logo-nomos-pantalla.webp";
import logoNomosDocUrl from "./assets/logo-nomos.png";

// Contabilidad es, de lejos, la pestaña más pesada de la app (formularios de
// pago/egresos/otros ingresos, recibos, gráficas...) — cargarla solo cuando
// alguien realmente abre esa pestaña, en vez de siempre al entrar a Nomos,
// hace que el resto de la app arranque más rápido.
import RecorridoGuiado, { construirPasosRecorrido } from "./views/RecorridoGuiado.jsx";
const ContabilidadTab = lazy(() => import("./tabs/ContabilidadTab.jsx"));
const CalculadoraTab = lazy(() => import("./tabs/CalculadoraTab.jsx"));
const AgendaTab = lazy(() => import("./tabs/AgendaTab.jsx"));
const ClientesTab = lazy(() => import("./tabs/ClientesTab.jsx"));
const VigilanciaTab = lazy(() => import("./tabs/VigilanciaTab.jsx"));
const AntecedentesTab = lazy(() => import("./tabs/AntecedentesTab.jsx"));
const ReportesTab = lazy(() => import("./tabs/ReportesTab.jsx"));
const ContenidoTab = lazy(() => import("./tabs/ContenidoTab.jsx"));
const DocumentosTab = lazy(() => import("./tabs/DocumentosTab.jsx"));
const PlataformaTab = lazy(() => import("./tabs/PlataformaTab.jsx"));
const UsuariosPermisosTab = lazy(() => import("./tabs/UsuariosPermisosTab.jsx"));
// La landing pública (~900 líneas de mercadeo) tampoco hace falta para
// alguien que ya inició sesión — mismo motivo que las pestañas de arriba.
const LandingPage = lazy(() => import("./views/LandingPage.jsx"));
const VistaFirma = lazy(() => import("./views/VistaFirma.jsx"));
const VistaPortalCliente = lazy(() => import("./views/VistaPortalCliente.jsx"));
const PoliticaPrivacidad = lazy(() => import("./views/PoliticaPrivacidad.jsx"));
const TerminosUso = lazy(() => import("./views/TerminosUso.jsx"));
const VistaDiagnostico = lazy(() => import("./views/VistaDiagnostico.jsx"));
// El asistente, "Mi despacho" y las notificaciones se descargan la primera vez
// que se abren, no en cada ingreso al panel.
const AsistenteIALazy = lazy(() => import("./panel/AsistenteIA.jsx"));
const PanelTareasLazy = lazy(() => import("./panel/Tareas.jsx"));
const PanelMiDespachoLazy = lazy(() => import("./panel/PanelMiDespacho.jsx"));
const ModalNotificacionesLazy = lazy(() => import("./panel/ModalNotificaciones.jsx"));
function AsistenteIA(props) {
  return (
    <Suspense fallback={<div style={{ display: "flex", justifyContent: "center", padding: 24 }}><Spinner /></div>}>
      <AsistenteIALazy {...props} />
    </Suspense>
  );
}
function PanelMiDespacho(props) {
  return (
    <Suspense fallback={null}>
      <PanelMiDespachoLazy {...props} />
    </Suspense>
  );
}
function ModalNotificaciones(props) {
  return (
    <Suspense fallback={null}>
      <ModalNotificacionesLazy {...props} />
    </Suspense>
  );
}
import { supabase } from "./lib/supabaseClient";
import {
  APP_VERSION, AlEntrar, BotonTema, COLORS, COLOR_AREA_PROCESO, Card, CargandoSeccion, EstadoBadge, FUNCIONES_LANDING, Field, GlobalStyle, ICONOS_SEGURIDAD_ORDEN, ICONOS_TAB, Icono, IconoLuna, IconoNomos, IconoSeguridad, IconoSol, IconoTab, InsigniaPlataforma, Kicker, NUMERO_WHATSAPP_DESPACHO, PLANES_PRECIO, PantallaCargaInicial, SEGURIDAD_LANDING, Spinner, TIPOS_ID, TexturaGrano, VistaPreviaAnimada, buttonGhost, buttonPrimary, fechaHoyISO, footerLinkStyle, inputStyle, navLinkStyle, sha256Hex, useTema,
} from "./ui/base.jsx";
export {
  APP_VERSION, AlEntrar, BotonTema, COLORS, COLOR_AREA_PROCESO, Card, EstadoBadge, FUNCIONES_LANDING, Field, GlobalStyle, ICONOS_SEGURIDAD_ORDEN, ICONOS_TAB, Icono, IconoLuna, IconoNomos, IconoSeguridad, IconoSol, IconoTab, InsigniaPlataforma, Kicker, NUMERO_WHATSAPP_DESPACHO, PLANES_PRECIO, SEGURIDAD_LANDING, Spinner, TIPOS_ID, TexturaGrano, VistaPreviaAnimada, buttonGhost, buttonPrimary, fechaHoyISO, footerLinkStyle, inputStyle, navLinkStyle, sha256Hex, useTema,
} from "./ui/base.jsx";
import { DocumentoTextoConFirmas, SelloFirma } from "./ui/firma.jsx";
export { DocumentoTextoConFirmas, SelloFirma } from "./ui/firma.jsx";
import { contrasenaFiltrada } from "./lib/pwnedPassword.js";
import { generarCuotasAcuerdoPago } from "./lib/contabilidadCalculos.js";
import {
  diasDesde, diasHasta, calcularProximaFechaPorFrecuencia, formatoCOP, calcularEstado,
  numeroWhatsappCliente, textoEstadoPago, TAMANO_MAX_ARCHIVO_MB, archivoDemasiadoGrande,
  SECCIONES_PERMISOS, permisosPorDefecto, NOTIF_CATEGORIAS, notificacionesPorDefecto,
  radicadosDeCliente,
} from "./lib/utils.js";
export {
  diasDesde, diasHasta, calcularProximaFechaPorFrecuencia, formatoCOP, calcularEstado,
  numeroWhatsappCliente, textoEstadoPago, TAMANO_MAX_ARCHIVO_MB, archivoDemasiadoGrande,
  SECCIONES_PERMISOS, permisosPorDefecto, NOTIF_CATEGORIAS, notificacionesPorDefecto,
  radicadosDeCliente,
};

// IDs de documentos/clientes/casos: son la única "llave" de enlaces públicos
// sin sesión (firma electrónica, portal del cliente) — por eso se generan
// con el generador criptográfico del navegador (crypto.getRandomValues), no
// con Math.random(), que no da garantías de impredecibilidad. Se usa un
// alfabeto de 32 símbolos sin caracteres ambiguos (sin 0/O, 1/I/L) porque
// el código se comparte por WhatsApp para que la persona lo escriba a mano.
const ALFABETO_UID = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const uid = () => {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += ALFABETO_UID[bytes[i] % ALFABETO_UID.length];
  return out;
};

// Misma regla que api/_lib/defaults.js (validarContrasena) — se valida acá
// también para no gastar una llamada de red si la contraseña ya se ve mal.
function validarContrasenaCliente(contrasena) {
  if (!contrasena || contrasena.length < 10) return "La contraseña debe tener al menos 10 caracteres";
  if (!/[a-zA-Z]/.test(contrasena) || !/[0-9]/.test(contrasena)) return "La contraseña debe combinar letras y números";
  return null;
}

// Registro de auditoría: quién hizo qué y cuándo, visible solo para
// Administradores. Si falla (sin conexión, sin sesión, etc.) no bloquea la
// acción que se estaba auditando — solo se pierde ese registro.
export async function registrarAuditoria(usuarioActual, accion, entidad, entidadId, detalle) {
  try {
    await supabase.from("auditoria").insert({
      usuario_id: usuarioActual?.id || null,
      usuario_nombre: usuarioActual?.nombre || null,
      despacho_id: usuarioActual?.despacho_id || null,
      accion,
      entidad: entidad || null,
      entidad_id: entidadId || null,
      detalle: detalle || null,
    });
  } catch (e) {
    console.warn("No se pudo registrar la auditoría:", e);
  }
}

export const LOGO_SRC = logoNomosUrl;

// El PNG del logo vive como archivo aparte (src/assets/logo-nomos.png) en
// vez de un string base64 de ~76KB incrustado en este archivo — antes se
// descargaba y parseaba ese texto en CADA carga de la app, aunque nadie
// mirara nunca un PDF o Word ese día. LOGO_SRC (el WebP liviano, una URL
// normal cacheable por el navegador) sirve tal cual para <img src=...>.
// Donde sí hace falta el base64 completo de verdad (jsPDF.addImage,
// ImageRun de docx, el canvas del recibo de pago — los tres lo piden de
// forma síncrona o ya decodificado) se usa obtenerLogoBase64(). Primero
// intenta el logo PROPIO del despacho (subido desde "Mi despacho"), y si
// el despacho no tiene uno todavía, cae al logo de Nomos — así cada
// despacho ve su propia marca en sus cuentas de cobro, recibos y
// contratos, en vez del mismo logo fijo para todos. Se cachea en memoria
// por ruta de logo, para no volver a descargarlo en cada documento que se
// genera; limpiarCacheLogoDespacho() se llama justo después de subir uno
// nuevo para que el siguiente documento ya use el actualizado.
function blobADataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
let logoBase64Cache = { ruta: undefined, promise: null };
export function limpiarCacheLogoDespacho() {
  logoBase64Cache = { ruta: undefined, promise: null };
}
export function obtenerLogoBase64() {
  const ruta = getLogoRutaDespacho();
  if (logoBase64Cache.ruta === ruta && logoBase64Cache.promise) return logoBase64Cache.promise;
  const promise = (async () => {
    if (ruta) {
      try {
        const blob = await descargarLogoDespachoBlob(ruta);
        if (blob) return await blobADataUrl(blob);
      } catch (e) {
        console.warn("No se pudo cargar el logo del despacho, se usa el de Nomos:", e);
      }
    }
    const blob = await fetch(logoNomosDocUrl).then((r) => r.blob());
    return await blobADataUrl(blob);
  })();
  logoBase64Cache = { ruta, promise };
  return promise;
}

// Convierte cualquier imagen que el navegador pueda decodificar (PNG, JPG,
// WEBP, GIF, BMP...) a un PNG real, dibujándola en un <canvas> — así el
// logo que suba cada despacho sirve igual en el recibo (canvas), en el PDF
// (jsPDF) y en el Word (docx, que no soporta WEBP ni la mayoría de
// formatos). SVG queda afuera a propósito, igual que en las fotos de
// perfil (archivoEsImagenValida): puede traer <script> adentro.
export function convertirImagenAPngBlob(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (blob) resolve(blob);
        else reject(new Error("No se pudo convertir la imagen"));
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Archivo de imagen inválido"));
    };
    img.src = url;
  });
}





// Guía de uso de Nomos (botón "Ayuda" de la barra superior) — un artifact de
// Claude, se actualiza aparte de un despliegue de código normal.
export const URL_GUIA_NOMOS = "https://claude.ai/artifact/Pdmx44JrBwfkJ3u1MyDYke";

// "Ordinario / Verbal / Ejecutivo..." es la clasificación de trámites del
// Código General del Proceso (civil) — no tiene nada que ver con el trámite
// penal (Ley 906 de 2004, sistema acusatorio: indagación, imputación,
// acusación, juicio...) ni con el resto de áreas, cada una con su propio
// procedimiento. Antes un solo listado de tipos se usaba para todas las
// áreas por igual, lo que obligaba a forzar un caso penal dentro de una
// categoría civil que no le aplica. Ahora el tipo de proceso depende del
// área elegida.
export const TIPOS_PROCESO_POR_AREA = {
  Civil: ["Ordinario", "Verbal", "Verbal sumario", "Ejecutivo", "Declarativo", "Otro"],
  Penal: ["Indagación", "Imputación", "Acusación", "Juicio oral", "Ejecución de penas", "Otro"],
  Laboral: ["Ordinario laboral", "Ejecutivo laboral", "Fuero sindical", "Otro"],
  Familia: ["Divorcio o cesación de efectos civiles", "Custodia y alimentos", "Sucesión", "Verbal", "Otro"],
  Comercial: ["Ordinario", "Verbal", "Ejecutivo", "Arbitraje", "Otro"],
  Administrativo: ["Nulidad y restablecimiento del derecho", "Reparación directa", "Nulidad simple", "Otro"],
  Constitucional: ["Tutela", "Acción de cumplimiento", "Acción popular", "Habeas corpus", "Otro"],
  // A pedido de un abogado del despacho (Dieto Merchan) vía WhatsApp: el
  // régimen de insolvencia de persona natural no comerciante (Ley 1564 de
  // 2012, Código General del Proceso) es un trámite distinto al de la
  // insolvencia empresarial (Ley 1116 de 2006, que se divide en
  // reorganización — el "acuerdo" — o liquidación judicial) — no encajaban
  // bien forzados dentro de Civil ni de Comercial.
  Concursal: ["Reorganización empresarial", "Liquidación judicial", "Liquidación patrimonial", "Insolvencia de persona natural no comerciante", "Otro"],
  Otro: ["Otro"],
};
export function tiposProcesoDeArea(area) {
  return TIPOS_PROCESO_POR_AREA[area] || TIPOS_PROCESO_POR_AREA.Otro;
}
export const AREAS_PROCESO = ["Civil", "Penal", "Laboral", "Familia", "Comercial", "Administrativo", "Constitucional", "Concursal", "Otro"];
export const DIAS_ALERTA_INACTIVIDAD = 8;

export const DIAS_AVISO_PROXIMO_PAGO = 3;

// jsPDF vivía antes cargado desde un CDN externo (cdnjs) con un <script> en
// tiempo de ejecución — cualquier cosa que bloqueara esa descarga (política
// de seguridad del navegador, un bloqueador de anuncios, el CDN caído, o
// simplemente sin internet en ese instante) dejaba los botones de "Descargar
// PDF" sin funcionar y sin avisar por qué. Ahora jsPDF es una dependencia
// normal del proyecto: Vite la empaqueta en su propio bloque (se descarga
// junto con la app, no por separado ni de un tercero), así que no puede
// fallar por una razón de red aparte. Se mantiene la función async
// "ensureJsPDF" con el mismo nombre y efecto (dejar jsPDF listo en
// window.jspdf.jsPDF) para no tener que tocar cada lugar que ya la usa.
export async function ensureJsPDF() {
  if (window.jspdf?.jsPDF) return;
  const mod = await import("jspdf");
  window.jspdf = { jsPDF: mod.jsPDF || mod.default };
}

// Igual que jsPDF (ver ensureJsPDF más abajo), xlsx viene empaquetado con la
// app en vez de cargado en el momento desde un CDN — así no depende de una
// descarga externa justo cuando alguien le da a "Exportar".
export async function ensureXLSX() {
  if (window.XLSX) return;
  const mod = await import("xlsx");
  window.XLSX = mod;
}

// Ancho de columna calculado a partir del contenido real (el texto más
// largo de esa columna, con un mínimo y un máximo razonables) — sin esto,
// Excel abre el archivo con todas las columnas del mismo ancho angosto por
// defecto, y hay que agrandarlas una por una a mano antes de poder leer
// nada. Esta es la diferencia real entre un archivo "que se ve bien" y uno
// que se ve como texto plano desorganizado.
function anchosDeColumnas(columnas, filas) {
  return columnas.map((c) => {
    const maxContenido = filas.reduce((max, f) => Math.max(max, String(c.valor(f) ?? "").length), c.titulo.length);
    return { wch: Math.min(Math.max(maxContenido + 2, 10), 45) };
  });
}

// Reemplaza el CSV plano de antes por un .xlsx real, con columnas de ancho
// automático en vez del ancho angosto por defecto de Excel. Nota honesta:
// la librería gratuita (SheetJS community) no permite guardar estilos de
// celda (negrita, color de fondo del encabezado, etc.) — eso solo lo
// habilita la versión paga (SheetJS Pro), así que no se incluyó, para no
// meter un costo recurrente por algo puramente estético. El ancho de
// columna automático sí es gratis y es la diferencia real entre un
// archivo legible y uno "de texto desorganizado".
export async function exportarCSV(nombreArchivo, columnas, filas) {
  await ensureXLSX();
  const encabezados = columnas.map((c) => c.titulo);
  const datos = filas.map((f) => columnas.map((c) => c.valor(f) ?? ""));
  const hoja = window.XLSX.utils.aoa_to_sheet([encabezados, ...datos]);
  hoja["!cols"] = anchosDeColumnas(columnas, filas);
  const libro = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(libro, hoja, "Datos");
  const salida = window.XLSX.write(libro, { bookType: "xlsx", type: "array" });
  const blob = new Blob([salida], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const nombreXlsx = nombreArchivo.replace(/\.csv$/i, ".xlsx");
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreXlsx;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


// Constantes de layout del recibo, compartidas entre la función que mide el
// alto necesario y la que dibuja — así nunca se desincronizan (un lienzo más
// corto que el contenido real cortaría el pie de página; uno más largo
// volvería a dejar espacio en blanco de sobra, que era justo el problema
// original con el lienzo fijo de 920px).
const RECIBO_LAYOUT = {
  width: 640,
  margen: 44,
  header: 112,
  offsetTitulo: 44,
  offsetPrimeraFila: 46,
  altoFila: 29,
  gapAntesCaja: 8,
  altoCaja: 100,
  gapDespuesCaja: 30,
  pieLinea1: 24,
  pieLinea2: 40,
  margenInferior: 24,
};

function filasRecibo(pago) {
  return 3 + (pago.concepto ? 1 : 0);
}

function medirAltoRecibo(pago) {
  const L = RECIBO_LAYOUT;
  const yTitulo = L.header + L.offsetTitulo;
  const yPrimeraFila = yTitulo + L.offsetPrimeraFila;
  const yDespuesFilas = yPrimeraFila + filasRecibo(pago) * L.altoFila;
  const yCaja = yDespuesFilas + L.gapAntesCaja;
  const yDespuesCaja = yCaja + L.altoCaja + L.gapDespuesCaja;
  return yDespuesCaja + L.pieLinea2 + L.margenInferior;
}

// Ruta de un rectángulo con esquinas redondeadas dibujada a mano (arcTo) en
// vez de ctx.roundRect(): el método nativo es reciente y en un navegador
// viejo simplemente no existe — con arcTo funciona igual en cualquier
// versión, sin tener que detectar soporte.
function trazarRectRedondeado(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

export function generarReciboImagen(clienteId, cliente, pago) {
  return new Promise((resolve) => {
    const L = RECIBO_LAYOUT;
    const width = L.width;
    const HEADER = L.header;
    const alto = medirAltoRecibo(pago);
    // Margen exterior transparente alrededor de la tarjeta: así, al
    // compartir la imagen (WhatsApp, portal del cliente), el recibo se ve
    // como una tarjeta flotando con sombra propia en vez de un rectángulo
    // pegado a los bordes de la imagen.
    const FUERA = 28;
    const RADIO = 18;
    const width2 = width + FUERA * 2;
    const height = alto + FUERA * 2;
    const canvas = document.createElement("canvas");
    canvas.width = width2;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    // Misma familia que usa el resto de la app para el nombre del despacho
    // (la barra lateral, "Nomos" en el login, etc.) — un serif decorativo
    // aparte solo desentonaba con la marca real.
    const SANS = "'Inter', Arial, sans-serif";
    const VERDE = "#3E7C7C";
    const DORADO = "#B8912F";

    // Sombra suave debajo de la tarjeta, como si flotara sobre el fondo.
    ctx.save();
    ctx.shadowColor = "rgba(11,61,46,0.22)";
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 10;
    trazarRectRedondeado(ctx, FUERA, FUERA, width, alto, RADIO);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.restore();

    // Todo lo demás se dibuja recortado a la silueta redondeada de la
    // tarjeta y desplazado por el margen exterior — así el resto del código
    // sigue usando coordenadas "de tarjeta" (0,0 = esquina de la tarjeta)
    // sin tener que sumar FUERA en cada línea.
    ctx.save();
    trazarRectRedondeado(ctx, FUERA, FUERA, width, alto, RADIO);
    ctx.clip();
    ctx.translate(FUERA, FUERA);

    const height2 = alto;

    const degradadoHeader = ctx.createLinearGradient(0, 0, 0, HEADER);
    degradadoHeader.addColorStop(0, "#0F4A38");
    degradadoHeader.addColorStop(1, VERDE);
    ctx.fillStyle = degradadoHeader;
    ctx.fillRect(0, 0, width, HEADER);

    // Filete dorado en el borde superior — el detalle que separa un
    // encabezado plano de uno con acabado de papelería fina.
    ctx.fillStyle = DORADO;
    ctx.fillRect(0, 0, width, 3);

    // Marca de agua: el logo, muy tenue y en blanco y negro, detrás del
    // cuerpo del recibo — el mismo recurso que usan los comprobantes
    // "oficiales" de verdad, y evita que el cuerpo blanco se sienta vacío o
    // genérico sin recargarlo con más texto o color.
    const dibujarMarcaDeAgua = (logoImg) => {
      if (!logoImg) return;
      const lado = (height2 - HEADER) * 0.82;
      const cx = width - lado * 0.32;
      const cy = HEADER + (height2 - HEADER) / 2;
      ctx.save();
      ctx.globalAlpha = 0.05;
      ctx.filter = "grayscale(1)";
      ctx.beginPath();
      ctx.arc(cx, cy, lado / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(logoImg, cx - lado / 2, cy - lado / 2, lado, lado);
      ctx.restore();
    };

    // Sello circular tipo "PAGADO", ligeramente rotado, como el sello de
    // tinta que se usaría en un recibo físico — el remate premium del
    // recibo, en la esquina inferior derecha del cuerpo.
    const dibujarSello = () => {
      const cx = width - 78;
      const cy = height2 - 58;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((-11 * Math.PI) / 180);
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = DORADO;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, 34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = DORADO;
      ctx.font = `800 11px ${SANS}`;
      ctx.textAlign = "center";
      ctx.fillText("PAGADO", 0, -1);
      ctx.font = `600 8px ${SANS}`;
      ctx.fillText("✓ CONFIRMADO", 0, 11);
      ctx.textAlign = "left";
      ctx.restore();
    };

    const dibujarResto = (logoImg) => {
      dibujarMarcaDeAgua(logoImg);

      // Anillo dorado fino alrededor del logo, sobre el clip del círculo.
      ctx.strokeStyle = DORADO;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(64, 56, 34, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "#FFFFFF";
      ctx.font = `800 21px ${SANS}`;
      ctx.fillText(getNombreDespacho(), 116, 52);
      ctx.fillStyle = "#D9C084";
      ctx.font = `600 11px ${SANS}`;
      if ("letterSpacing" in ctx) ctx.letterSpacing = "1.5px";
      ctx.fillText("RECIBO DE PAGO", 116, 73);
      if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
      // Marca de verificación junto al subtítulo, como en un comprobante de
      // pago confirmado digitalmente.
      ctx.fillStyle = "#3E7A5D";
      ctx.beginPath();
      ctx.arc(238, 69, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(235.5, 69);
      ctx.lineTo(237.3, 71);
      ctx.lineTo(240.5, 66.5);
      ctx.stroke();

      const margen = L.margen;

      let y = HEADER + L.offsetTitulo;
      ctx.fillStyle = DORADO;
      ctx.fillRect(margen, y - 12, 3, 14);
      ctx.fillStyle = VERDE;
      ctx.font = `700 17px ${SANS}`;
      ctx.fillText("Detalle del pago", margen + 11, y);
      ctx.strokeStyle = "#E9DFC4";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(margen, y + 14);
      ctx.lineTo(width - margen, y + 14);
      ctx.stroke();

      y += L.offsetPrimeraFila;
      const columnaValor = margen + 130;
      const fila = (etiqueta, valor) => {
        ctx.font = `400 12.5px ${SANS}`;
        ctx.fillStyle = "#7A8478";
        ctx.fillText(etiqueta.toUpperCase(), margen, y);
        const anchoEtiqueta = ctx.measureText(etiqueta.toUpperCase()).width;
        // Guía punteada entre la etiqueta y el valor, como en una factura
        // impresa clásica — separa las dos columnas sin necesitar una línea
        // continua que compita visualmente con el contenido.
        ctx.strokeStyle = "#D8DDD5";
        ctx.lineWidth = 1;
        ctx.setLineDash([1, 3]);
        ctx.beginPath();
        ctx.moveTo(margen + anchoEtiqueta + 8, y - 4);
        ctx.lineTo(columnaValor - 10, y - 4);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = `600 14.5px ${SANS}`;
        ctx.fillStyle = "#1A2420";
        ctx.fillText(valor, columnaValor, y);
        y += L.altoFila;
      };

      fila("Cliente", cliente.nombre || "");
      fila("Fecha", new Date(pago.fecha).toLocaleDateString("es-CO", { dateStyle: "long" }));
      fila("Medio de pago", pago.medioPago || "");
      if (pago.concepto) fila("Concepto", pago.concepto);

      y += L.gapAntesCaja;
      const degradadoCaja = ctx.createLinearGradient(margen, y, width - margen, y + L.altoCaja);
      degradadoCaja.addColorStop(0, "#EEF6F1");
      degradadoCaja.addColorStop(1, "#E4F0E8");
      trazarRectRedondeado(ctx, margen, y, width - margen * 2, L.altoCaja, 10);
      ctx.fillStyle = degradadoCaja;
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = DORADO;
      ctx.fillRect(margen, y, 4, L.altoCaja);
      ctx.restore();
      ctx.fillStyle = "#5C6B60";
      ctx.font = `700 11px ${SANS}`;
      if ("letterSpacing" in ctx) ctx.letterSpacing = "1px";
      ctx.fillText("VALOR PAGADO", margen + 24, y + 32);
      if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
      ctx.fillStyle = VERDE;
      ctx.font = `800 32px ${SANS}`;
      const textoValor = formatoCOP(pago.valor);
      const anchoValor = ctx.measureText(textoValor).width;
      ctx.fillText(textoValor, margen + 24, y + 73);
      ctx.fillStyle = "#7C9686";
      ctx.font = `700 11px ${SANS}`;
      ctx.fillText("COP", margen + 24 + anchoValor + 8, y + 73);

      dibujarSello();

      y += L.altoCaja + L.gapDespuesCaja;
      ctx.strokeStyle = "#E9DFC4";
      ctx.beginPath();
      ctx.moveTo(margen, y);
      ctx.lineTo(width - margen, y);
      ctx.stroke();

      ctx.textAlign = "center";
      ctx.fillStyle = "#9AA39B";
      ctx.font = `400 10.5px ${SANS}`;
      ctx.fillText(`Recibo N.º ${pago.id} · Comprobante generado electrónicamente`, width / 2, y + L.pieLinea1);
      ctx.fillStyle = "#6B7A70";
      ctx.font = `700 10px ${SANS}`;
      if ("letterSpacing" in ctx) ctx.letterSpacing = "1.2px";
      ctx.fillText(getNombreDespacho().toUpperCase(), width / 2, y + L.pieLinea2);
      if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
      ctx.textAlign = "left";

      // Se cierra el recorte de la tarjeta antes del borde: un trazo
      // dibujado con el clip todavía activo se vería cortado por la mitad.
      ctx.restore();
      trazarRectRedondeado(ctx, FUERA + 0.5, FUERA + 0.5, width - 1, alto - 1, RADIO);
      ctx.strokeStyle = DORADO;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Se sube al bucket "recibos" (privado, aislado por despacho) en vez
      // de guardar la imagen completa dentro de la fila del cliente — así
      // cientos de recibos no inflan el límite de espacio de la base de
      // datos. Si por lo que sea la subida falla (sin internet, bucket no
      // creado todavía), se cae de vuelta al base64 de siempre para no
      // perder el recibo.
      canvas.toBlob(async (blob) => {
        try {
          if (!blob) throw new Error("No se pudo generar la imagen");
          const ruta = await subirReciboImagen(clienteId, pago.id, blob);
          resolve(ruta);
        } catch (e) {
          console.warn("No se pudo subir el recibo a Storage, se guarda como antes:", e);
          resolve(canvas.toDataURL("image/png"));
        }
      }, "image/png");
    };

    const logoImg = new Image();
    logoImg.onload = () => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(64, 56, 34, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(logoImg, 30, 22, 68, 68);
      ctx.restore();
      dibujarResto(logoImg);
    };
    logoImg.onerror = () => dibujarResto(null);
    obtenerLogoBase64()
      .then((src) => {
        logoImg.src = src;
      })
      .catch(() => dibujarResto(null));
  });
}


// El navegador informa el tipo de archivo (accept="image/*", archivo.type)
// pero eso es solo lo que el propio archivo DICE ser — un archivo renombrado
// o con el Content-Type falseado pasa esa verificación igual. Aquí se
// decodifica de verdad como imagen (createImageBitmap falla si no lo es de
// verdad) y se rechaza SVG explícitamente, porque a diferencia de un
// JPG/PNG puede llevar <script> adentro — algo que una foto de perfil
// nunca necesita.
export async function archivoEsImagenValida(file) {
  if (!file || !file.type.startsWith("image/") || file.type === "image/svg+xml") return false;
  try {
    const bitmap = await createImageBitmap(file);
    bitmap.close?.();
    return true;
  } catch (e) {
    return false;
  }
}

import {
  storageGet,
  storageSet,
  setDespachoActual,
  getDespachoActualId,
  getNombreDespacho,
  getLogoRutaDespacho,
  setLogoRutaDespachoLocal,
  getCelularDespacho,
  setCelularDespachoLocal,
  buscarGlobal,
  obtenerPapelera,
  restaurarDePapelera,
  iniciarSincronizacionOffline,
  cambiosSinSincronizar,
  contarCambiosSinSincronizar,
  eliminarDefinitivo,
  firmarDocumentoPublico,
  registrarEventoDocumentoPublico,
  registrarEventoDocumentoDespacho,
  obtenerEventosDocumento,
  subirReciboImagen,
  obtenerUrlReciboImagen,
  subirFotoPerfil,
  obtenerUrlFotoPerfil,
  subirLogoDespacho,
  descargarLogoDespachoBlob,
  obtenerClientesPorId,
  obtenerValoresPorClaves,
  obtenerDocumentosPorId,
  claveIndiceAgenda,
  getUsuarioAgendaId,
  obtenerIdsAgenda,
  setUsuarioAgenda,
} from "./lib/storage";

export function useIndex(key, shared) {
  const [ids, setIds] = useState([]);
  const [cargado, setCargado] = useState(false);
  const load = useCallback(async () => {
    const raw = await storageGet(key, shared);
    setIds(raw ? JSON.parse(raw) : []);
    setCargado(true);
  }, [key, shared]);
  useEffect(() => {
    load();
  }, [load]);
  const addId = async (id) => {
    const next = [id, ...ids];
    setIds(next);
    await storageSet(key, JSON.stringify(next), shared);
  };
  const removeId = async (id) => {
    const next = ids.filter((x) => x !== id);
    setIds(next);
    await storageSet(key, JSON.stringify(next), shared);
  };
  return { ids, cargado, addId, removeId, reload: load };
}

const PDFJS_SRC = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.js";
const PDFJS_WORKER_SRC = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.js";
function ensurePdfJs() {
  return new Promise((resolve, reject) => {
    if (window.pdfjsLib) return resolve();
    const existing = document.getElementById("pdfjs-script");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      return;
    }
    const script = document.createElement("script");
    script.id = "pdfjs-script";
    script.src = PDFJS_SRC;
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function extraerTextoPdf(file) {
  await ensurePdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let textoCompleto = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const textoPagina = content.items.map((item) => item.str).join(" ");
    textoCompleto += textoPagina + "\n\n";
  }
  return textoCompleto.trim();
}

const MAMMOTH_SRC = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js";
export function ensureMammoth() {
  return new Promise((resolve, reject) => {
    if (window.mammoth) return resolve();
    const existing = document.getElementById("mammoth-script");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      return;
    }
    const script = document.createElement("script");
    script.id = "mammoth-script";
    script.src = MAMMOTH_SRC;
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });
}



function base64ToUint8Array(base64) {
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}




// Campo para escribir plata: muestra el separador de miles con puntos
// (formato colombiano, "500.000") a medida que se escribe, en vez de que
// cada quien tenga que ponerlo a mano o escribir el número corrido sin
// poder leerlo de un vistazo. Emite un evento sintético con el valor
// numérico limpio (sin puntos) en target.value, para que los onChange que
// ya existían (`(e) => setValor(e.target.value)`) sigan funcionando igual.
export function CampoDinero({ value, onChange, placeholder, style, className }) {
  const formatear = (v) => {
    const digitos = String(v ?? "").replace(/\D/g, "");
    if (!digitos) return "";
    return Number(digitos).toLocaleString("es-CO");
  };
  return (
    <input
      type="text"
      inputMode="numeric"
      className={className || "drx-input"}
      style={style}
      placeholder={placeholder}
      value={formatear(value)}
      onChange={(e) => onChange({ target: { value: e.target.value.replace(/\D/g, "") } })}
    />
  );
}



// Elegir a alguien (referenciador, abogado asociado) de la lista ya
// registrada, o registrar a alguien nuevo ahí mismo sin salir del
// formulario — y en el mismo control, el % de comisión que le
// corresponde. Compartido entre Clientes y la Calculadora de precios,
// para que "elegir de los ya registrados o registrar uno nuevo" se vea y
// funcione exactamente igual en los dos lugares.
export function SelectorComision({ titulo, contactosHook, valor, onChange, placeholderNombre }) {
  const { contactos, crear } = contactosHook();
  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [telefonoNuevo, setTelefonoNuevo] = useState("");

  const elegir = (id) => {
    if (!id) {
      onChange(null);
      return;
    }
    const c = contactos.find((x) => x.id === id);
    if (c) onChange({ id: c.id, nombre: c.nombre, porcentaje: valor?.porcentaje ?? "" });
  };

  const crearRapido = async () => {
    if (!nombreNuevo.trim()) return;
    const nuevo = await crear({ nombre: nombreNuevo, telefono: telefonoNuevo });
    onChange({ id: nuevo.id, nombre: nuevo.nombre, porcentaje: valor?.porcentaje ?? "" });
    setNombreNuevo("");
    setTelefonoNuevo("");
    setMostrarNuevo(false);
  };

  return (
    <div style={{ marginTop: 12 }}>
      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 600, color: COLORS.inkSoft, marginBottom: 8 }}>{titulo}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <Field label="Elegir">
          <select
            className="drx-input"
            style={{ ...inputStyle, fontSize: 12.5, padding: "7px 8px", minWidth: 200 }}
            value={valor?.id || ""}
            onChange={(e) => elegir(e.target.value)}
          >
            <option value="">Ninguno</option>
            {contactos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </Field>
        {valor?.id && (
          <Field label="% que le corresponde">
            <input
              type="number"
              min="0"
              max="100"
              className="drx-input"
              style={{ ...inputStyle, fontSize: 12.5, padding: "7px 8px", width: 90 }}
              value={valor.porcentaje ?? ""}
              onChange={(e) => onChange({ ...valor, porcentaje: e.target.value })}
            />
          </Field>
        )}
        <button className="drx-btn-ghost" style={{ ...buttonGhost, padding: "8px 14px", fontSize: 12.5 }} onClick={() => setMostrarNuevo((m) => !m)}>
          {mostrarNuevo ? "Cancelar" : "+ Nuevo"}
        </button>
      </div>
      {mostrarNuevo && (
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <input
            className="drx-input"
            style={{ ...inputStyle, padding: "8px 10px", fontSize: 13 }}
            value={nombreNuevo}
            onChange={(e) => setNombreNuevo(e.target.value)}
            placeholder={placeholderNombre}
          />
          <input
            className="drx-input"
            style={{ ...inputStyle, padding: "8px 10px", fontSize: 13 }}
            value={telefonoNuevo}
            onChange={(e) => setTelefonoNuevo(e.target.value)}
            placeholder="Teléfono (opcional)"
          />
          <button className="drx-btn-ghost" style={{ ...buttonGhost, padding: "8px 14px", fontSize: 12.5 }} onClick={crearRapido} disabled={!nombreNuevo.trim()}>
            Guardar
          </button>
        </div>
      )}
    </div>
  );
}





export function EstadoVacio({ icono, texto }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "36px 20px",
        border: `1.5px dashed ${COLORS.border}`,
        borderRadius: 12,
        background: COLORS.surfaceSoft,
      }}
    >
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${COLORS.accentSoft}, transparent 72%)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: COLORS.muted,
            opacity: 0.75,
          }}
        >
          {icono}
        </div>
      </div>
      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.muted, margin: 0 }}>{texto}</p>
    </div>
  );
}

function Pill({ children }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 20,
        padding: "6px 16px",
        fontFamily: "Inter, sans-serif",
        fontSize: 12,
        fontWeight: 600,
        color: COLORS.inkSoft,
        background: `linear-gradient(180deg, ${COLORS.panel}, ${COLORS.surfaceSoft})`,
        boxShadow: "0 1px 2px rgba(16,24,40,0.04)",
      }}
    >
      {children}
    </span>
  );
}



function SelloVersion({ oscuro }) {
  return (
    <div
      title="Si esta fecha no cambia después de que Claude publique algo nuevo, tu navegador todavía tiene la versión vieja guardada — haz Ctrl+Shift+R."
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        border: `1px solid ${oscuro ? "rgba(255,255,255,0.16)" : COLORS.border}`,
        borderRadius: 20,
        padding: "5px 12px",
        fontFamily: "Inter, sans-serif",
        fontSize: 11,
        color: oscuro ? "#B8C5DA" : COLORS.muted,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E", flexShrink: 0 }} />
      Actualizado {new Date(__BUILD_TIME__).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}
      {" "}
      {new Date(__BUILD_TIME__).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })} · v{APP_VERSION}
    </div>
  );
}

// icono y subtitulo son opcionales — los tabs que no los pasan se ven
// exactamente igual que antes; se agregaron para que Agenda (y cualquier
// otro que lo pida después) pueda tener un encabezado más vestido, sin
// tocar el de las demás pestañas.
export function EncabezadoSeccion({ titulo, color, icono, subtitulo }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: subtitulo ? 22 : 26 }}>
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 11,
          flexShrink: 0,
          background: `linear-gradient(135deg, ${color}, ${color}CC)`,
          boxShadow: `0 6px 16px ${color}40`,
          display: icono ? "flex" : undefined,
          alignItems: icono ? "center" : undefined,
          justifyContent: icono ? "center" : undefined,
          color: icono ? "#FFFFFF" : undefined,
        }}
      >
        {icono}
      </div>
      <div>
        <div style={{ width: 30, height: 3, borderRadius: 2, background: `linear-gradient(90deg, ${color}, transparent)`, marginBottom: 6 }} />
        <h2
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 20,
            fontWeight: 800,
            letterSpacing: -0.3,
            color: COLORS.headingText,
            margin: 0,
          }}
        >
          {titulo}
        </h2>
        {subtitulo && (
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted, margin: "4px 0 0" }}>{subtitulo}</p>
        )}
      </div>
    </div>
  );
}


const VERSICULOS = [
  { texto: "Encomienda al Señor tus proyectos, y tus planes se afirmarán.", ref: "Proverbios 16:3" },
  { texto: "Todo lo que hagas, hazlo de corazón, como para el Señor y no para los hombres.", ref: "Colosenses 3:23" },
  { texto: "El que trabaja con esmero prospera; el que se apresura solo cosecha carencia.", ref: "Proverbios 21:5" },
  { texto: "El que es diligente en su trabajo se codea con la excelencia.", ref: "Proverbios 22:29" },
  { texto: "Haz con todas tus fuerzas lo que tengas por delante hoy.", ref: "Eclesiastés 9:10" },
  { texto: "No te canses de hacer el bien, porque a su tiempo cosecharás si no desmayas.", ref: "Gálatas 6:9" },
  { texto: "El buen nombre vale más que las grandes riquezas.", ref: "Proverbios 22:1" },
  { texto: "La mano diligente gobierna; la perezosa termina sirviendo.", ref: "Proverbios 12:24" },
  { texto: "Todo tiene su tiempo, y cada cosa su momento bajo el cielo.", ref: "Eclesiastés 3:1" },
  { texto: "Si a alguno le falta sabiduría, pídala a Dios, que da a todos generosamente.", ref: "Santiago 1:5" },
  { texto: "El que siembra con generosidad, con generosidad también cosechará.", ref: "2 Corintios 9:6" },
  { texto: "No te dejes vencer por el mal; vence el mal haciendo el bien.", ref: "Romanos 12:21" },
  { texto: "El corazón del hombre traza su rumbo, pero el Señor dirige sus pasos.", ref: "Proverbios 16:9" },
  { texto: "Todo lo puedo en Cristo que me fortalece.", ref: "Filipenses 4:13" },
  { texto: "Confía en el Señor de todo corazón y no te apoyes en tu propia prudencia.", ref: "Proverbios 3:5" },
];

function fraseDelDia(lista) {
  const inicioAno = new Date(new Date().getFullYear(), 0, 0);
  const diaDelAno = Math.floor((Date.now() - inicioAno.getTime()) / 86400000);
  return lista[diaDelAno % lista.length];
}


// Secciones del menú lateral que cada usuario puede reordenar u ocultar
// desde Mi despacho → Personalizar menú. Resumen va siempre primero y
// Usuarios y permisos siempre al final, fuera de esta lista. Ocultar solo
// limpia el menú: lo que controla el acceso siguen siendo los permisos.
export const MENU_SECCIONES = [
  { id: "agenda", nombre: "Agenda", color: "#8B5CF6" },
  { id: "clientes", nombre: "Clientes", color: "#14B8A6" },
  { id: "vigilancia", nombre: "Vigilancia judicial", color: "#F5A524" },
  { id: "antecedentes", nombre: "Antecedentes", color: "#6366F1" },
  { id: "contabilidad", nombre: "Contabilidad", color: "#F43F5E" },
  { id: "calculadora", nombre: "Calculadora de precios", color: "#F59E0B" },
  { id: "contenido", nombre: "Calendario de contenido", color: "#8B5CF6" },
  { id: "documentos", nombre: "Firmar documentos", color: "#10B981" },
  { id: "reportes", nombre: "Reportes", color: "#0EA5E9" },
];

// Orden guardado por el usuario; las secciones que no estaban (nuevas)
// quedan al final en su orden original.
export function ordenarMenu(pref) {
  const orden = (pref?.orden || []).filter((id) => MENU_SECCIONES.some((m) => m.id === id));
  return [...orden.map((id) => MENU_SECCIONES.find((m) => m.id === id)), ...MENU_SECCIONES.filter((m) => !orden.includes(m.id))];
}

// Preferencia del menú por usuario: en la base (sigue al usuario entre
// computador y celular) y una copia local para pintarlo sin esperar.
function useMenuPersonalizado(usuarioId) {
  const llave = usuarioId ? `menu-personalizado:${usuarioId}` : null;
  const [pref, setPref] = useState(() => {
    try {
      return (llave && JSON.parse(localStorage.getItem(llave) || "null")) || {};
    } catch {
      return {};
    }
  });
  useEffect(() => {
    if (!llave) return;
    let cancelado = false;
    storageGet(llave).then((v) => {
      if (cancelado || !v) return;
      try {
        const p = JSON.parse(v);
        setPref(p);
        localStorage.setItem(llave, v);
      } catch {
        // valor dañado: se queda el orden por defecto
      }
    });
    return () => {
      cancelado = true;
    };
  }, [llave]);
  const guardar = (nueva) => {
    setPref(nueva);
    if (!llave) return;
    const texto = JSON.stringify(nueva);
    try {
      localStorage.setItem(llave, texto);
    } catch {
      // se guarda igual en la base
    }
    storageSet(llave, texto);
  };
  return [pref, guardar];
}

// Usuarios creados desde esta fecha hacen el recorrido guiado obligatorio.
const FECHA_INICIO_RECORRIDO = "2026-10-08";
const MINUTOS_INACTIVIDAD = 30;
const SEGUNDOS_AVISO_PREVIO = 60;

// Cierra la sesión sola tras MINUTOS_INACTIVIDAD sin que el usuario toque
// nada (clic, tecla, scroll, pantalla táctil) — útil en equipos compartidos
// del despacho. Un minuto antes de cerrarla, avisa (onAviso(true)) para que
// la app pueda mostrar un mensaje — cualquier actividad lo cancela solo.
// Avisa al navegador antes de cerrar la pestaña o recargar mientras hay un
// formulario largo (cliente, documento) a medias — para no perder lo ya
// escrito por un cierre accidental.
export function useAvisoAntesDeSalir(activo) {
  useEffect(() => {
    if (!activo) return;
    const alSalir = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, [activo]);
}

function useCierreSesionPorInactividad(activo, onExpirar, onAviso) {
  useEffect(() => {
    if (!activo) return;
    let temporizadorAviso;
    let temporizadorCierre;
    const reiniciar = () => {
      clearTimeout(temporizadorAviso);
      clearTimeout(temporizadorCierre);
      onAviso?.(false);
      temporizadorAviso = setTimeout(() => onAviso?.(true), MINUTOS_INACTIVIDAD * 60 * 1000 - SEGUNDOS_AVISO_PREVIO * 1000);
      temporizadorCierre = setTimeout(onExpirar, MINUTOS_INACTIVIDAD * 60 * 1000);
    };
    const eventos = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    eventos.forEach((ev) => window.addEventListener(ev, reiniciar));
    reiniciar();
    return () => {
      clearTimeout(temporizadorAviso);
      clearTimeout(temporizadorCierre);
      eventos.forEach((ev) => window.removeEventListener(ev, reiniciar));
    };
  }, [activo, onExpirar, onAviso]);
}



export function IconoCampana({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 16v-5a6 6 0 1 0-12 0v5l-1.6 2.4A1 1 0 0 0 5.2 20h13.6a1 1 0 0 0 .8-1.6L18 16z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9.5 20.5a2.5 2.5 0 0 0 5 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

// Ícono de línea genérico para reemplazar los emojis sueltos por toda la
// app — mismo lenguaje visual (trazo fino, sin relleno) que IconoCampana e
// IconoSeguridad, para que se vea consistente y no "barato".
// Carita de Lex: un ícono propio (no un emoji, que se ve distinto o mal en
// cada dispositivo) con lentes — el guiño quedó, pero dibujado en el mismo
// estilo de trazo que el resto de los íconos de la app, no pegado como
// algo aparte.
export function IconoLex({ size = 16, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, ...style }}>
      <circle cx="7.5" cy="12" r="3.2" />
      <circle cx="16.5" cy="12" r="3.2" />
      <path d="M10.7 12h2.6M2.5 11l1.8 1M21.5 11l-1.8 1" />
      <path d="M9 17c1.2 1 3.8 1 5 0" />
    </svg>
  );
}



// Antes esta función pedía cada dato UNO DETRÁS DE OTRO (índice de
// clientes, clientes, índice de documentos, documentos, índice de
// contenido, contenido, perfiles) — siete viajes de ida y vuelta al
// servidor en fila, aunque ninguno depende del resultado de otro. Con
// cada viaje tardando su ratico, eso se sentía como Resumen (y cualquier
// pestaña que espere esto) tardando mucho en cargar. Pedirlos todos a la
// vez con Promise.all — primero los tres índices más los perfiles,
// después los tres datos en bloque que dependen de esos índices — baja
// esto a solo DOS rondas en paralelo en vez de siete en fila.
export async function calcularResumenOperacion() {
  const [idsClientesRaw, idsDocsRaw, idsContenidoRaw, perfilesRes] = await Promise.all([
    storageGet("indice-clientes", false),
    storageGet("indice-documentos", true),
    storageGet("indice-contenido", true),
    supabase.from("perfiles").select("rol"),
  ]);
  const idsClientes = idsClientesRaw ? JSON.parse(idsClientesRaw) : [];
  const idsDocs = idsDocsRaw ? JSON.parse(idsDocsRaw) : [];
  const idsContenido = idsContenidoRaw ? JSON.parse(idsContenidoRaw) : [];
  const usuariosDespacho = perfilesRes.data || [];

  const [clientesResumen, docsResumen, contenidoResumenValores] = await Promise.all([
    obtenerClientesPorId(idsClientes),
    obtenerDocumentosPorId(idsDocs),
    obtenerValoresPorClaves(idsContenido.map((id) => `contenido:${id}`)),
  ]);

  let clientesInactivos = 0;
  let clientesActivos = 0;
  let pagosPendientes = 0;
  let pagosAtrasados = 0;
  let procesosConNovedad = 0;
  let vigilanciaEnTramite = 0;
  let vigilanciaPendienteRevision = 0;
  let vigilanciaFinalizado = 0;
  let clientesConRadicado = 0;
  let recaudadoHoy = 0;
  let recaudadoSemana = 0;
  let recaudadoMes = 0;
  let recaudadoTotal = 0;
  let numeroPagos = 0;
  let pendienteTotal = 0;

  const ahora = new Date();
  const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const inicioSemana = new Date(inicioHoy);
  inicioSemana.setDate(inicioHoy.getDate() - 6);
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);

  for (const id of idsClientes) {
    const c = clientesResumen[id];
    if (!c) continue;
    const dias = diasDesde(c.ultimaActuacion);
    // Un caso ya Finalizado sin movimiento reciente es normal (terminó, no
    // hay nada más que hacer) — no debería contar como "cliente descuidado"
    // igual que uno en trámite que lleva semanas sin que nadie lo revise.
    // Un proceso en pausa (el cliente decidió detenerlo, está a la espera de
    // algo externo, etc.) tampoco debería sumar como descuidado ni generar
    // avisos de pago — el abogado lo pausó a propósito.
    if (dias !== null && dias >= DIAS_ALERTA_INACTIVIDAD && c.estadoVigilancia !== "Finalizado" && !c.procesoPausado) clientesInactivos++;
    else clientesActivos++;
    // Una bolsa administrativa (ej. "Pagos pendientes por clasificar") no
    // es un cliente real esperando que le cobren — no debería generar
    // alertas de pago próximo/atrasado, igual que ya no cuenta en la
    // concentración de cartera ni en el ranking de clientes.
    if (c.proximoPago?.fecha && !c.procesoPausado && !c.esClienteAdministrativo) {
      const diasPago = diasHasta(c.proximoPago.fecha);
      if (diasPago !== null && diasPago <= DIAS_AVISO_PROXIMO_PAGO) pagosPendientes++;
      if (diasPago !== null && diasPago < 0) pagosAtrasados++;
      if (c.proximoPago.valorEsperado) pendienteTotal += Number(c.proximoPago.valorEsperado) || 0;
    }
    if (c.radicado?.trim()) clientesConRadicado++;
    if (c.estadoVigilancia === "Con novedad") procesosConNovedad++;
    else if (c.estadoVigilancia === "En trámite") vigilanciaEnTramite++;
    else if (c.estadoVigilancia === "Pendiente de revisión") vigilanciaPendienteRevision++;
    else if (c.estadoVigilancia === "Finalizado") vigilanciaFinalizado++;

    (c.pagos || []).forEach((p) => {
      const fechaPago = new Date(p.fecha);
      const valor = Number(p.valor) || 0;
      numeroPagos++;
      recaudadoTotal += valor;
      if (fechaPago >= inicioHoy) recaudadoHoy += valor;
      if (fechaPago >= inicioSemana) recaudadoSemana += valor;
      if (fechaPago >= inicioMes) recaudadoMes += valor;
    });
  }

  let docsPendientes = 0;
  let docsFaltaAbogado = 0;
  let docsListos = 0;
  for (const id of idsDocs) {
    const d = docsResumen[id];
    if (!d) continue;
    const estado = calcularEstado(d.firmantes);
    if (estado === "pendiente") docsPendientes++;
    else if (estado === "falta_abogado") docsFaltaAbogado++;
    else docsListos++;
  }

  const hoyISO = fechaHoyISO();
  let contenidoPendienteHoy = 0;
  let contenidoVencido = 0;
  for (const id of idsContenido) {
    const raw = contenidoResumenValores[`contenido:${id}`];
    if (!raw) continue;
    const it = JSON.parse(raw);
    if (it.estado === "Publicado" || !it.fecha) continue;
    if (it.fecha === hoyISO) contenidoPendienteHoy++;
    else if (it.fecha < hoyISO) contenidoVencido++;
  }

  const totalUsuarios = usuariosDespacho.length;
  const totalAdministradores = usuariosDespacho.filter((u) => u.rol === "Administrador").length;
  const totalAbogados = usuariosDespacho.filter((u) => u.rol === "Abogado").length;
  const totalAsistentes = usuariosDespacho.filter((u) => u.rol === "Asistente").length;

  return {
    totalClientes: idsClientes.length,
    clientesActivos,
    clientesInactivos,
    clientesConRadicado,
    docsPendientes,
    docsFaltaAbogado,
    docsListos,
    pagosPendientes,
    pagosAtrasados,
    procesosConNovedad,
    vigilanciaEnTramite,
    vigilanciaPendienteRevision,
    vigilanciaFinalizado,
    recaudadoHoy,
    recaudadoSemana,
    recaudadoMes,
    recaudadoTotal,
    numeroPagos,
    promedioPago: numeroPagos > 0 ? recaudadoTotal / numeroPagos : 0,
    pendienteTotal,
    contenidoPendienteHoy,
    contenidoVencido,
    totalUsuarios,
    totalAdministradores,
    totalAbogados,
    totalAsistentes,
  };
}

function useResumenGeneral() {
  const [resumen, setResumen] = useState({
    totalClientes: 0,
    clientesActivos: 0,
    clientesInactivos: 0,
    clientesConRadicado: 0,
    docsPendientes: 0,
    docsFaltaAbogado: 0,
    docsListos: 0,
    pagosPendientes: 0,
    pagosAtrasados: 0,
    procesosConNovedad: 0,
    vigilanciaEnTramite: 0,
    vigilanciaPendienteRevision: 0,
    vigilanciaFinalizado: 0,
    recaudadoHoy: 0,
    recaudadoSemana: 0,
    recaudadoMes: 0,
    recaudadoTotal: 0,
    numeroPagos: 0,
    pendienteTotal: 0,
    contenidoPendienteHoy: 0,
    contenidoVencido: 0,
    promedioPago: 0,
    totalUsuarios: 0,
    totalAdministradores: 0,
    totalAbogados: 0,
    totalAsistentes: 0,
  });

  const cargar = useCallback(async () => {
    const datos = await calcularResumenOperacion();
    setResumen(datos);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { ...resumen, reload: cargar };
}

// El puntaje se calcula como PROPORCIÓN sobre el total de clientes, no como
// una resta fija por cada problema — antes, un despacho con apenas 2 o 3
// clientes se hundía al fondo con solo 1 pago por vencer (algo normal, no
// un problema real), mientras que en uno grande ese mismo 1 caso casi ni se
// notaba. Así, "3 de 5 clientes inactivos" pesa lo que debe pesar (60%),
// y "3 de 60" también — sigue siendo estricto con problemas reales, pero
// ya no castiga por tener pocos datos cargados todavía.
//
// SEGUNDO ajuste, a pedido de Felipe: cada categoría escala LINEAL desde 0
// hasta su tope máximo, y el tope solo se alcanza cuando el 100% de los
// clientes tiene ese problema — antes, el tope se alcanzaba con un
// multiplicador más agresivo que la proporción real (ej. pagos atrasados
// llegaba al tope con apenas 47% de clientes afectados), así que en un
// despacho con varios problemas del mismo tipo, arreglar UNO no movía el
// puntaje nada — solo se notaba una vez se bajaba del umbral del tope. Con
// escala lineal, cada corrección individual SIEMPRE se refleja en el
// puntaje, aunque el despacho siga en rojo hasta que se resuelvan todos.
export function diagnosticoOperacion(r) {
  let puntaje = 100;
  const razones = [];
  const sugerencias = [];
  const baseClientes = Math.max(1, r.totalClientes);

  if (r.clientesInactivos > 0) {
    const proporcion = Math.min(1, r.clientesInactivos / baseClientes);
    puntaje -= Math.round(20 * proporcion);
    razones.push(`${r.clientesInactivos} cliente${r.clientesInactivos !== 1 ? "s" : ""} sin novedades hace más de ${DIAS_ALERTA_INACTIVIDAD} días`);
    sugerencias.push("Ponte al día con los clientes sin actividad reciente — un mensaje corto ya ayuda.");
  }
  // Solo los pagos YA ATRASADOS bajan el puntaje — un pago próximo a vencer
  // (todavía dentro del plazo) es flujo de caja normal, no un problema.
  if (r.pagosAtrasados > 0) {
    const proporcion = Math.min(1, r.pagosAtrasados / baseClientes);
    puntaje -= Math.round(18 * proporcion);
    razones.push(`${r.pagosAtrasados} pago${r.pagosAtrasados !== 1 ? "s" : ""} atrasado${r.pagosAtrasados !== 1 ? "s" : ""}`);
    sugerencias.push("Envía los recordatorios de los pagos atrasados desde Contabilidad.");
  }
  if (r.procesosConNovedad > 0) {
    const proporcion = Math.min(1, r.procesosConNovedad / baseClientes);
    puntaje -= Math.round(13 * proporcion);
    razones.push(`${r.procesosConNovedad} proceso${r.procesosConNovedad !== 1 ? "s" : ""} con novedad en vigilancia judicial`);
    sugerencias.push("Revisa los procesos marcados con novedad en Vigilancia judicial.");
  }
  // Solo cuenta en contra si NUNCA ha entrado plata (no un mes suelto sin
  // pagos, que puede ser perfectamente normal según el ritmo del despacho).
  if (r.recaudadoTotal === 0 && r.totalClientes > 0) {
    puntaje -= 6;
    razones.push("todavía no hay ningún pago registrado");
    sugerencias.push("Registra los pagos que ya has recibido para llevar el control real de caja.");
  }
  puntaje = Math.max(0, Math.min(100, Math.round(puntaje)));

  let etiqueta;
  let color;
  if (puntaje >= 85) {
    etiqueta = "Este mes vas muy bien";
    color = "#10B981";
  } else if (puntaje >= 60) {
    etiqueta = "Este mes vas bien, y podemos mejorar";
    color = "#F5A524";
  } else {
    etiqueta = "Este mes necesita tu atención";
    color = "#F43F5E";
  }

  return { puntaje, etiqueta, color, razones, sugerencias };
}

// Análisis financiero tipo "asesor" para el Resumen: a diferencia del
// diagnóstico operativo de arriba (que mira pendientes del día a día), esto
// mira la plata en el tiempo — tendencia de ingresos, margen real, cuánto
// hay atascado en cartera, y qué tan cargado está cada abogado — para dar
// un veredicto concreto sobre si es buen momento para salir a buscar más
// clientes, o si primero hay que resolver algo. Necesita al menos un par de
// meses con datos para poder hablar de tendencia; con menos, se queda en un
// mensaje honesto de "todavía no hay suficiente historial".
function analisisFinanciero(rep, r) {
  const meses = rep.mesesEtiquetas || [];
  const valoresIngreso = meses.map((m) => rep.ingresosPorMes[m.clave] || 0);
  const mesesConDatos = valoresIngreso.filter((v) => v > 0).length;

  if (rep.cargando || (rep.listaClientes || []).length === 0 || mesesConDatos < 2) {
    return {
      listo: false,
      mesesConDatos,
    };
  }

  // Detector de plata duplicada por traslados entre cuentas propias
  // (Nequi/Nu/Daviplata, típicamente): cuando se registra el mismo dinero
  // como "egreso" al salir de una cuenta y como "ingreso" al entrar a otra,
  // el ingreso bruto y el egreso bruto de ese mes quedan casi idénticos —
  // algo que un gasto real (arriendo, nómina, comisiones) no tiene ninguna
  // razón para calzar así con lo que pagaron los clientes. El Neto no se ve
  // muy afectado (los traslados se cancelan solos ahí), pero el bruto sí, y
  // eso distorsiona el % de margen y las demás señales de este análisis.
  const valoresEgreso = meses.map((m) => rep.egresosPorMes[m.clave] || 0);
  const UMBRAL_MINIMO_TRASLADO = 300000;
  // Si el usuario marcó desde cuándo quedó la contabilidad clasificada
  // cliente por cliente (fechaDatosLimpios), los meses de antes no deben
  // disparar esta alerta — ya se sabe que están cargados en bloque, sin
  // desglosar, así que ver ingresos≈egresos ahí no es una señal nueva.
  const claveDatosLimpios = rep.fechaDatosLimpios ? rep.fechaDatosLimpios.slice(0, 7) : null;
  const mesesConPosibleTraslado = meses
    .map((m, i) => ({ clave: m.clave, etiqueta: m.etiqueta, ingreso: valoresIngreso[i], egreso: valoresEgreso[i] }))
    .filter((m) => !claveDatosLimpios || m.clave >= claveDatosLimpios)
    .filter((m) => m.ingreso >= UMBRAL_MINIMO_TRASLADO && m.egreso > 0 && m.egreso / m.ingreso >= 0.85 && m.egreso / m.ingreso <= 1.15);

  const promedioMensual = valoresIngreso.reduce((s, v) => s + v, 0) / meses.length;
  const mitad = Math.floor(meses.length / 2);
  const ingresoUltimaMitad = valoresIngreso.slice(mitad).reduce((s, v) => s + v, 0);
  const ingresoPrimeraMitad = valoresIngreso.slice(0, mitad).reduce((s, v) => s + v, 0);
  const tendenciaPct = ingresoPrimeraMitad > 0 ? Math.round(((ingresoUltimaMitad - ingresoPrimeraMitad) / ingresoPrimeraMitad) * 100) : null;

  const margenMes = rep.ingresoMesActual > 0 ? rep.netoMesActual / rep.ingresoMesActual : null;
  const margenHistorico = rep.ingresoTotalHistorico > 0 ? rep.netoTotalHistorico / rep.ingresoTotalHistorico : null;
  // Solo la cartera ATRASADA (no toda la cartera pendiente — un cliente
  // pagando a cuotas a tiempo siempre debe hasta la última cuota, y eso no
  // es una señal de alarma).
  const mesesDeCarteraAtascada = promedioMensual > 0 ? rep.carteraAtrasadaTotal / promedioMensual : null;

  const abogados = Math.max(1, r.totalAbogados || 1);
  const clientesPorAbogado = r.totalClientes / abogados;

  const proporcionAtrasados = r.totalClientes > 0 ? r.pagosAtrasados / r.totalClientes : 0;

  const senales = [];
  let puntos = 0;

  if (tendenciaPct !== null) {
    if (tendenciaPct >= 8) {
      puntos += 2;
      senales.push({ categoria: "Tendencia", positiva: true, texto: `Ingresos al alza: ${tendenciaPct >= 0 ? "+" : ""}${tendenciaPct}% comparando la primera mitad de los últimos ${meses.length} meses con la segunda.` });
    } else if (tendenciaPct <= -8) {
      puntos -= 2;
      senales.push({ categoria: "Tendencia", positiva: false, texto: `Ingresos a la baja: ${tendenciaPct}% en los últimos ${meses.length} meses — antes de buscar más clientes, entender por qué.` });
    } else {
      senales.push({ categoria: "Tendencia", positiva: null, texto: `Estables en los últimos ${meses.length} meses (${tendenciaPct >= 0 ? "+" : ""}${tendenciaPct}%).` });
    }
  }

  if (margenMes !== null) {
    if (margenMes >= 0.35) {
      puntos += 2;
      senales.push({ categoria: "Margen", positiva: true, texto: `Sano: de cada peso que entra, queda ${Math.round(margenMes * 100)}% neto después de egresos.` });
    } else if (margenMes < 0.15) {
      puntos -= 2;
      senales.push({ categoria: "Margen", positiva: false, texto: `Apretado: solo queda ${Math.round(margenMes * 100)}% neto — traer clientes nuevos sin resolver esto multiplica el problema.` });
    } else {
      senales.push({ categoria: "Margen", positiva: null, texto: `Moderado: ${Math.round(margenMes * 100)}% neto después de egresos.` });
    }
  }

  if (mesesDeCarteraAtascada !== null && rep.carteraAtrasadaTotal > 0) {
    if (mesesDeCarteraAtascada > 2.5) {
      puntos -= 2;
      senales.push({ categoria: "Cartera atrasada", positiva: false, texto: `${formatoCOP(rep.carteraAtrasadaTotal)} de clientes atrasados (no lo que va a cuotas a tiempo) — casi ${mesesDeCarteraAtascada.toFixed(1)} meses de facturación sin cobrar.` });
    } else if (mesesDeCarteraAtascada < 1) {
      puntos += 1;
      senales.push({ categoria: "Cartera atrasada", positiva: true, texto: `Bajo control: solo ${formatoCOP(rep.carteraAtrasadaTotal)} de clientes atrasados, menos de un mes de facturación.` });
    }
  }

  if (proporcionAtrasados > 0.15) {
    puntos -= 1;
    senales.push({ categoria: "Cobro", positiva: false, texto: `${r.pagosAtrasados} de ${r.totalClientes} clientes con pagos atrasados — ponte al día antes de sumar más carga.` });
  }

  if (r.totalAbogados > 0 && clientesPorAbogado > 15) {
    puntos -= 2;
    senales.push({ categoria: "Capacidad", positiva: false, texto: `${Math.round(clientesPorAbogado)} clientes activos por abogado en promedio — el freno puede ser capacidad, no falta de clientes.` });
  } else if (r.totalAbogados > 0 && clientesPorAbogado < 6) {
    puntos += 1;
    senales.push({ categoria: "Capacidad", positiva: true, texto: `${Math.round(clientesPorAbogado)} clientes activos por abogado en promedio — hay margen para atender más.` });
  }

  // Concentración de cartera: si casi toda la plata histórica viene de un
  // solo cliente, es un riesgo real (qué pasa si ese cliente se va) aunque
  // el resto de los números se vean bien.
  if (rep.concentracionTop1Pct !== null) {
    if (rep.concentracionTop1Pct >= 40) {
      puntos -= 1;
      senales.push({
        categoria: "Concentración",
        positiva: false,
        texto: `${rep.concentracionTop1Pct}% de la facturación histórica viene de un solo cliente (${rep.clienteMasGrande.nombre}) — si se va, la caída es fuerte de un golpe.`,
      });
    } else if (rep.concentracionTop1Pct <= 15) {
      senales.push({ categoria: "Concentración", positiva: true, texto: `Bien repartida: ningún cliente pasa del ${rep.concentracionTop1Pct}% de tu facturación histórica.` });
    }
  }

  // Punto de equilibrio: con el ticket promedio histórico, cuántos clientes
  // pagando al mes hacen falta solo para cubrir el gasto fijo actual — una
  // forma concreta de responder "¿cuánto me falta vender?" en vez de dejarlo
  // en abstracto.
  const clientesParaEquilibrio = rep.egresoMesActual > 0 && rep.ticketPromedio > 0 ? Math.ceil(rep.egresoMesActual / rep.ticketPromedio) : null;
  if (clientesParaEquilibrio !== null) {
    senales.push({
      categoria: "Punto de equilibrio",
      positiva: null,
      texto: `Con tu ticket promedio (${formatoCOP(rep.ticketPromedio)}), necesitas ~${clientesParaEquilibrio} cliente${clientesParaEquilibrio !== 1 ? "s" : ""} pagando al mes solo para cubrir el gasto actual (${formatoCOP(rep.egresoMesActual)}).`,
    });
  }

  // Flujo de caja proyectado del próximo mes contra lo que se gastó este
  // mes: si lo que ya está comprometido para entrar no alcanza a cubrir el
  // ritmo de gasto actual, es una señal de riesgo aunque el mes actual haya
  // cerrado bien — mismo dato que "Flujo de caja proyectado" en
  // Contabilidad, sin inventar un cálculo aparte.
  if (rep.egresoMesActual > 0 && rep.proyeccionProximoMes !== undefined) {
    if (rep.proyeccionProximoMes < rep.egresoMesActual * 0.7) {
      puntos -= 2;
      senales.push({
        categoria: "Flujo de caja",
        positiva: false,
        texto: `Lo comprometido para el próximo mes (${formatoCOP(rep.proyeccionProximoMes)}) no cubre el gasto de este mes (${formatoCOP(rep.egresoMesActual)}) — asegura más cobros antes de sumar carga.`,
      });
    } else if (rep.proyeccionProximoMes >= rep.egresoMesActual * 1.3) {
      puntos += 1;
      senales.push({ categoria: "Flujo de caja", positiva: true, texto: `${formatoCOP(rep.proyeccionProximoMes)} ya comprometidos para el próximo mes, bien por encima del gasto mensual actual.` });
    }
  }

  if (mesesConPosibleTraslado.length > 0) {
    puntos -= 1;
    const listaMeses = mesesConPosibleTraslado.map((m) => m.etiqueta).join(", ");
    senales.push({
      categoria: "Calidad del dato",
      positiva: false,
      texto: `${mesesConPosibleTraslado.length} de ${meses.length} meses (${listaMeses}) con ingresos y egresos casi idénticos — probable plata duplicada al moverla entre tus propias cuentas.`,
    });
  }

  // Año actual vs. mismo punto del año anterior — dice si hay crecimiento
  // real o solo el vaivén normal de un mes bueno o malo.
  if (rep.cambioAnualPct !== null) {
    if (rep.cambioAnualPct >= 15) {
      puntos += 2;
      senales.push({ categoria: "Año contra año", positiva: true, texto: `Vas ${rep.cambioAnualPct}% arriba de lo facturado en el mismo punto del año pasado (${formatoCOP(rep.ingresoYTDActual)} vs. ${formatoCOP(rep.ingresoYTDAnterior)}).` });
    } else if (rep.cambioAnualPct <= -15) {
      puntos -= 2;
      senales.push({ categoria: "Año contra año", positiva: false, texto: `Vas ${Math.abs(rep.cambioAnualPct)}% por debajo de lo facturado en el mismo punto del año pasado (${formatoCOP(rep.ingresoYTDActual)} vs. ${formatoCOP(rep.ingresoYTDAnterior)}).` });
    } else {
      senales.push({ categoria: "Año contra año", positiva: null, texto: `Parecido al año pasado en este mismo punto (${rep.cambioAnualPct >= 0 ? "+" : ""}${rep.cambioAnualPct}%).` });
    }
  }

  // Cartera pendiente sin próximo cobro programado — no está vencida
  // todavía, pero tampoco aparece en "Flujo de caja proyectado" porque
  // nadie le puso fecha, así que da una falsa sensación de que ya no
  // falta cobrar nada más este mes.
  if (rep.clientesSinProximoPago > 0) {
    senales.push({
      categoria: "Cobro sin programar",
      positiva: false,
      texto: `${rep.clientesSinProximoPago} cliente${rep.clientesSinProximoPago !== 1 ? "s" : ""} con saldo pendiente sin próximo cobro programado — no salen en el flujo de caja proyectado hasta que les pongas fecha.`,
    });
  }

  // Mejor y peor mes de los últimos 6, para saber si el mes actual es
  // normal o un extremo.
  if (rep.mejorMes && rep.peorMes && rep.mejorMes.etiqueta !== rep.peorMes.etiqueta) {
    senales.push({
      categoria: "Rango del semestre",
      positiva: null,
      texto: `El mejor mes de los últimos 6 fue ${rep.mejorMes.etiqueta} (${formatoCOP(rep.mejorMes.valor)}); el más flojo, ${rep.peorMes.etiqueta} (${formatoCOP(rep.peorMes.valor)}).`,
    });
  }

  // Egreso atípico: un solo gasto que concentra buena parte del mes puede
  // ser una compra puntual (equipo, una inversión), no un cambio real en
  // el ritmo de gasto — vale la pena distinguirlo antes de asustarse con
  // el total de "Egresos este mes".
  if (rep.egresoMasGrandeMes && rep.egresoMasGrandePct !== null && rep.egresoMasGrandePct >= 40) {
    senales.push({
      categoria: "Gasto atípico",
      positiva: null,
      texto: `"${rep.egresoMasGrandeMes.concepto}" (${formatoCOP(rep.egresoMasGrandeMes.valor)}) es el ${rep.egresoMasGrandePct}% del gasto de este mes — si fue algo puntual (no repetitivo), el gasto normal del despacho es más bajo que el total del mes.`,
    });
  }

  // Retención acumulada: recordatorio fiscal, no una señal de salud del
  // negocio — por eso no suma ni resta puntos, solo informa.
  if (rep.retenidoTotalHistorico > 0) {
    senales.push({
      categoria: "Retención acumulada",
      positiva: null,
      texto: `${formatoCOP(rep.retenidoTotalHistorico)} retenidos históricamente por tus clientes — ya se le declararon a la DIAN a tu nombre, tenlos presentes en tu declaración de renta.`,
    });
  }

  // Cuál área recomendar no es la que tiene más CLIENTES, sino la que más
  // PLATA ha facturado — un área con pocos clientes grandes puede pesar más
  // que una con muchos clientes chicos, y recomendar mercadeo por cantidad
  // llevaría a enfocar esfuerzo en lo que menos rentabilidad deja.
  const areaLider = (rep.filasAreaPorIngreso || [])[0];

  let veredicto;
  let color;
  let consejo;
  if (puntos >= 3) {
    veredicto = "Es buen momento para traer más clientes";
    color = "#10B981";
    consejo = `Los números aguantan crecer: ${areaLider ? `${areaLider[0]} es tu área más rentable hoy (${formatoCOP(areaLider[1])} facturados históricamente), un buen punto de partida para enfocar el mercadeo — no necesariamente la que más clientes tiene, sino la que más plata deja. ` : ""}Mantén el ritmo de cobro al día para que el crecimiento no se te vaya en cartera pendiente.`;
  } else if (puntos <= -3) {
    veredicto = "Antes de buscar más clientes, hay que estabilizar";
    color = "#B42318";
    consejo = "Resolver lo de arriba primero (cobro, margen o capacidad, según lo que aplique) evita que el crecimiento agrave el mismo problema en mayor escala.";
  } else {
    veredicto = "Vas estable — puedes crecer con cuidado";
    color = "#F5A524";
    consejo = "No hay una señal fuerte en ningún sentido: es razonable ir sumando clientes de a poco mientras vigilas que el margen y la cartera no se deterioren.";
  }

  return {
    listo: true,
    veredicto,
    color,
    consejo,
    senales,
    tendenciaPct,
    margenMes,
    margenHistorico,
    mesesDeCarteraAtascada,
    clientesPorAbogado: r.totalAbogados > 0 ? clientesPorAbogado : null,
    areaLider,
    mesesConPosibleTraslado,
  };
}

function TarjetaResumen({ titulo, valor, detalle, onClick, color, alerta }) {
  return (
    <button
      onClick={onClick}
      className="drx-card"
      style={{
        textAlign: "left",
        cursor: "pointer",
        background: COLORS.panel,
        border: `1px solid ${alerta ? color + "66" : COLORS.border}`,
        boxShadow: alerta ? `0 6px 20px ${color}1F` : "none",
        borderRadius: 14,
        padding: 18,
        width: 170,
        flexShrink: 0,
        fontFamily: "inherit",
      }}
    >
      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 600, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>
        {titulo}
      </p>
      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 800, color, margin: "8px 0 4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{valor}</p>
      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: COLORS.muted, margin: 0 }}>{detalle}</p>
    </button>
  );
}









// Nombre y personalidad propios para el asistente de Resumen — antes era
// "Asistente Nomos" a secas, sin identidad, lo que se sentía más a
// herramienta genérica que a alguien con quien de verdad se habla del
// negocio todos los días.
export const NOMBRE_ASISTENTE = "Lex";

// Burbuja flotante de Lex, visible en todas las pestañas (incluida
// Resumen, que antes tenía su propio chat fijo aparte — ahora es este
// mismo el único lugar donde se habla con Lex, sin duplicar la
// conversación en dos sitios). Reaparece cada cierto tiempo con un mensaje
// corto, casi siempre basado en pendientes reales del despacho para que no
// se sienta como relleno. Un clic (en la burbuja o en el avatar) abre el
// chat completo ahí mismo, flotando encima de lo que se esté viendo.
function LexFlotante({ usuarioActual }) {
  const r = useResumenGeneral();
  const [indice, setIndice] = useState(0);
  const [visible, setVisible] = useState(true);
  const [chatAbierto, setChatAbierto] = useState(false);

  const mensajes = useMemo(() => {
    const lista = [];
    if (r.pagosPendientes > 0) lista.push(`Tienes ${r.pagosPendientes} pago${r.pagosPendientes !== 1 ? "s" : ""} por vencer.`);
    if (r.procesosConNovedad > 0) lista.push(`${r.procesosConNovedad} proceso${r.procesosConNovedad !== 1 ? "s" : ""} con novedad judicial sin revisar.`);
    if (r.clientesInactivos > 0) lista.push(`${r.clientesInactivos} cliente${r.clientesInactivos !== 1 ? "s" : ""} sin actividad reciente — un mensaje corto ya ayuda.`);
    if (r.docsFaltaAbogado > 0) lista.push(`Tienes ${r.docsFaltaAbogado} documento${r.docsFaltaAbogado !== 1 ? "s" : ""} esperando tu firma.`);
    if (lista.length === 0) lista.push("Todo al día por hoy. Pregúntame lo que necesites.");
    lista.push("¿Registro un pago, busco un cliente, o te ayudo con algo más?");
    lista.push("Puedo generar recibos, documentos y hasta un resumen fiscal cuando quieras.");
    return lista;
  }, [r.pagosPendientes, r.procesosConNovedad, r.clientesInactivos, r.docsFaltaAbogado]);

  useEffect(() => {
    const rotar = setInterval(() => {
      setIndice((i) => (i + 1) % mensajes.length);
      setVisible(true);
    }, 45000);
    return () => clearInterval(rotar);
  }, [mensajes.length]);

  useEffect(() => {
    if (!visible) return;
    const ocultar = setTimeout(() => setVisible(false), 9000);
    return () => clearTimeout(ocultar);
  }, [visible, indice]);

  if (chatAbierto) {
    return (
      <div
        className="drx-fade-in"
        style={{
          position: "fixed",
          bottom: "calc(22px + var(--sab))",
          right: "calc(22px + var(--sar))",
          zIndex: 1600,
          width: "min(400px, calc(100vw - 32px))",
          maxHeight: "min(600px, calc(100dvh - 100px - var(--sat) - var(--sab)))",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ background: COLORS.panel, borderRadius: 16, boxShadow: "0 16px 48px rgba(16,24,40,0.24)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 8px 0" }}>
            <button
              onClick={() => setChatAbierto(false)}
              aria-label="Cerrar chat"
              style={{ background: COLORS.surfaceSoft, border: "none", borderRadius: "50%", width: 26, height: 26, cursor: "pointer", color: COLORS.muted, fontSize: 13 }}
            >
              ✕
            </button>
          </div>
          <div style={{ padding: "0 4px 4px", overflowY: "auto" }}>
            <AsistenteIA nombre={usuarioActual.nombre} usuarioId={usuarioActual.id} usuarioActual={usuarioActual} onAccionCompletada={r.reload} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", bottom: "calc(22px + var(--sab))", right: "calc(22px + var(--sar))", zIndex: 1500, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
      {visible && (
        <div
          className="drx-fade-in"
          onClick={() => setChatAbierto(true)}
          style={{
            maxWidth: 230,
            background: COLORS.panel,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 14,
            borderBottomRightRadius: 4,
            padding: "10px 12px",
            boxShadow: "0 8px 24px rgba(16,24,40,0.14)",
            cursor: "pointer",
            position: "relative",
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setVisible(false);
            }}
            aria-label="Ocultar"
            style={{ position: "absolute", top: 4, right: 6, background: "none", border: "none", cursor: "pointer", color: COLORS.muted, fontSize: 13, padding: 2, lineHeight: 1 }}
          >
            ✕
          </button>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 700, color: COLORS.navy, margin: "0 0 3px" }}>{NOMBRE_ASISTENTE}</p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.ink, margin: 0, lineHeight: 1.4, paddingRight: 10 }}>{mensajes[indice]}</p>
        </div>
      )}
      <button
        onClick={() => setChatAbierto(true)}
        title={`Hablar con ${NOMBRE_ASISTENTE}`}
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          border: "none",
          cursor: "pointer",
          background: `linear-gradient(135deg, ${COLORS.navy}, ${COLORS.accentBright})`,
          color: "#FFFFFF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          animation: "drx-flotar 3s ease-in-out infinite, drx-pulse-lex 2.6s ease-in-out infinite",
        }}
      >
        <IconoLex size={26} />
      </button>
    </div>
  );
}


// A propósito NO usa useIndex (el helper genérico que sí usan
// clientes/documentos/contenido): ese helper guarda sus ids en su propio
// useState, separado del useState de "eventos" de aquí — cada vez que ese
// índice cambiaba, un useEffect disparaba una recarga completa desde el
// servidor por su cuenta, EN PARALELO con lo que crear()/eliminar() ya
// habían puesto en el estado local. Aquí "ids" y "eventos" viven en el
// MISMO lugar (un solo useState) y cada operación (crear, eliminar,
// actualizar) es la única dueña de su propio resultado.
//
// SEGUNDO bug, distinto, encontrado después: crear/eliminar/actualizar
// también leían "estado" directo del cierre de React — pero un cierre
// queda fijo al momento exacto en que se creó. Cuando en AgendaTab se
// guarda un evento nuevo, primero se llama a crear() y, apenas responde
// Google Calendar (un viaje de red real, no instantáneo), se llama a
// actualizar(id, {googleEventoId...}) usando ESA MISMA función
// "actualizar" del mismo cierre — sin importar que React ya haya vuelto
// a renderizar de por medio, porque esta llamada en curso nunca "recoge"
// una versión más nueva de la función a la que ya se aferró. Para ese
// cierre viejo, "estado.eventos[id]" del evento recién creado no
// existía todavía → el merge quedaba en {...undefined, googleEventoId...}
// → se perdían título/fecha/hora del evento, tanto en pantalla como en
// el servidor (por eso no era un parpadeo, sino que quedaba roto de
// verdad). Como la lista filtra por "tiene título", el evento
// desaparecía apenas terminaba de guardar — justo lo que se seguía
// viendo. estadoRef es un valor mutable COMPARTIDO por todos los
// cierres, sin importar de qué render vengan, así que leer/escribir a
// través de él en vez del "estado" del cierre elimina el problema de
// raíz, sin depender de cuándo decida React volver a renderizar.
export function useEventosAgenda() {
  const [estado, setEstado] = useState({ ids: [], eventos: {} });
  const [cargado, setCargado] = useState(false);
  const estadoRef = useRef(estado);

  const cargar = useCallback(async () => {
    const idsActuales = await obtenerIdsAgenda();
    const valores = await obtenerValoresPorClaves(idsActuales.map((id) => `evento:${id}`));
    const mapa = {};
    idsActuales.forEach((id) => {
      const raw = valores[`evento:${id}`];
      if (raw) mapa[id] = JSON.parse(raw);
    });
    const nuevo = { ids: idsActuales, eventos: mapa };
    estadoRef.current = nuevo;
    setEstado(nuevo);
    setCargado(true);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const crear = async (datos) => {
    const id = uid();
    const registro = { ...datos, creadoEn: new Date().toISOString(), usuarioId: getUsuarioAgendaId() };
    const nuevosIds = [id, ...estadoRef.current.ids];
    await storageSet(`evento:${id}`, JSON.stringify(registro), true);
    await storageSet(claveIndiceAgenda(), JSON.stringify(nuevosIds), true);
    const nuevo = { ids: nuevosIds, eventos: { ...estadoRef.current.eventos, [id]: registro } };
    estadoRef.current = nuevo;
    setEstado(nuevo);
    return id;
  };

  const eliminar = async (id) => {
    const nuevosIds = estadoRef.current.ids.filter((x) => x !== id);
    await storageSet(claveIndiceAgenda(), JSON.stringify(nuevosIds), true);
    const { [id]: _quitado, ...restoEventos } = estadoRef.current.eventos;
    const nuevo = { ids: nuevosIds, eventos: restoEventos };
    estadoRef.current = nuevo;
    setEstado(nuevo);
  };

  const actualizar = async (id, cambios) => {
    const actualizado = { ...estadoRef.current.eventos[id], ...cambios };
    await storageSet(`evento:${id}`, JSON.stringify(actualizado), true);
    const nuevo = { ...estadoRef.current, eventos: { ...estadoRef.current.eventos, [id]: actualizado } };
    estadoRef.current = nuevo;
    setEstado(nuevo);
  };

  return { ids: estado.ids, eventos: estado.eventos, cargado, crear, eliminar, actualizar, reload: cargar };
}

// Tareas internas del despacho: quien lleva el caso le asigna algo puntual
// a un colega ("proyectar la contestación", "llamar al cliente"), el colega
// la ve en su Resumen y en la campanita, y la marca como hecha cuando
// termina — así el que la asignó sabe quién tiene qué y si ya se resolvió,
// sin un Excel aparte. Cada colega decide cuándo agendarla en su propia
// agenda. Se guarda una fila por tarea ("tarea:ID") más un índice del
// despacho: marcar una tarea solo reescribe su propia fila, nunca la lista
// entera, así dos personas trabajando a la vez no se pisan.
export function useTareas() {
  const [estado, setEstado] = useState({ ids: [], tareas: {} });
  const [cargado, setCargado] = useState(false);
  const estadoRef = useRef(estado);
  const fijar = (nuevo) => {
    estadoRef.current = nuevo;
    setEstado(nuevo);
  };

  const cargar = useCallback(async () => {
    const raw = await storageGet("indice-tareas");
    const ids = raw ? JSON.parse(raw) : [];
    const valores = await obtenerValoresPorClaves(ids.map((id) => `tarea:${id}`));
    const tareas = {};
    ids.forEach((id) => {
      const v = valores[`tarea:${id}`];
      if (v) tareas[id] = JSON.parse(v);
    });
    fijar({ ids: ids.filter((id) => tareas[id]), tareas });
    setCargado(true);
  }, []);

  // Se vuelve a leer al regresar a la app y cada 2 minutos: así una tarea
  // que te acaban de asignar aparece sin tener que recargar la página.
  useEffect(() => {
    cargar();
    const alVolver = () => {
      if (document.visibilityState === "visible") cargar();
    };
    document.addEventListener("visibilitychange", alVolver);
    const intervalo = setInterval(cargar, 120000);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      clearInterval(intervalo);
    };
  }, [cargar]);

  const crear = async (datos) => {
    const id = uid();
    const tarea = {
      id,
      titulo: datos.titulo.trim(),
      detalle: (datos.detalle || "").trim(),
      clienteId: datos.clienteId || null,
      clienteNombre: datos.clienteNombre || "",
      asignadoA: datos.asignadoA,
      asignadoNombre: datos.asignadoNombre || "",
      creadoPor: datos.creadoPor,
      creadoPorNombre: datos.creadoPorNombre || "",
      fechaLimite: datos.fechaLimite || "",
      estado: "pendiente",
      creadoEn: new Date().toISOString(),
      // Quien se asigna algo a sí mismo ya lo vio; a un colega le aparece
      // como nueva en la campanita hasta que la abra.
      vistaPorAsignado: datos.asignadoA === datos.creadoPor,
    };
    await storageSet(`tarea:${id}`, JSON.stringify(tarea));
    // Se relee el índice justo antes de escribirlo para no borrar una
    // tarea que otro colega haya creado mientras tanto.
    const raw = await storageGet("indice-tareas");
    const idsServidor = raw ? JSON.parse(raw) : [];
    await storageSet("indice-tareas", JSON.stringify([id, ...idsServidor.filter((x) => x !== id)]));
    const actual = estadoRef.current;
    fijar({ ids: [id, ...actual.ids.filter((x) => x !== id)], tareas: { ...actual.tareas, [id]: tarea } });
    return tarea;
  };

  const actualizar = async (id, cambios) => {
    const actual = estadoRef.current;
    if (!actual.tareas[id]) return;
    const tarea = { ...actual.tareas[id], ...cambios };
    await storageSet(`tarea:${id}`, JSON.stringify(tarea));
    fijar({ ...estadoRef.current, tareas: { ...estadoRef.current.tareas, [id]: tarea } });
    window.dispatchEvent(new Event("nomos:tareas-cambiaron"));
  };

  const eliminar = async (id) => {
    const raw = await storageGet("indice-tareas");
    const idsServidor = raw ? JSON.parse(raw) : [];
    await storageSet("indice-tareas", JSON.stringify(idsServidor.filter((x) => x !== id)));
    const actual = estadoRef.current;
    const { [id]: _quitada, ...resto } = actual.tareas;
    fijar({ ids: actual.ids.filter((x) => x !== id), tareas: resto });
  };

  const lista = estado.ids.map((id) => estado.tareas[id]).filter(Boolean);
  return { tareas: lista, cargado, crear, actualizar, eliminar, recargar: cargar };
}

// Revisa cada 30s si algún evento de la agenda ya se cumplió y todavía no se
// avisó — cuando pasa, suena una vez y muestra una notificación del sistema
// (si el navegador tiene permiso). Se guarda qué ids ya sonaron en
// localStorage para no repetir el aviso si la pestaña sigue abierta.
function useAgendaRecordatorios() {
  useEffect(() => {
    const LLAVE = "agenda-eventos-notificados";
    let yaNotificados;
    try {
      yaNotificados = new Set(JSON.parse(localStorage.getItem(LLAVE) || "[]"));
    } catch (e) {
      yaNotificados = new Set();
    }
    const guardar = () => localStorage.setItem(LLAVE, JSON.stringify([...yaNotificados]));

    const sonar = () => {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
        osc.start();
        osc.stop(ctx.currentTime + 0.65);
      } catch (e) {
        /* algunos navegadores bloquean audio sin interacción previa — no pasa nada si falla */
      }
    };

    let cancelado = false;
    const revisar = async () => {
      if (cancelado) return;
      const ids = (await obtenerIdsAgenda()).filter((id) => !yaNotificados.has(id));
      const ahora = Date.now();
      const valores = await obtenerValoresPorClaves(ids.map((id) => `evento:${id}`));
      for (const id of ids) {
        const raw = valores[`evento:${id}`];
        if (!raw) continue;
        const evento = JSON.parse(raw);
        const momento = new Date(`${evento.fecha}T${evento.hora || "08:00"}:00`).getTime();
        if (Number.isNaN(momento)) continue;
        // Solo avisa eventos vencidos en las últimas 24h — evita una lluvia de
        // avisos viejos si el despacho estuvo varios días sin abrir la app.
        if (momento <= ahora && ahora - momento < 24 * 60 * 60 * 1000) {
          yaNotificados.add(id);
          guardar();
          sonar();
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification(evento.titulo, { body: evento.notas || "Tienes un evento en tu agenda.", icon: "/icon-192.png" });
          }
        }
      }
    };

    revisar();
    const intervalo = setInterval(revisar, 30000);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, []);
}

// Un término procesal vencido no es "se te olvidó una reunión" — puede ser
// perder el proceso. Por eso tiene su propia escala de urgencia (roja mucho
// antes que un evento normal) en vez de tratarse como cualquier otro
// recordatorio de la agenda.
export function urgenciaTermino(dias) {
  if (dias === null) return { etiqueta: "Sin fecha", color: COLORS.muted, bg: COLORS.surfaceSoft };
  if (dias < 0) return { etiqueta: `Vencido hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? "" : "s"}`, color: "#B42318", bg: "#FEF2F2" };
  if (dias === 0) return { etiqueta: "Vence hoy", color: "#B42318", bg: "#FEF2F2" };
  if (dias <= 5) return { etiqueta: `Vence en ${dias} día${dias === 1 ? "" : "s"}`, color: "#B42318", bg: "#FEF2F2" };
  if (dias <= 15) return { etiqueta: `Vence en ${dias} días`, color: "#B45309", bg: "#FEF3E2" };
  return { etiqueta: `Vence en ${dias} días`, color: "#166534", bg: "#F0FDF4" };
}

function TerminosPorVencerResumen({ onIr }) {
  const { ids, eventos, cargado } = useEventosAgenda();
  if (!cargado) return null;
  const terminos = ids
    .map((id) => ({ id, ...eventos[id] }))
    .filter((e) => e?.titulo && e.esTermino && !e.completado)
    .map((e) => ({ ...e, dias: diasHasta(e.fecha) }))
    .filter((e) => e.dias !== null && e.dias <= 15)
    .sort((a, b) => a.dias - b.dias)
    .slice(0, 5);
  if (terminos.length === 0) return null;
  return (
    <Card style={{ marginBottom: 24, borderLeft: "4px solid #B42318" }}>
      <p
        style={{
          fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: "#B42318",
          textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 12px", display: "flex", alignItems: "center", gap: 6,
        }}
      >
        <Icono tipo="alerta" size={14} /> Términos procesales por vencer
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {terminos.map((t) => {
          const u = urgenciaTermino(t.dias);
          return (
            <div
              key={t.id}
              onClick={() => onIr("agenda")}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
                background: u.bg, border: `1px solid ${u.color}40`, borderRadius: 8, padding: "9px 12px", cursor: "pointer",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: COLORS.ink, margin: 0 }}>{t.titulo}</p>
                {t.clienteRelacionado && <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: COLORS.muted, margin: "2px 0 0" }}>{t.clienteRelacionado}</p>}
              </div>
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: u.color, whiteSpace: "nowrap", flexShrink: 0 }}>{u.etiqueta}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ProximoEventoResumen({ onIr }) {
  const { ids, eventos, cargado } = useEventosAgenda();
  if (!cargado) return null;
  const hoyISO = fechaHoyISO();
  const ahora = new Date();
  const proximo = ids
    .map((id) => eventos[id])
    .filter((e) => {
      if (!e?.titulo || !e.fecha) return false;
      if (e.fecha > hoyISO) return true;
      if (e.fecha === hoyISO) {
        // Si tiene hora, solo mostrar si la cita aún no pasó
        if (!e.hora) return true;
        const [h, m] = e.hora.split(":").map(Number);
        const horaEvento = new Date(ahora);
        horaEvento.setHours(h, m, 0, 0);
        return horaEvento > ahora;
      }
      return false; // Fecha pasada: no mostrar
    })
    .sort((a, b) => `${a.fecha}T${a.hora || "00:00"}`.localeCompare(`${b.fecha}T${b.hora || "00:00"}`))[0];
  if (!proximo) return null;
  const fechaTexto = new Date(`${proximo.fecha}T${proximo.hora || "00:00"}:00`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
  return (
    <Card style={{ marginBottom: 24, cursor: "pointer" }} onClick={() => onIr("agenda")}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: COLORS.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.navy, flexShrink: 0 }}>
          <Icono tipo="calendario" size={16} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>Próximo en tu agenda</p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 700, color: COLORS.ink, margin: "3px 0 0" }}>
            {proximo.titulo} <span style={{ fontWeight: 500, color: COLORS.muted, textTransform: "capitalize" }}>— {fechaTexto}{proximo.hora ? ` · ${proximo.hora}` : ""}</span>
          </p>
        </div>
      </div>
    </Card>
  );
}


function ResumenTab({ nombre, usuarioId, usuarioActual, onIr, onListo, puedeVer = () => true }) {
  const r = useResumenGeneral();
  const rep = useDatosReportes();
  // Resumen ya muestra sus propias tarjetas con su carga progresiva (cada
  // una llena su dato apenas llega, no espera a que todo esté listo) — no
  // tiene sentido bloquear la pantalla de carga de afuera hasta que TODO
  // termine, así que avisa "listo" de una vez al montar.
  useEffect(() => {
    onListo?.();
  }, []);
  const versiculo = fraseDelDia(VERSICULOS);
  const tareasPendientes = r.clientesInactivos + r.docsFaltaAbogado + r.pagosPendientes + r.procesosConNovedad;
  // Se usa en dos tarjetas de abajo (el veredicto y, aparte, la alerta de
  // traslados) — calcularlo una sola vez por render en vez de dos evita
  // recorrer los últimos 6 meses de datos financieros por partida doble.
  const analisis = useMemo(() => analisisFinanciero(rep, r), [rep, r]);
  const [mostrarGlosario, setMostrarGlosario] = useState(false);

  return (
    <div>
      <div className="drx-glow" style={{ textAlign: "center", padding: "30px 16px 34px" }}>
        <div style={{ marginBottom: 18 }}>
          <Pill><Icono tipo="balanza" size={13} style={{ marginRight: 2, verticalAlign: -2 }} /> {getNombreDespacho()} — Panel de gestión</Pill>
        </div>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.muted, marginBottom: 10 }}>Hola, {nombre}</p>
        <h1 style={{ fontFamily: "Inter, sans-serif", fontSize: 34, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", margin: 0, lineHeight: 1.2 }}>
          <span style={{ color: COLORS.headingText }}>Jefe, </span>
          <span
            style={{
              background: `linear-gradient(100deg, ${COLORS.navy}, ${COLORS.accentBright} 55%, #14B8A6)`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            ¿qué hacemos hoy?
          </span>
        </h1>
        <p
          style={{
            fontFamily: "'Source Serif 4', serif",
            fontStyle: "italic",
            fontSize: 15,
            color: COLORS.inkSoft,
            marginTop: 20,
            maxWidth: 480,
            marginLeft: "auto",
            marginRight: "auto",
            lineHeight: 1.6,
          }}
        >
          "{versiculo.texto}"
          <br />
          <span style={{ fontSize: 12, color: COLORS.muted, fontStyle: "normal" }}>— {versiculo.ref}</span>
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 24 }}>
          {[
            { texto: "+ Nuevo cliente", tab: "clientes" },
            { texto: "+ Nuevo documento", tab: "documentos" },
            { texto: "+ Registrar pago", tab: "contabilidad" },
            { texto: "+ Evento en agenda", tab: "agenda" },
          ].filter((a) => puedeVer(a.tab)).map((a) => (
            <button
              key={a.tab}
              className="drx-btn-ghost"
              style={{ ...buttonGhost, background: COLORS.panel }}
              onClick={() => onIr(a.tab)}
            >
              {a.texto}
            </button>
          ))}
        </div>
      </div>

      <ProximoEventoResumen onIr={onIr} />
      <TerminosPorVencerResumen onIr={onIr} />

      {(() => {
        const d = diagnosticoOperacion(r);
        return (
          <Card style={{ marginBottom: 24, borderLeft: `4px solid ${d.color}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: d.razones.length ? 12 : 0, flexWrap: "wrap", gap: 8 }}>
              <div>
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 600, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>
                  Cómo va tu empresa
                </p>
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 18, fontWeight: 800, color: d.color, margin: "4px 0 0" }}>{d.etiqueta}</p>
              </div>
              <div
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: "50%",
                  border: `4px solid ${d.color}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "Inter, sans-serif",
                  fontWeight: 800,
                  fontSize: 15,
                  color: d.color,
                  flexShrink: 0,
                  animation: "drx-pulse 2.4s ease-in-out infinite",
                }}
              >
                {d.puntaje}
              </div>
            </div>
            {d.razones.length > 0 && (
              <div>
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.inkSoft, marginBottom: 8 }}>
                  Lo que está bajando el puntaje: {d.razones.join(" · ")}.
                </p>
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: COLORS.headingText, marginBottom: 4 }}>Qué mejorar:</p>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {d.sugerencias.map((s, i) => (
                    <li key={i} style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.inkSoft, marginBottom: 2 }}>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        );
      })()}

      {(() => {
        const a = analisis;
        const iconoSenal = (categoria) =>
          ({
            Tendencia: "grafico",
            "Año contra año": "grafico",
            "Rango del semestre": "grafico",
            Margen: "objetivo",
            "Punto de equilibrio": "balanza",
            "Cartera atrasada": "reloj",
            "Cobro sin programar": "reloj",
            Cobro: "alerta",
            "Gasto atípico": "alerta",
            Capacidad: "persona",
            Concentración: "objetivo",
            "Flujo de caja": "calendario",
            "Calidad del dato": "escudo",
            "Retención acumulada": "documento",
          }[categoria] || "chispa");
        return (
          <Card style={{ marginBottom: 24, borderRadius: 16, position: "relative", overflow: "hidden" }}>
            <div
              style={{
                position: "absolute",
                right: -40,
                top: -50,
                width: 180,
                height: 180,
                borderRadius: "50%",
                background: `radial-gradient(circle, ${a.listo ? a.color : COLORS.navy}14, transparent 70%)`,
                pointerEvents: "none",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, position: "relative" }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  flexShrink: 0,
                  background: `linear-gradient(135deg, ${COLORS.navy}, ${COLORS.navyDeep})`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#FFFFFF",
                  boxShadow: `0 6px 14px ${COLORS.navy}40`,
                }}
              >
                <IconoLex size={21} />
              </div>
              <div>
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14.5, fontWeight: 800, color: COLORS.headingText, margin: 0 }}>
                  {NOMBRE_ASISTENTE} · análisis financiero
                </p>
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, margin: "2px 0 0" }}>Con base en tus ingresos, egresos, cartera y carga de trabajo</p>
              </div>
            </div>

            {!a.listo ? (
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.inkSoft, margin: 0 }}>
                Todavía no hay suficiente historial de ingresos y egresos para dar un veredicto confiable — con dos o tres meses de pagos y egresos registrados, aquí verás si conviene salir a buscar más clientes o consolidar primero.
              </p>
            ) : (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    background: `linear-gradient(135deg, ${a.color}1A, ${a.color}0D)`,
                    border: `1px solid ${a.color}35`,
                    borderRadius: 12,
                    padding: "12px 16px",
                    marginBottom: 16,
                  }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: a.color, flexShrink: 0, boxShadow: `0 0 0 4px ${a.color}25` }} />
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 17, fontWeight: 800, color: a.color, margin: 0 }}>{a.veredicto}</p>
                </div>
                <p style={{ fontFamily: "'Source Serif 4', serif", fontSize: 13.5, color: COLORS.ink, lineHeight: 1.6, margin: "0 0 16px" }}>{a.consejo}</p>

                {rep.fechaDatosLimpios && (
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: COLORS.muted, margin: "0 0 14px", fontStyle: "italic" }}>
                    Los meses antes del {new Date(`${rep.fechaDatosLimpios}T12:00:00`).toLocaleDateString("es-CO", { dateStyle: "long" })} quedaron cargados en bloque (sin clasificar cliente por cliente) — el análisis no los marca como sospechosos por eso.
                  </p>
                )}

                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 10px" }}>
                  Lo que hay detrás del veredicto
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10, marginBottom: 6 }}>
                  {a.senales.map((s, i) => {
                    const colorSenal = s.positiva === true ? "#166534" : s.positiva === false ? "#B42318" : COLORS.navy;
                    const fondoSenal = s.positiva === true ? "#F0FDF4" : s.positiva === false ? "#FEF2F2" : COLORS.surfaceSoft;
                    const bordeSenal = s.positiva === true ? "#BBF7D0" : s.positiva === false ? "#FECACA" : COLORS.border;
                    return (
                      <button
                        key={i}
                        onClick={() => onIr("contabilidad")}
                        title="Ver el detalle en Contabilidad"
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 10,
                          background: fondoSenal,
                          border: `1px solid ${bordeSenal}`,
                          cursor: "pointer",
                          textAlign: "left",
                          padding: "11px 12px",
                          borderRadius: 11,
                          fontFamily: "inherit",
                        }}
                        className="drx-senal-clicable"
                      >
                        <div
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 8,
                            flexShrink: 0,
                            background: `${colorSenal}1A`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: colorSenal,
                          }}
                        >
                          <Icono tipo={iconoSenal(s.categoria)} size={13} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 10.5, fontWeight: 800, color: colorSenal, textTransform: "uppercase", letterSpacing: 0.4, margin: "0 0 3px" }}>
                            {s.categoria}
                          </p>
                          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.ink, margin: 0, lineHeight: 1.45 }}>{s.texto}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: COLORS.muted, margin: "0 0 14px" }}>Toca cualquier tarjeta para ver el detalle en Contabilidad.</p>
                <button
                  onClick={() => setMostrarGlosario((m) => !m)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    marginTop: 14,
                    fontFamily: "Inter, sans-serif",
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: COLORS.accentBright,
                  }}
                >
                  {mostrarGlosario ? "Ocultar qué significan estos términos ▲" : "¿Qué significan estos términos? ▼"}
                </button>
                {mostrarGlosario && (
                  <div style={{ marginTop: 10, background: COLORS.surfaceSoft, borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      ["Margen neto", "de cada peso que te paga un cliente, cuánto te queda después de pagar todos los gastos del mes. Si el margen es 30%, de $100.000 te quedan $30.000 limpios."],
                      ["Cartera atrasada (en meses de facturación)", "cuánto te deben los clientes que ya se pasaron de la fecha de su próximo pago (no lo que va a cuotas a tiempo), expresado en cuántos meses de tu facturación normal representa esa plata — si son 2 meses, significa que tienes atascados dos meses enteros de ingreso realmente atrasado."],
                      ["Flujo de caja proyectado", "la plata que ya sabes que te va a entrar en los próximos meses (por los pagos pendientes ya acordados con tus clientes), no lo que esperas o deseas — es lo comprometido de verdad."],
                      ["Capacidad por abogado", "cuántos clientes activos atiende, en promedio, cada abogado del despacho — si el número es muy alto, el freno para crecer puede ser que no dan abasto, no que falten clientes."],
                      ["Concentración de cartera", "qué porcentaje de todo lo que ha facturado el despacho viene de un solo cliente. Mientras más alto, más riesgo — si ese cliente se va, se va una parte grande de tu facturación de un solo golpe."],
                      ["Punto de equilibrio", "cuántos clientes, pagando lo que paga un cliente típico (tu ticket promedio), necesitas cada mes solo para cubrir tus gastos — no para ganar, solo para no perder. Todo lo que entra por encima de ese número es ganancia real."],
                      ["Año contra año", "compara lo facturado este año hasta hoy contra lo que llevabas facturado en el mismo día del año pasado — dice si de verdad estás creciendo, o si solo estás viendo el vaivén normal de un mes bueno o malo."],
                      ["Cobro sin programar", "clientes que todavía te deben pero a los que no les has puesto fecha de próximo pago — no aparecen como atrasados (todavía no vence nada), pero tampoco se ven en el flujo de caja proyectado."],
                      ["Gasto atípico", "cuando un solo egreso concentra una parte muy grande del gasto del mes — si fue algo puntual (un equipo, una inversión), el gasto normal del despacho es más bajo que el total que ves ese mes."],
                      ["Retención acumulada", "la plata que tus clientes le han retenido a tus pagos y ya le declararon a la DIAN a tu nombre — no es un ingreso perdido, es un anticipo de tus propios impuestos que debes tener presente al declarar renta."],
                    ].map(([termino, def]) => (
                      <p key={termino} style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.inkSoft, margin: 0, lineHeight: 1.5 }}>
                        <strong style={{ color: COLORS.headingText }}>{termino}:</strong> {def}
                      </p>
                    ))}
                  </div>
                )}
              </>
            )}
          </Card>
        );
      })()}

      {(() => {
        const a = analisis;
        if (!a.listo || !a.mesesConPosibleTraslado?.length) return null;
        return (
          <Card style={{ marginBottom: 24, borderLeft: "4px solid #F5A524", background: "#FFFBEB" }}>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 700, color: "#92400E", margin: "0 0 6px" }}>
              <Icono tipo="alerta" size={14} style={{ marginRight: 4, verticalAlign: -2 }} /> Posible plata duplicada por traslados entre tus cuentas
            </p>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: "#92400E", margin: "0 0 10px", lineHeight: 1.5 }}>
              En estos meses, lo que entró y lo que salió son casi el mismo valor — típico de mover la misma plata entre Nequi, Nu o Daviplata y registrarla dos veces (como egreso al salir y como ingreso al entrar), en vez de ser gasto real. Esto no suele afectar mucho el Neto (se cancela solo), pero sí infla el Recaudado y los Egresos brutos.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
              {a.mesesConPosibleTraslado.map((m) => (
                <button
                  key={m.etiqueta}
                  onClick={() => onIr("contabilidad")}
                  title="Ver el detalle en Contabilidad"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    background: "#fff",
                    border: "1px solid #FDE68A",
                    borderRadius: 8,
                    padding: "7px 11px",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textAlign: "left",
                    width: "100%",
                  }}
                  className="drx-senal-clicable"
                >
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 600, color: "#92400E", margin: 0, textTransform: "capitalize" }}>{m.etiqueta}</p>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "#92400E", margin: 0 }}>
                    Entró {formatoCOP(m.ingreso)} · Salió {formatoCOP(m.egreso)}
                  </p>
                </button>
              ))}
            </div>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "#92400E", margin: 0 }}>
              Revisa esos meses en los extractos de cada cuenta: si el que envía o recibe eres tú mismo (no un cliente ni un tercero), bórralo en Contabilidad — no es un ingreso ni un gasto real.
            </p>
          </Card>
        );
      })()}

      {usuarioActual?.id && (
        <Suspense fallback={null}>
          <PanelTareasLazy usuarioActual={usuarioActual} />
        </Suspense>
      )}

      {tareasPendientes > 0 && (
        <div className="drx-fade-in" style={{ marginBottom: 20 }}>
          <Card style={{ borderLeft: "4px solid #F5A524" }}>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 700, color: COLORS.headingText, marginBottom: 10 }}>
              <Icono tipo="portapapeles" size={14} style={{ marginRight: 4, verticalAlign: -2 }} /> Pendientes de hoy ({tareasPendientes})
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {r.procesosConNovedad > 0 && (
                <BotonPendiente texto={`${r.procesosConNovedad} proceso${r.procesosConNovedad !== 1 ? "s" : ""} con novedad judicial`} onClick={() => onIr("vigilancia")} />
              )}
              {r.docsFaltaAbogado > 0 && (
                <BotonPendiente texto={`${r.docsFaltaAbogado} documento${r.docsFaltaAbogado !== 1 ? "s" : ""} esperando tu firma`} onClick={() => onIr("documentos")} />
              )}
              {r.pagosPendientes > 0 && (
                <BotonPendiente texto={`${r.pagosPendientes} pago${r.pagosPendientes !== 1 ? "s" : ""} por vencer`} onClick={() => onIr("contabilidad")} />
              )}
              {r.clientesInactivos > 0 && (
                <BotonPendiente texto={`${r.clientesInactivos} cliente${r.clientesInactivos !== 1 ? "s" : ""} inactivo${r.clientesInactivos !== 1 ? "s" : ""}`} onClick={() => onIr("clientes")} />
              )}
            </div>
          </Card>
        </div>
      )}

      {!rep.cargando && rep.listaClientes.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginBottom: 20 }}>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 700, color: COLORS.ink, margin: 0 }}>Ingresos vs. egresos</p>
              <button className="drx-btn-ghost" style={{ ...buttonGhost, padding: "4px 10px", fontSize: 11.5 }} onClick={() => onIr("reportes")}>
                Ver reportes →
              </button>
            </div>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: COLORS.muted, marginBottom: 14 }}>
              Últimos 6 meses · Neto: {formatoCOP(rep.netoTotalHistorico)}
            </p>
            <GraficaBarrasAgrupadas
              categorias={rep.mesesEtiquetas.map((m) => m.etiqueta)}
              series={[
                { nombre: "Ingresos", color: "#2F80ED", valores: rep.mesesEtiquetas.map((m) => rep.ingresosPorMes[m.clave]) },
                { nombre: "Egresos", color: "#F43F5E", valores: rep.mesesEtiquetas.map((m) => rep.egresosPorMes[m.clave]) },
              ]}
              formatoValor={formatoCOP}
              alto={130}
            />
          </Card>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 700, color: COLORS.ink, margin: 0 }}>Procesos por estado</p>
              <button className="drx-btn-ghost" style={{ ...buttonGhost, padding: "4px 10px", fontSize: 11.5 }} onClick={() => onIr("vigilancia")}>
                Ver vigilancia →
              </button>
            </div>
            <GraficaBarras
              alto={130}
              datos={[
                ...ESTADOS_VIGILANCIA.map((estado) => ({ etiqueta: estado, valor: rep.conteoEstados[estado], color: COLOR_ESTADO_VIGILANCIA[estado] })),
                ...(rep.sinRevisar > 0 ? [{ etiqueta: "Sin revisar", valor: rep.sinRevisar, color: "#94A3B8" }] : []),
              ]}
            />
          </Card>
        </div>
      )}

      {tareasPendientes === 0 && <EstadoVacio icono={<Icono tipo="check" size={26} />} texto="Todo al día — no hay pendientes urgentes por ahora." />}
    </div>
  );
}

function BotonPendiente({ texto, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
        textAlign: "left",
        fontFamily: "Inter, sans-serif",
        fontSize: 13,
        fontWeight: 600,
        color: COLORS.ink,
        background: COLORS.surfaceSoft,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        padding: "10px 14px",
        cursor: "pointer",
      }}
    >
      <span>{texto}</span>
      <span style={{ color: COLORS.muted }}>→</span>
    </button>
  );
}



// VistaFirma (y sus dos ayudantes DocumentoConFirmas/DIAS_VENCIMIENTO_FIRMA)
// viven en src/views/VistaFirma.jsx y se cargan con lazy() — es la pantalla
// pública de firma electrónica (#firmar), que un despacho ya logueado nunca
// ve en su día a día.

// ---------- Panel del abogado ----------
function TabButton({ active, onClick, children }) {
  return (
    <button
      className="drx-tab"
      onClick={onClick}
      style={{
        border: active ? "none" : `1px solid ${COLORS.border}`,
        background: active ? COLORS.navy : "#FFFFFF",
        color: active ? "#FFFFFF" : COLORS.inkSoft,
        fontFamily: "Inter, sans-serif",
        fontWeight: 600,
        fontSize: 13.5,
        padding: "9px 18px",
        borderRadius: 20,
        marginRight: 10,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}






const COLORES_AVATAR = ["#2F80ED", "#14B8A6", "#8B5CF6", "#F5A524", "#F43F5E", "#10B981", "#0EA5E9"];

export function AvatarIniciales({ nombre, size = 34, fotoUrl }) {
  const texto = (nombre || "?").trim();
  const iniciales = texto
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
  let hash = 0;
  for (let i = 0; i < texto.length; i++) hash = texto.charCodeAt(i) + ((hash << 5) - hash);
  const color = COLORES_AVATAR[Math.abs(hash) % COLORES_AVATAR.length];
  if (fotoUrl) {
    return (
      <img
        src={fotoUrl}
        alt={texto}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
          boxShadow: `0 3px 8px ${color}55`,
          border: "2px solid rgba(255,255,255,0.6)",
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `linear-gradient(135deg, ${color}, ${color}CC)`,
        color: "#FFFFFF",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Inter, sans-serif",
        fontWeight: 700,
        fontSize: size * 0.4,
        flexShrink: 0,
        boxShadow: `0 3px 8px ${color}55`,
        border: "2px solid rgba(255,255,255,0.6)",
      }}
    >
      {iniciales || "?"}
    </div>
  );
}

function SidebarButton({ active, onClick, onMouseEnter, children, color, icono, tour }) {
  const c = color || "#2F80ED";
  return (
    <button
      className="drx-tab"
      data-tour={tour}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        textAlign: "left",
        border: `1px solid ${active ? c : "rgba(255,255,255,0.08)"}`,
        background: active ? `${c}26` : "rgba(255,255,255,0.03)",
        color: active ? "#FFFFFF" : "#B9CBE5",
        fontFamily: "Inter, sans-serif",
        fontWeight: 700,
        fontSize: 11.5,
        letterSpacing: 0.6,
        textTransform: "uppercase",
        padding: "12px 14px",
        borderRadius: 10,
        cursor: "pointer",
        boxShadow: active ? `0 0 0 1px ${c}40, 0 4px 14px ${c}26` : "none",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: active ? 1 : 0.85 }}>
        <IconoTab tipo={icono} />
      </span>
      <span style={{ flex: 1 }}>{children}</span>
      {active && <span style={{ width: 6, height: 6, borderRadius: "50%", background: c, flexShrink: 0, boxShadow: `0 0 6px ${c}` }} />}
    </button>
  );
}

function BuscadorGlobal({ onIr }) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [indiceActivo, setIndiceActivo] = useState(-1);
  const inputRef = useRef(null);

  useEffect(() => {
    const texto = q.trim();
    if (texto.length < 2) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    const timer = setTimeout(async () => {
      const encontrados = await buscarGlobal(texto);
      setResultados(encontrados);
      setIndiceActivo(-1);
      setBuscando(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    const alPresionarTecla = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", alPresionarTecla);
    return () => window.removeEventListener("keydown", alPresionarTecla);
  }, []);

  const ir = (tabDestino) => {
    onIr(tabDestino);
    setAbierto(false);
    setQ("");
    setResultados([]);
  };

  return (
    <div style={{ position: "relative", flex: 1, minWidth: 0, maxWidth: 320 }}>
      <input
        ref={inputRef}
        className="drx-input"
        style={{ ...inputStyle, width: "100%", minWidth: 0, boxSizing: "border-box" }}
        placeholder="Buscar cliente o documento..."
        data-tour="buscar"
        title="Buscar cliente o documento (Ctrl+K)"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={(e) => {
          if (!resultados.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIndiceActivo((i) => (i + 1) % resultados.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setIndiceActivo((i) => (i <= 0 ? resultados.length - 1 : i - 1));
          } else if (e.key === "Enter" && indiceActivo >= 0) {
            e.preventDefault();
            const r = resultados[indiceActivo];
            ir(r.tipo === "cliente" ? "clientes" : "documentos");
          } else if (e.key === "Escape") {
            setAbierto(false);
          }
        }}
      />
      {abierto && q.trim().length >= 2 && (
        <div
          className="drx-dropdown-in"
          style={{
            position: "absolute",
            top: "110%",
            left: 0,
            right: 0,
            background: COLORS.panel,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            boxShadow: "0 8px 20px rgba(0,0,0,0.15)",
            zIndex: 30,
            maxHeight: 320,
            overflowY: "auto",
            transformOrigin: "top center",
          }}
        >
          {buscando && (
            <p style={{ padding: 12, fontSize: 12.5, color: COLORS.muted, fontFamily: "Inter, sans-serif", margin: 0 }}>Buscando…</p>
          )}
          {!buscando && resultados.length === 0 && (
            <p style={{ padding: 12, fontSize: 12.5, color: COLORS.muted, fontFamily: "Inter, sans-serif", margin: 0 }}>Sin resultados.</p>
          )}
          {resultados.map((r, i) => (
            <button
              key={`${r.tipo}-${r.id}`}
              onMouseDown={() => ir(r.tipo === "cliente" ? "clientes" : "documentos")}
              onMouseEnter={() => setIndiceActivo(i)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                background: i === indiceActivo ? COLORS.accentSoft : "none",
                border: "none",
                borderBottom: `1px solid ${COLORS.border}`,
                padding: "10px 12px",
                cursor: "pointer",
                fontFamily: "Inter, sans-serif",
                transition: "background .12s ease",
              }}
            >
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{r.titulo}</p>
              <p style={{ margin: "2px 0 0", fontSize: 11, color: COLORS.muted }}>{r.tipo === "cliente" ? "Cliente" : "Documento"}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Reescribe una nota de actuación pegada (a veces copiada tal cual de un acta
// o de un mensaje, con errores de forma o de más rodeos) como un párrafo
// claro y profesional para el expediente — sin inventar datos que no estén
// en el texto original, solo mejorando la redacción. Responde en texto
// plano (no JSON): es una sola nota, no hay nada que parsear ni que se
// pueda romper por un formato inesperado.
async function redactarActuacionConIA(textoOriginal, { alReintentar } = {}) {
  // Si Google está saturado, el servidor ya reintentó; aquí se espera un poco
  // más y se intenta una última vez antes de mostrar el error.
  try {
    return await pedirRedaccionActuacion(textoOriginal);
  } catch (e) {
    if (!e.saturado) throw e;
    alReintentar?.();
    await new Promise((r) => setTimeout(r, 4000));
    return pedirRedaccionActuacion(textoOriginal);
  }
}

async function pedirRedaccionActuacion(textoOriginal) {
  const { data: sesionData } = await supabase.auth.getSession();
  const token = sesionData?.session?.access_token;
  const response = await fetch("/api/assistant", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      // El modelo que usa /api/assistant "piensa" antes de responder, y ese
      // pensamiento interno también consume el límite de tokens aunque no
      // se vea — con poco margen la respuesta visible sale cortada a la
      // mitad.
      max_tokens: 700,
      system:
        "Eres un asistente que ayuda a un abogado colombiano a redactar la línea de tiempo de un caso. Te dan un texto pegado tal cual (puede venir con errores de forma, muy informal, o mal organizado) sobre una actuación o novedad del proceso. " +
        "Reescríbelo como una nota clara, profesional y concisa para el expediente, en español, sin inventar ni agregar ningún dato que no esté explícito en el texto original. Responde ÚNICAMENTE con el texto final de la nota, sin comillas, sin explicaciones ni texto adicional antes o después.",
      messages: [{ role: "user", content: textoOriginal }],
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const error = new Error(data.error || "No se pudo contactar al asistente de IA");
    error.saturado = !!data.saturado || response.status === 503;
    throw error;
  }
  const texto = (data.content || []).map((b) => b.text || "").join("").trim();
  if (!texto) throw new Error("El asistente no devolvió ningún texto");
  return data.truncado ? `${texto}\n\n(Se cortó por límite de espacio — revísalo antes de guardarlo.)` : texto;
}

export function LineaDeTiempo({ cliente, onAgregar, onEditarFecha, onEditarNota, onEliminar, onRestaurar, confirmar }) {
  const [nota, setNota] = useState("");
  const [fecha, setFecha] = useState(() => fechaHoyISO());
  const [redactando, setRedactando] = useState(false);
  const [errorIA, setErrorIA] = useState("");
  const [editandoFechaId, setEditandoFechaId] = useState(null);
  const [editandoNotaId, setEditandoNotaId] = useState(null);
  const [borradorNota, setBorradorNota] = useState("");
  const [entradaDeshacer, setEntradaDeshacer] = useState(null);
  const [expandida, setExpandida] = useState(false);
  const deshacerTimeoutRef = useRef(null);
  const timeline = cliente.timeline || [];
  const CANTIDAD_COLAPSADA = 2;

  useEffect(() => () => clearTimeout(deshacerTimeoutRef.current), []);

  const agregar = () => {
    if (!nota.trim()) return;
    onAgregar(nota.trim(), fecha);
    setNota("");
    setFecha(fechaHoyISO());
  };

  const redactarConIA = async () => {
    if (!nota.trim()) return;
    setRedactando(true);
    setErrorIA("");
    try {
      const mejorado = await redactarActuacionConIA(nota.trim(), { alReintentar: () => setErrorIA("La IA está ocupada, reintentando en unos segundos…") });
      setErrorIA("");
      setNota(mejorado);
    } catch (e) {
      setErrorIA(
        e?.saturado
          ? "La IA de Google sigue saturada. Espera un minuto y vuelve a tocar «Redactar con IA», o agrega la nota tal como está."
          : `No se pudo mejorar la redacción (${e?.message || "error desconocido"}). Puedes agregar la nota tal como está.`
      );
    }
    setRedactando(false);
  };

  const guardarNotaEditada = () => {
    if (borradorNota.trim()) onEditarNota(editandoNotaId, borradorNota.trim());
    setEditandoNotaId(null);
  };

  // El botón "Deshacer" solo funciona mientras la entrada eliminada sigue
  // guardada aquí — pasado el tiempo (8s) se olvida, para no dejar la
  // sensación de que "todavía se puede deshacer" indefinidamente.
  const eliminar = async (entrada) => {
    const extracto = entrada.nota.length > 80 ? `${entrada.nota.slice(0, 80)}...` : entrada.nota;
    const fechaTexto = new Date(entrada.fecha).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
    const ok = await confirmar(`¿Eliminar esta actuación del ${fechaTexto}?\n"${extracto}"`);
    if (!ok) return;
    await onEliminar(entrada.id);
    setEntradaDeshacer(entrada);
    clearTimeout(deshacerTimeoutRef.current);
    deshacerTimeoutRef.current = setTimeout(() => setEntradaDeshacer(null), 8000);
  };

  const deshacerEliminacion = async () => {
    if (!entradaDeshacer) return;
    clearTimeout(deshacerTimeoutRef.current);
    await onRestaurar(entradaDeshacer);
    setEntradaDeshacer(null);
  };

  return (
    <div style={{ marginTop: 12, borderTop: `1px solid ${COLORS.border}`, paddingTop: 12 }}>
      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: COLORS.headingText, marginBottom: 8 }}>Línea de tiempo</p>
      {entradaDeshacer && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            background: COLORS.accentSoft,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            padding: "7px 10px",
            marginBottom: 8,
            fontSize: 12,
            fontFamily: "Inter, sans-serif",
          }}
        >
          <span style={{ color: COLORS.inkSoft }}>Actuación eliminada.</span>
          <button
            onClick={deshacerEliminacion}
            style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.accentBright, fontWeight: 700, fontFamily: "Inter, sans-serif", fontSize: 12, padding: 0 }}
          >
            Deshacer
          </button>
        </div>
      )}
      {timeline.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          {[...timeline]
            .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
            .slice(0, expandida ? undefined : CANTIDAD_COLAPSADA)
            .map((t, idx) => (
              <div
                key={t.id}
                className={idx >= CANTIDAD_COLAPSADA ? "drx-fade-in" : undefined}
                style={{ display: "flex", gap: 8, fontSize: 12.5, fontFamily: "Inter, sans-serif", alignItems: "flex-start" }}
              >
                {editandoFechaId === t.id ? (
                  <input
                    type="date"
                    autoFocus
                    className="drx-input"
                    style={{ ...inputStyle, fontSize: 11.5, padding: "2px 6px", width: 132 }}
                    defaultValue={new Date(t.fecha).toISOString().slice(0, 10)}
                    onBlur={(e) => {
                      if (e.target.value) onEditarFecha(t.id, e.target.value);
                      setEditandoFechaId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.target.blur();
                      if (e.key === "Escape") setEditandoFechaId(null);
                    }}
                  />
                ) : (
                  <button
                    onClick={() => setEditandoFechaId(t.id)}
                    title="Clic para corregir la fecha"
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      color: COLORS.muted,
                      whiteSpace: "nowrap",
                      fontFamily: "Inter, sans-serif",
                      fontSize: 12.5,
                      borderBottom: `1px dashed ${COLORS.border}`,
                    }}
                  >
                    {new Date(t.fecha).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}
                  </button>
                )}
                {editandoNotaId === t.id ? (
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                    <textarea
                      autoFocus
                      className="drx-input"
                      style={{ ...inputStyle, fontSize: 12.5, padding: "5px 8px", minHeight: 32, resize: "vertical" }}
                      value={borradorNota}
                      onChange={(e) => setBorradorNota(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          guardarNotaEditada();
                        }
                        if (e.key === "Escape") setEditandoNotaId(null);
                      }}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="drx-btn-primary" style={{ ...buttonPrimary, padding: "3px 10px", fontSize: 11.5 }} onClick={guardarNotaEditada}>
                        Guardar
                      </button>
                      <button className="drx-btn-ghost" style={{ ...buttonGhost, padding: "3px 10px", fontSize: 11.5 }} onClick={() => setEditandoNotaId(null)}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span style={{ color: COLORS.inkSoft, flex: 1 }}>{t.nota}</span>
                    <button
                      onClick={() => {
                        setEditandoNotaId(t.id);
                        setBorradorNota(t.nota);
                      }}
                      title="Editar esta nota"
                      style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted, padding: 0, flexShrink: 0 }}
                    >
                      <Icono tipo="lapiz" size={13} />
                    </button>
                    <button onClick={() => eliminar(t)} title="Eliminar esta actuación" style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted, padding: 0, flexShrink: 0 }}>
                      <Icono tipo="check" size={13} style={{ transform: "rotate(45deg)" }} />
                    </button>
                  </>
                )}
              </div>
            ))}
          {timeline.length > CANTIDAD_COLAPSADA && (
            <button
              onClick={() => setExpandida((v) => !v)}
              className="drx-btn-ghost"
              style={{
                ...buttonGhost,
                alignSelf: "flex-start",
                marginTop: 2,
                padding: "5px 12px",
                fontSize: 12,
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <Icono
                tipo="cursorArriba"
                size={11}
                style={{ transform: expandida ? "rotate(0deg)" : "rotate(180deg)", transition: "transform .2s ease" }}
              />
              {expandida ? "Ver menos" : `Ver ${timeline.length - CANTIDAD_COLAPSADA} más`}
            </button>
          )}
        </div>
      ) : (
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted, marginBottom: 10 }}>Sin actuaciones registradas todavía.</p>
      )}
      {/* Atajos: lo que antes se cargaba como documento ahora se anota aquí y
          el cliente lo ve en su portal (pestaña Proceso). */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {["Documento enviado a ", "Documento recibido de ", "Se radicó ante ", "La entidad respondió: ", "Audiencia programada para "].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setNota((n) => (n.trim() ? `${n.trim()}\n${t}` : t))}
            style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 600, padding: "4px 10px", borderRadius: 20, border: `1px solid ${COLORS.border}`, background: COLORS.surfaceSoft, color: COLORS.inkSoft, cursor: "pointer" }}
          >
            + {t.replace(/[:\s]+$/, "")}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <input
          type="date"
          className="drx-input"
          style={{ ...inputStyle, fontSize: 12.5, padding: "7px 8px", width: 132, flexShrink: 0 }}
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
        />
        <textarea
          className="drx-input"
          style={{ ...inputStyle, flex: 1, fontSize: 13, padding: "7px 10px", minHeight: 34, resize: "vertical" }}
          placeholder="Agregar novedad o actuación... (puedes pegar el texto tal cual y usar 'Redactar con IA')"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
          <button className="drx-btn-ghost" style={{ ...buttonGhost, padding: "6px 12px", fontSize: 12.5 }} onClick={redactarConIA} disabled={redactando || !nota.trim()}>
            {redactando ? "Redactando..." : "Redactar con IA"}
          </button>
          <button className="drx-btn-primary" style={{ ...buttonPrimary, padding: "6px 12px", fontSize: 12.5 }} onClick={agregar} disabled={!nota.trim()}>
            Agregar
          </button>
        </div>
      </div>
      {errorIA && <p style={{ color: "#B45309", fontSize: 11.5, marginTop: 6, fontFamily: "Inter, sans-serif" }}>{errorIA}</p>}
    </div>
  );
}

export async function consultarRamaJudicial(radicado) {
  const response = await fetch(`/api/rama-judicial/consultar?radicado=${encodeURIComponent(radicado)}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo consultar la Rama Judicial");
  return data;
}

// VistaPortalCliente vive en src/views/VistaPortalCliente.jsx y se carga
// con lazy() — es el portal público (#portal) donde un cliente consulta
// su propio caso, algo que el despacho (ya logueado) nunca ve.

export const ESTADOS_VIGILANCIA = ["En trámite", "Con novedad", "Pendiente de revisión", "Finalizado"];

export function enviarRecordatorioPago(cliente) {
  // Si alguien más paga las cuentas de este proceso (cliente.pagador), el
  // recordatorio le llega a esa persona y no al cliente — pedirle el pago
  // al cliente cuando quien paga es otro solo genera confusión.
  const destinatario = cliente.pagador?.telefono ? { nombre: cliente.pagador.nombre, telefono: cliente.pagador.telefono } : { nombre: cliente.nombre, telefono: cliente.telefono };
  const numero = numeroWhatsappCliente(destinatario.telefono);
  const fechaTexto = new Date(cliente.proximoPago.fecha).toLocaleDateString("es-CO", { dateStyle: "long" });
  const valorTexto = cliente.proximoPago.valorEsperado ? ` por un valor de ${formatoCOP(cliente.proximoPago.valorEsperado)}` : "";
  const refCliente = cliente.pagador?.telefono ? ` de ${cliente.nombre}` : "";
  // Sin emojis a propósito (ver comentario en ClientesTab sobre el mensaje
  // del portal): no se ven bien en todos los WhatsApp/dispositivos, y un
  // mensaje de despacho de abogados se lee más serio en texto plano.
  const mensaje = `*${getNombreDespacho()}*\n\nHola ${destinatario.nombre || ""}, te recordamos que el próximo pago${refCliente} está programado para el ${fechaTexto}${valorTexto}.\n\nSi ya realizaste el pago, ignora este mensaje — quedamos atentos a la confirmación. Cualquier duda, con gusto te ayudamos.`;
  window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`, "_blank");
}

// WhatsApp no permite prellenar texto al abrir un grupo existente (el
// prellenado de "wa.me/<numero>?text=" solo funciona con un número
// individual) — así que en vez de armar el mensaje directo, se copia al
// portapapeles y se abre el grupo para que la persona solo lo pegue.
export function enviarRecordatorioPagoGrupo(cliente) {
  const fechaTexto = new Date(cliente.proximoPago.fecha).toLocaleDateString("es-CO", { dateStyle: "long" });
  const valorTexto = cliente.proximoPago.valorEsperado ? ` por un valor de ${formatoCOP(cliente.proximoPago.valorEsperado)}` : "";
  const mensaje = `*${getNombreDespacho()}*\n\nHola, les recordamos que el próximo pago de ${cliente.nombre} está programado para el ${fechaTexto}${valorTexto}.\n\nSi ya se realizó el pago, ignoren este mensaje — quedamos atentos a la confirmación. Cualquier duda, con gusto ayudamos.`;
  enviarMensajeGrupoWhatsapp(cliente, mensaje);
}

// Mismo mecanismo que enviarRecordatorioPagoGrupo, reutilizable para
// cualquier otro mensaje (novedad judicial, recibo, portal...) cuando el
// cliente no tiene teléfono individual pero sí un grupo de WhatsApp del
// proceso: WhatsApp no deja prellenar texto al abrir un grupo ya existente,
// así que se copia el mensaje al portapapeles y se abre el grupo.
export function enviarMensajeGrupoWhatsapp(cliente, mensaje) {
  navigator.clipboard?.writeText(mensaje).catch(() => {});
  window.open(cliente.grupoWhatsapp, "_blank");
}

// Gráfica de barras VERTICALES de una sola serie — una barra por categoría,
// cada una con su propio color opcional (para "Procesos por estado",
// "Distribución por área", etc.) o un color único para toda la serie (para
// "Carga por abogado"). Reemplaza a las barras horizontales de antes por un
// formato de columnas más parecido a un reporte financiero real.
export function GraficaBarras({ datos, color, formatoValor, alto = 150 }) {
  const max = Math.max(1, ...datos.map((d) => Math.abs(Number(d.valor)) || 0));
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: alto, borderBottom: `2px solid ${COLORS.border}` }}>
        {datos.map((d, i) => {
          const h = Math.max(3, Math.round((Math.abs(Number(d.valor)) / max) * (alto - 26)));
          return (
            <div key={d.etiqueta + i} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
              <span
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: COLORS.ink,
                  marginBottom: 5,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "100%",
                }}
              >
                {formatoValor ? formatoValor(d.valor) : d.valor}
              </span>
              <div
                title={`${d.etiqueta}: ${formatoValor ? formatoValor(d.valor) : d.valor}`}
                style={{ width: "100%", maxWidth: 42, height: h, background: d.color || color, borderRadius: "6px 6px 0 0", transition: "height 0.4s ease" }}
              />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        {datos.map((d, i) => (
          <div
            key={d.etiqueta + i}
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: "center",
              fontFamily: "Inter, sans-serif",
              fontSize: 10.5,
              color: COLORS.muted,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={d.etiqueta}
          >
            {d.etiqueta}
          </div>
        ))}
      </div>
    </div>
  );
}

// Igual que GraficaBarras, pero agrupada: varias series (ingresos/egresos,
// por ejemplo) una al lado de la otra dentro de cada categoría, con
// leyenda — para comparar dos magnitudes por mes de un vistazo.
export function GraficaBarrasAgrupadas({ categorias, series, formatoValor, alto = 150 }) {
  const max = Math.max(1, ...series.flatMap((s) => s.valores.map((v) => Math.abs(Number(v)) || 0)));
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: alto, borderBottom: `2px solid ${COLORS.border}` }}>
        {categorias.map((cat, i) => (
          <div key={cat + i} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 4, height: "100%" }}>
            {series.map((s, si) => {
              const v = Number(s.valores[i]) || 0;
              const h = Math.max(3, Math.round((Math.abs(v) / max) * (alto - 26)));
              return (
                <div
                  key={si}
                  title={`${s.nombre} · ${cat}: ${formatoValor ? formatoValor(v) : v}`}
                  style={{ flex: 1, maxWidth: 22, minWidth: 8, height: h, background: s.color, borderRadius: "5px 5px 0 0", transition: "height 0.4s ease" }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
        {categorias.map((cat, i) => (
          <div key={i} style={{ flex: 1, minWidth: 0, textAlign: "center", fontFamily: "Inter, sans-serif", fontSize: 10.5, color: COLORS.muted }}>
            {cat}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 12, flexWrap: "wrap" }}>
        {series.map((s, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "Inter, sans-serif", fontSize: 11.5, color: COLORS.inkSoft }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: s.color, display: "inline-block" }} /> {s.nombre}
          </span>
        ))}
      </div>
    </div>
  );
}

export const COLOR_ESTADO_VIGILANCIA = { "En trámite": "#2F80ED", "Con novedad": "#F5A524", "Pendiente de revisión": "#8B5CF6", Finalizado: "#10B981" };

// Todos los números y series que alimentan las gráficas de Reportes —
// extraído a un hook aparte para que el panel de Resumen pueda mostrar un
// adelanto de las mismas gráficas sin duplicar el cálculo ni volver a pedir
// todos los clientes por separado.
export function useDatosReportes() {
  const { ids } = useIndex("indice-clientes", false);
  const { usuarios } = useUsuariosDespacho();
  const { egresos } = useEgresos();
  const { ingresos: otrosIngresos } = useOtrosIngresos();
  const [clientes, setClientes] = useState({});
  const [cargando, setCargando] = useState(true);
  // Fecha opcional a partir de la cual los pagos/egresos quedaron
  // registrados cliente por cliente (no en un solo bloque mensual como se
  // hizo mientras se ponía al día la contabilidad atrasada). El análisis
  // financiero la usa para no tratar esos meses en bloque como si fueran
  // una señal real de riesgo (plata duplicada, concentración, etc.) — ya
  // se sabe por qué se ven así, no hace falta que el sistema alarme por eso.
  const [fechaDatosLimpios, setFechaDatosLimpiosState] = useState(null);
  useEffect(() => {
    (async () => {
      const raw = await storageGet("fecha-datos-limpios", false);
      setFechaDatosLimpiosState(raw || null);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const entries = await obtenerClientesPorId(ids);
      setClientes(entries);
      setCargando(false);
    })();
  }, [ids]);

  const listaClientes = Object.values(clientes);

  // Ingresos por mes (últimos 6 meses, incluyendo el actual).
  const mesesEtiquetas = [];
  const hoy = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    mesesEtiquetas.push({ clave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, etiqueta: d.toLocaleDateString("es-CO", { month: "short", year: "2-digit" }) });
  }
  const ingresosPorMes = Object.fromEntries(mesesEtiquetas.map((m) => [m.clave, 0]));
  let ingresoTotalHistorico = 0;
  listaClientes.forEach((c) => {
    (c.pagos || []).forEach((p) => {
      const valor = Number(p.valor) || 0;
      ingresoTotalHistorico += valor;
      const clave = p.fecha?.slice(0, 7);
      if (clave && ingresosPorMes[clave] !== undefined) ingresosPorMes[clave] += valor;
    });
  });
  // Otros ingresos (no amarrados a ningún cliente puntual) también cuentan
  // como plata que entró — sin esto, "Ingresos por mes" en Reportes/Resumen
  // no coincidía con el total real que ya se veía en Contabilidad.
  otrosIngresos.forEach((i) => {
    const valor = Number(i.valor) || 0;
    ingresoTotalHistorico += valor;
    const clave = i.fecha?.slice(0, 7);
    if (clave && ingresosPorMes[clave] !== undefined) ingresosPorMes[clave] += valor;
  });
  const maxIngresoMes = Math.max(1, ...Object.values(ingresosPorMes));
  const claveMesActual = mesesEtiquetas[mesesEtiquetas.length - 1].clave;
  const claveMesAnterior = mesesEtiquetas[mesesEtiquetas.length - 2]?.clave;
  const ingresoMesActual = ingresosPorMes[claveMesActual] || 0;
  const ingresoMesAnterior = claveMesAnterior ? ingresosPorMes[claveMesAnterior] || 0 : 0;
  const cambioMensual = ingresoMesAnterior > 0 ? Math.round(((ingresoMesActual - ingresoMesAnterior) / ingresoMesAnterior) * 100) : null;

  // Egresos por mes — de nada sirve ver solo lo que entra si no se ve
  // también lo que sale; sin esto "cómo va tu empresa" solo contaba la
  // mitad de la historia (nunca se veía si en realidad se estaba perdiendo
  // plata pese a tener buenos ingresos).
  const egresosPorMes = Object.fromEntries(mesesEtiquetas.map((m) => [m.clave, 0]));
  let egresoTotalHistorico = 0;
  egresos.forEach((e) => {
    const valor = Number(e.valor) || 0;
    egresoTotalHistorico += valor;
    const clave = e.fecha?.slice(0, 7);
    if (clave && egresosPorMes[clave] !== undefined) egresosPorMes[clave] += valor;
  });
  const egresoMesActual = egresosPorMes[claveMesActual] || 0;
  const netoMesActual = ingresoMesActual - egresoMesActual;
  const netoTotalHistorico = ingresoTotalHistorico - egresoTotalHistorico;

  // Cartera pendiente total (mismo criterio que en Contabilidad).
  const carteraPendienteTotal = listaClientes.reduce((sum, c) => {
    const totalPagado = (c.pagos || []).reduce((s, p) => s + (Number(p.valor) || 0), 0);
    const valorTotal = Number(c.valorTotal) || 0;
    const saldo = valorTotal > 0 ? valorTotal - totalPagado : 0;
    return saldo > 0 ? sum + saldo : sum;
  }, 0);

  // Solo la parte de esa cartera que está de verdad ATRASADA (la fecha del
  // próximo pago ya pasó) — un cliente pagando a cuotas a tiempo siempre
  // tiene saldo pendiente hasta la última cuota, y eso no es un atraso, así
  // que no debería sumar aquí (sí suma en carteraPendienteTotal, que es el
  // total sin cobrar todavía, atrasado o no).
  const carteraAtrasadaTotal = listaClientes.reduce((sum, c) => {
    if (c.procesoPausado || !c.proximoPago?.fecha || c.esClienteAdministrativo) return sum;
    const totalPagado = (c.pagos || []).reduce((s, p) => s + (Number(p.valor) || 0), 0);
    const valorTotal = Number(c.valorTotal) || 0;
    const saldo = valorTotal > 0 ? valorTotal - totalPagado : 0;
    const diasPago = diasHasta(c.proximoPago.fecha);
    return saldo > 0 && diasPago !== null && diasPago < 0 ? sum + saldo : sum;
  }, 0);

  // Procesos por estado.
  const conteoEstados = Object.fromEntries(ESTADOS_VIGILANCIA.map((e) => [e, 0]));
  let sinRevisar = 0;
  listaClientes.forEach((c) => {
    if (c.estadoVigilancia && conteoEstados[c.estadoVigilancia] !== undefined) conteoEstados[c.estadoVigilancia]++;
    else sinRevisar++;
  });
  const maxEstado = Math.max(1, ...Object.values(conteoEstados), sinRevisar);

  // Carga de trabajo por abogado.
  const cargaPorAbogado = {};
  listaClientes.forEach((c) => {
    const nombre = c.abogadoAsignado?.trim() || "Sin asignar";
    cargaPorAbogado[nombre] = (cargaPorAbogado[nombre] || 0) + 1;
  });
  const filasCarga = Object.entries(cargaPorAbogado).sort((a, b) => b[1] - a[1]);
  const maxCarga = Math.max(1, ...filasCarga.map(([, n]) => n));

  // Distribución por área del derecho — para ver de un vistazo en qué se
  // concentra el despacho (útil para decidir en qué especializarse o en qué
  // invertir en marketing).
  const cargaPorArea = {};
  listaClientes.forEach((c) => {
    const area = c.areaProceso?.trim() || "Sin definir";
    cargaPorArea[area] = (cargaPorArea[area] || 0) + 1;
  });
  const filasArea = Object.entries(cargaPorArea).sort((a, b) => b[1] - a[1]);
  const maxArea = Math.max(1, ...filasArea.map(([, n]) => n));

  // Lo mismo que arriba pero por PLATA facturada, no por número de
  // clientes — un área con pocos clientes puede facturar más que una con
  // muchos (ej. 2 procesos comerciales grandes vs. 10 consultas laborales
  // chicas), así que recomendar dónde enfocar mercadeo solo por cantidad de
  // clientes puede llevar a la conclusión equivocada.
  // Un cliente marcado "esClienteAdministrativo" (ej. una bolsa tipo "Pagos
  // pendientes por clasificar" para organizar pagos sin asignar todavía) no
  // es un cliente real — su plata sigue contando en los totales de
  // recaudado/egresos del despacho (esa plata sí entró de verdad), pero no
  // debe distorsionar rankings ni riesgos que son específicamente "por
  // cliente" o "por área": ahí solo entran clientes reales.
  const listaClientesReales = listaClientes.filter((c) => !c.esClienteAdministrativo);

  const ingresoPorArea = {};
  listaClientesReales.forEach((c) => {
    const area = c.areaProceso?.trim() || "Sin definir";
    const totalCliente = (c.pagos || []).reduce((s, p) => s + (Number(p.valor) || 0), 0);
    ingresoPorArea[area] = (ingresoPorArea[area] || 0) + totalCliente;
  });
  const filasAreaPorIngreso = Object.entries(ingresoPorArea)
    .filter(([, valor]) => valor > 0)
    .sort((a, b) => b[1] - a[1]);

  const clientesConPago = listaClientesReales.filter((c) => (c.pagos || []).length > 0).length;
  const ingresoTotalClientesReales = listaClientesReales.reduce((s, c) => s + (c.pagos || []).reduce((s2, p) => s2 + (Number(p.valor) || 0), 0), 0);
  const ticketPromedio = clientesConPago > 0 ? ingresoTotalClientesReales / clientesConPago : 0;

  // Concentración de cartera: cuánto de la facturación histórica depende de
  // un solo cliente — un despacho que vive de 1-2 clientes grandes tiene un
  // riesgo real que uno con la plata repartida entre muchos no tiene, así
  // que es una señal de riesgo tan válida como el margen o la cartera
  // pendiente, aunque casi nunca se mire. El % se calcula sobre la plata de
  // clientes reales solamente, no sobre el total del despacho (que puede
  // incluir la bolsa administrativa u otros ingresos sueltos).
  const ingresoPorCliente = listaClientesReales
    .map((c) => ({ nombre: c.nombre, total: (c.pagos || []).reduce((s, p) => s + (Number(p.valor) || 0), 0) }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);
  const clienteMasGrande = ingresoPorCliente[0] || null;
  const concentracionTop1Pct = clienteMasGrande && ingresoTotalClientesReales > 0 ? Math.round((clienteMasGrande.total / ingresoTotalClientesReales) * 100) : null;

  // Cuánto ya está "comprometido" para el próximo mes según el próximo pago
  // esperado de cada cliente activo — mismo dato que alimenta "Próximos
  // pagos por vencer" en Contabilidad, así el análisis financiero de
  // Resumen no inventa una fuente de verdad distinta.
  const hoyProyeccion = new Date();
  const inicioProximoMes = new Date(hoyProyeccion.getFullYear(), hoyProyeccion.getMonth() + 1, 1);
  const finProximoMes = new Date(hoyProyeccion.getFullYear(), hoyProyeccion.getMonth() + 2, 1);
  const proyeccionProximoMes = listaClientes.reduce((sum, c) => {
    if (c.procesoPausado || !c.proximoPago?.fecha || !c.proximoPago?.valorEsperado) return sum;
    const fecha = new Date(c.proximoPago.fecha);
    return fecha >= inicioProximoMes && fecha < finProximoMes ? sum + (Number(c.proximoPago.valorEsperado) || 0) : sum;
  }, 0);

  // Año actual vs mismo período del año anterior (year-to-date) — el
  // comparativo de 6 meses ya existe, pero no dice si el negocio va mejor
  // o peor que el mismo momento del año pasado, que es la comparación que
  // de verdad importa para saber si hay crecimiento real o solo
  // estacionalidad del mes.
  const inicioAnioActual = new Date(hoyProyeccion.getFullYear(), 0, 1);
  const inicioAnioAnterior = new Date(hoyProyeccion.getFullYear() - 1, 0, 1);
  const mismoPuntoAnioAnterior = new Date(hoyProyeccion.getFullYear() - 1, hoyProyeccion.getMonth(), hoyProyeccion.getDate());
  let ingresoYTDActual = 0;
  let ingresoYTDAnterior = 0;
  listaClientesReales.forEach((c) => {
    (c.pagos || []).forEach((p) => {
      const fecha = new Date(p.fecha);
      const valor = Number(p.valor) || 0;
      if (fecha >= inicioAnioActual) ingresoYTDActual += valor;
      else if (fecha >= inicioAnioAnterior && fecha <= mismoPuntoAnioAnterior) ingresoYTDAnterior += valor;
    });
  });
  const cambioAnualPct = ingresoYTDAnterior > 0 ? Math.round(((ingresoYTDActual - ingresoYTDAnterior) / ingresoYTDAnterior) * 100) : null;

  // Clientes con saldo pendiente pero sin ningún próximo cobro programado:
  // no vencidos todavía (eso ya lo cubre "pagos atrasados"), simplemente
  // nadie les puso fecha — quedan invisibles en "Flujo de caja proyectado"
  // dando una falsa sensación de que ya no falta nada por cobrar.
  const clientesSinProximoPago = listaClientesReales.filter((c) => {
    if (c.procesoPausado) return false;
    const totalPagado = (c.pagos || []).reduce((s, p) => s + (Number(p.valor) || 0), 0);
    const saldo = (Number(c.valorTotal) || 0) - totalPagado;
    return saldo > 0 && !c.proximoPago?.fecha;
  }).length;

  // Mejor y peor mes de los últimos 6, para dar contexto de qué tan lejos
  // está el mes actual de lo normal del despacho.
  const mesesConValor = mesesEtiquetas.map((m) => ({ etiqueta: m.etiqueta, valor: ingresosPorMes[m.clave] || 0 })).filter((m) => m.valor > 0);
  const mejorMes = mesesConValor.length > 0 ? mesesConValor.reduce((a, b) => (b.valor > a.valor ? b : a)) : null;
  const peorMes = mesesConValor.length > 0 ? mesesConValor.reduce((a, b) => (b.valor < a.valor ? b : a)) : null;

  // Egreso más grande del mes actual y qué tanto pesa sobre el total — un
  // solo gasto atípico (una compra grande, un pago fuera de lo normal)
  // puede disparar el "Egresos este mes" sin que sea un patrón nuevo de
  // gasto, y vale la pena distinguir eso de un aumento real y sostenido.
  const egresosMesActualLista = egresos.filter((e) => {
    const f = new Date(e.fecha);
    return f.getFullYear() === hoyProyeccion.getFullYear() && f.getMonth() === hoyProyeccion.getMonth();
  });
  const egresoMasGrandeMes = egresosMesActualLista.length > 0 ? egresosMesActualLista.reduce((a, b) => ((Number(b.valor) || 0) > (Number(a.valor) || 0) ? b : a)) : null;
  const egresoMasGrandePct =
    egresoMasGrandeMes && egresoMesActual > 0 ? Math.round(((Number(egresoMasGrandeMes.valor) || 0) / egresoMesActual) * 100) : null;

  // Retención en la fuente acumulada históricamente — recordatorio de que
  // esa plata no es "menos ingreso perdido", es un anticipo de impuestos
  // que ya se le declaró a la DIAN a nombre del despacho y hay que tenerlo
  // presente en la declaración de renta.
  let retenidoTotalHistorico = 0;
  listaClientesReales.forEach((c) => {
    (c.pagos || []).forEach((p) => {
      const pct = Number(p.retencionPorcentaje) || 0;
      if (pct > 0) retenidoTotalHistorico += Math.round(((Number(p.valor) || 0) * pct) / 100);
    });
  });

  return {
    cargando,
    listaClientes,
    usuarios,
    mesesEtiquetas,
    ingresosPorMes,
    ingresoTotalHistorico,
    maxIngresoMes,
    ingresoMesActual,
    cambioMensual,
    egresosPorMes,
    egresoTotalHistorico,
    egresoMesActual,
    netoMesActual,
    netoTotalHistorico,
    carteraPendienteTotal,
    carteraAtrasadaTotal,
    conteoEstados,
    sinRevisar,
    maxEstado,
    filasCarga,
    maxCarga,
    filasArea,
    maxArea,
    filasAreaPorIngreso,
    clientesConPago,
    ticketPromedio,
    proyeccionProximoMes,
    clienteMasGrande,
    concentracionTop1Pct,
    cambioAnualPct,
    ingresoYTDActual,
    ingresoYTDAnterior,
    clientesSinProximoPago,
    mejorMes,
    peorMes,
    egresoMasGrandeMes,
    egresoMasGrandePct,
    retenidoTotalHistorico,
    fechaDatosLimpios,
  };
}

export const CATEGORIAS_EGRESO = ["Arriendo", "Nómina", "Adelanto de nómina", "Servicios públicos", "Insumos de oficina", "Impuestos", "Software y herramientas", "Marketing", "Pendiente por clasificar", "Otro"];

// Los egresos del despacho (arriendo, nómina, servicios...) no pertenecen a
// ningún cliente puntual, así que se guardan como una sola lista bajo una
// clave simple (igual que "ideas-contenido") en vez de como registros de
// cliente — no había ninguna forma de ver salidas de dinero, solo entradas,
// así que el "cómo va tu empresa" solo contaba la mitad de la historia.
export function useEgresos() {
  const [egresos, setEgresosState] = useState([]);
  const [cargado, setCargado] = useState(false);

  const cargar = useCallback(async () => {
    const raw = await storageGet("egresos-contabilidad", false);
    setEgresosState(raw ? JSON.parse(raw) : []);
    setCargado(true);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const crear = async (datos) => {
    const nuevo = {
      id: uid(),
      fecha: new Date(`${datos.fecha}T12:00:00`).toISOString(),
      concepto: datos.concepto.trim(),
      categoria: datos.categoria,
      valor: Number(datos.valor) || 0,
      // Opcional: si el egreso se registró desde la tarjeta de un cliente
      // puntual (el atajo "+ Registrar egreso" dentro de Contabilidad),
      // queda asociado a ese cliente y se ve ahí también — sin dejar de
      // contar igual que cualquier otro egreso en los totales del despacho.
      clienteId: datos.clienteId || null,
      // Opcional: de qué cuenta salió (Nequi, Daviplata, Nu...) — alimenta
      // "Saldo esperado por cuenta". Sin este dato el egreso sigue
      // contando igual en los totales, solo no se puede atribuir a una
      // cuenta puntual.
      medioPago: datos.medioPago || "",
      // Marca opcional para el seguimiento de retorno de inversión: no
      // cambia en nada cómo cuenta este egreso en los totales normales,
      // solo lo hace aparecer en la sección "Retorno de inversión".
      esInversion: !!datos.esInversion,
      // Solo para "Adelanto de nómina": a quién se le prestó y en cuántos
      // pagos de nómina se le descuenta. La salida de plata cuenta como
      // egreso el día del adelanto; los descuentos posteriores solo se
      // anotan aquí (la nómina de ese mes ya se registra por el neto).
      ...(datos.adelanto ? { adelanto: datos.adelanto } : {}),
    };
    const actualizados = [nuevo, ...egresos];
    await storageSet("egresos-contabilidad", JSON.stringify(actualizados), false);
    setEgresosState(actualizados);
    return nuevo;
  };

  const editar = async (id, cambios) => {
    const actualizados = egresos.map((e) => (e.id === id ? { ...e, ...cambios } : e));
    await storageSet("egresos-contabilidad", JSON.stringify(actualizados), false);
    setEgresosState(actualizados);
  };

  const eliminar = async (id) => {
    const actualizados = egresos.filter((e) => e.id !== id);
    await storageSet("egresos-contabilidad", JSON.stringify(actualizados), false);
    setEgresosState(actualizados);
  };

  // Recategorizar de a uno (llamando editar() en un ciclo) tiene la misma
  // falla que ya se corrigió en otras partes de la app: cada llamada
  // reescribe la lista ENTERA de egresos a partir del estado que tenía en
  // memoria en ese momento, así que llamadas rápidas seguidas se pisan
  // entre sí y algunas quedan sin guardar. Aquí se arma la lista completa
  // ya corregida y se guarda de una sola vez.
  const recategorizarMasivo = async (categoriaOrigen, categoriaDestino) => {
    const actualizados = egresos.map((e) => (e.categoria === categoriaOrigen ? { ...e, categoria: categoriaDestino } : e));
    await storageSet("egresos-contabilidad", JSON.stringify(actualizados), false);
    setEgresosState(actualizados);
  };

  return { egresos, cargado, crear, editar, eliminar, recategorizarMasivo };
}

// Compras del despacho a crédito/cuotas (un computador en 12 cuotas, un
// préstamo, etc.) — el espejo de "plan de pago" de un cliente, pero al
// revés: aquí el despacho es quien debe. Se registra una sola vez (valor
// total, cuántas cuotas, cada cuánto) y Nomos arma el calendario con
// generarCuotasAcuerdoPago (mismo cálculo que ya usa el acuerdo de pago de
// un cliente). Cada cuota paga crea un egreso real (cuenta igual en los
// totales de Contabilidad) y queda marcada aparte, para saber cuánto falta
// y cuándo es la próxima — sin mezclar "lo que me deben" con "lo que debo".
export function useCreditos() {
  const [creditos, setCreditosState] = useState([]);
  const [cargado, setCargado] = useState(false);

  const cargar = useCallback(async () => {
    const raw = await storageGet("creditos-contabilidad", false);
    setCreditosState(raw ? JSON.parse(raw) : []);
    setCargado(true);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const crear = async ({ concepto, categoria, valorTotal, numCuotas, diaPago }) => {
    const cuotas = generarCuotasAcuerdoPago({ valorTotal: Number(valorTotal) || 0, numCuotas: Number(numCuotas) || 1, diaPago: diaPago ? Number(diaPago) : null }).map(
      (c) => ({ ...c, pagada: false, egresoId: null })
    );
    const nuevo = {
      id: uid(),
      concepto: concepto.trim(),
      categoria,
      valorTotal: Number(valorTotal) || 0,
      cuotas,
      creadoEn: new Date().toISOString(),
    };
    const actualizados = [nuevo, ...creditos];
    await storageSet("creditos-contabilidad", JSON.stringify(actualizados), false);
    setCreditosState(actualizados);
    return nuevo;
  };

  const editar = async (id, cambios) => {
    const actualizados = creditos.map((c) => (c.id === id ? { ...c, ...cambios } : c));
    await storageSet("creditos-contabilidad", JSON.stringify(actualizados), false);
    setCreditosState(actualizados);
  };

  const eliminar = async (id) => {
    const actualizados = creditos.filter((c) => c.id !== id);
    await storageSet("creditos-contabilidad", JSON.stringify(actualizados), false);
    setCreditosState(actualizados);
  };

  // Marca UNA cuota puntual (por índice) como pagada, enlazada al egreso real
  // que ya se creó para ella — sin tocar las demás cuotas del mismo crédito.
  const marcarCuotaPagada = async (id, idxCuota, egresoId) => {
    const actualizados = creditos.map((c) => {
      if (c.id !== id) return c;
      const cuotas = c.cuotas.map((cu, i) => (i === idxCuota ? { ...cu, pagada: true, egresoId } : cu));
      return { ...c, cuotas };
    });
    await storageSet("creditos-contabilidad", JSON.stringify(actualizados), false);
    setCreditosState(actualizados);
  };

  return { creditos, cargado, crear, editar, eliminar, marcarCuotaPagada };
}

export const FRECUENCIAS_SERVICIO = ["Mensual", "Quincenal", "Semanal", "Pago único"];

// Catálogo de servicios de precio fijo del despacho (ej: "Vigilancia
// judicial sin contrato" a $90.000/mes) — se define UNA vez desde
// Administración y de ahí se "activa" en un cliente cuantas veces haga
// falta (ver activarServicioParaCliente en ClientesTab), sin tener que
// escribir el mismo valor y la misma frecuencia a mano cada vez. Es un
// catálogo del despacho completo, no de un cliente puntual — por eso vive
// aparte, igual que egresos u otros ingresos.
export function useServicios() {
  const [servicios, setServiciosState] = useState([]);
  const [cargado, setCargado] = useState(false);

  const cargar = useCallback(async () => {
    const raw = await storageGet("servicios-despacho", false);
    setServiciosState(raw ? JSON.parse(raw) : []);
    setCargado(true);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const crear = async (datos) => {
    const nuevo = {
      id: uid(),
      nombre: datos.nombre.trim(),
      valor: Number(datos.valor) || 0,
      frecuencia: datos.frecuencia || FRECUENCIAS_SERVICIO[0],
    };
    const actualizados = [...servicios, nuevo];
    await storageSet("servicios-despacho", JSON.stringify(actualizados), false);
    setServiciosState(actualizados);
    return nuevo;
  };

  const editar = async (id, cambios) => {
    const actualizados = servicios.map((s) => (s.id === id ? { ...s, ...cambios } : s));
    await storageSet("servicios-despacho", JSON.stringify(actualizados), false);
    setServiciosState(actualizados);
  };

  const eliminar = async (id) => {
    const actualizados = servicios.filter((s) => s.id !== id);
    await storageSet("servicios-despacho", JSON.stringify(actualizados), false);
    setServiciosState(actualizados);
  };

  return { servicios, cargado, crear, editar, eliminar };
}

// Catálogo compartido para dos tipos de personas con las que el despacho
// reparte un pago: quien refirió al cliente (comisión) y un abogado
// asociado que trabaja el caso junto al despacho (honorarios). Misma forma
// de datos en los dos casos (nombre, teléfono, medio de pago, cuenta/datos
// de pago) — solo cambia dónde se guardan, así que se factoriza una vez en
// vez de duplicar el mismo CRUD dos veces.
function useContactosDespacho(storageKey) {
  const [contactos, setContactosState] = useState([]);
  const [cargado, setCargado] = useState(false);

  const cargar = useCallback(async () => {
    const raw = await storageGet(storageKey, false);
    setContactosState(raw ? JSON.parse(raw) : []);
    setCargado(true);
  }, [storageKey]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const crear = async (datos) => {
    const nuevo = {
      id: uid(),
      nombre: (datos.nombre || "").trim(),
      telefono: datos.telefono || "",
      medioPago: datos.medioPago || "",
      datosPago: datos.datosPago || "",
    };
    const actualizados = [...contactos, nuevo];
    await storageSet(storageKey, JSON.stringify(actualizados), false);
    setContactosState(actualizados);
    return nuevo;
  };

  const eliminar = async (id) => {
    const actualizados = contactos.filter((c) => c.id !== id);
    await storageSet(storageKey, JSON.stringify(actualizados), false);
    setContactosState(actualizados);
  };

  return { contactos, cargado, crear, eliminar };
}

// Lista liviana de clientes (solo id + nombre) para selectores en otras
// pestañas (ej. vincular un evento de Agenda a un cliente) — no trae el
// resto de campos del cliente (radicados, plan de pago, etc.) porque el
// selector no los necesita.
export function useClientesLigero() {
  const { ids, cargado: idsCargado } = useIndex("indice-clientes", false);
  const [clientes, setClientes] = useState({});
  const [cargado, setCargado] = useState(false);
  useEffect(() => {
    if (!idsCargado) return;
    obtenerValoresPorClaves(ids.map((id) => `cliente:${id}`)).then((valores) => {
      const ligero = {};
      ids.forEach((id) => {
        const raw = valores[`cliente:${id}`];
        if (raw) ligero[id] = { nombre: JSON.parse(raw).nombre };
      });
      setClientes(ligero);
      setCargado(true);
    });
  }, [ids, idsCargado]);
  return { ids, clientes, cargado };
}

// Quien refirió al cliente al despacho — se le puede reconocer un
// porcentaje de comisión sobre lo que ese cliente pague, sin que eso
// cambie nada de la contabilidad del cliente en sí (el cliente sigue
// pagando el 100%; el reparto es interno, para que el despacho sepa cuánto
// le queda de utilidad real).
export function useReferenciadores() {
  return useContactosDespacho("referenciadores-despacho");
}

// Un abogado externo con el que se trabaja un caso puntual en conjunto
// (no es un usuario del sistema como los del despacho) — mismo concepto de
// reparto por porcentaje, pero como honorarios compartidos en vez de
// comisión por referido.
export function useAbogadosAsociados() {
  return useContactosDespacho("abogados-asociados-despacho");
}

export const CATEGORIAS_OTRO_INGRESO = ["Ingreso administrativo", "Rendimientos financieros", "Reembolso", "Asesoría o consulta puntual", "Otro / no identificado"];

// Igual que useEgresos, pero para plata que ENTRA sin estar amarrada a
// ningún cliente puntual (rendimientos, reembolsos, algo que llegó y no se
// sabe bien de dónde viene o qué categoría ponerle) — antes la única forma
// de registrar un ingreso era como el pago de un cliente específico, así
// que cualquier entrada de plata "suelta" no tenía dónde vivir.
export function useOtrosIngresos() {
  const [ingresos, setIngresosState] = useState([]);
  const [cargado, setCargado] = useState(false);

  const cargar = useCallback(async () => {
    const raw = await storageGet("otros-ingresos-contabilidad", false);
    setIngresosState(raw ? JSON.parse(raw) : []);
    setCargado(true);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const crear = async (datos) => {
    const nuevo = {
      id: uid(),
      fecha: new Date(`${datos.fecha}T12:00:00`).toISOString(),
      concepto: datos.concepto.trim(),
      categoria: datos.categoria,
      valor: Number(datos.valor) || 0,
      medioPago: datos.medioPago || "",
    };
    const actualizados = [nuevo, ...ingresos];
    await storageSet("otros-ingresos-contabilidad", JSON.stringify(actualizados), false);
    setIngresosState(actualizados);
    return nuevo;
  };

  const editar = async (id, cambios) => {
    const actualizados = ingresos.map((i) => (i.id === id ? { ...i, ...cambios } : i));
    await storageSet("otros-ingresos-contabilidad", JSON.stringify(actualizados), false);
    setIngresosState(actualizados);
  };

  const eliminar = async (id) => {
    const actualizados = ingresos.filter((i) => i.id !== id);
    await storageSet("otros-ingresos-contabilidad", JSON.stringify(actualizados), false);
    setIngresosState(actualizados);
  };

  return { ingresos, cargado, crear, editar, eliminar };
}

// Las cuentas/medios de pago (Nequi, Nu, Bancolombia...) eran una lista fija
// igual para cualquier despacho que use Nomos — pero cada despacho tiene sus
// propias cuentas reales, así que ahora cada uno guarda y edita la suya.
// "cuentasSaldo" es el subconjunto de esas cuentas que se quiere ver en
// "Saldo esperado por cuenta" (algunas cuentas registradas pueden ser de uso
// personal, no del despacho, y no tiene sentido calcularles saldo ahí).
export const MEDIOS_PAGO_POR_DEFECTO = ["Efectivo", "Efectivo y transacción", "Nequi", "Daviplata", "Nu", "Cuenta bancaria", "Llave"];
export function useMediosPago() {
  const [mediosPago, setMediosPagoState] = useState(MEDIOS_PAGO_POR_DEFECTO);
  const [cuentasSaldo, setCuentasSaldoState] = useState(null); // null = todavía no se sabe
  const [cargado, setCargado] = useState(false);

  const cargar = useCallback(async () => {
    const [rawMedios, rawCuentasSaldo] = await Promise.all([storageGet("medios-pago-despacho", false), storageGet("cuentas-saldo-despacho", false)]);
    const medios = rawMedios ? JSON.parse(rawMedios) : MEDIOS_PAGO_POR_DEFECTO;
    setMediosPagoState(medios);
    // Sin configurar todavía: por defecto solo se sigue el saldo de "Nu" si
    // existe entre las cuentas del despacho (lo más común hoy), o todas si
    // no — cada despacho lo ajusta a su gusto desde Configuración.
    setCuentasSaldoState(rawCuentasSaldo ? JSON.parse(rawCuentasSaldo) : medios.includes("Nu") ? ["Nu"] : medios);
    setCargado(true);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardarMediosPago = async (lista) => {
    setMediosPagoState(lista);
    await storageSet("medios-pago-despacho", JSON.stringify(lista), false);
  };

  const guardarCuentasSaldo = async (lista) => {
    setCuentasSaldoState(lista);
    await storageSet("cuentas-saldo-despacho", JSON.stringify(lista), false);
  };

  return { mediosPago, cuentasSaldo: cuentasSaldo || [], cargado, guardarMediosPago, guardarCuentasSaldo };
}


function useNotificacionesPanel(prefs) {
  const [firmasNuevas, setFirmasNuevas] = useState([]);
  const [clientesInactivos, setClientesInactivos] = useState([]);
  const [pagosPendientes, setPagosPendientes] = useState([]);
  const [contenidoPendiente, setContenidoPendiente] = useState([]);
  const [contenidoVencido, setContenidoVencido] = useState([]);
  const [novedadesJudiciales, setNovedadesJudiciales] = useState([]);
  const [clientesSinRadicado, setClientesSinRadicado] = useState([]);
  const [clientesSinPago, setClientesSinPago] = useState([]);
  const [tareasAviso, setTareasAviso] = useState({ nuevas: [], resueltas: [], vencidas: [] });
  const notifPrefs = prefs || notificacionesPorDefecto();

  const cargar = useCallback(async () => {
    // Las 4 lecturas de abajo son independientes entre sí (firmas, clientes
    // y contenido no dependen unas de otras) — antes se pedían una detrás de
    // otra, cada una esperando a que la anterior termine, sumando ~7 viajes
    // de ida y vuelta al servidor en fila para poder mostrar la campana de
    // notificaciones. Pedirlas todas a la vez con Promise.all corta eso a 2
    // rondas (primero los índices, luego los datos que dependen de ellos),
    // sin cambiar qué se calcula ni qué se muestra.
    const [revisionRaw, idsDocsRaw, idsClientesRaw, idsContenidoRaw] = await Promise.all([
      storageGet("ultima-revision-firmas", false),
      storageGet("indice-documentos", true),
      storageGet("indice-clientes", false),
      storageGet("indice-contenido", true),
    ]);
    const revision = revisionRaw || "1970-01-01T00:00:00.000Z";
    const idsDocs = idsDocsRaw ? JSON.parse(idsDocsRaw) : [];
    const idsClientes = idsClientesRaw ? JSON.parse(idsClientesRaw) : [];
    const idsContenido = idsContenidoRaw ? JSON.parse(idsContenidoRaw) : [];

    const [docsNotif, clientesNotif, contenidoNotifValores] = await Promise.all([
      obtenerDocumentosPorId(idsDocs),
      obtenerClientesPorId(idsClientes),
      obtenerValoresPorClaves(idsContenido.map((id) => `contenido:${id}`)),
    ]);

    const nuevasFirmas = [];
    for (const id of idsDocs) {
      const d = docsNotif[id];
      if (!d) continue;
      (d.firmantes || []).forEach((f) => {
        if (f.rol !== "abogado" && f.firmadoEn > revision) {
          nuevasFirmas.push({ titulo: d.titulo, nombre: f.nombre, fecha: f.firmadoEn });
        }
      });
    }
    setFirmasNuevas(nuevasFirmas);

    const inactivos = [];
    const pendientesPago = [];
    const novedades = [];
    const sinRadicado = [];
    // Un cliente sin ningún plan de pago ni próximo cobro programado es
    // plata que nadie está haciendo seguimiento (ni la app ni el abogado
    // se van a acordar de cobrarla) — antes esto pasaba desapercibido
    // hasta que alguien se acordaba de entrar a revisar Contabilidad a
    // mano. Se avisa apenas se crea un cliente así, para que quede
    // configurado (o se marque a propósito como "sin cobro") desde el
    // principio.
    const sinPago = [];
    for (const id of idsClientes) {
      const c = clientesNotif[id];
      if (!c) continue;
      const dias = diasDesde(c.ultimaActuacion);
      if (dias !== null && dias >= DIAS_ALERTA_INACTIVIDAD && !c.procesoPausado) {
        inactivos.push({ nombre: c.nombre, dias });
      }
      if (c.proximoPago?.fecha && !c.procesoPausado && !c.esClienteAdministrativo) {
        const diasPago = diasHasta(c.proximoPago.fecha);
        if (diasPago !== null && diasPago <= DIAS_AVISO_PROXIMO_PAGO) {
          pendientesPago.push({ cliente: c, dias: diasPago });
        }
      }
      if (c.estadoVigilancia === "Con novedad") {
        novedades.push({ nombre: c.nombre, radicado: c.radicado });
      }
      if (!c.radicado?.trim()) {
        sinRadicado.push({ nombre: c.nombre });
      }
      if (!c.planPago?.valor && !c.proximoPago?.fecha && !c.procesoPausado) {
        sinPago.push({ id, nombre: c.nombre });
      }
    }
    setClientesInactivos(inactivos);
    setPagosPendientes(pendientesPago.sort((a, b) => a.dias - b.dias));
    setNovedadesJudiciales(novedades);
    setClientesSinRadicado(sinRadicado);
    setClientesSinPago(sinPago);

    const hoyISO = fechaHoyISO();
    const pendientesHoy = [];
    const vencidos = [];
    for (const id of idsContenido) {
      const raw = contenidoNotifValores[`contenido:${id}`];
      if (!raw) continue;
      const it = JSON.parse(raw);
      if (it.estado === "Publicado" || !it.fecha) continue;
      if (it.fecha === hoyISO) pendientesHoy.push(it);
      else if (it.fecha < hoyISO) vencidos.push(it);
    }
    setContenidoPendiente(pendientesHoy);
    setContenidoVencido(vencidos);
    await cargarTareasAviso();
  }, []);

  // Tareas: lo que te asignaron y aún no abres, lo tuyo vencido, y lo que
  // asignaste y un colega ya resolvió. Se revisa también al volver a la app
  // y cada 2 minutos, para que una tarea nueva avise sin recargar.
  const cargarTareasAviso = useCallback(async () => {
    const yo = getUsuarioAgendaId();
    if (!yo) return;
    const raw = await storageGet("indice-tareas", false);
    const ids = raw ? JSON.parse(raw) : [];
    const valores = await obtenerValoresPorClaves(ids.map((id) => `tarea:${id}`));
    const hoy = fechaHoyISO();
    const nuevas = [];
    const resueltas = [];
    const vencidas = [];
    for (const id of ids) {
      const v = valores[`tarea:${id}`];
      if (!v) continue;
      const t = JSON.parse(v);
      if (t.asignadoA === yo && t.estado !== "hecha") {
        if (!t.vistaPorAsignado) nuevas.push(t);
        else if (t.fechaLimite && t.fechaLimite < hoy) vencidas.push(t);
      }
      if (t.creadoPor === yo && t.estado === "hecha" && !t.cierreVisto) resueltas.push(t);
    }
    setTareasAviso({ nuevas, resueltas, vencidas });
    // Aviso del sistema (si el navegador lo permite) una sola vez por tarea.
    try {
      const avisadas = new Set(JSON.parse(localStorage.getItem("tareas-avisadas") || "[]"));
      const porAvisar = [...nuevas, ...resueltas].filter((t) => !avisadas.has(`${t.id}:${t.estado}`));
      if (porAvisar.length && typeof Notification !== "undefined" && Notification.permission === "granted") {
        porAvisar.slice(0, 3).forEach((t) =>
          new Notification(t.estado === "hecha" ? `${(t.completadoPorNombre || "Un colega").split(" ")[0]} resolvió una tarea` : `Nueva tarea de ${(t.creadoPorNombre || "un colega").split(" ")[0]}`, {
            body: `${t.titulo}${t.clienteNombre ? ` · ${t.clienteNombre}` : ""}`,
            icon: "/icon-192.png",
          })
        );
      }
      porAvisar.forEach((t) => avisadas.add(`${t.id}:${t.estado}`));
      localStorage.setItem("tareas-avisadas", JSON.stringify([...avisadas].slice(-300)));
    } catch (e) {
      /* sin permiso o sin almacenamiento local: el aviso de la campanita basta */
    }
  }, []);

  // La primera carga puede correr antes de que se sepa quién inició
  // sesión; apenas llega el perfil (y con él sus preferencias) se revisa.
  useEffect(() => {
    if (prefs) cargarTareasAviso();
  }, [prefs, cargarTareasAviso]);

  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === "visible") cargarTareasAviso();
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("nomos:tareas-cambiaron", cargarTareasAviso);
    const intervalo = setInterval(cargarTareasAviso, 120000);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("nomos:tareas-cambiaron", cargarTareasAviso);
      clearInterval(intervalo);
    };
  }, [cargarTareasAviso]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const marcarFirmasVistas = async () => {
    await storageSet("ultima-revision-firmas", new Date().toISOString(), false);
    setFirmasNuevas([]);
  };

  const count =
    (notifPrefs.tareas !== false ? tareasAviso.nuevas.length + tareasAviso.resueltas.length + tareasAviso.vencidas.length : 0) +
    (notifPrefs.firmas !== false ? firmasNuevas.length : 0) +
    (notifPrefs.clientes !== false ? clientesInactivos.length : 0) +
    (notifPrefs.pagos !== false ? pagosPendientes.length : 0) +
    (notifPrefs.contenido !== false ? contenidoPendiente.length + contenidoVencido.length : 0) +
    (notifPrefs.vigilancia !== false ? novedadesJudiciales.length : 0) +
    (notifPrefs.radicados !== false ? clientesSinRadicado.length : 0) +
    (notifPrefs.sin_pago_configurado !== false ? clientesSinPago.length : 0);

  return {
    count,
    firmasNuevas: notifPrefs.firmas !== false ? firmasNuevas : [],
    clientesInactivos: notifPrefs.clientes !== false ? clientesInactivos : [],
    pagosPendientes: notifPrefs.pagos !== false ? pagosPendientes : [],
    contenidoPendiente: notifPrefs.contenido !== false ? contenidoPendiente : [],
    contenidoVencido: notifPrefs.contenido !== false ? contenidoVencido : [],
    novedadesJudiciales: notifPrefs.vigilancia !== false ? novedadesJudiciales : [],
    clientesSinRadicado: notifPrefs.radicados !== false ? clientesSinRadicado : [],
    clientesSinPago: notifPrefs.sin_pago_configurado !== false ? clientesSinPago : [],
    tareasAviso: notifPrefs.tareas !== false ? tareasAviso : { nuevas: [], resueltas: [], vencidas: [] },
    marcarFirmasVistas,
    reload: cargar,
  };
}

// Verificación en dos pasos (2FA/TOTP) por cuenta, con la API nativa de
// Supabase Auth (auth.mfa) — gratis, sin librería ni servicio externo. Cada
// usuario la activa desde aquí para su propia cuenta; al iniciar sesión
// después de activarla, además de la contraseña se pide el código de 6
// dígitos (ver iniciarSesion / pantalla "verificacion-2fa" en LoginGate).
function PanelSeguridad2FA({ onCerrar }) {
  const [cargando, setCargando] = useState(true);
  const [factor, setFactor] = useState(null);
  const [inscribiendo, setInscribiendo] = useState(false);
  const [qrSvg, setQrSvg] = useState("");
  const [secreto, setSecreto] = useState("");
  const [factorIdPendiente, setFactorIdPendiente] = useState(null);
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const panelRef = useRef(null);

  const cargarFactores = useCallback(async () => {
    setCargando(true);
    const { data } = await supabase.auth.mfa.listFactors();
    setFactor(data?.totp?.find((f) => f.status === "verified") || null);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargarFactores();
  }, [cargarFactores]);

  useEffect(() => {
    const alPresionarTecla = (e) => {
      if (e.key === "Escape") onCerrar();
    };
    const alHacerClicAfuera = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onCerrar();
    };
    document.addEventListener("keydown", alPresionarTecla);
    document.addEventListener("mousedown", alHacerClicAfuera);
    return () => {
      document.removeEventListener("keydown", alPresionarTecla);
      document.removeEventListener("mousedown", alHacerClicAfuera);
    };
  }, [onCerrar]);

  const empezarInscripcion = async () => {
    setError("");
    // Supabase no deja tener dos factores TOTP sin verificar a la vez — si
    // quedó uno a medias de un intento anterior, se limpia antes de pedir
    // uno nuevo.
    const { data: factoresActuales } = await supabase.auth.mfa.listFactors();
    for (const f of factoresActuales?.totp || []) {
      if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    if (enrollError || !data) {
      setError("No se pudo iniciar la activación. Intenta de nuevo.");
      return;
    }
    setFactorIdPendiente(data.id);
    setQrSvg(data.totp.qr_code);
    setSecreto(data.totp.secret);
    setInscribiendo(true);
  };

  const confirmarInscripcion = async () => {
    if (codigo.length !== 6 || !factorIdPendiente) return;
    setGuardando(true);
    setError("");
    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factorIdPendiente });
    if (challengeError || !challengeData) {
      setError("No se pudo verificar el código. Intenta de nuevo.");
      setGuardando(false);
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({ factorId: factorIdPendiente, challengeId: challengeData.id, code: codigo });
    setGuardando(false);
    if (verifyError) {
      setError("Código incorrecto. Revisa que la hora de tu teléfono esté bien ajustada e intenta de nuevo.");
      return;
    }
    setInscribiendo(false);
    setCodigo("");
    setQrSvg("");
    setSecreto("");
    await cargarFactores();
  };

  const cancelarInscripcion = async () => {
    if (factorIdPendiente) await supabase.auth.mfa.unenroll({ factorId: factorIdPendiente });
    setInscribiendo(false);
    setCodigo("");
    setError("");
  };

  const desactivar = async () => {
    if (!factor) return;
    setGuardando(true);
    await supabase.auth.mfa.unenroll({ factorId: factor.id });
    setGuardando(false);
    await cargarFactores();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(6,14,28,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "calc(20px + var(--sat)) calc(20px + var(--sar)) calc(20px + var(--sab)) calc(20px + var(--sal))" }}>
      <div
        ref={panelRef}
        className="drx-dropdown-in"
        style={{
          background: COLORS.panel, borderRadius: 16, border: `1px solid ${COLORS.border}`, width: 440, maxWidth: "100%",
          maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 50px rgba(11,61,46,0.25)", padding: 24,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 17, fontWeight: 800, color: COLORS.headingText, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <Icono tipo="escudo" size={18} /> Verificación en dos pasos
          </p>
          <button onClick={onCerrar} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: COLORS.muted }}>
            ✕
          </button>
        </div>

        {cargando ? (
          <Spinner texto="Revisando..." />
        ) : factor && !inscribiendo ? (
          <>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: "#166534", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
              <Icono tipo="check" size={14} /> Activada — cada inicio de sesión pide un código además de tu contraseña.
            </p>
            <button className="drx-btn-ghost" style={{ ...buttonGhost, marginTop: 16, width: "100%", color: "#B42318", borderColor: "#F2B8B5" }} onClick={desactivar} disabled={guardando}>
              {guardando ? "Desactivando..." : "Desactivar verificación en dos pasos"}
            </button>
          </>
        ) : !inscribiendo ? (
          <>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.inkSoft, lineHeight: 1.6, margin: "0 0 16px" }}>
              Agrega una capa extra de seguridad a tu cuenta: además de tu contraseña, se pedirá un código de 6 dígitos generado por una app como Google Authenticator, Authy o similar. Aunque alguien más consiga tu contraseña, no podrá entrar sin ese código.
            </p>
            {error && <p style={{ color: "#B42318", fontSize: 12.5, marginBottom: 12, fontFamily: "Inter, sans-serif" }}>{error}</p>}
            <button className="drx-btn-primary drx-cta-shine" style={{ ...buttonPrimary, width: "100%" }} onClick={empezarInscripcion}>
              Activar verificación en dos pasos
            </button>
          </>
        ) : (
          <>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.inkSoft, marginBottom: 12 }}>
              1. Escanea este código con tu app autenticadora (o escribe la clave manualmente si no puedes escanear):
            </p>
            {qrSvg && (
              // El SVG viene directo de la respuesta de Supabase (nunca de
              // algo que un usuario escribió), por eso es seguro insertarlo
              // así — es la única vez que se hace esto en toda la app.
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, background: "#FFFFFF", padding: 14, borderRadius: 10 }} dangerouslySetInnerHTML={{ __html: qrSvg }} />
            )}
            {secreto && (
              <p style={{ fontFamily: "monospace", fontSize: 12, textAlign: "center", color: COLORS.muted, wordBreak: "break-all", background: COLORS.surfaceSoft, borderRadius: 8, padding: "8px 12px", marginBottom: 16 }}>
                {secreto}
              </p>
            )}
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.inkSoft, marginBottom: 8 }}>2. Ingresa el código de 6 dígitos que te muestra la app:</p>
            <input
              className="drx-input"
              style={{ ...inputStyle, textAlign: "center", fontSize: 20, letterSpacing: 4, marginBottom: 12, width: "100%" }}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              inputMode="numeric"
              maxLength={6}
              autoFocus
            />
            {error && <p style={{ color: "#B42318", fontSize: 12.5, marginBottom: 12, fontFamily: "Inter, sans-serif" }}>{error}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="drx-btn-primary" style={{ ...buttonPrimary, flex: 1 }} onClick={confirmarInscripcion} disabled={guardando || codigo.length !== 6}>
                {guardando ? "Verificando..." : "Confirmar y activar"}
              </button>
              <button className="drx-btn-ghost" style={buttonGhost} onClick={cancelarInscripcion} disabled={guardando}>
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}




export function useUsuariosDespacho() {
  const [usuarios, setUsuarios] = useState([]);
  const [cargado, setCargado] = useState(false);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from("perfiles").select("*").order("creado_en", { ascending: true });
    if (!error) setUsuarios(data || []);
    setCargado(true);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Crear un usuario nuevo pasa por la función serverless: solo ahí se puede
  // usar la llave service_role de Supabase para dar de alta la cuenta real en
  // Supabase Auth (con la contraseña bien hasheada por Supabase, nunca por
  // nosotros ni guardada en texto plano).
  const crear = async ({ nombre, email, contrasena, rol }) => {
    const { data: sesionData } = await supabase.auth.getSession();
    const token = sesionData?.session?.access_token;
    const response = await fetch("/api/usuarios/crear", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ nombre, email, contrasena, rol }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo crear el usuario");
    await cargar();
    return data;
  };

  const actualizar = async (id, cambios) => {
    const { error } = await supabase.from("perfiles").update(cambios).eq("id", id);
    if (!error) setUsuarios((prev) => prev.map((u) => (u.id === id ? { ...u, ...cambios } : u)));
  };

  // Revocar el acceso de alguien que ya no debería tenerlo (dejó el
  // despacho, etc.) — también pasa por la función serverless, porque borrar
  // la cuenta de Supabase Auth necesita la llave service_role.
  const eliminar = async (id) => {
    const { data: sesionData } = await supabase.auth.getSession();
    const token = sesionData?.session?.access_token;
    const response = await fetch("/api/usuarios/eliminar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ usuarioId: id }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo eliminar el usuario");
    setUsuarios((prev) => prev.filter((u) => u.id !== id));
  };

  return { usuarios, cargado, crear, actualizar, eliminar, reload: cargar };
}





export function CampoContrasena({ valor, onChange, onEnter, autoFocus }) {
  const [visible, setVisible] = useState(false);
  // Bloq Mayús activado es la causa más común de "contraseña incorrecta" cuando
  // en realidad el usuario la escribió bien — avisarlo evita intentos fallidos
  // (y el bloqueo temporal por demasiados intentos) por algo tan tonto como eso.
  const [bloqMayus, setBloqMayus] = useState(false);
  const detectarBloqMayus = (e) => setBloqMayus(e.getModifierState && e.getModifierState("CapsLock"));

  return (
    <div style={{ position: "relative" }}>
      <input
        type={visible ? "text" : "password"}
        className="drx-input"
        style={{ ...inputStyle, paddingRight: 44, width: "100%", boxSizing: "border-box", borderColor: bloqMayus ? "#D97706" : undefined }}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          detectarBloqMayus(e);
          if (e.key === "Enter" && onEnter) onEnter();
        }}
        onKeyUp={detectarBloqMayus}
        onBlur={() => setBloqMayus(false)}
        autoFocus={autoFocus}
      />
      <button
        type="button"
        className="drx-ojo-contrasena"
        onClick={() => setVisible((v) => !v)}
        title={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 16, color: COLORS.muted, padding: 6 }}
      >
        <Icono tipo={visible ? "ojoTachado" : "ojo"} size={15} />
      </button>
      {bloqMayus && (
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: "#D97706", margin: "5px 0 0", display: "flex", alignItems: "center", gap: 4 }}>
          <Icono tipo="alerta" size={12} /> Bloq Mayús está activado
        </p>
      )}
    </div>
  );
}

// Heurística simple de fuerza, solo para dar una señal visual inmediata
// mientras se escribe — la regla real que se aplica y valida es
// validarContrasenaCliente/validarContrasena (mínimo 10 caracteres, letras y
// números), tanto acá como en el servidor.
function calcularFuerzaContrasena(pw) {
  if (!pw) return 0;
  let puntos = 0;
  if (pw.length >= 10) puntos++;
  if (pw.length >= 14) puntos++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) puntos++;
  if (/[0-9]/.test(pw)) puntos++;
  if (/[^A-Za-z0-9]/.test(pw)) puntos++;
  return Math.min(4, puntos);
}

const NIVELES_FUERZA = [
  { texto: "Muy débil", color: "#B42318" },
  { texto: "Débil", color: "#F43F5E" },
  { texto: "Aceptable", color: "#F5A524" },
  { texto: "Buena", color: "#2F80ED" },
  { texto: "Fuerte", color: "#10B981" },
];

function MedidorFuerzaContrasena({ valor }) {
  if (!valor) return null;
  const nivel = calcularFuerzaContrasena(valor);
  const { texto, color } = NIVELES_FUERZA[nivel];
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: "flex", gap: 4 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ height: 4, flex: 1, borderRadius: 2, background: i < nivel ? color : COLORS.border, transition: "background 0.2s ease" }} />
        ))}
      </div>
      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 10.5, fontWeight: 600, color, margin: "4px 0 0" }}>{texto}</p>
    </div>
  );
}



export const FAQ_LANDING = [
  {
    p: "¿Qué pasa con mis datos si algún día dejo de pagar o quiero irme?",
    r: "Puedes descargar en cualquier momento un respaldo completo de toda tu información (clientes, documentos y contenido) en un archivo que te llevas tú, desde \"Usuarios y permisos\". No queda nada retenido.",
  },
  {
    p: "¿Es válida legalmente la firma electrónica de los documentos?",
    r: "Sí, es una firma electrónica bajo la Ley 527 de 1999. Al firmar, quien firma acepta explícitamente el tratamiento de sus datos y la validez de la firma, y queda registrado un hash de integridad del documento, la IP real de quien firmó y un certificado de firma descargable — evidencia lista si algún día se cuestiona.",
  },
  {
    p: "¿Cómo funciona el registro y el pago?",
    r: "Te registras, confirmas tu correo y coordinamos el pago por WhatsApp — apenas se confirma, activamos tu acceso. No hay que meter una tarjeta ni configurar nada técnico.",
  },
  {
    p: "¿Quién puede ver la información de mis clientes?",
    r: "Solo los usuarios que tú autorices dentro de tu propio despacho. Cada despacho está completamente aislado del resto — nadie de otro despacho puede ver tus datos, ni siquiera nosotros por defecto.",
  },
  {
    p: "¿La vigilancia judicial hay que revisarla a mano todos los días?",
    r: "No. Todos los días se revisan solos los radicados de tus procesos contra la Rama Judicial, y si hay una actuación nueva te avisa la campanita de notificaciones — solo entras cuando de verdad hay algo que ver.",
  },
  {
    p: "¿Mis clientes necesitan crear una cuenta para firmar o consultar su caso?",
    r: "No. Firman con un código que tú les compartes, sin registrarse. Y con el Portal del cliente pueden consultar el estado de su proceso y su estado de cuenta cuando quieran, también sin cuenta ni contraseña.",
  },
  {
    p: "¿Necesito instalar algo?",
    r: "No. Funciona desde el navegador, en el celular o el computador, y se puede \"agregar a inicio\" para que se sienta como una app nativa, sin pasar por tiendas de aplicaciones.",
  },
  {
    p: "¿Puedo cambiar de plan o cancelar cuando quiera?",
    r: "Sí, no hay contratos de permanencia forzosa.",
  },
];




// PoliticaPrivacidad y TerminosUso viven en src/views/ y se cargan con
// lazy() — páginas legales públicas, casi nunca vistas por un despacho
// que ya inició sesión.

// Página de diagnóstico pública (#diagnostico) — sin necesitar iniciar
// sesión ni salir de Nomos para ir a revisar Supabase/Vercel a mano.
// Prueba de verdad si el navegador logra hablar con Supabase Auth y con la
// base de datos, y muestra el motivo exacto si falla — así, si algún día
// el login se queda pegado sin explicación, esto dice enseguida si es
// "el proyecto de Supabase está pausado", "faltan las variables de entorno
// en Vercel" o algo distinto, sin depender de tener acceso a esos paneles.
// VistaDiagnostico vive en src/views/VistaDiagnostico.jsx (lazy) — pantalla
// de diagnóstico técnico (#diagnostico), de uso muy poco frecuente.

// TerminosUso vive en src/views/TerminosUso.jsx (lazy).

// LandingPage vive en su propio archivo y se carga con lazy() (como las
// pestañas) — es la página pública de mercadeo, ~900 líneas que un usuario
// ya logueado JAMÁS ve, así que no tiene sentido que estén en el bundle
// principal que se descarga en cada visita.

// Número y titular de la cuenta donde se reciben los pagos de suscripción a
// Nomos (no confundir con NUMERO_WHATSAPP_DESPACHO, que es solo el canal de
// chat) — mientras no haya una pasarela real (Wompi/ePayco con PSE), el
// pago se recibe por transferencia/Nequi y se confirma a mano.
const CUENTA_PAGO_NOMOS = {
  nequiDaviplata: "319 287 5428",
  llave: "1010040978",
  titular: "Felipe Cortés Ramírez",
};

// Pago de la suscripción a Nomos con Wompi (tarjeta, PSE, Nequi, botón
// Bancolombia). El link se arma en el servidor (api/despachos/reportar-pago.js)
// con la firma de integridad — aquí solo se elige el plan y se redirige. Si
// los pagos en línea no están configurados todavía (faltan las llaves de
// Wompi en Vercel), no se muestra nada y queda el pago manual de siempre.
export async function llamarPagosNomos(cuerpo) {
  const { data: sesionData } = await supabase.auth.getSession();
  const token = sesionData?.session?.access_token;
  const resp = await fetch("/api/despachos/reportar-pago", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(cuerpo),
  });
  const datos = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(datos.error || "No se pudo conectar con el servidor de pagos.");
  return datos;
}

export function PagarPlanWompi({ compacto = false }) {
  const [config, setConfig] = useState(null);
  const [plan, setPlan] = useState("despacho");
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelado = false;
    fetch("/api/despachos/reportar-pago?wompi=config")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelado && setConfig(d))
      .catch(() => !cancelado && setConfig(null));
    return () => {
      cancelado = true;
    };
  }, []);
  if (!config?.habilitado) return null;

  const pagar = async () => {
    setAbriendo(true);
    setError("");
    try {
      const { url } = await llamarPagosNomos({ accion: "wompi_checkout", plan });
      window.location.href = url;
    } catch (e) {
      setError(e.message);
      setAbriendo(false);
    }
  };

  const opciones = [
    { id: "abogado", nombre: "Abogado", detalle: "1 abogado", valor: config.planes?.abogado?.valor || 80000 },
    { id: "despacho", nombre: "Despacho", detalle: "Usuarios ilimitados", valor: config.planes?.despacho?.valor || 120000 },
  ];
  return (
    <div style={{ textAlign: "left", marginBottom: compacto ? 0 : 16 }}>
      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 700, color: COLORS.headingText, textTransform: "uppercase", letterSpacing: 0.4, margin: "0 0 8px" }}>
        Paga tu plan en línea {config.pruebas && <span style={{ color: "#B45309" }}>(modo prueba)</span>}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        {opciones.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setPlan(o.id)}
            style={{
              textAlign: "left",
              cursor: "pointer",
              borderRadius: 10,
              padding: "10px 12px",
              border: `2px solid ${plan === o.id ? COLORS.accentBright : COLORS.border}`,
              background: plan === o.id ? COLORS.accentSoft : COLORS.panel,
              fontFamily: "Inter, sans-serif",
              color: COLORS.ink,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 800 }}>{o.nombre}</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.headingText }}>{formatoCOP(o.valor)}<span style={{ fontSize: 11, fontWeight: 600, color: COLORS.muted }}>/mes</span></div>
            <div style={{ fontSize: 11, color: COLORS.muted }}>{o.detalle}</div>
          </button>
        ))}
      </div>
      <button className="drx-btn-primary drx-cta-shine" style={{ ...buttonPrimary, width: "100%" }} onClick={pagar} disabled={abriendo}>
        {abriendo ? "Abriendo Wompi…" : "Pagar con Wompi →"}
      </button>
      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: COLORS.muted, margin: "6px 0 0", textAlign: "center" }}>
        Tarjeta, PSE, Nequi o botón Bancolombia. Tu plan se activa solo apenas se aprueba el pago.
      </p>
      {error && <p style={{ color: "#B42318", fontSize: 12.5, margin: "8px 0 0", fontFamily: "Inter, sans-serif" }}>{error}</p>}
    </div>
  );
}

// Días que se puede seguir usando Nomos después de la fecha de vencimiento
// del plan (igual que DIAS_GRACIA en api/despachos/reportar-pago.js).
const DIAS_GRACIA_PLAN = 2;
export const fechaLargaPlan = (iso) => (iso ? new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" }) : "");



// Aviso arriba del panel cuando el plan está por vencer o ya venció (dentro
// de los días de gracia). Si el cobro automático está activo y sin errores,
// no molesta: el cobro llega solo.
function AvisoPlanPorVencer({ usuarioActual }) {
  const [cerrado, setCerrado] = useState(false);
  const [abriendo, setAbriendo] = useState(false);
  const vence = usuarioActual.pagadoHasta;
  if (!vence || cerrado) return null;
  if (usuarioActual.cobroAutomatico && !usuarioActual.cobroAutoError) return null;
  const msVence = new Date(vence).getTime();
  const dias = Math.ceil((msVence - Date.now()) / 86400000);
  if (dias > 3) return null;
  const limite = fechaLargaPlan(new Date(msVence + DIAS_GRACIA_PLAN * 86400000).toISOString());
  const esAdmin = usuarioActual.rol === "Administrador";
  const texto =
    dias < 0
      ? `Tu plan de Nomos venció el ${fechaLargaPlan(vence)}. Paga antes del ${limite} para no perder el acceso.`
      : `Tu plan de Nomos vence el ${fechaLargaPlan(vence)}.${usuarioActual.cobroAutoError ? " El cobro automático falló." : ""} Págalo para no perder el acceso (tienes hasta el ${limite}).`;
  const pagar = async () => {
    setAbriendo(true);
    try {
      const { url } = await llamarPagosNomos({ accion: "wompi_checkout", plan: usuarioActual.planNomos || "despacho" });
      window.location.href = url;
    } catch {
      setAbriendo(false);
    }
  };
  return (
    <div style={{ position: "fixed", bottom: "calc(16px + var(--sab))", left: "50%", transform: "translateX(-50%)", zIndex: 1400, width: "min(560px, calc(100vw - 28px))", background: dias < 0 ? "#FEF2F2" : "#FFFBEB", border: `1px solid ${dias < 0 ? "#F3C6C0" : "#FDE68A"}`, color: dias < 0 ? "#B42318" : "#92400E", borderRadius: 12, padding: "12px 38px 12px 14px", fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, lineHeight: 1.5, boxShadow: "0 12px 30px rgba(0,0,0,0.12)" }}>
      {texto}
      {esAdmin ? (
        <button onClick={pagar} disabled={abriendo} className="drx-btn-primary" style={{ ...buttonPrimary, padding: "6px 14px", fontSize: 12.5, marginLeft: 8, marginTop: 6 }}>
          {abriendo ? "Abriendo…" : "Pagar ahora"}
        </button>
      ) : (
        <span> Pídele al administrador del despacho que lo pague.</span>
      )}
      <button onClick={() => setCerrado(true)} aria-label="Cerrar" style={{ position: "absolute", top: 6, right: 10, background: "none", border: "none", color: "inherit", fontSize: 18, cursor: "pointer" }}>
        ×
      </button>
    </div>
  );
}

// Al volver de Wompi (?pago=wompi&id=<transacción>) se confirma el pago
// contra el servidor. PSE puede quedar "PENDING" unos minutos, así que se
// vuelve a preguntar cada 5 s durante 2 minutos antes de rendirse.
function useConfirmacionPagoWompi(usuarioActual, onAprobado) {
  const [aviso, setAviso] = useState(null);
  useEffect(() => {
    if (!usuarioActual) return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (params.get("pago") !== "wompi" || !id) return;
    window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    let intentos = 0;
    let temporizador = null;
    let cancelado = false;
    const revisar = async () => {
      try {
        const { estado } = await llamarPagosNomos({ accion: "wompi_estado", id });
        if (cancelado) return;
        if (estado === "APPROVED") {
          setAviso({ tipo: "ok", texto: "✓ Pago aprobado. Tu plan de Nomos quedó activo. ¡Gracias!" });
          onAprobado?.();
        } else if (estado === "PENDING" && intentos < 24) {
          intentos += 1;
          setAviso({ tipo: "pendiente", texto: "Tu pago está en proceso (PSE puede tardar unos minutos). Tu plan se activa solo apenas Wompi lo confirme." });
          temporizador = setTimeout(revisar, 5000);
        } else if (estado === "PENDING") {
          setAviso({ tipo: "pendiente", texto: "Wompi todavía no confirma tu pago. Apenas lo apruebe, tu plan se activa solo; si tienes afán, escríbenos por WhatsApp." });
        } else {
          setAviso({ tipo: "error", texto: "El pago no fue aprobado. Puedes intentarlo de nuevo con otro medio de pago." });
        }
      } catch (e) {
        if (!cancelado) setAviso({ tipo: "error", texto: e.message });
      }
    };
    setAviso({ tipo: "pendiente", texto: "Confirmando tu pago con Wompi…" });
    revisar();
    return () => {
      cancelado = true;
      clearTimeout(temporizador);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioActual?.id]);
  return [aviso, setAviso];
}

function AvisoPagoWompi({ aviso, onCerrar }) {
  if (!aviso) return null;
  const colores = aviso.tipo === "ok" ? ["#F0FDF4", "#BBF7D0", "#166534"] : aviso.tipo === "error" ? ["#FEF2F2", "#F3C6C0", "#B42318"] : ["#FFFBEB", "#FDE68A", "#92400E"];
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        top: "calc(14px + var(--sat))",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 4500,
        width: "min(520px, calc(100vw - 28px))",
        background: colores[0],
        border: `1px solid ${colores[1]}`,
        color: colores[2],
        borderRadius: 12,
        padding: "12px 40px 12px 14px",
        fontFamily: "Inter, sans-serif",
        fontSize: 13.5,
        fontWeight: 600,
        lineHeight: 1.5,
        boxShadow: "0 12px 30px rgba(0,0,0,0.12)",
      }}
    >
      {aviso.texto}
      <button onClick={onCerrar} aria-label="Cerrar" style={{ position: "absolute", top: 8, right: 10, background: "none", border: "none", color: colores[2], fontSize: 18, cursor: "pointer" }}>
        ×
      </button>
    </div>
  );
}

function PantallaPendienteActivacion({ usuarioActual, onCerrarSesion, avisoPago, onCerrarAvisoPago }) {
  const { oscuro, alternar } = useTema();
  const [reportando, setReportando] = useState(false);
  const [reportado, setReportado] = useState(!!usuarioActual.pagoReportadoEn);
  const [errorReporte, setErrorReporte] = useState("");
  const pruebaVencida = !!usuarioActual.pruebaHasta;
  const codigoReferencia = (usuarioActual.despacho_id || "").slice(0, 8).toUpperCase();
  const mensaje = `Hola, quiero activar mi cuenta en Nomos.\n\nDespacho: ${usuarioActual.despachoNombre}\nCorreo: ${usuarioActual.email}\nCódigo: ${codigoReferencia}`;

  const reportarPago = async () => {
    setReportando(true);
    setErrorReporte("");
    try {
      const { data: sesionData } = await supabase.auth.getSession();
      const token = sesionData?.session?.access_token;
      const response = await fetch("/api/despachos/reportar-pago", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!response.ok) throw new Error();
      setReportado(true);
    } catch (e) {
      setErrorReporte("No se pudo enviar el aviso. Intenta de nuevo o escríbenos por WhatsApp.");
    }
    setReportando(false);
  };

  return (
    <div
      className={`${oscuro ? "drx-tema-oscuro" : "drx-tema-claro"} drx-glow`}
      style={{ minHeight: "100%", background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, position: "relative" }}
    >
      <GlobalStyle />
      <div style={{ position: "absolute", top: 20, right: 20 }}>
        <BotonTema oscuro={oscuro} onClick={alternar} />
      </div>
      <Card style={{ maxWidth: 460, width: "100%", textAlign: "center" }}>
        <InsigniaPlataforma grande />
        <h1 style={{ fontFamily: "Inter, sans-serif", fontSize: 20, fontWeight: 800, color: COLORS.headingText, margin: "0 0 10px" }}>
          {usuarioActual.planVencido ? "Tu plan de Nomos venció" : pruebaVencida ? "Tu demo de 3 horas terminó" : "Tu cuenta está casi lista"}
        </h1>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.muted, lineHeight: 1.6, marginBottom: 20 }}>
          {usuarioActual.planVencido
            ? `Tu plan venció el ${fechaLargaPlan(usuarioActual.pagadoHasta)} y pasaron los ${DIAS_GRACIA_PLAN} días de gracia. Tus datos siguen guardados en `
            : pruebaVencida
              ? `Esperamos que hayas podido probar de todo en `
              : `Ya confirmamos tu correo y creamos `}
          <strong>{usuarioActual.despachoNombre}</strong>
          {pruebaVencida ? ". Para seguir usándolo, activa tu plan pagando abajo." : ". Solo falta activar tu plan para entrar."}
        </p>

        <AvisoPagoWompi aviso={avisoPago} onCerrar={onCerrarAvisoPago} />
        <PagarPlanWompi />
        {reportado ? (
          <p
            style={{
              fontFamily: "Inter, sans-serif", fontSize: 13, color: "#166534", background: "#F0FDF4",
              border: "1px solid #BBF7D0", borderRadius: 10, padding: "12px 14px", textAlign: "left", lineHeight: 1.6,
            }}
          >
            <Icono tipo="check" size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
            Avisamos que ya pagaste — en cuanto lo confirmemos, activamos tu acceso (normalmente en menos de 24h). Si tienes afán, también puedes escribirnos por WhatsApp.
          </p>
        ) : (
          <div style={{ textAlign: "left", background: COLORS.surfaceSoft, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 700, color: COLORS.headingText, textTransform: "uppercase", letterSpacing: 0.4, margin: "0 0 8px" }}>
              O paga por transferencia
            </p>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.inkSoft, margin: "0 0 4px" }}>
              Nequi / Daviplata: <strong style={{ color: COLORS.ink }}>{CUENTA_PAGO_NOMOS.nequiDaviplata}</strong>
            </p>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.inkSoft, margin: "0 0 4px" }}>
              Llave Bancolombia: <strong style={{ color: COLORS.ink }}>{CUENTA_PAGO_NOMOS.llave}</strong> ({CUENTA_PAGO_NOMOS.titular})
            </p>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.inkSoft, margin: "0 0 4px" }}>
              Plan Abogado $80.000/mes · Plan Despacho $120.000/mes
            </p>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, margin: 0 }}>
              Pon <strong>{codigoReferencia}</strong> como referencia del pago para que lo identifiquemos rápido.
            </p>
          </div>
        )}

        {!reportado && (
          <button
            className="drx-btn-primary drx-cta-shine"
            style={{ ...buttonPrimary, width: "100%", marginBottom: 10 }}
            onClick={reportarPago}
            disabled={reportando}
          >
            {reportando ? "Enviando…" : "Ya pagué, avisar al equipo"}
          </button>
        )}
        {errorReporte && <p style={{ color: "#B42318", fontSize: 12.5, marginBottom: 10, fontFamily: "Inter, sans-serif" }}>{errorReporte}</p>}

        <a
          href={`https://wa.me/${NUMERO_WHATSAPP_DESPACHO}?text=${encodeURIComponent(mensaje)}`}
          target="_blank"
          rel="noreferrer"
          style={{
            ...buttonGhost,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            width: "100%",
            textDecoration: "none",
            boxSizing: "border-box",
          }}
        >
          <Icono tipo="chat" size={14} style={{ marginRight: 5, verticalAlign: -2 }} /> O escríbenos por WhatsApp
        </a>
        <button
          onClick={onCerrarSesion}
          style={{ background: "none", border: "none", color: COLORS.muted, fontSize: 12, cursor: "pointer", fontFamily: "Inter, sans-serif", textDecoration: "underline", marginTop: 16 }}
        >
          Cerrar sesión
        </button>
      </Card>
    </div>
  );
}

// Freno del lado del cliente contra el "bombardeo" de correos de
// recuperación de contraseña (ver enviarRecuperacion). No reemplaza los
// límites del servidor (Supabase Auth ya los tiene) — es una capa
// adicional, y por eso se guarda en localStorage: así sobrevive a recargar
// la página.
const LLAVE_COOLDOWN_RECUPERACION = "nomos_cooldown_recuperacion";

export function leerJSONLocal(llave, porDefecto) {
  try {
    const raw = localStorage.getItem(llave);
    return raw ? JSON.parse(raw) : porDefecto;
  } catch {
    return porDefecto;
  }
}

export function guardarJSONLocal(llave, valor) {
  try {
    localStorage.setItem(llave, JSON.stringify(valor));
  } catch {
    // localStorage puede fallar (modo incógnito estricto, cuota llena) — el
    // freno simplemente no persiste entre recargas en ese caso, sin romper
    // el inicio de sesión.
  }
}

// Reemplaza window.confirm() (esa ventana gris del sistema operativo que no
// combina con nada del diseño) por un diálogo propio, con el mismo estilo
// del resto de la app. Se usa como: const ok = await confirmar("¿Seguro?");
// y se debe renderizar {ConfirmarDialogo} en algún lugar del componente.
// Para cajas de búsqueda: el texto tecleado se actualiza al instante (el
// input nunca se siente lento), pero el valor que de verdad dispara el
// filtrado espera un respiro breve tras la última tecla — así escribir
// rápido no recalcula la lista filtrada en cada letra, solo cuando la
// persona hace una pausa.
export function useValorConRetraso(valor, esperaMs = 200) {
  const [valorConRetraso, setValorConRetraso] = useState(valor);
  useEffect(() => {
    const temporizador = setTimeout(() => setValorConRetraso(valor), esperaMs);
    return () => clearTimeout(temporizador);
  }, [valor, esperaMs]);
  return valorConRetraso;
}

export function useConfirmarDialogo() {
  const [pregunta, setPregunta] = useState(null);

  const confirmar = (mensaje) =>
    new Promise((resolve) => {
      setPregunta({ mensaje, resolver: resolve });
    });

  const responder = (valor) => {
    pregunta?.resolver(valor);
    setPregunta(null);
  };

  const ConfirmarDialogo = pregunta ? (
    <div
      onClick={() => responder(false)}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,18,32,0.55)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "calc(20px + var(--sat)) calc(20px + var(--sar)) calc(20px + var(--sab)) calc(20px + var(--sal))",
        zIndex: 2000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="drx-fade-in"
        style={{
          background: COLORS.panel,
          borderRadius: 14,
          padding: 24,
          maxWidth: 380,
          width: "100%",
          boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
          borderTop: "3px solid #B42318",
        }}
      >
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: COLORS.ink, lineHeight: 1.6, margin: "0 0 20px" }}>{pregunta.mensaje}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="drx-btn-ghost" style={buttonGhost} onClick={() => responder(false)}>
            Cancelar
          </button>
          <button className="drx-btn-primary" style={{ ...buttonPrimary, background: "#B42318" }} onClick={() => responder(true)}>
            Confirmar
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirmar, ConfirmarDialogo };
}

export function useCuentaRegresiva(hastaCuando) {
  const [segundos, setSegundos] = useState(0);
  useEffect(() => {
    if (!hastaCuando) {
      setSegundos(0);
      return;
    }
    const tick = () => setSegundos(Math.max(0, Math.ceil((hastaCuando - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [hastaCuando]);
  return segundos;
}

function LoginGate({ onIngresar, onCancelar, pantallaInicial, errorExterno }) {
  const { oscuro, alternar } = useTema();
  const [pantalla, setPantalla] = useState(pantallaInicial || "login"); // login | registro
  const [nombreDespacho, setNombreDespacho] = useState("");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  // Anti-spam del formulario de registro: "sitioWeb" es un campo trampa que
  // ningún humano llena (está oculto visualmente, no con display:none, para
  // que los rellenadores automáticos de formularios sí lo detecten y caigan
  // en la trampa); "iniciadoEn" marca cuándo se mostró el formulario — un
  // envío en menos de 1.5 segundos es casi seguro un bot, no una persona
  // llenando el formulario a mano.
  const [sitioWeb, setSitioWeb] = useState("");
  const [fotoArchivo, setFotoArchivo] = useState(null);
  const [fotoPreview, setFotoPreview] = useState("");
  const [iniciadoEn] = useState(() => Date.now());
  const [proximoEnvioRecuperacion, setProximoEnvioRecuperacion] = useState(() => leerJSONLocal(LLAVE_COOLDOWN_RECUPERACION, {}).proximoEnvio || 0);
  const [codigo2FA, setCodigo2FA] = useState("");
  const [factorId2FA, setFactorId2FA] = useState(null);
  const [challengeId2FA, setChallengeId2FA] = useState(null);
  const segundosEsperaRecuperacion = useCuentaRegresiva(proximoEnvioRecuperacion);


  // Si la carga del perfil después de un login exitoso falla (p. ej. una
  // migración de base de datos que no se corrió todavía), App.jsx lo detecta
  // y lo manda aquí como errorExterno — si no se mostrara, el usuario se
  // quedaría viendo el formulario sin ninguna pista de qué pasó.
  useEffect(() => {
    if (errorExterno) setError(errorExterno);
  }, [errorExterno]);

  const cambiarPantalla = (nueva) => {
    setPantalla(nueva);
    setError("");
  };

  const elegirFoto = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    if (archivoDemasiadoGrande(archivo)) {
      setError(`La foto no puede pesar más de ${TAMANO_MAX_ARCHIVO_MB} MB.`);
      return;
    }
    if (!(await archivoEsImagenValida(archivo))) {
      setError("Ese archivo no es una imagen válida (o es un formato no admitido, como SVG). Prueba con un JPG o PNG.");
      return;
    }
    setFotoArchivo(archivo);
    setFotoPreview(URL.createObjectURL(archivo));
  };

  const crearDespacho = async () => {
    if (!nombreDespacho.trim() || !nombre.trim() || !email.trim() || !contrasena.trim()) return;
    const errorContrasena = validarContrasenaCliente(contrasena);
    if (errorContrasena) {
      setError(errorContrasena);
      return;
    }
    setEnviando(true);
    setError("");
    // Cumplir las reglas de longitud/combinación no evita algo como
    // "Nequi12345" — se revisa además contra contraseñas ya filtradas en
    // brechas de datos conocidas (ver src/lib/pwnedPassword.js). Si la API
    // no responde, no se bloquea el registro por eso.
    if (await contrasenaFiltrada(contrasena)) {
      setError("Esa contraseña ha aparecido en filtraciones de datos conocidas — cualquiera puede probarla. Usa una distinta.");
      setEnviando(false);
      return;
    }
    try {
      // Se crea el usuario de Auth desde el navegador (no con service_role)
      // para que Supabase mande el correo real de confirmación. Sin ese
      // correo confirmado, signUp no deja sesión activa todavía.
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password: contrasena,
        options: { emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
      });
      if (signUpError) throw signUpError;
      if (!signUpData.user) throw new Error("No se pudo crear la cuenta.");
      // Cuando el correo ya tiene una cuenta confirmada, Supabase no lo dice
      // directamente (por seguridad, para no revelar qué correos existen),
      // pero devuelve "identities" vacío en vez de la identidad nueva —
      // así se puede distinguir sin debilitar esa protección.
      if (Array.isArray(signUpData.user.identities) && signUpData.user.identities.length === 0) {
        setError("Ya existe una cuenta con este correo. Inicia sesión, o si olvidaste tu contraseña, recupérala.");
        setEnviando(false);
        return;
      }

      const response = await fetch("/api/despachos/crear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombreDespacho: nombreDespacho.trim(),
          nombre: nombre.trim(),
          email: email.trim(),
          userId: signUpData.user.id,
          sitioWeb,
          segundosLlenando: (Date.now() - iniciadoEn) / 1000,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo crear el despacho.");

      if (signUpData.session) {
        // Solo se puede subir la foto aquí si quedó sesión activa de una
        // vez (confirmación de correo desactivada) — si toca confirmar por
        // correo primero, todavía no hay permiso de Storage para subir
        // nada a nombre de este despacho. La persona puede ponerse foto
        // después desde su perfil.
        if (fotoArchivo && data.despacho?.id) {
          try {
            setDespachoActual(data.despacho.id, data.despacho.nombre);
            const ruta = await subirFotoPerfil(signUpData.user.id, fotoArchivo);
            await supabase.from("perfiles").update({ foto_url: ruta }).eq("id", signUpData.user.id);
          } catch (e) {
            console.warn("No se pudo subir la foto de perfil:", e);
          }
        }
        marcarLoginRecienHecho();
        onIngresar();
      } else {
        setPantalla("registro-enviado");
      }
    } catch (e) {
      setError(e.message || "No se pudo crear el despacho. Intenta de nuevo.");
    }
    setEnviando(false);
  };

  const iniciarSesion = async () => {
    if (!email.trim() || !contrasena.trim()) return;
    setEnviando(true);
    setError("");
    // Todo el proceso de login vive dentro de un try/catch/finally a
    // propósito: antes, si algo tronaba a mitad de camino (una llamada de
    // red que fallara distinto a como Supabase normalmente reporta un
    // error), el botón se quedaba en "Ingresando…" para siempre, sin
    // mensaje y sin forma de volver a intentar sin recargar la página. El
    // finally garantiza que setEnviando(false) SIEMPRE corra, pase lo que
    // pase.
    try {
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password: contrasena });
      // Las cuentas de prueba creadas desde "Usuarios y permisos" (ver
      // PanelAccesoPrueba) tienen expira_en — si ya pasó, se corta el acceso
      // aquí mismo, antes de dejar entrar al panel.
      if (!loginError && loginData?.user) {
        const { data: perfilRecienLogueado } = await supabase.from("perfiles").select("expira_en").eq("id", loginData.user.id).maybeSingle();
        if (perfilRecienLogueado?.expira_en && new Date(perfilRecienLogueado.expira_en).getTime() <= Date.now()) {
          await supabase.auth.signOut();
          setError("Este acceso de prueba ya expiró. Pide que te generen uno nuevo.");
          return;
        }
      }
      if (loginError) {
        // El freno de intentos repetidos (que duplicaba la espera tras el 5º
        // intento fallido) se quitó: Supabase Auth ya tiene su propio límite
        // del lado del servidor contra fuerza bruta, y el de aquí (guardado
        // en localStorage, por dispositivo) terminaba bloqueando a alguien
        // que solo se equivocó de contraseña un par de veces seguidas.
        setError("Correo o contraseña incorrectos.");
        return;
      }

      // Si el usuario activó verificación en dos pasos (ver
      // PanelSeguridad2FA), la contraseña sola no basta — Supabase marca
      // que falta subir a "aal2" y hay que resolver un reto con el código
      // de 6 dígitos antes de dejarlo entrar.
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalData && aalData.nextLevel === "aal2" && aalData.currentLevel !== "aal2") {
        const { data: factoresData } = await supabase.auth.mfa.listFactors();
        const factorVerificado = factoresData?.totp?.find((f) => f.status === "verified");
        if (factorVerificado) {
          const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factorVerificado.id });
          if (!challengeError && challengeData) {
            setFactorId2FA(factorVerificado.id);
            setChallengeId2FA(challengeData.id);
            setPantalla("verificacion-2fa");
            return;
          }
        }
      }

      marcarLoginRecienHecho();
      onIngresar();
    } catch (e) {
      console.error("Error inesperado al iniciar sesión:", e);
      setError("Algo falló al iniciar sesión. Revisa tu conexión e intenta de nuevo — si sigue pasando, avísanos.");
    } finally {
      setEnviando(false);
    }
  };

  const verificarCodigo2FA = async () => {
    if (!codigo2FA.trim() || !factorId2FA || !challengeId2FA) return;
    setEnviando(true);
    setError("");
    try {
      const { error: verifyError } = await supabase.auth.mfa.verify({ factorId: factorId2FA, challengeId: challengeId2FA, code: codigo2FA.trim() });
      if (verifyError) {
        setError("Código incorrecto o vencido. Revisa la hora de tu teléfono e intenta de nuevo.");
        return;
      }
      setCodigo2FA("");
      marcarLoginRecienHecho();
      onIngresar();
    } catch (e) {
      console.error("Error inesperado verificando el código:", e);
      setError("Algo falló al verificar el código. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

  const enviarRecuperacion = async () => {
    if (!email.trim() || segundosEsperaRecuperacion > 0) return;
    setEnviando(true);
    setError("");
    const { error: recError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
    });
    // El freno se aplica hayamos podido enviar el correo o no — evita que
    // alguien use este formulario para bombardear de correos de
    // recuperación la bandeja de entrada de otra persona.
    const proximo = Date.now() + 45 * 1000;
    setProximoEnvioRecuperacion(proximo);
    guardarJSONLocal(LLAVE_COOLDOWN_RECUPERACION, { proximoEnvio: proximo });
    setEnviando(false);
    if (recError) {
      setError("No pudimos enviar el correo. Verifica la dirección e intenta de nuevo.");
      return;
    }
    setPantalla("recuperacion-enviada");
  };

  return (
    <div
      className={`${oscuro ? "drx-tema-oscuro" : "drx-tema-claro"} drx-glow`}
      style={{ minHeight: "100%", background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, position: "relative", overflow: "hidden" }}
    >
      <GlobalStyle />
      <TexturaGrano />
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          top: "12%",
          left: "12%",
          width: 300,
          height: 300,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(22,163,74,${oscuro ? 0.32 : 0.16}) 0%, rgba(22,163,74,0) 70%)`,
          animation: "drx-mesh 12s ease-in-out infinite",
          transition: "background 0.3s ease",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          bottom: "8%",
          right: "10%",
          width: 260,
          height: 260,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(20,184,166,${oscuro ? 0.28 : 0.14}) 0%, rgba(20,184,166,0) 70%)`,
          animation: "drx-mesh 15s ease-in-out infinite reverse",
          transition: "background 0.3s ease",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <div style={{ position: "absolute", top: 20, right: 20, zIndex: 1 }}>
        <BotonTema oscuro={oscuro} onClick={alternar} />
      </div>
      <div className="drx-fade-in" style={{ maxWidth: 420, width: "100%", position: "relative", zIndex: 1 }}>
      <Card style={{ width: "100%", textAlign: "center", position: "relative", borderTop: `3px solid ${COLORS.accentBright}`, boxShadow: "0 20px 50px rgba(11,61,46,0.14)" }}>
        {onCancelar && (
          <button
            onClick={onCancelar}
            title="Volver"
            style={{ position: "absolute", top: 16, left: 16, background: "none", border: "none", cursor: "pointer", fontSize: 18, color: COLORS.muted, display: "flex", alignItems: "center", gap: 4 }}
          >
            ← <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5 }}>Volver</span>
          </button>
        )}
        <InsigniaPlataforma grande />
        <p style={{ margin: "0 0 4px", display: "flex", justifyContent: "center", color: COLORS.headingText }}>
          <Icono
            tipo={
              pantalla === "registro"
                ? "edificio"
                : pantalla === "recuperar" || pantalla === "recuperacion-enviada"
                ? "sobre"
                : pantalla === "registro-enviado"
                ? "bandeja"
                : pantalla === "verificacion-2fa"
                ? "escudo"
                : "llave"
            }
            size={26}
          />
        </p>
        <h1 style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: COLORS.headingText, margin: "0 0 4px" }}>
          {pantalla === "registro"
            ? "Registra tu despacho"
            : pantalla === "registro-enviado"
              ? "Confirma tu correo"
              : pantalla === "recuperar" || pantalla === "recuperacion-enviada"
                ? "Recuperar contraseña"
                : "Panel de gestión legal"}
        </h1>

        {pantalla === "registro" && (
          <div style={{ textAlign: "left" }}>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.muted, margin: "8px 0 16px" }}>
              Crea la cuenta de tu despacho — quedas como su Administrador y desde ahí creas a los demás usuarios y les das permisos. Tus datos quedan
              completamente separados de los de cualquier otro despacho.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Campo trampa para bots: invisible para personas, pero un
                  rellenador automático de formularios sí lo encuentra y lo
                  llena. Si llega lleno, el servidor rechaza el registro. */}
              <div style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }} aria-hidden="true">
                <label htmlFor="sitio-web-empresa">Sitio web</label>
                <input id="sitio-web-empresa" type="text" tabIndex={-1} autoComplete="off" value={sitioWeb} onChange={(e) => setSitioWeb(e.target.value)} />
              </div>
              <Field label="Nombre del despacho">
                <input
                  className="drx-input"
                  style={inputStyle}
                  value={nombreDespacho}
                  onChange={(e) => setNombreDespacho(e.target.value)}
                  placeholder="Ej: García & Asociados"
                  autoFocus
                />
              </Field>
              <Field label="Tu nombre">
                <input className="drx-input" style={inputStyle} value={nombre} onChange={(e) => setNombre(e.target.value)} />
              </Field>
              <Field label="Correo">
                <input
                  type="email"
                  className="drx-input"
                  style={inputStyle}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Ej: nombre@tudespacho.com"
                />
              </Field>
              <Field label="Contraseña">
                <CampoContrasena valor={contrasena} onChange={setContrasena} />
                <MedidorFuerzaContrasena valor={contrasena} />
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: COLORS.muted, margin: "4px 0 0" }}>
                  Mínimo 10 caracteres, combinando letras y números.
                </p>
              </Field>
              <Field label="Foto de perfil (opcional)">
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <AvatarIniciales nombre={nombre || nombreDespacho} size={44} fotoUrl={fotoPreview} />
                  <label
                    className="drx-btn-ghost"
                    style={{ ...buttonGhost, padding: "8px 14px", fontSize: 12.5, cursor: "pointer" }}
                  >
                    {fotoArchivo ? "Cambiar foto" : "Elegir foto"}
                    <input type="file" accept="image/*" onChange={elegirFoto} style={{ display: "none" }} />
                  </label>
                </div>
              </Field>
            </div>
            {error && <p style={{ color: "#B42318", fontSize: 12.5, marginTop: 10, fontFamily: "Inter, sans-serif" }}>{error}</p>}
            <button
              className="drx-btn-primary drx-cta-shine"
              style={{ ...buttonPrimary, width: "100%", marginTop: 16 }}
              onClick={crearDespacho}
              disabled={enviando || !nombreDespacho.trim() || !nombre.trim() || !email.trim() || !contrasena.trim()}
            >
              {enviando ? "Creando…" : "Crear mi despacho"}
            </button>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: COLORS.muted, marginTop: 14, textAlign: "center" }}>
              ¿Ya tienes cuenta?{" "}
              <button
                onClick={() => cambiarPantalla("login")}
                style={{ background: "none", border: "none", color: COLORS.accentBright, cursor: "pointer", textDecoration: "underline", fontFamily: "Inter, sans-serif", fontSize: 11 }}
              >
                Inicia sesión
              </button>
            </p>
          </div>
        )}

        {pantalla === "registro-enviado" && (
          <div style={{ textAlign: "left" }}>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.muted, margin: "8px 0 16px" }}>
              Te enviamos un correo a <strong>{email}</strong> para confirmar tu cuenta. Ábrelo y confirma; después vuelve aquí e inicia sesión con tu
              correo y contraseña.
            </p>
            <button className="drx-btn-ghost" style={{ ...buttonGhost, width: "100%" }} onClick={() => cambiarPantalla("login")}>
              Ya confirmé, iniciar sesión
            </button>
          </div>
        )}

        {pantalla === "login" && (
          <div style={{ textAlign: "left" }}>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.muted, textAlign: "center", margin: "8px 0 18px" }}>Inicia sesión</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Field label="Correo">
                <input
                  type="email"
                  className="drx-input"
                  style={inputStyle}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && iniciarSesion()}
                  autoFocus
                />
              </Field>
              <Field label="Contraseña">
                <CampoContrasena valor={contrasena} onChange={setContrasena} onEnter={iniciarSesion} autoFocus={!!email} />
              </Field>
            </div>
            {error && <p style={{ color: "#B42318", fontSize: 12.5, marginTop: 10, fontFamily: "Inter, sans-serif" }}>{error}</p>}
            <button
              className="drx-btn-primary drx-cta-shine"
              style={{ ...buttonPrimary, width: "100%", marginTop: 16 }}
              onClick={iniciarSesion}
              disabled={enviando || !email.trim() || !contrasena.trim()}
            >
              {enviando ? "Ingresando…" : "Ingresar"}
            </button>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: COLORS.muted, marginTop: 14, textAlign: "center" }}>
              <button
                onClick={() => cambiarPantalla("recuperar")}
                style={{ background: "none", border: "none", color: COLORS.accentBright, cursor: "pointer", textDecoration: "underline", fontFamily: "Inter, sans-serif", fontSize: 11 }}
              >
                ¿Olvidaste tu contraseña?
              </button>
              <br />
              ¿No tienes acceso? Pídele a tu administrador que te cree un usuario desde "Usuarios y permisos".
              <br />
              ¿Primera vez aquí?{" "}
              <button
                onClick={() => cambiarPantalla("registro")}
                style={{ background: "none", border: "none", color: COLORS.accentBright, cursor: "pointer", textDecoration: "underline", fontFamily: "Inter, sans-serif", fontSize: 11 }}
              >
                Crea tu despacho
              </button>
            </p>
          </div>
        )}

        {pantalla === "verificacion-2fa" && (
          <div style={{ textAlign: "left" }}>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.muted, textAlign: "center", margin: "8px 0 18px" }}>
              Tu contraseña es correcta — ahora ingresa el código de 6 dígitos de tu app autenticadora.
            </p>
            <Field label="Código de verificación">
              <input
                className="drx-input"
                style={{ ...inputStyle, textAlign: "center", fontSize: 22, letterSpacing: 6 }}
                value={codigo2FA}
                onChange={(e) => setCodigo2FA(e.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={(e) => e.key === "Enter" && verificarCodigo2FA()}
                placeholder="000000"
                inputMode="numeric"
                maxLength={6}
                autoFocus
              />
            </Field>
            {error && <p style={{ color: "#B42318", fontSize: 12.5, marginTop: 10, fontFamily: "Inter, sans-serif" }}>{error}</p>}
            <button
              className="drx-btn-primary drx-cta-shine"
              style={{ ...buttonPrimary, width: "100%", marginTop: 16 }}
              onClick={verificarCodigo2FA}
              disabled={enviando || codigo2FA.length !== 6}
            >
              {enviando ? "Verificando…" : "Verificar e ingresar"}
            </button>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: COLORS.muted, marginTop: 14, textAlign: "center" }}>
              <button
                onClick={() => {
                  setPantalla("login");
                  setCodigo2FA("");
                  setError("");
                }}
                style={{ background: "none", border: "none", color: COLORS.accentBright, cursor: "pointer", textDecoration: "underline", fontFamily: "Inter, sans-serif", fontSize: 11 }}
              >
                Volver
              </button>
            </p>
          </div>
        )}

        {pantalla === "recuperar" && (
          <div style={{ textAlign: "left" }}>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.muted, margin: "8px 0 16px" }}>
              Escribe tu correo y te enviamos un enlace para poner una contraseña nueva.
            </p>
            <Field label="Correo">
              <input
                type="email"
                className="drx-input"
                style={inputStyle}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && enviarRecuperacion()}
                autoFocus
              />
            </Field>
            {error && <p style={{ color: "#B42318", fontSize: 12.5, marginTop: 10, fontFamily: "Inter, sans-serif" }}>{error}</p>}
            <button
              className="drx-btn-primary"
              style={{ ...buttonPrimary, width: "100%", marginTop: 16 }}
              onClick={enviarRecuperacion}
              disabled={enviando || !email.trim() || segundosEsperaRecuperacion > 0}
            >
              {segundosEsperaRecuperacion > 0 ? `Espera ${segundosEsperaRecuperacion}s` : enviando ? "Enviando…" : "Enviar enlace de recuperación"}
            </button>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: COLORS.muted, marginTop: 14, textAlign: "center" }}>
              <button
                onClick={() => cambiarPantalla("login")}
                style={{ background: "none", border: "none", color: COLORS.accentBright, cursor: "pointer", textDecoration: "underline", fontFamily: "Inter, sans-serif", fontSize: 11 }}
              >
                Volver a iniciar sesión
              </button>
            </p>
          </div>
        )}

        {pantalla === "recuperacion-enviada" && (
          <div style={{ textAlign: "left" }}>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.muted, margin: "8px 0 16px" }}>
              Listo — si ese correo tiene una cuenta, te llegó un enlace para poner una contraseña nueva. Ábrelo desde el mismo dispositivo y sigue las
              instrucciones.
            </p>
            <button
              className="drx-btn-ghost"
              style={{ ...buttonGhost, width: "100%" }}
              onClick={() => cambiarPantalla("login")}
            >
              Volver a iniciar sesión
            </button>
          </div>
        )}

        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 10.5, color: COLORS.muted, marginTop: 20, lineHeight: 1.5 }}>
          Inicio de sesión real con Supabase Auth: tu contraseña nunca se guarda en texto plano, viaja cifrada y la
          verifica el servidor.
        </p>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
          <SelloVersion oscuro={oscuro} />
        </div>
      </Card>
      </div>
    </div>
  );
}

function EstablecerContrasenaNueva({ onListo }) {
  const { oscuro, alternar } = useTema();
  const [contrasena, setContrasena] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);

  const guardar = async () => {
    if (!contrasena.trim() || contrasena !== confirmacion) return;
    // Mismas 2 verificaciones que al registrar un despacho nuevo (longitud
    // mínima + combinación, y que no esté en una filtración conocida) — sin
    // esto, alguien podía sortear ambas simplemente restableciendo su
    // contraseña en vez de cambiarla al crear la cuenta.
    const errorContrasena = validarContrasenaCliente(contrasena);
    if (errorContrasena) {
      setError(errorContrasena);
      return;
    }
    setEnviando(true);
    setError("");
    if (await contrasenaFiltrada(contrasena)) {
      setError("Esa contraseña ha aparecido en filtraciones de datos conocidas — cualquiera puede probarla. Usa una distinta.");
      setEnviando(false);
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: contrasena });
    setEnviando(false);
    if (updateError) {
      setError(updateError.message?.toLowerCase().includes("password") ? "La contraseña debe tener al menos 10 caracteres, combinando letras y números." : "No pudimos guardar la contraseña. Intenta de nuevo.");
      return;
    }
    setListo(true);
  };

  return (
    <div
      className={`${oscuro ? "drx-tema-oscuro" : "drx-tema-claro"} drx-glow`}
      style={{ minHeight: "100%", background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, position: "relative" }}
    >
      <GlobalStyle />
      <div style={{ position: "absolute", top: 20, right: 20 }}>
        <BotonTema oscuro={oscuro} onClick={alternar} />
      </div>
      <Card style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
        <InsigniaPlataforma grande />
        <h1 style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: COLORS.headingText, margin: "0 0 4px" }}>
          Nueva contraseña
        </h1>
        {listo ? (
          <div style={{ textAlign: "left", marginTop: 16 }}>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.muted, marginBottom: 16 }}>
              Tu contraseña quedó actualizada. Inicia sesión con la nueva.
            </p>
            <button className="drx-btn-primary" style={{ ...buttonPrimary, width: "100%" }} onClick={onListo}>
              Ir a iniciar sesión
            </button>
          </div>
        ) : (
          <div style={{ textAlign: "left", marginTop: 8 }}>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.muted, marginBottom: 16 }}>Escribe tu contraseña nueva.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Field label="Contraseña nueva">
                <CampoContrasena valor={contrasena} onChange={setContrasena} autoFocus />
                <MedidorFuerzaContrasena valor={contrasena} />
              </Field>
              <Field label="Confirmar contraseña">
                <CampoContrasena valor={confirmacion} onChange={setConfirmacion} onEnter={guardar} />
              </Field>
            </div>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: COLORS.muted, margin: "4px 0 0" }}>
              Mínimo 10 caracteres, combinando letras y números.
            </p>
            {confirmacion && contrasena !== confirmacion && (
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "#B42318", marginTop: 8 }}>Las contraseñas no coinciden.</p>
            )}
            {error && <p style={{ color: "#B42318", fontSize: 12.5, marginTop: 10, fontFamily: "Inter, sans-serif" }}>{error}</p>}
            <button
              className="drx-btn-primary"
              style={{ ...buttonPrimary, width: "100%", marginTop: 16 }}
              onClick={guardar}
              disabled={enviando || !contrasena.trim() || contrasena !== confirmacion}
            >
              {enviando ? "Guardando…" : "Guardar contraseña"}
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}

// Marca que se puso justo antes de un inicio de sesión (o registro) real,
// hecho a mano en el formulario — a diferencia de cuando Supabase restaura
// sola una sesión ya existente al abrir o recargar la página, lo cual
// también dispara el evento "SIGNED_IN" pero no es un inicio de sesión
// nuevo. Sin esto, el saludo de voz y el registro de auditoría de "inicio de
// sesión" se repetirían cada vez que se abre la app, no solo al ingresar.
const LLAVE_LOGIN_RECIEN_HECHO = "nomos_login_recien_hecho";

function marcarLoginRecienHecho() {
  try {
    sessionStorage.setItem(LLAVE_LOGIN_RECIEN_HECHO, "1");
  } catch {
    // Si sessionStorage falla, en el peor caso no se saluda ni se
    // registra ese inicio de sesión puntual — no rompe nada.
  }
}

function consumirLoginRecienHecho() {
  try {
    const marcado = sessionStorage.getItem(LLAVE_LOGIN_RECIEN_HECHO) === "1";
    if (marcado) sessionStorage.removeItem(LLAVE_LOGIN_RECIEN_HECHO);
    return marcado;
  } catch {
    return false;
  }
}

// Saludo por voz al iniciar sesión, usando la síntesis de voz que trae el
// navegador (Web Speech API) — sin ningún servicio ni costo externo, nunca
// sale de tu propio computador. Si el navegador no la soporta, simplemente
// no dice nada, sin romper el inicio de sesión.
function saludarPorVoz(nombre) {
  try {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const primerNombre = (nombre || "").trim().split(/\s+/)[0] || "";
    const texto = primerNombre ? `Hola ${primerNombre}, bienvenido a Nomos.` : "Hola, bienvenido a Nomos.";
    const utter = new SpeechSynthesisUtterance(texto);
    const voces = window.speechSynthesis.getVoices();
    const vozEspanol = voces.find((v) => v.lang?.toLowerCase().startsWith("es"));
    if (vozEspanol) utter.voice = vozEspanol;
    utter.lang = vozEspanol?.lang || "es-ES";
    utter.rate = 1;
    window.speechSynthesis.speak(utter);
  } catch {
    // Ver arriba: si algo falla, simplemente no saluda.
  }
}

// Antes, si guardar algo en Supabase fallaba (sin internet, un corte breve,
// etc.), storageSet/storageGet se tragaban el error en silencio y la app
// seguía como si todo hubiera salido bien — el usuario veía "se guardó
// correctamente" aunque el cambio nunca llegó al servidor, y solo se daba
// cuenta días después cuando el dato ya no estaba. Este aviso global
// escucha esos fallos (storage.js los emite como evento) y avisa de una
// vez, para que el usuario sepa que debe revisar su conexión y reintentar.
// Recordatorio discreto de cuánto tiempo de demo queda — sin esto, alguien
// podía llegar al final de la demo sin ninguna señal previa y encontrarse
// la pantalla de "actívate" de sorpresa. Se puede cerrar por esta sesión
// (no para siempre, para que no se olvide del todo). Como la demo dura
// horas y no días, se necesita un contador que se actualice solo mientras
// la pestaña sigue abierta — por eso el setInterval, que antes no hacía
// falta cuando esto medía en días.
function AvisoPruebaGratis({ pruebaHasta }) {
  const [cerrado, setCerrado] = useState(false);
  const [, forzarRender] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forzarRender((n) => n + 1), 60000);
    return () => clearInterval(id);
  }, []);
  if (!pruebaHasta || cerrado) return null;
  const minutosRestantes = Math.ceil((new Date(pruebaHasta).getTime() - Date.now()) / (60 * 1000));
  if (minutosRestantes > 180 || minutosRestantes < 0) return null;
  const urgente = minutosRestantes <= 30;
  const horas = Math.floor(minutosRestantes / 60);
  const minutos = minutosRestantes % 60;
  const textoTiempo = horas > 0 ? `${horas} h ${minutos} min` : `${minutos} min`;
  return (
    <div
      style={{
        position: "sticky", top: 0, zIndex: 50, background: urgente ? "#FEF2F2" : "#FEF3E2",
        borderBottom: `1px solid ${urgente ? "#F2B8B5" : "#FCE3B8"}`,
        padding: "9px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap",
      }}
    >
      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: urgente ? "#B42318" : "#92400E", margin: 0, fontWeight: 600 }}>
        {minutosRestantes <= 1
          ? "Tu demo termina en menos de un minuto."
          : `Te quedan ${textoTiempo} de demo.`}{" "}
        Al vencer verás cómo activar tu plan para seguir usándola sin cortes.
      </p>
      <button
        onClick={() => setCerrado(true)}
        style={{ background: "none", border: "none", cursor: "pointer", color: urgente ? "#B42318" : "#92400E", fontSize: 14, lineHeight: 1, padding: 0 }}
        title="Ocultar por ahora"
      >
        ✕
      </button>
    </div>
  );
}

function AvisoErroresAlmacenamiento() {
  const [aviso, setAviso] = useState("");
  const ultimoRef = useRef(0);

  useEffect(() => {
    const manejar = (e) => {
      const ahora = Date.now();
      if (ahora - ultimoRef.current < 4000) return;
      ultimoRef.current = ahora;
      const mensaje =
        e.detail?.tipo === "set"
          ? "No se pudo guardar tu último cambio. Revisa tu conexión a internet e inténtalo de nuevo."
          : "No se pudieron cargar algunos datos. Revisa tu conexión a internet.";
      setAviso(mensaje);
      setTimeout(() => setAviso(""), 6000);
    };
    window.addEventListener("nomos:error-almacenamiento", manejar);
    return () => window.removeEventListener("nomos:error-almacenamiento", manejar);
  }, []);

  if (!aviso) return null;
  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 4000,
        background: "#B42318",
        color: "#fff",
        padding: "11px 16px 11px 20px",
        borderRadius: 10,
        fontFamily: "Inter, sans-serif",
        fontSize: 13,
        fontWeight: 600,
        boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
        maxWidth: "90vw",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        justifyContent: "center",
      }}
    >
      <span>⚠️ {aviso}</span>
      <button
        onClick={() => window.location.reload()}
        style={{
          background: "rgba(255,255,255,0.18)",
          border: "1px solid rgba(255,255,255,0.4)",
          borderRadius: 7,
          color: "#fff",
          fontFamily: "Inter, sans-serif",
          fontSize: 12.5,
          fontWeight: 700,
          padding: "5px 12px",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        Reintentar
      </button>
    </div>
  );
}

// Avisa cuando se está trabajando sin conexión (o con cambios todavía sin
// subir después de recuperarla) — sin esto, alguien podría creer que ya
// quedó guardado en el despacho cuando en realidad solo está a salvo en
// este dispositivo, esperando a que vuelva la señal para subirse solo.
function IndicadorSincronizacion() {
  const [pendientes, setPendientes] = useState(0);
  const [enLinea, setEnLinea] = useState(typeof navigator === "undefined" ? true : navigator.onLine);

  useEffect(() => {
    let activo = true;
    const revisar = () => contarCambiosSinSincronizar().then((n) => activo && setPendientes(n));
    revisar();
    const dejarDeEscuchar = cambiosSinSincronizar(revisar);
    const alConectar = () => setEnLinea(true);
    const alDesconectar = () => setEnLinea(false);
    window.addEventListener("online", alConectar);
    window.addEventListener("offline", alDesconectar);
    const intervalo = setInterval(revisar, 15000);
    return () => {
      activo = false;
      dejarDeEscuchar();
      window.removeEventListener("online", alConectar);
      window.removeEventListener("offline", alDesconectar);
      clearInterval(intervalo);
    };
  }, []);

  if (enLinea && pendientes === 0) return null;
  const texto = !enLinea
    ? pendientes > 0
      ? `Sin conexión — ${pendientes} cambio${pendientes !== 1 ? "s" : ""} guardado${pendientes !== 1 ? "s" : ""} en este dispositivo, se suben solos al volver`
      : "Sin conexión — lo que registres queda guardado en este dispositivo"
    : `Conectado, subiendo ${pendientes} cambio${pendientes !== 1 ? "s" : ""} pendiente${pendientes !== 1 ? "s" : ""}...`;
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        top: "var(--sat)",
        left: 0,
        right: 0,
        zIndex: 3900,
        background: enLinea ? "#3E7C7C" : "#92400E",
        color: "#fff",
        textAlign: "center",
        padding: "6px 12px",
        fontFamily: "Inter, sans-serif",
        fontSize: 12.5,
        fontWeight: 600,
      }}
    >
      {enLinea ? "🔄" : "📴"} {texto}
    </div>
  );
}

// Red de seguridad ante cualquier error inesperado al dibujar la interfaz
// (dato corrupto, propiedad que no existía, etc.): sin esto, React "desmonta"
// toda la app y el usuario se queda mirando una pantalla en blanco sin ningún
// mensaje ni forma de recuperarse salvo adivinar que debe recargar. Con esto,
// se muestra una pantalla clara con un botón para recargar.
// Compartida entre el ErrorBoundary de toda la app y el de cada pestaña —
// antes esto solo quedaba en la consola de quien lo sufría, y nadie más se
// enteraba. Nunca debe poder tumbar la interfaz: si falla el reporte mismo,
// se ignora en silencio (ver api/errores/registrar.js y Plataforma →
// "Errores recientes de la interfaz").
async function reportarErrorFrontend(error, info, contexto) {
  console.error(`Error no controlado en la interfaz${contexto ? ` (${contexto})` : ""}:`, error, info);
  try {
    // El servidor ya no confía en un despachoId/usuarioId mandado en el
    // cuerpo (cualquiera podría inventar uno) — los deriva él mismo del
    // token de sesión, así que aquí solo hace falta mandarlo si hay uno.
    let token = null;
    try {
      const { data } = await supabase.auth.getSession();
      token = data?.session?.access_token || null;
    } catch (e) {
      // sin sesión o sin red — se reporta igual, sin token
    }
    await fetch("/api/errores/registrar", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        mensaje: `${contexto ? `[${contexto}] ` : ""}${error?.message || String(error)}`,
        pila: error?.stack || "",
        infoComponente: info?.componentStack || "",
        url: typeof window !== "undefined" ? window.location.href : "",
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      }),
    });
  } catch (e) {
    // sin red, endpoint caído, etc. — no hay nada más que hacer aquí.
  }
}

// Envuelve cada pestaña por separado: si una sección se cae por un error
// inesperado, solo esa parte de la pantalla se reemplaza por un aviso — el
// resto de la app (menú, otras pestañas) sigue funcionando en vez de
// quedar toda en blanco esperando un reload completo.
export class TabErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    reportarErrorFrontend(error, info, this.props.nombre);
    // Esta es la ruta más probable por la que llega un chunk viejo después
    // de un despliegue: cada pestaña se carga en su propio "import()"
    // dinámico, así que si falla, quien lo atrapa primero es esta burbuja
    // (no la de toda la app). El botón "Reintentar" normal no serviría de
    // nada aquí — el archivo viejo sigue sin existir hasta que la página
    // completa se recargue y traiga el índice de archivos actualizado.
    if (esErrorDeChunkViejo(error) && !sessionStorage.getItem(LLAVE_RECARGA_CHUNK)) {
      sessionStorage.setItem(LLAVE_RECARGA_CHUNK, "1");
      window.location.reload();
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            background: "#FEF2F2",
            border: "1px solid #F3C6C0",
            borderRadius: 12,
            padding: 24,
            textAlign: "center",
            fontFamily: "Inter, sans-serif",
          }}
        >
          <p style={{ fontSize: 28, margin: 0 }}>⚠️</p>
          <p style={{ fontSize: 15, fontWeight: 700, color: "#11213A", margin: "8px 0 4px" }}>Esta sección tuvo un problema</p>
          <p style={{ fontSize: 13, color: "#4C5A6B", margin: "0 0 14px" }}>
            El resto de Nomos sigue funcionando — puedes cambiar de pestaña con normalidad. Tus datos guardados están a salvo.
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 700,
              fontSize: 13,
              padding: "8px 18px",
              borderRadius: 10,
              border: "none",
              background: "#3E7C7C",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Mismo patrón que en main.jsx para "vite:preloadError", pero aquí como red
// de respaldo: si una falla de carga de un chunk viejo después de un
// despliegue llega como una excepción de React en vez de disparar ese
// evento de Vite (pasa en algunos navegadores/casos), igual se recarga
// sola una vez en lugar de mostrarle al usuario la pantalla de error.
const LLAVE_RECARGA_CHUNK = "nomos-recarga-por-chunk";
function esErrorDeChunkViejo(error) {
  const msg = String(error?.message || "");
  return /dynamically imported module|Failed to fetch dynamically|Loading chunk|loading dynamically imported module|Importing a module script failed/i.test(msg);
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    reportarErrorFrontend(error, info, "");
    if (esErrorDeChunkViejo(error) && !sessionStorage.getItem(LLAVE_RECARGA_CHUNK)) {
      sessionStorage.setItem(LLAVE_RECARGA_CHUNK, "1");
      window.location.reload();
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: 32,
            textAlign: "center",
            fontFamily: "Inter, sans-serif",
            background: "#F7F8FA",
          }}
        >
          <p style={{ fontSize: 40, margin: 0 }}>⚠️</p>
          <p style={{ fontSize: 18, fontWeight: 700, color: "#11213A", margin: 0 }}>Algo salió mal</p>
          <p style={{ fontSize: 13.5, color: "#4C5A6B", margin: 0, maxWidth: 420 }}>
            La aplicación tuvo un error inesperado. Tus datos guardados están a salvo — solo hay que recargar la página para
            continuar.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 700,
              fontSize: 13.5,
              padding: "10px 22px",
              borderRadius: 10,
              border: "none",
              background: "#3E7C7C",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Recargar página
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// "inicio" lo manda main.jsx cuando se llega al panel desde la landing liviana
// ("login" o "registro"): se abre directo esa pantalla en vez de la landing.
export default function AppConErrorBoundary({ inicio } = {}) {
  return (
    <ErrorBoundary>
      <App inicio={inicio} />
    </ErrorBoundary>
  );
}

function App({ inicio }) {

  const isFirmaView = typeof window !== "undefined" && window.location.hash.replace("#", "") === "firmar";
  const isPortalView = typeof window !== "undefined" && window.location.hash.replace("#", "") === "portal";
  const isPrivacidadView = typeof window !== "undefined" && window.location.hash.replace("#", "") === "privacidad";
  const isTerminosView = typeof window !== "undefined" && window.location.hash.replace("#", "") === "terminos";
  const isDiagnosticoView = typeof window !== "undefined" && window.location.hash.replace("#", "") === "diagnostico";
  const [modoPublico, setModoPublico] = useState(isFirmaView);
  const [modoPortal, setModoPortal] = useState(isPortalView);
  const [usuarioActual, setUsuarioActual] = useState(null);
  // Copia del usuario actual que se puede leer dentro de callbacks sin
  // volver a crearlos (ver cargarPerfilActual y onAuthStateChange).
  const usuarioActualRef = useRef(null);
  usuarioActualRef.current = usuarioActual;
  const [ultimaSesionAnterior, setUltimaSesionAnterior] = useState(null);
  const [sesionCargada, setSesionCargada] = useState(false);
  const [errorCargaPerfil, setErrorCargaPerfil] = useState(null);
  const [cambiandoUsuario, setCambiandoUsuario] = useState(false);
  // Si venimos de vuelta de conectar Google Calendar (ver AgendaTab), el
  // navegador nos trae con el hash "#agenda?google=conectado" — se arranca
  // ya en esa pestaña en vez del Resumen de siempre, para no perder al
  // usuario justo después de autorizar.
  const [tab, setTab] = useState(() =>
    typeof window !== "undefined" && window.location.hash.replace("#", "").startsWith("agenda") ? "agenda" : "resumen"
  );
  // Con la precarga en hover, el chunk de casi cualquier pestaña ya está en
  // caché para cuando se hace clic, así que la pantalla de carga con el
  // logo (CargandoSeccion) casi nunca se alcanzaba a ver — pero eso no
  // significa que los DATOS de esa pestaña (la lista de clientes, de
  // documentos, etc.) ya estén listos: esos se piden aparte, adentro de
  // cada pestaña, y antes se veía la pantalla vacía/poblándose de a poco
  // justo después del salto.
  //
  // La pestaña nueva se monta de una (para que arranque a pedir sus datos),
  // pero queda oculta con CSS y encima se ve CargandoSeccion, hasta que se
  // cumplen DOS cosas: un mínimo de ~350ms (para que no sea un parpadeo
  // cuando todo ya estaba listo) y que la pestaña avise "onListo" (sus
  // datos ya cargaron). Un tope de seguridad de 6s evita quedarse pegado en
  // carga para siempre si alguna pestaña no llega a avisar. El menú
  // lateral resalta la pestaña elegida al instante — solo el contenido de
  // la derecha espera.
  const [cambiandoTab, setCambiandoTab] = useState(false);
  const minimoListoRef = useRef(true);
  const datosListosRef = useRef(true);
  useEffect(() => {
    setCambiandoTab(true);
    minimoListoRef.current = false;
    datosListosRef.current = false;
    const minimo = setTimeout(() => {
      minimoListoRef.current = true;
      if (datosListosRef.current) setCambiandoTab(false);
    }, 350);
    const tope = setTimeout(() => {
      datosListosRef.current = true;
      setCambiandoTab(false);
    }, 6000);
    return () => {
      clearTimeout(minimo);
      clearTimeout(tope);
    };
  }, [tab]);
  const marcarDatosListos = useCallback(() => {
    datosListosRef.current = true;
    if (minimoListoRef.current) setCambiandoTab(false);
  }, []);
  // "Conectado ahora" (solo lo ve el superadministrador, en Plataforma): un
  // indicador liviano de presencia — si la app está abierta ahora mismo y en
  // qué pestaña, nada de qué escribe ni sus datos. Se actualiza al cambiar
  // de pestaña y cada 60s mientras la pestaña del navegador sigue visible
  // (para que "conectado ahora" no dependa de seguir haciendo clic). No
  // corre en el modo público de firma ni en el portal del cliente — ahí no
  // hay una sesión de despacho que reportar.
  useEffect(() => {
    if (!usuarioActual?.id || modoPublico || modoPortal) return;
    const latir = () => {
      supabase.from("perfiles").update({ ultima_actividad_en: new Date().toISOString(), pestana_actual: tab }).eq("id", usuarioActual.id).then(() => {});
    };
    latir();
    const intervalo = setInterval(() => {
      if (document.visibilityState === "visible") latir();
    }, 60000);
    return () => clearInterval(intervalo);
  }, [tab, usuarioActual?.id, modoPublico, modoPortal]);
  // Cada pestaña (menos Resumen) se carga con React.lazy para no meter todo
  // el código de la app en un solo bundle — el costo es que la primera vez
  // que alguien la abre hay un mini-salto mientras descarga su chunk. Al
  // precargar el chunk apenas el mouse pasa por el botón (antes de hacer
  // clic), para cuando el clic llega el chunk ya está en caché y el cambio
  // de pestaña se siente instantáneo. import() repetido no vuelve a pedir
  // nada por red si ya está en caché, así que esto no tiene costo si al
  // final no se hace clic.
  const PRECARGA_TAB = {
    contabilidad: () => import("./tabs/ContabilidadTab.jsx"),
    calculadora: () => import("./tabs/CalculadoraTab.jsx"),
    agenda: () => import("./tabs/AgendaTab.jsx"),
    clientes: () => import("./tabs/ClientesTab.jsx"),
    vigilancia: () => import("./tabs/VigilanciaTab.jsx"),
    antecedentes: () => import("./tabs/AntecedentesTab.jsx"),
    reportes: () => import("./tabs/ReportesTab.jsx"),
    contenido: () => import("./tabs/ContenidoTab.jsx"),
    documentos: () => import("./tabs/DocumentosTab.jsx"),
    plataforma: () => import("./tabs/PlataformaTab.jsx"),
    usuarios: () => import("./tabs/UsuariosPermisosTab.jsx"),
  };
  const precargarTab = (nombreTab) => PRECARGA_TAB[nombreTab]?.();
  const [mostrarNotificaciones, setMostrarNotificaciones] = useState(false);
  const [sidebarMovilAbierta, setSidebarMovilAbierta] = useState(false);
  const [mostrarSeguridad2FA, setMostrarSeguridad2FA] = useState(false);
  const [mostrarMiDespacho, setMostrarMiDespacho] = useState(false);
  const [fotoPerfilUrl, setFotoPerfilUrl] = useState("");
  const [subiendoFotoPerfil, setSubiendoFotoPerfil] = useState(false);
  // Atajo directo desde la tarjeta de un cliente en Clientes hasta el
  // formulario de "Registrar pago" en Contabilidad, con ese cliente ya
  // elegido — sin esto había que memorizar el nombre, cambiar de pestaña y
  // volver a buscarlo en el desplegable. Declarado aquí arriba (no más abajo,
  // junto a irARegistrarPago) porque después de esta sección hay un "return"
  // condicional (despacho pendiente de activar) — un hook declarado después
  // de ese return se salta en esa rama y React pierde la cuenta de hooks
  // entre un render y otro, lo que tumba toda la app justo al terminar de
  // cargar el perfil tras el login.
  const [clienteParaPago, setClienteParaPago] = useState(null);
  useAgendaRecordatorios();

  // La ruta del archivo se guarda en perfiles.foto_url; el bucket es
  // privado, así que hay que descargarlo y armar una URL local (blob:) cada
  // vez que cambia — no se puede simplemente usar la ruta como src.
  useEffect(() => {
    let cancelado = false;
    let urlCreada = "";
    if (!usuarioActual?.foto_url) {
      setFotoPerfilUrl("");
      return;
    }
    obtenerUrlFotoPerfil(usuarioActual.foto_url)
      .then((url) => {
        if (cancelado) return;
        urlCreada = url;
        setFotoPerfilUrl(url || "");
      })
      .catch(() => {});
    return () => {
      cancelado = true;
      if (urlCreada) URL.revokeObjectURL(urlCreada);
    };
  }, [usuarioActual?.foto_url]);

  const cambiarFotoPerfil = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo || !usuarioActual) return;
    if (archivoDemasiadoGrande(archivo)) {
      alert(`La foto no puede pesar más de ${TAMANO_MAX_ARCHIVO_MB} MB.`);
      return;
    }
    if (!(await archivoEsImagenValida(archivo))) {
      alert("Ese archivo no es una imagen válida (o es un formato no admitido, como SVG). Prueba con un JPG o PNG.");
      return;
    }
    setSubiendoFotoPerfil(true);
    try {
      const ruta = await subirFotoPerfil(usuarioActual.id, archivo);
      const { error } = await supabase.from("perfiles").update({ foto_url: ruta }).eq("id", usuarioActual.id);
      if (error) throw error;
      setUsuarioActual((prev) => (prev ? { ...prev, foto_url: ruta } : prev));
    } catch (err) {
      alert("No se pudo actualizar la foto de perfil. Intenta de nuevo.");
    }
    setSubiendoFotoPerfil(false);
  };

  // La app scrollea con la página completa (no hay un contenedor interno
  // aparte por sección) — sin esto, si venías scrolleado hacia abajo en una
  // pestaña y cambiabas a otra, te quedabas en la misma posición en vez de
  // empezar arriba, lo que se sentía como que la pantalla "saltaba" sola.
  useEffect(() => {
    window.scrollTo(0, 0);
    setSidebarMovilAbierta(false);
  }, [tab]);

  // En móvil el menú lateral es un cajón fijo encima de la página. Sin esto,
  // al hacer scroll con el dedo dentro del cajón, el gesto "se pasaba" y
  // también movía la página de fondo (todo el panel parecía temblar/moverse
  // en vez de quedarse fijo mientras solo el contenido de la derecha scrollea).
  useEffect(() => {
    if (sidebarMovilAbierta) {
      const previo = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previo;
      };
    }
  }, [sidebarMovilAbierta]);
  const {
    count: notificaciones,
    firmasNuevas,
    clientesInactivos,
    pagosPendientes,
    contenidoPendiente,
    contenidoVencido,
    novedadesJudiciales,
    clientesSinRadicado,
    clientesSinPago,
    tareasAviso,
    marcarFirmasVistas,
  } = useNotificacionesPanel(usuarioActual?.notificaciones);

  // Título de la pestaña del navegador con el número de pendientes, al
  // estilo Gmail — así se nota algo nuevo sin tener que tener la pestaña de
  // Nomos abierta y a la vista todo el tiempo.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title = usuarioActual && notificaciones > 0 ? `(${notificaciones}) Nomos — Panel` : "Nomos — Gestión legal";
  }, [notificaciones, usuarioActual]);
  const { oscuro, alternar } = useTema();

  const [modoRecuperacion, setModoRecuperacion] = useState(false);
  const [mostrarLanding, setMostrarLanding] = useState(!inicio && !isFirmaView && !isPortalView);
  const [pantallaLoginInicial, setPantallaLoginInicial] = useState(inicio === "registro" ? "registro" : "login");

  const cargarPerfilActual = useCallback(async (registrarLogin) => {
    const {
      data: { user },
      error: errorUsuario,
    } = await supabase.auth.getUser();
    // Al volver a la pestaña tras un rato (computador o celular que se
    // despierta), la conexión suele tardar un segundo en volver: getUser
    // falla por red aunque la sesión siga vigente. Antes eso se trataba
    // como "sin sesión" y sacaba al usuario a la pantalla de ingreso,
    // perdiendo lo que estaba haciendo. Si ya había alguien adentro y el
    // error no es de sesión, se deja todo como estaba.
    const yaHabiaUsuario = !!usuarioActualRef.current;
    if (!user && yaHabiaUsuario && errorUsuario && errorUsuario.name !== "AuthSessionMissingError" && errorUsuario.status !== 401 && errorUsuario.status !== 403) {
      return;
    }
    if (!user) {
      setDespachoActual(null);
      setUsuarioActual(null);
      return;
    }
    // Primero con las columnas del vencimiento mensual y el cobro automático
    // (supabase/schema.sql más reciente); si la base todavía no las tiene,
    // se cae a las versiones anteriores en vez de dejar a todos afuera.
    let { data: perfil, error: errorPerfil } = await supabase
      .from("perfiles")
      .select("*, despachos(nombre, activo, prueba_hasta, pago_reportado_en, logo_ruta, celular, pagado_hasta, plan, cobro_automatico, wompi_tarjeta, cobro_auto_error)")
      .eq("id", user.id)
      .maybeSingle();
    if (errorPerfil) {
      const reintentoLogo = await supabase
        .from("perfiles")
        .select("*, despachos(nombre, activo, prueba_hasta, pago_reportado_en, logo_ruta, celular)")
        .eq("id", user.id)
        .maybeSingle();
      perfil = reintentoLogo.data;
      errorPerfil = reintentoLogo.error;
    }
    if (errorPerfil) {
      // Si el despacho todavía no corrió la migración más reciente de
      // supabase/schema.sql (la que agrega logo_ruta/celular a despachos),
      // el select de arriba falla ENTERO con "column does not exist" —
      // aunque el resto del perfil sí exista, nadie de ese despacho podía
      // iniciar sesión hasta correr el SQL. Mejor reintentar sin esas dos
      // columnas (el logo propio y el celular del despacho simplemente no
      // cargan todavía) que dejar a todo el despacho fuera por columnas
      // opcionales.
      const reintento = await supabase
        .from("perfiles")
        .select("*, despachos(nombre, activo, prueba_hasta, pago_reportado_en)")
        .eq("id", user.id)
        .maybeSingle();
      perfil = reintento.data;
      errorPerfil = reintento.error;
    }
    if (errorPerfil && usuarioActualRef.current?.id === user.id) {
      // Recarga en segundo plano que falló (red caída un momento): se
      // conserva el perfil que ya estaba cargado en vez de sacar al usuario.
      console.error("No se pudo refrescar el perfil (se conserva el actual):", errorPerfil);
      return;
    }
    if (errorPerfil) {
      // Si esto falla en silencio (p. ej. porque la base de datos no tiene
      // todavía una columna que el código ya espera, como prueba_hasta /
      // pago_reportado_en tras una migración que no se corrió), el usuario
      // se queda viendo la pantalla de login sin ninguna pista de qué pasó.
      // Mejor mostrar el error real y dejar que reintente, que fallar mudo.
      console.error("Error cargando el perfil:", errorPerfil);
      setDespachoActual(null);
      setUsuarioActual(null);
      setErrorCargaPerfil(errorPerfil.message || "No se pudo cargar tu perfil.");
      return;
    }
    setErrorCargaPerfil(null);
    // Red de seguridad para una sesión de prueba que sigue abierta cuando
    // vence — el corte "de verdad" (que muestra el mensaje) pasa en
    // iniciarSesion, este solo evita que se quede adentro del panel.
    if (perfil?.expira_en && new Date(perfil.expira_en).getTime() <= Date.now()) {
      await supabase.auth.signOut();
      setDespachoActual(null);
      setUsuarioActual(null);
      return;
    }
    setDespachoActual(perfil?.despacho_id || null, perfil?.despachos?.nombre || "", perfil?.despachos?.logo_ruta || null, perfil?.despachos?.celular || "");
    setUsuarioAgenda(user.id, perfil?.rol === "Administrador");
    if (perfil?.despacho_id) iniciarSincronizacionOffline();
    // Un despacho nace "activo" con una demo de 3 horas (prueba_hasta) — si
    // esa fecha ya pasó y nadie lo activó de verdad (lo que limpia
    // prueba_hasta, ver api/plataforma/despachos.js), vuelve a tratarse como
    // pendiente de activar aunque el flag "activo" siga en true.
    const pruebaVencida = perfil?.despachos?.prueba_hasta && new Date(perfil.despachos.prueba_hasta).getTime() <= Date.now();
    // Vencimiento mensual: cada pago extiende pagado_hasta un mes; pasados
    // DIAS_GRACIA_PLAN días sin pago, el despacho vuelve a verse como
    // pendiente de activar. Sin fecha (despachos activados antes de esto) no
    // vence.
    const pagadoHasta = perfil?.despachos?.pagado_hasta || null;
    const planVencido = !!pagadoHasta && new Date(pagadoHasta).getTime() + DIAS_GRACIA_PLAN * 86400000 <= Date.now();
    const usuario = perfil
      ? {
          ...perfil,
          email: user.email,
          despachoNombre: perfil.despachos?.nombre || "",
          despachoActivo: perfil.despachos?.activo !== false && !pruebaVencida && !planVencido,
          pruebaHasta: perfil.despachos?.prueba_hasta || null,
          pagoReportadoEn: perfil.despachos?.pago_reportado_en || null,
          pagadoHasta,
          planVencido,
          planNomos: perfil.despachos?.plan || null,
          cobroAutomatico: !!perfil.despachos?.cobro_automatico,
          wompiTarjeta: perfil.despachos?.wompi_tarjeta || null,
          cobroAutoError: perfil.despachos?.cobro_auto_error || null,
        }
      : null;
    setUsuarioActual(usuario);
    if (registrarLogin && usuario && consumirLoginRecienHecho()) {
      // Antes de registrar ESTE inicio de sesión, buscamos cuál fue el
      // anterior — para poder avisarle "tu última sesión fue el ..." y que
      // note si alguien más entró con su cuenta sin que fuera él.
      const { data: sesionesPrevias } = await supabase
        .from("auditoria")
        .select("creado_en")
        .eq("usuario_id", usuario.id)
        .eq("accion", "inicio_sesion")
        .order("creado_en", { ascending: false })
        .limit(1);
      if (sesionesPrevias?.[0]?.creado_en) setUltimaSesionAnterior(sesionesPrevias[0].creado_en);
      registrarAuditoria(usuario, "inicio_sesion", "sesion", null, {});
      saludarPorVoz(usuario.nombre);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await cargarPerfilActual(false);
      setSesionCargada(true);
    })();
    const { data: suscripcion } = supabase.auth.onAuthStateChange((event, sesion) => {
      if (event === "PASSWORD_RECOVERY") {
        setModoRecuperacion(true);
        return;
      }
      // Supabase renueva el token solo y, en varias versiones, vuelve a
      // emitir "SIGNED_IN" cada vez que la pestaña recupera el foco. Recargar
      // el perfil en cada uno de esos eventos rehacía el panel y, si la red
      // fallaba justo ahí, sacaba al usuario. Solo se recarga cuando de
      // verdad cambia la sesión: salida, cambio de datos del usuario, o un
      // ingreso de alguien distinto al que ya está adentro.
      if (event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") return;
      if (event === "SIGNED_IN" && sesion?.user?.id && sesion.user.id === usuarioActualRef.current?.id) return;
      cargarPerfilActual(event === "SIGNED_IN");
    });
    return () => suscripcion.subscription.unsubscribe();
  }, [cargarPerfilActual]);

  // Revisa cada 30s si el acceso de prueba con el que se inició sesión ya
  // venció (ver PanelAccesoPrueba) — así no hay que esperar a un refresh
  // para que se corte, mientras dure la sesión abierta.
  useEffect(() => {
    if (!usuarioActual?.expira_en) return;
    const intervalo = setInterval(() => {
      if (new Date(usuarioActual.expira_en).getTime() <= Date.now()) cargarPerfilActual(false);
    }, 30 * 1000);
    return () => clearInterval(intervalo);
  }, [usuarioActual?.expira_en, cargarPerfilActual]);

  const iniciarSesion = () => {
    setCambiandoUsuario(false);
  };

  const cerrarSesion = useCallback(async () => {
    await supabase.auth.signOut();
    setCambiandoUsuario(false);
  }, []);

  const [avisoPagoWompi, setAvisoPagoWompi] = useConfirmacionPagoWompi(usuarioActual, () => cargarPerfilActual(false));
  const [avisoInactividad, setAvisoInactividad] = useState(false);
  useCierreSesionPorInactividad(!!usuarioActual && !modoPublico && !modoPortal, cerrarSesion, setAvisoInactividad);

  if (modoPublico) {
    return (
      <div style={{ background: COLORS.bg, minHeight: "100%" }}>
        <GlobalStyle />
        <Suspense fallback={<CargandoSeccion />}>
          <VistaFirma />
        </Suspense>
        <p style={{ textAlign: "center", paddingBottom: 24 }}>
          <button
            onClick={() => setModoPublico(false)}
            style={{ background: "none", border: "none", color: COLORS.muted, textDecoration: "underline", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: 12 }}
          >
            Volver al panel del despacho
          </button>
        </p>
      </div>
    );
  }

  if (modoPortal) {
    return (
      <div style={{ background: COLORS.bg, minHeight: "100%" }}>
        <GlobalStyle />
        <Suspense fallback={<CargandoSeccion />}>
          <VistaPortalCliente />
        </Suspense>
        <p style={{ textAlign: "center", paddingBottom: 24 }}>
          <button
            onClick={() => setModoPortal(false)}
            style={{ background: "none", border: "none", color: COLORS.muted, textDecoration: "underline", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: 12 }}
          >
            Volver al panel del despacho
          </button>
        </p>
      </div>
    );
  }

  if (isPrivacidadView) {
    return (
      <Suspense fallback={<PantallaCargaInicial />}>
        <PoliticaPrivacidad />
      </Suspense>
    );
  }

  if (isTerminosView) {
    return (
      <Suspense fallback={<PantallaCargaInicial />}>
        <TerminosUso />
      </Suspense>
    );
  }

  if (isDiagnosticoView) {
    return (
      <Suspense fallback={<PantallaCargaInicial />}>
        <VistaDiagnostico />
      </Suspense>
    );
  }

  // Recorrido guiado obligatorio para usuarios creados desde que existe
  // (no se les impone a quienes ya venían usando Nomos). Se marca como hecho
  // en la base (por usuario) y en el navegador; ?recorrido=1 lo fuerza para
  // revisarlo.
  const [mostrarRecorrido, setMostrarRecorrido] = useState(false);
  const [menuPref, guardarMenuPref] = useMenuPersonalizado(usuarioActual?.id);
  useEffect(() => {
    const id = usuarioActual?.id;
    if (!id) return;
    const forzado = new URLSearchParams(window.location.search).get("recorrido") === "1";
    if (!forzado && (usuarioActual?.es_superadmin || !usuarioActual?.creado_en || usuarioActual?.creado_en < FECHA_INICIO_RECORRIDO)) return;
    const llave = `recorrido-completado:${id}`;
    if (!forzado) {
      try {
        if (localStorage.getItem(llave)) return;
      } catch {
        // sin localStorage se consulta solo la base
      }
    }
    let cancelado = false;
    (forzado ? Promise.resolve(null) : storageGet(llave)).then((hecho) => {
      if (!cancelado && !hecho) setMostrarRecorrido(true);
    });
    return () => {
      cancelado = true;
    };
  }, [usuarioActual?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const terminarRecorrido = () => {
    const llave = `recorrido-completado:${usuarioActual.id}`;
    try {
      localStorage.setItem(llave, "1");
    } catch {
      // se guarda igual en la base
    }
    storageSet(llave, new Date().toISOString());
    setMostrarRecorrido(false);
    setTab("resumen");
  };

  if (!sesionCargada) {
    return (
      <>
        <GlobalStyle />
        <PantallaCargaInicial />
      </>
    );
  }

  if (modoRecuperacion) {
    return (
      <EstablecerContrasenaNueva
        onListo={async () => {
          await supabase.auth.signOut();
          setModoRecuperacion(false);
        }}
      />
    );
  }

  if (!usuarioActual && mostrarLanding) {
    return (
      <Suspense fallback={<PantallaCargaInicial />}>
        <LandingPage
          onRegistrar={() => {
            setPantallaLoginInicial("registro");
            setMostrarLanding(false);
          }}
          onIniciarSesion={() => {
            setPantallaLoginInicial("login");
            setMostrarLanding(false);
          }}
        />
      </Suspense>
    );
  }

  if (!usuarioActual || cambiandoUsuario) {
    return (
      <LoginGate
        onIngresar={iniciarSesion}
        onCancelar={usuarioActual ? () => setCambiandoUsuario(false) : () => setMostrarLanding(true)}
        pantallaInicial={pantallaLoginInicial}
        errorExterno={errorCargaPerfil}
      />
    );
  }

  if (!usuarioActual.despachoActivo && !usuarioActual.es_superadmin) {
    return <PantallaPendienteActivacion usuarioActual={usuarioActual} onCerrarSesion={cerrarSesion} avisoPago={avisoPagoWompi} onCerrarAvisoPago={() => setAvisoPagoWompi(null)} />;
  }

  const irATareas = () => {
    setTab("resumen");
    setMostrarNotificaciones(false);
  };
  const irADocumentos = () => {
    setTab("documentos");
    setMostrarNotificaciones(false);
  };
  const irAClientes = () => {
    setTab("clientes");
    setMostrarNotificaciones(false);
  };
  const irAContenido = () => {
    setTab("contenido");
    setMostrarNotificaciones(false);
  };
  const irAVigilancia = () => {
    setTab("vigilancia");
    setMostrarNotificaciones(false);
  };
  const irAContabilidad = () => {
    setTab("contabilidad");
    setMostrarNotificaciones(false);
  };
  const irARegistrarPago = (clienteId) => {
    setClienteParaPago(clienteId);
    setTab("contabilidad");
  };

  const puedeVer = (seccionId) => {
    if (usuarioActual.rol === "Administrador") return true;
    const permisos = usuarioActual.permisos || permisosPorDefecto(usuarioActual.rol);
    return permisos[seccionId] !== false;
  };


  return (
    <div className={`drx-app-shell ${oscuro ? "drx-tema-oscuro" : "drx-tema-claro"}`} style={{ background: COLORS.bg, minHeight: "100%", display: "flex" }}>
      <GlobalStyle />
      <TexturaGrano />
      {mostrarRecorrido && (
        <RecorridoGuiado
          pasos={construirPasosRecorrido({ puedeVer, esAdmin: usuarioActual.rol === "Administrador", nombre: usuarioActual.nombre })}
          onIrSeccion={setTab}
          onTerminar={terminarRecorrido}
        />
      )}
      <AvisoErroresAlmacenamiento />
      <IndicadorSincronizacion />
      <AvisoPruebaGratis pruebaHasta={usuarioActual.pruebaHasta} />
      <AvisoPagoWompi aviso={avisoPagoWompi} onCerrar={() => setAvisoPagoWompi(null)} />
      {!usuarioActual.es_superadmin && <AvisoPlanPorVencer usuarioActual={usuarioActual} />}
      <div
        className={`drx-sidebar-overlay${sidebarMovilAbierta ? " drx-sidebar-abierta" : ""}`}
        onClick={() => setSidebarMovilAbierta(false)}
      />

      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          top: "-60px",
          left: "calc(250px + 15%)",
          width: 460,
          height: 460,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(22,163,74,${oscuro ? 0.28 : 0.16}) 0%, rgba(22,163,74,0) 70%)`,
          animation: "drx-mesh 14s ease-in-out infinite",
          pointerEvents: "none",
          zIndex: 0,
          transition: "background 0.3s ease",
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          top: "6%",
          right: "10%",
          width: 320,
          height: 320,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(20,184,166,${oscuro ? 0.24 : 0.14}) 0%, rgba(20,184,166,0) 70%)`,
          animation: "drx-mesh 18s ease-in-out infinite reverse",
          pointerEvents: "none",
          zIndex: 0,
          transition: "background 0.3s ease",
        }}
      />

      <div
        className={`drx-sidebar${sidebarMovilAbierta ? " drx-sidebar-abierta" : ""}`}
        style={{
          width: 250,
          flexShrink: 0,
          background: `linear-gradient(180deg, ${COLORS.navy} 0%, #052a20 100%)`,
          borderRight: `3px solid ${COLORS.accentBright}`,
          display: "flex",
          flexDirection: "column",
          padding: "24px 16px",
          position: "sticky",
          top: 0,
          height: "calc(100vh - var(--sat) - var(--sab))",
          overflowY: "auto",
          zIndex: 1,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "4px 6px 20px", marginBottom: 20, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.navy, flexShrink: 0 }}>
              <IconoNomos size={22} />
            </div>
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: 20, fontWeight: 800, letterSpacing: 1.5, color: "#FFFFFF", lineHeight: 1 }}>Nomos</span>
          </div>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: "#D7E2F1", margin: 0, lineHeight: 1.15, textAlign: "center" }}>
            {getNombreDespacho()}
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
          {puedeVer("resumen") && (
            <SidebarButton tour="resumen" active={tab === "resumen"} onClick={() => setTab("resumen")} color="#2F80ED" icono="resumen">
              Resumen
            </SidebarButton>
          )}
          {ordenarMenu(menuPref)
            .filter((m) => puedeVer(m.id) && !(menuPref.ocultas || []).includes(m.id))
            .map((m) => (
              <SidebarButton
                key={m.id}
                tour={m.id}
                active={tab === m.id}
                onClick={m.id === "documentos" ? irADocumentos : () => setTab(m.id)}
                onMouseEnter={() => precargarTab(m.id)}
                color={m.color}
                icono={m.id}
              >
                {m.nombre}
              </SidebarButton>
            ))}
          {usuarioActual.rol === "Administrador" && (
            <SidebarButton tour="usuarios" active={tab === "usuarios"} onClick={() => setTab("usuarios")} onMouseEnter={() => precargarTab("usuarios")} color="#6B7480" icono="usuarios">
              Usuarios y permisos
            </SidebarButton>
          )}
          {usuarioActual.es_superadmin && (
            <SidebarButton tour="plataforma" active={tab === "plataforma"} onClick={() => setTab("plataforma")} onMouseEnter={() => precargarTab("plataforma")} color="#DC2626" icono="usuarios">
              Plataforma
            </SidebarButton>
          )}
        </div>

        <div style={{ borderTop: "1px solid #3A5A82", paddingTop: 14, marginTop: 14 }}>
          <button
            onClick={() => setMostrarMiDespacho(true)}
            title="Ver mi perfil"
            style={{
              background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left",
              display: "flex", alignItems: "center", gap: 10, marginBottom: 10, width: "100%",
            }}
          >
            <AvatarIniciales nombre={usuarioActual.nombre} fotoUrl={fotoPerfilUrl} />
            <div>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 10.5, fontWeight: 700, color: "#9FB6D6", textTransform: "uppercase", letterSpacing: 0.4, margin: 0 }}>Mi perfil</p>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: "#FFFFFF", fontWeight: 700, margin: "1px 0 0" }}>{usuarioActual.nombre}</p>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: "#9FB6D6", margin: 0 }}>{usuarioActual.rol}</p>
            </div>
          </button>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button
              onClick={() => setCambiandoUsuario(true)}
              style={{ background: "none", border: "none", color: "#9FB6D6", fontSize: 11.5, cursor: "pointer", fontFamily: "Inter, sans-serif", textDecoration: "underline" }}
            >
              Cambiar de usuario
            </button>
            <button
              onClick={() => setMostrarSeguridad2FA(true)}
              style={{ background: "none", border: "none", color: "#9FB6D6", fontSize: 11.5, cursor: "pointer", fontFamily: "Inter, sans-serif", textDecoration: "underline" }}
            >
              Seguridad
            </button>
            <button
              onClick={cerrarSesion}
              style={{ background: "none", border: "none", color: "#9FB6D6", fontSize: 11.5, cursor: "pointer", fontFamily: "Inter, sans-serif", textDecoration: "underline" }}
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
      {mostrarSeguridad2FA && <PanelSeguridad2FA onCerrar={() => setMostrarSeguridad2FA(false)} />}
      {mostrarMiDespacho && (
        <PanelMiDespacho
          usuarioActual={usuarioActual}
          fotoPerfilUrl={fotoPerfilUrl}
          subiendoFotoPerfil={subiendoFotoPerfil}
          cambiarFotoPerfil={cambiarFotoPerfil}
          onCerrar={() => setMostrarMiDespacho(false)}
          menuPref={menuPref}
          onGuardarMenu={guardarMenuPref}
          puedeVer={puedeVer}
          onDespachoRenombrado={(nuevoNombre) => setUsuarioActual((prev) => (prev ? { ...prev, despachoNombre: nuevoNombre } : prev))}
        />
      )}

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", position: "relative", zIndex: 1 }}>
        <div
          className="drx-topbar"
          style={{
            background: COLORS.panel,
            borderBottom: `1px solid ${COLORS.border}`,
            boxShadow: "0 2px 10px rgba(11,61,46,0.04)",
            padding: "16px 28px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            position: "sticky",
            top: 0,
            zIndex: 20,
          }}
        >
          <div
            key={tab}
            className="drx-barra-progreso"
            aria-hidden="true"
            style={{ position: "absolute", bottom: -1, left: 0, height: 2, background: COLORS.accentBright }}
          />
          <button
            className="drx-btn-hamburguesa"
            onClick={() => setSidebarMovilAbierta((v) => !v)}
            title="Menú"
            aria-label="Abrir menú"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <BuscadorGlobal onIr={setTab} />
          <div className="drx-topbar-acciones" style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div style={{ position: "relative" }}>
            <button
              data-notif-bell
              className={`drx-btn-ghost${mostrarNotificaciones ? " drx-campana-sonando" : ""}`}
              onClick={() => setMostrarNotificaciones((v) => !v)}
              title="Notificaciones"
              style={{
                position: "relative",
                background: "transparent",
                border: `1px solid ${COLORS.border}`,
                borderRadius: 8,
                width: 38,
                height: 38,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: COLORS.headingText,
              }}
            >
              <IconoCampana />
              {notificaciones > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: -6,
                    right: -6,
                    background: "#E24B4A",
                    color: "#FFFFFF",
                    borderRadius: 20,
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "1px 5px",
                    fontFamily: "Inter, sans-serif",
                    animation: "drx-pulse 1.8s ease-in-out infinite",
                  }}
                >
                  {notificaciones}
                </span>
              )}
            </button>
            {mostrarNotificaciones && (
              <ModalNotificaciones
                firmasNuevas={firmasNuevas}
                clientesInactivos={clientesInactivos}
                pagosPendientes={pagosPendientes}
                contenidoPendiente={contenidoPendiente}
                contenidoVencido={contenidoVencido}
                novedadesJudiciales={novedadesJudiciales}
                clientesSinRadicado={clientesSinRadicado}
                clientesSinPago={clientesSinPago}
                tareasAviso={tareasAviso}
                onIrATareas={irATareas}
                onCerrar={() => setMostrarNotificaciones(false)}
                onMarcarVistas={marcarFirmasVistas}
                onIrADocumentos={irADocumentos}
                onIrAClientes={irAClientes}
                onIrAContenido={irAContenido}
                onIrAVigilancia={irAVigilancia}
                onIrAContabilidad={irAContabilidad}
              />
            )}
            </div>
            <a
              data-tour="ayuda"
              href={URL_GUIA_NOMOS}
              target="_blank"
              rel="noreferrer"
              className="drx-btn-ghost"
              title="Guía de uso de Nomos"
              style={{
                ...buttonGhost,
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 38,
                height: 38,
                padding: 0,
              }}
            >
              <Icono tipo="ayuda" size={16} />
            </a>
            <BotonTema oscuro={oscuro} onClick={alternar} />
          </div>
        </div>

        <div className="drx-content-area" style={{ padding: "28px 28px 40px", flex: 1 }}>
          {ultimaSesionAnterior && (
            <div
              style={{
                maxWidth: 760,
                margin: "0 auto 16px",
                background: COLORS.accentSoft,
                border: "1px solid #C7D6EA",
                borderRadius: 10,
                padding: "10px 16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.navy, margin: 0 }}>
                <Icono tipo="escudo" size={13} style={{ marginRight: 4, verticalAlign: -2 }} /> Tu última sesión fue el{" "}
                {new Date(ultimaSesionAnterior).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}. Si no fuiste tú, cambia tu
                contraseña ya mismo.
              </p>
              <button
                onClick={() => setUltimaSesionAnterior(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.navy, fontSize: 14, flexShrink: 0 }}
              >
                ✕
              </button>
            </div>
          )}
          <div key={tab} className="drx-tab-transition" style={{ maxWidth: 760, margin: "0 auto" }}>
            {cambiandoTab && <CargandoSeccion />}
            {/* El contenido se monta siempre (para que arranque a pedir sus
                datos y pueda avisar "onListo" cuanto antes) — mientras
                cambiandoTab es true, queda oculto con CSS (no desmontado)
                debajo de CargandoSeccion. */}
            <div style={{ display: cambiandoTab ? "none" : "block" }}>
              {tab === "resumen" && puedeVer("resumen") && (
                <TabErrorBoundary nombre="resumen">
                  <ResumenTab nombre={usuarioActual.nombre} usuarioId={usuarioActual.id} usuarioActual={usuarioActual} onIr={(t) => {
                    if (puedeVer(t)) setTab(t);
                    else alert("No tienes acceso a esa sección. Pídele al administrador del despacho que te la habilite.");
                  }} puedeVer={puedeVer} onListo={marcarDatosListos} />
                </TabErrorBoundary>
              )}
              {tab === "agenda" && puedeVer("agenda") && (
                <TabErrorBoundary nombre="agenda">
                  <Suspense fallback={<CargandoSeccion />}>
                    <AgendaTab onListo={marcarDatosListos} />
                  </Suspense>
                </TabErrorBoundary>
              )}
              {tab === "clientes" && puedeVer("clientes") && (
                <TabErrorBoundary nombre="clientes">
                  <Suspense fallback={<CargandoSeccion />}>
                    <ClientesTab usuarioActual={usuarioActual} onIrARegistrarPago={irARegistrarPago} onListo={marcarDatosListos} />
                  </Suspense>
                </TabErrorBoundary>
              )}
              {tab === "vigilancia" && puedeVer("vigilancia") && (
                <TabErrorBoundary nombre="vigilancia">
                  <Suspense fallback={<CargandoSeccion />}>
                    <VigilanciaTab onListo={marcarDatosListos} />
                  </Suspense>
                </TabErrorBoundary>
              )}
              {tab === "antecedentes" && puedeVer("antecedentes") && (
                <TabErrorBoundary nombre="antecedentes">
                  <Suspense fallback={<CargandoSeccion />}>
                    <AntecedentesTab onListo={marcarDatosListos} />
                  </Suspense>
                </TabErrorBoundary>
              )}
              {tab === "contabilidad" && puedeVer("contabilidad") && (
                <TabErrorBoundary nombre="contabilidad">
                  <Suspense fallback={<CargandoSeccion />}>
                    <ContabilidadTab usuarioActual={usuarioActual} clienteInicialPago={clienteParaPago} onClienteInicialPagoConsumido={() => setClienteParaPago(null)} onListo={marcarDatosListos} />
                  </Suspense>
                </TabErrorBoundary>
              )}
              {tab === "calculadora" && puedeVer("calculadora") && (
                <TabErrorBoundary nombre="calculadora">
                  <Suspense fallback={<CargandoSeccion />}>
                    <CalculadoraTab usuarioActual={usuarioActual} onListo={marcarDatosListos} />
                  </Suspense>
                </TabErrorBoundary>
              )}
              {tab === "contenido" && puedeVer("contenido") && (
                <TabErrorBoundary nombre="contenido">
                  <Suspense fallback={<CargandoSeccion />}>
                    <ContenidoTab onListo={marcarDatosListos} />
                  </Suspense>
                </TabErrorBoundary>
              )}
              {tab === "documentos" && puedeVer("documentos") && (
                <TabErrorBoundary nombre="documentos">
                  <Suspense fallback={<CargandoSeccion />}>
                    <DocumentosTab usuarioActual={usuarioActual} onListo={marcarDatosListos} />
                  </Suspense>
                </TabErrorBoundary>
              )}
              {tab === "reportes" && puedeVer("reportes") && (
                <TabErrorBoundary nombre="reportes">
                  <Suspense fallback={<CargandoSeccion />}>
                    <ReportesTab onListo={marcarDatosListos} />
                  </Suspense>
                </TabErrorBoundary>
              )}
              {tab === "usuarios" && usuarioActual.rol === "Administrador" && (
                <TabErrorBoundary nombre="usuarios">
                  <Suspense fallback={<CargandoSeccion />}>
                    <UsuariosPermisosTab
                      usuarioActual={usuarioActual}
                      onDespachoRenombrado={(nuevoNombre) => setUsuarioActual((prev) => (prev ? { ...prev, despachoNombre: nuevoNombre } : prev))}
                      onListo={marcarDatosListos}
                    />
                  </Suspense>
                </TabErrorBoundary>
              )}
              {tab === "plataforma" && usuarioActual.es_superadmin && (
                <TabErrorBoundary nombre="plataforma">
                  <Suspense fallback={<CargandoSeccion />}>
                    <PlataformaTab onListo={marcarDatosListos} />
                  </Suspense>
                </TabErrorBoundary>
              )}
            </div>
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${COLORS.border}`, background: COLORS.panel, padding: "10px 24px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 600, color: COLORS.inkSoft, margin: 0 }}>
              {getNombreDespacho()}
            </p>
            <SelloVersion oscuro={oscuro} />
          </div>
        </div>
      </div>

      {/* LexFlotante (chat flotante de IA) desactivado a pedido de Felipe — no
          estaba respondiendo bien. Queda para volver a activarlo más
          adelante con Claude, como función de pago. La tarjeta "Lex ·
          análisis financiero" de Resumen (ResumenTab) NO se tocó — sigue
          activa. <LexFlotante usuarioActual={usuarioActual} /> */}

      {avisoInactividad && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(10,18,32,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "calc(20px + var(--sat)) calc(20px + var(--sar)) calc(20px + var(--sab)) calc(20px + var(--sal))",
            zIndex: 2000,
          }}
        >
          <Card style={{ maxWidth: 380, textAlign: "center" }}>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 16, fontWeight: 700, color: COLORS.ink, marginBottom: 8 }}>
              ¿Sigues ahí?
            </p>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.muted, marginBottom: 18, lineHeight: 1.5 }}>
              Por seguridad, tu sesión está a punto de cerrarse por inactividad — útil si usas un computador compartido
              en el despacho. Mueve el mouse o haz clic para seguir conectado.
            </p>
            <button className="drx-btn-primary" style={{ ...buttonPrimary, width: "100%" }} onClick={() => setAvisoInactividad(false)}>
              Seguir conectado
            </button>
          </Card>
        </div>
      )}
    </div>
  );
}
