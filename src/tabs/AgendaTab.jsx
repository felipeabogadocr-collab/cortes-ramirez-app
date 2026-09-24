import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  COLORS, EncabezadoSeccion, Card, buttonPrimary, buttonGhost, Field, inputStyle,
  Icono, IconoCampana, EstadoVacio, useConfirmarDialogo, useEventosAgenda, diasHasta, urgenciaTermino,
  useClientesLigero, calcularProximaFechaPorFrecuencia,
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

// Filtro por estado de la tarea, como en Google Tasks/Calendar — se calcula
// solo con datos que YA existen en cada evento (fecha + completado), sin
// agregar ningún campo nuevo: "vencida" es una próxima que ya pasó de fecha
// sin marcarse completada, no un estado aparte que alguien tenga que
// mantener a mano.
const FILTROS_TAREA = [
  { id: "todas", nombre: "Todas" },
  { id: "proximas", nombre: "Próximas" },
  { id: "vencidas", nombre: "Vencidas" },
  { id: "cumplidas", nombre: "Cumplidas" },
];

const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// Mismas frecuencias que ya usa el plan de pago de un cliente
// (calcularProximaFechaPorFrecuencia) — reutilizarla mantiene el mismo
// vocabulario en toda la app en vez de inventar uno nuevo solo para Agenda.
const REPETIR_OPCIONES = [
  { id: "no", nombre: "No se repite" },
  { id: "Semanal", nombre: "Cada semana" },
  { id: "Quincenal", nombre: "Cada quince días" },
  { id: "Mensual", nombre: "Cada mes" },
];
const REPETICIONES_OPCIONES = [2, 3, 4, 6, 8, 12];

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

