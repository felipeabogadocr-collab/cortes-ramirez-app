// Contabilidad se movió a su propio archivo (y se carga con React.lazy desde
// App.jsx) porque era, de lejos, la pestaña más pesada del bundle único que
// tenía toda la app — separarla en su propio chunk hace que quien no abre
// Contabilidad no tenga que descargar/parsear todo este código de entrada.
import { useState, useEffect, useCallback, useMemo } from "react";
import { storageGet, storageSet, obtenerUrlReciboImagen, getNombreDespacho, obtenerClientesPorId } from "../lib/storage";
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
  enviarRecordatorioPagoGrupo,
  ensureJsPDF,
  LOGO_SRC,
  useReferenciadores,
  useAbogadosAsociados,
  useValorConRetraso,
} from "../App.jsx";

const MEDIOS_PAGO = ["Nequi", "Daviplata", "Nu", "Cuenta bancaria", "Llave"];

// Flechita de comparación contra el mes anterior en las tarjetas de resumen
// — subeEsBueno invierte los colores para Egresos, donde subir es la mala
// noticia (al contrario que Recaudado/Neto).
function BadgeCambioMes({ cambio, subeEsBueno }) {
  if (cambio === null) return null;
  const esBuena = subeEsBueno ? cambio >= 0 : cambio <= 0;
  const color = cambio === 0 ? "#6B7480" : esBuena ? "#166534" : "#B42318";
  const flecha = cambio > 0 ? "▲" : cambio < 0 ? "▼" : "●";
  return (
    <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 700, color, margin: "3px 0 0" }}>
      {flecha} {Math.abs(cambio)}% vs. mes anterior
    </p>
  );
}

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

// El ahorro sugerido se calcula sobre lo que de verdad entra a la cuenta
// (el neto, después de la retención) — no tendría sentido sugerir apartar
// plata que ni siquiera llega a estar en la mano.
function montoAhorro(pago, porcentajeAhorro) {
  const porcentaje = Number(porcentajeAhorro) || 0;
  if (porcentaje <= 0) return 0;
  return Math.round((valorNetoPago(pago) * porcentaje) / 100);
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
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
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

// Cuenta de cobro para el referenciador o el abogado asociado — a
// diferencia de la del cliente (que cobra el despacho), aquí quien cobra es
// el contacto y quien paga es el despacho. Se entrega en Word porque quien
// la recibe todavía tiene que completarla (cédula y firma) antes de
// devolverla — un PDF no se puede editar sin herramientas aparte. Se genera
// en el navegador y se descarga directo, sin guardar nada en la base de
// datos: no hay ningún archivo que "se llene" con el tiempo.
function base64ImagenALogo(dataUri) {
  const base64 = (dataUri || "").split(",")[1] || "";
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

const AZUL_MARCA = "0B1220";
const VERDE_MARCA = "166534";
const GRIS_TEXTO = "475569";

async function generarCuentaDeCobroComisionDocx({ contacto, tipoContacto, cliente, monto, porcentaje, pago, datosResponsable, numero }) {
  const { Document, Packer, Paragraph, TextRun, AlignmentType, ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, VerticalAlign } = await import("docx");

  const nombreDespacho = getNombreDespacho();
  const pagador = (datosResponsable?.nombre || nombreDespacho || "").trim();
  const documentoPagador = (datosResponsable?.documento || "").trim();
  const fechaHoy = new Date().toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
  const fechaPago = new Date(pago.fecha).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
  const conceptoBase =
    tipoContacto === "Referenciador"
      ? `comisión por la referencia del cliente ${cliente.nombre || ""}`
      : `honorarios por el apoyo en el proceso del cliente ${cliente.nombre || ""}`;

  const sinBorde = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const sinBordes = { top: sinBorde, bottom: sinBorde, left: sinBorde, right: sinBorde };
  const celda = (texto, opciones = {}) =>
    new TableCell({
      width: opciones.width || { size: 50, type: WidthType.PERCENTAGE },
      borders: sinBordes,
      shading: opciones.shading ? { type: ShadingType.CLEAR, fill: opciones.shading } : undefined,
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 90, bottom: 90, left: 140, right: 140 },
      children: [
        new Paragraph({
          children: [new TextRun({ text: texto, size: opciones.size || 20, bold: !!opciones.bold, color: opciones.color || "111827", italics: !!opciones.italics })],
        }),
      ],
    });

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

  const filaDatoPago = (etiqueta, valor) =>
    new TableRow({
      children: [celda(etiqueta, { width: { size: 34, type: WidthType.PERCENTAGE }, size: 18, color: GRIS_TEXTO }), celda(valor || "", { size: 20, bold: true })],
    });

  const doc = new Document({
    sections: [
      {
        properties: { page: { margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } },
        children: [
          ...logo,
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 4 }, children: [new TextRun({ text: nombreDespacho, bold: true, size: 24, color: AZUL_MARCA })] }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 260 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "E2E8F0", space: 10 } },
            children: [new TextRun({ text: "Cortés Ramírez Abogados", size: 16, color: GRIS_TEXTO, italics: true })],
          }),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 4 }, children: [new TextRun({ text: "CUENTA DE COBRO", bold: true, size: 32, color: AZUL_MARCA })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 320 }, children: [new TextRun({ text: `No. ${numero}`, size: 18, color: GRIS_TEXTO })] }),

          new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: `${(datosResponsable?.ciudad || "").trim() || "___________"}, ${fechaHoy}`, size: 20 })] }),

          new Paragraph({
            spacing: { after: 220 },
            alignment: AlignmentType.JUSTIFIED,
            children: [
              new TextRun({
                text: `Yo, ${contacto?.nombre || "___________________________"}, identificado(a) con cédula de ciudadanía No. ______________________, cobro a ${pagador}${
                  documentoPagador ? `, identificado(a) con C.C./NIT No. ${documentoPagador}` : ""
                } la suma de:`,
                size: 20,
              }),
            ],
          }),

          // Caja destacada con el valor — en letras (como exige la costumbre
          // mercantil colombiana para este tipo de documento) y en número,
          // para que no haya que buscar el valor dentro de un párrafo.
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    borders: {
                      top: { style: BorderStyle.SINGLE, size: 4, color: "D1FAE5" },
                      bottom: { style: BorderStyle.SINGLE, size: 4, color: "D1FAE5" },
                      left: { style: BorderStyle.SINGLE, size: 4, color: "D1FAE5" },
                      right: { style: BorderStyle.SINGLE, size: 4, color: "D1FAE5" },
                    },
                    shading: { type: ShadingType.CLEAR, fill: "F0FDF4" },
                    margins: { top: 180, bottom: 180, left: 220, right: 220 },
                    children: [
                      new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: formatoCOP(monto), bold: true, size: 34, color: VERDE_MARCA })] }),
                      new Paragraph({ children: [new TextRun({ text: `Son: ${numeroEnLetras(monto)}`, italics: true, size: 19, color: "166534" })] }),
                    ],
                  }),
                ],
              }),
            ],
          }),

          new Paragraph({
            spacing: { before: 260, after: 260 },
            alignment: AlignmentType.JUSTIFIED,
            children: [
              new TextRun({
                text: `Por concepto de: ${conceptoBase}${porcentaje ? ` (${porcentaje}% pactado)` : ""}, correspondiente al pago recibido por el despacho el ${fechaPago}.`,
                size: 20,
              }),
            ],
          }),

          new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "DATOS PARA CONSIGNAR", bold: true, size: 17, color: GRIS_TEXTO })] }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              filaDatoPago("Medio de pago", contacto?.medioPago || "___________________________"),
              filaDatoPago("Cuenta / número", contacto?.datosPago || "___________________________"),
              filaDatoPago("A nombre de", contacto?.nombre || "___________________________"),
            ],
          }),

          new Paragraph({ spacing: { before: 700, after: 40 }, children: [new TextRun({ text: "______________________________", size: 20 })] }),
          new Paragraph({ spacing: { after: 4 }, children: [new TextRun({ text: "Firma", size: 18, color: GRIS_TEXTO })] }),
          new Paragraph({ spacing: { after: 4 }, children: [new TextRun({ text: `Nombre: ${contacto?.nombre || "___________________________"}`, size: 20, bold: true })] }),
          new Paragraph({ children: [new TextRun({ text: "C.C. No. ______________________", size: 20 })] }),

          new Paragraph({
            spacing: { before: 500 },
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0", space: 8 } },
            children: [new TextRun({ text: `Documento No. ${numero} · ${nombreDespacho} · generado electrónicamente`, size: 14, color: "94A3B8", italics: true })],
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cuenta_de_cobro_${numero}_${(contacto?.nombre || tipoContacto).replace(/[^a-z0-9]+/gi, "_").toLowerCase()}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Paleta compartida entre el gráfico de barras por categoría y las tarjetas
// resumen del PDF fiscal, para que se vea igual de "de un solo sistema" que
// el resto de la app (misma idea que COLORS pero en RGB, porque jsPDF pide
// los colores como componentes r/g/b separados, no en hexadecimal).
const PALETA_PDF = [
  [16, 185, 129], // verde (igual al de ingresos en la app)
  [244, 63, 94], // rosado/rojo (egresos)
  [139, 92, 246], // violeta
  [245, 165, 36], // ámbar
  [13, 148, 136], // teal
  [59, 130, 246], // azul
  [217, 70, 239], // magenta
  [107, 114, 128], // gris, para cuando se acaban los demás colores
];

// Barra horizontal simple (etiqueta a la izquierda, barra proporcional al
// valor máximo del grupo, valor en COP a la derecha) — reemplaza las filas
// de puro texto que tenía antes el resumen fiscal, para que de un vistazo
// se note qué categoría/rubro pesa más sin tener que leer cada número.
function dibujarBarraHorizontal(pdf, { x, y, anchoTotal, etiqueta, valor, valorMax, color, formatoValor }) {
  const anchoEtiqueta = 168;
  const anchoValor = 82;
  const anchoBarra = anchoTotal - anchoEtiqueta - anchoValor;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10.5);
  pdf.setTextColor(55, 65, 81);
  const lineasEtiqueta = pdf.splitTextToSize(etiqueta, anchoEtiqueta - 6);
  pdf.text(lineasEtiqueta[0], x, y);

  const anchoRelleno = Math.max(2, Math.round((Math.abs(valor) / valorMax) * anchoBarra));
  const barX = x + anchoEtiqueta;
  pdf.setFillColor(244, 246, 249);
  pdf.roundedRect(barX, y - 9, anchoBarra, 12, 3, 3, "F");
  pdf.setFillColor(...color);
  pdf.roundedRect(barX, y - 9, anchoRelleno, 12, 3, 3, "F");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10.5);
  pdf.setTextColor(11, 18, 32);
  pdf.text(formatoValor(valor), x + anchoTotal, y, { align: "right" });
}

