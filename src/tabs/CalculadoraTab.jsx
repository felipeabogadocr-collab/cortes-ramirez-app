// Calculadora de precios: pensada para ANTES de que el cliente exista en
// Nomos — mientras se le está armando la propuesta. Deja ver qué tanto le
// queda libre al despacho (después de comisiones y costos) y, sobre todo,
// cuánto sería cada cuota y CUÁNDO — porque el cliente casi nunca acuerda
// pagar el mismo día en que se firma el contrato (p. ej. hoy es 5 y el
// cliente paga el 10 de cada mes), así que el día de pago se calcula aparte
// de la fecha de hoy. Al final: descarga el contrato (Word o PDF, para
// revisar o ajustar antes de mandarlo), o de una vez crea el cliente en
// Contabilidad y lo deja listo para firma electrónica (el mismo sistema de
// "Firmar documentos" que ya tiene Nomos), con su enlace enviado por
// WhatsApp — todo en un solo paso, sin tener que repetir los datos.
import { useState, useEffect } from "react";
import { storageGet, storageSet, getNombreDespacho } from "../lib/storage";
import { numeroEnLetras } from "../lib/numeroEnLetras.js";
import {
  COLORS, uid, registrarAuditoria, useIndex, Field, inputStyle, CampoDinero, buttonPrimary,
  buttonGhost, Card, EncabezadoSeccion, Icono, formatoCOP, LOGO_SRC, useReferenciadores,
  useAbogadosAsociados, SelectorComision, AREAS_PROCESO, tiposProcesoDeArea,
  calcularProximaFechaPorFrecuencia, numeroWhatsappCliente, ensureJsPDF,
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
const fechaLarga = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });

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

// "identificado" vs "identificados", "titular" vs "titulares" — el
// contrato real del despacho puede tener uno o dos abogados a cargo, y la
// gramática cambia según cuántos sean.
function descripcionAbogados(abogados) {
  const nombres = abogados.map((a) => a.nombre).filter(Boolean).join(" y ");
  const plural = abogados.length > 1;
  const cedulas = abogados.map((a) => `cédula de ciudadanía No. ${a.documento || "______________________"}`).join(" y ");
  const tps = abogados.map((a) => a.tp || "______________________").join(" y ");
  return `${nombres || "___________________________"}, abogado${plural ? "s" : ""} en ejercicio, identificado${plural ? "s" : ""} con ${cedulas}, titular${
    plural ? "es" : ""
  } de la Tarjeta Profesional No. ${tps}`;
}

