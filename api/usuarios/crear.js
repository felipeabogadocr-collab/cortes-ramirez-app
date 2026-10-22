// Crea un usuario real en Supabase Auth (contraseña hasheada por Supabase,
// nunca guardada por nosotros) y su fila en la tabla "perfiles", como
// integrante del MISMO despacho de quien lo crea.
//
// Solo un Administrador autenticado puede llamar esto — para crear un
// despacho nuevo (el primer usuario, que queda como su Administrador) se usa
// api/despachos/crear.js en su lugar.

import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { permisosPorDefecto, notificacionesPorDefecto, validarContrasena, esEmailValido } from "../_lib/defaults.js";
import { dentroDelLimite } from "../_lib/rateLimit.js";

const ROLES_VALIDOS = new Set(["Administrador", "Abogado", "Asistente"]);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { nombre, email, contrasena, rol, correoGoogle } = req.body || {};
  if (!nombre?.trim() || !email?.trim() || !contrasena?.trim()) {
    return res.status(400).json({ error: "Faltan nombre, correo o contraseña" });
  }
  if (!esEmailValido(email)) {
    return res.status(400).json({ error: "El correo no tiene un formato válido" });
  }
  // El correo de Google (Gmail o Google Workspace) es a donde llegan las
  // tareas que le asignen como evento de Google Calendar. Es obligatorio al
  // crear el usuario; puede ser el mismo correo con el que entra a Nomos.
  if (!correoGoogle?.trim() || !esEmailValido(correoGoogle)) {
    return res.status(400).json({ error: "Falta el correo de Gmail del usuario (o no tiene un formato válido)" });
  }
  const errorContrasena = validarContrasena(contrasena);
  if (errorContrasena) {
    return res.status(400).json({ error: errorContrasena });
  }

  const admin = supabaseAdmin();

  const puedeContinuar = await dentroDelLimite(admin, req, "usuarios/crear", 20, 60);
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
      return res.status(403).json({ error: "Solo un administrador puede crear usuarios" });
    }

    const rolFinal = ROLES_VALIDOS.has(rol) ? rol : "Asistente";

    const { data: nuevoUsuario, error: createError } = await admin.auth.admin.createUser({
      email: email.trim(),
      password: contrasena,
      email_confirm: true,
    });
    if (createError) throw createError;

    const filaPerfil = {
      id: nuevoUsuario.user.id,
      nombre: nombre.trim(),
      email: email.trim(),
      correo_google: correoGoogle.trim().toLowerCase(),
      rol: rolFinal,
      despacho_id: perfilLlamador.despacho_id,
      permisos: permisosPorDefecto(rolFinal),
      notificaciones: notificacionesPorDefecto(),
    };
    let { data: perfil, error: perfilError } = await admin.from("perfiles").insert(filaPerfil).select().single();
    // Si la base todavía no tiene la columna correo_google (falta correr
    // supabase/migraciones/2026-10-22-tareas-google.sql), el usuario se crea
    // igual sin ella, en vez de dejar una cuenta de Auth huérfana.
    if (perfilError && /correo_google/.test(perfilError.message || "")) {
      const { correo_google: _sinColumna, ...sinCorreo } = filaPerfil;
      ({ data: perfil, error: perfilError } = await admin.from("perfiles").insert(sinCorreo).select().single());
    }
    if (perfilError) throw perfilError;

    return res.status(200).json(perfil);
  } catch (err) {
    console.error("Error creando usuario:", err);
    return res.status(400).json({ error: err.message || "No se pudo crear el usuario" });
  }
}
