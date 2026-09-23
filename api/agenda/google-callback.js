// Conexión de un usuario con SU PROPIO Google Calendar: al crear un evento
// en Agenda, se crea también en su Google Calendar real, con un enlace de
// Meet automático — así le llegan las notificaciones nativas de Google
// (push, correo, lo que tenga configurado en su cuenta), sin que Nomos
// tenga que reinventar avisos.
//
// Cuatro operaciones en un solo archivo (en vez de 4 archivos separados)
// porque el plan Hobby de Vercel tiene un límite de 12 funciones sin
// servidor por despliegue y ya se está justo en ese límite — ver
// api/documentos/firmar.js y api/errores/registrar.js, que por la misma
// razón absorbieron cada una lo que antes era un archivo aparte:
//   GET  ?iniciar=1   (con sesión) -> arma el link de autorización de Google
//   GET  ?code=...    (Google redirige aquí, SIN sesión) -> guarda el token
//   GET  ?estado=1    (con sesión) -> ¿está conectado? ¿con qué correo?
//   POST (con sesión) { accion: "crear_evento" | "desconectar", ... }
//
// El "state" que viaja en la ida y vuelta con Google no es solo un id de
// usuario suelto: va firmado (HMAC con GOOGLE_CLIENT_SECRET, que solo
// conoce el servidor) para que nadie pueda mandarle a otra persona un link
// con su propio "code" pero el state de OTRO usuario, y terminar guardando
// SU conexión de Google bajo la cuenta de alguien más.

import { createHmac, randomUUID } from "node:crypto";
import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { dentroDelLimite } from "../_lib/rateLimit.js";

// Debe coincidir EXACTO con el "URI de redirección autorizado" configurado
// en Google Cloud Console — Google rechaza el intercambio si no calzan.
const REDIRECT_URI = "https://cortes-ramirez-app.vercel.app/api/agenda/google-callback";
const SCOPES = ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/userinfo.email"].join(" ");
const ZONA_HORARIA = "America/Bogota";

function firmarEstado(usuarioId) {
  const firma = createHmac("sha256", process.env.GOOGLE_CLIENT_SECRET || "").update(usuarioId).digest("hex");
  return `${usuarioId}.${firma}`;
}

function verificarEstado(state) {
  const idx = state.lastIndexOf(".");
  if (idx < 0) return null;
  const usuarioId = state.slice(0, idx);
  const firma = state.slice(idx + 1);
  const esperada = createHmac("sha256", process.env.GOOGLE_CLIENT_SECRET || "").update(usuarioId).digest("hex");
  return firma === esperada ? usuarioId : null;
}

async function obtenerUsuarioDesdeToken(admin, req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: userData, error } = await admin.auth.getUser(token);
  if (error || !userData?.user) return null;
  return userData.user;
}

// Cambia el refresh_token por un access_token fresco cuando el guardado ya
// venció (duran ~1h) — así el usuario nunca tiene que volver a autorizar a
// mano solo porque pasó una hora.
async function obtenerAccessTokenVigente(admin, usuarioId) {
  const { data: conexion } = await admin.from("google_calendar_conexiones").select("*").eq("usuario_id", usuarioId).maybeSingle();
  if (!conexion) return null;

  const vigente = new Date(conexion.expira_en).getTime() > Date.now() + 60000;
  if (vigente) return conexion.access_token;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      refresh_token: conexion.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const datos = await resp.json();
  if (!resp.ok || !datos.access_token) return null;

  const nuevaExpiracion = new Date(Date.now() + (datos.expires_in || 3600) * 1000).toISOString();
  await admin
    .from("google_calendar_conexiones")
    .update({ access_token: datos.access_token, expira_en: nuevaExpiracion, actualizado_en: new Date().toISOString() })
    .eq("usuario_id", usuarioId);

  return datos.access_token;
}

