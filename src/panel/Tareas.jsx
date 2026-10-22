// Tareas internas del despacho (ver useTareas en App.jsx): asignar algo
// puntual a un colega dentro del proceso de un cliente, y que quien la
// asignó pueda ver quién tiene qué y si ya está resuelta.

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { COLORS, Field, inputStyle, buttonPrimary, buttonGhost, Card } from "../ui/base.jsx";
import { AvatarIniciales, fechaHoyISO, registrarAuditoria, useTareas, useUsuariosDespacho, useClientesLigero, useConfirmarDialogo } from "../App.jsx";

const AMBAR = "#D97706";

// Cada tarea con fecha se vuelve un evento de Google Calendar (ver
// "evento_tarea" en api/agenda/google-callback.js): en el calendario del
// colega si conectó su Google, o como invitación a su Gmail desde el
// calendario de quien la asignó. Si ninguno conectó Google, la tarea
// sigue funcionando igual dentro de Nomos.
async function llamarGoogleTarea(cuerpo) {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return null;
    const r = await fetch("/api/agenda/google-callback", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(cuerpo),
    });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

function horaLegible(hora) {
  if (!hora) return "";
  const [h, m] = hora.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "a. m." : "p. m."}`;
}

function etiquetaLimite(fecha, hora) {
  if (!fecha) return null;
  const conHora = hora ? ` · ${horaLegible(hora)}` : "";
  const hoy = fechaHoyISO();
  const d = Math.round((new Date(`${fecha}T12:00:00`) - new Date(`${hoy}T12:00:00`)) / 86400000);
  if (d < 0) return { texto: `Venció hace ${-d} día${d === -1 ? "" : "s"}`, color: "#B42318", fondo: "#FEF2F2" };
  if (d === 0) return { texto: `Vence hoy${conHora}`, color: "#B42318", fondo: "#FEF2F2" };
  if (d === 1) return { texto: `Vence mañana${conHora}`, color: "#B45309", fondo: "#FEF3E2" };
  return { texto: `Vence ${new Date(`${fecha}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}${conHora}`, color: COLORS.inkSoft, fondo: COLORS.surfaceSoft };
}

function Chip({ texto, color, fondo }) {
  return <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 700, color, background: fondo, borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap" }}>{texto}</span>;
}

function FilaTarea({ tarea, yoId, esAdmin, nueva, mostrarCliente, onAlternar, onEliminar }) {
  const hecha = tarea.estado === "hecha";
  const puedeMarcar = esAdmin || yoId === tarea.asignadoA || yoId === tarea.creadoPor;
  const puedeEliminar = esAdmin || yoId === tarea.creadoPor;
  const limite = !hecha ? etiquetaLimite(tarea.fechaLimite, tarea.hora) : null;
  const paraMi = tarea.asignadoA === yoId;
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 0", borderTop: `1px solid ${COLORS.border}` }}>
      <button
        type="button"
        onClick={() => puedeMarcar && onAlternar(tarea)}
        disabled={!puedeMarcar}
        title={hecha ? "Marcar como pendiente" : "Marcar como resuelta"}
        aria-label={hecha ? "Marcar como pendiente" : "Marcar como resuelta"}
        style={{
          width: 24,
          height: 24,
          flexShrink: 0,
          marginTop: 1,
          borderRadius: 8,
          border: `2px solid ${hecha ? "#16A34A" : COLORS.border}`,
          background: hecha ? "#16A34A" : "transparent",
          color: "#fff",
          cursor: puedeMarcar ? "pointer" : "default",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
        }}
      >
        {hecha && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        )}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, fontWeight: 700, color: hecha ? COLORS.muted : COLORS.ink, lineHeight: 1.35, margin: 0 }}>
          <span style={{ textDecoration: hecha ? "line-through" : "none" }}>{tarea.titulo}</span>
          {nueva && <span style={{ marginLeft: 8, verticalAlign: 1, display: "inline-block" }}><Chip texto={hecha ? "Recién resuelta" : "Nueva"} color="#fff" fondo={hecha ? "#16A34A" : AMBAR} /></span>}
        </p>
        {tarea.detalle && <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.inkSoft, margin: "3px 0 0", lineHeight: 1.45 }}>{tarea.detalle}</p>}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 7 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.inkSoft, fontWeight: 600 }}>
            <AvatarIniciales nombre={tarea.asignadoNombre} size={20} />
            {paraMi ? "Tú" : tarea.asignadoNombre || "Sin asignar"}
          </span>
          {mostrarCliente && tarea.clienteNombre && <Chip texto={tarea.clienteNombre} color={COLORS.navy} fondo={`${COLORS.navy}14`} />}
          {hecha ? (
            <Chip
              texto={`Resuelta${tarea.completadoPorNombre && tarea.completadoPor !== yoId ? ` por ${tarea.completadoPorNombre.split(" ")[0]}` : ""} · ${new Date(tarea.completadoEn).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}`}
              color="#166534"
              fondo="#DCFCE7"
            />
          ) : (
            <Chip texto="Pendiente" color="#B45309" fondo="#FEF3C7" />
          )}
          {limite && <Chip {...limite} />}
          {!hecha && !tarea.fechaLimite && <Chip texto="Sin fecha · no urgente" color={COLORS.muted} fondo={COLORS.surfaceSoft} />}
          {tarea.googleEventoId && (
            <a
              href={tarea.googleHtmlLink || "https://calendar.google.com/"}
              target="_blank"
              rel="noopener noreferrer"
              title={tarea.duenoEvento === "creador" ? "Le llegó como invitación a su Gmail" : "Está en su Google Calendar"}
              style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 700, color: "#1A73E8", background: "#E8F0FE", borderRadius: 999, padding: "3px 9px", textDecoration: "none", whiteSpace: "nowrap" }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
              Google Calendar
            </a>
          )}
          {tarea.creadoPor !== tarea.asignadoA && tarea.creadoPor !== yoId && (
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: COLORS.muted }}>
              · la asignó {(tarea.creadoPorNombre || "").split(" ")[0]}
            </span>
          )}
        </div>
      </div>
      {puedeEliminar && (
        <button type="button" onClick={() => onEliminar(tarea)} title="Eliminar tarea" aria-label="Eliminar tarea" style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted, padding: 4, flexShrink: 0 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      )}
    </div>
  );
}