// El contenido del contrato se arma como una sola estructura (encabezado +
// intro + cláusulas + firmantes) en vez de directamente en HTML/docx/PDF,
// para que el documento de firma electrónica (texto plano, mismo sistema
// que usa "Firmar documentos"), el Word y el PDF descargables salgan
// exactamente del mismo contenido — nunca desincronizados entre sí.
function construirClausulasContrato({ cliente, contratante, contratanteDistinto, proceso, alcanceServicio, abogados, valorTotal, cuotas, datosResponsable }) {
  const nombreDespacho = getNombreDespacho();
  const ciudad = (datosResponsable?.ciudad || "").trim() || "___________";
  const fechaHoy = new Date().toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });

  const abogado1 = { nombre: datosResponsable?.nombre || nombreDespacho, documento: datosResponsable?.documento, tp: datosResponsable?.tp };
  const listaAbogados = abogados?.nombre ? [abogado1, abogados] : [abogado1];

  // Cuando quien contrata (y paga) es distinto de la persona a favor de
  // quien se presta el servicio (ej. un familiar contrata para otra
  // persona), el contrato distingue EL CONTRATANTE de LA PERSONA
  // REPRESENTADA; si es la misma persona, se simplifica a un solo rol.
  const nombreContratante = contratanteDistinto ? contratante?.nombre || "___________________________" : cliente?.nombre || "___________________________";
  const cedulaContratante = contratanteDistinto ? contratante?.cedula || "______________________" : cliente?.cedula || "______________________";
  const etiquetaBeneficiario = contratanteDistinto ? "LA PERSONA REPRESENTADA" : "EL CONTRATANTE";

  const listaCuotas =
    cuotas.length > 1
      ? cuotas.map((c, i) => `Cuota ${i + 1}: ${formatoCOP(c.valor)}, con vencimiento el ${fechaLarga(c.fecha)}.`).join(" ")
      : `en un solo pago, con vencimiento el ${cuotas[0] ? fechaLarga(cuotas[0].fecha) : "___________"}.`;

  const itemsAlcance = (alcanceServicio || "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  const alcanceFinal = itemsAlcance.length > 0 ? itemsAlcance : ["Asesoría y representación jurídica en el asunto encomendado."];

  const clausulas = [];

  if (contratanteDistinto) {
    clausulas.push({
      titulo: "CLÁUSULA PRIMERA. PERSONA REPRESENTADA.",
      texto: `Los servicios objeto del presente contrato serán prestados en favor de ${cliente?.nombre || "___________________________"}, identificado(a) con cédula de ciudadanía No. ${
        cliente?.cedula || "______________________"
      }${cliente?.direccion ? `, con domicilio en ${cliente.direccion}` : ""}, quien para efectos del presente contrato se denominará LA PERSONA REPRESENTADA. EL CONTRATANTE será quien asuma el pago de los honorarios profesionales pactados.`,
    });
  }

  clausulas.push({
    titulo: `CLÁUSULA ${contratanteDistinto ? "SEGUNDA" : "PRIMERA"}. OBJETO.`,
    texto: `LOS ABOGADOS se obligan a prestar servicios profesionales de asesoría, acompañamiento, gestión y representación jurídica a favor de ${etiquetaBeneficiario} dentro de la actuación que cursa ante ${
      proceso?.despacho || "___________________________"
    }${proceso?.numero ? `, identificada con el número de proceso/radicado ${proceso.numero}` : ""}${proceso?.etapa ? ` (etapa: ${proceso.etapa})` : ""}. ${cliente?.gestion || ""}`.trim(),
  });

  clausulas.push({ titulo: `CLÁUSULA ${contratanteDistinto ? "TERCERA" : "SEGUNDA"}. ALCANCE DEL SERVICIO.`, texto: "El servicio comprenderá:", lista: alcanceFinal });

  clausulas.push({
    titulo: `CLÁUSULA ${contratanteDistinto ? "CUARTA" : "TERCERA"}. EQUIPO JURÍDICO Y DELEGACIÓN.`,
    texto: `La dirección y coordinación del asunto estará a cargo de ${listaAbogados.map((a) => a.nombre).join(" y ")}. Para la adecuada prestación del servicio, LOS ABOGADOS podrán apoyarse o delegar determinadas actividades en abogados, profesionales o integrantes de su equipo jurídico, tales como revisión de documentos, elaboración de escritos, seguimiento de actuaciones y demás labores relacionadas con el caso. Lo anterior no implica modificación de los honorarios pactados ni exonera a LOS ABOGADOS de la dirección y coordinación general del asunto.`,
  });

  clausulas.push({
    titulo: `CLÁUSULA ${contratanteDistinto ? "QUINTA" : "CUARTA"}. HONORARIOS Y FORMA DE PAGO.`,
    texto: `Los honorarios profesionales, fijados en la suma total de ${formatoCOP(valorTotal)} (${numeroEnLetras(
      valorTotal
    )}), serán cancelados por EL CONTRATANTE así: ${listaCuotas}`,
  });

  clausulas.push({
    titulo: `CLÁUSULA ${contratanteDistinto ? "SEXTA" : "QUINTA"}. GASTOS.`,
    texto: `Los honorarios comprenden los servicios profesionales descritos en este contrato. Los gastos adicionales que sean necesarios para el desarrollo del asunto, tales como desplazamientos, transporte, alojamiento, copias, autenticaciones, notariales, certificados, peritajes, mensajería, derechos de terceros o gastos cobrados por entidades públicas o privadas, serán asumidos por EL CONTRATANTE${
      contratanteDistinto ? " o LA PERSONA REPRESENTADA" : ""
    }, según corresponda.`,
  });

  clausulas.push({
    titulo: `CLÁUSULA ${contratanteDistinto ? "SÉPTIMA" : "SEXTA"}. OBLIGACIONES DE LOS ABOGADOS.`,
    texto: "LOS ABOGADOS se comprometen a:",
    lista: [
      "Prestar los servicios contratados con diligencia y responsabilidad profesional.",
      `Mantener informado al CONTRATANTE${contratanteDistinto ? " y/o a LA PERSONA REPRESENTADA" : ""} sobre las actuaciones relevantes del caso.`,
      "Realizar las gestiones comprendidas dentro del objeto del contrato.",
      "Mantener la confidencialidad de la información y documentación recibida.",
    ],
  });

  clausulas.push({
    titulo: `CLÁUSULA ${contratanteDistinto ? "OCTAVA" : "SÉPTIMA"}. OBLIGACIONES DE${contratanteDistinto ? "L CONTRATANTE Y DE LA PERSONA REPRESENTADA" : "L CONTRATANTE"}.`,
    texto: `EL CONTRATANTE${
      contratanteDistinto ? " y LA PERSONA REPRESENTADA" : ""
    } se comprometen a suministrar información completa y veraz, entregar oportunamente los documentos necesarios, informar cualquier comunicación o actuación relacionada con el caso y cumplir con las obligaciones económicas pactadas.${
      contratanteDistinto ? " LA PERSONA REPRESENTADA deberá otorgar los poderes y autorizaciones necesarios para el ejercicio de la representación jurídica." : ""
    }`,
  });

  clausulas.push({
    titulo: `CLÁUSULA ${contratanteDistinto ? "NOVENA" : "OCTAVA"}. OBLIGACIÓN DE MEDIO.`,
    texto: `Las partes reconocen que la prestación de servicios jurídicos constituye una obligación de medio y no de resultado. En consecuencia, LOS ABOGADOS emplearán sus conocimientos, experiencia y diligencia profesional para la defensa de los intereses de ${etiquetaBeneficiario}, sin garantizar un resultado específico.`,
  });

  clausulas.push({
    titulo: `CLÁUSULA ${contratanteDistinto ? "DÉCIMA" : "NOVENA"}. ACTUACIONES ADICIONALES.`,
    texto: "Cualquier proceso, trámite o actuación que sea diferente o exceda el objeto y alcance establecido en este contrato será informado previamente y, cuando corresponda, será objeto de una cotización independiente.",
  });

  clausulas.push({
    titulo: `CLÁUSULA ${contratanteDistinto ? "DÉCIMA PRIMERA" : "DÉCIMA"}. TERMINACIÓN.`,
    texto: "El contrato podrá terminar por mutuo acuerdo, cumplimiento del objeto, incumplimiento de las obligaciones pactadas, decisión de alguna de las partes o por las demás causas legalmente aplicables. En caso de terminación anticipada, deberán reconocerse los honorarios correspondientes a las gestiones realizadas y las obligaciones económicas causadas hasta la fecha de terminación.",
  });

  clausulas.push({
    titulo: `CLÁUSULA ${contratanteDistinto ? "DÉCIMA SEGUNDA" : "DÉCIMA PRIMERA"}. ACEPTACIÓN.`,
    texto: "Las partes manifiestan que han leído y comprendido el contenido del presente contrato y que lo suscriben libremente, aceptando las condiciones jurídicas y económicas aquí establecidas.",
  });

  const firmantes = [
    ...listaAbogados.map((a) => ({ rol: "LOS ABOGADOS", nombre: a.nombre, documento: a.documento, extra: a.tp ? `T.P. No. ${a.tp}` : "" })),
    { rol: "EL CONTRATANTE", nombre: nombreContratante, documento: cedulaContratante },
  ];
  if (contratanteDistinto) firmantes.push({ rol: "LA PERSONA REPRESENTADA", nombre: cliente?.nombre || "___________________________", documento: cliente?.cedula || "______________________" });

  return {
    encabezado: "CONTRATO DE PRESTACIÓN DE SERVICIOS JURÍDICOS",
    intro: `Entre los suscritos, por una parte, ${descripcionAbogados(listaAbogados)}, quienes para efectos del presente contrato se denominarán LOS ABOGADOS; y por otra parte, ${nombreContratante}, identificado(a) con cédula de ciudadanía No. ${cedulaContratante}, quien se denominará EL CONTRATANTE, se celebra el presente contrato de prestación de servicios jurídicos, de conformidad con las siguientes cláusulas:`,
    fecha: `${ciudad}, ${fechaHoy}`,
    clausulas,
    firmantes,
  };
}

