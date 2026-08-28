// Revoca el acceso de un integrante del despacho: borra su fila en
// "perfiles" y su cuenta real de Supabase Auth. Antes no existía forma de
// quitarle el acceso a alguien que ya no trabaja en el despacho (solo se
// podían cambiar permisos, nunca eliminar) — hueco real de seguridad, por
// ejemplo cuando un asistente deja de trabajar ahí.
//
// Solo un Administrador autenticado puede llamar esto, y solo sobre alguien
// de SU MISMO despacho. Nunca se puede eliminar a sí mismo desde aquí (para
// evitar quedarse afuera por accidente), ni al último Administrador que le
// queda al despacho (para no dejarlo sin nadie que pueda gestionarlo).

import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { dentroDelLimite } from "../_lib/rateLimit.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { usuarioId } = req.body || {};
  if (!usuarioId) {
    return res.status(400).json({ error: "Falta el id del usuario" });
  }

  const admin = supabaseAdmin();

  const puedeContinuar = await dentroDelLimite(admin, req, "usuarios/eliminar", 20, 60);
  if (!puedeContinuar) {
    return res.status(429).json({ error: "Demasiados intentos. Espera un momento e inténtalo de nuevo." });
  }

  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "No autenticado" });

    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData?.user) return res.status(401).json({ error: "Sesión inválida" });

    const { data: perfilLlamador } = await admin.from("perfiles").select("rol, despacho_id").eq("id", userData.user.id).maybeSingle();
    if (perfilLlamador?.rol !== "Administrador") {
      return res.status(403).json({ error: "Solo un administrador puede eliminar usuarios" });
    }

    if (usuarioId === userData.user.id) {
      return res.status(400).json({ error: "No puedes eliminar tu propia cuenta desde aquí." });
    }

    const { data: perfilObjetivo } = await admin.from("perfiles").select("rol, despacho_id").eq("id", usuarioId).maybeSingle();
    if (!perfilObjetivo || perfilObjetivo.despacho_id !== perfilLlamador.despacho_id) {
      return res.status(404).json({ error: "Ese usuario no pertenece a tu despacho." });
    }

    if (perfilObjetivo.rol === "Administrador") {
      const { count } = await admin
        .from("perfiles")
        .select("id", { count: "exact", head: true })
        .eq("despacho_id", perfilLlamador.despacho_id)
        .eq("rol", "Administrador");
      if ((count || 0) <= 1) {
        return res.status(400).json({ error: "No puedes eliminar al único administrador del despacho." });
      }
    }

    const { error: perfilError } = await admin.from("perfiles").delete().eq("id", usuarioId);
    if (perfilError) throw perfilError;
    await admin.auth.admin.deleteUser(usuarioId).catch(() => {});

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Error eliminando usuario:", err);
    return res.status(400).json({ error: err.message || "No se pudo eliminar el usuario" });
  }
}