function FormularioTarea({ usuarios, yo, clientes, clienteFijo, onCrear, onCancelar }) {
  const [titulo, setTitulo] = useState("");
  const [asignadoA, setAsignadoA] = useState("");
  const [conFecha, setConFecha] = useState(true);
  const [fechaLimite, setFechaLimite] = useState("");
  const [hora, setHora] = useState("");
  const [detalle, setDetalle] = useState("");
  const [clienteId, setClienteId] = useState(clienteFijo?.id || "");
  const [guardando, setGuardando] = useState(false);
  const valido = titulo.trim() && asignadoA && (!conFecha || fechaLimite);
  const elegido = usuarios.find((x) => x.id === asignadoA);

  const guardar = async () => {
    if (!valido) return;
    setGuardando(true);
    const u = usuarios.find((x) => x.id === asignadoA);
    await onCrear({
      titulo,
      detalle,
      fechaLimite: conFecha ? fechaLimite : "",
      hora: conFecha ? hora : "",
      asignadoA,
      asignadoNombre: u?.nombre || "",
      clienteId: clienteFijo?.id || clienteId || null,
      clienteNombre: clienteFijo?.nombre || (clienteId ? clientes?.[clienteId]?.nombre : "") || "",
    });
    setGuardando(false);
  };

  return (
    <div style={{ background: COLORS.surfaceSoft, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 14, marginTop: 10 }}>
      <Field label="¿Qué hay que hacer?">
        <input className="drx-input" style={inputStyle} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej: Proyectar la contestación de la demanda" autoFocus />
      </Field>
      <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: clienteFijo ? "1fr 1fr" : "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
        <Field label="Asignar a">
          <select className="drx-input" style={inputStyle} value={asignadoA} onChange={(e) => setAsignadoA(e.target.value)}>
            <option value="">Elige un colega…</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.id === yo.id ? `${u.nombre} (yo)` : u.nombre}
              </option>
            ))}
          </select>
        </Field>
        {!clienteFijo && (
          <Field label="Cliente (opcional)">
            <select className="drx-input" style={inputStyle} value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Sin cliente</option>
              {Object.entries(clientes || {})
                .sort((a, b) => (a[1].nombre || "").localeCompare(b[1].nombre || ""))
                .map(([id, c]) => (
                  <option key={id} value={id}>
                    {c.nombre}
                  </option>
                ))}
            </select>
          </Field>
        )}
      </div>
      <div style={{ marginTop: 10 }}>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.inkSoft, margin: "0 0 6px" }}>¿Para cuándo?</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, padding: 4, background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, maxWidth: 420 }}>
          {[
            { v: true, t: "Con fecha y hora" },
            { v: false, t: "Sin fecha · no urgente" },
          ].map((o) => (
            <button
              key={String(o.v)}
              type="button"
              onClick={() => setConFecha(o.v)}
              style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 700, padding: "8px 8px", borderRadius: 9, border: "none", cursor: "pointer", whiteSpace: "nowrap", background: conFecha === o.v ? AMBAR : "transparent", color: conFecha === o.v ? "#fff" : COLORS.inkSoft }}
            >
              {o.t}
            </button>
          ))}
        </div>
        {conFecha && (
          <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
            <Field label="Fecha">
              <input type="date" className="drx-input" style={inputStyle} value={fechaLimite} min={fechaHoyISO()} onChange={(e) => setFechaLimite(e.target.value)} />
            </Field>
            <Field label="Hora (opcional)">
              <input type="time" className="drx-input" style={inputStyle} value={hora} onChange={(e) => setHora(e.target.value)} />
            </Field>
          </div>
        )}
      </div>
      <div style={{ marginTop: 10 }}>
        <Field label="Detalle (opcional)">
          <textarea className="drx-input" style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="Instrucciones, documentos de soporte, a quién llamar…" />
        </Field>
      </div>
      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, margin: "10px 0 0", lineHeight: 1.45 }}>
        {conFecha
          ? `Le llega a la campanita y queda en su Google Calendar${hora ? " con aviso 30 minutos antes" : " como evento de todo el día"}.`
          : "Le llega a la campanita y a su Resumen, sin fecha. No se agenda en Google Calendar."}
      </p>
      {conFecha && elegido && !elegido.correo_google && elegido.id !== yo.id && (
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "#B45309", fontWeight: 600, margin: "6px 0 0" }}>
          {elegido.nombre.split(" ")[0]} no tiene Gmail registrado: agrégalo en Usuarios y permisos para que la tarea le llegue a su Google Calendar.
        </p>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button className="drx-btn-primary" style={{ ...buttonPrimary, background: AMBAR }} onClick={guardar} disabled={!valido || guardando}>
          {guardando ? "Asignando…" : "Asignar tarea"}
        </button>
        <button className="drx-btn-ghost" style={buttonGhost} onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function useAccionesTarea(api, usuarioActual, confirmar) {
  const sincronizar = (t, extra) =>
    t.googleEventoId &&
    llamarGoogleTarea({ asignadoA: t.asignadoA, creadoPor: t.creadoPor, titulo: t.titulo, clienteNombre: t.clienteNombre, googleEventoId: t.googleEventoId, duenoEvento: t.duenoEvento, ...extra });
  const alternar = async (t) => {
    if (t.estado === "hecha") {
      await api.actualizar(t.id, { estado: "pendiente", completadoEn: null, completadoPor: null, completadoPorNombre: "", cierreVisto: false });
      sincronizar(t, { accion: "evento_tarea", hecha: false });
      return;
    }
    await api.actualizar(t.id, {
      estado: "hecha",
      completadoEn: new Date().toISOString(),
      completadoPor: usuarioActual.id,
      completadoPorNombre: usuarioActual.nombre || "",
      // Si la resolvió quien la asignó, no hay a quién avisarle.
      cierreVisto: usuarioActual.id === t.creadoPor,
    });
    sincronizar(t, { accion: "evento_tarea", hecha: true });
    registrarAuditoria(usuarioActual, "resolver_tarea", "tarea", t.id, { nombre: t.titulo });
  };
  const eliminar = async (t) => {
    const ok = confirmar ? await confirmar(`¿Eliminar la tarea "${t.titulo}"?`) : window.confirm(`¿Eliminar la tarea "${t.titulo}"?`);
    if (!ok) return;
    await api.eliminar(t.id);
    sincronizar(t, { accion: "borrar_evento_tarea" });
    registrarAuditoria(usuarioActual, "eliminar_tarea", "tarea", t.id, { nombre: t.titulo });
  };
  const crear = async (datos) => {
    const t = await api.crear({ ...datos, creadoPor: usuarioActual.id, creadoPorNombre: usuarioActual.nombre || "" });
    registrarAuditoria(usuarioActual, "asignar_tarea", "tarea", t.id, { nombre: t.titulo, asignadoA: t.asignadoNombre });
    if (t.fechaLimite) {
      const g = await llamarGoogleTarea({ accion: "evento_tarea", asignadoA: t.asignadoA, titulo: t.titulo, detalle: t.detalle, fecha: t.fechaLimite, hora: t.hora, clienteNombre: t.clienteNombre });
      if (g?.googleEventoId) await api.actualizar(t.id, { googleEventoId: g.googleEventoId, googleHtmlLink: g.googleHtmlLink || "", duenoEvento: g.duenoEvento });
    }
    return t;
  };
  return { alternar, eliminar, crear };
}

