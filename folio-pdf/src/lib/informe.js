import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { downloadBytes } from "./pdfUtils.js";

const MARGEN = 48;
const ANCHO = 595.28; // A4
const ALTO = 841.89;

export async function generarInformePdf(datos, analisis) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  let page = doc.addPage([ANCHO, ALTO]);
  let y = ALTO - MARGEN;

  function salto(alto = 16) {
    y -= alto;
    if (y < MARGEN + 40) {
      page = doc.addPage([ANCHO, ALTO]);
      y = ALTO - MARGEN;
    }
  }

  function titulo(texto, size = 18) {
    page.drawText(texto, { x: MARGEN, y, size, font: bold, color: rgb(0.04, 0.14, 0.26) });
    salto(size + 10);
  }

  function subtitulo(texto) {
    salto(6);
    page.drawText(texto, { x: MARGEN, y, size: 12.5, font: bold, color: rgb(0.04, 0.14, 0.26) });
    salto(18);
  }

  function fila(izq, der) {
    page.drawText(izq, { x: MARGEN, y, size: 10.5, font: normal, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(der, { x: ANCHO - MARGEN - 40, y, size: 10.5, font: bold, color: rgb(0.1, 0.1, 0.1) });
    salto(15);
  }

  function parrafo(texto) {
    const palabras = texto.split(/\s+/);
    const maxAncho = ANCHO - MARGEN * 2;
    let linea = "";
    for (const palabra of palabras) {
      const prueba = linea ? `${linea} ${palabra}` : palabra;
      if (normal.widthOfTextAtSize(prueba, 10.5) > maxAncho) {
        page.drawText(linea, { x: MARGEN, y, size: 10.5, font: normal, color: rgb(0.2, 0.2, 0.2) });
        salto(15);
        linea = palabra;
      } else {
        linea = prueba;
      }
    }
    if (linea) {
      page.drawText(linea, { x: MARGEN, y, size: 10.5, font: normal, color: rgb(0.2, 0.2, 0.2) });
      salto(15);
    }
  }

  titulo("Informe de uso — Folio");
  page.drawText(`Generado el ${new Date().toLocaleString("es-CR")}`, {
    x: MARGEN,
    y,
    size: 9.5,
    font: normal,
    color: rgb(0.45, 0.45, 0.45),
  });
  salto(26);

  subtitulo("Resumen");
  fila("Personas registradas", String(datos.totalRegistros));
  fila("Documentos procesados", String(datos.totalDocumentos));

  if (datos.porHerramienta.length) {
    subtitulo("Documentos por herramienta");
    for (const row of datos.porHerramienta) fila(row.herramienta, String(row.total));
  }

  if (datos.registrosPorDiaSemana.length) {
    subtitulo("Registros por día de la semana");
    for (const row of datos.registrosPorDiaSemana) fila(row.dia, String(row.total));
  }

  if (analisis) {
    subtitulo("Análisis y recomendaciones (IA)");
    for (const linea of analisis.split("\n").filter(Boolean)) parrafo(linea);
  }

  salto(10);
  page.drawText("Generado automáticamente por el panel de Folio.", {
    x: MARGEN,
    y,
    size: 8.5,
    font: normal,
    color: rgb(0.55, 0.55, 0.55),
  });

  const bytes = await doc.save();
  const fecha = new Date().toISOString().slice(0, 10);
  downloadBytes(bytes, `informe-folio-${fecha}.pdf`);
}
