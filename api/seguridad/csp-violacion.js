// El navegador de cada visitante ya trae aplicada la Content-Security-Policy
// (ver vercel.json) que bloquea de raíz cualquier script, estilo o conexión
// que no esté en la lista blanca — es la defensa real contra XSS. Lo único
// que faltaba era ENTERARSE cuando esa defensa bloquea algo: sin esto, un
// intento real de inyección (código malicioso metido por algún lado, una
// dependencia comprometida, alguien probando a ver qué cuela) se frenaba en
// silencio y nadie del despacho ni de la plataforma se enteraba nunca.
//
// Los navegadores mandan estos reportes solos (configurado con "report-uri"
// en la política) cada vez que bloquean algo — no hay que hacer nada del
// lado del cliente. Se reutiliza la misma tabla "errores_cliente" (y el
// mismo panel de Plataforma que ya la muestra) en vez de crear una tabla y
// una pantalla nuevas para lo mismo.

import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { dentroDelLimite } from "../_lib/rateLimit.js";

// Vercel solo parsea el body como JSON automáticamente cuando el
// Content-Type es "application/json" — los navegadores mandan estos
// reportes como "application/csp-report" (o "application/reports+json"),
// así que hay que leer el cuerpo crudo y parsearlo a mano.
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

const recortar = (texto, max) => (typeof texto === "string" ? texto.slice(0, max) : null);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }

  const admin = supabaseAdmin();
  // Un solo recurso bloqueado puede generar un reporte por cada intento de
  // carga (reintentos, varias pestañas) — sin límite, eso podría inflar la
  // tabla o usarse para tumbar el endpoint a punta de reportes falsos.
  const puedeContinuar = await dentroDelLimite(admin, req, "csp_violacion", 40, 60);
  if (!puedeContinuar) return res.status(204).end();

  const textoCuerpo = await leerCuerpo(req);
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
