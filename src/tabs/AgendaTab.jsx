import { useState } from "react";
import {
  COLORS, EncabezadoSeccion, Card, buttonPrimary, buttonGhost, Field, inputStyle,
  Icono, IconoCampana, EstadoVacio, useConfirmarDialogo, useEventosAgenda,
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

function EventoAgendaCard({ evento, onEliminar, onCompletar, pasado }) {
  const fechaTexto = new Date(`${evento.fecha}T${evento.hora || "00:00"}:00`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
  return (
    <Card style={{ padding: 14, opacity: pasado || evento.completado ? 0.55 : 1 }}>
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
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 700, color: COLORS.ink, margin: 0, textTransform: "capitalize", textDecoration: evento.completado ? "line-through" : "none" }}>{evento.titulo}</p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, margin: "4px 0 0", textTransform: "capitalize" }}>
            {fechaTexto}
            {evento.hora ? ` · ${evento.hora}` : ""}
          </p>
          {evento.notas && <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.inkSoft, margin: "6px 0 0" }}>{evento.notas}</p>}
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

export default function AgendaTab() {
  const { ids, eventos, cargado, crear, eliminar, actualizar } = useEventosAgenda();
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState({ titulo: "", fecha: "", hora: "", notas: "" });
  const [permisoNotif, setPermisoNotif] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  const [filtroTiempo, setFiltroTiempo] = useState("todos");
  const { confirmar, ConfirmarDialogo } = useConfirmarDialogo();

  const pedirPermiso = async () => {
    if (typeof Notification === "undefined") return;
    const resultado = await Notification.requestPermission();
    setPermisoNotif(resultado);
  };

  const guardar = async () => {
    if (!form.titulo.trim() || !form.fecha) return;
    await crear({ titulo: form.titulo.trim(), fecha: form.fecha, hora: form.hora, notas: form.notas.trim() });
    setForm({ titulo: "", fecha: "", hora: "", notas: "" });
    setMostrarForm(false);
  };

  const eliminarClick = async (id, titulo) => {
    if (!(await confirmar(`¿Eliminar el evento "${titulo}" de la agenda?`))) return;
    await eliminar(id);
  };

  const lista = ids
    .map((id) => ({ id, ...eventos[id] }))
    .filter((e) => e.titulo)
    .sort((a, b) => `${a.fecha}T${a.hora || "00:00"}`.localeCompare(`${b.fecha}T${b.hora || "00:00"}`));

  const hoyISO = new Date().toISOString().slice(0, 10);
  const finSemana = new Date();
  finSemana.setDate(finSemana.getDate() + (7 - finSemana.getDay()));
  const finSemanaISO = finSemana.toISOString().slice(0, 10);

  let proximos = lista.filter((e) => e.fecha >= hoyISO);
  if (filtroTiempo === "hoy") proximos = proximos.filter((e) => e.fecha === hoyISO);
  else if (filtroTiempo === "semana") proximos = proximos.filter((e) => e.fecha <= finSemanaISO);
  const pasados = lista.filter((e) => e.fecha < hoyISO);

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
        </div>
        <button className="drx-btn-primary" style={buttonPrimary} onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? "Cancelar" : "+ Nuevo evento"}
        </button>
      </div>

      {mostrarForm && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Título">
              <input className="drx-input" style={inputStyle} value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ej: Audiencia con Juan Pérez" />
            </Field>
            <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Fecha">
                <input className="drx-input" style={inputStyle} type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
              </Field>
              <Field label="Hora (opcional)">
                <input className="drx-input" style={inputStyle} type="time" value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })} />
              </Field>
            </div>
            <Field label="Notas (opcional)">
              <textarea
                className="drx-input"
                style={{ ...inputStyle, resize: "vertical", minHeight: 60, fontFamily: "Inter, sans-serif" }}
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
                placeholder="Detalles del evento..."
              />
            </Field>
            <button className="drx-btn-primary" style={buttonPrimary} onClick={guardar} disabled={!form.titulo.trim() || !form.fecha}>
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
