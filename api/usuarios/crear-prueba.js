// Crea un usuario de PRUEBA con correo y contraseña al azar, que deja de
// funcionar solo después de N minutos — pensado para que un Administrador
// le preste acceso temporal a alguien (ej. para revisar algo en vivo) sin
// compartir sus propias credenciales ni dejar una cuenta real olvidada.
//
// El correo usa el dominio ".test" (reservado por IANA solo para pruebas,
// nunca resuelve de verdad) para que quede claro que no es una cuenta real
// y no haga falta que exista de verdad — email_confirm:true evita que
// Supabase intente mandarle un correo de verificación.
//
// El vencimiento (expira_en en "perfiles") se revisa en el login y cada 30s
// mientras la sesión sigue abierta (ver App.jsx). Esta función solo crea la
// cuenta; no hay borrado automático — el Administrador puede eliminarla en
// cualquier momento desde la lista de usuarios, como a cualquier otra.

import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { permisosPorDefecto, notificacionesPorDefecto } from "../_lib/defaults.js";
import { dentroDelLimite } from "../_lib/rateLimit.js";

const ROLES_VALIDOS = new Set(["Administrador", "Abogado", "Asistente"]);
const MINUTOS_MIN = 2;
const MINUTOS_MAX = 60;

function generarSufijoAleatorio() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

// Cumple la misma regla que validarContrasena (10+, letra y número) por
// construcción, sin depender de generar y reintentar.
function generarContrasenaAleatoria() {
  const letras = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";
  const numeros = "23456789";
  let pw = "";
  for (let i = 0; i < 10; i++) pw += letras[Math.floor(Math.random() * letras.length)];
  for (let i = 0; i < 4; i++) pw += numeros[Math.floor(Math.random() * numeros.length)];
  return pw;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const admin = supabaseAdmin();

  const puedeContinuar = await dentroDelLimite(admin, req, "usuarios/crear-prueba", 10, 60);
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
      return res.status(403).json({ error: "Solo un administrador puede crear accesos de prueba" });
    }

    const { rol, minutos } = req.body || {};
    const rolFinal = ROLES_VALIDOS.has(rol) ? rol : "Administrador";
    const minutosFinal = Math.min(MINUTOS_MAX, Math.max(MINUTOS_MIN, Number(minutos) || 10));

    const email = `prueba-${generarSufijoAleatorio()}@nomos-pruebas.test`;
    const contrasena = generarContrasenaAleatoria();
    const expiraEn = new Date(Date.now() + minutosFinal * 60 * 1000).toISOString();

    const { data: nuevoUsuario, error: createError } = await admin.auth.admin.createUser({
      email,
      password: contrasena,
      email_confirm: true,
    });
    if (createError) throw createError;

    const { error: perfilError } = await admin.from("perfiles").insert({
      id: nuevoUsuario.user.id,
      nombre: `Acceso de prueba (${minutosFinal} min)`,
      email,
      rol: rolFinal,
      despacho_id: perfilLlamador.despacho_id,
      permisos: permisosPorDefecto(rolFinal),
      notificaciones: notificacionesPorDefecto(),
      expira_en: expiraEn,
    });
    if (perfilError) throw perfilError;

    return res.status(200).json({ email, contrasena, expiraEn, rol: rolFinal });
  } catch (err) {
    console.error("Error creando acceso de prueba:", err);
    return res.status(400).json({ error: err.message || "No se pudo crear el acceso de prueba" });
  }
}
