// Registro de un despacho nuevo (self-service, sin necesitar un
// administrador previo). El usuario de Supabase Auth se crea del lado del
// navegador con supabase.auth.signUp() ANTES de llamar aquí — así Supabase
// envía el correo real de confirmación (esta función con service_role no
// puede disparar ese correo). Esta función solo crea el despacho y el
// perfil, verificando que el userId corresponda a un usuario real recién
// creado.
//
// Los demás usuarios de un despacho ya existente los crea su Administrador
// desde "Usuarios y permisos" (api/usuarios/crear.js), sin este paso de
// verificación de correo.

import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { permisosPorDefecto, notificacionesPorDefecto } from "../_lib/defaults.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { nombreDespacho, nombre, email, userId } = req.body || {};
  if (!nombreDespacho?.trim() || !nombre?.trim() || !email?.trim() || !userId) {
    return res.status(400).json({ error: "Faltan datos" });
  }

  const admin = supabaseAdmin();

  try {
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
    if (userError || !userData?.user || userData.user.email !== email.trim()) {
      return res.status(400).json({ error: "Usuario inválido" });
    }

    const { data: perfilExistente } = await admin.from("perfiles").select("id").eq("id", userId).maybeSingle();
    if (perfilExistente) {
      return res.status(400).json({ error: "Ya existe un despacho para esta cuenta." });
    }

    const { data: despacho, error: despachoError } = await admin
      .from("despachos")
      .insert({ nombre: nombreDespacho.trim() })
      .select()
      .single();
    if (despachoError) throw despachoError;

    const { data: perfil, error: perfilError } = await admin
      .from("perfiles")
      .insert({
        id: userId,
        nombre: nombre.trim(),
        email: email.trim(),
        rol: "Administrador",
        despacho_id: despacho.id,
        permisos: permisosPorDefecto("Administrador"),
        notificaciones: notificacionesPorDefecto(),
      })
      .select()
      .single();
    if (perfilError) {
      // Si falla el perfil, no dejamos el despacho huérfano.
      await admin.from("despachos").delete().eq("id", despacho.id);
      throw perfilError;
    }

    return res.status(200).json({ perfil, despacho });
  } catch (err) {
    console.error("Error creando despacho:", err);
    return res.status(400).json({ error: err.message || "No se pudo crear el despacho" });
  }
}