export default async function handler(req, res) {
  const admin = supabaseAdmin();

  if (req.method === "GET" && req.query?.iniciar) {
    const usuario = await obtenerUsuarioDesdeToken(admin, req);
    if (!usuario) return res.status(401).json({ error: "Inicia sesión primero." });
    if (!process.env.GOOGLE_CLIENT_ID) return res.status(500).json({ error: "Google Calendar no está configurado todavía en el servidor." });

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID);
    url.searchParams.set("redirect_uri", REDIRECT_URI);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("scope", SCOPES);
    url.searchParams.set("state", firmarEstado(usuario.id));
    return res.status(200).json({ authUrl: url.toString() });
  }

  // Google redirige aquí después de que el usuario autoriza (o cancela) —
  // esta petición NO trae el token de sesión de Nomos (es una navegación
  // normal del navegador), por eso la identidad viaja en el "state" firmado.
  if (req.method === "GET" && req.query?.code) {
    const usuarioId = verificarEstado(String(req.query.state || ""));
    if (!usuarioId) return res.redirect(302, "/#agenda?google=error");

    const puedeContinuar = await dentroDelLimite(admin, req, "google_calendar_callback", 20, 10);
    if (!puedeContinuar) return res.redirect(302, "/#agenda?google=error");

    try {
      const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID || "",
          client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
          code: String(req.query.code),
          grant_type: "authorization_code",
          redirect_uri: REDIRECT_URI,
        }),
      });
      const tokenDatos = await tokenResp.json();
      if (!tokenResp.ok || !tokenDatos.access_token || !tokenDatos.refresh_token) {
        // Sin refresh_token normalmente significa que el usuario ya había
        // conectado antes y Google no volvió a mandarlo — con prompt=consent
        // esto no debería pasar, pero si pasa es mejor avisar que guardar
        // una conexión que dejará de funcionar en una hora.
        return res.redirect(302, "/#agenda?google=error");
      }

      const perfilResp = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenDatos.access_token}` },
      });
      const perfilDatos = perfilResp.ok ? await perfilResp.json() : {};

      const { data: perfilNomos } = await admin.from("perfiles").select("despacho_id").eq("id", usuarioId).maybeSingle();

      await admin.from("google_calendar_conexiones").upsert({
        usuario_id: usuarioId,
        despacho_id: perfilNomos?.despacho_id || null,
        access_token: tokenDatos.access_token,
        refresh_token: tokenDatos.refresh_token,
        expira_en: new Date(Date.now() + (tokenDatos.expires_in || 3600) * 1000).toISOString(),
        email_google: perfilDatos.email || null,
        actualizado_en: new Date().toISOString(),
      });

      return res.redirect(302, "/#agenda?google=conectado");
    } catch (e) {
      console.error("Error conectando Google Calendar:", e);
      return res.redirect(302, "/#agenda?google=error");
    }
  }

  if (req.method === "GET" && req.query?.estado) {
    const usuario = await obtenerUsuarioDesdeToken(admin, req);
    if (!usuario) return res.status(401).json({ error: "Inicia sesión primero." });
    const { data: conexion } = await admin.from("google_calendar_conexiones").select("email_google").eq("usuario_id", usuario.id).maybeSingle();
    return res.status(200).json({ conectado: !!conexion, email: conexion?.email_google || null });
  }

  if (req.method === "POST") {
    const usuario = await obtenerUsuarioDesdeToken(admin, req);
    if (!usuario) return res.status(401).json({ error: "Inicia sesión primero." });

    const puedeContinuar = await dentroDelLimite(admin, req, "google_calendar_accion", 60, 10);
    if (!puedeContinuar) return res.status(429).json({ error: "Demasiadas solicitudes. Espera un momento e inténtalo de nuevo." });

    const { accion } = req.body || {};

    if (accion === "desconectar") {
      await admin.from("google_calendar_conexiones").delete().eq("usuario_id", usuario.id);
      return res.status(200).json({ ok: true });
    }

    if (accion === "crear_evento") {
      const { titulo, fecha, hora, notas, crearMeet, invitados } = req.body || {};
      if (!titulo || !fecha) return res.status(400).json({ error: "Falta título o fecha." });

      const accessToken = await obtenerAccessTokenVigente(admin, usuario.id);
      if (!accessToken) return res.status(409).json({ error: "no_conectado" });

      let start, end;
      if (hora) {
        // Bogotá es siempre UTC-5 (Colombia no tiene horario de verano), así
        // que el offset queda fijo. new Date("YYYY-MM-DDTHH:MM:00") SIN
        // offset es ambiguo — lo interpreta según la zona horaria del
        // SERVIDOR (Vercel corre en UTC), no la del abogado, así que un
        // evento de las 9pm terminaba guardado a las 4pm. Aquí se arma el
        // string con el offset -05:00 puesto a mano, sin pasar por esa
        // interpretación ambigua. Date.UTC() se usa solo para sumar la hora
        // de duración (y hacer rodar el día si cruza medianoche) de forma
        // segura, tratando la hora local como si fuera UTC (un truco común:
        // no representa el instante real, solo sirve para la aritmética).
        const [anio, mes, dia] = fecha.split("-").map(Number);
        const [h, m] = hora.split(":").map(Number);
        const pad = (n) => String(n).padStart(2, "0");
        const formatoConOffset = (d) =>
          `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00-05:00`;
        const inicioArtificial = new Date(Date.UTC(anio, mes - 1, dia, h, m));
        const finArtificial = new Date(inicioArtificial.getTime() + 60 * 60 * 1000);
        start = { dateTime: formatoConOffset(inicioArtificial), timeZone: ZONA_HORARIA };
        end = { dateTime: formatoConOffset(finArtificial), timeZone: ZONA_HORARIA };
      } else {
        const finDia = new Date(`${fecha}T00:00:00`);
        finDia.setDate(finDia.getDate() + 1);
        start = { date: fecha };
        end = { date: finDia.toISOString().slice(0, 10) };
      }

      // Correos sueltos y sin formato válido se descartan en vez de mandarlos
      // a Google (que rechazaría todo el evento por uno solo mal escrito).
      const attendees = Array.isArray(invitados)
        ? invitados.map((e) => String(e || "").trim()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)).map((email) => ({ email }))
        : [];

      const cuerpoEvento = {
        summary: titulo,
        description: notas || "",
        start,
        end,
      };
      if (attendees.length > 0) cuerpoEvento.attendees = attendees;
      if (crearMeet !== false) cuerpoEvento.conferenceData = { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } };

      try {
        // sendUpdates=all: para que a los invitados SÍ les llegue el correo
        // de invitación de Google Calendar — por defecto la API los agrega
        // en silencio, sin avisarles nada.
        const evResp = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=${attendees.length > 0 ? "all" : "none"}`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify(cuerpoEvento),
          }
        );
        const evDatos = await evResp.json();
        if (!evResp.ok) {
          console.error("Error creando evento en Google Calendar:", evDatos);
          return res.status(502).json({ error: "No se pudo crear el evento en Google Calendar." });
        }
        return res.status(200).json({
          googleEventoId: evDatos.id,
          googleHtmlLink: evDatos.htmlLink || null,
          googleMeetLink: evDatos.hangoutLink || null,
        });
      } catch (e) {
        console.error("Error creando evento en Google Calendar:", e);
        return res.status(502).json({ error: "No se pudo crear el evento en Google Calendar." });
      }
    }

    return res.status(400).json({ error: "Acción no reconocida." });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Método no permitido" });
}
