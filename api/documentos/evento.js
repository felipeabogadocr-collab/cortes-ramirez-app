// Registra un evento de la cadena de custodia de firma electrónica
// (Ley 527 de 1999) para alguien firmando SIN sesión (#firmar). Pasa por
// aquí (no directo a Supabase) para capturar la IP real del lado del
// servidor — el navegador puede mentir sobre casi todo, menos sobre la IP
// con la que llega la solicitud. Solo admite los dos eventos que puede
// disparar un firmante público antes de firmar; el evento "documento_firmado"
// en sí lo registra api/documentos/firmar.js, en el mismo paso que guarda la
// firma, para no poder registrar uno sin el otro.

import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { dentroDelLimite } from "../_lib/rateLimit.js";

const EVENTOS_PERMITIDOS = ["documento_visualizado", "consentimiento_aceptado"];

function obtenerIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const admin = supabaseAdmin();
  const puedeContinuar = await dentroDelLimite(admin, req, "documentos/evento", 40, 60);
  if (!puedeContinuar) {
    return res.status(429).json({ error: "Demasiados intentos. Espera un momento e inténtalo de nuevo." });
  }

  const { codigo, tipoEvento, nombre, numeroId } = req.body || {};
  if (!codigo || !EVENTOS_PERMITIDOS.includes(tipoEvento)) {
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