// Versión en texto plano — para el documento de firma electrónica (mismo
// sistema de Documentos: código de firma + enlace por WhatsApp).
function construirTextoContrato(datos) {
  const c = construirClausulasContrato(datos);
  const partes = [c.encabezado, "", c.intro, ""];
  c.clausulas.forEach((cl) => {
    partes.push(cl.titulo, cl.texto);
    (cl.lista || []).forEach((item, i) => partes.push(`${i + 1}. ${item}`));
    partes.push("");
  });
  partes.push(`Para constancia, se firma en ${c.fecha}.`, "");
  c.firmantes.forEach((f) => partes.push(f.rol, f.nombre, `C.C. No. ${f.documento || "______________________"}`, ""));
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
    new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: opciones.after ?? 140, ...INTERLINEADO }, children: [run(texto)] });
  const titulo = (texto) => new Paragraph({ spacing: { before: 220, after: 80, ...INTERLINEADO }, children: [run(texto, { bold: true, color: AZUL_MARCA })] });
  const itemLista = (texto) => new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 60, ...INTERLINEADO }, indent: { left: 360 }, children: [run(`•  ${texto}`)] });

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
            children: [run("Abogados & Asociados", { size: 18, color: GRIS_TEXTO, italics: true })],
          }),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 320 }, children: [run(c.encabezado, { bold: true, size: 30, color: AZUL_MARCA })] }),

          parrafo(c.intro),
          ...c.clausulas.flatMap((cl) => [titulo(cl.titulo), parrafo(cl.texto), ...(cl.lista || []).map(itemLista)]),

          parrafo(`Para constancia, se firma en ${c.fecha}.`, { after: 500 }),

          ...c.firmantes.flatMap((f) => [
            new Paragraph({ spacing: { after: 40 }, children: [run("______________________________")] }),
            new Paragraph({ spacing: { after: 4 }, children: [run(f.rol, { bold: true, size: 22, color: GRIS_TEXTO })] }),
            new Paragraph({ spacing: { after: 4 }, children: [run(f.nombre)] }),
            new Paragraph({ spacing: { after: 500 }, children: [run(`C.C. No. ${f.documento || "______________________"}${f.extra ? ` · ${f.extra}` : ""}`)] }),
          ]),

          new Paragraph({
            spacing: { before: 200 },
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

// PDF rápido para verlo o revisarlo antes de mandarlo — no lleva Tahoma
// (jsPDF solo trae fuentes base tipo Helvetica sin incrustar una fuente
// aparte), así que el Word sigue siendo la versión con el formato exacto
// que pidió el despacho; este PDF es para un vistazo rápido o para
// imprimir, con el mismo contenido palabra por palabra.
async function generarContratoServiciosPdf(datos) {
  await ensureJsPDF();
  const { jsPDF } = window.jspdf;
  const c = construirClausulasContrato(datos);
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const marginX = 56;
  const anchoUtil = pageWidth - marginX * 2;
  let y = 56;

  const salto = (alto) => {
    if (y + alto > pageHeight - 50) {
      pdf.addPage();
      y = 56;
    }
  };

  try {
    const logoSize = 40;
    pdf.addImage(LOGO_SRC, "PNG", pageWidth / 2 - logoSize / 2, y, logoSize, logoSize);
    y += logoSize + 10;
  } catch (e) {
    // el PDF se genera igual sin logo
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.setTextColor(11, 18, 32);
  pdf.text(getNombreDespacho(), pageWidth / 2, y, { align: "center" });
  y += 22;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.text(c.encabezado, pageWidth / 2, y, { align: "center", maxWidth: anchoUtil });
  y += 28;

  const parrafo = (texto, opciones = {}) => {
    pdf.setFont("helvetica", opciones.bold ? "bold" : "normal");
    pdf.setFontSize(opciones.size || 10.5);
    pdf.setTextColor(...(opciones.color || [30, 41, 59]));
    const lineas = pdf.splitTextToSize(texto, anchoUtil);
    lineas.forEach((linea) => {
      salto(15);
      pdf.text(linea, marginX, y);
      y += 14;
    });
    y += opciones.after ?? 6;
  };

  parrafo(c.intro);
  y += 4;
  c.clausulas.forEach((cl) => {
    salto(30);
    parrafo(cl.titulo, { bold: true, color: [11, 18, 32], after: 3 });
    parrafo(cl.texto);
    (cl.lista || []).forEach((item, i) => parrafo(`${i + 1}. ${item}`, { after: 3 }));
  });

  y += 10;
  parrafo(`Para constancia, se firma en ${c.fecha}.`, { after: 26 });

  c.firmantes.forEach((f) => {
    salto(70);
    pdf.setDrawColor(180, 190, 205);
    pdf.line(marginX, y, marginX + 220, y);
    y += 16;
    parrafo(f.rol, { bold: true, size: 10, color: [71, 85, 105], after: 2 });
    parrafo(f.nombre, { after: 2 });
    parrafo(`C.C. No. ${f.documento || "______________________"}${f.extra ? ` · ${f.extra}` : ""}`, { after: 22 });
  });

  const totalPaginas = pdf.internal.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    pdf.setPage(p);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(148, 163, 184);
    pdf.text(`Página ${p} de ${totalPaginas}`, pageWidth / 2, pageHeight - 24, { align: "center" });
  }

  pdf.save(`contrato_servicios_${(datos.cliente?.nombre || "cliente").replace(/[^a-z0-9]+/gi, "_").toLowerCase()}.pdf`);
}

const CLIENTE_CONTRATO_INICIAL = { nombre: "", cedula: "", correo: "", direccion: "", celular: "", gestion: "" };
const CONTRATANTE_INICIAL = { nombre: "", cedula: "", telefono: "" };
const ABOGADO2_INICIAL = { nombre: "", documento: "", tp: "" };
const PROCESO_INICIAL = { numero: "", despacho: "", etapa: "" };

export default function CalculadoraTab({ usuarioActual }) {
  // Mismos datos que usa Contabilidad para la cuenta de cobro ("Datos para
  // cuenta de cobro") — se leen aquí también porque el contrato necesita
  // el nombre/cédula/T.P. de quien firma como abogado principal, y así los
  // dos lugares quedan siempre sincronizados con un solo dato guardado.
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
  const [contratanteDistinto, setContratanteDistinto] = useState(false);
  const [contratante, setContratante] = useState(CONTRATANTE_INICIAL);
  const [proceso, setProceso] = useState(PROCESO_INICIAL);
  const [alcanceServicio, setAlcanceServicio] = useState("");
  const [abogado2, setAbogado2] = useState(ABOGADO2_INICIAL);
  const [generandoWord, setGenerandoWord] = useState(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);
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

  const datosContrato = { cliente, contratante, contratanteDistinto, proceso, alcanceServicio, abogados: abogado2, valorTotal: total, cuotas, datosResponsable };

  const reiniciar = () => {
    setPaso(1);
    setValorTotal("");
    setCostos("");
    setReferenciador(null);
    setAbogadoAsociado(null);
    setNumCuotas("1");
    setDiaPago("");
    setCliente(CLIENTE_CONTRATO_INICIAL);
    setContratanteDistinto(false);
    setContratante(CONTRATANTE_INICIAL);
    setProceso(PROCESO_INICIAL);
    setAlcanceServicio("");
    setAbogado2(ABOGADO2_INICIAL);
    setResultado(null);
  };

  const descargarWord = async () => {
    setGenerandoWord(true);
    try {
      await generarContratoServiciosDocx(datosContrato);
    } finally {
      setGenerandoWord(false);
    }
  };

  const descargarPdf = async () => {
    setGenerandoPdf(true);
    try {
      await generarContratoServiciosPdf(datosContrato);
    } finally {
      setGenerandoPdf(false);
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
      const notasExtra = [
        cliente.cedula && `Cédula: ${cliente.cedula}`,
        cliente.direccion && `Dirección: ${cliente.direccion}`,
        proceso.numero && `Proceso/radicado: ${proceso.numero}`,
        proceso.despacho && `Despacho: ${proceso.despacho}`,
        proceso.etapa && `Etapa: ${proceso.etapa}`,
      ]
        .filter(Boolean)
        .join(" · ");
      const primeraCuota = cuotas[0];
      const idCliente = uid();
      const areaProceso = AREAS_PROCESO[0];
      const clientePayload = {
        nombre: cliente.nombre,
        telefono: cliente.celular,
        email: cliente.correo,
        tipoProceso: tiposProcesoDeArea(areaProceso)[0],
        areaProceso,
        radicados: proceso.numero ? [proceso.numero] : [],
        radicado: proceso.numero || "",
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
        pagador: contratanteDistinto && contratante.nombre.trim() ? { nombre: contratante.nombre, telefono: contratante.telefono, documento: contratante.cedula } : null,
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
      const contenido = construirTextoContrato(datosContrato);
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
          <Icono tipo="calculadora" size={14} /> Para antes de que el cliente exista en Nomos: calcula cuánto te queda libre, cuándo sería cada cuota, y descarga o envía el contrato a firmar.
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

            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 700, color: COLORS.ink, margin: "0 0 8px" }}>Persona representada (el cliente)</p>
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
              <Field label="Celular (recibe el WhatsApp)">
                <input className="drx-input" style={inputStyle} value={cliente.celular} onChange={(e) => setCliente({ ...cliente, celular: e.target.value })} />
              </Field>
              <Field label="Dirección">
                <input className="drx-input" style={inputStyle} value={cliente.direccion} onChange={(e) => setCliente({ ...cliente, direccion: e.target.value })} />
              </Field>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, cursor: "pointer" }}>
              <input type="checkbox" checked={contratanteDistinto} onChange={(e) => setContratanteDistinto(e.target.checked)} />
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.inkSoft }}>Quien contrata y paga es una persona distinta a la representada (ej. un familiar)</span>
            </label>
            {contratanteDistinto && (
              <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 10 }}>
                <Field label="Nombre del contratante">
                  <input className="drx-input" style={inputStyle} value={contratante.nombre} onChange={(e) => setContratante({ ...contratante, nombre: e.target.value.toUpperCase() })} />
                </Field>
                <Field label="Cédula del contratante">
                  <input className="drx-input" style={inputStyle} value={contratante.cedula} onChange={(e) => setContratante({ ...contratante, cedula: e.target.value })} />
                </Field>
                <Field label="Teléfono del contratante (opcional)">
                  <input className="drx-input" style={inputStyle} value={contratante.telefono} onChange={(e) => setContratante({ ...contratante, telefono: e.target.value })} />
                </Field>
              </div>
            )}

            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 700, color: COLORS.ink, margin: "18px 0 8px" }}>Datos del proceso (opcional)</p>
            <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <Field label="Número de proceso / radicado">
                <input className="drx-input" style={inputStyle} value={proceso.numero} onChange={(e) => setProceso({ ...proceso, numero: e.target.value })} />
              </Field>
              <Field label="Despacho o entidad">
                <input className="drx-input" style={inputStyle} value={proceso.despacho} onChange={(e) => setProceso({ ...proceso, despacho: e.target.value })} placeholder="Ej: Fiscalía 46 Local de Medellín" />
              </Field>
              <Field label="Etapa">
                <input className="drx-input" style={inputStyle} value={proceso.etapa} onChange={(e) => setProceso({ ...proceso, etapa: e.target.value })} placeholder="Ej: Indagación" />
              </Field>
            </div>

            <div style={{ marginTop: 12 }}>
              <Field label="Gestión que se va a realizar">
                <textarea
                  className="drx-input"
                  style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
                  value={cliente.gestion}
                  onChange={(e) => setCliente({ ...cliente, gestion: e.target.value })}
                  placeholder="Ej: Trámite de divorcio de mutuo acuerdo ante notaría"
                />
              </Field>
            </div>
            <div style={{ marginTop: 12 }}>
              <Field label="Alcance del servicio (opcional — un punto por línea)">
                <textarea
                  className="drx-input"
                  style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
                  value={alcanceServicio}
                  onChange={(e) => setAlcanceServicio(e.target.value)}
                  placeholder={"Estudio y análisis jurídico de los hechos y documentos.\nAsesoría y representación jurídica en la actuación.\nSeguimiento ante el despacho o entidad."}
                />
              </Field>
            </div>

            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 700, color: COLORS.ink, margin: "18px 0 8px" }}>Segundo abogado / equipo jurídico (opcional)</p>
            <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <Field label="Nombre">
                <input className="drx-input" style={inputStyle} value={abogado2.nombre} onChange={(e) => setAbogado2({ ...abogado2, nombre: e.target.value })} />
              </Field>
              <Field label="Cédula">
                <input className="drx-input" style={inputStyle} value={abogado2.documento} onChange={(e) => setAbogado2({ ...abogado2, documento: e.target.value })} />
              </Field>
              <Field label="Tarjeta profesional (T.P.)">
                <input className="drx-input" style={inputStyle} value={abogado2.tp} onChange={(e) => setAbogado2({ ...abogado2, tp: e.target.value })} />
              </Field>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
              <button className="drx-btn-ghost" style={buttonGhost} onClick={() => setPaso(1)}>
                ← Atrás
              </button>
              <button className="drx-btn-ghost" style={buttonGhost} onClick={descargarWord} disabled={generandoWord}>
                {generandoWord ? "Generando…" : "Descargar en Word"}
              </button>
              <button className="drx-btn-ghost" style={buttonGhost} onClick={descargarPdf} disabled={generandoPdf}>
                {generandoPdf ? "Generando…" : "Descargar en PDF"}
              </button>
              <button
                className="drx-btn-primary"
                style={buttonPrimary}
                onClick={crearYEnviarAFirmar}
                disabled={creando || !cliente.nombre.trim() || !cliente.celular.trim()}
              >
                {creando ? "Creando…" : "Crear cliente y enviar a firmar por WhatsApp"}
              </button>
              <button className="drx-btn-ghost" style={buttonGhost} onClick={reiniciar}>
                Empezar de nuevo
              </button>
            </div>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: COLORS.muted, marginTop: 8 }}>
              Descargar en Word o PDF no crea nada en Nomos — es solo para revisar o ajustar el contrato. El cliente y el contrato para firma electrónica se crean con el botón verde.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
