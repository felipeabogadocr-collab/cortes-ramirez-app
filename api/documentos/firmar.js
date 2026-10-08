// Guarda la firma de un documento cuando firma alguien SIN sesión (el
// cliente, desde el enlace público #firmar), los dos eventos más livianos
// de la cadena de custodia (documento_visualizado, consentimiento_aceptado)
// y, además (GET ?accion=recibo-portal), la URL firmada para descargar un
// recibo desde el Portal del cliente — antes cada uno vivía en su propio
// archivo, pero el plan Hobby de Vercel solo permite 12 funciones sin
// servidor por despliegue y un archivo de más lo hacía fallar ("Build
// error" silencioso: el despliegue nunca se actualizaba, sin avisar nada
// dentro de la app). Un solo endpoint resuelve los cuatro casos sin sumar
// una función nueva.
//
// Pasa por el servidor (no directo a Supabase) para poder capturar la IP
// real de quien firmó/visualizó — el navegador puede mentir sobre casi
// todo, pero no puede falsificar la IP con la que llega la solicitud al
// servidor. Es un dato de atribución adicional para reforzar la firma
// electrónica bajo la Ley 527 de 1999 (art. 7: que el método de
// identificación sea confiable para el propósito de la comunicación).

import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { dentroDelLimite } from "../_lib/rateLimit.js";

const EVENTOS_LIVIANOS = ["documento_visualizado", "consentimiento_aceptado"];

function obtenerIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || null;
}

// Recibo de pago desde el Portal del cliente (#portal) — el bucket
// "recibos" es privado (RLS por despacho_id vía auth.uid()), así que un
// visitante anónimo del portal no puede leerlo directo de Supabase Storage.
// Esta función verifica primero que el pago pertenezca de verdad al
// cliente dueño de "codigo" (el mismo código de acceso del portal) antes
// de generar una URL firmada de corta duración — nunca se expone el
// bucket completo ni la ruta de otro cliente.
// Busca al cliente por el código corto del portal (8 caracteres) o por el
// id completo de los enlaces viejos.
async function buscarClientePortal(admin, codigo, columnas) {
  const consulta = () => admin.from("clientes").select(columnas).is("eliminado_en", null);
  let r = await consulta().eq("id", codigo).maybeSingle();
  const corto = String(codigo).trim().replace(/-/g, "").toUpperCase();
  if (!r.data && !r.error && /^[A-Z0-9]{8}$/.test(corto)) {
    r = await consulta().eq("data->>codigoPortal", corto).maybeSingle();
  }
  return r;
}

// Logo del despacho para el encabezado del Portal del cliente (el bucket
// "logos" es privado: se entrega una URL firmada de corta duración).
async function manejarLogo(req, res, admin) {
  const { codigo } = req.query || {};
  if (!codigo) return res.status(400).json({ error: "Faltan datos" });
  const { data: cliente } = await buscarClientePortal(admin, codigo, "despacho_id");
  if (!cliente?.despacho_id) return res.status(404).json({ error: "No encontrado" });
  const { data: despacho } = await admin.from("despachos").select("logo_ruta").eq("id", cliente.despacho_id).maybeSingle();
  if (!despacho?.logo_ruta) return res.status(404).json({ error: "Sin logo" });
  const { data: firmada, error } = await admin.storage.from("logos").createSignedUrl(despacho.logo_ruta, 3600);
  if (error || !firmada?.signedUrl) return res.status(404).json({ error: "Sin logo" });
  return res.status(200).json({ url: firmada.signedUrl });
}

// Contrato del cliente para descargar desde su portal. Sin pagoId:
// ?accion=contrato-portal&codigo=...  (&solo=info solo dice si existe).
async function manejarContrato(req, res, admin) {
  const { codigo, solo } = req.query || {};
  if (!codigo) return res.status(400).json({ error: "Faltan datos" });
  const { data: cliente } = await buscarClientePortal(admin, codigo, "data");
  const contrato = cliente?.data?.contrato;
  if (!contrato?.ruta) return res.status(200).json({ disponible: false });
  if (solo === "info") return res.status(200).json({ disponible: true, nombre: contrato.nombre || "Contrato", fecha: contrato.fecha || null });
  const { data: firmada, error } = await admin.storage.from("recibos").createSignedUrl(contrato.ruta, 120, { download: contrato.nombre || true });
  if (error || !firmada?.signedUrl) return res.status(404).json({ error: "No encontrado" });
  return res.status(200).json({ url: firmada.signedUrl });
}

