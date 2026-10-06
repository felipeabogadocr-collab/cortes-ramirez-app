import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  COLORS, diasDesde, useConfirmarDialogo, inputStyle, buttonPrimary, buttonGhost, Card,
  EncabezadoSeccion, Spinner, Icono, CampoDinero, formatoCOP, Field, fechaHoyISO,
} from "../App.jsx";

// Errores no controlados que el ErrorBoundary del frontend atrapa se
// reportan a /api/errores/registrar (ver App.jsx) — este panel deja verlos
// sin tener que depender de que un usuario lo reporte por WhatsApp.
function PanelErroresCliente() {
  const [abierto, setAbierto] = useState(false);
  const [cargado, setCargado] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [errores, setErrores] = useState([]);
  const [errorCarga, setErrorCarga] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga("");
    try {
      const { data: sesionData } = await supabase.auth.getSession();
      const token = sesionData?.session?.access_token;
      const response = await fetch("/api/errores/registrar", { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo cargar la lista de errores.");
      setErrores(data.errores || []);
      setCargado(true);
    } catch (e) {
      setErrorCarga(e.message);
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    if (abierto && !cargado && !cargando) cargar();
  }, [abierto, cargado, cargando, cargar]);

  return (
    <Card style={{ marginTop: 20 }}>
      <button
        onClick={() => setAbierto((a) => !a)}
        style={{ background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: 0 }}
      >
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.ink, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
          <Icono tipo="alerta" size={14} /> Errores recientes de la interfaz {cargado ? `(${errores.length})` : ""}
        </p>
        <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted }}>{abierto ? "Ocultar ▲" : "Ver ▼"}</span>
      </button>

      {abierto && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 12 }}>
            Últimos 50 errores inesperados que sufrió algún usuario (de cualquier despacho), capturados automáticamente.
          </p>
          {cargando && <Spinner />}
          {errorCarga && <p style={{ color: "#B42318", fontSize: 12.5, fontFamily: "Inter, sans-serif" }}>{errorCarga}</p>}
          {cargado && errores.length === 0 && <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted }}>Ninguno registrado. Buena señal.</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {errores.map((e) => (
              <div key={e.id} style={{ background: "#FEF2F2", border: "1px solid #F3C6C0", borderRadius: 8, padding: "8px 12px" }}>
                <p style={{ fontFamily: "monospace", fontSize: 12, color: "#B42318", margin: 0, wordBreak: "break-word" }}>{e.mensaje}</p>
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: COLORS.muted, margin: "4px 0 0" }}>
                  {new Date(e.creado_en).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}
                  {e.url ? ` · ${e.url}` : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// Qué hizo cada usuario de un despacho (no solo cuándo entró por última
// vez) — reutiliza la misma tabla "auditoria" que ya llena cada acción del
// despacho (crear cliente, registrar pago, firmar documento, etc.) vía
// registrarAuditoria en App.jsx. Útil sobre todo con despachos en prueba
// gratis: ver si de verdad están usando la app antes de que se les venza.
function PanelActividadDespacho({ despachoId }) {
  const [abierto, setAbierto] = useState(false);
  const [cargado, setCargado] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [actividad, setActividad] = useState([]);
  const [conectados, setConectados] = useState([]);
  const [errorCarga, setErrorCarga] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga("");
    try {
      const { data: sesionData } = await supabase.auth.getSession();
      const token = sesionData?.session?.access_token;
      const response = await fetch(`/api/plataforma/despachos?actividad=${encodeURIComponent(despachoId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo cargar la actividad.");
      setActividad(data.actividad || []);
      setConectados(data.conectados || []);
      setCargado(true);
    } catch (e) {
      setErrorCarga(e.message);
    }
    setCargando(false);
  }, [despachoId]);

  useEffect(() => {
    if (abierto && !cargado && !cargando) cargar();
  }, [abierto, cargado, cargando, cargar]);

  return (
    <div style={{ marginTop: 10 }}>
      <button
        onClick={() => setAbierto((a) => !a)}
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: COLORS.accentBright }}
      >
        {abierto ? "Ocultar actividad ▲" : "Ver actividad ▼"}
      </button>
      {abierto && (
        <div style={{ marginTop: 10, maxHeight: 260, overflowY: "auto" }}>
          {cargando && <Spinner />}
          {errorCarga && <p style={{ color: "#B42318", fontSize: 12, fontFamily: "Inter, sans-serif" }}>{errorCarga}</p>}
          {cargado && (
            <div style={{ marginBottom: 10 }}>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: conectados.length > 0 ? "#166534" : COLORS.muted, margin: 0 }}>
                {conectados.length > 0 ? `🟢 ${conectados.length} conectado${conectados.length !== 1 ? "s" : ""} ahora` : "Nadie conectado ahora"}
              </p>
              {conectados.map((c, i) => (
                <p key={i} style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: COLORS.inkSoft, margin: "2px 0 0" }}>
                  {c.nombre} ({c.rol}) — viendo {c.pestanaActual || "…"}
                </p>
              ))}
            </div>
          )}
          {cargado && actividad.length === 0 && (
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted }}>Todavía no hay ninguna acción registrada — no ha usado la app.</p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {actividad.map((a, i) => (
              <div key={i} style={{ background: COLORS.surfaceSoft, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "6px 10px" }}>
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.ink, margin: 0 }}>
                  <strong>{a.usuario_nombre || "Usuario"}</strong> — {(a.accion || "").replaceAll("_", " ")}
                  {a.entidad ? ` (${a.entidad})` : ""}
                </p>
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 10.5, color: COLORS.muted, margin: "2px 0 0" }}>
                  {new Date(a.creado_en).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Registro manual de pagos de suscripción — hasta que haya una pasarela de
// pago real (Wompi/ePayco), el superadmin cobra por transferencia/Nequi y
// confirma a mano aquí cuánto y cuándo pagó cada despacho. "pagó este mes"
// se calcula sobre el pago más reciente, comparando mes y año calendario
// contra hoy — no son 30 días exactos desde el último pago.
function mismoMes(fechaIso) {
  if (!fechaIso) return false;
  const f = new Date(`${fechaIso}T12:00:00`);
  const hoy = new Date();
  return f.getFullYear() === hoy.getFullYear() && f.getMonth() === hoy.getMonth();
}

function PanelPagosDespacho({ despacho, pagos, onRegistrado, onEliminado }) {
  const [abierto, setAbierto] = useState(false);
  const [valor, setValor] = useState("");
  const [fecha, setFecha] = useState(fechaHoyISO());
  const [guardando, setGuardando] = useState(false);
  const [eliminandoId, setEliminandoId] = useState(null);
  const [error, setError] = useState("");

  const ultimoPago = pagos[0] || null;
  const pagoEsteMes = ultimoPago && mismoMes(ultimoPago.fecha);

  const registrar = async () => {
    const valorNum = Number(valor);
    if (!valorNum || valorNum <= 0 || !fecha) return;
    setGuardando(true);
    setError("");
    try {
      const { data: sesionData } = await supabase.auth.getSession();
      const token = sesionData?.session?.access_token;
      const response = await fetch("/api/plataforma/despachos", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ accion: "registrar_pago", despachoId: despacho.id, valor: valorNum, fecha }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo registrar el pago.");
      onRegistrado(despacho.id, data.pago);
      setValor("");
      setFecha(fechaHoyISO());
    } catch (e) {
      setError(e.message);
    }
    setGuardando(false);
  };

  const eliminar = async (pagoId) => {
    setEliminandoId(pagoId);
    try {
      const { data: sesionData } = await supabase.auth.getSession();
      const token = sesionData?.session?.access_token;
      const response = await fetch("/api/plataforma/despachos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ accion: "eliminar_pago", pagoId }),
      });
      if (!response.ok) throw new Error("No se pudo eliminar el pago.");
      onEliminado(despacho.id, pagoId);
    } catch (e) {
      setError(e.message);
    }
    setEliminandoId(null);
  };

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {ultimoPago ? (
          <span
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 11,
              fontWeight: 700,
              padding: "2px 9px",
              borderRadius: 20,
              background: pagoEsteMes ? "#F0FDF4" : "#FEF3E2",
              color: pagoEsteMes ? "#166534" : "#B45309",
              border: `1px solid ${pagoEsteMes ? "#BBF7D0" : "#FCE3B8"}`,
            }}
          >
            {pagoEsteMes ? "✓ Pagó este mes" : "⚠ Sin pago este mes"} — {formatoCOP(ultimoPago.valor)} el{" "}
            {new Date(`${ultimoPago.fecha}T12:00:00`).toLocaleDateString("es-CO", { dateStyle: "medium" })}
          </span>
        ) : (
          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 700, color: "#B45309", background: "#FEF3E2", border: "1px solid #FCE3B8", borderRadius: 20, padding: "2px 9px" }}>
            ⚠ Ningún pago registrado todavía
          </span>
        )}
        <button
          onClick={() => setAbierto((a) => !a)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: COLORS.accentBright }}
        >
          {abierto ? "Ocultar pagos ▲" : "Registrar / ver pagos ▼"}
        </button>
      </div>

      {abierto && (
        <div style={{ marginTop: 10, background: COLORS.surfaceSoft, borderRadius: 10, padding: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <Field label="Valor pagado (COP)">
              <CampoDinero style={{ ...inputStyle, width: 150 }} value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ej: 120.000" />
            </Field>
            <Field label="Fecha">
              <input type="date" className="drx-input" style={{ ...inputStyle, width: 150 }} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </Field>
            <button className="drx-btn-primary" style={{ ...buttonPrimary, padding: "9px 16px" }} onClick={registrar} disabled={guardando || !valor || !fecha}>
              {guardando ? "Guardando…" : "Registrar pago"}
            </button>
          </div>
          {error && <p style={{ color: "#B42318", fontSize: 12, marginTop: 8, fontFamily: "Inter, sans-serif" }}>{error}</p>}

          {pagos.length > 0 && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
              {pagos.map((p) => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "6px 10px" }}>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.ink, margin: 0 }}>
                    {formatoCOP(p.valor)} · {new Date(`${p.fecha}T12:00:00`).toLocaleDateString("es-CO", { dateStyle: "medium" })}
                  </p>
                  <button
                    onClick={() => eliminar(p.id)}
                    disabled={eliminandoId === p.id}
                    title="Eliminar este pago"
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#B42318", fontSize: 11, fontFamily: "Inter, sans-serif", fontWeight: 600 }}
                  >
                    {eliminandoId === p.id ? "…" : "Eliminar"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PlataformaTab({ onListo }) {
  const [despachos, setDespachos] = useState([]);
  const [cargando, setCargando] = useState(true);
  useEffect(() => {
    if (!cargando) onListo?.();
  }, [cargando]);
  const [error, setError] = useState("");
  const [cambiando, setCambiando] = useState(null);
  const [filtro, setFiltro] = useState("");
  const { confirmar, ConfirmarDialogo } = useConfirmarDialogo();

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const { data: sesionData } = await supabase.auth.getSession();
      const token = sesionData?.session?.access_token;
      const response = await fetch("/api/plataforma/despachos", { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo cargar la lista de despachos.");
      setDespachos(data.despachos || []);
    } catch (e) {
      setError(e.message);
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const alternarActivo = async (despacho) => {
    setCambiando(despacho.id);
    try {
      const { data: sesionData } = await supabase.auth.getSession();
      const token = sesionData?.session?.access_token;
      const response = await fetch("/api/plataforma/despachos", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ despachoId: despacho.id, activo: !despacho.activo }),
      });
      if (!response.ok) throw new Error("No se pudo actualizar.");
      setDespachos((prev) => prev.map((d) => (d.id === despacho.id ? { ...d, activo: !d.activo } : d)));
    } catch (e) {
      setError(e.message);
    }
    setCambiando(null);
  };

  // A diferencia de alternarActivo (que invierte el estado), esta SIEMPRE
  // activa — hace falta porque un despacho en prueba ya tiene activo=true
  // en la base de datos (ver api/despachos/crear.js), así que invertirlo
  // lo hubiera desactivado por error en vez de confirmar el pago.
  const activarDespacho = async (despacho) => {
    setCambiando(despacho.id);
    try {
      const { data: sesionData } = await supabase.auth.getSession();
      const token = sesionData?.session?.access_token;
      const response = await fetch("/api/plataforma/despachos", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ despachoId: despacho.id, activo: true }),
      });
      if (!response.ok) throw new Error("No se pudo actualizar.");
      setDespachos((prev) => prev.map((d) => (d.id === despacho.id ? { ...d, activo: true, prueba_hasta: null, pago_reportado_en: null } : d)));
    } catch (e) {
      setError(e.message);
    }
    setCambiando(null);
  };

  const eliminarDespacho = async (despacho) => {
    if (!(await confirmar(`¿Eliminar por completo "${despacho.nombre}"? Esto borra su registro y la cuenta de quien se registró. No se puede deshacer.`))) {
      return;
    }
    setCambiando(despacho.id);
    try {
      const { data: sesionData } = await supabase.auth.getSession();
      const token = sesionData?.session?.access_token;
      const response = await fetch("/api/plataforma/despachos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ despachoId: despacho.id }),
      });
      if (!response.ok) throw new Error("No se pudo eliminar.");
      setDespachos((prev) => prev.filter((d) => d.id !== despacho.id));
    } catch (e) {
      setError(e.message);
    }
    setCambiando(null);
  };

  const onPagoRegistrado = (despachoId, pago) => {
    setDespachos((prev) =>
      prev.map((d) => (d.id === despachoId ? { ...d, pagos: [pago, ...(d.pagos || [])].sort((a, b) => (a.fecha < b.fecha ? 1 : -1)) } : d))
    );
  };

  const onPagoEliminado = (despachoId, pagoId) => {
    setDespachos((prev) => prev.map((d) => (d.id === despachoId ? { ...d, pagos: (d.pagos || []).filter((p) => p.id !== pagoId) } : d)));
  };

  const textoFiltro = filtro.trim().toLowerCase();
  const despachosFiltrados = textoFiltro
    ? despachos.filter((d) => d.nombre?.toLowerCase().includes(textoFiltro) || d.adminEmail?.toLowerCase().includes(textoFiltro))
    : despachos;
  const pruebaVencida = (d) => d.prueba_hasta && new Date(d.prueba_hasta).getTime() <= Date.now();
  const pendientes = despachosFiltrados.filter((d) => !d.activo || pruebaVencida(d));
  const activos = despachosFiltrados.filter((d) => d.activo && !pruebaVencida(d));
  const HACE_7_DIAS = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const activosUsandoEstaSemana = activos.filter((d) => d.ultimaActividad && new Date(d.ultimaActividad).getTime() >= HACE_7_DIAS).length;
  const activosPagaronEsteMes = activos.filter((d) => d.pagos?.[0] && mismoMes(d.pagos[0].fecha)).length;

  const textoUltimaActividad = (fecha) => {
    if (!fecha) return "sin inicios de sesión registrados todavía";
    const dias = Math.floor((Date.now() - new Date(fecha).getTime()) / (24 * 60 * 60 * 1000));
    if (dias <= 0) return "activo hoy";
    if (dias === 1) return "activo ayer";
    return `última actividad hace ${dias} días`;
  };

  return (
    <div>
      <EncabezadoSeccion titulo="Plataforma" color="#DC2626" />

      {!cargando && activos.length > 0 && (
        <Card style={{ marginBottom: 18, borderLeft: "4px solid #2F80ED" }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>
            Uso real, no solo pago
          </p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 800, color: COLORS.ink, margin: "4px 0 0" }}>
            {activosUsandoEstaSemana} de {activos.length} despachos activos entraron esta semana
          </p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 700, color: activosPagaronEsteMes === activos.length ? "#166534" : "#B45309", margin: "8px 0 0" }}>
            {activosPagaronEsteMes} de {activos.length} despachos activos con pago registrado este mes
          </p>
        </Card>
      )}
      <div
        style={{
          background: "#FEF3E2",
          border: "1px solid #FCE3B8",
          borderRadius: 10,
          padding: "12px 16px",
          marginBottom: 18,
          fontFamily: "Inter, sans-serif",
          fontSize: 12.5,
          color: "#92400E",
        }}
      >
        Solo tú ves esta pestaña. Los despachos nuevos entran con una demo gratis de 3 horas — aquí activas el acceso cuando
        confirmes que pagaron (mira si dice "Reportó pago"), o desactivas uno que dejó de pagar.
      </div>

      <input
        className="drx-input"
        style={{ ...inputStyle, maxWidth: 320, marginBottom: 18 }}
        placeholder="Buscar despacho por nombre o correo..."
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
      />

      {error && <p style={{ color: "#B42318", fontSize: 13, marginBottom: 14, fontFamily: "Inter, sans-serif" }}>{error}</p>}
      {cargando && <Spinner />}

      {!cargando && (
        <>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 700, color: "#B45309", marginBottom: 10 }}>
            Pendientes de activar ({pendientes.length})
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
            {pendientes.length === 0 && <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted }}>Ninguno por ahora.</p>}
            {pendientes.map((d) => (
              <Card key={d.id} style={{ borderLeft: "4px solid #F5A524" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 700, color: COLORS.ink, margin: 0 }}>{d.nombre}</p>
                    <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: COLORS.muted, margin: "2px 0 0" }}>
                      {d.adminEmail || "sin administrador"} · registrado {new Date(d.creado_en).toLocaleDateString("es-CO", { dateStyle: "medium" })}
                      {diasDesde(d.creado_en) >= 3 && (
                        <span style={{ color: "#B42318", fontWeight: 600 }}> · lleva {diasDesde(d.creado_en)} días esperando</span>
                      )}
                    </p>
                    <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, margin: "4px 0 0", display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {d.prueba_hasta && (
                        <span style={{ color: pruebaVencida(d) ? "#B42318" : "#166534", fontWeight: 700 }}>
                          {pruebaVencida(d) ? "Demo vencida" : "En demo (3h)"}
                        </span>
                      )}
                      {d.pago_reportado_en && (
                        <span style={{ color: "#0D9488", fontWeight: 700, background: "#F0FDFA", border: "1px solid #99F6E4", borderRadius: 20, padding: "1px 8px" }}>
                          💳 Reportó pago el {new Date(d.pago_reportado_en).toLocaleDateString("es-CO", { dateStyle: "medium" })}
                        </span>
                      )}
                    </p>
                    <PanelActividadDespacho despachoId={d.id} />
                    <PanelPagosDespacho despacho={d} pagos={d.pagos || []} onRegistrado={onPagoRegistrado} onEliminado={onPagoEliminado} />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="drx-btn-ghost"
                      style={{ ...buttonGhost, color: "#B42318", borderColor: "#F3C6C0" }}
                      onClick={() => eliminarDespacho(d)}
                      disabled={cambiando === d.id}
                    >
                      Eliminar
                    </button>
                    <button
                      className="drx-btn-primary"
                      style={{ ...buttonPrimary, background: "#10B981" }}
                      onClick={() => activarDespacho(d)}
                      disabled={cambiando === d.id}
                    >
                      {cambiando === d.id ? "…" : "✓ Activar acceso"}
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 700, color: "#166534", marginBottom: 10 }}>
            Activos ({activos.length})
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {activos.length === 0 && <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted }}>Ninguno todavía.</p>}
            {activos.map((d) => (
              <Card key={d.id} style={{ borderLeft: "4px solid #10B981" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 700, color: COLORS.ink, margin: 0 }}>{d.nombre}</p>
                    <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: COLORS.muted, margin: "2px 0 0" }}>
                      {d.adminEmail || "sin administrador"} · registrado {new Date(d.creado_en).toLocaleDateString("es-CO", { dateStyle: "medium" })}
                    </p>
                    <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 600, color: d.ultimaActividad && new Date(d.ultimaActividad).getTime() >= HACE_7_DIAS ? "#166534" : "#B45309", margin: "2px 0 0" }}>
                      {textoUltimaActividad(d.ultimaActividad)}
                    </p>
                    <PanelActividadDespacho despachoId={d.id} />
                    <PanelPagosDespacho despacho={d} pagos={d.pagos || []} onRegistrado={onPagoRegistrado} onEliminado={onPagoEliminado} />
                  </div>
                  <button className="drx-btn-ghost" style={buttonGhost} onClick={() => alternarActivo(d)} disabled={cambiando === d.id}>
                    {cambiando === d.id ? "…" : "Desactivar"}
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
      <PanelErroresCliente />
      {ConfirmarDialogo}
    </div>
  );
}
