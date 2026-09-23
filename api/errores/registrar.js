// Función serverless de Vercel: recibe errores no controlados atrapados por
// el ErrorBoundary del frontend y los guarda en Supabase, para que el
// superadmin pueda revisarlos desde "Plataforma" en vez de depender de que
// alguien reporte el problema por WhatsApp.
//
// GET: solo el superadministrador puede listar los últimos errores.
// POST: cualquiera puede registrar un error (es la interfaz misma fallando,
// no tiene sentido exigir sesión activa — puede caerse justo en el login),
// pero con límite de tasa para que no se use como vector de spam.
//
// También absorbe lo que antes era api/seguridad/csp-violacion.js (el plan
// Hobby de Vercel tiene un límite de 12 funciones sin servidor por
// despliegue y ya se está justo en ese límite — ver
// api/documentos/firmar.js, que por la misma razón absorbió lo que antes
// era api/documentos/evento.js). Los navegadores mandan un reporte de CSP
// como "application/csp-report" o "application/reports+json", no como
// "application/json", así que aquí abajo se desactiva el bodyParser
// automático de Vercel y se lee el cuerpo crudo a mano para AMBOS casos.

import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { dentroDelLimite } from "../_lib/rateLimit.js";

export const config = { api: { bodyParser: false } };

function leerCuerpo(req) {
  return new Promise((resolve) => {
    let datos = "";
    req.on("data", (chunk) => {
      datos += chunk;
      if (datos.length > 20000) req.destroy(); // nunca leer un cuerpo absurdamente grande
    });
    req.on("end", () => resolve(datos));
    req.on("error", () => resolve(""));
  });
}

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

// El navegador de cada visitante ya trae aplicada la Content-Security-Policy
// (ver vercel.json) que bloquea de raíz cualquier script, estilo o conexión
// que no esté en la lista blanca — es la defensa real contra XSS. Esto es
// solo para ENTERARSE cuando esa defensa bloquea algo. Reutiliza la misma
// tabla "errores_cliente" (y el mismo panel de Plataforma) en vez de crear
// una tabla y una pantalla nuevas para lo mismo.
async function manejarViolacionCSP(req, res, admin, textoCuerpo) {
  // Un solo recurso bloqueado puede generar un reporte por cada intento de
  // carga (reintentos, varias pestañas) — sin límite, eso podría inflar la
  // tabla o usarse para tumbar el endpoint a punta de reportes falsos.
  const puedeContinuar = await dentroDelLimite(admin, req, "csp_violacion", 40, 60);
  if (!puedeContinuar) return res.status(204).end();

  let cuerpo = null;
  try {
    cuerpo = JSON.parse(textoCuerpo);
  } catch (e) {
    return res.status(204).end();
  }
  const reporte = cuerpo?.["csp-report"] || cuerpo;
  if (!reporte || typeof reporte !== "object") return res.status(204).end();

  const directiva = reporte["violated-directive"] || reporte["effective-directive"] || "directiva desconocida";
  const bloqueado = reporte["blocked-uri"] || "?";
  const mensaje = `[CSP] "${directiva}" bloqueó: ${bloqueado}`;

  const { error } = await admin.from("errores_cliente").insert({
    mensaje: recortar(mensaje, 2000),
    pila: null,
    info_componente: recortar(JSON.stringify(reporte), 4000),
    url: recortar(reporte["document-uri"], 500),
    despacho_id: null,
    usuario_id: null,
    user_agent: recortar(req.headers["user-agent"], 500),
  });
  if (error) console.error("No se pudo registrar violación CSP:", error);

  // Los navegadores ignoran la respuesta de un endpoint de reportes — 204
  // es lo estándar para esto.
  return res.status(204).end();
}

export default async function handler(req, res) {
  const admin = supabaseAdmin();

  if (req.method === "POST") {
    const textoCuerpo = await leerCuerpo(req);
    const contentType = req.headers["content-type"] || "";
    const esReporteCSP = contentType.includes("csp-report") || contentType.includes("reports+json");
    if (esReporteCSP) return manejarViolacionCSP(req, res, admin, textoCuerpo);

    const puedeContinuar = await dentroDelLimite(admin, req, "errores_registrar", 30, 60);
    if (!puedeContinuar) {
      return res.status(429).json({ error: "Demasiados reportes de error." });
    }

    let cuerpo = {};
    try {
      cuerpo = JSON.parse(textoCuerpo);
    } catch (e) {
      cuerpo = {};
    }
    const { mensaje, pila, infoComponente, url, userAgent } = cuerpo;
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
