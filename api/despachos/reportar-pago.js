// Cualquier usuario de un despacho pendiente de activar puede avisar aquí
// "ya pagué" — deja el momento marcado en despachos.pago_reportado_en para
// que el superadmin lo vea en Plataforma y confirme/active. Esto NO activa
// nada por sí solo (nadie puede autoactivarse pagando algo que no pagó):
// solo reemplaza tener que escribir a mano por WhatsApp explicando qué se
// pagó, con algo que la propia app ya sabe (quién es y de qué despacho).

import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { dentroDelLimite } from "../_lib/rateLimit.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const admin = supabaseAdmin();

  const puedeContinuar = await dentroDelLimite(admin, req, "despachos/reportar-pago", 10, 60);
  if (!puedeContinuar) {
    return res.status(429).json({ error: "Demasiados intentos. Espera un momento e inténtalo de nuevo." });
  }

  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "No autenticado" });

    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData?.user) return res.status(401).json({ error: "Sesión inválida" });

    const { data: perfil } = await admin.from("perfiles").select("despacho_id").eq("id", userData.user.id).maybeSingle();
    if (!perfil?.despacho_id) return res.status(404).json({ error: "No se encontró tu despacho." });

    const { error: updateError } = await admin
      .from("despachos")
      .update({ pago_reportado_en: new Date().toISOString() })
      .eq("id", perfil.despacho_id);
    if (updateError) throw updateError;

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Error registrando reporte de pago:", err);
    return res.status(400).json({ error: err.message || "No se pudo registrar el reporte de pago." });
  }
}
