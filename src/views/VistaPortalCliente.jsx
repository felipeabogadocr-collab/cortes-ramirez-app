import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  COLORS,
  Card,
  Field,
  Icono,
  IconoNomos,
  AvatarIniciales,
  COLOR_AREA_PROCESO,
  buttonPrimary,
  inputStyle,
  consultarRamaJudicial,
  formatoCOP,
} from "../App.jsx";

function EncabezadoTarjeta({ icono, color, titulo }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 9,
          flexShrink: 0,
          background: `linear-gradient(135deg, ${color}, ${color}CC)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#FFFFFF",
          boxShadow: `0 4px 10px ${color}40`,
        }}
      >
        <Icono tipo={icono} size={16} />
      </div>
      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 800, color: COLORS.headingText, margin: 0 }}>{titulo}</p>
    </div>
  );
}

export default function VistaPortalCliente() {
  const [codigo, setCodigo] = useState("");
  const [cliente, setCliente] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const [procesoInfo, setProcesoInfo] = useState(null);
  const [consultandoProceso, setConsultandoProceso] = useState(false);
  const [errorProceso, setErrorProceso] = useState("");

  const buscar = async () => {
    const code = codigo.trim();
    if (!code) return;
    setBuscando(true);
    setNotFound(false);
    setCliente(null);
    setProcesoInfo(null);
    const { data, error } = await supabase.rpc("obtener_portal_cliente", { p_id: code });
    setBuscando(false);
    if (error || !data) {
      setNotFound(true);
      return;
    }
    setCliente(data);
  };

  const consultarProceso = async () => {
    if (!cliente?.radicado) return;
    setConsultandoProceso(true);
    setErrorProceso("");
    try {
      const data = await consultarRamaJudicial(cliente.radicado);
      setProcesoInfo(data);
    } catch (e) {
      setErrorProceso("No pudimos consultar el proceso en este momento. Intenta de nuevo en un rato.");
    }
    setConsultandoProceso(false);
  };

  const totalPagado = (cliente?.pagos || []).reduce((sum, p) => sum + (Number(p.valor) || 0), 0);
  const valorTotal = Number(cliente?.valorTotal) || 0;
  const saldo = valorTotal > 0 ? valorTotal - totalPagado : null;
  const porcentajePagado = valorTotal > 0 ? Math.min(100, Math.round((totalPagado / valorTotal) * 100)) : 0;
  const colorArea = COLOR_AREA_PROCESO[cliente?.areaProceso] || COLORS.accentBright;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 20px 40px" }}>
      <div
        style={{
          background: `linear-gradient(135deg, #0F5540, ${COLORS.navy} 55%, ${COLORS.navyDeep})`,
          margin: "0 -20px 28px",
          padding: "28px 20px 32px",
          display: "flex",
          alignItems: "center",
          gap: 14,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            right: -30,
            top: -40,
            width: 160,
            height: 160,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,255,255,0.1), transparent 70%)",
          }}
        />
        <div
          style={{
            width: 50,
            height: 50,
            borderRadius: 13,
            background: "#FFFFFF",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: COLORS.navy,
            flexShrink: 0,
            boxShadow: "0 6px 16px rgba(0,0,0,0.18)",
            position: "relative",
          }}
        >
          <IconoNomos size={27} />
        </div>
        <div style={{ position: "relative" }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, letterSpacing: 1.6, color: "rgba(255,255,255,0.65)", textTransform: "uppercase", margin: 0 }}>
            Nomos
          </p>
          <h1 style={{ fontFamily: "Inter, sans-serif", fontSize: 25, fontWeight: 800, color: "#FFFFFF", margin: "4px 0 0", letterSpacing: -0.3 }}>Portal del cliente</h1>
        </div>
      </div>

      {!cliente && (
        <Card style={{ borderRadius: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                flexShrink: 0,
                background: `linear-gradient(135deg, ${COLORS.navy}, ${COLORS.navyDeep})`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#FFFFFF",
              }}
            >
              <Icono tipo="llave" size={16} />
            </div>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: COLORS.inkSoft, margin: 0, lineHeight: 1.4 }}>
              Ingresa el código de acceso que te compartió tu abogado para ver el estado de tu proceso.
            </p>
          </div>
          <Field label="Código de acceso">
            <input
              className="drx-input"
              style={{ ...inputStyle, fontWeight: 700, fontSize: 17, fontFamily: "monospace", textAlign: "center", letterSpacing: 2 }}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="Código de acceso"
              onKeyDown={(e) => e.key === "Enter" && buscar()}
              autoFocus
            />
          </Field>
          {notFound && (
            <p style={{ color: "#B42318", fontSize: 13, marginTop: 10, fontFamily: "Inter, sans-serif", display: "flex", alignItems: "center", gap: 6 }}>
              <Icono tipo="alerta" size={14} />
              No encontramos ninguna cuenta con ese código. Verifícalo con tu abogado.
            </p>
          )}
          <button className="drx-btn-primary" style={{ ...buttonPrimary, marginTop: 16, width: "100%" }} onClick={buscar} disabled={buscando}>
            {buscando ? "Buscando..." : "Ver mi información"}
          </button>
        </Card>
      )}

      {cliente && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card style={{ borderRadius: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <AvatarIniciales nombre={cliente.nombre} size={46} />
              <div style={{ minWidth: 0 }}>
                <h2 style={{ fontFamily: "Inter, sans-serif", fontSize: 19, fontWeight: 800, margin: 0, color: COLORS.headingText }}>Hola, {cliente.nombre}</h2>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {cliente.areaProceso && (
                    <span
                      style={{
                        fontFamily: "Inter, sans-serif",
                        fontSize: 11.5,
                        fontWeight: 700,
                        padding: "3px 10px",
                        borderRadius: 20,
                        background: `${colorArea}1A`,
                        color: colorArea,
                        border: `1px solid ${colorArea}40`,
                      }}
                    >
                      {cliente.areaProceso}
                    </span>
                  )}
                  {cliente.tipoProceso && (
                    <span
                      style={{
                        fontFamily: "Inter, sans-serif",
                        fontSize: 11.5,
                        fontWeight: 600,
                        padding: "3px 10px",
                        borderRadius: 20,
                        background: COLORS.surfaceSoft,
                        color: COLORS.inkSoft,
                        border: `1px solid ${COLORS.border}`,
                      }}
                    >
                      {cliente.tipoProceso}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {cliente.radicado && (
            <Card style={{ borderRadius: 16 }}>
              <EncabezadoTarjeta icono="balanza" color="#2F80ED" titulo="Estado del proceso" />
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontFamily: "monospace",
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: COLORS.inkSoft,
                  background: COLORS.surfaceSoft,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 8,
                  padding: "5px 10px",
                  marginBottom: 14,
                }}
              >
                {cliente.radicado}
              </div>
              <button className="drx-btn-primary" style={buttonPrimary} onClick={consultarProceso} disabled={consultandoProceso}>
                {consultandoProceso ? "Consultando..." : "Consultar estado actual"}
              </button>
              {errorProceso && (
                <p style={{ color: "#B42318", fontSize: 12.5, marginTop: 10, fontFamily: "Inter, sans-serif", display: "flex", alignItems: "center", gap: 6 }}>
                  <Icono tipo="alerta" size={13} />
                  {errorProceso}
                </p>
              )}
              {procesoInfo && (
                <div style={{ marginTop: 16 }}>
                  {procesoInfo.encontrado ? (
                    <>
                      {procesoInfo.proceso?.despacho && (
                        <p
                          style={{
                            fontFamily: "Inter, sans-serif",
                            fontSize: 12,
                            color: COLORS.muted,
                            marginBottom: 8,
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                          }}
                        >
                          <Icono tipo="edificio" size={12} />
                          {procesoInfo.proceso.despacho}
                        </p>
                      )}
                      {procesoInfo.ultimaActuacion ? (
                        <div
                          style={{
                            background: COLORS.accentSoft,
                            borderRadius: 11,
                            padding: 14,
                            borderLeft: `3px solid ${COLORS.accentBright}`,
                          }}
                        >
                          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, fontWeight: 700, color: COLORS.headingText, margin: 0 }}>
                            {procesoInfo.ultimaActuacion.actuacion}
                          </p>
                          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, margin: "5px 0 0" }}>
                            {new Date(procesoInfo.ultimaActuacion.fecha).toLocaleDateString("es-CO", { dateStyle: "long" })}
                          </p>
                          {procesoInfo.ultimaActuacion.anotacion && (
                            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.inkSoft, margin: "8px 0 0", lineHeight: 1.5 }}>
                              {procesoInfo.ultimaActuacion.anotacion}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted }}>Sin actuaciones registradas todavía.</p>
                      )}
                    </>
                  ) : (
                    <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted }}>No encontramos este radicado en la Rama Judicial.</p>
                  )}
                </div>
              )}
            </Card>
          )}

          {valorTotal > 0 && (
            <Card style={{ borderRadius: 16 }}>
              <EncabezadoTarjeta icono="tarjeta" color="#10B981" titulo="Estado de cuenta" />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                <div>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: COLORS.muted, margin: 0 }}>Pagado</p>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 17, fontWeight: 800, color: COLORS.headingText, margin: "2px 0 0" }}>{formatoCOP(totalPagado)}</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: COLORS.muted, margin: 0 }}>Total acordado</p>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, fontWeight: 600, color: COLORS.inkSoft, margin: "2px 0 0" }}>{formatoCOP(valorTotal)}</p>
                </div>
              </div>
              <div style={{ height: 8, borderRadius: 20, background: COLORS.surfaceSoft, overflow: "hidden", marginBottom: 10 }}>
                <div
                  style={{
                    height: "100%",
                    width: `${porcentajePagado}%`,
                    borderRadius: 20,
                    background: saldo <= 0 ? "linear-gradient(90deg, #10B981, #059669)" : `linear-gradient(90deg, ${COLORS.accentBright}, ${COLORS.navy})`,
                    transition: "width .4s ease",
                  }}
                />
              </div>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  fontFamily: "Inter, sans-serif",
                  fontSize: 12.5,
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: 20,
                  background: saldo <= 0 ? "#DCFCE7" : "#EFF6FF",
                  color: saldo <= 0 ? "#166534" : "#1D4ED8",
                }}
              >
                {saldo <= 0 ? (
                  <>
                    <Icono tipo="check" size={12} /> Al día
                  </>
                ) : (
                  `Saldo pendiente: ${formatoCOP(saldo)}`
                )}
              </span>
            </Card>
          )}

          {cliente.pagos?.length > 0 && (
            <Card style={{ borderRadius: 16 }}>
              <EncabezadoTarjeta icono="documento" color="#8B5CF6" titulo="Pagos registrados" />
              <div style={{ display: "flex", flexDirection: "column" }}>
                {[...cliente.pagos]
                  .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
                  .map((p, i, arr) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontFamily: "Inter, sans-serif",
                        fontSize: 12.5,
                        padding: "10px 0",
                        borderBottom: i < arr.length - 1 ? `1px solid ${COLORS.border}` : "none",
                      }}
                    >
                      <div>
                        <p style={{ margin: 0, color: COLORS.ink, fontWeight: 600 }}>{p.concepto || "Pago"}</p>
                        <p style={{ margin: "2px 0 0", color: COLORS.muted, fontSize: 11.5 }}>
                          {new Date(p.fecha).toLocaleDateString("es-CO", { dateStyle: "medium" })}
                        </p>
                      </div>
                      <span style={{ color: "#166534", fontWeight: 700 }}>{formatoCOP(p.valor)}</span>
                    </div>
                  ))}
              </div>
            </Card>
          )}

          {cliente.documentos?.length > 0 && (
            <Card style={{ borderRadius: 16 }}>
              <EncabezadoTarjeta icono="clip" color="#F5A524" titulo="Documentos" />
              <div style={{ display: "flex", flexDirection: "column" }}>
                {cliente.documentos.map((d, i, arr) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontFamily: "Inter, sans-serif",
                      fontSize: 12.5,
                      padding: "10px 0",
                      borderBottom: i < arr.length - 1 ? `1px solid ${COLORS.border}` : "none",
                    }}
                  >
                    <span style={{ color: COLORS.ink, fontWeight: 600 }}>{d.titulo}</span>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        fontWeight: 700,
                        fontSize: 11.5,
                        padding: "3px 10px",
                        borderRadius: 20,
                        background: d.firmado ? "#DCFCE7" : "#FEF3E2",
                        color: d.firmado ? "#166534" : "#B45309",
                      }}
                    >
                      <Icono tipo={d.firmado ? "check" : "reloj"} size={11} />
                      {d.firmado ? "Firmado" : "Pendiente de firma"}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
