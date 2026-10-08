import { useState, useEffect } from "react";
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

const fuente = { fontFamily: "Inter, sans-serif" };
const fechaLarga = (f) => {
  if (!f) return "";
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(f) ? `${f}T12:00:00` : f);
  return isNaN(d) ? f : d.toLocaleDateString("es-CO", { dateStyle: "long" });
};
function numeroWhatsapp(celular) {
  const d = String(celular || "").replace(/\D/g, "");
  if (!d) return "";
  return d.length === 10 ? `57${d}` : d;
}
const botonWhatsapp = {
  ...buttonPrimary,
  background: "#1DA851",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  textDecoration: "none",
  boxSizing: "border-box",
};

export default function VistaPortalCliente() {
  const [codigo, setCodigo] = useState("");
  const [cliente, setCliente] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const [procesoInfo, setProcesoInfo] = useState(null);
  const [consultandoProceso, setConsultandoProceso] = useState(false);
  const [errorProceso, setErrorProceso] = useState("");
  const [descargandoRecibo, setDescargandoRecibo] = useState(null);
  const [errorRecibo, setErrorRecibo] = useState("");

  // El link que el despacho comparte por WhatsApp ya trae el código
  // (?codigo=...#portal): el cliente entra directo, sin tener que copiarlo
  // ni escribirlo. Se borra de la barra de direcciones apenas se lee.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const desdeLink = (params.get("codigo") || "").trim();
    if (!desdeLink) return;
    window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    setCodigo(desdeLink);
    buscar(desdeLink);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buscar = async (codigoDirecto) => {
    const code = (typeof codigoDirecto === "string" ? codigoDirecto : codigo).trim();
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

  const descargarRecibo = async (pago) => {
    if (!pago.id) return;
    setDescargandoRecibo(pago.id);
    setErrorRecibo("");
    try {
      const resp = await fetch(`/api/documentos/firmar?accion=recibo-portal&codigo=${encodeURIComponent(codigo.trim())}&pagoId=${encodeURIComponent(pago.id)}`);
      const data = await resp.json();
      const href = data.url || data.dataUrl;
      if (href) {
        const a = document.createElement("a");
        a.href = href;
        a.target = "_blank";
        a.rel = "noreferrer";
        a.download = `recibo_${pago.fecha || ""}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        setErrorRecibo("No pudimos descargar el recibo. Intenta de nuevo o pídeselo a tu abogado.");
      }
    } catch (e) {
      setErrorRecibo("No pudimos descargar el recibo. Revisa tu conexión e intenta de nuevo.");
    }
    setDescargandoRecibo(null);
  };

  const totalPagado = (cliente?.pagos || []).reduce((sum, p) => sum + (Number(p.valor) || 0), 0);
  const valorTotal = Number(cliente?.valorTotal) || 0;
  const saldo = valorTotal > 0 ? valorTotal - totalPagado : null;
  const porcentajePagado = valorTotal > 0 ? Math.min(100, Math.round((totalPagado / valorTotal) * 100)) : 0;
  const despacho = cliente?.despacho || {};
  const whatsappDespacho = numeroWhatsapp(despacho.celular);
  const enlaceWhatsapp = (texto) => `https://wa.me/${whatsappDespacho}?text=${encodeURIComponent(texto)}`;
  const saludo = `Hola${cliente?.abogadoAsignado ? ` ${cliente.abogadoAsignado}` : ""}, soy ${cliente?.nombre || "tu cliente"}.`;
  const cuotas = (cliente?.cuotas || []).filter((c) => c && c.fecha);
  // Las cuotas se dan por pagadas en orden, según lo abonado en total.
  let restante = totalPagado;
  const cuotasConEstado = [...cuotas]
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
    .map((c) => {
      const valor = Number(c.valor) || 0;
      const pagada = valor > 0 && restante >= valor;
      restante = Math.max(0, restante - valor);
      return { ...c, valor, pagada };
    });
  const hoy = new Date().toISOString().slice(0, 10);
  const siguienteCuota = cuotasConEstado.find((c) => !c.pagada);
  const proximoPago = siguienteCuota?.fecha || (saldo > 0 ? cliente?.proximoPago : null);
  const tieneContrato = (cliente?.documentos || []).some((d) => /contrato/i.test(d.titulo || ""));
  const colorArea = COLOR_AREA_PROCESO[cliente?.areaProceso] || COLORS.accentBright;

  return (
    <div
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "0 20px 40px",
        minHeight: cliente ? undefined : "100%",
        background: cliente ? undefined : `linear-gradient(180deg, ${COLORS.surfaceSoft} 0%, transparent 220px)`,
      }}
    >
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
        <Card style={{ borderRadius: 18, boxShadow: "0 16px 40px rgba(15,85,64,0.1)", position: "relative", overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              right: -50,
              top: -60,
              width: 180,
              height: 180,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${COLORS.accentSoft}, transparent 70%)`,
              pointerEvents: "none",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, position: "relative" }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                flexShrink: 0,
                background: `linear-gradient(135deg, ${COLORS.navy}, ${COLORS.navyDeep})`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#FFFFFF",
                boxShadow: `0 6px 14px ${COLORS.navy}40`,
              }}
            >
              <Icono tipo="llave" size={17} />
            </div>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: COLORS.inkSoft, margin: 0, lineHeight: 1.45 }}>
              Ingresa el código de acceso que te compartió tu abogado para ver el estado de tu proceso.
            </p>
          </div>
          <div style={{ position: "relative" }}>
            <Field label="Código de acceso">
              <input
                className="drx-input"
                style={{ ...inputStyle, fontWeight: 700, fontSize: 18, fontFamily: "monospace", textAlign: "center", letterSpacing: 3, padding: "14px 12px" }}
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
            <p
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 11.5,
                color: COLORS.muted,
                margin: "14px 0 0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
              }}
            >
              <Icono tipo="escudo" size={12} />
              Solo tú puedes ver esta información con tu código
            </p>
          </div>
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
                  {cliente.areaProceso && cliente.areaProceso !== "Otro" && (
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
                  {cliente.tipoProceso && cliente.tipoProceso !== "Otro" && (
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

          {(cliente.abogadoAsignado || despacho.nombre || whatsappDespacho) && (
            <Card style={{ borderRadius: 16 }}>
              <EncabezadoTarjeta icono="persona" color="#0F766E" titulo="Tu abogado" />
              {cliente.abogadoAsignado && <p style={{ ...fuente, fontSize: 14.5, fontWeight: 700, color: COLORS.headingText, margin: 0 }}>{cliente.abogadoAsignado}</p>}
              {despacho.nombre && <p style={{ ...fuente, fontSize: 12.5, color: COLORS.muted, margin: "3px 0 0" }}>{despacho.nombre}</p>}
              {cliente.juzgadoActual && (
                <p style={{ ...fuente, fontSize: 12.5, color: COLORS.inkSoft, margin: "10px 0 0", display: "flex", alignItems: "center", gap: 6 }}>
                  <Icono tipo="edificio" size={13} /> Tu proceso está en: {cliente.juzgadoActual}
                </p>
              )}
              {whatsappDespacho && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
                  <a className="drx-btn-primary" style={botonWhatsapp} href={enlaceWhatsapp(`${saludo} Quisiera recibir información sobre mi proceso.`)} target="_blank" rel="noreferrer">
                    Solicitar información
                  </a>
                  <a className="drx-btn-primary" style={{ ...botonWhatsapp, background: COLORS.navy }} href={enlaceWhatsapp(`${saludo} Quisiera agendar una cita.`)} target="_blank" rel="noreferrer">
                    Pedir una cita
                  </a>
                </div>
              )}
            </Card>
          )}

          {cliente.citas?.length > 0 && (
            <Card style={{ borderRadius: 16 }}>
              <EncabezadoTarjeta icono="calendario" color="#E11D48" titulo={cliente.citas.length > 1 ? "Próximas citas" : "Próxima cita"} />
              {cliente.citas.map((c, i) => (
                <div key={i} style={{ padding: "10px 0", borderTop: i ? `1px solid ${COLORS.border}` : "none", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <p style={{ ...fuente, fontSize: 13.5, fontWeight: 700, color: COLORS.headingText, margin: 0 }}>{c.titulo || "Cita con tu abogado"}</p>
                    <p style={{ ...fuente, fontSize: 12, color: COLORS.muted, margin: "3px 0 0" }}>
                      {fechaLarga(c.fecha)}
                      {c.hora ? ` · ${c.hora}` : ""}
                    </p>
                  </div>
                  {c.meet && (
                    <a className="drx-btn-primary" style={{ ...botonWhatsapp, background: "#1A73E8", padding: "8px 14px", fontSize: 12.5 }} href={c.meet} target="_blank" rel="noreferrer">
                      Unirme por Meet
                    </a>
                  )}
                </div>
              ))}
            </Card>
          )}

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

          {cliente.actuaciones?.length > 0 && (
            <Card style={{ borderRadius: 16 }}>
              <EncabezadoTarjeta icono="reloj" color="#6366F1" titulo="Novedades de tu caso" />
              <div style={{ position: "relative", paddingLeft: 18 }}>
                <div style={{ position: "absolute", left: 5, top: 6, bottom: 6, width: 2, background: COLORS.border }} />
                {cliente.actuaciones.map((a, i) => (
                  <div key={i} style={{ position: "relative", paddingBottom: i < cliente.actuaciones.length - 1 ? 14 : 0 }}>
                    <div style={{ position: "absolute", left: -17, top: 4, width: 10, height: 10, borderRadius: "50%", background: i === 0 ? "#6366F1" : COLORS.surface, border: "2px solid #6366F1" }} />
                    <p style={{ ...fuente, fontSize: 11.5, color: COLORS.muted, margin: 0 }}>{fechaLarga(a.fecha)}</p>
                    <p style={{ ...fuente, fontSize: 13, color: COLORS.ink, margin: "2px 0 0", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{a.nota}</p>
                  </div>
                ))}
              </div>
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
              {proximoPago && saldo > 0 && (
                <p style={{ ...fuente, fontSize: 12.5, color: proximoPago < hoy ? "#B42318" : COLORS.inkSoft, margin: "12px 0 0", display: "flex", alignItems: "center", gap: 6 }}>
                  <Icono tipo="calendario" size={13} />
                  {proximoPago < hoy ? "Pago vencido desde" : "Próximo pago:"} {fechaLarga(proximoPago)}
                  {siguienteCuota?.valor ? ` · ${formatoCOP(siguienteCuota.valor)}` : ""}
                </p>
              )}
              {cuotasConEstado.length > 0 && (
                <div style={{ marginTop: 14, borderTop: `1px solid ${COLORS.border}`, paddingTop: 10 }}>
                  <p style={{ ...fuente, fontSize: 12, fontWeight: 700, color: COLORS.inkSoft, margin: "0 0 6px" }}>Plan de pagos</p>
                  {cuotasConEstado.map((c, i) => (
                    <div key={i} style={{ ...fuente, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, padding: "6px 0" }}>
                      <span style={{ color: COLORS.ink }}>
                        {c.esAnticipo ? "Anticipo" : `Cuota ${cuotasConEstado.filter((x, j) => j <= i && !x.esAnticipo).length}`} · {fechaLarga(c.fecha)}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 700, color: COLORS.ink }}>{formatoCOP(c.valor)}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: c.pagada ? "#DCFCE7" : c.fecha < hoy ? "#FEE2E2" : "#EFF6FF", color: c.pagada ? "#166534" : c.fecha < hoy ? "#B42318" : "#1D4ED8" }}>
                          {c.pagada ? "Pagada" : c.fecha < hoy ? "Vencida" : "Pendiente"}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
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
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ color: "#166534", fontWeight: 700 }}>{formatoCOP(p.valor)}</span>
                        {p.tieneRecibo && (
                          <button
                            onClick={() => descargarRecibo(p)}
                            disabled={descargandoRecibo === p.id}
                            title="Descargar recibo"
                            style={{
                              background: COLORS.surfaceSoft,
                              border: `1px solid ${COLORS.border}`,
                              borderRadius: 8,
                              width: 28,
                              height: 28,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                              color: COLORS.inkSoft,
                              flexShrink: 0,
                            }}
                          >
                            <Icono tipo="cursorArriba" size={13} style={{ transform: "rotate(180deg)" }} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
              {errorRecibo && (
                <p style={{ margin: "10px 0 0", color: "#B91C1C", fontFamily: "Inter, sans-serif", fontSize: 12 }}>{errorRecibo}</p>
              )}
            </Card>
          )}

          <Card style={{ borderRadius: 16 }}>
            <EncabezadoTarjeta icono="clip" color="#F5A524" titulo="Documentos" />
            <div style={{ display: "flex", flexDirection: "column" }}>
              {!tieneContrato && (
                <div style={{ border: `1.5px dashed ${COLORS.border}`, borderRadius: 12, padding: 14, marginBottom: cliente.documentos?.length ? 8 : 0, background: COLORS.surfaceSoft }}>
                  <p style={{ ...fuente, fontSize: 13, fontWeight: 700, color: COLORS.ink, margin: 0 }}>Contrato de prestación de servicios</p>
                  <p style={{ ...fuente, fontSize: 12, color: COLORS.muted, margin: "4px 0 0", lineHeight: 1.45 }}>Tu contrato todavía no está cargado aquí. Puedes pedírselo a tu abogado.</p>
                  {whatsappDespacho && (
                    <a className="drx-btn-primary" style={{ ...botonWhatsapp, marginTop: 10, padding: "8px 14px", fontSize: 12.5 }} href={enlaceWhatsapp(`${saludo} ¿Me pueden compartir mi contrato de prestación de servicios en el portal?`)} target="_blank" rel="noreferrer">
                      Pedírselo a mi abogado
                    </a>
                  )}
                </div>
              )}
              {(cliente.documentos || []).map((d, i, arr) => (
                <div
                  key={i}
                  style={{ ...fuente, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 12.5, padding: "10px 0", borderBottom: i < arr.length - 1 ? `1px solid ${COLORS.border}` : "none" }}
                >
                  <span style={{ color: COLORS.ink, fontWeight: 600 }}>{d.titulo}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 700, fontSize: 11.5, padding: "3px 10px", borderRadius: 20, background: d.firmado ? "#DCFCE7" : "#FEF3E2", color: d.firmado ? "#166534" : "#B45309" }}>
                      <Icono tipo={d.firmado ? "check" : "reloj"} size={11} />
                      {d.firmado ? "Firmado" : "Pendiente de firma"}
                    </span>
                    {d.id && (
                      <a href={`/?codigo=${encodeURIComponent(d.id)}#firmar`} style={{ fontWeight: 700, fontSize: 12, color: COLORS.navy }}>
                        {d.firmado ? "Ver" : "Firmar ahora"}
                      </a>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
