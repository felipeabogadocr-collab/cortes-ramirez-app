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
async function manejarRecibo(req, res, admin) {
  const { codigo, pagoId } = req.query || {};
  if (!codigo || !pagoId) {
    return res.status(400).json({ error: "Faltan datos" });
  }

  const { data: cliente, error: errorCliente } = await admin
    .from("clientes")
    .select("data")
    .eq("id", codigo)
    .is("eliminado_en", null)
    .maybeSingle();
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
