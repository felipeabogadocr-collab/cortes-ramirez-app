// Contabilidad se movió a su propio archivo (y se carga con React.lazy desde
// App.jsx) porque era, de lejos, la pestaña más pesada del bundle único que
// tenía toda la app — separarla en su propio chunk hace que quien no abre
// Contabilidad no tenga que descargar/parsear todo este código de entrada.
import { useState, useEffect, useCallback, useMemo } from "react";
import { storageGet, storageSet, obtenerUrlReciboImagen, getNombreDespacho } from "../lib/storage";
import { numeroEnLetras } from "../lib/numeroEnLetras.js";
import {
  COLORS,
  uid,
  registrarAuditoria,
  exportarCSV,
  formatoCOP,
  diasHasta,
  calcularProximaFechaPorFrecuencia,
  generarReciboImagen,
  useIndex,
  useConfirmarDialogo,
  DIAS_AVISO_PROXIMO_PAGO,
  Field,
  inputStyle,
  CampoDinero,
  buttonPrimary,
  buttonGhost,
  Card,
  EncabezadoSeccion,
  Icono,
  AvatarIniciales,
  Spinner,
  GraficaBarras,
  GraficaBarrasAgrupadas,
  CATEGORIAS_EGRESO,
  useEgresos,
  CATEGORIAS_OTRO_INGRESO,
  useOtrosIngresos,
  numeroWhatsappCliente,
  textoEstadoPago,
  enviarRecordatorioPago,
  ensureJsPDF,
  LOGO_SRC,
} from "../App.jsx";

const MEDIOS_PAGO = ["Nequi", "Daviplata", "Nu", "Cuenta bancaria", "Llave"];

// Cuando el cliente que paga es agente retenedor (típicamente una empresa),
// no transfiere el valor completo de la cuenta de cobro: retiene un
// porcentaje y se lo entrega directamente a la DIAN a nombre del abogado.
// Sin esto, lo que quedaba registrado como "pagado" no coincidía con lo que
// realmente entraba a la cuenta bancaria, y ese dato se perdía a la hora de
// declarar renta. Los porcentajes son los más comunes para honorarios.
const OPCIONES_RETENCION = [
  { valor: "0", etiqueta: "No" },
  { valor: "4", etiqueta: "4%" },
  { valor: "6", etiqueta: "6%" },
  { valor: "10", etiqueta: "10%" },
  { valor: "11", etiqueta: "11%" },
  { valor: "otro", etiqueta: "Otro porcentaje" },
];

function valorRetenido(pago) {
  const porcentaje = Number(pago?.retencionPorcentaje) || 0;
  if (porcentaje <= 0) return 0;
  return Math.round(((Number(pago.valor) || 0) * porcentaje) / 100);
}

function valorNetoPago(pago) {
  return (Number(pago?.valor) || 0) - valorRetenido(pago);
}

// Cuenta de cobro (distinta de la factura electrónica DIAN, que requiere un
// proveedor tecnológico de pago): el documento tradicional que usan
// abogados independientes bajo el régimen simplificado para cobrar sus
// honorarios, con numeración consecutiva, datos del responsable y el valor
// en letras. Datos del responsable (perfil-abogado, ya usado también en
// Firmar documentos) y consecutivo se guardan en el almacenamiento propio
// del despacho — nada de esto pasa por un servicio externo, es gratis.
async function siguienteConsecutivoCuentaCobro() {
  const raw = await storageGet("consecutivo-cuenta-cobro", false);
  const actual = raw ? Number(raw) || 0 : 0;
  const siguiente = actual + 1;
  await storageSet("consecutivo-cuenta-cobro", String(siguiente), false);
  return siguiente;
}

async function generarCuentaDeCobroPdf({ cliente, pago, datosResponsable, numero }) {
  await ensureJsPDF();
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "pt", format: "carta" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const marginX = 64;
  let y = 66;

  const nombreDespacho = getNombreDespacho();
  const responsable = (datosResponsable?.nombre || nombreDespacho || "").trim();
  const documento = (datosResponsable?.documento || "").trim();
  const ciudad = (datosResponsable?.ciudad || "").trim();
  const fechaTexto = new Date(pago.fecha).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
  const concepto = pago.concepto?.trim() || "servicios de asesoría y gestión jurídica";

  // Mismo logo que ya se usa en el recibo de pago (canvas) — centrado
  // arriba, para que la cuenta de cobro se vea igual de institucional.
  try {
    const logoSize = 56;
    pdf.addImage(LOGO_SRC, "PNG", pageWidth / 2 - logoSize / 2, y, logoSize, logoSize);
    y += logoSize + 24;
  } catch (e) {
    // Si por lo que sea el logo no carga (formato inesperado), el PDF se
    // genera igual, solo sin la imagen — nunca debe bloquear la cuenta de
    // cobro por esto.
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text("CUENTA DE COBRO", pageWidth / 2, y, { align: "center" });
  y += 22;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(12);
  pdf.text(`No. ${numero}`, pageWidth / 2, y, { align: "center" });
  y += 40;

  pdf.setFontSize(11);
  pdf.text(`${ciudad || "___________"}, ${fechaTexto}`, marginX, y);
  y += 40;

  pdf.setFontSize(12);
  const parrafo1 = `Debe a ${responsable}${documento ? `, identificado(a) con C.C./NIT No. ${documento}` : ""}, la suma de:`;
  const lineas1 = pdf.splitTextToSize(parrafo1, pageWidth - marginX * 2);
  pdf.text(lineas1, marginX, y);
  y += lineas1.length * 16 + 10;

  pdf.setFont("helvetica", "bold");
  const lineasValor = pdf.splitTextToSize(`${numeroEnLetras(pago.valor)} (${formatoCOP(pago.valor)})`, pageWidth - marginX * 2);
  pdf.text(lineasValor, marginX, y);
  y += lineasValor.length * 16 + 20;

  pdf.setFont("helvetica", "normal");
  const parrafo2 = `Por concepto de: ${concepto}, prestados a ${cliente.nombre || "el/la cliente"}.`;
  const lineas2 = pdf.splitTextToSize(parrafo2, pageWidth - marginX * 2);
  pdf.text(lineas2, marginX, y);
  y += lineas2.length * 16 + 60;

  pdf.line(marginX, y, marginX + 220, y);
  y += 16;
  pdf.setFont("helvetica", "bold");
  pdf.text(responsable || nombreDespacho, marginX, y);
  y += 15;
  pdf.setFont("helvetica", "normal");
  if (documento) {
    pdf.text(`C.C./NIT No. ${documento}`, marginX, y);
    y += 15;
  }
  pdf.text(nombreDespacho, marginX, y);

  pdf.setFontSize(9);
  pdf.setTextColor(150, 150, 150);
  pdf.text(`Generado electrónicamente · ${nombreDespacho}`, marginX, pdf.internal.pageSize.getHeight() - 40);

  const nombreArchivo = `cuenta_de_cobro_${numero}_${(cliente.nombre || "cliente").replace(/[^a-z0-9]+/gi, "_").toLowerCase()}.pdf`;
  pdf.save(nombreArchivo);
}

function PanelDatosCuentaCobro({ datos, onGuardar }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState(datos?.nombre || "");
  const [documento, setDocumento] = useState(datos?.documento || "");
  const [ciudad, setCiudad] = useState(datos?.ciudad || "");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setNombre(datos?.nombre || "");
    setDocumento(datos?.documento || "");
    setCiudad(datos?.ciudad || "");
  }, [datos]);

  const guardar = async () => {
    setGuardando(true);
    await onGuardar({ nombre: nombre.trim(), documento: documento.trim(), ciudad: ciudad.trim() });
    setGuardando(false);
    setAbierto(false);
  };

  const completo = datos?.nombre && datos?.documento;

  return (
    <Card style={{ marginBottom: 20 }}>
      <button
        onClick={() => setAbierto((a) => !a)}
        style={{ background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: 0 }}
      >
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 700, color: COLORS.ink, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
          <Icono tipo="documento" size={14} /> Datos para cuenta de cobro {completo ? "" : "(faltan por completar)"}
        </p>
        <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted }}>{abierto ? "Ocultar ▲" : "Editar ▼"}</span>
      </button>
      {!abierto && (
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, marginTop: 6 }}>
          {completo
            ? `${datos.nombre} · C.C./NIT ${datos.documento}${datos.ciudad ? ` · ${datos.ciudad}` : ""}`
            : "Se usan para generar tus cuentas de cobro (nombre, cédula o NIT, ciudad)."}
        </p>
      )}
      {abierto && (
        <div style={{ marginTop: 14 }}>
          <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <Field label="Nombre completo del responsable">
              <input className="drx-input" style={inputStyle} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Christian Felipe Cortés Ramírez" />
            </Field>
            <Field label="C.C. o NIT">
              <input className="drx-input" style={inputStyle} value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="Ej: 1.234.567.890" />
            </Field>
          </div>
          <Field label="Ciudad (opcional)">
            <input className="drx-input" style={{ ...inputStyle, maxWidth: 260 }} value={ciudad} onChange={(e) => setCiudad(e.target.value)} placeholder="Ej: Bogotá D.C." />
          </Field>
          <button className="drx-btn-primary" style={{ ...buttonPrimary, marginTop: 12 }} onClick={guardar} disabled={guardando || !nombre.trim()}>
            {guardando ? "Guardando…" : "Guardar datos"}
          </button>
        </div>
      )}
    </Card>
  );
}

