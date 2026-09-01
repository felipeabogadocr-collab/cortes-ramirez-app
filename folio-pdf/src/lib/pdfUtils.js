import { PDFDocument, degrees } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { registrarEvento } from "./analytics.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export async function fileToBytes(file) {
  return new Uint8Array(await file.arrayBuffer());
}

// Límite defensivo por archivo: evita que un archivo enorme cuelgue o
// tumbe la pestaña al procesarlo por completo en el navegador.
export const MAX_FILE_MB = 50;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

export function excedeTamano(file) {
  return file.size > MAX_FILE_BYTES;
}

export function downloadBytes(bytes, filename, mime = "application/pdf", herramienta = null) {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  window.dispatchEvent(new CustomEvent("folio:download", { detail: { filename } }));
  if (herramienta) registrarEvento(herramienta);
}

// Devuelve una miniatura (data URL) de cada página de un PDF.
export async function renderThumbnails(bytes, scale = 0.35) {
  const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  const thumbs = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    thumbs.push(canvas.toDataURL("image/png"));
  }
  await doc.destroy();
  return thumbs;
}

export async function getPageCount(bytes) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPageCount();
}

// Une varios archivos PDF (en el orden dado) en uno solo.
export async function mergePdfs(files) {
  const out = await PDFDocument.create();
  for (const file of files) {
    const bytes = await fileToBytes(file);
    const src = await PDFDocument.load(bytes);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return out.save();
}

// pagesMeta: [{ index, rotation, deleted }] en el ORDEN final deseado.
export async function organizePdf(bytes, pagesMeta) {
  const src = await PDFDocument.load(bytes);
  const out = await PDFDocument.create();
  const keep = pagesMeta.filter((p) => !p.deleted);
  const copied = await out.copyPages(src, keep.map((p) => p.index));
  copied.forEach((page, i) => {
    const rotation = keep[i].rotation || 0;
    if (rotation) page.setRotation(degrees(page.getRotation().angle + rotation));
    out.addPage(page);
  });
  return out.save();
}

export async function extractPage(bytes, index) {
  const src = await PDFDocument.load(bytes);
  const out = await PDFDocument.create();
  const [page] = await out.copyPages(src, [index]);
  out.addPage(page);
  return out.save();
}

// ranges: [[inicio, fin]] con índices desde 1 (inclusive). Devuelve un array de Uint8Array.
export async function splitPdf(bytes, ranges) {
  const src = await PDFDocument.load(bytes);
  const results = [];
  for (const [start, end] of ranges) {
    const out = await PDFDocument.create();
    const indices = [];
    for (let i = start; i <= end; i++) indices.push(i - 1);
    const pages = await out.copyPages(src, indices);
    pages.forEach((p) => out.addPage(p));
    results.push(await out.save());
  }
  return results;
}

// Convierte una lista de imágenes (jpg/png) en un solo PDF, una imagen por página.
// items: [{ file: File, rotation?: 0|90|180|270 }]
export async function imagesToPdf(items) {
  const out = await PDFDocument.create();
  for (const { file, rotation = 0 } of items) {
    const bytes = await fileToBytes(file);
    const isPng = file.type.includes("png");
    const image = isPng ? await out.embedPng(bytes) : await out.embedJpg(bytes);
    const page = out.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    if (rotation) page.setRotation(degrees(rotation));
  }
  return out.save();
}

// Estampa una firma (PNG en base64, con fondo transparente) sobre una página del PDF.
// x, y, width, height van en fracción (0-1) del tamaño de la página, con origen arriba-izquierda.
export async function signPdf(bytes, signatureDataUrl, pageIndex, box) {
  const src = await PDFDocument.load(bytes);
  const pngBytes = dataUrlToBytes(signatureDataUrl);
  const image = await src.embedPng(pngBytes);
  const page = src.getPage(pageIndex);
  const { width: pw, height: ph } = page.getSize();
  const w = box.width * pw;
  const h = box.height * ph;
  const x = box.x * pw;
  const y = ph - box.y * ph - h;
  page.drawImage(image, { x, y, width: w, height: h });
  return src.save();
}

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Compresión ligera: reconstruye el PDF con flujo de objetos comprimido.
// No recomprime imágenes internas (eso requeriría un procesador de imágenes aparte),
// pero suele reducir el tamaño de PDFs con muchas páginas/formularios.
export async function compressPdf(bytes) {
  const doc = await PDFDocument.load(bytes);
  return doc.save({ useObjectStreams: true });
}
