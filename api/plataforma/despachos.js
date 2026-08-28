// Panel de superadministrador: lista TODOS los despachos de la plataforma
// (saltándose el aislamiento normal por despacho, que es justo lo que
// necesita quien vende la plataforma a varios despachos) y permite
// activar/desactivar el acceso de cada uno tras coordinar el pago.
//
// Protegido: solo un usuario con perfiles.es_superadmin = true puede usar
// este endpoint. Nunca se expone la llave service_role al navegador — esta
// función es la única que puede saltarse el aislamiento entre despachos.

import { supabaseAdmin } from "../_lib/supabaseAdmin.js";

async function verificarSuperadmin(admin, req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: userData, error } = await admin.auth.getUser(token);
  if (error || !userData?.user) return null;
  const { data: perfil } = await admin.from("perfiles").select("es_superadmin").eq("id", userData.user.id).maybeSingle();
  return perfil?.es_superadmin ? userData.user.id : null;
}

export default async function handler(req, res) {
  const admin = supabaseAdmin();
  const superadminId = await verificarSuperadmin(admin, req);
  if (!superadminId) {
    return res.status(403).json({ error: "Solo el superadministrador de la plataforma puede acceder aquí." });
  }

  if (req.method === "GET") {
    const { data: despachos, error } = await admin
      .from("despachos")
      .select("id, nombre, activo, creado_en")
      .order("creado_en", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });

    const { data: perfiles } = await admin.from("perfiles").select("despacho_id, email, rol").eq("rol", "Administrador");
    const adminsPorDespacho = {};
    (perfiles || []).forEach((p) => {
      if (p.despacho_id) adminsPorDespacho[p.despacho_id] = p.email;
    });

    // Última actividad real de cada despacho (para saber quién de verdad
    // está usando lo que pagó, no solo quién pagó). "inicio_sesion" ya se
    // registra en cada login real — con eso alcanza sin tener que sumar
    // otra tabla.
    const ultimaActividadPorDespacho = {};
    const { data: ultimosLogins } = await admin
      .from("auditoria")
      .select("despacho_id, creado_en")
      .eq("accion", "inicio_sesion")
      .order("creado_en", { ascending: false })
      .limit(2000);
    (ultimosLogins || []).forEach((registro) => {
      if (registro.despacho_id && !ultimaActividadPorDespacho[registro.despacho_id]) {
        ultimaActividadPorDespacho[registro.despacho_id] = registro.creado_en;
      }
    });

    const resultado = (despachos || []).map((d) => ({
      ...d,
      adminEmail: adminsPorDespacho[d.id] || null,
      ultimaActividad: ultimaActividadPorDespacho[d.id] || null,
    }));
    return res.status(200).json({ despachos: resultado });
  }

  if (req.method === "POST") {
    const { despachoId, activo } = req.body || {};
    if (!despachoId || typeof activo !== "boolean") {
      return res.status(400).json({ error: "Faltan datos" });
    }
    const { error } = await admin.from("despachos").update({ activo }).eq("id", despachoId);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Método no permitido" });
}