function CampoRetencion({ valor, onChange, valorOtro, onChangeOtro }) {
  return (
    <>
      <Field label="¿El cliente te retuvo en la fuente? (opcional)">
        <select className="drx-input" style={inputStyle} value={valor} onChange={(e) => onChange(e.target.value)}>
          {OPCIONES_RETENCION.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </select>
      </Field>
      {valor === "otro" && (
        <Field label="Porcentaje retenido">
          <input
            type="number"
            className="drx-input"
            style={inputStyle}
            value={valorOtro}
            onChange={(e) => onChangeOtro(e.target.value)}
            placeholder="Ej: 7"
            min="0"
            max="100"
          />
        </Field>
      )}
    </>
  );
}

function PanelPresupuesto({ presupuesto, onGuardar }) {
  const [abierto, setAbierto] = useState(false);
  const [valor, setValor] = useState(presupuesto?.valor ? String(presupuesto.valor) : "");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setValor(presupuesto?.valor ? String(presupuesto.valor) : "");
  }, [presupuesto]);

  const guardar = async () => {
    setGuardando(true);
    await onGuardar({ valor: Number(valor) || 0 });
    setGuardando(false);
    setAbierto(false);
  };

  const activo = Number(presupuesto?.valor) > 0;

  return (
    <Card style={{ marginBottom: 20 }}>
      <button
        onClick={() => setAbierto((a) => !a)}
        style={{ background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: 0 }}
      >
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 700, color: COLORS.ink, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
          <Icono tipo="balanza" size={14} /> Presupuesto mensual de gastos {activo ? "" : "(sin definir)"}
        </p>
        <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted }}>{abierto ? "Ocultar ▲" : "Editar ▼"}</span>
      </button>
      {!abierto && (
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, marginTop: 6 }}>
          {activo
            ? `Tope de gasto: ${formatoCOP(presupuesto.valor)} al mes.`
            : "Ponle un tope a lo que gastas al mes (arriendo, nómina, servicios...) para que la app te avise cuando te estés acercando."}
        </p>
      )}
      {abierto && (
        <div style={{ marginTop: 14 }}>
          <Field label="Tope de gastos al mes (opcional)">
            <CampoDinero style={{ ...inputStyle, maxWidth: 260 }} value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ej: 2.000.000" />
          </Field>
          <button className="drx-btn-primary" style={{ ...buttonPrimary, marginTop: 12 }} onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar presupuesto"}
          </button>
        </div>
      )}
    </Card>
  );
}

function FormularioPago({ cliente, onRegistrar }) {
  const hoyStr = new Date().toISOString().slice(0, 10);
  const [medioPago, setMedioPago] = useState(MEDIOS_PAGO[0]);
  const [valor, setValor] = useState("");
  const [fechaPago, setFechaPago] = useState(hoyStr);
  const [concepto, setConcepto] = useState("");
  const [fechaProximoPago, setFechaProximoPago] = useState("");
  const [valorProximoPago, setValorProximoPago] = useState("");
  const [retencion, setRetencion] = useState("0");
  const [retencionOtro, setRetencionOtro] = useState("");
  const [generando, setGenerando] = useState(false);

  const registrar = async () => {
    if (!valor || Number(valor) <= 0) return;
    setGenerando(true);
    await onRegistrar({
      medioPago,
      valor: Number(valor),
      fechaPago,
      concepto: concepto.trim(),
      fechaProximoPago: fechaProximoPago || null,
      valorProximoPago: valorProximoPago ? Number(valorProximoPago) : null,
      retencionPorcentaje: retencion === "otro" ? Number(retencionOtro) || 0 : Number(retencion),
    });
    setValor("");
    setFechaPago(hoyStr);
    setConcepto("");
    setFechaProximoPago("");
    setValorProximoPago("");
    setRetencion("0");
    setRetencionOtro("");
    setGenerando(false);
  };

  return (
    <div style={{ marginTop: 12, borderTop: `1px solid ${COLORS.border}`, paddingTop: 14 }}>
      <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Field label="Medio de pago">
          <select className="drx-input" style={inputStyle} value={medioPago} onChange={(e) => setMedioPago(e.target.value)}>
            {MEDIOS_PAGO.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Valor pagado (COP)">
          <CampoDinero style={inputStyle} value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ej: 500.000" />
        </Field>
      </div>
      <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Field label="Fecha en que se hizo el pago">
          <input type="date" className="drx-input" style={inputStyle} value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />
        </Field>
        <Field label="Concepto (opcional)">
          <input className="drx-input" style={inputStyle} value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Ej: Cuota inicial, honorarios..." />
        </Field>
      </div>
      <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        <Field label="Fecha del próximo pago (opcional, si no la calcula el plan de pago)">
          <input type="date" className="drx-input" style={inputStyle} value={fechaProximoPago} onChange={(e) => setFechaProximoPago(e.target.value)} />
        </Field>
        <Field label="Valor esperado del próximo pago (opcional)">
          <CampoDinero style={inputStyle} value={valorProximoPago} onChange={(e) => setValorProximoPago(e.target.value)} placeholder="Ej: 500.000" />
        </Field>
      </div>
      <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        <CampoRetencion valor={retencion} onChange={setRetencion} valorOtro={retencionOtro} onChangeOtro={setRetencionOtro} />
      </div>
      {retencion !== "0" && Number(valor) > 0 && (
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, marginTop: 8 }}>
          Neto que realmente vas a recibir: <strong style={{ color: COLORS.headingText }}>{formatoCOP(valorNetoPago({ valor: Number(valor), retencionPorcentaje: retencion === "otro" ? Number(retencionOtro) || 0 : Number(retencion) }))}</strong>
        </p>
      )}
      <button className="drx-btn-primary drx-cta-shine" style={{ ...buttonPrimary, marginTop: 14 }} onClick={registrar} disabled={generando}>
        {generando ? "Generando recibo..." : "Registrar pago y generar recibo"}
      </button>
    </div>
  );
}

