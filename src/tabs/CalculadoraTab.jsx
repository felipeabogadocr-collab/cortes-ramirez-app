// Calculadora de precios: pensada para ANTES de que el cliente exista en
// Nomos — mientras se le está armando la propuesta. Deja ver qué tanto le
// queda libre al despacho (después de comisiones y costos) y, sobre todo,
// cuánto sería cada cuota y CUÁNDO — porque el cliente casi nunca acuerda
// pagar el mismo día en que se firma el contrato (p. ej. hoy es 5 y el
// cliente paga el 10 de cada mes), así que el día de pago se calcula aparte
// de la fecha de hoy. Al final: crea el cliente en Contabilidad y el
// contrato queda listo para firma electrónica (el mismo sistema de
// "Firmar documentos" que ya tiene Nomos), con su enlace enviado por
// WhatsApp — todo en un solo paso, sin tener que repetir los datos en
// Clientes ni en Documentos.
import { useState, useEffect } from "react";
import { storageGet, storageSet, getNombreDespacho } from "../lib/storage";
import { numeroEnLetras } from "../lib/numeroEnLetras.js";
import {
  COLORS, uid, registrarAuditoria, useIndex, Field, inputStyle, CampoDinero, buttonPrimary,
  buttonGhost, Card, EncabezadoSeccion, Icono, formatoCOP, LOGO_SRC, useReferenciadores,
  useAbogadosAsociados, SelectorComision, AREAS_PROCESO, tiposProcesoDeArea,
  calcularProximaFechaPorFrecuencia, numeroWhatsappCliente,
} from "../App.jsx";

const AZUL_MARCA = "0B1220";
const GRIS_TEXTO = "475569";
const MAX_CUOTAS = 30;

