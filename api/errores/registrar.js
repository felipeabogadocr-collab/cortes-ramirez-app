// Función serverless de Vercel: recibe errores no controlados atrapados por
// el ErrorBoundary del frontend y los guarda en Supabase, para que el
// superadmin pueda revisarlos desde "Plataforma" en vez de depender de que
// alguien reporte el problema por WhatsApp.
//
// GET: solo el superadministrador puede listar los últimos errores.
// POST: cualquiera puede registrar un error (es la interfaz misma fallando,
// no tiene sentido exigir sesión activa — puede caerse justo en el login),
// pero con límite de tasa para que no se use como vector de spam.

import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { dentroDelLimite } from "../_lib/rateLimit.js";

async function verificarSuperadmin(admin, req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: userData, error } = await admin.auth.getUser(token);
  if (error || !userData?.user) return null;
  const { data: perfil } = await admin.from("perfiles").select("es_superadmin").eq("id", userData.user.id).maybeSingle();
  return perfil?.es_superadmin ? userData.user.id : null;
}

// Recorta cualquier campo de texto libre para que un error con una pila
// gigante (o alguien mandando basura al endpoint) no infle la tabla.
const recortar = (texto, max) => (typeof texto === "string" ? texto.slice(0, max) : null);

export default async function handler(req, res) {
  const admin = supabaseAdmin();

  if (req.method === "POST") {
    const puedeContinuar = await dentroDelLimite(admin, req, "errores_registrar", 30, 60);
    if (!puedeContinuar) {
      return res.status(429).json({ error: "Demasiados reportes de error." });
    }

    const { mensaje, pila, infoComponente, url, userAgent } = req.body || {};
    if (!mensaje) return res.status(400).json({ error: "Falta 'mensaje'" });

    // despachoId/usuarioId NUNCA se toman del cuerpo del POST (cualquiera
    // podría mandar el id de otro despacho para ensuciar sus estadísticas de
    // errores) — se derivan del token de sesión, si vino uno. Un error sí
    // puede pasar sin sesión activa (justo antes del login, por ejemplo), en
    // cuyo caso ambos quedan en null.
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    let despachoId = null;
    let usuarioId = null;
    if (token) {
      const { data: userData } = await admin.auth.getUser(token);
      if (userData?.user) {
        usuarioId = userData.user.id;
        const { data: perfil } = await admin.from("perfiles").select("despacho_id").eq("id", userData.user.id).maybeSingle();
        despachoId = perfil?.despacho_id || null;
      }
    }

    const { error } = await admin.from("errores_cliente").insert({
      mensaje: recortar(mensaje, 2000),
      pila: recortar(pila, 8000),
      info_componente: recortar(infoComponente, 4000),
      url: recortar(url, 500),
      despacho_id: despachoId,
      usuario_id: usuarioId,
      user_agent: recortar(userAgent, 500),
    });
    // Nunca tumbar la interfaz por un fallo al registrar el fallo: se avisa
    // en el log del servidor y se responde 200 igual.
    if (error) console.error("No se pudo registrar error de cliente:", error);
    return res.status(200).json({ ok: true });
  }

  if (req.method === "GET") {
    const superadminId = await verificarSuperadmin(admin, req);
    if (!superadminId) {
      return res.status(403).json({ error: "Solo el superadministrador de la plataforma puede acceder aquí." });
    }
    const { data, error } = await admin
      .from("errores_cliente")
      .select("id, mensaje, info_componente, url, despacho_id, creado_en")
      .order("creado_en", { ascending: false })
      .limit(50);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ errores: data || [] });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Método no permitido" });
}