// Un solo PDF con el año completo (ingresos brutos, retenciones, egresos por
// categoría y la utilidad neta) — lo que un contador pide de entrada en
// época de declaración de renta, en vez de tener que armarlo a mano
// cruzando los CSV de pagos, egresos y otros ingresos por separado. Se
// presenta con tarjetas y barras (como el resto de la app), no solo texto,
// para que se entienda de un vistazo sin tener que leer fila por fila.
async function generarResumenFiscalPdf({ anio, nombreDespacho, ingresosBruto, retenidoTotal, ingresosNeto, egresoTotal, egresosPorCategoria, netoAnio }) {
  await ensureJsPDF();
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const marginX = 56;
  const contentWidth = pageWidth - marginX * 2;
  let y = 56;

  try {
    const logoSize = 44;
    pdf.addImage(LOGO_SRC, "PNG", pageWidth / 2 - logoSize / 2, y, logoSize, logoSize);
    y += logoSize + 18;
  } catch (e) {
    // nunca debe bloquear el resumen por esto
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(17);
  pdf.setTextColor(11, 18, 32);
  pdf.text(`Resumen fiscal ${anio}`, pageWidth / 2, y, { align: "center" });
  y += 19;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(100, 100, 100);
  pdf.text(nombreDespacho, pageWidth / 2, y, { align: "center" });
  y += 34;

  // Tarjetas resumen (igual que las de la pestaña Contabilidad en la app):
  // lo primero que un contador quiere ver, sin tener que sumar nada.
  const cardGap = 14;
  const cardWidth = (contentWidth - cardGap * 2) / 3;
  const cardHeight = 62;
  const tarjetas = [
    { etiqueta: "INGRESOS NETOS", valor: ingresosNeto, color: [16, 185, 129], bg: [236, 253, 245] },
    { etiqueta: "EGRESOS TOTALES", valor: egresoTotal, color: [244, 63, 94], bg: [255, 241, 242] },
    { etiqueta: "UTILIDAD NETA", valor: netoAnio, color: netoAnio >= 0 ? [13, 61, 46] : [180, 35, 24], bg: netoAnio >= 0 ? [240, 253, 244] : [254, 242, 242] },
  ];
  tarjetas.forEach((c, i) => {
    const x = marginX + i * (cardWidth + cardGap);
    pdf.setFillColor(...c.bg);
    pdf.roundedRect(x, y, cardWidth, cardHeight, 6, 6, "F");
    pdf.setFillColor(...c.color);
    pdf.rect(x, y, 5, cardHeight, "F");
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.6);
    pdf.setTextColor(100, 100, 100);
    pdf.text(c.etiqueta, x + 15, y + 20);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.setTextColor(...c.color);
    const valorTexto = pdf.splitTextToSize(formatoCOP(c.valor), cardWidth - 22);
    pdf.text(valorTexto[0], x + 15, y + 42);
  });
  y += cardHeight + 36;

  // Barras: de dónde vino la plata y para dónde se fue, en un solo golpe de
  // vista — mucho más rápido de leer que una tabla con cinco filas iguales.
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12.5);
  pdf.setTextColor(11, 18, 32);
  pdf.text("Resumen del año", marginX, y);
  y += 22;
  const filasResumen = [
    { etiqueta: "Ingresos brutos", valor: ingresosBruto, color: [16, 185, 129] },
    { etiqueta: "Retenciones aplicadas", valor: retenidoTotal, color: [139, 92, 246] },
    { etiqueta: "Ingresos netos recibidos", valor: ingresosNeto, color: [5, 150, 105] },
    { etiqueta: "Egresos totales", valor: egresoTotal, color: [244, 63, 94] },
  ];
  const maxResumen = Math.max(1, ...filasResumen.map((f) => Math.abs(f.valor)));
  filasResumen.forEach((f) => {
    dibujarBarraHorizontal(pdf, { x: marginX, y, anchoTotal: contentWidth, etiqueta: f.etiqueta, valor: f.valor, valorMax: maxResumen, color: f.color, formatoValor: formatoCOP });
    y += 25;
  });

  if (egresosPorCategoria.length > 0) {
    y += 20;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12.5);
    pdf.setTextColor(11, 18, 32);
    pdf.text("Egresos por categoría", marginX, y);
    y += 22;
    const maxCategoria = Math.max(1, ...egresosPorCategoria.map(([, valor]) => Math.abs(valor)));
    egresosPorCategoria.forEach(([categoria, valor], idx) => {
      if (y > pageHeight - 90) {
        pdf.addPage();
        y = 60;
      }
      dibujarBarraHorizontal(pdf, {
        x: marginX,
        y,
        anchoTotal: contentWidth,
        etiqueta: categoria,
        valor,
        valorMax: maxCategoria,
        color: PALETA_PDF[idx % PALETA_PDF.length],
        formatoValor: formatoCOP,
      });
      y += 25;
    });
  }

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(148, 163, 184);
  const pie = `Generado el ${new Date().toLocaleDateString("es-CO", { dateStyle: "long" })} a partir de lo registrado en Nomos — sin validez tributaria oficial, verifícalo con tu contador.`;
  const lineasPie = pdf.splitTextToSize(pie, contentWidth);
  pdf.text(lineasPie, pageWidth / 2, pageHeight - 34, { align: "center" });

  pdf.save(`resumen_fiscal_${anio}.pdf`);
}

function PanelDatosCuentaCobro({ datos, onGuardar }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState(datos?.nombre || "");
  const [documento, setDocumento] = useState(datos?.documento || "");
  const [ciudad, setCiudad] = useState(datos?.ciudad || "");
  const [tp, setTp] = useState(datos?.tp || "");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setNombre(datos?.nombre || "");
    setDocumento(datos?.documento || "");
    setCiudad(datos?.ciudad || "");
    setTp(datos?.tp || "");
  }, [datos]);

  const guardar = async () => {
    setGuardando(true);
    await onGuardar({ nombre: nombre.trim(), documento: documento.trim(), ciudad: ciudad.trim(), tp: tp.trim() });
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
          <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Ciudad (opcional)">
              <input className="drx-input" style={inputStyle} value={ciudad} onChange={(e) => setCiudad(e.target.value)} placeholder="Ej: Bogotá D.C." />
            </Field>
            <Field label="Tarjeta profesional / T.P. (opcional)">
              <input className="drx-input" style={inputStyle} value={tp} onChange={(e) => setTp(e.target.value)} placeholder="Ej: 443.425 del H. Consejo Superior de la Judicatura" />
            </Field>
          </div>
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

function PanelMetaRecaudo({ meta, onGuardar }) {
  const [abierto, setAbierto] = useState(false);
  const [valor, setValor] = useState(meta?.valor ? String(meta.valor) : "");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setValor(meta?.valor ? String(meta.valor) : "");
  }, [meta]);

  const guardar = async () => {
    setGuardando(true);
    await onGuardar({ valor: Number(valor) || 0 });
    setGuardando(false);
    setAbierto(false);
  };

  const activo = Number(meta?.valor) > 0;

  return (
    <Card style={{ marginBottom: 20 }}>
      <button
        onClick={() => setAbierto((a) => !a)}
        style={{ background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: 0 }}
      >
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 700, color: COLORS.ink, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
          <Icono tipo="objetivo" size={14} /> Meta de recaudo mensual {activo ? "" : "(sin definir)"}
        </p>
        <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted }}>{abierto ? "Ocultar ▲" : "Editar ▼"}</span>
      </button>
      {!abierto && (
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, marginTop: 6 }}>
          {activo ? `Meta: ${formatoCOP(meta.valor)} al mes.` : "Ponte una meta de cuánto quieres recaudar al mes para ver tu progreso de un vistazo."}
        </p>
      )}
      {abierto && (
        <div style={{ marginTop: 14 }}>
          <Field label="Meta de recaudo al mes (opcional)">
            <CampoDinero style={{ ...inputStyle, maxWidth: 260 }} value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ej: 8.000.000" />
          </Field>
          <button className="drx-btn-primary" style={{ ...buttonPrimary, marginTop: 12 }} onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar meta"}
          </button>
        </div>
      )}
    </Card>
  );
}