// Dentro de la tarjeta de un cliente, debajo de los botones y antes de la
// línea de tiempo: las tareas de ese proceso y el botón para asignar una.
export function TareasCliente({ clienteId, cliente, usuarioActual, tareasApi, usuarios, confirmar }) {
  const [abierto, setAbierto] = useState(false);
  const [verHechas, setVerHechas] = useState(false);
  const acc = useAccionesTarea(tareasApi, usuarioActual, confirmar);
  const esAdmin = usuarioActual?.rol === "Administrador";
  const propias = tareasApi.tareas.filter((t) => t.clienteId === clienteId);
  const pendientes = propias.filter((t) => t.estado !== "hecha");
  const hechas = propias.filter((t) => t.estado === "hecha");
  const visibles = verHechas ? [...pendientes, ...hechas] : pendientes;

  return (
    <div style={{ marginTop: 12, borderTop: `1px solid ${COLORS.border}`, paddingTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: COLORS.headingText, margin: 0 }}>
          Tareas del equipo
          {pendientes.length > 0 && <span style={{ marginLeft: 8 }}><Chip texto={`${pendientes.length} pendiente${pendientes.length === 1 ? "" : "s"}`} color="#B45309" fondo="#FEF3C7" /></span>}
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {hechas.length > 0 && (
            <button type="button" onClick={() => setVerHechas(!verHechas)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, textDecoration: "underline" }}>
              {verHechas ? "Ocultar resueltas" : `Ver resueltas (${hechas.length})`}
            </button>
          )}
          {!abierto && (
            <button className="drx-btn-ghost" style={{ ...buttonGhost, padding: "6px 12px", fontSize: 12.5 }} onClick={() => setAbierto(true)}>
              + Asignar tarea
            </button>
          )}
        </div>
      </div>
      {abierto && (
        <FormularioTarea
          usuarios={usuarios}
          yo={usuarioActual}
          clienteFijo={{ id: clienteId, nombre: cliente?.nombre || "" }}
          onCancelar={() => setAbierto(false)}
          onCrear={async (d) => {
            await acc.crear(d);
            setAbierto(false);
          }}
        />
      )}
      {visibles.length > 0 && (
        <div style={{ marginTop: 6 }}>
          {visibles.map((t) => (
            <FilaTarea key={t.id} tarea={t} yoId={usuarioActual.id} esAdmin={esAdmin} onAlternar={acc.alternar} onEliminar={acc.eliminar} />
          ))}
        </div>
      )}
      {!abierto && propias.length === 0 && (
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, margin: "6px 0 0" }}>Asigna a un colega lo que hay que hacer en este proceso y sigue si ya lo resolvió.</p>
      )}
    </div>
  );
}

