import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  COLORS, EncabezadoSeccion, Card, buttonPrimary, buttonGhost, Field, inputStyle,
  Icono, IconoCampana, EstadoVacio, useConfirmarDialogo, useEventosAgenda, diasHasta, urgenciaTermino,
} from "../App.jsx";

function descargarICS(evento) {
  const escapar = (t) => String(t || "").replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n");
  const ahora = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const fechaBase = evento.fecha.replace(/-/g, "");
  let dtStart, dtEnd;
  if (evento.hora) {
    const [h, m] = evento.hora.split(":");
    dtStart = `${fechaBase}T${h.padStart(2, "0")}${m.padStart(2, "0")}00`;
    const finDate = new Date(`${evento.fecha}T${evento.hora}:00`);
    finDate.setHours(finDate.getHours() + 1);
    const fh = String(finDate.getHours()).padStart(2, "0");
    const fm = String(finDate.getMinutes()).padStart(2, "0");
    dtEnd = `${fechaBase}T${fh}${fm}00`;
  }
  const lineas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Nomos//Agenda//ES",
    "BEGIN:VEVENT",
    `UID:${evento.id}@nomos`,
    `DTSTAMP:${ahora}`,
    evento.hora ? `DTSTART:${dtStart}` : `DTSTART;VALUE=DATE:${fechaBase}`,
    evento.hora ? `DTEND:${dtEnd}` : `DTEND;VALUE=DATE:${fechaBase}`,
    `SUMMARY:${escapar(evento.titulo)}`,
    evento.notas ? `DESCRIPTION:${escapar(evento.notas)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  const blob = new Blob([lineas.join("\r\n")], { type: "text/calendar;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(evento.titulo || "evento").replace(/[^a-z0-9]+/gi, "_").toLowerCase()}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const FILTROS_AGENDA = [
  { id: "todos", nombre: "Todos" },
  { id: "hoy", nombre: "Hoy" },
  { id: "semana", nombre: "Esta semana" },
];

// Mismos presets que trae Google Calendar por defecto para "Notificación".
const RECORDATORIOS_GOOGLE = [
  { minutos: "", etiqueta: "El que tenga tu Google Calendar por defecto" },
  { minutos: "0", etiqueta: "A la hora del evento" },
  { minutos: "5", etiqueta: "5 minutos antes" },
  { minutos: "10", etiqueta: "10 minutos antes" },
  { minutos: "15", etiqueta: "15 minutos antes" },
  { minutos: "30", etiqueta: "30 minutos antes" },
  { minutos: "60", etiqueta: "1 hora antes" },
  { minutos: "1440", etiqueta: "1 día antes" },
];

function EventoAgendaCard({ evento, onEliminar, onCompletar, pasado }) {
  const fechaTexto = new Date(`${evento.fecha}T${evento.hora || "00:00"}:00`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
  const urgencia = evento.esTermino && !evento.completado ? urgenciaTermino(diasHasta(evento.fecha)) : null;
  const [copiado, setCopiado] = useState(false);

  // Un evento de HOY que ya pasó de hora se queda en "Próximos" (no salta a
  // "Pasados" hasta el otro día) — para que no se sienta perdido, se
  // atenúa un poco y le sale una etiqueta chiquita, sin moverlo de sección.
  const yaPasoLaHora = !pasado && !evento.completado && evento.hora && new Date(`${evento.fecha}T${evento.hora}:00`) < new Date();

  // El texto de invitación usa el título del evento como "concepto" (Ej:
  // "Asesoría con Juan Pérez", "Reunión de equipo") — si por algún motivo
  // no hay título, cae en "la sesión virtual" en vez de dejar el mensaje a
  // medias.
  const copiarInvitacion = () => {
    const concepto = evento.titulo ? `"${evento.titulo}"` : "la sesión virtual";
    const texto = `Te invito a ${concepto}\n📅 ${fechaTexto}${evento.hora ? ` · ${evento.hora}` : ""}\n🔗 ${evento.googleMeetLink}`;
    navigator.clipboard.writeText(texto).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    });
  };

  return (
    <Card style={{ padding: 14, opacity: pasado || evento.completado ? 0.55 : yaPasoLaHora ? 0.75 : 1, borderLeft: urgencia ? `4px solid ${urgencia.color}` : undefined }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        {onCompletar && (
          <button
            onClick={onCompletar}
            title={evento.completado ? "Marcar como pendiente" : "Marcar como completado"}
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              border: `2px solid ${evento.completado ? "#16A34A" : COLORS.border}`,
              background: evento.completado ? "#16A34A" : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#FFFFFF",
              cursor: "pointer",
              flexShrink: 0,
              marginTop: 2,
            }}
          >
            {evento.completado && <Icono tipo="check" size={12} />}
          </button>
        )}
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 700, color: COLORS.ink, margin: 0, textTransform: "capitalize", textDecoration: evento.completado ? "line-through" : "none" }}>{evento.titulo}</p>
            {urgencia && (
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: 10.5, fontWeight: 700, color: urgencia.color, background: urgencia.bg, border: `1px solid ${urgencia.color}40`, borderRadius: 20, padding: "2px 9px" }}>
                {urgencia.etiqueta}
              </span>
            )}
            {yaPasoLaHora && (
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: 10.5, fontWeight: 600, color: COLORS.muted, background: COLORS.surfaceSoft, border: `1px solid ${COLORS.border}`, borderRadius: 20, padding: "2px 9px" }}>
                Ya pasó
              </span>
            )}
          </div>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, margin: "4px 0 0", textTransform: "capitalize" }}>
            {fechaTexto}
            {evento.hora ? ` · ${evento.hora}` : ""}
            {evento.esTermino && evento.clienteRelacionado ? ` · ${evento.clienteRelacionado}` : ""}
          </p>
          {evento.notas && <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.inkSoft, margin: "6px 0 0" }}>{evento.notas}</p>}
          {(evento.googleMeetLink || evento.googleHtmlLink) && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              {evento.googleMeetLink && (
                <a
                  href={evento.googleMeetLink}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontFamily: "Inter, sans-serif",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#FFFFFF",
                    background: "#0B8043",
                    textDecoration: "none",
                    borderRadius: 20,
                    padding: "5px 12px",
                  }}
                >
                  <Icono tipo="video" size={13} /> Unirse por Meet
                </a>
              )}
              {evento.googleMeetLink && (
                <button
                  onClick={copiarInvitacion}
                  title="Copiar mensaje de invitación con el link, para pegarlo en WhatsApp o correo"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontFamily: "Inter, sans-serif",
                    fontSize: 12,
                    fontWeight: 600,
                    color: copiado ? "#166534" : COLORS.inkSoft,
                    background: copiado ? "#DCFCE7" : COLORS.surfaceSoft,
                    border: `1px solid ${copiado ? "#BBF7D0" : COLORS.border}`,
                    borderRadius: 20,
                    padding: "5px 12px",
                    cursor: "pointer",
                  }}
                >
                  {copiado ? (
                    <>
                      <Icono tipo="check" size={13} /> Copiado
                    </>
                  ) : (
                    <>
                      <Icono tipo="portapapeles" size={13} /> Copiar invitación
                    </>
                  )}
                </button>
              )}
              {evento.googleHtmlLink && (
                <a
                  href={evento.googleHtmlLink}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontFamily: "Inter, sans-serif",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#4285F4",
                    background: "#EAF1FE",
                    textDecoration: "none",
                    borderRadius: 20,
                    padding: "5px 12px",
                  }}
                >
                  <Icono tipo="calendario" size={13} /> Ver en Google Calendar
                </a>
              )}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
          <button onClick={() => descargarICS(evento)} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted, display: "flex" }} title="Agregar a Google Calendar / Outlook (.ics)">
            <Icono tipo="calendario" size={15} />
          </button>
          <button onClick={onEliminar} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted, display: "flex" }} title="Eliminar evento">
            <Icono tipo="papelera" size={15} />
          </button>
        </div>
      </div>
    </Card>
  );
}

export default function AgendaTab({ onListo }) {
  const { ids, eventos, cargado, crear, eliminar, actualizar } = useEventosAgenda();
  useEffect(() => {
    if (cargado) onListo?.();
  }, [cargado]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState({ titulo: "", fecha: "", hora: "", notas: "", crearMeet: true, invitados: "", recordatorio: "30" });
  const [errorForm, setErrorForm] = useState("");
  const [permisoNotif, setPermisoNotif] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  const [filtroTiempo, setFiltroTiempo] = useState("todos");
  const [soloTerminos, setSoloTerminos] = useState(false);
  const { confirmar, ConfirmarDialogo } = useConfirmarDialogo();

  // Conexión con Google Calendar: una vez conectada, cada evento nuevo se
  // crea también en el Google Calendar real del usuario (con Meet
  // automático), para que las notificaciones lleguen por la vía nativa de
  // Google en vez de depender solo del permiso de notificaciones del
  // navegador (que se pierde si Nomos no está abierto).
  const [googleConectado, setGoogleConectado] = useState(null);
  const [googleEmail, setGoogleEmail] = useState(null);
  const [conectandoGoogle, setConectandoGoogle] = useState(false);
  const [avisoGoogle, setAvisoGoogle] = useState("");

  const tokenActual = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || "";
  }, []);

  const consultarEstadoGoogle = useCallback(async () => {
    try {
      const token = await tokenActual();
      const resp = await fetch("/api/agenda/google-callback?estado=1", { headers: { Authorization: `Bearer ${token}` } });
      const datos = await resp.json();
      setGoogleConectado(!!datos.conectado);
      setGoogleEmail(datos.email || null);
    } catch {
      setGoogleConectado(false);
    }
  }, [tokenActual]);

  useEffect(() => {
    // Al volver de autorizar en Google, esta pestaña carga con
    // "#agenda?google=conectado" (o "=error") en el hash — se lee una vez,
    // se avisa, y se limpia para que un refresh no repita el aviso.
    const hash = window.location.hash.replace("#", "");
    const [, query] = hash.split("?");
    const parametros = new URLSearchParams(query || "");
    if (parametros.get("google") === "conectado") setAvisoGoogle("✓ Google Calendar conectado. Los eventos nuevos ya se crean también ahí.");
    else if (parametros.get("google") === "error") setAvisoGoogle("No se pudo conectar Google Calendar. Intenta de nuevo.");
    if (parametros.has("google")) window.history.replaceState(null, "", "#agenda");
    consultarEstadoGoogle();
  }, [consultarEstadoGoogle]);

  const conectarGoogle = async () => {
    setConectandoGoogle(true);
    try {
      const token = await tokenActual();
      const resp = await fetch("/api/agenda/google-callback?iniciar=1", { headers: { Authorization: `Bearer ${token}` } });
      const datos = await resp.json();
      if (!resp.ok || !datos.authUrl) throw new Error(datos.error || "No se pudo iniciar la conexión.");
      window.location.href = datos.authUrl;
    } catch (e) {
      setAvisoGoogle(e.message || "No se pudo iniciar la conexión con Google.");
      setConectandoGoogle(false);
    }
  };

  const desconectarGoogle = async () => {
    if (!(await confirmar("¿Desconectar Google Calendar? Los eventos nuevos dejarán de crearse ahí."))) return;
    try {
      const token = await tokenActual();
      await fetch("/api/agenda/google-callback", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ accion: "desconectar" }),
      });
    } catch {
      // no crítico: si falla, el siguiente intento de crear evento en
      // Google simplemente fallará también y avisará ahí
    }
    setGoogleConectado(false);
    setGoogleEmail(null);
  };

  const pedirPermiso = async () => {
    if (typeof Notification === "undefined") return;
    const resultado = await Notification.requestPermission();
    setPermisoNotif(resultado);
  };

  const guardar = async () => {
    const faltan = [];
    if (!form.titulo.trim()) faltan.push("el título");
    if (!form.fecha) faltan.push("la fecha");
    if (!form.hora) faltan.push("la hora");
    if (faltan.length > 0) {
      setErrorForm(`Falta ${faltan.join(", ")}.`);
      return;
    }
    setErrorForm("");
    const datosEvento = {
      titulo: form.titulo.trim(),
      fecha: form.fecha,
      hora: form.hora,
      notas: form.notas.trim(),
    };
    const invitados = form.invitados.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean);
    const crearMeet = form.crearMeet;
    const recordatorioMinutos = form.recordatorio === "" ? null : Number(form.recordatorio);
    const id = await crear(datosEvento);
    setForm({ titulo: "", fecha: "", hora: "", notas: "", crearMeet: true, invitados: "", recordatorio: "30" });
    setMostrarForm(false);

    if (googleConectado && id) {
      try {
        const token = await tokenActual();
        const resp = await fetch("/api/agenda/google-callback", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ accion: "crear_evento", ...datosEvento, crearMeet, invitados, recordatorioMinutos }),
        });
        const datos = await resp.json();
        if (resp.ok) {
          await actualizar(id, { googleEventoId: datos.googleEventoId, googleHtmlLink: datos.googleHtmlLink, googleMeetLink: datos.googleMeetLink });
        }
      } catch {
        // El evento en Nomos ya quedó guardado — que Google falle no debe
        // bloquear ni deshacer eso, solo se pierde el link de Meet.
      }
    }
  };

  const eliminarClick = async (id, titulo) => {
    if (!(await confirmar(`¿Eliminar el evento "${titulo}" de la agenda?`))) return;
    await eliminar(id);
  };

  const lista = ids
    .map((id) => ({ id, ...eventos[id] }))
    .filter((e) => e.titulo)
    .sort((a, b) => `${a.fecha}T${a.hora || "00:00"}`.localeCompare(`${b.fecha}T${b.hora || "00:00"}`));

  // OJO: .toISOString() siempre da la fecha en UTC, no en la hora local del
  // navegador — de noche en Colombia (UTC-5), UTC ya está en el día
  // siguiente, así que un evento de "hoy" quedaba comparado contra un "hoy"
  // que en realidad era mañana, y se colaba a "Pasados" (o desaparecía de
  // la vista) apenas se creaba. fechaLocalISO usa los métodos locales del
  // navegador (getFullYear/getMonth/getDate), que si sí respetan la zona
  // horaria real del dispositivo.
  const fechaLocalISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const hoyISO = fechaLocalISO(new Date());
  const finSemana = new Date();
  finSemana.setDate(finSemana.getDate() + (7 - finSemana.getDay()));
  const finSemanaISO = fechaLocalISO(finSemana);

  let proximos = lista.filter((e) => e.fecha >= hoyISO);
  if (filtroTiempo === "hoy") proximos = proximos.filter((e) => e.fecha === hoyISO);
  else if (filtroTiempo === "semana") proximos = proximos.filter((e) => e.fecha <= finSemanaISO);
  let pasados = lista.filter((e) => e.fecha < hoyISO);
  if (soloTerminos) {
    proximos = proximos.filter((e) => e.esTermino);
    pasados = pasados.filter((e) => e.esTermino);
  }

  return (
    <div>
      <EncabezadoSeccion titulo="Agenda" color="#8B5CF6" />

      {permisoNotif !== "granted" && permisoNotif !== "unsupported" && (
        <Card style={{ marginBottom: 20, background: COLORS.accentSoft, border: "1px solid #C7D6EA" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.navy, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
              <IconoCampana size={15} /> Activa las notificaciones para avisarte cuando llegue un evento.
            </p>
            <button className="drx-btn-primary" style={buttonPrimary} onClick={pedirPermiso}>
              Activar notificaciones
            </button>
          </div>
        </Card>
      )}

      {avisoGoogle && (
        <Card style={{ marginBottom: 20, background: avisoGoogle.startsWith("✓") ? "#F0FDF4" : "#FEF2F2", border: `1px solid ${avisoGoogle.startsWith("✓") ? "#BBF7D0" : "#F3C6C0"}` }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: avisoGoogle.startsWith("✓") ? "#166534" : "#B42318", margin: 0 }}>{avisoGoogle}</p>
        </Card>
      )}

      <Card
        style={{
          marginBottom: 20,
          borderLeft: `4px solid ${googleConectado ? "#10B981" : "#4285F4"}`,
          background: googleConectado ? "linear-gradient(135deg, " + COLORS.panel + " 0%, #F0FDF4 100%)" : COLORS.panel,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "#FFFFFF",
                border: `1px solid ${COLORS.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#4285F4",
                flexShrink: 0,
                boxShadow: "0 1px 3px rgba(16,24,40,0.08)",
              }}
            >
              <Icono tipo="calendario" size={20} />
            </div>
            <div>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, fontWeight: 700, color: COLORS.ink, margin: 0, display: "flex", alignItems: "center", gap: 7 }}>
                Google Calendar
                {googleConectado && (
                  <span style={{ fontFamily: "Inter, sans-serif", fontSize: 10.5, fontWeight: 700, color: "#166534", background: "#DCFCE7", borderRadius: 20, padding: "2px 9px" }}>
                    ● Conectado
                  </span>
                )}
              </p>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, margin: "3px 0 0" }}>
                {googleConectado === null
                  ? "Verificando..."
                  : googleConectado
                  ? `${googleEmail || "tu cuenta"} — cada evento nuevo se crea también ahí, con Meet.`
                  : "Sin conectar — los eventos nuevos solo quedan en Nomos."}
              </p>
            </div>
          </div>
          {googleConectado ? (
            <button className="drx-btn-ghost" style={buttonGhost} onClick={desconectarGoogle}>
              Desconectar
            </button>
          ) : (
            <button className="drx-btn-primary" style={{ ...buttonPrimary, background: "#4285F4" }} onClick={conectarGoogle} disabled={conectandoGoogle || googleConectado === null}>
              {conectandoGoogle ? "Conectando…" : "Conectar Google Calendar"}
            </button>
          )}
        </div>
      </Card>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {FILTROS_AGENDA.map((f) => (
            <button
              key={f.id}
              onClick={() => setFiltroTiempo(f.id)}
              className="drx-btn-ghost"
              style={{
                ...buttonGhost,
                padding: "6px 14px",
                fontSize: 12.5,
                background: filtroTiempo === f.id ? COLORS.navy : COLORS.panel,
                color: filtroTiempo === f.id ? "#FFFFFF" : COLORS.inkSoft,
                borderColor: filtroTiempo === f.id ? COLORS.navy : COLORS.border,
              }}
            >
              {f.nombre}
            </button>
          ))}
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.inkSoft, cursor: "pointer", marginLeft: 4 }}>
            <input type="checkbox" checked={soloTerminos} onChange={(e) => setSoloTerminos(e.target.checked)} />
            Solo términos procesales
          </label>
        </div>
        <button
          className="drx-btn-primary"
          style={buttonPrimary}
          onClick={() => {
            setErrorForm("");
            setMostrarForm((v) => !v);
          }}
        >
          {mostrarForm ? "Cancelar" : "+ Nuevo evento"}
        </button>
      </div>

      {mostrarForm && (
        <Card style={{ marginBottom: 20, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "18px 20px 16px", borderBottom: `1px solid ${COLORS.border}`, background: COLORS.surfaceSoft }}>
            <label style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4, display: "block", marginBottom: 6 }}>
              Título <span style={{ color: "#B42318" }}>*</span>
            </label>
            <input
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              placeholder="Ej: Asesoría con Juan Pérez"
              style={{
                width: "100%",
                border: `1.5px solid ${COLORS.border}`,
                borderRadius: 8,
                outline: "none",
                fontFamily: "Inter, sans-serif",
                fontSize: 18,
                fontWeight: 700,
                color: COLORS.ink,
                padding: "10px 12px",
                background: "#FFFFFF",
              }}
            />
          </div>

          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ width: 20, textAlign: "center", marginTop: 9, color: COLORS.muted }}>
                <Icono tipo="reloj" size={17} />
              </div>
              <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, flex: 1 }}>
                <Field label="Fecha">
                  <input className="drx-input" style={inputStyle} type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
                </Field>
                <Field label="Hora">
                  <input className="drx-input" style={inputStyle} type="time" value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })} />
                </Field>
              </div>
            </div>

            {googleConectado && (
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ width: 20, textAlign: "center", marginTop: 9, color: COLORS.muted }}>
                  <Icono tipo="video" size={17} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "Inter, sans-serif", fontSize: 13.5, color: COLORS.ink, cursor: "pointer" }}>
                    <input type="checkbox" checked={form.crearMeet} onChange={(e) => setForm({ ...form, crearMeet: e.target.checked })} />
                    Agregar videollamada de Google Meet
                  </label>
                  {!form.crearMeet && (
                    <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: COLORS.muted, margin: "3px 0 0 26px" }}>
                      Este evento se crea en tu Google Calendar sin Meet.
                    </p>
                  )}
                </div>
              </div>
            )}

            {googleConectado && (
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ width: 20, textAlign: "center", marginTop: 9, color: COLORS.muted }}>
                  <IconoCampana size={15} />
                </div>
                <div style={{ flex: 1 }}>
                  <Field label="Notificación">
                    <select
                      className="drx-input"
                      style={inputStyle}
                      value={form.recordatorio}
                      onChange={(e) => setForm({ ...form, recordatorio: e.target.value })}
                    >
                      {RECORDATORIOS_GOOGLE.map((r) => (
                        <option key={r.minutos} value={r.minutos}>
                          {r.etiqueta}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>
            )}

            {googleConectado && (
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ width: 20, textAlign: "center", marginTop: 9, color: COLORS.muted }}>
                  <Icono tipo="persona" size={17} />
                </div>
                <div style={{ flex: 1 }}>
                  <Field label="Invitados (opcional)">
                    <input
                      className="drx-input"
                      style={inputStyle}
                      value={form.invitados}
                      onChange={(e) => setForm({ ...form, invitados: e.target.value })}
                      placeholder="cliente@correo.com, colega@correo.com"
                    />
                  </Field>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: COLORS.muted, margin: "4px 0 0" }}>
                    Sepáralos con comas — a cada uno le llega la invitación de Google Calendar con el link.
                  </p>
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ width: 20, textAlign: "center", marginTop: 9, color: COLORS.muted }}>
                <Icono tipo="documento" size={17} />
              </div>
              <div style={{ flex: 1 }}>
                <textarea
                  className="drx-input"
                  style={{ ...inputStyle, resize: "vertical", minHeight: 60, fontFamily: "Inter, sans-serif" }}
                  value={form.notas}
                  onChange={(e) => setForm({ ...form, notas: e.target.value })}
                  placeholder="Agregar descripción"
                />
              </div>
            </div>

          </div>

          <div
            style={{
              padding: "14px 20px",
              background: COLORS.surfaceSoft,
              borderTop: `1px solid ${COLORS.border}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            {errorForm && (
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 600, color: "#B42318", margin: 0 }}>⚠ {errorForm}</p>
            )}
            <button className="drx-btn-primary" style={{ ...buttonPrimary, marginLeft: "auto" }} onClick={guardar}>
              Guardar evento
            </button>
          </div>
        </Card>
      )}

      {cargado && lista.length === 0 && <EstadoVacio icono={<Icono tipo="calendario" size={26} />} texto="No tienes eventos en tu agenda todavía." />}

      {proximos.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 10 }}>Próximos</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {proximos.map((e) => (
              <EventoAgendaCard key={e.id} evento={e} onEliminar={() => eliminarClick(e.id, e.titulo)} onCompletar={() => actualizar(e.id, { completado: !e.completado })} />
            ))}
          </div>
        </div>
      )}

      {pasados.length > 0 && (
        <div>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 10 }}>Pasados</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {pasados
              .slice()
              .reverse()
              .map((e) => (
                <EventoAgendaCard key={e.id} evento={e} onEliminar={() => eliminarClick(e.id, e.titulo)} pasado />
              ))}
          </div>
        </div>
      )}
      {ConfirmarDialogo}
    </div>
  );
}