function PanelDatosLimpios({ fecha, onGuardar }) {
  const [abierto, setAbierto] = useState(false);
  const [valor, setValor] = useState(fecha || "");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setValor(fecha || "");
  }, [fecha]);

  const guardar = async () => {
    setGuardando(true);
    await onGuardar(valor || null);
    setGuardando(false);
    setAbierto(false);
  };

  const activo = !!fecha;

  return (
    <Card style={{ marginBottom: 20 }}>
      <button
        onClick={() => setAbierto((a) => !a)}
        style={{ background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: 0 }}
      >
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 700, color: COLORS.ink, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
          <Icono tipo="check" size={14} /> Contabilidad clasificada cliente por cliente desde {activo ? "" : "(sin definir)"}
        </p>
        <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted }}>{abierto ? "Ocultar ▲" : "Editar ▼"}</span>
      </button>
      {!abierto && (
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, marginTop: 6 }}>
          {activo
            ? `Desde el ${new Date(`${fecha}T12:00:00`).toLocaleDateString("es-CO", { dateStyle: "long" })} — antes de esa fecha, el análisis financiero no marca alertas de "plata duplicada" (ya sabes que los meses de atrás quedaron cargados en bloque, no cliente por cliente).`
            : "Si cargaste meses atrás en bloque (un solo abono/egreso total, sin clasificar cliente por cliente) mientras te ponías al día, pon aquí desde cuándo sí quedó todo bien clasificado — así el análisis financiero no te marca esos meses viejos como sospechosos."}
        </p>
      )}
      {abierto && (
        <div style={{ marginTop: 14 }}>
          <Field label="Clasificado cliente por cliente desde (opcional)">
            <input type="date" className="drx-input" style={{ ...inputStyle, maxWidth: 200 }} value={valor} onChange={(e) => setValor(e.target.value)} />
          </Field>
          <button className="drx-btn-primary" style={{ ...buttonPrimary, marginTop: 12 }} onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      )}
    </Card>
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

// Idea tipo "Profit First": de cada pago que entra, separar de una vez un
// % para ahorro (impuestos, imprevistos, colchón) en vez de gastarlo todo y
// ver qué queda al final. El % se define una sola vez aquí y de ahí en
// adelante se calcula solo en cada recibo — nadie tiene que hacer la cuenta
// a mano ni entender nada técnico, solo ver el número.
function PanelAhorro({ ahorro, onGuardar }) {
  const [abierto, setAbierto] = useState(false);
  const [porcentaje, setPorcentaje] = useState(ahorro?.porcentaje ? String(ahorro.porcentaje) : "");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setPorcentaje(ahorro?.porcentaje ? String(ahorro.porcentaje) : "");
  }, [ahorro]);

  const guardar = async () => {
    setGuardando(true);
    await onGuardar({ porcentaje: Math.max(0, Math.min(100, Number(porcentaje) || 0)) });
    setGuardando(false);
    setAbierto(false);
  };

  const activo = Number(ahorro?.porcentaje) > 0;

  return (
    <Card style={{ marginBottom: 20 }}>
      <button
        onClick={() => setAbierto((a) => !a)}
        style={{ background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: 0 }}
      >
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 700, color: COLORS.ink, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
          <Icono tipo="objetivo" size={14} /> Ahorro de cada pago {activo ? "" : "(sin definir)"}
        </p>
        <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted }}>{abierto ? "Ocultar ▲" : "Editar ▼"}</span>
      </button>
      {!abierto && (
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, marginTop: 6 }}>
          {activo
            ? `Separas el ${ahorro.porcentaje}% de lo que te entra en cada pago.`
            : "Define qué % de cada pago que te entra deberías apartar para ahorro (imprevistos, impuestos, colchón) — se calcula solo en cada recibo."}
        </p>
      )}
      {abierto && (
        <div style={{ marginTop: 14 }}>
          <Field label="Porcentaje a ahorrar de cada pago (opcional)">
            <input
              type="number"
              className="drx-input"
              style={{ ...inputStyle, maxWidth: 160 }}
              value={porcentaje}
              onChange={(e) => setPorcentaje(e.target.value)}
              placeholder="Ej: 10"
              min="0"
              max="100"
            />
          </Field>
          <button className="drx-btn-primary" style={{ ...buttonPrimary, marginTop: 12 }} onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar porcentaje"}
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

  // Si el cliente tiene un plan de pago recurrente (frecuencia distinta de
  // "Pago único"/"Otro"), la próxima fecha se calcula sola al registrar el
  // pago (ver registrarPago) — sin mostrar esto, quien llena el formulario
  // no tenía cómo saber que eso iba a pasar, y terminaba llenando la fecha
  // a mano cada vez "por si acaso".
  const frecuenciaRecurrente = cliente.planPago?.frecuencia && cliente.planPago.frecuencia !== "Pago único" && cliente.planPago.frecuencia !== "Otro" ? cliente.planPago.frecuencia : null;
  const proximaFechaAutomatica = frecuenciaRecurrente && fechaPago ? calcularProximaFechaPorFrecuencia(fechaPago, frecuenciaRecurrente) : null;

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
      {!fechaProximoPago && (
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: proximaFechaAutomatica ? "#166534" : COLORS.muted, marginTop: 8 }}>
          {proximaFechaAutomatica ? (
            <>
              <Icono tipo="check" size={11} style={{ marginRight: 4, verticalAlign: -1 }} />
              No hace falta que la llenes: como el plan de pago de {cliente.nombre} es <strong>{frecuenciaRecurrente}</strong>, el próximo pago va a quedar programado solo para el{" "}
              <strong>{new Date(`${proximaFechaAutomatica}T12:00:00`).toLocaleDateString("es-CO", { dateStyle: "long" })}</strong>.
            </>
          ) : (
            <>
              Este cliente no tiene un plan de pago con frecuencia definida, así que la próxima fecha no se calcula sola — indícala aquí si aplica, o
              ve a Clientes → Editar y configúrale un plan de pago recurrente para que se calcule automáticamente la próxima vez.
            </>
          )}
        </p>
      )}
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