function base64ImagenALogo(dataUri) {
  const base64 = (dataUri || "").split(",")[1] || "";
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

const pad2 = (n) => String(n).padStart(2, "0");
const ultimoDiaMes = (anio, mesIndex) => new Date(anio, mesIndex + 1, 0).getDate();
const fechaISODiaMes = (anio, mesIndex, dia) => `${anio}-${pad2(mesIndex + 1)}-${pad2(Math.min(dia, ultimoDiaMes(anio, mesIndex)))}`;

// Si el cliente acuerda pagar un día del mes distinto al de hoy (el caso
// típico: "hoy es 5, pero yo pago es el 10"), la primera cuota no es hoy —
// es la próxima vez que llegue ese día. Sin día de pago puesto, se asume
// que la primera cuota es hoy mismo (como antes).
function calcularPrimeraFechaCuota(diaPago) {
  const hoy = new Date();
  if (!diaPago) return fechaISODiaMes(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  let anio = hoy.getFullYear();
  let mes = hoy.getMonth();
  if (hoy.getDate() > diaPago) {
    mes += 1;
    if (mes > 11) {
      mes = 0;
      anio += 1;
    }
  }
  return fechaISODiaMes(anio, mes, diaPago);
}

function generarCuotasConFechas({ valorTotal, numCuotas, diaPago }) {
  const primera = calcularPrimeraFechaCuota(diaPago);
  const valorCuota = numCuotas > 0 ? valorTotal / numCuotas : 0;
  const cuotas = [];
  let fecha = primera;
  for (let i = 0; i < numCuotas; i++) {
    cuotas.push({ fecha, valor: valorCuota });
    fecha = calcularProximaFechaPorFrecuencia(fecha, "Mensual");
  }
  return cuotas;
}

// El contenido del contrato se arma como una sola lista de cláusulas (cada
// una con su título y su texto) en vez de directamente en HTML/docx, para
// que tanto el documento de firma electrónica (texto plano, en el mismo
// sistema que usa "Firmar documentos") como la versión Word descargable
// salgan exactamente del mismo contenido — nunca desincronizados entre sí.
function construirClausulasContrato({ cliente, valorTotal, cuotas, datosResponsable }) {
  const nombreDespacho = getNombreDespacho();
  const responsable = (datosResponsable?.nombre || nombreDespacho || "").trim();
  const documentoResponsable = (datosResponsable?.documento || "").trim();
  const ciudad = (datosResponsable?.ciudad || "").trim() || "___________";
  const fechaHoy = new Date().toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });

  const listaCuotas =
    cuotas.length > 1
      ? cuotas.map((c, i) => `Cuota ${i + 1}: ${formatoCOP(c.valor)}, con vencimiento el ${new Date(`${c.fecha}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}.`).join(" ")
      : `en un solo pago, con vencimiento el ${new Date(`${cuotas[0]?.fecha}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}.`;

  return {
    encabezado: "CONTRATO DE PRESTACIÓN DE SERVICIOS PROFESIONALES",
    intro: `Entre los suscritos, a saber, de una parte ${responsable}, identificado(a) con cédula de ciudadanía No. ${
      documentoResponsable || "______________________"
    }, actuando en nombre y representación de ${nombreDespacho}, quien en adelante se denominará EL CONTRATISTA; y de otra parte ${
      cliente?.nombre || "___________________________"
    }, identificado(a) con cédula de ciudadanía No. ${cliente?.cedula || "______________________"}, con correo electrónico ${
      cliente?.correo || "___________________________"
    }, domicilio en ${cliente?.direccion || "___________________________"} y celular de contacto ${
      cliente?.celular || "______________"
    }, quien en adelante se denominará EL CONTRATANTE, hemos convenido celebrar el presente contrato de prestación de servicios profesionales, el cual se regirá por las siguientes cláusulas:`,
    fecha: `${ciudad}, ${fechaHoy}`,
    responsable,
    documentoResponsable,
    clausulas: [
      { titulo: "CLÁUSULA PRIMERA. OBJETO.", texto: `EL CONTRATISTA se obliga a prestar sus servicios profesionales como abogado(a) a favor de EL CONTRATANTE, para adelantar la siguiente gestión: ${cliente?.gestion || "___________________________"}.` },
      {
        titulo: "CLÁUSULA SEGUNDA. VALOR Y FORMA DE PAGO.",
        texto: `El valor total de los honorarios profesionales pactados por la gestión descrita en la cláusula anterior es de ${formatoCOP(valorTotal)} (${numeroEnLetras(
          valorTotal
        )}), suma que EL CONTRATANTE pagará a EL CONTRATISTA así: ${listaCuotas}`,
      },
      { titulo: "CLÁUSULA TERCERA. OBLIGACIONES DE EL CONTRATISTA.", texto: "Prestar el servicio profesional contratado con diligencia, idoneidad y buena fe; mantener informado a EL CONTRATANTE sobre el desarrollo y avances de la gestión encomendada; y guardar reserva y confidencialidad sobre la información conocida con ocasión del presente contrato." },
      { titulo: "CLÁUSULA CUARTA. OBLIGACIONES DE EL CONTRATANTE.", texto: "Suministrar de forma oportuna y veraz la información y documentación necesaria para el desarrollo de la gestión, y pagar oportunamente los honorarios pactados en los términos y condiciones señalados en la cláusula segunda." },
      { titulo: "CLÁUSULA QUINTA. INDEPENDENCIA Y AUTONOMÍA.", texto: "El presente contrato es de prestación de servicios profesionales y en ningún caso genera relación laboral entre las partes, por lo que EL CONTRATISTA actúa con plena autonomía técnica y administrativa en el desarrollo de su gestión." },
      { titulo: "CLÁUSULA SEXTA. DURACIÓN.", texto: "El presente contrato tendrá una duración igual al tiempo que tome adelantar la gestión encomendada, o hasta que cualquiera de las partes lo dé por terminado de mutuo acuerdo o por justa causa." },
      { titulo: "CLÁUSULA SÉPTIMA. TERMINACIÓN ANTICIPADA.", texto: "Cualquiera de las partes podrá dar por terminado el presente contrato de manera anticipada, mediante aviso escrito a la otra parte, sin perjuicio del pago de los honorarios ya causados por la gestión adelantada hasta la fecha de terminación." },
      { titulo: "CLÁUSULA OCTAVA. LEY APLICABLE Y JURISDICCIÓN.", texto: "El presente contrato se rige por las leyes de la República de Colombia. Cualquier controversia derivada de su ejecución o interpretación se resolverá ante los jueces y tribunales competentes." },
    ],
  };
}

// Versión en texto plano — para el documento de firma electrónica (mismo
// sistema de Documentos: código de firma + enlace por WhatsApp).
function construirTextoContrato(datos) {
  const c = construirClausulasContrato(datos);
  const partes = [c.encabezado, "", c.intro, ""];
  c.clausulas.forEach((cl) => partes.push(cl.titulo, cl.texto, ""));
  partes.push(`Para constancia, se firma en ${c.fecha}.`);
  return partes.join("\n");
}

// Word (.docx) con el formato que pidió el despacho: Tahoma 12, interlineado
// 1.5 — se aplica como estilo por defecto del documento y también en cada
// TextRun, para que quede igual sin importar qué tan estricto sea el Word
// de quien lo abra.
async function generarContratoServiciosDocx(datos) {
  const { Document, Packer, Paragraph, TextRun, AlignmentType, ImageRun, BorderStyle } = await import("docx");
  const c = construirClausulasContrato(datos);
  const FUENTE = "Tahoma";
  const INTERLINEADO = { line: 360, lineRule: "auto" }; // 360 = 1.5x (240 = sencillo)

  const run = (texto, extra = {}) => new TextRun({ text: texto, font: FUENTE, size: 24, ...extra });
  const parrafo = (texto, opciones = {}) =>
    new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: opciones.after ?? 180, ...INTERLINEADO }, children: [run(texto)] });
  const titulo = (texto) => new Paragraph({ spacing: { before: 260, after: 90, ...INTERLINEADO }, children: [run(texto, { bold: true, color: AZUL_MARCA })] });

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

  const doc = new Document({
    styles: { default: { document: { run: { font: FUENTE, size: 24 }, paragraph: { spacing: INTERLINEADO } } } },
    sections: [
      {
        properties: { page: { margin: { top: 900, bottom: 900, left: 1100, right: 1100 } } },
        children: [
          ...logo,
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 4 }, children: [run(getNombreDespacho(), { bold: true, size: 28, color: AZUL_MARCA })] }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 260 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "E2E8F0", space: 10 } },
            children: [run("Cortés Ramírez Abogados", { size: 18, color: GRIS_TEXTO, italics: true })],
          }),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 320 }, children: [run(c.encabezado, { bold: true, size: 30, color: AZUL_MARCA })] }),

          parrafo(c.intro),
          ...c.clausulas.flatMap((cl) => [titulo(cl.titulo), parrafo(cl.texto, cl.titulo.includes("OCTAVA") ? { after: 320 } : {})]),

          parrafo(`Para constancia, se firma en ${c.fecha}.`, { after: 600 }),

          new Paragraph({ spacing: { after: 40 }, children: [run("______________________________")] }),
          new Paragraph({ spacing: { after: 4 }, children: [run("EL CONTRATISTA", { bold: true, size: 22, color: GRIS_TEXTO })] }),
          new Paragraph({ spacing: { after: 4 }, children: [run(c.responsable)] }),
          new Paragraph({ spacing: { after: 500 }, children: [run(`C.C. No. ${c.documentoResponsable || "______________________"}`)] }),

          new Paragraph({ spacing: { after: 40 }, children: [run("______________________________")] }),
          new Paragraph({ spacing: { after: 4 }, children: [run("EL CONTRATANTE", { bold: true, size: 22, color: GRIS_TEXTO })] }),
          new Paragraph({ spacing: { after: 4 }, children: [run(datos.cliente?.nombre || "___________________________")] }),
          new Paragraph({ children: [run(`C.C. No. ${datos.cliente?.cedula || "______________________"}`)] }),

          new Paragraph({
            spacing: { before: 500 },
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0", space: 8 } },
            children: [run(`${getNombreDespacho()} · generado electrónicamente`, { size: 16, color: "94A3B8", italics: true })],
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `contrato_servicios_${(datos.cliente?.nombre || "cliente").replace(/[^a-z0-9]+/gi, "_").toLowerCase()}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const CLIENTE_CONTRATO_INICIAL = { nombre: "", cedula: "", correo: "", direccion: "", celular: "", gestion: "" };

export default function CalculadoraTab({ usuarioActual }) {
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

  const { addId: addIdCliente } = useIndex("indice-clientes", false);
  const { addId: addIdDocumento } = useIndex("indice-documentos", true);

  const [paso, setPaso] = useState(1);
  const [valorTotal, setValorTotal] = useState("");
  const [costos, setCostos] = useState("");
  const [referenciador, setReferenciador] = useState(null);
  const [abogadoAsociado, setAbogadoAsociado] = useState(null);
  const [numCuotas, setNumCuotas] = useState("1");
  const [diaPago, setDiaPago] = useState("");
  const [cliente, setCliente] = useState(CLIENTE_CONTRATO_INICIAL);
  const [generando, setGenerando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const total = Number(valorTotal) || 0;
  const costosNum = Number(costos) || 0;
  const comisionReferenciador = (total * (Number(referenciador?.porcentaje) || 0)) / 100;
  const comisionAbogadoAsociado = (total * (Number(abogadoAsociado?.porcentaje) || 0)) / 100;
  const neto = total - costosNum - comisionReferenciador - comisionAbogadoAsociado;
  const cuotasEfectivas = Math.min(MAX_CUOTAS, Math.max(1, Number(numCuotas) || 1));
  const diaPagoNum = Math.min(31, Math.max(0, Number(diaPago) || 0));
  const cuotas = total > 0 ? generarCuotasConFechas({ valorTotal: total, numCuotas: cuotasEfectivas, diaPago: diaPagoNum }) : [];

  const reiniciar = () => {
    setPaso(1);
    setValorTotal("");
    setCostos("");
    setReferenciador(null);
    setAbogadoAsociado(null);
    setNumCuotas("1");
    setDiaPago("");
    setCliente(CLIENTE_CONTRATO_INICIAL);
    setResultado(null);
  };

  const descargarWord = async () => {
    setGenerando(true);
    try {
      await generarContratoServiciosDocx({ cliente, valorTotal: total, cuotas, datosResponsable });
    } finally {
      setGenerando(false);
    }
  };

  // Crea el cliente en Contabilidad/Clientes con el mismo plan de pago que
  // se acaba de calcular, arma el contrato como un documento de firma
  // electrónica (el mismo sistema de la pestaña "Firmar documentos": código
  // + enlace) y abre WhatsApp con ese enlace listo para enviar. El cliente
  // queda creado en este momento (cuando se manda a firmar), no cuando el
  // cliente efectivamente firma en su celular — eso pasa en otro
  // dispositivo y Nomos no puede engancharse a ese instante.
  const crearYEnviarAFirmar = async () => {
    if (!cliente.nombre.trim() || !cliente.celular.trim() || total <= 0) return;
    setCreando(true);
    try {
      const notasExtra = [cliente.cedula && `Cédula: ${cliente.cedula}`, cliente.direccion && `Dirección: ${cliente.direccion}`].filter(Boolean).join(" · ");
      const primeraCuota = cuotas[0];
      const idCliente = uid();
      const areaProceso = AREAS_PROCESO[0];
      const clientePayload = {
        nombre: cliente.nombre,
        telefono: cliente.celular,
        email: cliente.correo,
        tipoProceso: tiposProcesoDeArea(areaProceso)[0],
        areaProceso,
        radicados: [],
        radicado: "",
        notas: [notasExtra, cliente.gestion && `Gestión: ${cliente.gestion}`].filter(Boolean).join("\n"),
        planPago: {
          valor: total,
          frecuencia: "Mensual",
          numCuotas: cuotasEfectivas,
          proximaFecha: primeraCuota?.fecha || "",
          cuotas,
          resumen: `${formatoCOP(total)} mensual${cuotasEfectivas > 1 ? ` en ${cuotasEfectivas} cuotas` : ""}`,
        },
        valorTotal: total,
        abogadoAsignado: "",
        otrasPersonas: [],
        grupoWhatsapp: "",
        pagador: null,
        referenciador,
        abogadoAsociado,
        timeline: [],
        ultimaActuacion: new Date().toISOString(),
        proximoPago: primeraCuota ? { fecha: primeraCuota.fecha, valorEsperado: primeraCuota.valor } : null,
      };
      await storageSet(`cliente:${idCliente}`, JSON.stringify(clientePayload), false);
      await addIdCliente(idCliente);
      registrarAuditoria(usuarioActual, "crear_cliente", "cliente", idCliente, { nombre: cliente.nombre });

      const idDocumento = uid();
      const titulo = `Contrato de prestación de servicios – ${cliente.nombre}`;
      const contenido = construirTextoContrato({ cliente, valorTotal: total, cuotas, datosResponsable });
      const numeroLimpio = (cliente.celular || "").replace(/[^0-9]/g, "");
      const documentoPayload = {
        titulo,
        cliente: cliente.nombre,
        whatsappIndicativo: "57",
        whatsappNumero: numeroLimpio,
        contenido,
        nombreArchivo: "",
        tipoDocumento: "texto",
        archivoPdfBase64: "",
        firmantes: [],
        creadoEn: new Date().toISOString(),
      };
      await storageSet(`documento:${idDocumento}`, JSON.stringify(documentoPayload), true);
      await addIdDocumento(idDocumento);
      registrarAuditoria(usuarioActual, "crear_documento", "documento", idDocumento, { nombre: titulo });

      const enlaceFirma = typeof window !== "undefined" ? `${window.location.origin}/#firmar` : "";
      const pasos = enlaceFirma
        ? `1. Haz clic aquí: ${enlaceFirma}\n2. Cuando te lo pida, escribe este código: *${idDocumento}*\n3. Sigue los pasos en pantalla para firmar`
        : `1. Ingresa al aplicativo de firmas\n2. Escribe este código: *${idDocumento}*\n3. Sigue los pasos en pantalla para firmar`;
      const mensaje = `*${getNombreDespacho()}*\n\nHola ${cliente.nombre}, te compartimos el documento *"${titulo}"* para tu firma electrónica.\n\n${pasos}\n\nCualquier duda, escríbenos por este mismo medio.`;
      const numero = numeroWhatsappCliente(cliente.celular);
      window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`, "_blank");

      setResultado({ idCliente, idDocumento });
    } finally {
      setCreando(false);
    }
  };

  return (
    <div>
      <EncabezadoSeccion titulo="Calculadora de precios" color="#F59E0B" />
      <Card style={{ marginBottom: 20 }}>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
          <Icono tipo="calculadora" size={14} /> Para antes de que el cliente exista en Nomos: calcula cuánto te queda libre, cuándo sería cada cuota, y crea el cliente + el contrato para firmar.
        </p>

        {resultado && (
          <div style={{ marginTop: 14, background: "#F0FDF4", border: "1px solid #D1FAE5", borderRadius: 10, padding: "14px 16px" }}>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, fontWeight: 700, color: "#166534", margin: 0 }}>
              <Icono tipo="check" size={14} style={{ marginRight: 4, verticalAlign: -2 }} /> Cliente creado y contrato listo para firma
            </p>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: "#166534", margin: "6px 0 0" }}>
              Ya aparece en Clientes y en Contabilidad. El mensaje de WhatsApp se abrió en otra pestaña — el código de firma es <b>{resultado.idDocumento}</b> (también queda guardado en Documentos).
            </p>
            <button className="drx-btn-ghost" style={{ ...buttonGhost, marginTop: 10 }} onClick={reiniciar}>
              Calcular otro
            </button>
          </div>
        )}

        {!resultado && paso === 1 && (
          <div style={{ marginTop: 14 }}>
            <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Valor total del servicio">
                <CampoDinero style={inputStyle} value={valorTotal} onChange={(e) => setValorTotal(e.target.value)} placeholder="Ej: 3.000.000" />
              </Field>
              <Field label="Costos del proceso (opcional)">
                <CampoDinero style={inputStyle} value={costos} onChange={(e) => setCostos(e.target.value)} placeholder="Notariales, peritos, etc." />
              </Field>
              <Field label="Número de cuotas (máximo 30)">
                <input type="number" max={30} className="drx-input" style={inputStyle} value={numCuotas} onChange={(e) => setNumCuotas(e.target.value)} />
              </Field>
              <Field label="Día del mes en que paga el cliente (opcional)">
                <input type="number" min={1} max={31} className="drx-input" style={inputStyle} value={diaPago} onChange={(e) => setDiaPago(e.target.value)} placeholder="Ej: 10" />
              </Field>
            </div>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: COLORS.muted, marginTop: 4 }}>
              Si el cliente acuerda pagar un día distinto a hoy (por ejemplo, hoy es 5 pero él paga el 10 de cada mes), pon ese día aquí — la primera cuota se calcula para la próxima vez que caiga ese día, no para hoy.
            </p>

            <SelectorComision
              titulo="¿Alguien refirió a este cliente? (comisión)"
              contactosHook={useReferenciadores}
              valor={referenciador}
              onChange={setReferenciador}
              placeholderNombre="Nombre de quien refiere"
            />
            <SelectorComision
              titulo="¿Se trabaja este caso con otro abogado? (honorarios compartidos)"
              contactosHook={useAbogadosAsociados}
              valor={abogadoAsociado}
              onChange={setAbogadoAsociado}
              placeholderNombre="Nombre del abogado"
            />

            {cuotas.length > 0 && (
              <div style={{ marginTop: 16, background: COLORS.surfaceSoft, borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: cuotas.length > 1 ? 10 : 0 }}>
                  {cuotas.map((c, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontFamily: "Inter, sans-serif" }}>
                      <span style={{ color: COLORS.muted }}>
                        {cuotas.length > 1 ? `Cuota ${i + 1}` : "Pago único"} · {new Date(`${c.fecha}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                      <span style={{ fontWeight: 700, color: COLORS.ink }}>{formatoCOP(c.valor)}</span>
                    </div>
                  ))}
                </div>
                {(costosNum > 0 || comisionReferenciador > 0 || comisionAbogadoAsociado > 0) && (
                  <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${COLORS.border}`, paddingTop: 6, marginTop: 6 }}>
                    <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted }}>Costos + comisiones</span>
                    <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, fontWeight: 700, color: "#B45309" }}>
                      −{formatoCOP(costosNum + comisionReferenciador + comisionAbogadoAsociado)}
                    </span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${COLORS.border}`, paddingTop: 6, marginTop: 6 }}>
                  <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 700, color: COLORS.ink }}>Te queda libre</span>
                  <span style={{ fontFamily: "Inter, sans-serif", fontSize: 16, fontWeight: 800, color: neto >= 0 ? "#166534" : "#B42318" }}>{formatoCOP(neto)}</span>
                </div>
              </div>
            )}

            <button className="drx-btn-primary" style={{ ...buttonPrimary, marginTop: 14 }} onClick={() => setPaso(2)} disabled={total <= 0}>
              Siguiente →
            </button>
          </div>
        )}

        {!resultado && paso === 2 && (
          <div style={{ marginTop: 14 }}>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted, marginBottom: 12 }}>
              {formatoCOP(total)} {cuotasEfectivas > 1 ? `en ${cuotasEfectivas} cuotas` : "en un solo pago"} · te queda libre {formatoCOP(neto)}
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
              <Field label="Celular (WhatsApp)">
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
              <button
                className="drx-btn-primary"
                style={buttonPrimary}
                onClick={crearYEnviarAFirmar}
                disabled={creando || !cliente.nombre.trim() || !cliente.celular.trim()}
              >
                {creando ? "Creando…" : "Crear cliente y enviar a firmar por WhatsApp"}
              </button>
              <button className="drx-btn-ghost" style={buttonGhost} onClick={descargarWord} disabled={generando}>
                {generando ? "Generando…" : "Solo descargar en Word"}
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
