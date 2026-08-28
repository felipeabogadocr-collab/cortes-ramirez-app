// Guarda la firma de un documento cuando firma alguien SIN sesión (el
// cliente, desde el enlace público #firmar). Pasa por aquí en vez de que el
// navegador escriba directo a Supabase para poder capturar la IP real de
// quien firmó — el navegador puede mentir sobre casi todo, pero no puede
// falsificar la IP con la que llega la solicitud al servidor. Es un dato de
// atribución adicional para reforzar la firma electrónica bajo la Ley 527
// de 1999 (art. 7: que el método de identificación sea confiable para el
// propósito de la comunicación).

import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { dentroDelLimite } from "../_lib/rateLimit.js";

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
  const puedeContinuar = await dentroDelLimite(admin, req, "documentos/firmar", 20, 60);
  if (!puedeContinuar) {
    return res.status(429).json({ error: "Demasiados intentos. Espera un momento e inténtalo de nuevo." });
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

  const { error } = await admin
    .from("documentos")
    .update({ data: dataConIp, updated_at: new Date().toISOString() })
    .eq("id", codigo)
    .is("eliminado_en", null);

  if (error) {
    console.error("Error guardando firma:", error);
    return res.status(500).json({ error: "No se pudo guardar la firma" });
  }

  return res.status(200).json({ ok: true, ip });
}