function ReciboCard({ cliente, pago, onEditar, onEliminar, datosResponsable, porcentajeAhorro, referenciadores, abogadosAsociados }) {
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
  // Si alguien más paga las cuentas de este cliente (cliente.pagador), la
  // confirmación y el recibo le llegan a esa persona, no al cliente.
  const pagadorTiene = !!cliente.pagador?.telefono;
  const nombreDestinatario = pagadorTiene ? cliente.pagador.nombre : cliente.nombre;
  const numero = numeroWhatsappCliente(pagadorTiene ? cliente.pagador.telefono : cliente.telefono);
  const urlRecibo = useUrlRecibo(pago.reciboImagen);

  const enviarPorWhatsapp = () => {
    // Sin emojis a propósito: no se ven bien en todos los WhatsApp/
    // dispositivos, y un mensaje de despacho de abogados se lee más serio
    // en texto plano.
    const refCliente = pagadorTiene ? ` de ${cliente.nombre}` : "";
    const mensaje = `*${getNombreDespacho()}*\n\nHola ${nombreDestinatario || ""}, confirmamos la recepción del pago${refCliente}:\n\nMedio: ${pago.medioPago}\nValor: ${formatoCOP(pago.valor)}\nFecha: ${new Date(pago.fecha).toLocaleDateString("es-CO", { dateStyle: "long" })}${pago.concepto ? `\nConcepto: ${pago.concepto}` : ""}\n\nEn un momento te comparto el recibo por este mismo medio. ¡Gracias por tu confianza!`;
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

  // Cascada igual a la del cuadro "Reparto de este pago" de abajo: primero
  // se calcula la comisión del referenciador sobre el neto completo, y solo
  // después el abogado asociado recibe su % sobre lo que queda.
  const netoPagoComisiones = valorNetoPago(pago);
  const referenciadorCliente = cliente.referenciador?.id ? (referenciadores || []).find((r) => r.id === cliente.referenciador.id) : null;
  const abogadoAsociadoCliente = cliente.abogadoAsociado?.id ? (abogadosAsociados || []).find((a) => a.id === cliente.abogadoAsociado.id) : null;
  const comisionReferenciadorPago = Number(cliente.referenciador?.porcentaje) > 0 ? Math.round((netoPagoComisiones * Number(cliente.referenciador.porcentaje)) / 100) : 0;
  const remanenteTrasReferenciadorPago = netoPagoComisiones - comisionReferenciadorPago;
  const honorariosAsociadoPago = Number(cliente.abogadoAsociado?.porcentaje) > 0 ? Math.round((remanenteTrasReferenciadorPago * Number(cliente.abogadoAsociado.porcentaje)) / 100) : 0;

  const [generandoCuentaComision, setGenerandoCuentaComision] = useState(null);
  const descargarCuentaDeCobroComision = async (tipoContacto) => {
    const esReferenciador = tipoContacto === "Referenciador";
    const contacto = esReferenciador ? referenciadorCliente || cliente.referenciador : abogadoAsociadoCliente || cliente.abogadoAsociado;
    const monto = esReferenciador ? comisionReferenciadorPago : honorariosAsociadoPago;
    const porcentaje = esReferenciador ? cliente.referenciador?.porcentaje : cliente.abogadoAsociado?.porcentaje;
    if (!contacto || monto <= 0) return;
    setGenerandoCuentaComision(tipoContacto);
    try {
      const numeroConsecutivo = await siguienteConsecutivoCuentaCobro();
      await generarCuentaDeCobroComisionDocx({ contacto, tipoContacto, cliente, monto, porcentaje, pago, datosResponsable, numero: numeroConsecutivo });
    } catch (e) {
      console.error("No se pudo generar la cuenta de cobro:", e);
    }
    setGenerandoCuentaComision(null);
  };

  const enviarMensajeCuentaCobroComision = (tipoContacto) => {
    const esReferenciador = tipoContacto === "Referenciador";
    const contacto = esReferenciador ? referenciadorCliente || cliente.referenciador : abogadoAsociadoCliente || cliente.abogadoAsociado;
    const monto = esReferenciador ? comisionReferenciadorPago : honorariosAsociadoPago;
    if (!contacto?.telefono) return;
    const numero = numeroWhatsappCliente(contacto.telefono);
    const concepto = esReferenciador ? `tu comisión por la referencia del cliente ${cliente.nombre}` : `tus honorarios por el apoyo en el proceso del cliente ${cliente.nombre}`;
    const mensaje = `*${getNombreDespacho()}*\n\nHola ${contacto.nombre}, te comparto la cuenta de cobro de ${concepto}: ${formatoCOP(monto)}.\n\nAdjunto va el documento en Word — complétalo con tu cédula y firma, y devuélvemelo por este mismo medio. Cuando lo tenga, te paso el enlace para firmarlo electrónicamente.\n\nGracias.`;
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`, "_blank");
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
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 700, color: "#166534", background: "#DCFCE7", display: "inline-block", padding: "2px 8px", borderRadius: 20, margin: "0 0 4px" }}>
          + ABONO
        </p>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: "#166534", margin: 0 }}>
          + {formatoCOP(pago.valor)} · {pago.medioPago}
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
        {porcentajeAhorro > 0 && (
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: "#0D9488", background: "#F0FDFA", display: "inline-block", padding: "3px 9px", borderRadius: 20, margin: "0 0 8px", marginLeft: Number(pago.retencionPorcentaje) > 0 ? 6 : 0 }}>
            💰 Aparta para ahorro ({porcentajeAhorro}%): {formatoCOP(montoAhorro(pago, porcentajeAhorro))}
          </p>
        )}
        {(Number(cliente.referenciador?.porcentaje) > 0 || Number(cliente.abogadoAsociado?.porcentaje) > 0) &&
          (() => {
            // El reparto se calcula sobre lo que el despacho realmente
            // recibió (ya descontada la retención), no sobre el valor bruto
            // del pago — es información interna, para saber cuánto queda de
            // utilidad real, y nunca aparece en el recibo ni en la cuenta de
            // cobro que ve el cliente.
            //
            // No son dos porcentajes independientes sobre el mismo total:
            // primero se le paga al referenciador su comisión sobre el neto
            // completo, y SOLO DESPUÉS el abogado asociado recibe su
            // porcentaje sobre lo que queda (no sobre el neto original) —
            // en cascada, como se reparte de verdad. Los montos ya vienen
            // calculados arriba (comisionReferenciadorPago/honorariosAsociadoPago)
            // para que los botones de cuenta de cobro usen exactamente lo mismo.
            const utilidadDespacho = remanenteTrasReferenciadorPago - honorariosAsociadoPago;
            return (
              <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "8px 11px", margin: "0 0 8px", fontFamily: "Inter, sans-serif", fontSize: 11.5, color: "#92400E" }}>
                <p style={{ fontWeight: 700, margin: "0 0 3px" }}>Reparto de este pago (interno, no va en el recibo)</p>
                {comisionReferenciadorPago > 0 && (
                  <>
                    <p style={{ margin: "1px 0" }}>
                      Comisión {cliente.referenciador.nombre} ({cliente.referenciador.porcentaje}%): {formatoCOP(comisionReferenciadorPago)}
                    </p>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "4px 0 6px" }}>
                      <button
                        className="drx-btn-ghost"
                        style={{ ...buttonGhost, padding: "3px 9px", fontSize: 10.5, background: "#FFFFFF" }}
                        onClick={() => descargarCuentaDeCobroComision("Referenciador")}
                        disabled={generandoCuentaComision === "Referenciador"}
                      >
                        {generandoCuentaComision === "Referenciador" ? "Generando..." : "Cuenta de cobro (Word)"}
                      </button>
                      {(referenciadorCliente || cliente.referenciador)?.telefono && (
                        <button
                          className="drx-btn-ghost"
                          style={{ ...buttonGhost, padding: "3px 9px", fontSize: 10.5, background: "#FFFFFF" }}
                          onClick={() => enviarMensajeCuentaCobroComision("Referenciador")}
                        >
                          Enviar mensaje por WhatsApp ↗
                        </button>
                      )}
                    </div>
                  </>
                )}
                {honorariosAsociadoPago > 0 && (
                  <>
                    <p style={{ margin: "1px 0" }}>
                      Honorarios {cliente.abogadoAsociado.nombre} ({cliente.abogadoAsociado.porcentaje}% de lo que queda tras la comisión): {formatoCOP(honorariosAsociadoPago)}
                    </p>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "4px 0 6px" }}>
                      <button
                        className="drx-btn-ghost"
                        style={{ ...buttonGhost, padding: "3px 9px", fontSize: 10.5, background: "#FFFFFF" }}
                        onClick={() => descargarCuentaDeCobroComision("Abogado asociado")}
                        disabled={generandoCuentaComision === "Abogado asociado"}
                      >
                        {generandoCuentaComision === "Abogado asociado" ? "Generando..." : "Cuenta de cobro (Word)"}
                      </button>
                      {(abogadoAsociadoCliente || cliente.abogadoAsociado)?.telefono && (
                        <button
                          className="drx-btn-ghost"
                          style={{ ...buttonGhost, padding: "3px 9px", fontSize: 10.5, background: "#FFFFFF" }}
                          onClick={() => enviarMensajeCuentaCobroComision("Abogado asociado")}
                        >
                          Enviar mensaje por WhatsApp ↗
                        </button>
                      )}
                    </div>
                  </>
                )}
                <p style={{ margin: "3px 0 0", fontWeight: 700 }}>Utilidad neta del despacho: {formatoCOP(utilidadDespacho)}</p>
              </div>
            );
          })()}
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
  const [esInversion, setEsInversion] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const registrar = async () => {
    if (!concepto.trim() || !valor || Number(valor) <= 0) return;
    setGuardando(true);
    await onRegistrar({ concepto, categoria, valor, fecha, esInversion });
    setConcepto("");
    setValor("");
    setFecha(hoyStr);
    setEsInversion(false);
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
      <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.inkSoft, cursor: "pointer" }}>
        <input type="checkbox" checked={esInversion} onChange={(e) => setEsInversion(e.target.checked)} />
        Es una inversión (equipo, software, capacitación...) — quiero ver cuándo se recupera
      </label>
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

function EgresoCard({ egreso, onEditar, onEliminar, clientesDisponibles }) {
  const [editando, setEditando] = useState(false);
  const [concepto, setConcepto] = useState(egreso.concepto);
  const [categoria, setCategoria] = useState(egreso.categoria);
  const [valor, setValor] = useState(String(egreso.valor ?? ""));
  const [fecha, setFecha] = useState(new Date(egreso.fecha).toISOString().slice(0, 10));
  const [clienteId, setClienteId] = useState(egreso.clienteId || "");
  const [esInversion, setEsInversion] = useState(!!egreso.esInversion);
  const [guardando, setGuardando] = useState(false);

  const guardarEdicion = async () => {
    if (!concepto.trim() || !valor || Number(valor) <= 0) return;
    setGuardando(true);
    await onEditar({ concepto: concepto.trim(), categoria, valor: Number(valor), fecha: new Date(`${fecha}T12:00:00`).toISOString(), clienteId: clienteId || null, esInversion });
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
        {clientesDisponibles && (
          <div style={{ marginBottom: 12 }}>
            <Field label="Cliente asociado (opcional) — se ve también en su tarjeta">
              <select className="drx-input" style={inputStyle} value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                <option value="">Ninguno</option>
                {clientesDisponibles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.inkSoft, cursor: "pointer" }}>
          <input type="checkbox" checked={esInversion} onChange={(e) => setEsInversion(e.target.checked)} />
          Es una inversión — quiero ver cuándo se recupera
        </label>
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
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 700, color: "#B42318", background: "#FEF2F2", display: "inline-block", padding: "2px 8px", borderRadius: 20, margin: "0 0 4px" }}>
          − EGRESO
        </p>
        {egreso.esInversion && (
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 700, color: "#0D9488", background: "#F0FDFA", display: "inline-block", padding: "2px 8px", borderRadius: 20, margin: "0 0 4px 6px" }}>
            📈 Inversión
          </p>
        )}
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: "#B42318", margin: 0 }}>
          − {formatoCOP(egreso.valor)} · {egreso.concepto}
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
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 700, color: "#166534", background: "#DCFCE7", display: "inline-block", padding: "2px 8px", borderRadius: 20, margin: "0 0 4px" }}>
          + INGRESO
        </p>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: "#166534", margin: 0 }}>
          + {formatoCOP(ingreso.valor)} · {ingreso.concepto}
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

export default function ContabilidadTab({ usuarioActual, clienteInicialPago, onClienteInicialPagoConsumido }) {
  const { ids, cargado } = useIndex("indice-clientes", false);
  const [clientes, setClientes] = useState({});
  // Lista simple {id, nombre} para el selector "cliente asociado" de un
  // egreso — se arma una sola vez por cambio de datos en vez de recorrer
  // ids/clientes en cada EgresoCard.
  const clientesParaSelector = useMemo(
    () => [...ids].map((id) => ({ id, nombre: clientes[id]?.nombre })).filter((c) => c.nombre).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [ids, clientes]
  );
  const [formAbiertoId, setFormAbiertoId] = useState(null);
  // Un egreso no tiene nada que ver con un cliente puntual (es plata que
  // sale del despacho en general) — este atajo solo evita tener que subir
  // hasta la barra de arriba mientras se está revisando la lista de un
  // cliente en particular; abre exactamente el mismo formulario que "+
  // Registrar egreso" de arriba.
  const [egresoAbiertoId, setEgresoAbiertoId] = useState(null);
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
  // Atajo desde la tarjeta de un cliente en Clientes ("Registrar pago") —
  // llega ya con el cliente elegido, así que se abre el formulario de pago
  // directo en vez de dejar que lo busquen otra vez en el desplegable.
  useEffect(() => {
    if (clienteInicialPago && clientes[clienteInicialPago]) {
      setPagoRapidoClienteId(clienteInicialPago);
      setModoRegistro("pago");
      onClienteInicialPagoConsumido?.();
    }
  }, [clienteInicialPago, clientes, onClienteInicialPagoConsumido]);
  const [filtroEgreso, setFiltroEgreso] = useState("");
  const [categoriaFiltroEgreso, setCategoriaFiltroEgreso] = useState("Todas");
  const [filtroOtroIngreso, setFiltroOtroIngreso] = useState("");
  const [categoriaFiltroOtroIngreso, setCategoriaFiltroOtroIngreso] = useState("Todas");
  const { egresos, crear: crearEgreso, editar: editarEgreso, eliminar: eliminarEgresoBase, recategorizarMasivo } = useEgresos();
  const { ingresos: otrosIngresos, crear: crearOtroIngreso, editar: editarOtroIngreso, eliminar: eliminarOtroIngresoBase } = useOtrosIngresos();
  const { contactos: referenciadores } = useReferenciadores();
  const { contactos: abogadosAsociados } = useAbogadosAsociados();
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

  const [metaRecaudo, setMetaRecaudo] = useState(null);
  useEffect(() => {
    (async () => {
      const raw = await storageGet("meta-recaudo-mensual", false);
      setMetaRecaudo(raw ? JSON.parse(raw) : {});
    })();
  }, []);
  const guardarMetaRecaudo = async (datos) => {
    await storageSet("meta-recaudo-mensual", JSON.stringify(datos), false);
    setMetaRecaudo(datos);
  };

  const [fechaDatosLimpios, setFechaDatosLimpios] = useState(null);
  useEffect(() => {
    (async () => {
      const raw = await storageGet("fecha-datos-limpios", false);
      setFechaDatosLimpios(raw || null);
    })();
  }, []);
  const guardarFechaDatosLimpios = async (fecha) => {
    await storageSet("fecha-datos-limpios", fecha || "", false);
    setFechaDatosLimpios(fecha || null);
  };

  const [ahorro, setAhorro] = useState(null);
  useEffect(() => {
    (async () => {
      const raw = await storageGet("porcentaje-ahorro", false);
      setAhorro(raw ? JSON.parse(raw) : {});
    })();
  }, []);
  const guardarAhorro = async (datos) => {
    await storageSet("porcentaje-ahorro", JSON.stringify(datos), false);
    setAhorro(datos);
  };
  const porcentajeAhorro = Number(ahorro?.porcentaje) || 0;

  const [anioFiscal, setAnioFiscal] = useState(new Date().getFullYear());
  const [generandoFiscal, setGenerandoFiscal] = useState(false);
  const [errorFiscal, setErrorFiscal] = useState("");
  const aniosDisponibles = useMemo(() => {
    const set = new Set([new Date().getFullYear()]);
    ids.forEach((id) => (clientes[id]?.pagos || []).forEach((p) => set.add(new Date(p.fecha).getFullYear())));
    otrosIngresos.forEach((i) => set.add(new Date(i.fecha).getFullYear()));
    egresos.forEach((e) => set.add(new Date(e.fecha).getFullYear()));
    return [...set].sort((a, b) => b - a);
  }, [ids, clientes, otrosIngresos, egresos]);

  const generarResumenFiscal = async () => {
    setGenerandoFiscal(true);
    setErrorFiscal("");
    try {
      let ingresosBruto = 0;
      let retenidoTotalAnio = 0;
      ids.forEach((id) => {
        (clientes[id]?.pagos || []).forEach((p) => {
          if (new Date(p.fecha).getFullYear() === anioFiscal) {
            ingresosBruto += Number(p.valor) || 0;
            retenidoTotalAnio += valorRetenido(p);
          }
        });
      });
      otrosIngresos.forEach((i) => {
        if (new Date(i.fecha).getFullYear() === anioFiscal) ingresosBruto += Number(i.valor) || 0;
      });
      const porCategoriaAnio = {};
      let egresoTotalAnio = 0;
      egresos.forEach((e) => {
        if (new Date(e.fecha).getFullYear() === anioFiscal) {
          const valor = Number(e.valor) || 0;
          egresoTotalAnio += valor;
          porCategoriaAnio[e.categoria] = (porCategoriaAnio[e.categoria] || 0) + valor;
        }
      });
      await generarResumenFiscalPdf({
        anio: anioFiscal,
        nombreDespacho: getNombreDespacho(),
        ingresosBruto,
        retenidoTotal: retenidoTotalAnio,
        ingresosNeto: ingresosBruto - retenidoTotalAnio,
        egresoTotal: egresoTotalAnio,
        egresosPorCategoria: Object.entries(porCategoriaAnio).sort((a, b) => b[1] - a[1]),
        netoAnio: ingresosBruto - egresoTotalAnio,
      });
    } catch (e) {
      console.error("No se pudo generar el resumen fiscal:", e);
      // Sin esto, si algo falla generando el PDF, el botón simplemente
      // vuelve a "Descargar PDF" sin decir nada — parece que no pasó nada,
      // cuando en realidad sí falló algo puntual. Se muestra el mensaje real
      // del error (no uno genérico) para no tener que adivinar la causa.
      setErrorFiscal(`No se pudo generar el PDF: ${e?.message || "error desconocido"}. Inténtalo de nuevo o avísale a soporte con este mensaje.`);
    }
    setGenerandoFiscal(false);
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

  // "Otro" era la categoría más parecida a "no sé qué es todavía" antes de
  // que existiera "Pendiente por clasificar" — esto deja pasar de una a la
  // otra los egresos que ya quedaron en "Otro", en vez de tener que
  // editarlos uno por uno a mano.
  const egresosOtro = egresos.filter((e) => e.categoria === "Otro");
  const recategorizarOtroAPendientes = async () => {
    const ok = await confirmar(
      `Esto va a cambiar la categoría de los ${egresosOtro.length} egreso${egresosOtro.length !== 1 ? "s" : ""} que hoy están en "Otro" (${formatoCOP(egresosOtro.reduce((sum, e) => sum + (Number(e.valor) || 0), 0))} en total) a "Pendiente por clasificar". No se puede deshacer con un clic — pero cada uno se puede volver a editar después a mano. ¿Continuar?`
    );
    if (!ok) return;
    await recategorizarMasivo("Otro", "Pendiente por clasificar");
    registrarAuditoria(usuarioActual, "recategorizar_egresos", "egreso", "masivo", { de: "Otro", a: "Pendiente por clasificar", cantidad: egresosOtro.length });
  };

  const irASeccion = (idSeccion, opciones = {}) => {
    if (opciones.soloPendientes) setSoloPendientes(true);
    setTimeout(() => {
      document.getElementById(idSeccion)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
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
    const entries = await obtenerClientesPorId(ids);
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
    .filter(({ c }) => c?.proximoPago?.fecha && !c.procesoPausado)
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
  const mesAnteriorRef = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  const esMesActual = (fecha) => fecha.getFullYear() === hoy.getFullYear() && fecha.getMonth() === hoy.getMonth();
  const esMesAnterior = (fecha) => fecha.getFullYear() === mesAnteriorRef.getFullYear() && fecha.getMonth() === mesAnteriorRef.getMonth();

  let recaudadoTotal = 0;
  let recaudadoMes = 0;
  let recaudadoMesAnterior = 0;
  let retenidoMes = 0;
  let retenidoTotal = 0;
  let ahorroSugeridoMes = 0;
  let ahorroSugeridoTotal = 0;
  const porMedioPagoMes = {};
  const totalPorClienteHistorico = {};
  ids.forEach((id) => {
    (clientes[id]?.pagos || []).forEach((p) => {
      const valor = Number(p.valor) || 0;
      recaudadoTotal += valor;
      retenidoTotal += valorRetenido(p);
      ahorroSugeridoTotal += montoAhorro(p, porcentajeAhorro);
      totalPorClienteHistorico[id] = (totalPorClienteHistorico[id] || 0) + valor;
      const fechaPago = new Date(p.fecha);
      if (esMesActual(fechaPago)) {
        recaudadoMes += valor;
        retenidoMes += valorRetenido(p);
        ahorroSugeridoMes += montoAhorro(p, porcentajeAhorro);
        const medio = p.medioPago || "Otro";
        porMedioPagoMes[medio] = (porMedioPagoMes[medio] || 0) + valor;
      } else if (esMesAnterior(fechaPago)) {
        recaudadoMesAnterior += valor;
      }
    });
  });
  const mediosPagoOrdenados = Object.entries(porMedioPagoMes).sort((a, b) => b[1] - a[1]);
  // Ranking de quién más ha aportado en la vida del despacho — útil para
  // saber a quién priorizar en el servicio, y para el análisis financiero
  // de Resumen (de dónde viene realmente la plata).
  const topClientesHistorico = Object.entries(totalPorClienteHistorico)
    .filter(([id]) => !clientes[id]?.esClienteAdministrativo)
    .map(([id, total]) => ({ id, nombre: clientes[id]?.nombre || "—", total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // Salidas de dinero (arriendo, nómina, servicios...) — sin esto, la
  // pantalla solo mostraba lo que entraba y nunca lo que salía, así que no
  // servía para saber si el despacho realmente está ganando plata o no.
  let egresoTotal = 0;
  let egresoMes = 0;
  let egresoMesAnterior = 0;
  const porCategoriaEgresoTotal = {};
  egresos.forEach((e) => {
    const valor = Number(e.valor) || 0;
    egresoTotal += valor;
    porCategoriaEgresoTotal[e.categoria] = (porCategoriaEgresoTotal[e.categoria] || 0) + valor;
    const fechaEgreso = new Date(e.fecha);
    if (esMesActual(fechaEgreso)) {
      egresoMes += valor;
    } else if (esMesAnterior(fechaEgreso)) {
      egresoMesAnterior += valor;
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
  let otrosIngresosMesAnterior = 0;
  otrosIngresos.forEach((i) => {
    const valor = Number(i.valor) || 0;
    otrosIngresosTotal += valor;
    const fechaIngreso = new Date(i.fecha);
    if (esMesActual(fechaIngreso)) {
      otrosIngresosMes += valor;
    } else if (esMesAnterior(fechaIngreso)) {
      otrosIngresosMesAnterior += valor;
    }
  });

  const ingresoTotalMes = recaudadoMes + otrosIngresosMes;
  const ingresoTotalMesAnterior = recaudadoMesAnterior + otrosIngresosMesAnterior;
  const ingresoTotalHistoricoTodo = recaudadoTotal + otrosIngresosTotal;
  const netoMes = ingresoTotalMes - egresoMes;
  const netoMesAnterior = ingresoTotalMesAnterior - egresoMesAnterior;
  const netoTotal = ingresoTotalHistoricoTodo - egresoTotal;

  // Comparativo contra el mes anterior — null cuando el mes anterior no
  // tuvo movimiento (dividir por cero no dice nada útil, así que la
  // tarjeta simplemente no muestra la flecha en ese caso).
  const cambioPct = (actual, anterior) => (anterior > 0 ? Math.round(((actual - anterior) / anterior) * 100) : null);
  const cambioRecaudadoMes = cambioPct(ingresoTotalMes, ingresoTotalMesAnterior);
  const cambioEgresoMes = cambioPct(egresoMes, egresoMesAnterior);
  const cambioNetoMes = cambioPct(netoMes, netoMesAnterior);

  // Meta de recaudo mensual (distinta del presupuesto de gastos): progreso
  // de lo que ya entró este mes contra lo que el usuario se propuso.
  const metaRecaudoValor = Number(metaRecaudo?.valor) || 0;
  const porcentajeMetaRecaudo = metaRecaudoValor > 0 ? Math.min(999, Math.round((ingresoTotalMes / metaRecaudoValor) * 100)) : 0;

  // Flujo de caja proyectado: suma del próximo pago esperado de cada
  // cliente activo con saldo, agrupado por mes — usa el mismo dato que ya
  // alimenta "Próximos pagos por vencer", así que no hay doble
  // contabilidad ni una fuente de verdad distinta.
  const hoyInicioDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const mesesProyeccion = [0, 1, 2].map((i) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1);
    return { clave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, etiqueta: d.toLocaleDateString("es-CO", { month: "long", year: "numeric" }), total: 0 };
  });
  ids.forEach((id) => {
    const c = clientes[id];
    if (!c || c.procesoPausado || !c.proximoPago?.fecha || !c.proximoPago?.valorEsperado) return;
    const fecha = new Date(c.proximoPago.fecha);
    if (fecha < hoyInicioDia) return; // ya vencido: no es proyección futura, es cartera atrasada
    const clave = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
    const bucket = mesesProyeccion.find((m) => m.clave === clave);
    if (bucket) bucket.total += Number(c.proximoPago.valorEsperado) || 0;
  });
  const totalProyeccion3Meses = mesesProyeccion.reduce((s, m) => s + m.total, 0);

  // Retorno de inversión: no hay forma de saber qué ingresos exactos vino
  // POR CAUSA de una inversión puntual (comprar un software no dice "este
  // cliente llegó gracias a esto") — lo más honesto que se puede calcular
  // es cuánta utilidad neta real ha dejado el despacho completo desde la
  // fecha de la inversión (todo lo que entró menos todo lo que salió, esa
  // misma inversión incluida), y a qué ritmo, para estimar cuándo se
  // recupera si el despacho sigue a ese paso. Es una aproximación de flujo
  // de caja, no una atribución exacta — se explica así en la pantalla.
  // Una inversión pagada en cuotas queda como varios egresos separados
  // (uno por cuota) — se agrupan por concepto (ignorando un sufijo tipo
  // "- cuota 2" si lo tiene) para tratarlas como una sola inversión: el
  // monto es lo pagado hasta ahora en total, y la fecha de arranque es la
  // de la primera cuota, no la última.
  const normalizarConceptoInversion = (concepto) =>
    (concepto || "")
      .trim()
      .toLowerCase()
      .replace(/\s*-?\s*cuota\s*\d+\s*$/i, "")
      .trim();
  const gruposInversion = {};
  egresos
    .filter((e) => e.esInversion)
    .forEach((e) => {
      const clave = normalizarConceptoInversion(e.concepto) || e.concepto;
      if (!gruposInversion[clave]) gruposInversion[clave] = { concepto: e.concepto, monto: 0, fecha: e.fecha };
      gruposInversion[clave].monto += Number(e.valor) || 0;
      if (new Date(e.fecha) < new Date(gruposInversion[clave].fecha)) {
        gruposInversion[clave].fecha = e.fecha;
        gruposInversion[clave].concepto = e.concepto;
      }
    });
  const estadoInversiones = Object.values(gruposInversion).map((inv) => {
    const fechaInversion = new Date(inv.fecha);
    let ingresoDesde = 0;
    let egresoDesde = 0;
    ids.forEach((id) => {
      (clientes[id]?.pagos || []).forEach((p) => {
        if (new Date(p.fecha) >= fechaInversion) ingresoDesde += Number(p.valor) || 0;
      });
    });
    otrosIngresos.forEach((i) => {
      if (new Date(i.fecha) >= fechaInversion) ingresoDesde += Number(i.valor) || 0;
    });
    egresos.forEach((e) => {
      if (new Date(e.fecha) >= fechaInversion) egresoDesde += Number(e.valor) || 0;
    });
    const utilidadDesde = ingresoDesde - egresoDesde;
    const monto = inv.monto;
    const mesesTranscurridos = Math.max((hoy - fechaInversion) / (1000 * 60 * 60 * 24 * 30.4), 0.1);
    const ritmoMensual = utilidadDesde / mesesTranscurridos;
    const porcentajeRecuperado = monto > 0 ? Math.max(0, Math.round((utilidadDesde / monto) * 100)) : 0;
    const recuperada = utilidadDesde >= monto;
    const mesesFaltantes = !recuperada && ritmoMensual > 0 ? Math.ceil((monto - utilidadDesde) / ritmoMensual) : null;
    return { inv, monto, utilidadDesde, porcentajeRecuperado, recuperada, mesesFaltantes, mesesTranscurridos };
  });

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

  const filtroEgresoConRetraso = useValorConRetraso(filtroEgreso);
  const egresosFiltrados = useMemo(
    () =>
      [...egresos]
        .filter((e) => categoriaFiltroEgreso === "Todas" || e.categoria === categoriaFiltroEgreso)
        .filter((e) => !filtroEgresoConRetraso.trim() || e.concepto.toLowerCase().includes(filtroEgresoConRetraso.trim().toLowerCase()))
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha)),
    [egresos, categoriaFiltroEgreso, filtroEgresoConRetraso]
  );

  const filtroOtroIngresoConRetraso = useValorConRetraso(filtroOtroIngreso);
  const otrosIngresosFiltrados = useMemo(
    () =>
      [...otrosIngresos]
        .filter((i) => categoriaFiltroOtroIngreso === "Todas" || i.categoria === categoriaFiltroOtroIngreso)
        .filter((i) => !filtroOtroIngresoConRetraso.trim() || i.concepto.toLowerCase().includes(filtroOtroIngresoConRetraso.trim().toLowerCase()))
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha)),
    [otrosIngresos, categoriaFiltroOtroIngreso, filtroOtroIngresoConRetraso]
  );

  // Filtrar y ordenar es O(n log n) sobre todos los clientes — sin memoizar,
  // se repetía en CADA render (incluyendo cada tecla escrita en cualquier
  // otro campo de la pantalla, no solo el filtro), lo que se sentía como
  // lentitud en despachos con muchos clientes. useMemo solo lo recalcula
  // cuando algo que realmente afecta el resultado cambió.
  const filtroConRetraso = useValorConRetraso(filtro);
  const idsFiltrados = useMemo(() => {
    const textoFiltro = filtroConRetraso.trim().toLowerCase();
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
  }, [ids, clientes, filtroConRetraso, soloPendientes, orden]);

  return (
    <div>
      <EncabezadoSeccion titulo="Contabilidad" color="#F43F5E" />

      <PanelDatosCuentaCobro datos={datosResponsable} onGuardar={guardarDatosResponsable} />
      <PanelDatosLimpios fecha={fechaDatosLimpios} onGuardar={guardarFechaDatosLimpios} />
      <PanelMetaRecaudo meta={metaRecaudo} onGuardar={guardarMetaRecaudo} />
      <PanelPresupuesto presupuesto={presupuesto} onGuardar={guardarPresupuesto} />
      <PanelAhorro ahorro={ahorro} onGuardar={guardarAhorro} />

      {metaRecaudoValor > 0 &&
        (() => {
          const colorMeta = porcentajeMetaRecaudo >= 100 ? "#10B981" : porcentajeMetaRecaudo >= 60 ? "#166534" : "#B45309";
          return (
            <Card style={{ marginBottom: 20, borderLeft: `4px solid ${colorMeta}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.ink, margin: 0 }}>Meta de recaudo del mes</p>
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 700, color: colorMeta, margin: 0 }}>
                  {formatoCOP(ingresoTotalMes)} de {formatoCOP(metaRecaudoValor)} ({porcentajeMetaRecaudo}%)
                </p>
              </div>
              <div style={{ height: 10, borderRadius: 6, background: COLORS.surfaceSoft, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(porcentajeMetaRecaudo, 100)}%`, background: colorMeta, transition: "width 0.3s ease" }} />
              </div>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: colorMeta, marginTop: 8, marginBottom: 0 }}>
                {porcentajeMetaRecaudo >= 100
                  ? `¡Meta cumplida! Vas ${formatoCOP(ingresoTotalMes - metaRecaudoValor)} por encima.`
                  : `Te faltan ${formatoCOP(metaRecaudoValor - ingresoTotalMes)} para llegar a la meta este mes.`}
              </p>
            </Card>
          );
        })()}

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
        <Card
          role="button"
          tabIndex={0}
          onClick={() => irASeccion("seccion-clientes")}
          onKeyDown={(e) => e.key === "Enter" && irASeccion("seccion-clientes")}
          style={{ borderLeft: "4px solid #10B981", background: "#F0FDF4", cursor: "pointer" }}
        >
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: "#166534", textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>
            Recaudado este mes
          </p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 800, color: "#166534", margin: "4px 0 0" }}>{formatoCOP(recaudadoMes)}</p>
          <BadgeCambioMes cambio={cambioRecaudadoMes} subeEsBueno />
        </Card>
        <Card
          role="button"
          tabIndex={0}
          onClick={() => irASeccion("seccion-egresos")}
          onKeyDown={(e) => e.key === "Enter" && irASeccion("seccion-egresos")}
          style={{ borderLeft: "4px solid #F43F5E", background: "#FEF2F2", cursor: "pointer" }}
        >
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: "#B42318", textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>
            Egresos este mes
          </p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 800, color: "#B42318", margin: "4px 0 0" }}>{formatoCOP(egresoMes)}</p>
          <BadgeCambioMes cambio={cambioEgresoMes} subeEsBueno={false} />
        </Card>
        <Card
          role="button"
          tabIndex={0}
          onClick={() => irASeccion("seccion-clientes")}
          onKeyDown={(e) => e.key === "Enter" && irASeccion("seccion-clientes")}
          style={{ borderLeft: `4px solid ${netoMes >= 0 ? "#10B981" : "#B42318"}`, background: netoMes >= 0 ? COLORS.accentSoft : "#FEF2F2", cursor: "pointer" }}
        >
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: netoMes >= 0 ? COLORS.navy : "#B42318", textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>
            Neto este mes
          </p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 800, color: netoMes >= 0 ? COLORS.navy : "#B42318", margin: "4px 0 0" }}>{formatoCOP(netoMes)}</p>
          <BadgeCambioMes cambio={cambioNetoMes} subeEsBueno />
        </Card>
        <Card
          role="button"
          tabIndex={0}
          onClick={() => irASeccion("seccion-clientes")}
          onKeyDown={(e) => e.key === "Enter" && irASeccion("seccion-clientes")}
          style={{ borderLeft: `4px solid ${COLORS.accentBright}`, background: COLORS.accentSoft, cursor: "pointer" }}
        >
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: COLORS.navy, textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>
            Recaudado histórico
          </p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 800, color: COLORS.navy, margin: "4px 0 0" }}>{formatoCOP(recaudadoTotal)}</p>
        </Card>
        <Card
          role="button"
          tabIndex={0}
          onClick={() => irASeccion("seccion-otros-ingresos")}
          onKeyDown={(e) => e.key === "Enter" && irASeccion("seccion-otros-ingresos")}
          style={{ borderLeft: "4px solid #10B981", background: "#F0FDF4", cursor: "pointer" }}
        >
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: "#166534", textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>
            Otros ingresos este mes
          </p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 800, color: "#166534", margin: "4px 0 0" }}>{formatoCOP(otrosIngresosMes)}</p>
        </Card>
        <Card
          role="button"
          tabIndex={0}
          onClick={() => irASeccion("seccion-egresos")}
          onKeyDown={(e) => e.key === "Enter" && irASeccion("seccion-egresos")}
          style={{ borderLeft: "4px solid #6B7480", background: COLORS.surfaceSoft, cursor: "pointer" }}
        >
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: COLORS.inkSoft, textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>
            Egresos histórico
          </p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 800, color: COLORS.ink, margin: "4px 0 0" }}>{formatoCOP(egresoTotal)}</p>
        </Card>
        <Card
          role="button"
          tabIndex={0}
          onClick={() => irASeccion("seccion-clientes")}
          onKeyDown={(e) => e.key === "Enter" && irASeccion("seccion-clientes")}
          style={{ borderLeft: `4px solid ${netoTotal >= 0 ? "#10B981" : "#B42318"}`, cursor: "pointer" }}
        >
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>
            Neto histórico
          </p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 800, color: netoTotal >= 0 ? "#166534" : "#B42318", margin: "4px 0 0" }}>{formatoCOP(netoTotal)}</p>
        </Card>
        {carteraTotal > 0 && (
          <Card
            role="button"
            tabIndex={0}
            onClick={() => irASeccion("seccion-clientes", { soloPendientes: true })}
            onKeyDown={(e) => e.key === "Enter" && irASeccion("seccion-clientes", { soloPendientes: true })}
            style={{ borderLeft: "4px solid #F5A524", background: "#FEF3E2", cursor: "pointer" }}
          >
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
          <Card
            role="button"
            tabIndex={0}
            onClick={() => irASeccion("seccion-clientes")}
            onKeyDown={(e) => e.key === "Enter" && irASeccion("seccion-clientes")}
            style={{ borderLeft: "4px solid #8B5CF6", background: "#F5F3FF", cursor: "pointer" }}
          >
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: "#7C3AED", textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>
              Retenido en la fuente (mes)
            </p>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 800, color: "#7C3AED", margin: "4px 0 0" }}>{formatoCOP(retenidoMes)}</p>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: "#7C3AED", margin: "3px 0 0" }}>
              Histórico: {formatoCOP(retenidoTotal)} · guarda tus certificados de retención para la declaración de renta
            </p>
          </Card>
        )}
        {porcentajeAhorro > 0 && (
          <Card
            role="button"
            tabIndex={0}
            onClick={() => irASeccion("seccion-clientes")}
            onKeyDown={(e) => e.key === "Enter" && irASeccion("seccion-clientes")}
            style={{ borderLeft: "4px solid #0D9488", background: "#F0FDFA", cursor: "pointer" }}
          >
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: "#0D9488", textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>
              Ahorro sugerido (mes)
            </p>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 800, color: "#0D9488", margin: "4px 0 0" }}>{formatoCOP(ahorroSugeridoMes)}</p>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: "#0D9488", margin: "3px 0 0" }}>
              Histórico: {formatoCOP(ahorroSugeridoTotal)} · el {porcentajeAhorro}% de cada pago que te ha entrado
            </p>
          </Card>
        )}
      </div>

      {totalProyeccion3Meses > 0 && (
        <Card style={{ marginBottom: 20 }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.ink, marginBottom: 4 }}>Flujo de caja proyectado</p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 14 }}>
            Según el próximo pago esperado de cada cliente activo — no incluye pagos ya vencidos, esos están en "Cartera pendiente".
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
            {mesesProyeccion.map((m) => (
              <div key={m.clave} style={{ background: COLORS.surfaceSoft, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 12 }}>
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>
                  {m.etiqueta}
                </p>
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 19, fontWeight: 800, color: COLORS.navy, margin: "4px 0 0" }}>{formatoCOP(m.total)}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {topClientesHistorico.length > 0 && (
        <Card style={{ marginBottom: 20 }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.ink, marginBottom: 4 }}>Top clientes por recaudo histórico</p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 14 }}>Quiénes más le han aportado al despacho desde siempre.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {topClientesHistorico.map((c, i) => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: COLORS.surfaceSoft, borderRadius: 8, padding: "8px 12px" }}>
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.ink, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 800, color: COLORS.muted, fontSize: 12, width: 16 }}>{i + 1}</span>
                  {c.nombre}
                </p>
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 700, color: COLORS.navy, margin: 0 }}>{formatoCOP(c.total)}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {estadoInversiones.length > 0 && (
        <Card style={{ marginBottom: 20 }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.ink, marginBottom: 4 }}>Retorno de inversión</p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 14, lineHeight: 1.5 }}>
            Aproximado: compara la utilidad neta real del despacho desde la fecha de cada inversión (todo lo que entró menos todo lo que salió) contra lo invertido — no significa que ese ingreso vino "por causa" de la inversión, es el ritmo general del negocio desde ese momento.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {estadoInversiones.map((e) => (
              <div key={e.inv.concepto + e.inv.fecha} style={{ background: COLORS.surfaceSoft, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 700, color: COLORS.ink, margin: 0 }}>{e.inv.concepto}</p>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, margin: 0 }}>
                    {formatoCOP(e.monto)} · desde {new Date(e.inv.fecha).toLocaleDateString("es-CO", { dateStyle: "medium" })}
                  </p>
                </div>
                <div style={{ height: 8, borderRadius: 6, background: "#E2E8F0", overflow: "hidden", marginBottom: 6 }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.min(e.porcentajeRecuperado, 100)}%`,
                      background: e.recuperada ? "#10B981" : e.porcentajeRecuperado >= 50 ? "#0D9488" : "#F5A524",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: e.recuperada ? "#166534" : COLORS.inkSoft, margin: 0, fontWeight: e.recuperada ? 700 : 400 }}>
                  {e.recuperada
                    ? `✓ Recuperada — la utilidad del despacho desde esa fecha (${formatoCOP(e.utilidadDesde)}) ya superó lo invertido.`
                    : e.mesesFaltantes !== null
                    ? `${e.porcentajeRecuperado}% recuperado — a este ritmo, faltan aprox. ${e.mesesFaltantes} mes${e.mesesFaltantes !== 1 ? "es" : ""} más.`
                    : `${e.porcentajeRecuperado}% recuperado — al ritmo actual del despacho (utilidad negativa o nula desde esa fecha), no se está recuperando todavía.`}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

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

      <Card style={{ marginBottom: 20, borderLeft: `4px solid ${COLORS.accentBright}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
          <div>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.ink, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
              <Icono tipo="documento" size={15} /> Resumen fiscal anual
            </p>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, margin: "4px 0 0" }}>
              Ingresos, retenciones y gastos por categoría de un año completo, listo para tu contador.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select className="drx-input" style={{ ...inputStyle, maxWidth: 110 }} value={anioFiscal} onChange={(e) => setAnioFiscal(Number(e.target.value))}>
              {aniosDisponibles.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <button className="drx-btn-primary drx-cta-shine" style={buttonPrimary} onClick={generarResumenFiscal} disabled={generandoFiscal}>
              {generandoFiscal ? "Generando…" : "Descargar PDF"}
            </button>
          </div>
        </div>
        {errorFiscal && (
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "#B42318", margin: "10px 0 0" }}>{errorFiscal}</p>
        )}
      </Card>

      {categoriasEgresoOrdenadas.length > 0 && (
        <Card style={{ marginBottom: 20 }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.ink, marginBottom: 4 }}>Egresos por categoría</p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 14 }}>
            Histórico completo · La que más consume: <strong style={{ color: COLORS.headingText }}>{categoriaMayorGasto?.[0]}</strong> ({formatoCOP(categoriaMayorGasto?.[1] || 0)})
          </p>
          {egresosOtro.length > 0 && (
            <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "10px 12px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "#92400E", margin: 0 }}>
                {egresosOtro.length} egreso{egresosOtro.length !== 1 ? "s" : ""} en "Otro" no dice mucho en esta gráfica — se pueden pasar a "Pendiente por clasificar" de una vez.
              </p>
              <button className="drx-btn-ghost" style={{ ...buttonGhost, padding: "6px 12px", fontSize: 12, background: "#FFFFFF" }} onClick={recategorizarOtroAPendientes}>
                Recategorizar "Otro" → "Pendiente por clasificar"
              </button>
            </div>
          )}
          <GraficaBarras datos={categoriasEgresoOrdenadas.map(([categoria, valor]) => ({ etiqueta: categoria, valor }))} color="#F43F5E" formatoValor={formatoCOP} />
        </Card>
      )}

      <Card id="seccion-egresos" style={{ marginBottom: 20 }}>
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
              Exportar Excel
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
              <EgresoCard key={e.id} egreso={e} onEditar={(cambios) => editarEgreso(e.id, cambios)} onEliminar={() => eliminarEgreso(e)} clientesDisponibles={clientesParaSelector} />
            ))}
          </div>
        ) : (
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.muted, marginTop: 10 }}>
            {egresos.length === 0 ? "Todavía no has registrado ningún egreso." : "Ningún egreso coincide con el filtro."}
          </p>
        )}
      </Card>

      <Card id="seccion-otros-ingresos" style={{ marginBottom: 20 }}>
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
              Exportar Excel
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
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="drx-btn-primary" style={{ ...buttonPrimary, padding: "6px 12px", fontSize: 12, background: "#1DA851" }} onClick={() => enviarRecordatorioPago(c)}>
                      Enviar recordatorio ↗
                    </button>
                    {c.grupoWhatsapp && (
                      <button
                        className="drx-btn-ghost"
                        style={{ ...buttonGhost, padding: "6px 12px", fontSize: 12 }}
                        title="Copia el mensaje y abre el grupo de WhatsApp del proceso"
                        onClick={() => enviarRecordatorioPagoGrupo(c)}
                      >
                        Al grupo ↗
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div id="seccion-clientes" style={{ marginBottom: 14, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
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
                { titulo: "Ahorro sugerido", valor: (f) => montoAhorro(f.pago, porcentajeAhorro) },
                { titulo: "Concepto", valor: (f) => f.pago.concepto },
              ],
              filas
            );
          }}
        >
          Exportar Excel
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
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
                        background: saldo <= 0 ? "#DCFCE7" : "#EFF6FF",
                        color: saldo <= 0 ? "#166534" : "#1D4ED8",
                      }}
                    >
                      {saldo <= 0 ? "Al día" : `Saldo del plan: ${formatoCOP(saldo)}`}
                    </p>
                  )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="drx-btn-ghost" style={buttonGhost} onClick={() => setFormAbiertoId(formAbiertoId === id ? null : id)}>
                    {formAbiertoId === id ? "Cancelar" : "+ Registrar pago"}
                  </button>
                  <button
                    className="drx-btn-ghost"
                    style={{ ...buttonGhost, color: "#F43F5E", borderColor: "#FBD5DC" }}
                    onClick={() => setEgresoAbiertoId(egresoAbiertoId === id ? null : id)}
                  >
                    {egresoAbiertoId === id ? "Cancelar" : "+ Registrar egreso"}
                  </button>
                </div>
              </div>

              {formAbiertoId === id && <FormularioPago cliente={c} onRegistrar={(datos) => registrarPago(id, datos)} />}
              {egresoAbiertoId === id && (
                <div style={{ marginTop: 12, borderTop: `1px solid ${COLORS.border}`, paddingTop: 14 }}>
                  <FormularioEgreso onRegistrar={async (datos) => { await registrarEgreso({ ...datos, clienteId: id }); setEgresoAbiertoId(null); }} />
                </div>
              )}

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
                        porcentajeAhorro={porcentajeAhorro}
                        referenciadores={referenciadores}
                        abogadosAsociados={abogadosAsociados}
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

              {/* Egresos registrados desde esta misma tarjeta (clienteId) — se
                  siguen contando igual en el total de egresos del despacho,
                  pero además quedan visibles aquí, junto a los pagos de este
                  cliente, en vez de solo en la sección Egresos de más arriba. */}
              {egresos.filter((e) => e.clienteId === id).length > 0 && (() => {
                const egresosCliente = [...egresos.filter((e) => e.clienteId === id)].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
                return (
                  <div>
                    {egresosCliente.map((e) => (
                      <EgresoCard key={e.id} egreso={e} onEditar={(cambios) => editarEgreso(e.id, cambios)} onEliminar={() => eliminarEgreso(e)} clientesDisponibles={clientesParaSelector} />
                    ))}
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
