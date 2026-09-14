import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  COLORS,
  Card,
  Field,
  IconoNomos,
  buttonPrimary,
  inputStyle,
  consultarRamaJudicial,
} from "../App.jsx";

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

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 20px 40px" }}>
      <div style={{ background: COLORS.navy, margin: "0 -20px 28px", padding: "24px 20px", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.navy, flexShrink: 0 }}>
          <IconoNomos size={26} />
        </div>
        <div>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, letterSpacing: 1.5, color: "#9FB6D6", textTransform: "uppercase", margin: 0 }}>Nomos</p>
          <h1 style={{ fontFamily: "Inter, sans-serif", fontSize: 24, fontWeight: 700, color: "#FFFFFF", margin: "4px 0 0" }}>Portal del cliente</h1>
        </div>
      </div>

      {!cliente && (
        <Card>
          <Field label="Código de acceso (te lo compartió tu abogado)">
            <input
              className="drx-input"
              style={{ ...inputStyle, fontWeight: 700, fontSize: 16, fontFamily: "monospace", textAlign: "center" }}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="Código de acceso"
              onKeyDown={(e) => e.key === "Enter" && buscar()}
            />
          </Field>
          {notFound && (
            <p style={{ color: "#B42318", fontSize: 13, marginTop: 10, fontFamily: "Inter, sans-serif" }}>
              No encontramos ninguna cuenta con ese código. Verifícalo con tu abogado.
            </p>
          )}
          <button className="drx-btn-primary" style={{ ...buttonPrimary, marginTop: 14 }} onClick={buscar} disabled={buscando}>
            {buscando ? "Buscando..." : "Ver mi información"}
          </button>
        </Card>
      )}

      {cliente && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card>
            <h2 style={{ fontFamily: "Inter, sans-serif", fontSize: 19, fontWeight: 700, margin: 0, color: COLORS.ink }}>Hola, {cliente.nombre}</h2>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.muted, margin: "4px 0 0" }}>
              {cliente.tipoProceso} · {cliente.areaProceso}
            </p>
          </Card>

          {cliente.radicado && (
            <Card>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.ink, marginBottom: 8 }}>Estado del proceso</p>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted, marginBottom: 12 }}>Radicado: {cliente.radicado}</p>
              <button className="drx-btn-primary" style={buttonPrimary} onClick={consultarProceso} disabled={consultandoProceso}>
                {consultandoProceso ? "Consultando..." : "Consultar estado actual"}
              </button>
              {errorProceso && <p style={{ color: "#B42318", fontSize: 12.5, marginTop: 10, fontFamily: "Inter, sans-serif" }}>{errorProceso}</p>}
              {procesoInfo && (
                <div style={{ marginTop: 14 }}>
                  {procesoInfo.encontrado ? (
                    <>
                      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted, marginBottom: 6 }}>{procesoInfo.proceso?.despacho}</p>
                      {procesoInfo.ultimaActuacion ? (
                        <div style={{ background: COLORS.accentSoft, borderRadius: 8, padding: 12 }}>
                          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 700, color: COLORS.ink, margin: 0 }}>
                            {procesoInfo.ultimaActuacion.actuacion}
                          </p>
                          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, margin: "4px 0 0" }}>
                            {new Date(procesoInfo.ultimaActuacion.fecha).toLocaleDateString("es-CO", { dateStyle: "long" })}
                          </p>
                          {procesoInfo.ultimaActuacion.anotacion && (
                            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.inkSoft, margin: "6px 0 0" }}>
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
            <Card>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.ink, marginBottom: 8 }}>Estado de cuenta</p>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.muted, margin: 0 }}>
                Total acordado: {formatoCOP(valorTotal)} · Pagado: {formatoCOP(totalPagado)}
              </p>
              <p
                style={{
                  display: "inline-block",
                  marginTop: 8,
                  fontFamily: "Inter, sans-serif",
                  fontSize: 12.5,
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: 20,
                  background: saldo <= 0 ? "#DCFCE7" : "#EFF6FF",
                  color: saldo <= 0 ? "#166534" : "#1D4ED8",
                }}
              >
                {saldo <= 0 ? "Al día" : `Saldo del plan: ${formatoCOP(saldo)}`}
              </p>
            </Card>
          )}

          {cliente.pagos?.length > 0 && (
            <Card>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.ink, marginBottom: 10 }}>Pagos registrados</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[...cliente.pagos]
                  .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
                  .map((p, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontFamily: "Inter, sans-serif", fontSize: 12.5 }}>
                      <span style={{ color: COLORS.muted }}>
                        {new Date(p.fecha).toLocaleDateString("es-CO", { dateStyle: "medium" })} · {p.concepto || "Pago"}
                      </span>
                      <span style={{ color: COLORS.ink, fontWeight: 600 }}>{formatoCOP(p.valor)}</span>
                    </div>
                  ))}
              </div>
            </Card>
          )}

          {cliente.documentos?.length > 0 && (
            <Card>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.ink, marginBottom: 10 }}>Documentos</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {cliente.documentos.map((d, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "Inter, sans-serif", fontSize: 12.5 }}>
                    <span style={{ color: COLORS.ink }}>{d.titulo}</span>
                    <span style={{ color: d.firmado ? "#166534" : "#B45309", fontWeight: 700 }}>{d.firmado ? "Firmado" : "Pendiente de firma"}</span>
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
