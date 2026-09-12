// Calculadora de precios: pensada para ANTES de que el cliente exista en
// Nomos — mientras se le está armando la propuesta. Primero deja ver qué
// tanto le queda libre al despacho (después de comisiones y costos) y
// cuánto sería cada cuota, y solo si eso convence pasa a un segundo paso
// para completar los datos del futuro cliente y descargar de una vez el
// contrato de servicios ya con el valor y las cuotas calculadas — sin
// tener que crear el cliente primero solo para sacar el contrato. Es su
// propia pestaña (y no un panel dentro de Contabilidad) porque se usa
// antes de que haya nada que contabilizar.
import { useState, useEffect } from "react";
import { storageGet, getNombreDespacho } from "../lib/storage";
import { numeroEnLetras } from "../lib/numeroEnLetras.js";
import { COLORS, Field, inputStyle, CampoDinero, buttonPrimary, buttonGhost, Card, EncabezadoSeccion, Icono, formatoCOP, LOGO_SRC } from "../App.jsx";

const AZUL_MARCA = "0B1220";
const GRIS_TEXTO = "475569";

function base64ImagenALogo(dataUri) {
  const base64 = (dataUri || "").split(",")[1] || "";
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

// Contrato de prestación de servicios para un cliente nuevo — recibe los
// datos sueltos del formulario (no un objeto de cliente ya guardado) y el
// valor/cuotas ya calculados por la calculadora, para que el contrato y lo
// que se le mostró al cliente en pantalla nunca queden desincronizados.
async function generarContratoServiciosDocx({ cliente, valorTotal, numCuotas, valorPorCuota, datosResponsable }) {
  const { Document, Packer, Paragraph, TextRun, AlignmentType, ImageRun, BorderStyle } = await import("docx");

  const nombreDespacho = getNombreDespacho();
  const responsable = (datosResponsable?.nombre || nombreDespacho || "").trim();
  const documentoResponsable = (datosResponsable?.documento || "").trim();
  const ciudad = (datosResponsable?.ciudad || "").trim() || "___________";
  const fechaHoy = new Date().toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });

  const formaDePago =
    numCuotas > 1
      ? `en ${numCuotas} cuotas de ${formatoCOP(valorPorCuota)} cada una`
      : `en un solo pago de ${formatoCOP(valorTotal)}`;

  let logo = [];
  try {
    logo = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [new ImageRun({ type: "png", data: base64ImagenALogo(LOGO_SRC), transformation: { width: 60, height: 60 } })],
      }),
    ];
  } catch (e) {
    // Si el logo no carga por lo que sea, el documento se genera igual.
  }

  const parrafo = (texto, opciones = {}) =>
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: opciones.after ?? 180 },
      children: [new TextRun({ text: texto, size: 20 })],
    });

  const titulo = (texto) => new Paragraph({ spacing: { before: 260, after: 90 }, children: [new TextRun({ text: texto, bold: true, size: 20, color: AZUL_MARCA })] });

  const doc = new Document({
    sections: [
      {
        properties: { page: { margin: { top: 900, bottom: 900, left: 1100, right: 1100 } } },
        children: [
          ...logo,
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 4 }, children: [new TextRun({ text: nombreDespacho, bold: true, size: 24, color: AZUL_MARCA })] }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 260 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "E2E8F0", space: 10 } },
            children: [new TextRun({ text: "Cortés Ramírez Abogados", size: 16, color: GRIS_TEXTO, italics: true })],
          }),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 320 }, children: [new TextRun({ text: "CONTRATO DE PRESTACIÓN DE SERVICIOS PROFESIONALES", bold: true, size: 27, color: AZUL_MARCA })] }),

          parrafo(
            `Entre los suscritos, a saber, de una parte ${responsable}, identificado(a) con cédula de ciudadanía No. ${documentoResponsable || "______________________"}, actuando en nombre y representación de ${nombreDespacho}, quien en adelante se denominará EL CONTRATISTA; y de otra parte ${
              cliente?.nombre || "___________________________"
            }, identificado(a) con cédula de ciudadanía No. ${cliente?.cedula || "______________________"}, con correo electrónico ${
              cliente?.correo || "___________________________"
            }, domicilio en ${cliente?.direccion || "___________________________"} y celular de contacto ${
              cliente?.celular || "______________"
            }, quien en adelante se denominará EL CONTRATANTE, hemos convenido celebrar el presente contrato de prestación de servicios profesionales, el cual se regirá por las siguientes cláusulas:`
          ),

          titulo("CLÁUSULA PRIMERA. OBJETO."),
          parrafo(`EL CONTRATISTA se obliga a prestar sus servicios profesionales como abogado(a) a favor de EL CONTRATANTE, para adelantar la siguiente gestión: ${cliente?.gestion || "___________________________"}.`),

          titulo("CLÁUSULA SEGUNDA. VALOR Y FORMA DE PAGO."),
          parrafo(
            `El valor total de los honorarios profesionales pactados por la gestión descrita en la cláusula anterior es de ${formatoCOP(valorTotal)} (${numeroEnLetras(
              valorTotal
            )}), suma que EL CONTRATANTE pagará a EL CONTRATISTA ${formaDePago}.`
          ),

          titulo("CLÁUSULA TERCERA. OBLIGACIONES DE EL CONTRATISTA."),
          parrafo("Prestar el servicio profesional contratado con diligencia, idoneidad y buena fe; mantener informado a EL CONTRATANTE sobre el desarrollo y avances de la gestión encomendada; y guardar reserva y confidencialidad sobre la información conocida con ocasión del presente contrato."),

          titulo("CLÁUSULA CUARTA. OBLIGACIONES DE EL CONTRATANTE."),
          parrafo("Suministrar de forma oportuna y veraz la información y documentación necesaria para el desarrollo de la gestión, y pagar oportunamente los honorarios pactados en los términos y condiciones señalados en la cláusula segunda."),

          titulo("CLÁUSULA QUINTA. INDEPENDENCIA Y AUTONOMÍA."),
          parrafo("El presente contrato es de prestación de servicios profesionales y en ningún caso genera relación laboral entre las partes, por lo que EL CONTRATISTA actúa con plena autonomía técnica y administrativa en el desarrollo de su gestión."),

          titulo("CLÁUSULA SEXTA. DURACIÓN."),
          parrafo("El presente contrato tendrá una duración igual al tiempo que tome adelantar la gestión encomendada, o hasta que cualquiera de las partes lo dé por terminado de mutuo acuerdo o por justa causa."),

          titulo("CLÁUSULA SÉPTIMA. TERMINACIÓN ANTICIPADA."),
          parrafo("Cualquiera de las partes podrá dar por terminado el presente contrato de manera anticipada, mediante aviso escrito a la otra parte, sin perjuicio del pago de los honorarios ya causados por la gestión adelantada hasta la fecha de terminación."),

          titulo("CLÁUSULA OCTAVA. LEY APLICABLE Y JURISDICCIÓN."),
          parrafo("El presente contrato se rige por las leyes de la República de Colombia. Cualquier controversia derivada de su ejecución o interpretación se resolverá ante los jueces y tribunales competentes.", { after: 320 }),

          parrafo(`Para constancia, se firma en ${ciudad}, a los ${fechaHoy}.`, { after: 600 }),

          new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: "______________________________", size: 20 })] }),
          new Paragraph({ spacing: { after: 4 }, children: [new TextRun({ text: "EL CONTRATISTA", bold: true, size: 18, color: GRIS_TEXTO })] }),
          new Paragraph({ spacing: { after: 4 }, children: [new TextRun({ text: `${responsable}`, size: 20 })] }),
          new Paragraph({ spacing: { after: 500 }, children: [new TextRun({ text: `C.C. No. ${documentoResponsable || "______________________"}`, size: 20 })] }),

          new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: "______________________________", size: 20 })] }),
          new Paragraph({ spacing: { after: 4 }, children: [new TextRun({ text: "EL CONTRATANTE", bold: true, size: 18, color: GRIS_TEXTO })] }),
          new Paragraph({ spacing: { after: 4 }, children: [new TextRun({ text: `${cliente?.nombre || "___________________________"}`, size: 20 })] }),
          new Paragraph({ children: [new TextRun({ text: `C.C. No. ${cliente?.cedula || "______________________"}`, size: 20 })] }),

          new Paragraph({
            spacing: { before: 500 },
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0", space: 8 } },
            children: [new TextRun({ text: `${nombreDespacho} · generado electrónicamente`, size: 14, color: "94A3B8", italics: true })],
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `contrato_servicios_${(cliente?.nombre || "cliente").replace(/[^a-z0-9]+/gi, "_").toLowerCase()}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const CLIENTE_CONTRATO_INICIAL = { nombre: "", cedula: "", correo: "", direccion: "", celular: "", gestion: "" };

export default function CalculadoraTab() {
  // Mismos datos que usa Contabilidad para la cuenta de cobro ("Datos para
  // cuenta de cobro") — se leen aquí también porque el contrato necesita
  // el nombre/cédula de quien firma como EL CONTRATISTA, y así los dos
  // lugares quedan siempre sincronizados con un solo dato guardado.
  const [datosResponsable, setDatosResponsable] = useState(null);
  useEffect(() => {
    (async () => {
      const raw = await storageGet("perfil-abogado", false);
      setDatosResponsable(raw ? JSON.parse(raw) : {});
    })();
  }, []);

  const [paso, setPaso] = useState(1);
  const [valorTotal, setValorTotal] = useState("");
  const [costos, setCostos] = useState("");
  const [porcentajeReferenciador, setPorcentajeReferenciador] = useState("");
  const [porcentajeAbogadoAsociado, setPorcentajeAbogadoAsociado] = useState("");
  const [numCuotas, setNumCuotas] = useState("1");
  const [cliente, setCliente] = useState(CLIENTE_CONTRATO_INICIAL);
  const [generando, setGenerando] = useState(false);

  const total = Number(valorTotal) || 0;
  const costosNum = Number(costos) || 0;
  const comisionReferenciador = (total * (Number(porcentajeReferenciador) || 0)) / 100;
  const comisionAbogadoAsociado = (total * (Number(porcentajeAbogadoAsociado) || 0)) / 100;
  const neto = total - costosNum - comisionReferenciador - comisionAbogadoAsociado;
  const cuotasEfectivas = Math.min(30, Math.max(1, Number(numCuotas) || 1));
  const valorPorCuota = total / cuotasEfectivas;

  const reiniciar = () => {
    setPaso(1);
    setValorTotal("");
    setCostos("");
    setPorcentajeReferenciador("");
    setPorcentajeAbogadoAsociado("");
    setNumCuotas("1");
    setCliente(CLIENTE_CONTRATO_INICIAL);
  };

  const descargarContrato = async () => {
    setGenerando(true);
    try {
      await generarContratoServiciosDocx({ cliente, valorTotal: total, numCuotas: cuotasEfectivas, valorPorCuota, datosResponsable });
    } finally {
      setGenerando(false);
    }
  };

  return (
    <div>
      <EncabezadoSeccion titulo="Calculadora de precios" color="#F59E0B" />
      <Card style={{ marginBottom: 20 }}>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
          <Icono tipo="calculadora" size={14} /> Para antes de que el cliente exista en Nomos: calcula cuánto te queda libre y cuánto sería cada cuota, y descarga el contrato de servicios ya listo.
        </p>

        {paso === 1 && (
          <div style={{ marginTop: 14 }}>
            <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Valor total del servicio">
                <CampoDinero style={inputStyle} value={valorTotal} onChange={(e) => setValorTotal(e.target.value)} placeholder="Ej: 3.000.000" />
              </Field>
              <Field label="Costos del proceso (opcional)">
                <CampoDinero style={inputStyle} value={costos} onChange={(e) => setCostos(e.target.value)} placeholder="Notariales, peritos, etc." />
              </Field>
              <Field label="% para el referenciador (opcional)">
                <input
                  type="number"
                  className="drx-input"
                  style={inputStyle}
                  value={porcentajeReferenciador}
                  onChange={(e) => setPorcentajeReferenciador(e.target.value)}
                  placeholder="Ej: 10"
                />
              </Field>
              <Field label="% para el abogado asociado (opcional)">
                <input
                  type="number"
                  className="drx-input"
                  style={inputStyle}
                  value={porcentajeAbogadoAsociado}
                  onChange={(e) => setPorcentajeAbogadoAsociado(e.target.value)}
                  placeholder="Ej: 20"
                />
              </Field>
              <Field label="Número de cuotas (máximo 30)">
                <input type="number" max={30} className="drx-input" style={inputStyle} value={numCuotas} onChange={(e) => setNumCuotas(e.target.value)} />
              </Field>
            </div>

            <div style={{ marginTop: 16, background: COLORS.surfaceSoft, borderRadius: 10, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted }}>Valor por cuota</span>
                <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, fontWeight: 700, color: COLORS.ink }}>{formatoCOP(valorPorCuota)}</span>
              </div>
              {(costosNum > 0 || comisionReferenciador > 0 || comisionAbogadoAsociado > 0) && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted }}>Costos + comisiones</span>
                  <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, fontWeight: 700, color: "#B45309" }}>
                    −{formatoCOP(costosNum + comisionReferenciador + comisionAbogadoAsociado)}
                  </span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${COLORS.border}`, paddingTop: 6, marginTop: 2 }}>
                <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 700, color: COLORS.ink }}>Te queda libre</span>
                <span style={{ fontFamily: "Inter, sans-serif", fontSize: 16, fontWeight: 800, color: neto >= 0 ? "#166534" : "#B42318" }}>{formatoCOP(neto)}</span>
              </div>
            </div>

            <button className="drx-btn-primary" style={{ ...buttonPrimary, marginTop: 14 }} onClick={() => setPaso(2)} disabled={total <= 0}>
              Siguiente →
            </button>
          </div>
        )}

        {paso === 2 && (
          <div style={{ marginTop: 14 }}>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted, marginBottom: 12 }}>
              {formatoCOP(total)} {cuotasEfectivas > 1 ? `en ${cuotasEfectivas} cuotas de ${formatoCOP(valorPorCuota)}` : "en un solo pago"} · te queda libre {formatoCOP(neto)}
            </p>
            <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Nombre completo">
                <input className="drx-input" style={inputStyle} value={cliente.nombre} onChange={(e) => setCliente({ ...cliente, nombre: e.target.value.toUpperCase() })} />
              </Field>
              <Field label="Cédula">
                <input className="drx-input" style={inputStyle} value={cliente.cedula} onChange={(e) => setCliente({ ...cliente, cedula: e.target.value })} />
              </Field>
              <Field label="Correo">
                <input className="drx-input" style={inputStyle} value={cliente.correo} onChange={(e) => setCliente({ ...cliente, correo: e.target.value })} />
              </Field>
              <Field label="Celular">
                <input className="drx-input" style={inputStyle} value={cliente.celular} onChange={(e) => setCliente({ ...cliente, celular: e.target.value })} />
              </Field>
              <Field label="Dirección">
                <input className="drx-input" style={inputStyle} value={cliente.direccion} onChange={(e) => setCliente({ ...cliente, direccion: e.target.value })} />
              </Field>
            </div>
            <div style={{ marginTop: 12 }}>
              <Field label="Gestión que se va a realizar">
                <textarea
                  className="drx-input"
                  style={{ ...inputStyle, minHeight: 70, resize: "vertical" }}
                  value={cliente.gestion}
                  onChange={(e) => setCliente({ ...cliente, gestion: e.target.value })}
                  placeholder="Ej: Trámite de divorcio de mutuo acuerdo ante notaría"
                />
              </Field>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              <button className="drx-btn-ghost" style={buttonGhost} onClick={() => setPaso(1)}>
                ← Atrás
              </button>
              <button className="drx-btn-primary" style={buttonPrimary} onClick={descargarContrato} disabled={generando}>
                {generando ? "Generando…" : "Descargar contrato de servicios"}
              </button>
              <button className="drx-btn-ghost" style={buttonGhost} onClick={reiniciar}>
                Empezar de nuevo
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