// El recibo puede venir de dos formas: un base64 completo (recibos viejos,
// de antes de mover esto a Storage) o una ruta dentro del bucket privado
// "recibos" (recibos nuevos) — en ese segundo caso hay que pedirle la
// imagen a Supabase antes de poder mostrarla, por eso el estado de carga.
function useUrlRecibo(reciboImagen) {
  const [url, setUrl] = useState(reciboImagen?.startsWith("data:") ? reciboImagen : null);
  useEffect(() => {
    if (!reciboImagen || reciboImagen.startsWith("data:")) return;
    let cancelado = false;
    let urlCreada = null;
    obtenerUrlReciboImagen(reciboImagen)
      .then((u) => {
        if (cancelado) return;
        urlCreada = u;
        setUrl(u);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
      if (urlCreada) URL.revokeObjectURL(urlCreada);
    };
  }, [reciboImagen]);
  return url;
}

function ReciboCard({ cliente, pago, onEditar, onEliminar, datosResponsable }) {
  const [copiado, setCopiado] = useState(false);
  const [editando, setEditando] = useState(false);
  const [medioPago, setMedioPago] = useState(pago.medioPago);
  const [valor, setValor] = useState(String(pago.valor ?? ""));
  const [fecha, setFecha] = useState(new Date(pago.fecha).toISOString().slice(0, 10));
  const [concepto, setConcepto] = useState(pago.concepto || "");
  const retencionInicial = pago.retencionPorcentaje && !OPCIONES_RETENCION.some((o) => o.valor === String(pago.retencionPorcentaje)) ? "otro" : String(pago.retencionPorcentaje || 0);
  const [retencion, setRetencion] = useState(retencionInicial);
  const [retencionOtro, setRetencionOtro] = useState(retencionInicial === "otro" ? String(pago.retencionPorcentaje) : "");
  const [guardando, setGuardando] = useState(false);
  const [generandoCuenta, setGenerandoCuenta] = useState(false);
  const numero = numeroWhatsappCliente(cliente.telefono);
  const urlRecibo = useUrlRecibo(pago.reciboImagen);

  const enviarPorWhatsapp = () => {
    const mensaje = `Hola ${cliente.nombre || ""} 👋\n\n*${getNombreDespacho()}* te confirma la recepción de tu pago:\n\n💳 Medio: ${pago.medioPago}\n💰 Valor: ${formatoCOP(pago.valor)}\n📅 Fecha: ${new Date(pago.fecha).toLocaleDateString("es-CO", { dateStyle: "long" })}${pago.concepto ? `\n📝 Concepto: ${pago.concepto}` : ""}\n\nTe adjuntamos el recibo. ¡Gracias por tu confianza!`;
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`, "_blank");
  };

  const descargarCuentaDeCobro = async () => {
    setGenerandoCuenta(true);
    try {
      const numeroConsecutivo = await siguienteConsecutivoCuentaCobro();
      await generarCuentaDeCobroPdf({ cliente, pago, datosResponsable, numero: numeroConsecutivo });
    } catch (e) {
      console.error("No se pudo generar la cuenta de cobro:", e);
    }
    setGenerandoCuenta(false);
  };

  const guardarEdicion = async () => {
    if (!valor || Number(valor) <= 0) return;
    setGuardando(true);
    await onEditar({
      medioPago,
      valor: Number(valor),
      fecha: new Date(`${fecha}T12:00:00`).toISOString(),
      concepto: concepto.trim(),
      retencionPorcentaje: retencion === "otro" ? Number(retencionOtro) || 0 : Number(retencion),
    });
    setGuardando(false);
    setEditando(false);
  };

  if (editando) {
    return (
      <div style={{ background: COLORS.surfaceSoft, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 12, marginTop: 10 }}>
        <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <Field label="Medio de pago">
            <select className="drx-input" style={inputStyle} value={medioPago} onChange={(e) => setMedioPago(e.target.value)}>
              {MEDIOS_PAGO.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Valor (COP)">
            <CampoDinero style={inputStyle} value={valor} onChange={(e) => setValor(e.target.value)} />
          </Field>
        </div>
        <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <Field label="Fecha del pago">
            <input type="date" className="drx-input" style={inputStyle} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
          <Field label="Concepto (opcional)">
            <input className="drx-input" style={inputStyle} value={concepto} onChange={(e) => setConcepto(e.target.value)} />
          </Field>
        </div>
        <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <CampoRetencion valor={retencion} onChange={setRetencion} valorOtro={retencionOtro} onChangeOtro={setRetencionOtro} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="drx-btn-primary" style={{ ...buttonPrimary, padding: "6px 14px", fontSize: 12 }} onClick={guardarEdicion} disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar cambios"}
          </button>
          <button className="drx-btn-ghost" style={{ ...buttonGhost, padding: "6px 14px", fontSize: 12 }} onClick={() => setEditando(false)} disabled={guardando}>
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start", background: COLORS.surfaceSoft, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 12, marginTop: 10 }}>
      {urlRecibo ? (
        <img src={urlRecibo} alt="Recibo de pago" style={{ width: 140, borderRadius: 6, border: `1px solid ${COLORS.border}` }} />
      ) : pago.reciboImagen ? (
        <div style={{ width: 140, height: 178, borderRadius: 6, border: `1px solid ${COLORS.border}`, background: COLORS.panel, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Spinner texto="" />
        </div>
      ) : null}
      <div style={{ flex: 1, minWidth: 180 }}>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: COLORS.ink, margin: 0 }}>
          {formatoCOP(pago.valor)} · {pago.medioPago}
        </p>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, margin: "3px 0 8px" }}>
          {new Date(pago.fecha).toLocaleDateString("es-CO", { dateStyle: "medium" })}
          {pago.concepto ? ` · ${pago.concepto}` : ""}
        </p>
        {Number(pago.retencionPorcentaje) > 0 && (
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: "#7C3AED", background: "#F5F3FF", display: "inline-block", padding: "3px 9px", borderRadius: 20, margin: "0 0 8px" }}>
            Retención {pago.retencionPorcentaje}% ({formatoCOP(valorRetenido(pago))}) · Neto recibido {formatoCOP(valorNetoPago(pago))}
          </p>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {urlRecibo && (
            <a
              href={urlRecibo}
              download={`recibo_${(cliente.nombre || "cliente").replace(/[^a-z0-9]+/gi, "_")}_${pago.id}.png`}
              style={{ ...buttonGhost, padding: "5px 12px", fontSize: 12, textDecoration: "none" }}
              onClick={() => {
                setCopiado(true);
                setTimeout(() => setCopiado(false), 1200);
              }}
            >
              {copiado ? (
                "Descargando..."
              ) : (
                <>
                  <Icono tipo="cursorArriba" size={13} style={{ marginRight: 4, verticalAlign: -2, transform: "rotate(180deg)" }} /> Descargar recibo
                </>
              )}
            </a>
          )}
          {numero && (
            <button className="drx-btn-primary" style={{ ...buttonPrimary, padding: "5px 12px", fontSize: 12, background: "#1DA851" }} onClick={enviarPorWhatsapp}>
              Enviar por WhatsApp ↗
            </button>
          )}
          <button className="drx-btn-ghost" style={{ ...buttonGhost, padding: "5px 12px", fontSize: 12 }} onClick={descargarCuentaDeCobro} disabled={generandoCuenta}>
            {generandoCuenta ? (
              "Generando…"
            ) : (
              <>
                <Icono tipo="documento" size={13} style={{ marginRight: 4, verticalAlign: -2 }} /> Cuenta de cobro (PDF)
              </>
            )}
          </button>
          {onEditar && (
            <button className="drx-btn-ghost" style={{ ...buttonGhost, padding: "5px 12px", fontSize: 12 }} onClick={() => setEditando(true)}>
              Editar
            </button>
          )}
          {onEliminar && (
            <button className="drx-btn-ghost" style={{ ...buttonGhost, padding: "5px 12px", fontSize: 12, color: "#B42318", borderColor: "#F2B8B5" }} onClick={onEliminar}>
              Eliminar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const ORDEN_CONTABILIDAD = [
  { valor: "nombre", etiqueta: "Nombre" },
  { valor: "saldo", etiqueta: "Saldo pendiente (mayor primero)" },
  { valor: "ultimoPago", etiqueta: "Último pago (más reciente primero)" },
];

function FormularioEgreso({ onRegistrar }) {
  const hoyStr = new Date().toISOString().slice(0, 10);
  const [concepto, setConcepto] = useState("");
  const [categoria, setCategoria] = useState(CATEGORIAS_EGRESO[0]);
  const [valor, setValor] = useState("");
  const [fecha, setFecha] = useState(hoyStr);
  const [guardando, setGuardando] = useState(false);

  const registrar = async () => {
    if (!concepto.trim() || !valor || Number(valor) <= 0) return;
    setGuardando(true);
    await onRegistrar({ concepto, categoria, valor, fecha });
    setConcepto("");
    setValor("");
    setFecha(hoyStr);
    setGuardando(false);
  };

  return (
    <div style={{ marginTop: 12, borderTop: `1px solid ${COLORS.border}`, paddingTop: 14 }}>
      <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Field label="Concepto">
          <input className="drx-input" style={inputStyle} value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Ej: Arriendo oficina julio" />
        </Field>
        <Field label="Categoría">
          <select className="drx-input" style={inputStyle} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {CATEGORIAS_EGRESO.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Valor (COP)">
          <CampoDinero style={inputStyle} value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ej: 800.000" />
        </Field>
        <Field label="Fecha">
          <input type="date" className="drx-input" style={inputStyle} value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Field>
      </div>
      <button
        className="drx-btn-primary"
        style={{ ...buttonPrimary, marginTop: 14, background: "#F43F5E" }}
        onClick={registrar}
        disabled={guardando || !concepto.trim() || !valor}
      >
        {guardando ? "Guardando..." : "Registrar egreso"}
      </button>
    </div>
  );
}

function EgresoCard({ egreso, onEditar, onEliminar }) {
  const [editando, setEditando] = useState(false);
  const [concepto, setConcepto] = useState(egreso.concepto);
  const [categoria, setCategoria] = useState(egreso.categoria);
  const [valor, setValor] = useState(String(egreso.valor ?? ""));
  const [fecha, setFecha] = useState(new Date(egreso.fecha).toISOString().slice(0, 10));
  const [guardando, setGuardando] = useState(false);

  const guardarEdicion = async () => {
    if (!concepto.trim() || !valor || Number(valor) <= 0) return;
    setGuardando(true);
    await onEditar({ concepto: concepto.trim(), categoria, valor: Number(valor), fecha: new Date(`${fecha}T12:00:00`).toISOString() });
    setGuardando(false);
    setEditando(false);
  };

  if (editando) {
    return (
      <div style={{ background: COLORS.surfaceSoft, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 12, marginTop: 10 }}>
        <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <Field label="Concepto">
            <input className="drx-input" style={inputStyle} value={concepto} onChange={(e) => setConcepto(e.target.value)} />
          </Field>
          <Field label="Categoría">
            <select className="drx-input" style={inputStyle} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              {CATEGORIAS_EGRESO.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <Field label="Valor (COP)">
            <CampoDinero style={inputStyle} value={valor} onChange={(e) => setValor(e.target.value)} />
          </Field>
          <Field label="Fecha">
            <input type="date" className="drx-input" style={inputStyle} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="drx-btn-primary" style={{ ...buttonPrimary, padding: "6px 14px", fontSize: 12 }} onClick={guardarEdicion} disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar cambios"}
          </button>
          <button className="drx-btn-ghost" style={{ ...buttonGhost, padding: "6px 14px", fontSize: 12 }} onClick={() => setEditando(false)} disabled={guardando}>
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", background: COLORS.surfaceSoft, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 12, marginTop: 10 }}>
      <div>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: COLORS.ink, margin: 0 }}>
          {formatoCOP(egreso.valor)} · {egreso.concepto}
        </p>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, margin: "3px 0 0" }}>
          {egreso.categoria} · {new Date(egreso.fecha).toLocaleDateString("es-CO", { dateStyle: "medium" })}
        </p>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="drx-btn-ghost" style={{ ...buttonGhost, padding: "5px 12px", fontSize: 12 }} onClick={() => setEditando(true)}>
          Editar
        </button>
        <button className="drx-btn-ghost" style={{ ...buttonGhost, padding: "5px 12px", fontSize: 12, color: "#B42318", borderColor: "#F2B8B5" }} onClick={onEliminar}>
          Eliminar
        </button>
      </div>
    </div>
  );
}

function FormularioOtroIngreso({ onRegistrar }) {
  const hoyStr = new Date().toISOString().slice(0, 10);
  const [concepto, setConcepto] = useState("");
  const [categoria, setCategoria] = useState(CATEGORIAS_OTRO_INGRESO[0]);
  const [valor, setValor] = useState("");
  const [fecha, setFecha] = useState(hoyStr);
  const [guardando, setGuardando] = useState(false);

  const registrar = async () => {
    if (!concepto.trim() || !valor || Number(valor) <= 0) return;
    setGuardando(true);
    await onRegistrar({ concepto, categoria, valor, fecha });
    setConcepto("");
    setValor("");
    setFecha(hoyStr);
    setGuardando(false);
  };

  return (
    <div style={{ marginTop: 12, borderTop: `1px solid ${COLORS.border}`, paddingTop: 14 }}>
      <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Field label="Concepto">
          <input className="drx-input" style={inputStyle} value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Ej: Rendimientos cuenta de ahorros" />
        </Field>
        <Field label="Categoría">
          <select className="drx-input" style={inputStyle} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {CATEGORIAS_OTRO_INGRESO.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Valor (COP)">
          <CampoDinero style={inputStyle} value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ej: 300.000" />
        </Field>
        <Field label="Fecha">
          <input type="date" className="drx-input" style={inputStyle} value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Field>
      </div>
      <button
        className="drx-btn-primary"
        style={{ ...buttonPrimary, marginTop: 14, background: "#10B981" }}
        onClick={registrar}
        disabled={guardando || !concepto.trim() || !valor}
      >
        {guardando ? "Guardando..." : "Registrar ingreso"}
      </button>
    </div>
  );
}

function OtroIngresoCard({ ingreso, onEditar, onEliminar }) {
  const [editando, setEditando] = useState(false);
  const [concepto, setConcepto] = useState(ingreso.concepto);
  const [categoria, setCategoria] = useState(ingreso.categoria);
  const [valor, setValor] = useState(String(ingreso.valor ?? ""));
  const [fecha, setFecha] = useState(new Date(ingreso.fecha).toISOString().slice(0, 10));
  const [guardando, setGuardando] = useState(false);

  const guardarEdicion = async () => {
    if (!concepto.trim() || !valor || Number(valor) <= 0) return;
    setGuardando(true);
    await onEditar({ concepto: concepto.trim(), categoria, valor: Number(valor), fecha: new Date(`${fecha}T12:00:00`).toISOString() });
    setGuardando(false);
    setEditando(false);
  };

  if (editando) {
    return (
      <div style={{ background: COLORS.surfaceSoft, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 12, marginTop: 10 }}>
        <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <Field label="Concepto">
            <input className="drx-input" style={inputStyle} value={concepto} onChange={(e) => setConcepto(e.target.value)} />
          </Field>
          <Field label="Categoría">
            <select className="drx-input" style={inputStyle} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              {CATEGORIAS_OTRO_INGRESO.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <Field label="Valor (COP)">
            <CampoDinero style={inputStyle} value={valor} onChange={(e) => setValor(e.target.value)} />
          </Field>
          <Field label="Fecha">
            <input type="date" className="drx-input" style={inputStyle} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="drx-btn-primary" style={{ ...buttonPrimary, padding: "6px 14px", fontSize: 12 }} onClick={guardarEdicion} disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar cambios"}
          </button>
          <button className="drx-btn-ghost" style={{ ...buttonGhost, padding: "6px 14px", fontSize: 12 }} onClick={() => setEditando(false)} disabled={guardando}>
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", background: COLORS.surfaceSoft, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 12, marginTop: 10 }}>
      <div>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: COLORS.ink, margin: 0 }}>
          {formatoCOP(ingreso.valor)} · {ingreso.concepto}
        </p>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, margin: "3px 0 0" }}>
          {ingreso.categoria} · {new Date(ingreso.fecha).toLocaleDateString("es-CO", { dateStyle: "medium" })}
        </p>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="drx-btn-ghost" style={{ ...buttonGhost, padding: "5px 12px", fontSize: 12 }} onClick={() => setEditando(true)}>
          Editar
        </button>
        <button className="drx-btn-ghost" style={{ ...buttonGhost, padding: "5px 12px", fontSize: 12, color: "#B42318", borderColor: "#F2B8B5" }} onClick={onEliminar}>
          Eliminar
        </button>
      </div>
    </div>
  );
}

export default function ContabilidadTab({ usuarioActual }) {
  const { ids, cargado } = useIndex("indice-clientes", false);
  const [clientes, setClientes] = useState({});
  const [formAbiertoId, setFormAbiertoId] = useState(null);
  const [filtro, setFiltro] = useState("");
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [orden, setOrden] = useState("nombre");
  const [expandidos, setExpandidos] = useState({});
  // Antes solo había una forma de registrar plata: entrando al cliente
  // puntual y buscando su botón de "+ Registrar pago". Esta barra de arriba
  // deja registrar cualquiera de los 3 movimientos (pago de cliente, egreso,
  // u otro ingreso suelto) sin tener que ir a buscar nada primero.
  const [modoRegistro, setModoRegistro] = useState(null); // null | "pago" | "egreso" | "ingreso"
  const [pagoRapidoClienteId, setPagoRapidoClienteId] = useState("");
  const [filtroEgreso, setFiltroEgreso] = useState("");
  const [categoriaFiltroEgreso, setCategoriaFiltroEgreso] = useState("Todas");
  const [filtroOtroIngreso, setFiltroOtroIngreso] = useState("");
  const [categoriaFiltroOtroIngreso, setCategoriaFiltroOtroIngreso] = useState("Todas");
  const { egresos, crear: crearEgreso, editar: editarEgreso, eliminar: eliminarEgresoBase } = useEgresos();
  const { ingresos: otrosIngresos, crear: crearOtroIngreso, editar: editarOtroIngreso, eliminar: eliminarOtroIngresoBase } = useOtrosIngresos();
  const { confirmar, ConfirmarDialogo } = useConfirmarDialogo();

  // Mismos datos que usa "Firmar documentos" para la firma del abogado
  // (perfil-abogado) — aquí se completan también con documento y ciudad,
  // que necesita la cuenta de cobro pero la firma no.
  const [datosResponsable, setDatosResponsable] = useState(null);
  useEffect(() => {
    (async () => {
      const raw = await storageGet("perfil-abogado", false);
      setDatosResponsable(raw ? JSON.parse(raw) : {});
    })();
  }, []);
  const guardarDatosResponsable = async (datos) => {
    const actualizado = { ...datosResponsable, ...datos };
    await storageSet("perfil-abogado", JSON.stringify(actualizado), false);
    setDatosResponsable(actualizado);
  };

  const [presupuesto, setPresupuesto] = useState(null);
  useEffect(() => {
    (async () => {
      const raw = await storageGet("presupuesto-mensual", false);
      setPresupuesto(raw ? JSON.parse(raw) : {});
    })();
  }, []);
  const guardarPresupuesto = async (datos) => {
    await storageSet("presupuesto-mensual", JSON.stringify(datos), false);
    setPresupuesto(datos);
  };

  const registrarEgreso = async (datos) => {
    const nuevo = await crearEgreso(datos);
    registrarAuditoria(usuarioActual, "registrar_egreso", "egreso", nuevo.id, { concepto: nuevo.concepto, valor: nuevo.valor });
    setModoRegistro(null);
  };

  const eliminarEgreso = async (egreso) => {
    const ok = await confirmar(`¿Seguro que quieres eliminar el egreso "${egreso.concepto}" de ${formatoCOP(egreso.valor)}? Esta acción no se puede deshacer.`);
    if (!ok) return;
    await eliminarEgresoBase(egreso.id);
    registrarAuditoria(usuarioActual, "eliminar_egreso", "egreso", egreso.id, { concepto: egreso.concepto, valor: egreso.valor });
  };

  const registrarOtroIngreso = async (datos) => {
    const nuevo = await crearOtroIngreso(datos);
    registrarAuditoria(usuarioActual, "registrar_otro_ingreso", "otro_ingreso", nuevo.id, { concepto: nuevo.concepto, valor: nuevo.valor });
    setModoRegistro(null);
  };

  const eliminarOtroIngreso = async (ingreso) => {
    const ok = await confirmar(`¿Seguro que quieres eliminar el ingreso "${ingreso.concepto}" de ${formatoCOP(ingreso.valor)}? Esta acción no se puede deshacer.`);
    if (!ok) return;
    await eliminarOtroIngresoBase(ingreso.id);
    registrarAuditoria(usuarioActual, "eliminar_otro_ingreso", "otro_ingreso", ingreso.id, { concepto: ingreso.concepto, valor: ingreso.valor });
  };

  const cargar = useCallback(async () => {
    const entries = {};
    for (const id of ids) {
      const raw = await storageGet(`cliente:${id}`, false);
      if (raw) entries[id] = JSON.parse(raw);
    }
    setClientes(entries);
  }, [ids]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const registrarPago = async (id, datosPago) => {
    const cliente = clientes[id];
    const pago = {
      id: uid(),
      fecha: new Date(`${datosPago.fechaPago}T12:00:00`).toISOString(),
      medioPago: datosPago.medioPago,
      valor: datosPago.valor,
      concepto: datosPago.concepto,
      retencionPorcentaje: datosPago.retencionPorcentaje || 0,
    };
    const reciboImagen = await generarReciboImagen(id, cliente, pago);
    pago.reciboImagen = reciboImagen;

    let proximoPago = cliente.proximoPago || null;
    if (datosPago.fechaProximoPago) {
      // El abogado indicó manualmente la próxima fecha, tiene prioridad.
      proximoPago = { fecha: datosPago.fechaProximoPago, valorEsperado: datosPago.valorProximoPago };
    } else if (cliente.planPago?.frecuencia && cliente.planPago.frecuencia !== "Pago único" && cliente.planPago.frecuencia !== "Otro") {
      // No se indicó manualmente: si el cliente tiene un plan de pago recurrente, se calcula solo.
      const siguienteFecha = calcularProximaFechaPorFrecuencia(datosPago.fechaPago, cliente.planPago.frecuencia);
      proximoPago = { fecha: siguienteFecha, valorEsperado: cliente.planPago.valor || datosPago.valor };
    }

    const actualizado = {
      ...cliente,
      pagos: [...(cliente.pagos || []), pago],
      proximoPago,
    };
    await storageSet(`cliente:${id}`, JSON.stringify(actualizado), false);
    setClientes((prev) => ({ ...prev, [id]: actualizado }));
    registrarAuditoria(usuarioActual, "registrar_pago", "cliente", id, { nombre: cliente.nombre, valor: pago.valor, medioPago: pago.medioPago });
    setFormAbiertoId(null);
  };

  const editarPago = async (id, pagoId, cambios) => {
    const cliente = clientes[id];
    const pagos = (cliente.pagos || []).map((p) => (p.id === pagoId ? { ...p, ...cambios } : p));
    const actualizado = { ...cliente, pagos };
    await storageSet(`cliente:${id}`, JSON.stringify(actualizado), false);
    setClientes((prev) => ({ ...prev, [id]: actualizado }));
    registrarAuditoria(usuarioActual, "editar_pago", "cliente", id, { nombre: cliente.nombre, valor: cambios.valor });
  };

  const eliminarPago = async (id, pagoId) => {
    const cliente = clientes[id];
    const pago = (cliente.pagos || []).find((p) => p.id === pagoId);
    const ok = await confirmar(
      `¿Seguro que quieres eliminar este pago${pago ? ` de ${formatoCOP(pago.valor)} (${new Date(pago.fecha).toLocaleDateString("es-CO")})` : ""}? Esta acción no se puede deshacer.`
    );
    if (!ok) return;
    const actualizado = { ...cliente, pagos: (cliente.pagos || []).filter((p) => p.id !== pagoId) };
    await storageSet(`cliente:${id}`, JSON.stringify(actualizado), false);
    setClientes((prev) => ({ ...prev, [id]: actualizado }));
    registrarAuditoria(usuarioActual, "eliminar_pago", "cliente", id, { nombre: cliente.nombre, valor: pago?.valor });
  };

  const proximosPagos = ids
    .map((id) => ({ id, c: clientes[id] }))
    .filter(({ c }) => c?.proximoPago?.fecha)
    .map(({ id, c }) => ({ id, c, dias: diasHasta(c.proximoPago.fecha) }))
    .filter(({ dias }) => dias !== null && dias <= DIAS_AVISO_PROXIMO_PAGO)
    .sort((a, b) => a.dias - b.dias);

  const saldoDe = (c) => {
    const totalPagado = (c?.pagos || []).reduce((sum, p) => sum + (Number(p.valor) || 0), 0);
    const valorTotal = Number(c?.valorTotal) || 0;
    return valorTotal > 0 ? valorTotal - totalPagado : null;
  };
  const carteraTotal = ids.reduce((sum, id) => {
    const saldo = saldoDe(clientes[id]);
    return saldo && saldo > 0 ? sum + saldo : sum;
  }, 0);
  const clientesConSaldoPendiente = ids.filter((id) => (saldoDe(clientes[id]) || 0) > 0).length;

  const ultimoPagoDe = (c) => {
    const pagos = c?.pagos || [];
    if (pagos.length === 0) return null;
    return pagos.reduce((mas, p) => (new Date(p.fecha) > new Date(mas.fecha) ? p : mas), pagos[0]);
  };

  const hoy = new Date();
  let recaudadoTotal = 0;
  let recaudadoMes = 0;
  let retenidoMes = 0;
  let retenidoTotal = 0;
  const porMedioPagoMes = {};
  ids.forEach((id) => {
    (clientes[id]?.pagos || []).forEach((p) => {
      const valor = Number(p.valor) || 0;
      recaudadoTotal += valor;
      retenidoTotal += valorRetenido(p);
      const fechaPago = new Date(p.fecha);
      if (fechaPago.getFullYear() === hoy.getFullYear() && fechaPago.getMonth() === hoy.getMonth()) {
        recaudadoMes += valor;
        retenidoMes += valorRetenido(p);
        const medio = p.medioPago || "Otro";
        porMedioPagoMes[medio] = (porMedioPagoMes[medio] || 0) + valor;
      }
    });
  });
  const mediosPagoOrdenados = Object.entries(porMedioPagoMes).sort((a, b) => b[1] - a[1]);

  // Salidas de dinero (arriendo, nómina, servicios...) — sin esto, la
  // pantalla solo mostraba lo que entraba y nunca lo que salía, así que no
  // servía para saber si el despacho realmente está ganando plata o no.
  let egresoTotal = 0;
  let egresoMes = 0;
  const porCategoriaEgresoTotal = {};
  egresos.forEach((e) => {
    const valor = Number(e.valor) || 0;
    egresoTotal += valor;
    porCategoriaEgresoTotal[e.categoria] = (porCategoriaEgresoTotal[e.categoria] || 0) + valor;
    const fechaEgreso = new Date(e.fecha);
    if (fechaEgreso.getFullYear() === hoy.getFullYear() && fechaEgreso.getMonth() === hoy.getMonth()) {
      egresoMes += valor;
    }
  });
  const categoriasEgresoOrdenadas = Object.entries(porCategoriaEgresoTotal).sort((a, b) => b[1] - a[1]);
  const categoriaMayorGasto = categoriasEgresoOrdenadas[0] || null;

  const presupuestoValor = Number(presupuesto?.valor) || 0;
  const porcentajePresupuesto = presupuestoValor > 0 ? (egresoMes / presupuestoValor) * 100 : 0;
  const colorPresupuesto = porcentajePresupuesto >= 100 ? "#B42318" : porcentajePresupuesto >= 80 ? "#B45309" : "#166534";
  const mensajePresupuesto =
    porcentajePresupuesto >= 100
      ? `¡Superaste tu presupuesto de este mes por ${formatoCOP(egresoMes - presupuestoValor)}!`
      : porcentajePresupuesto >= 80
      ? `Vas en el ${Math.round(porcentajePresupuesto)}% — te quedan ${formatoCOP(presupuestoValor - egresoMes)} este mes.`
      : `Vas en el ${Math.round(porcentajePresupuesto)}% de tu presupuesto — todo tranquilo.`;
  // Ingresos sueltos que no son el pago de ningún cliente puntual
  // (rendimientos, reembolsos, algo administrativo que no se sabe bien
  // dónde clasificar) — sin esto se quedaban fuera de "cuánto entró".
  let otrosIngresosTotal = 0;
  let otrosIngresosMes = 0;
  otrosIngresos.forEach((i) => {
    const valor = Number(i.valor) || 0;
    otrosIngresosTotal += valor;
    const fechaIngreso = new Date(i.fecha);
    if (fechaIngreso.getFullYear() === hoy.getFullYear() && fechaIngreso.getMonth() === hoy.getMonth()) {
      otrosIngresosMes += valor;
    }
  });

  const ingresoTotalMes = recaudadoMes + otrosIngresosMes;
  const ingresoTotalHistoricoTodo = recaudadoTotal + otrosIngresosTotal;
  const netoMes = ingresoTotalMes - egresoMes;
  const netoTotal = ingresoTotalHistoricoTodo - egresoTotal;

  const mesesEgresos = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    mesesEgresos.push({ clave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, etiqueta: d.toLocaleDateString("es-CO", { month: "short", year: "2-digit" }) });
  }
  const ingresosPorMesGrafica = Object.fromEntries(mesesEgresos.map((m) => [m.clave, 0]));
  const egresosPorMesGrafica = Object.fromEntries(mesesEgresos.map((m) => [m.clave, 0]));
  ids.forEach((id) => {
    (clientes[id]?.pagos || []).forEach((p) => {
      const clave = p.fecha?.slice(0, 7);
      if (clave && ingresosPorMesGrafica[clave] !== undefined) ingresosPorMesGrafica[clave] += Number(p.valor) || 0;
    });
  });
  otrosIngresos.forEach((i) => {
    const clave = i.fecha?.slice(0, 7);
    if (clave && ingresosPorMesGrafica[clave] !== undefined) ingresosPorMesGrafica[clave] += Number(i.valor) || 0;
  });
  egresos.forEach((e) => {
    const clave = e.fecha?.slice(0, 7);
    if (clave && egresosPorMesGrafica[clave] !== undefined) egresosPorMesGrafica[clave] += Number(e.valor) || 0;
  });

  // Promedio mensual (últimos 6 meses) — útil para presupuestar: cuánto
  // suele entrar/salir un mes típico, en vez de solo ver el mes actual.
  const promedioIngresoMensual = mesesEgresos.reduce((s, m) => s + ingresosPorMesGrafica[m.clave], 0) / mesesEgresos.length;
  const promedioEgresoMensual = mesesEgresos.reduce((s, m) => s + egresosPorMesGrafica[m.clave], 0) / mesesEgresos.length;

  // Clientes con un valor acordado pero sin ni un solo pago registrado —
  // fácil que se pierdan de vista entre los que sí van pagando poco a poco.
  const clientesSinPagos = ids
    .map((id) => clientes[id])
    .filter((c) => c && Number(c.valorTotal) > 0 && (c.pagos || []).length === 0);

  const egresosFiltrados = [...egresos]
    .filter((e) => categoriaFiltroEgreso === "Todas" || e.categoria === categoriaFiltroEgreso)
    .filter((e) => !filtroEgreso.trim() || e.concepto.toLowerCase().includes(filtroEgreso.trim().toLowerCase()))
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  const otrosIngresosFiltrados = [...otrosIngresos]
    .filter((i) => categoriaFiltroOtroIngreso === "Todas" || i.categoria === categoriaFiltroOtroIngreso)
    .filter((i) => !filtroOtroIngreso.trim() || i.concepto.toLowerCase().includes(filtroOtroIngreso.trim().toLowerCase()))
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  // Filtrar y ordenar es O(n log n) sobre todos los clientes — sin memoizar,
  // se repetía en CADA render (incluyendo cada tecla escrita en cualquier
  // otro campo de la pantalla, no solo el filtro), lo que se sentía como
  // lentitud en despachos con muchos clientes. useMemo solo lo recalcula
  // cuando algo que realmente afecta el resultado cambió.
  const idsFiltrados = useMemo(() => {
    const textoFiltro = filtro.trim().toLowerCase();
    let resultado = textoFiltro ? ids.filter((id) => clientes[id]?.nombre?.toLowerCase().includes(textoFiltro)) : ids;
    if (soloPendientes) resultado = resultado.filter((id) => (saldoDe(clientes[id]) || 0) > 0);
    return [...resultado].sort((a, b) => {
      if (orden === "saldo") return (saldoDe(clientes[b]) || 0) - (saldoDe(clientes[a]) || 0);
      if (orden === "ultimoPago") {
        const fa = ultimoPagoDe(clientes[a])?.fecha;
        const fb = ultimoPagoDe(clientes[b])?.fecha;
        if (!fa && !fb) return 0;
        if (!fa) return 1;
        if (!fb) return -1;
        return new Date(fb) - new Date(fa);
      }
      return (clientes[a]?.nombre || "").localeCompare(clientes[b]?.nombre || "");
    });
  }, [ids, clientes, filtro, soloPendientes, orden]);

  return (
    <div>
      <EncabezadoSeccion titulo="Contabilidad" color="#F43F5E" />

      <PanelDatosCuentaCobro datos={datosResponsable} onGuardar={guardarDatosResponsable} />
      <PanelPresupuesto presupuesto={presupuesto} onGuardar={guardarPresupuesto} />

      {presupuestoValor > 0 && (
        <Card style={{ marginBottom: 20, borderLeft: `4px solid ${colorPresupuesto}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.ink, margin: 0 }}>Presupuesto de gastos del mes</p>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 700, color: colorPresupuesto, margin: 0 }}>
              {formatoCOP(egresoMes)} de {formatoCOP(presupuestoValor)}
            </p>
          </div>
          <div style={{ height: 10, borderRadius: 6, background: COLORS.surfaceSoft, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(porcentajePresupuesto, 100)}%`, background: colorPresupuesto, transition: "width 0.3s ease" }} />
          </div>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: colorPresupuesto, marginTop: 8, marginBottom: 0 }}>
            {mensajePresupuesto}
          </p>
        </Card>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <button
          className="drx-btn-primary"
          style={{ ...buttonPrimary, background: modoRegistro === "pago" ? COLORS.navyDeep : COLORS.navy }}
          onClick={() => setModoRegistro(modoRegistro === "pago" ? null : "pago")}
        >
          {modoRegistro === "pago" ? "Cancelar" : "+ Registrar pago de cliente"}
        </button>
        <button
          className="drx-btn-primary"
          style={{ ...buttonPrimary, background: "#F43F5E" }}
          onClick={() => setModoRegistro(modoRegistro === "egreso" ? null : "egreso")}
        >
          {modoRegistro === "egreso" ? "Cancelar" : "+ Registrar egreso"}
        </button>
        <button
          className="drx-btn-primary"
          style={{ ...buttonPrimary, background: "#10B981" }}
          onClick={() => setModoRegistro(modoRegistro === "ingreso" ? null : "ingreso")}
        >
          {modoRegistro === "ingreso" ? "Cancelar" : "+ Registrar otro ingreso"}
        </button>
      </div>

      {modoRegistro === "pago" && (
        <Card style={{ marginBottom: 20, borderLeft: `4px solid ${COLORS.navy}` }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.ink, marginBottom: 4 }}>Registrar pago de un cliente</p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 14 }}>Elige el cliente sin tener que buscarlo abajo en la lista.</p>
          <Field label="Cliente">
            <select className="drx-input" style={inputStyle} value={pagoRapidoClienteId} onChange={(e) => setPagoRapidoClienteId(e.target.value)}>
              <option value="">Selecciona un cliente...</option>
              {[...ids]
                .sort((a, b) => (clientes[a]?.nombre || "").localeCompare(clientes[b]?.nombre || ""))
                .map((id) => (
                  <option key={id} value={id}>
                    {clientes[id]?.nombre || "(sin nombre)"}
                  </option>
                ))}
            </select>
          </Field>
          {pagoRapidoClienteId && clientes[pagoRapidoClienteId] && (
            <FormularioPago
              cliente={clientes[pagoRapidoClienteId]}
              onRegistrar={async (datos) => {
                await registrarPago(pagoRapidoClienteId, datos);
                setPagoRapidoClienteId("");
                setModoRegistro(null);
              }}
            />
          )}
        </Card>
      )}
      {modoRegistro === "egreso" && (
        <Card style={{ marginBottom: 20, borderLeft: "4px solid #F43F5E" }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.ink, marginBottom: 4 }}>Registrar egreso</p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 14 }}>Arriendo, nómina, servicios y demás salidas de dinero del despacho.</p>
          <FormularioEgreso onRegistrar={registrarEgreso} />
        </Card>
      )}
      {modoRegistro === "ingreso" && (
        <Card style={{ marginBottom: 20, borderLeft: "4px solid #10B981" }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.ink, marginBottom: 4 }}>Registrar otro ingreso</p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 14 }}>
            Para plata que entra sin ser el pago de un cliente puntual — rendimientos, reembolsos, algo administrativo o que no sabes bien cómo clasificar.
          </p>
          <FormularioOtroIngreso onRegistrar={registrarOtroIngreso} />
        </Card>
      )}

      <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 20 }}>
        <Card style={{ borderLeft: "4px solid #10B981", background: "#F0FDF4" }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: "#166534", textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>
            Recaudado este mes
          </p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 800, color: "#166534", margin: "4px 0 0" }}>{formatoCOP(recaudadoMes)}</p>
        </Card>
        <Card style={{ borderLeft: "4px solid #F43F5E", background: "#FEF2F2" }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: "#B42318", textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>
            Egresos este mes
          </p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 800, color: "#B42318", margin: "4px 0 0" }}>{formatoCOP(egresoMes)}</p>
        </Card>
        <Card style={{ borderLeft: `4px solid ${netoMes >= 0 ? "#10B981" : "#B42318"}`, background: netoMes >= 0 ? COLORS.accentSoft : "#FEF2F2" }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: netoMes >= 0 ? COLORS.navy : "#B42318", textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>
            Neto este mes
          </p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 800, color: netoMes >= 0 ? COLORS.navy : "#B42318", margin: "4px 0 0" }}>{formatoCOP(netoMes)}</p>
        </Card>
        <Card style={{ borderLeft: `4px solid ${COLORS.accentBright}`, background: COLORS.accentSoft }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: COLORS.navy, textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>
            Recaudado histórico
          </p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 800, color: COLORS.navy, margin: "4px 0 0" }}>{formatoCOP(recaudadoTotal)}</p>
        </Card>
        <Card style={{ borderLeft: "4px solid #10B981", background: "#F0FDF4" }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: "#166534", textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>
            Otros ingresos este mes
          </p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 800, color: "#166534", margin: "4px 0 0" }}>{formatoCOP(otrosIngresosMes)}</p>
        </Card>
        <Card style={{ borderLeft: "4px solid #6B7480", background: COLORS.surfaceSoft }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: COLORS.inkSoft, textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>
            Egresos histórico
          </p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 800, color: COLORS.ink, margin: "4px 0 0" }}>{formatoCOP(egresoTotal)}</p>
        </Card>
        <Card style={{ borderLeft: `4px solid ${netoTotal >= 0 ? "#10B981" : "#B42318"}` }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>
            Neto histórico
          </p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 800, color: netoTotal >= 0 ? "#166534" : "#B42318", margin: "4px 0 0" }}>{formatoCOP(netoTotal)}</p>
        </Card>
        {carteraTotal > 0 && (
          <Card style={{ borderLeft: "4px solid #F5A524", background: "#FEF3E2" }}>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: "#B45309", textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>
              Cartera pendiente total
            </p>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 800, color: "#B42318", margin: "4px 0 0" }}>{formatoCOP(carteraTotal)}</p>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: "#B45309", margin: "3px 0 0" }}>
              {clientesConSaldoPendiente} cliente{clientesConSaldoPendiente !== 1 ? "s" : ""} con saldo pendiente
            </p>
          </Card>
        )}
        {retenidoMes > 0 && (
          <Card style={{ borderLeft: "4px solid #8B5CF6", background: "#F5F3FF" }}>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: "#7C3AED", textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>
              Retenido en la fuente (mes)
            </p>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 800, color: "#7C3AED", margin: "4px 0 0" }}>{formatoCOP(retenidoMes)}</p>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: "#7C3AED", margin: "3px 0 0" }}>
              Histórico: {formatoCOP(retenidoTotal)} · guarda tus certificados de retención para la declaración de renta
            </p>
          </Card>
        )}
      </div>

      <Card style={{ marginBottom: 20 }}>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.ink, marginBottom: 4 }}>Ingresos vs. egresos por mes</p>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 14 }}>
          Últimos 6 meses · Promedio mensual: {formatoCOP(promedioIngresoMensual)} de ingresos, {formatoCOP(promedioEgresoMensual)} de egresos
        </p>
        <GraficaBarrasAgrupadas
          categorias={mesesEgresos.map((m) => m.etiqueta)}
          series={[
            { nombre: "Ingresos", color: "#10B981", valores: mesesEgresos.map((m) => ingresosPorMesGrafica[m.clave]) },
            { nombre: "Egresos", color: "#F43F5E", valores: mesesEgresos.map((m) => egresosPorMesGrafica[m.clave]) },
          ]}
          formatoValor={formatoCOP}
        />
      </Card>

      {categoriasEgresoOrdenadas.length > 0 && (
        <Card style={{ marginBottom: 20 }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.ink, marginBottom: 4 }}>Egresos por categoría</p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 14 }}>
            Histórico completo · La que más consume: <strong style={{ color: COLORS.headingText }}>{categoriaMayorGasto?.[0]}</strong> ({formatoCOP(categoriaMayorGasto?.[1] || 0)})
          </p>
          <GraficaBarras datos={categoriasEgresoOrdenadas.map(([categoria, valor]) => ({ etiqueta: categoria, valor }))} color="#F43F5E" formatoValor={formatoCOP} />
        </Card>
      )}

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
          <div>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.ink, margin: 0 }}>Egresos</p>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, margin: "4px 0 0" }}>Arriendo, nómina, servicios y demás salidas de dinero del despacho.</p>
          </div>
          {egresos.length > 0 && (
            <button
              className="drx-btn-ghost"
              style={{ ...buttonGhost, fontSize: 12, padding: "5px 12px" }}
              onClick={() =>
                exportarCSV(
                  "egresos.csv",
                  [
                    { titulo: "Fecha", valor: (e) => new Date(e.fecha).toLocaleDateString("es-CO") },
                    { titulo: "Categoría", valor: (e) => e.categoria },
                    { titulo: "Concepto", valor: (e) => e.concepto },
                    { titulo: "Valor", valor: (e) => e.valor },
                  ],
                  egresosFiltrados
                )
              }
            >
              Exportar CSV
            </button>
          )}
        </div>
        {egresos.length > 0 && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
            <input
              className="drx-input"
              style={{ ...inputStyle, maxWidth: 260, flex: 1, minWidth: 160 }}
              placeholder="Buscar por concepto..."
              value={filtroEgreso}
              onChange={(e) => setFiltroEgreso(e.target.value)}
            />
            <select className="drx-input" style={{ ...inputStyle, maxWidth: 220 }} value={categoriaFiltroEgreso} onChange={(e) => setCategoriaFiltroEgreso(e.target.value)}>
              <option value="Todas">Todas las categorías</option>
              {CATEGORIAS_EGRESO.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}
        {egresosFiltrados.length > 0 ? (
          <div style={{ marginTop: 12 }}>
            {egresosFiltrados.map((e) => (
              <EgresoCard key={e.id} egreso={e} onEditar={(cambios) => editarEgreso(e.id, cambios)} onEliminar={() => eliminarEgreso(e)} />
            ))}
          </div>
        ) : (
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.muted, marginTop: 10 }}>
            {egresos.length === 0 ? "Todavía no has registrado ningún egreso." : "Ningún egreso coincide con el filtro."}
          </p>
        )}
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
          <div>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.ink, margin: 0 }}>Otros ingresos</p>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, margin: "4px 0 0" }}>
              Plata que entró sin ser el pago de un cliente puntual — rendimientos, reembolsos, algo administrativo.
            </p>
          </div>
          {otrosIngresos.length > 0 && (
            <button
              className="drx-btn-ghost"
              style={{ ...buttonGhost, fontSize: 12, padding: "5px 12px" }}
              onClick={() =>
                exportarCSV(
                  "otros-ingresos.csv",
                  [
                    { titulo: "Fecha", valor: (i) => new Date(i.fecha).toLocaleDateString("es-CO") },
                    { titulo: "Categoría", valor: (i) => i.categoria },
                    { titulo: "Concepto", valor: (i) => i.concepto },
                    { titulo: "Valor", valor: (i) => i.valor },
                  ],
                  otrosIngresosFiltrados
                )
              }
            >
              Exportar CSV
            </button>
          )}
        </div>
        {otrosIngresos.length > 0 && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
            <input
              className="drx-input"
              style={{ ...inputStyle, maxWidth: 260, flex: 1, minWidth: 160 }}
              placeholder="Buscar por concepto..."
              value={filtroOtroIngreso}
              onChange={(e) => setFiltroOtroIngreso(e.target.value)}
            />
            <select className="drx-input" style={{ ...inputStyle, maxWidth: 220 }} value={categoriaFiltroOtroIngreso} onChange={(e) => setCategoriaFiltroOtroIngreso(e.target.value)}>
              <option value="Todas">Todas las categorías</option>
              {CATEGORIAS_OTRO_INGRESO.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}
        {otrosIngresosFiltrados.length > 0 ? (
          <div style={{ marginTop: 12 }}>
            {otrosIngresosFiltrados.map((i) => (
              <OtroIngresoCard key={i.id} ingreso={i} onEditar={(cambios) => editarOtroIngreso(i.id, cambios)} onEliminar={() => eliminarOtroIngreso(i)} />
            ))}
          </div>
        ) : (
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.muted, marginTop: 10 }}>
            {otrosIngresos.length === 0 ? "Todavía no has registrado ningún otro ingreso." : "Ningún ingreso coincide con el filtro."}
          </p>
        )}
      </Card>

      {mediosPagoOrdenados.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20, marginTop: -8 }}>
          {mediosPagoOrdenados.map(([medio, valor]) => (
            <span
              key={medio}
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 11.5,
                fontWeight: 600,
                padding: "5px 12px",
                borderRadius: 20,
                background: COLORS.surfaceSoft,
                border: `1px solid ${COLORS.border}`,
                color: COLORS.inkSoft,
              }}
            >
              {medio}: <strong style={{ color: COLORS.headingText }}>{formatoCOP(valor)}</strong>
            </span>
          ))}
        </div>
      )}
      {clientesSinPagos.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 700, color: "#8B5CF6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
            <Icono tipo="ojo" size={14} style={{ marginRight: 4, verticalAlign: -2 }} /> Sin ningún pago registrado todavía
          </p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.inkSoft, margin: "0 0 8px" }}>
            {clientesSinPagos.map((c) => c.nombre).join(", ")}
          </p>
        </div>
      )}
      {proximosPagos.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 700, color: "#B45309", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
            ⏰ Próximos pagos por vencer
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {proximosPagos.map(({ id, c, dias }) => {
              const vencido = dias < 0;
              return (
                <div
                  key={id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: vencido ? "#FEF2F2" : "#FEF3E2",
                    border: vencido ? "1px solid #F2B8B5" : "1px solid #FCE3B8",
                    borderRadius: 8,
                    padding: "10px 14px",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <div>
                    <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: vencido ? "#B42318" : "#92400E", margin: 0 }}>
                      {c.nombre} {vencido && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 }}>Vencido</span>}
                    </p>
                    <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: vencido ? "#B42318" : "#B45309", margin: "2px 0 0" }}>
                      {textoEstadoPago(dias)}
                      {c.proximoPago.valorEsperado ? ` · ${formatoCOP(c.proximoPago.valorEsperado)}` : ""}
                    </p>
                  </div>
                  <button className="drx-btn-primary" style={{ ...buttonPrimary, padding: "6px 12px", fontSize: 12, background: "#1DA851" }} onClick={() => enviarRecordatorioPago(c)}>
                    Enviar recordatorio ↗
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 14, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
        <input
          className="drx-input"
          style={{ ...inputStyle, maxWidth: 320, flex: 1, minWidth: 220 }}
          placeholder="Filtrar por nombre de cliente..."
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.inkSoft, cursor: "pointer" }}>
          <input type="checkbox" checked={soloPendientes} onChange={(e) => setSoloPendientes(e.target.checked)} />
          Solo con saldo pendiente
        </label>
        <select className="drx-input" style={{ ...inputStyle, maxWidth: 240 }} value={orden} onChange={(e) => setOrden(e.target.value)}>
          {ORDEN_CONTABILIDAD.map((o) => (
            <option key={o.valor} value={o.valor}>
              Ordenar por: {o.etiqueta}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.muted, margin: 0 }}>
          {idsFiltrados.length} cliente{idsFiltrados.length !== 1 ? "s" : ""}
          {filtro.trim() ? ` de ${ids.length}` : " registrado" + (ids.length !== 1 ? "s" : "")}
        </p>
        <button
          className="drx-btn-ghost"
          style={buttonGhost}
          onClick={() => {
            const filas = idsFiltrados.flatMap((id) => (clientes[id]?.pagos || []).map((p) => ({ cliente: clientes[id].nombre, pago: p })));
            exportarCSV(
              "pagos.csv",
              [
                { titulo: "Cliente", valor: (f) => f.cliente },
                { titulo: "Fecha", valor: (f) => new Date(f.pago.fecha).toLocaleDateString("es-CO") },
                { titulo: "Medio de pago", valor: (f) => f.pago.medioPago },
                { titulo: "Valor bruto", valor: (f) => f.pago.valor },
                { titulo: "Retención %", valor: (f) => f.pago.retencionPorcentaje || 0 },
                { titulo: "Valor neto recibido", valor: (f) => valorNetoPago(f.pago) },
                { titulo: "Concepto", valor: (f) => f.pago.concepto },
              ],
              filas
            );
          }}
        >
          Exportar CSV
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {idsFiltrados.map((id) => {
          const c = clientes[id];
          if (!c) return null;
          const pagos = c.pagos || [];
          const totalPagado = pagos.reduce((sum, p) => sum + (Number(p.valor) || 0), 0);
          const valorTotal = Number(c.valorTotal) || 0;
          const saldo = valorTotal > 0 ? valorTotal - totalPagado : null;
          const ultimoPago = ultimoPagoDe(c);

          return (
            <Card key={id} style={{ borderLeft: "4px solid #F43F5E" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "flex", gap: 12 }}>
                  <AvatarIniciales nombre={c.nombre} />
                  <div>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 17, fontWeight: 700, margin: 0, color: COLORS.ink }}>{c.nombre}</p>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted, margin: "4px 0 0" }}>
                    {pagos.length} pago{pagos.length !== 1 ? "s" : ""} registrado{pagos.length !== 1 ? "s" : ""} · Total: {formatoCOP(totalPagado)}
                    {ultimoPago && ` · Último pago: ${new Date(ultimoPago.fecha).toLocaleDateString("es-CO", { dateStyle: "medium" })}`}
                  </p>
                  {saldo !== null && (
                    <p
                      style={{
                        display: "inline-block",
                        marginTop: 6,
                        fontFamily: "Inter, sans-serif",
                        fontSize: 11.5,
                        fontWeight: 700,
                        padding: "2px 9px",
                        borderRadius: 20,
                        background: saldo <= 0 ? "#DCFCE7" : "#FEF3E2",
                        color: saldo <= 0 ? "#166534" : "#B45309",
                      }}
                    >
                      {saldo <= 0 ? "Al día" : `Debe ${formatoCOP(saldo)}`}
                    </p>
                  )}
                  </div>
                </div>
                <button className="drx-btn-ghost" style={buttonGhost} onClick={() => setFormAbiertoId(formAbiertoId === id ? null : id)}>
                  {formAbiertoId === id ? "Cancelar" : "+ Registrar pago"}
                </button>
              </div>

              {formAbiertoId === id && <FormularioPago cliente={c} onRegistrar={(datos) => registrarPago(id, datos)} />}

              {pagos.length > 0 && (() => {
                const ordenados = [...pagos].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
                const expandido = !!expandidos[id];
                const visibles = expandido ? ordenados : ordenados.slice(0, 3);
                return (
                  <div>
                    {visibles.map((p) => (
                      <ReciboCard
                        key={p.id}
                        cliente={c}
                        pago={p}
                        onEditar={(cambios) => editarPago(id, p.id, cambios)}
                        onEliminar={() => eliminarPago(id, p.id)}
                        datosResponsable={datosResponsable}
                      />
                    ))}
                    {ordenados.length > 3 && (
                      <button
                        className="drx-btn-ghost"
                        style={{ ...buttonGhost, padding: "5px 12px", fontSize: 12, marginTop: 10 }}
                        onClick={() => setExpandidos((prev) => ({ ...prev, [id]: !expandido }))}
                      >
                        {expandido ? "Mostrar menos" : `Ver todos los pagos (${ordenados.length})`}
                      </button>
                    )}
                  </div>
                );
              })()}
            </Card>
          );
        })}
        {cargado && ids.length === 0 && <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.muted }}>Registra clientes primero desde la pestaña Clientes.</p>}
        {ids.length > 0 && idsFiltrados.length === 0 && (
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.muted }}>Ningún cliente coincide con "{filtro}".</p>
        )}
      </div>
      {ConfirmarDialogo}
    </div>
  );
}