// En el Resumen: las tareas de cada quien y el seguimiento de las que uno
// asignó — el "Excel de quién tiene qué", dentro de Nomos.
export default function PanelTareas({ usuarioActual }) {
  const { confirmar, ConfirmarDialogo } = useConfirmarDialogo();
  const api = useTareas();
  const { usuarios } = useUsuariosDespacho();
  const { clientes } = useClientesLigero();
  const acc = useAccionesTarea(api, usuarioActual, confirmar);
  const yo = usuarioActual.id;
  const esAdmin = usuarioActual.rol === "Administrador";
  const [vista, setVista] = useState("mias");
  const [verHechas, setVerHechas] = useState(false);
  const [creando, setCreando] = useState(false);

  // Lo que era nuevo al abrir el Resumen se marca con la etiqueta "Nueva"
  // durante esta visita, y se da por visto en el servidor (deja de sumar
  // en la campanita).
  const nuevasRef = useRef(null);
  useEffect(() => {
    if (!api.cargado || nuevasRef.current) return;
    const nuevas = api.tareas.filter((t) => (t.asignadoA === yo && t.estado !== "hecha" && !t.vistaPorAsignado) || (t.creadoPor === yo && t.estado === "hecha" && !t.cierreVisto));
    nuevasRef.current = new Set(nuevas.map((t) => t.id));
    nuevas.forEach((t) => api.actualizar(t.id, t.asignadoA === yo && t.estado !== "hecha" ? { vistaPorAsignado: true } : { cierreVisto: true }));
  }, [api.cargado]);

  const grupos = useMemo(() => {
    const mias = api.tareas.filter((t) => t.asignadoA === yo);
    const asignadas = api.tareas.filter((t) => t.creadoPor === yo && t.asignadoA !== yo);
    return { mias, asignadas, equipo: api.tareas };
  }, [api.tareas, yo]);

  const VISTAS = [
    { id: "mias", etiqueta: "Para mí", lista: grupos.mias },
    { id: "asignadas", etiqueta: "Que asigné", lista: grupos.asignadas },
    ...(esAdmin ? [{ id: "equipo", etiqueta: "Todo el equipo", lista: grupos.equipo }] : []),
  ];
  const actual = VISTAS.find((v) => v.id === vista) || VISTAS[0];
  const pend = actual.lista.filter((t) => t.estado !== "hecha").sort((a, b) => `${a.fechaLimite || "9999"}${a.hora || "99"}`.localeCompare(`${b.fechaLimite || "9999"}${b.hora || "99"}`));
  const hechas = actual.lista.filter((t) => t.estado === "hecha").sort((a, b) => (b.completadoEn || "").localeCompare(a.completadoEn || ""));
  const vencidas = pend.filter((t) => t.fechaLimite && t.fechaLimite < fechaHoyISO()).length;

  if (!api.cargado) return null;
  if (api.tareas.length === 0 && !creando) {
    return (
      <Card style={{ marginBottom: 20, borderLeft: `4px solid ${AMBAR}` }}>
        {ConfirmarDialogo}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 700, color: COLORS.ink, margin: 0 }}>Tareas del equipo</p>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted, margin: "4px 0 0" }}>Asigna tareas a tus colegas y sigue quién las resolvió, sin Excel aparte.</p>
          </div>
          <button className="drx-btn-primary" style={{ ...buttonPrimary, background: AMBAR }} onClick={() => setCreando(true)}>
            + Nueva tarea
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card style={{ marginBottom: 20, borderLeft: `4px solid ${AMBAR}` }}>
      {ConfirmarDialogo}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 700, color: COLORS.ink, margin: 0 }}>Tareas del equipo</p>
        {!creando && (
          <button className="drx-btn-ghost" style={{ ...buttonGhost, padding: "6px 12px", fontSize: 12.5 }} onClick={() => setCreando(true)}>
            + Nueva tarea
          </button>
        )}
      </div>
      {creando && (
        <FormularioTarea
          usuarios={usuarios}
          yo={usuarioActual}
          clientes={clientes}
          onCancelar={() => setCreando(false)}
          onCrear={async (d) => {
            await acc.crear(d);
            setCreando(false);
            setVista(d.asignadoA === yo ? "mias" : "asignadas");
          }}
        />
      )}
      <div style={{ display: "inline-flex", gap: 4, padding: 4, marginTop: 12, background: COLORS.surfaceSoft, border: `1px solid ${COLORS.border}`, borderRadius: 12, maxWidth: "100%", overflowX: "auto" }}>
        {VISTAS.map((v) => {
          const on = v.id === actual.id;
          const n = v.lista.filter((t) => t.estado !== "hecha").length;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setVista(v.id)}
              style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 700, padding: "7px 14px", borderRadius: 9, border: "none", cursor: "pointer", whiteSpace: "nowrap", background: on ? AMBAR : "transparent", color: on ? "#fff" : COLORS.inkSoft }}
            >
              {v.etiqueta}
              {n > 0 && <span style={{ marginLeft: 6, opacity: 0.85 }}>{n}</span>}
            </button>
          );
        })}
      </div>
      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted, margin: "10px 0 2px" }}>
        {pend.length === 0 ? "Nada pendiente aquí." : `${pend.length} pendiente${pend.length === 1 ? "" : "s"}`}
        {vencidas > 0 && <b style={{ color: "#B42318" }}> · {vencidas} vencida{vencidas === 1 ? "" : "s"}</b>}
        {hechas.length > 0 && ` · ${hechas.length} resuelta${hechas.length === 1 ? "" : "s"}`}
      </p>
      {[...pend, ...(verHechas ? hechas : hechas.filter((t) => nuevasRef.current?.has(t.id)))].map((t) => (
        <FilaTarea key={t.id} tarea={t} yoId={yo} esAdmin={esAdmin} nueva={nuevasRef.current?.has(t.id)} mostrarCliente onAlternar={acc.alternar} onEliminar={acc.eliminar} />
      ))}
      {hechas.length > 0 && (
        <button type="button" onClick={() => setVerHechas(!verHechas)} style={{ marginTop: 8, background: "none", border: "none", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted, textDecoration: "underline", padding: 0 }}>
          {verHechas ? "Ocultar resueltas" : `Ver resueltas (${hechas.length})`}
        </button>
      )}
    </Card>
  );
}