// Enlace para compartir el portal: /p/CODIGO (reescrito aquí en vercel.json).
// WhatsApp y las redes leen estas etiquetas para armar la tarjeta del
// enlace con el nombre del despacho; la persona sigue de inmediato al portal.
const escaparHtml = (t) => String(t || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
async function manejarTarjetaPortal(req, res, admin) {
  const codigo = String(req.query?.codigo || "").slice(0, 80);
  const origen = `https://${req.headers.host}`;
  let despacho = "";
  if (codigo) {
    const { data: cliente } = await buscarClientePortal(admin, codigo, "despacho_id");
    if (cliente?.despacho_id) {
      const { data } = await admin.from("despachos").select("nombre").eq("id", cliente.despacho_id).maybeSingle();
      despacho = data?.nombre || "";
    }
  }
  const destino = `${origen}/?codigo=${encodeURIComponent(codigo)}#portal`;
  const titulo = despacho ? `${despacho} · Portal del cliente` : "Portal del cliente · Nomos";
  const descripcion = `Consulta tu proceso, pagos, citas y documentos${despacho ? ` con ${despacho}` : ""}. Con tecnología de Nomos.`;
  const imagen = `${origen}/og-portal.png`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  return res.status(200).send(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${escaparHtml(titulo)}</title>
<meta name="robots" content="noindex">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Nomos">
<meta property="og:title" content="${escaparHtml(titulo)}">
<meta property="og:description" content="${escaparHtml(descripcion)}">
<meta property="og:image" content="${imagen}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escaparHtml(titulo)}">
<meta name="twitter:description" content="${escaparHtml(descripcion)}">
<meta name="twitter:image" content="${imagen}">
<meta http-equiv="refresh" content="0;url=${escaparHtml(destino)}">
</head><body><a href="${escaparHtml(destino)}">Entrar a mi portal</a></body></html>`);
}

async function manejarRecibo(req, res, admin) {
  const { codigo, pagoId } = req.query || {};
  if (!codigo || !pagoId) {
    return res.status(400).json({ error: "Faltan datos" });
  }

  const { data: cliente, error: errorCliente } = await buscarClientePortal(admin, codigo, "data");
  if (errorCliente || !cliente) {
    return res.status(404).json({ error: "No encontrado" });
  }

  const pago = (cliente.data?.pagos || []).find((p) => p.id === pagoId);
  if (!pago?.reciboImagen) {
    return res.status(404).json({ error: "No encontrado" });
  }

  if (pago.reciboImagen.startsWith("data:")) {
    return res.status(200).json({ dataUrl: pago.reciboImagen });
  }

  const { data: firmada, error: errorFirmada } = await admin.storage.from("recibos").createSignedUrl(pago.reciboImagen, 60);
  if (errorFirmada || !firmada?.signedUrl) {
    return res.status(404).json({ error: "No encontrado" });
  }
  return res.status(200).json({ url: firmada.signedUrl });
}

async function manejarEventoLiviano(req, res, admin) {
  const { codigo, tipoEvento, nombre, numeroId } = req.body || {};
  if (!codigo || !EVENTOS_LIVIANOS.includes(tipoEvento)) {
    return res.status(400).json({ error: "Faltan datos" });
  }

  const { data: doc, error: errorDoc } = await admin
    .from("documentos")
    .select("despacho_id")
    .eq("id", codigo)
    .is("eliminado_en", null)
    .maybeSingle();
  if (errorDoc || !doc) {
    // No se avisa cuál es el problema (documento inexistente vs. borrado)
    // para no darle pistas a alguien probando códigos al azar.
    return res.status(200).json({ ok: true });
  }

  const { error } = await admin.from("documento_eventos").insert({
    despacho_id: doc.despacho_id,
    documento_id: codigo,
    tipo_evento: tipoEvento,
    firmante_nombre: nombre || null,
    firmante_documento_id: numeroId || null,
    ip: obtenerIp(req),
    user_agent: req.headers["user-agent"] || null,
  });
  if (error) {
    console.error("Error registrando evento de documento:", error);
    return res.status(500).json({ error: "No se pudo registrar el evento" });
  }

  return res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  if (req.method === "GET" && req.query?.accion === "recibo-portal") {
    const admin = supabaseAdmin();
    const puedeContinuar = await dentroDelLimite(admin, req, "documentos/firmar", 20, 60);
    if (!puedeContinuar) {
      return res.status(429).json({ error: "Demasiados intentos. Espera un momento e inténtalo de nuevo." });
    }
    return manejarRecibo(req, res, admin);
  }
  if (req.method === "GET" && req.query?.accion === "tarjeta-portal") {
    return manejarTarjetaPortal(req, res, supabaseAdmin());
  }
  if (req.method === "GET" && req.query?.accion === "contrato-portal") {
    const admin = supabaseAdmin();
    const puedeContinuar = await dentroDelLimite(admin, req, "documentos/firmar", 20, 60);
    if (!puedeContinuar) return res.status(429).json({ error: "Demasiados intentos." });
    return manejarContrato(req, res, admin);
  }
  if (req.method === "GET" && req.query?.accion === "logo-portal") {
    const admin = supabaseAdmin();
    const puedeContinuar = await dentroDelLimite(admin, req, "documentos/firmar", 20, 60);
    if (!puedeContinuar) return res.status(429).json({ error: "Demasiados intentos." });
    return manejarLogo(req, res, admin);
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const admin = supabaseAdmin();
  const puedeContinuar = await dentroDelLimite(admin, req, "documentos/firmar", 20, 60);
  if (!puedeContinuar) {
    return res.status(429).json({ error: "Demasiados intentos. Espera un momento e inténtalo de nuevo." });
  }

  if (EVENTOS_LIVIANOS.includes(req.body?.tipoEvento)) {
    return manejarEventoLiviano(req, res, admin);
  }

  const { codigo, data } = req.body || {};
  if (!codigo || !data || typeof data !== "object") {
    return res.status(400).json({ error: "Faltan datos" });
  }

  const ip = obtenerIp(req);

  // La última posición del arreglo de firmantes es siempre la firma que se
  // acaba de colocar (el frontend la agrega al final antes de llamar aquí).
  const firmantes = Array.isArray(data.firmantes) ? [...data.firmantes] : [];
  if (firmantes.length > 0) {
    firmantes[firmantes.length - 1] = { ...firmantes[firmantes.length - 1], ip };
  }
  const dataConIp = { ...data, firmantes };

  const { data: filaActualizada, error } = await admin
    .from("documentos")
    .update({ data: dataConIp, updated_at: new Date().toISOString() })
    .eq("id", codigo)
    .is("eliminado_en", null)
    .select("despacho_id")
    .maybeSingle();

  if (error) {
    console.error("Error guardando firma:", error);
    return res.status(500).json({ error: "No se pudo guardar la firma" });
  }

  // Cadena de custodia (Ley 527 de 1999): fila aparte, append-only, con la
  // misma IP y el mismo hash que se acaban de guardar en la firma — si
  // esta inserción fallara, la firma ya quedó guardada arriba de todas
  // formas (no se bloquea el flujo del firmante por esto).
  const ultimaFirma = firmantes[firmantes.length - 1];
  if (filaActualizada?.despacho_id) {
    const { error: errorEvento } = await admin.from("documento_eventos").insert({
      despacho_id: filaActualizada.despacho_id,
      documento_id: codigo,
      tipo_evento: "documento_firmado",
      firmante_nombre: ultimaFirma?.textoFirma || ultimaFirma?.nombre || null,
      firmante_documento_id: ultimaFirma?.numeroId || null,
      rol: ultimaFirma?.rol || null,
      ip,
      user_agent: req.headers["user-agent"] || null,
      hash_documento: ultimaFirma?.hashDocumento || null,
      detalle: { titulo: data.titulo || null },
    });
    if (errorEvento) console.error("Error registrando evento de firma:", errorEvento);
  }

  return res.status(200).json({ ok: true, ip });
}
