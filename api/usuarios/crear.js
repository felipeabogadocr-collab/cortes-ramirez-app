// Crea un usuario real en Supabase Auth (contraseña hasheada por Supabase,
// nunca guardada por nosotros) y su fila en la tabla "perfiles".
//
// Caso especial: si todavía no existe NINGÚN perfil en el sistema, cualquiera
// puede crear el primer usuario (queda como Administrador) — es el flujo de
// "arranque" cuando se instala la app por primera vez. Si ya existe al menos
// un usuario, solo un Administrador autenticado puede crear más.

import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { permisosPorDefecto, notificacionesPorDefecto } from "../_lib/defaults.js";

const ROLES_VALIDOS = new Set(["Administrador", "Abogado", "Asistente"]);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { nombre, email, contrasena, rol } = req.body || {};
  if (!nombre?.trim() || !email?.trim() || !contrasena?.trim()) {
    return res.status(400).json({ error: "Faltan nombre, correo o contraseña" });
  }
  if (contrasena.length < 8) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres" });
  }

  const admin = supabaseAdmin();

  try {
    const { count, error: countError } = await admin.from("perfiles").select("id", { count: "exact", head: true });
    if (countError) throw countError;

    let rolFinal = ROLES_VALIDOS.has(rol) ? rol : "Asistente";

    if (count && count > 0) {
      const authHeader = req.headers.authorization || "";
      const token = authHeader.replace(/^Bearer\s+/i, "");
      if (!token) return res.status(401).json({ error: "No autenticado" });

      const { data: userData, error: userError } = await admin.auth.getUser(token);
      if (userError || !userData?.user) return res.status(401).json({ error: "Sesión inválida" });

      const { data: perfilLlamador } = await admin.from("perfiles").select("rol").eq("id", userData.user.id).maybeSingle();
      if (perfilLlamador?.rol !== "Administrador") {
        return res.status(403).json({ error: "Solo un administrador puede crear usuarios" });
      }
    } else {
      rolFinal = "Administrador"; // el primer usuario del sistema siempre es admin
    }

    const { data: nuevoUsuario, error: createError } = await admin.auth.admin.createUser({
      email: email.trim(),
      password: contrasena,
      email_confirm: true,
    });
    if (createError) throw createError;

    const { data: perfil, error: perfilError } = await admin
      .from("perfiles")
      .insert({
        id: nuevoUsuario.user.id,
        nombre: nombre.trim(),
        email: email.trim(),
        rol: rolFinal,
        permisos: permisosPorDefecto(rolFinal),
        notificaciones: notificacionesPorDefecto(),
      })
      .select()
      .single();
    if (perfilError) throw perfilError;

    return res.status(200).json(perfil);
  } catch (err) {
    console.error("Error creando usuario:", err);
    return res.status(400).json({ error: err.message || "No se pudo crear el usuario" });
  }
}
