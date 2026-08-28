// Registro de un despacho nuevo (self-service, sin necesitar un
// administrador previo): crea el despacho, el usuario real en Supabase Auth
// (contraseña hasheada por Supabase) y su perfil como Administrador de ese
// despacho. Es el único punto de entrada para "nacer" un despacho nuevo en
// el sistema — los demás usuarios de ese despacho los crea su Administrador
// desde "Usuarios y permisos" (api/usuarios/crear.js).

import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { permisosPorDefecto, notificacionesPorDefecto, validarContrasena } from "../_lib/defaults.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { nombreDespacho, nombre, email, contrasena } = req.body || {};
  if (!nombreDespacho?.trim() || !nombre?.trim() || !email?.trim() || !contrasena?.trim()) {
    return res.status(400).json({ error: "Faltan datos" });
  }
  const errorContrasena = validarContrasena(contrasena);
  if (errorContrasena) {
    return res.status(400).json({ error: errorContrasena });
  }

  const admin = supabaseAdmin();

  try {
    const { data: despacho, error: despachoError } = await admin
      .from("despachos")
      .insert({ nombre: nombreDespacho.trim() })
      .select()
      .single();
    if (despachoError) throw despachoError;

    const { data: nuevoUsuario, error: createError } = await admin.auth.admin.createUser({
      email: email.trim(),
      password: contrasena,
      email_confirm: true,
    });
    if (createError) {
      // Si falla la creación del usuario, no dejamos el despacho huérfano.
      await admin.from("despachos").delete().eq("id", despacho.id);
      throw createError;
    }

    const { data: perfil, error: perfilError } = await admin
      .from("perfiles")
      .insert({
        id: nuevoUsuario.user.id,
        nombre: nombre.trim(),
        email: email.trim(),
        rol: "Administrador",
        despacho_id: despacho.id,
        permisos: permisosPorDefecto("Administrador"),
        notificaciones: notificacionesPorDefecto(),
      })
      .select()
      .single();
    if (perfilError) throw perfilError;

    return res.status(200).json({ perfil, despacho });
  } catch (err) {
    console.error("Error creando despacho:", err);
    return res.status(400).json({ error: err.message || "No se pudo crear el despacho" });
  }
}