function EventoAgendaCard({ evento, onEliminar, onCompletar, onEditar, onSincronizar, sincronizando, pasado, googleConectado }) {
  const fechaTexto = new Date(`${evento.fecha}T${evento.hora || "00:00"}:00`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
  // Con el encabezado de día nuevo (Hoy / Mañana / día de la semana) arriba
  // de cada grupo, repetir la fecha completa en cada tarjeta ya es
  // redundante — aquí solo se muestra la hora, en formato de 12 horas, más
  // parecida a como se ve en un calendario real.
  const horaTexto = evento.hora
    ? new Date(`${evento.fecha}T${evento.hora}:00`).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", hour12: true })
    : "Todo el día";
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
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted, margin: "4px 0 0" }}>
            <strong style={{ color: COLORS.ink, fontWeight: 700 }}>{horaTexto}</strong>
            {evento.esTermino && evento.clienteRelacionado ? ` · ${evento.clienteRelacionado}` : ""}
            {evento.clienteNombre ? ` · ${evento.clienteNombre}` : ""}
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
          {onEditar && (
            <button onClick={onEditar} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted, display: "flex" }} title="Editar evento">
              <Icono tipo="lapiz" size={15} />
            </button>
          )}
          {onSincronizar && evento.googleEventoId && (
            <button
              onClick={onSincronizar}
              disabled={sincronizando}
              style={{ background: "none", border: "none", cursor: sincronizando ? "default" : "pointer", color: COLORS.muted, display: "flex", opacity: sincronizando ? 0.45 : 1 }}
              title="Traer cambios hechos directo en Google Calendar"
            >
              <Icono tipo="refrescar" size={15} />
            </button>
          )}
          {!googleConectado && (
            <button onClick={() => descargarICS(evento)} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted, display: "flex" }} title="Agregar a Google Calendar / Outlook (.ics)">
              <Icono tipo="calendario" size={15} />
            </button>
          )}
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
  const [editandoId, setEditandoId] = useState(null);
  const FORM_VACIO = { titulo: "", fecha: "", hora: "", notas: "", crearMeet: true, invitados: "", recordatorio: "30", clienteId: "", repetir: "no", repeticiones: "4" };
  const [form, setForm] = useState(FORM_VACIO);
  const [errorForm, setErrorForm] = useState("");
  const [sincronizandoId, setSincronizandoId] = useState(null);
  const { clientes: clientesLigero, cargado: clientesCargados } = useClientesLigero();
  const [permisoNotif, setPermisoNotif] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  const [filtroTarea, setFiltroTarea] = useState("todas");
  const [vista, setVista] = useState("agenda");
  const [mesVisto, setMesVisto] = useState(() => {
    const d = new Date();
    return { anio: d.getFullYear(), mes: d.getMonth() };
  });
  const [diaSeleccionadoMes, setDiaSeleccionadoMes] = useState(null);
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

  const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Crea (o actualiza) UNA sola ocurrencia: en Nomos siempre, y en Google
  // Calendar también si hay conexión. Se usa tanto para un evento suelto
  // como para cada fecha de un evento que se repite — Nomos no maneja
  // "series" ni RRULE de Google, cada ocurrencia es su propio evento
  // independiente (se puede editar o borrar una sin afectar a las demás).
  const guardarUnaOcurrencia = async ({ datosEvento, invitados, crearMeet, recordatorioMinutos, editandoAntes, googleEventoIdAntes }) => {
    let id;
    if (editandoAntes) {
      await actualizar(editandoAntes, datosEvento);
      id = editandoAntes;
    } else {
      id = await crear(datosEvento);
    }
    if (googleConectado && id) {
      try {
        const token = await tokenActual();
        const accion = googleEventoIdAntes ? "actualizar_evento" : "crear_evento";
        const resp = await fetch("/api/agenda/google-callback", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ accion, googleEventoId: googleEventoIdAntes, ...datosEvento, crearMeet, invitados, recordatorioMinutos }),
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

  const guardar = async () => {
    const invitados = form.invitados.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean);
    const faltan = [];
    if (!form.titulo.trim()) faltan.push("el título");
    if (!form.fecha) faltan.push("la fecha");
    if (!form.hora) faltan.push("la hora");
    // El correo del invitado es obligatorio solo al CREAR un evento nuevo,
    // y solo cuando hay Google Calendar conectado (sin conexión ni siquiera
    // existe el campo). Al editar uno ya existente se deja opcional: Google
    // no le devuelve a Nomos la lista de invitados de un evento ya creado,
    // así que ese campo siempre arranca vacío al editar — exigirlo ahí
    // bloquearía corregir hasta un simple error de dedo en el título.
    if (googleConectado && !editandoId) {
      if (invitados.length === 0) faltan.push("el correo del invitado");
      else if (!invitados.every((correo) => REGEX_CORREO.test(correo))) faltan.push("un correo válido del invitado");
    }
    if (faltan.length > 0) {
      setErrorForm(`Falta ${faltan.join(", ")}.`);
      return;
    }
    setErrorForm("");
    const crearMeet = form.crearMeet;
    const recordatorioMinutos = form.recordatorio === "" ? null : Number(form.recordatorio);
    const editandoAntes = editandoId;
    const googleEventoIdAntes = editandoId ? eventos[editandoId]?.googleEventoId : null;

    // Las fechas de las ocurrencias siguientes se calculan con la misma
    // función que ya usa el plan de pago de un cliente para su próxima
    // cuota — un evento que se repite es, ni más ni menos, la misma idea
    // aplicada a la Agenda.
    const fechasOcurrencias = [form.fecha];
    if (!editandoAntes && form.repetir !== "no") {
      let fechaAnterior = form.fecha;
      for (let i = 1; i < Number(form.repeticiones); i++) {
        fechaAnterior = calcularProximaFechaPorFrecuencia(fechaAnterior, form.repetir);
        fechasOcurrencias.push(fechaAnterior);
      }
    }

    for (let i = 0; i < fechasOcurrencias.length; i++) {
      const datosEvento = {
        titulo: form.titulo.trim(),
        fecha: fechasOcurrencias[i],
        hora: form.hora,
        notas: form.notas.trim(),
        clienteId: form.clienteId || "",
        clienteNombre: form.clienteId ? clientesLigero[form.clienteId]?.nombre || "" : "",
      };
      // Cada ocurrencia es independiente, así que solo la primera (o la
      // que se está editando) puede reutilizar un googleEventoId existente
      // — las siguientes de una serie nueva siempre son eventos nuevos.
      await guardarUnaOcurrencia({
        datosEvento,
        invitados,
        crearMeet,
        recordatorioMinutos,
        editandoAntes: i === 0 ? editandoAntes : null,
        googleEventoIdAntes: i === 0 ? googleEventoIdAntes : null,
      });
    }

    setForm(FORM_VACIO);
    setMostrarForm(false);
    setEditandoId(null);
  };

  const editarClick = (id) => {
    const e = eventos[id];
    if (!e) return;
    setForm({
      titulo: e.titulo || "",
      fecha: e.fecha || "",
      hora: e.hora || "",
      notas: e.notas || "",
      crearMeet: !!e.googleMeetLink,
      invitados: "",
      recordatorio: "30",
      clienteId: e.clienteId || "",
    });
    setEditandoId(id);
    setErrorForm("");
    setMostrarForm(true);
  };

  const cancelarForm = () => {
    setErrorForm("");
    setForm(FORM_VACIO);
    setEditandoId(null);
    setMostrarForm(false);
  };

  // Si venís de la vista Mes con un día elegido, "+ Nuevo evento" arranca
  // el formulario con esa fecha ya puesta — igual que en Google Calendar,
  // donde hacer clic en un día del mes abre el evento nuevo ya fechado ahí.
  const abrirNuevoEvento = () => {
    setErrorForm("");
    setEditandoId(null);
    setForm(vista === "mes" && diaSeleccionadoMes ? { ...FORM_VACIO, fecha: diaSeleccionadoMes } : FORM_VACIO);
    setMostrarForm(true);
  };

  const eliminarClick = async (id, titulo) => {
    if (!(await confirmar(`¿Eliminar el evento "${titulo}" de la agenda?`))) return;
    await eliminar(id);
  };

  // Trae el estado ACTUAL del evento desde Google Calendar (por si lo
  // moviste de hora o le cambiaste el título directo en Google/el celular)
  // y actualiza la copia de Nomos si cambió algo. No es en tiempo real —
  // hay que pedirlo con este botón — un watch de verdad necesitaría
  // registrar un canal de notificaciones push con Google (dominio
  // verificado, renovarlo cada semana), demasiada infraestructura nueva
  // para lo que aporta en un despacho chico.
  const sincronizarClick = async (id) => {
    const e = eventos[id];
    if (!e?.googleEventoId) return;
    setSincronizandoId(id);
    try {
      const token = await tokenActual();
      const resp = await fetch("/api/agenda/google-callback", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ accion: "consultar_evento", googleEventoId: e.googleEventoId }),
      });
      const datos = await resp.json();
      if (resp.ok && datos.estado === "borrado") {
        if (await confirmar(`"${e.titulo}" ya no existe en Google Calendar (lo borraron allá). ¿Borrarlo también de Nomos?`)) {
          await eliminar(id);
        }
      } else if (resp.ok && datos.estado === "vigente") {
        await actualizar(id, {
          titulo: datos.titulo || e.titulo,
          fecha: datos.fecha || e.fecha,
          hora: datos.hora || "",
          notas: datos.notas || "",
          googleHtmlLink: datos.googleHtmlLink,
          googleMeetLink: datos.googleMeetLink,
        });
      }
    } catch {
      // Silencioso: sincronizar es un "por si acaso", no algo crítico —
      // Nomos se queda con la última versión que sí tenía.
    }
    setSincronizandoId(null);
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

  // "Vencida" no es un campo aparte que alguien tenga que marcar a mano: es
  // simplemente una próxima a la que ya se le pasó la fecha sin completarse
  // — se calcula sola con lo que el evento ya tiene (fecha + completado).
  const cumpleFiltroTarea = (e) => {
    if (filtroTarea === "cumplidas") return !!e.completado;
    if (filtroTarea === "vencidas") return !e.completado && e.fecha < hoyISO;
    if (filtroTarea === "proximas") return !e.completado && e.fecha >= hoyISO;
    return true;
  };
  const listaFiltrada = lista.filter(cumpleFiltroTarea);

  let proximos = listaFiltrada.filter((e) => e.fecha >= hoyISO);
  let pasados = listaFiltrada.filter((e) => e.fecha < hoyISO);

  // Vista tipo "agenda de calendario": en vez de una lista plana, los
  // eventos se agrupan por día con un encabezado propio (Hoy / Mañana /
  // día de la semana), igual que la vista "Agenda" de Google Calendar —
  // más fácil de escanear de un vistazo que solo fecha+hora pegados en
  // cada tarjeta.
  const mananaISO = fechaLocalISO(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const etiquetaFecha = (fechaISO) => {
    if (fechaISO === hoyISO) return "Hoy";
    if (fechaISO === mananaISO) return "Mañana";
    return new Date(`${fechaISO}T12:00:00`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
  };
  const agruparPorFecha = (arr) => {
    const grupos = [];
    arr.forEach((e) => {
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.fecha === e.fecha) ultimo.eventos.push(e);
      else grupos.push({ fecha: e.fecha, eventos: [e] });
    });
    return grupos;
  };
  const gruposProximos = agruparPorFecha(proximos);
  const gruposPasados = agruparPorFecha(pasados.slice().reverse());

  // Vista Mes: una grilla de 6 semanas (42 días, siempre empezando en
  // lunes) como la de Google Calendar. Se arma a partir de la MISMA lista
  // ya filtrada por tarea — nunca de datos aparte — para que lo que se ve
  // en Mes y en Agenda sea siempre exactamente lo mismo, solo presentado
  // distinto.
  const eventosPorDiaMes = {};
  listaFiltrada.forEach((e) => {
    (eventosPorDiaMes[e.fecha] ||= []).push(e);
  });
  const primerDiaMes = new Date(mesVisto.anio, mesVisto.mes, 1);
  const offsetLunes = (primerDiaMes.getDay() + 6) % 7;
  const inicioGrillaMes = new Date(mesVisto.anio, mesVisto.mes, 1 - offsetLunes);
  const diasGrillaMes = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(inicioGrillaMes);
    d.setDate(inicioGrillaMes.getDate() + i);
    return d;
  });
  const nombreMesVisto = new Date(mesVisto.anio, mesVisto.mes, 1).toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  const cambiarMes = (delta) => {
    setDiaSeleccionadoMes(null);
    setMesVisto((prev) => {
      const d = new Date(prev.anio, prev.mes + delta, 1);
      return { anio: d.getFullYear(), mes: d.getMonth() };
    });
  };
  const irAHoy = () => {
    const d = new Date();
    setMesVisto({ anio: d.getFullYear(), mes: d.getMonth() });
    setDiaSeleccionadoMes(hoyISO);
  };
  const eventosDelDiaSeleccionado = diaSeleccionadoMes ? eventosPorDiaMes[diaSeleccionadoMes] || [] : [];

  return (
    <div>
      <EncabezadoSeccion
        titulo="Agenda"
        color="#8B5CF6"
        icono={<Icono tipo="calendario" size={19} />}
        subtitulo="Tus eventos y asesorías, todo en un solo lugar — sin perder ni una."
      />

      {permisoNotif !== "granted" && permisoNotif !== "unsupported" && !googleConectado && (
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

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: 10.5, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.6 }}>
              Vista — cómo ver tu calendario
            </span>
            <div style={{ display: "flex", gap: 3, background: COLORS.surfaceSoft, border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: 3 }}>
              {[
                { id: "agenda", nombre: "Agenda" },
                { id: "mes", nombre: "Mes" },
              ].map((v) => (
                <button
                  key={v.id}
                  onClick={() => setVista(v.id)}
                  className="drx-btn-ghost"
                  style={{
                    border: "none",
                    borderRadius: 7,
                    padding: "6px 16px",
                    fontSize: 12.5,
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 700,
                    cursor: "pointer",
                    background: vista === v.id ? "linear-gradient(135deg, #8B5CF6 0%, #6D4FD1 100%)" : "transparent",
                    color: vista === v.id ? "#FFFFFF" : COLORS.inkSoft,
                    boxShadow: vista === v.id ? "0 2px 6px rgba(109,79,209,0.35)" : "none",
                  }}
                >
                  {v.nombre}
                </button>
              ))}
            </div>
          </div>
          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: COLORS.muted, background: COLORS.surfaceSoft, border: `1px solid ${COLORS.border}`, borderRadius: 20, padding: "5px 11px", marginBottom: 3 }}>
            {listaFiltrada.length} evento{listaFiltrada.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          className="drx-btn-primary drx-cta-shine"
          style={{
            ...buttonPrimary,
            display: "inline-flex",
            alignItems: "center",
            gap: 9,
            padding: "13px 24px",
            fontSize: 15,
            background: mostrarForm ? buttonPrimary.background : "linear-gradient(135deg, #8B5CF6 0%, #6D4FD1 100%)",
            boxShadow: mostrarForm ? buttonPrimary.boxShadow : "0 6px 20px rgba(109,79,209,0.4), inset 0 1px 0 rgba(255,255,255,0.18)",
          }}
          onClick={mostrarForm ? cancelarForm : abrirNuevoEvento}
        >
          {mostrarForm ? (
            "Cancelar"
          ) : (
            <>
              <span style={{ fontSize: 19, lineHeight: 1, fontWeight: 400 }}>+</span> Nuevo evento
            </>
          )}
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {FILTROS_TAREA.map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltroTarea(f.id)}
            className="drx-btn-ghost"
            style={{
              ...buttonGhost,
              padding: "6px 14px",
              fontSize: 12.5,
              background: filtroTarea === f.id ? COLORS.navy : COLORS.panel,
              color: filtroTarea === f.id ? "#FFFFFF" : COLORS.inkSoft,
              borderColor: filtroTarea === f.id ? COLORS.navy : COLORS.border,
            }}
          >
            {f.nombre}
          </button>
        ))}
      </div>

      {mostrarForm && (
        <Card style={{ marginBottom: 20, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "18px 20px 16px", borderBottom: `1px solid ${COLORS.border}`, background: COLORS.surfaceSoft }}>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 700, color: COLORS.accentBright, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 8px" }}>
              {editandoId ? "Editando evento" : "Nuevo evento"}
            </p>
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
                <Field label={<>Fecha <span style={{ color: "#B42318" }}>*</span></>}>
                  <input className="drx-input" style={inputStyle} type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
                </Field>
                <Field label={<>Hora <span style={{ color: "#B42318" }}>*</span></>}>
                  <input className="drx-input" style={inputStyle} type="time" value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })} />
                </Field>
              </div>
            </div>

            {!editandoId && (
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ width: 20, textAlign: "center", marginTop: 9, color: COLORS.muted }}>
                  <Icono tipo="refrescar" size={17} />
                </div>
                <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: form.repetir === "no" ? "1fr" : "1fr 1fr", gap: 12, flex: 1 }}>
                  <Field label="Repetir">
                    <select className="drx-input" style={inputStyle} value={form.repetir} onChange={(e) => setForm({ ...form, repetir: e.target.value })}>
                      {REPETIR_OPCIONES.map((r) => (
                        <option key={r.id} value={r.id}>{r.nombre}</option>
                      ))}
                    </select>
                  </Field>
                  {form.repetir !== "no" && (
                    <Field label="Cuántas veces">
                      <select className="drx-input" style={inputStyle} value={form.repeticiones} onChange={(e) => setForm({ ...form, repeticiones: e.target.value })}>
                        {REPETICIONES_OPCIONES.map((n) => (
                          <option key={n} value={n}>{n} veces</option>
                        ))}
                      </select>
                    </Field>
                  )}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ width: 20, textAlign: "center", marginTop: 9, color: COLORS.muted }}>
                <Icono tipo="persona" size={17} />
              </div>
              <div style={{ flex: 1 }}>
                <Field label="Cliente relacionado (opcional)">
                  <select
                    className="drx-input"
                    style={inputStyle}
                    value={form.clienteId}
                    onChange={(e) => setForm({ ...form, clienteId: e.target.value })}
                  >
                    <option value="">{clientesCargados ? "Ninguno" : "Cargando..."}</option>
                    {Object.entries(clientesLigero).map(([id, c]) => (
                      <option key={id} value={id}>{c.nombre}</option>
                    ))}
                  </select>
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
                  <Field label={editandoId ? "Correo del invitado (opcional)" : <>Correo del invitado <span style={{ color: "#B42318" }}>*</span></>}>
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
              {editandoId
                ? "Guardar cambios"
                : !editandoId && form.repetir !== "no"
                ? `Guardar ${form.repeticiones} eventos`
                : "Guardar evento"}
            </button>
          </div>
        </Card>
      )}

      {cargado && lista.length === 0 && <EstadoVacio icono={<Icono tipo="calendario" size={26} />} texto="No tienes eventos en tu agenda todavía." />}

      {cargado && lista.length > 0 && listaFiltrada.length === 0 && (
        <EstadoVacio icono={<Icono tipo="calendario" size={26} />} texto="Ningún evento coincide con este filtro." />
      )}

      {vista === "mes" && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 10, flexWrap: "wrap" }}>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 800, color: COLORS.ink, margin: 0, textTransform: "capitalize" }}>{nombreMesVisto}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button className="drx-btn-ghost" style={{ ...buttonGhost, padding: "5px 10px", fontSize: 13 }} onClick={() => cambiarMes(-1)} title="Mes anterior">
                ‹
              </button>
              <button className="drx-btn-ghost" style={{ ...buttonGhost, padding: "5px 12px", fontSize: 12 }} onClick={irAHoy}>
                Hoy
              </button>
              <button className="drx-btn-ghost" style={{ ...buttonGhost, padding: "5px 10px", fontSize: 13 }} onClick={() => cambiarMes(1)} title="Mes siguiente">
                ›
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, background: COLORS.border, border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: "hidden" }}>
            {DIAS_SEMANA.map((d) => (
              <div key={d} style={{ background: COLORS.surfaceSoft, padding: "7px 4px", textAlign: "center", fontFamily: "Inter, sans-serif", fontSize: 10.5, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase" }}>
                {d}
              </div>
            ))}
            {diasGrillaMes.map((d) => {
              const fechaCelda = fechaLocalISO(d);
              const eventosDia = eventosPorDiaMes[fechaCelda] || [];
              const fueraDeMes = d.getMonth() !== mesVisto.mes;
              const esHoy = fechaCelda === hoyISO;
              const seleccionado = fechaCelda === diaSeleccionadoMes;
              return (
                <button
                  key={fechaCelda}
                  className="drx-dia-mes"
                  title={eventosDia.length > 0 ? `${eventosDia.length} evento${eventosDia.length !== 1 ? "s" : ""} — clic para ver o agregar` : "Clic para agregar un evento este día"}
                  onClick={() => setDiaSeleccionadoMes(seleccionado ? null : fechaCelda)}
                  style={{
                    background: seleccionado ? "#F3EEFE" : "#FFFFFF",
                    border: "none",
                    cursor: "pointer",
                    minHeight: 74,
                    padding: "6px 5px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                    alignItems: "flex-start",
                    opacity: fueraDeMes ? 0.4 : 1,
                    textAlign: "left",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "Inter, sans-serif",
                      fontSize: 11.5,
                      fontWeight: esHoy ? 800 : 600,
                      color: esHoy ? "#FFFFFF" : COLORS.ink,
                      background: esHoy ? "#8B5CF6" : "transparent",
                      borderRadius: "50%",
                      width: 20,
                      height: 20,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {d.getDate()}
                  </span>
                  {eventosDia.slice(0, 2).map((e) => (
                    <span
                      key={e.id}
                      style={{
                        fontFamily: "Inter, sans-serif",
                        fontSize: 9.5,
                        fontWeight: 600,
                        color: e.completado ? COLORS.muted : "#6D4FD1",
                        background: e.completado ? COLORS.surfaceSoft : "#EEE9FC",
                        borderRadius: 4,
                        padding: "1px 4px",
                        width: "100%",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        textDecoration: e.completado ? "line-through" : "none",
                      }}
                    >
                      {e.titulo}
                    </span>
                  ))}
                  {eventosDia.length > 2 && (
                    <span style={{ fontFamily: "Inter, sans-serif", fontSize: 9.5, fontWeight: 700, color: COLORS.muted }}>+{eventosDia.length - 2} más</span>
                  )}
                </button>
              );
            })}
          </div>

          {!diaSeleccionadoMes && (
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, textAlign: "center", margin: "12px 0 0" }}>
              Toca un día para ver o agregar sus eventos.
            </p>
          )}

          {diaSeleccionadoMes && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 10, flexWrap: "wrap" }}>
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4, margin: 0 }}>
                  {etiquetaFecha(diaSeleccionadoMes)}
                </p>
                {!mostrarForm && (
                  <button className="drx-btn-ghost" style={{ ...buttonGhost, padding: "5px 12px", fontSize: 12, color: "#6D4FD1", borderColor: "#D9CEF5" }} onClick={abrirNuevoEvento}>
                    + Agregar evento este día
                  </button>
                )}
              </div>
              {eventosDelDiaSeleccionado.length === 0 ? (
                <EstadoVacio icono={<Icono tipo="calendario" size={22} />} texto="Sin eventos este día." />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {eventosDelDiaSeleccionado.map((e) => (
                    <EventoAgendaCard
                      key={e.id}
                      evento={e}
                      onEliminar={() => eliminarClick(e.id, e.titulo)}
                      onCompletar={() => actualizar(e.id, { completado: !e.completado })}
                      onEditar={() => editarClick(e.id)}
                      onSincronizar={() => sincronizarClick(e.id)}
                      sincronizando={sincronizandoId === e.id}
                      googleConectado={googleConectado}
                      pasado={diaSeleccionadoMes < hoyISO}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {vista === "agenda" && gruposProximos.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>Próximos</p>
          {gruposProximos.map((grupo, i) => (
            <div key={grupo.fecha}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 9, margin: i === 0 ? "10px 0 10px" : "20px 0 10px" }}>
                <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, fontWeight: 800, color: grupo.fecha === hoyISO ? "#6D4FD1" : COLORS.ink, textTransform: "capitalize", whiteSpace: "nowrap" }}>
                  {etiquetaFecha(grupo.fecha)}
                </span>
                {grupo.fecha === hoyISO && (
                  <span style={{ fontFamily: "Inter, sans-serif", fontSize: 10, fontWeight: 700, color: "#FFFFFF", background: "#8B5CF6", borderRadius: 20, padding: "1px 8px", flexShrink: 0 }}>
                    HOY
                  </span>
                )}
                <span style={{ flex: 1, height: 1, background: COLORS.border }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {grupo.eventos.map((e) => (
                  <EventoAgendaCard
                    key={e.id}
                    evento={e}
                    onEliminar={() => eliminarClick(e.id, e.titulo)}
                    onCompletar={() => actualizar(e.id, { completado: !e.completado })}
                    onEditar={() => editarClick(e.id)}
                    onSincronizar={() => sincronizarClick(e.id)}
                    sincronizando={sincronizandoId === e.id}
                    googleConectado={googleConectado}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {vista === "agenda" && gruposPasados.length > 0 && (
        <div>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>Pasados</p>
          {gruposPasados.map((grupo, i) => (
            <div key={grupo.fecha}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 9, margin: i === 0 ? "10px 0 10px" : "20px 0 10px" }}>
                <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 700, color: COLORS.muted, textTransform: "capitalize", whiteSpace: "nowrap" }}>
                  {etiquetaFecha(grupo.fecha)}
                </span>
                <span style={{ flex: 1, height: 1, background: COLORS.border }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {grupo.eventos.map((e) => (
                  <EventoAgendaCard
                    key={e.id}
                    evento={e}
                    onEliminar={() => eliminarClick(e.id, e.titulo)}
                    onEditar={() => editarClick(e.id)}
                    onSincronizar={() => sincronizarClick(e.id)}
                    sincronizando={sincronizandoId === e.id}
                    googleConectado={googleConectado}
                    pasado
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {ConfirmarDialogo}
    </div>
  );
}
