import { useState, useEffect, useCallback } from "react";
import { storageGet, storageSet, getNombreDespacho } from "../lib/storage";
import {
  COLORS, uid, diasDesde, useAvisoAntesDeSalir, useConfirmarDialogo, useIndex, Field,
  inputStyle, buttonPrimary, buttonGhost, Card, EncabezadoSeccion, Icono, EstadoVacio,
  EstadoBadge, SelloFirma, DocumentoTextoConFirmas, calcularEstado, sha256Hex,
  archivoDemasiadoGrande, TAMANO_MAX_ARCHIVO_MB, ensureMammoth, ensureJsPDF,
} from "../App.jsx";

const INDICATIVOS = [
  { pais: "Colombia", cod: "57" },
  { pais: "México", cod: "52" },
  { pais: "España", cod: "34" },
  { pais: "Estados Unidos", cod: "1" },
  { pais: "Argentina", cod: "54" },
  { pais: "Chile", cod: "56" },
  { pais: "Perú", cod: "51" },
  { pais: "Ecuador", cod: "593" },
  { pais: "Panamá", cod: "507" },
  { pais: "Venezuela", cod: "58" },
  { pais: "Costa Rica", cod: "506" },
  { pais: "Otro", cod: "" },
];

async function descargarPdfFirmado(doc) {
  // Abrimos la pestaña ANTES de generar el PDF (de forma síncrona), porque si se abre
  // después de esperar a que cargue la librería, el navegador la bloquea silenciosamente.
  const ventana = window.open("", "_blank");
  if (ventana) {
    ventana.document.write(
      '<div style="font-family: sans-serif; color: #4C5A6B; padding: 40px; text-align: center;">Generando el PDF firmado…</div>'
    );
  }

  await ensureJsPDF();
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const marginX = 48;
  let y = 64;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text(doc.titulo || "Documento", pageWidth / 2, y, { align: "center" });
  y += 8;
  pdf.setDrawColor(11, 61, 46);
  pdf.setLineWidth(1.2);
  pdf.line(marginX, y, pageWidth - marginX, y);
  y += 26;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  const lineas = pdf.splitTextToSize(doc.contenido || "", pageWidth - marginX * 2);
  lineas.forEach((linea) => {
    if (y > pageHeight - 60) {
      pdf.addPage();
      y = 60;
    }
    pdf.text(linea, marginX, y);
    y += 15;
  });

  y += 20;
  if (y > pageHeight - 100) {
    pdf.addPage();
    y = 60;
  }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.text("Firmas", marginX, y);
  y += 18;

  (doc.firmantes || []).forEach((f) => {
    if (y > pageHeight - 90) {
      pdf.addPage();
      y = 60;
    }
    const alto = 58;
    pdf.setDrawColor(11, 61, 46);
    pdf.setLineWidth(1);
    if (f.rol === "abogado") {
      pdf.setFillColor(11, 61, 46);
      pdf.roundedRect(marginX, y, pageWidth - marginX * 2, alto, 4, 4, "FD");
      pdf.setTextColor(255, 255, 255);
    } else {
      pdf.roundedRect(marginX, y, pageWidth - marginX * 2, alto, 4, 4);
      pdf.setTextColor(11, 18, 32);
    }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text(f.textoFirma || f.nombre || "", marginX + 12, y + 20);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    const etiqueta = f.rol === "abogado" ? `${getNombreDespacho()} · firmado electrónicamente` : "Firmado electrónicamente";
    pdf.text(etiqueta, marginX + 12, y + 34);
    pdf.text(`${f.tipoId || ""} ${f.numeroId || ""}`.trim(), marginX + 12, y + 47);
    if (f.firmadoEn) {
      const fechaTexto = new Date(f.firmadoEn).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
      pdf.text(fechaTexto, pageWidth - marginX - 150, y + 47);
    }
    pdf.setTextColor(11, 18, 32);
    y += alto + 14;
  });

  const totalPaginas = pdf.internal.getNumberOfPages();
  for (let pagina = 1; pagina <= totalPaginas; pagina++) {
    pdf.setPage(pagina);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(148, 163, 184);
    pdf.text(`Página ${pagina} de ${totalPaginas}`, pageWidth / 2, pageHeight - 24, { align: "center" });
  }

  const nombreArchivo = (doc.titulo || "documento").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  const blob = pdf.output("blob");
  const url = URL.createObjectURL(blob);
  if (ventana && !ventana.closed) {
    ventana.location.href = url;
  } else {
    window.open(url, "_blank");
  }
  return nombreArchivo;
}

const FORM_DOC_INICIAL = { titulo: "", cliente: "", whatsappIndicativo: "57", whatsappNumero: "", contenido: "", nombreArchivo: "", tipoDocumento: "texto", archivoPdfBase64: "" };

export default function DocumentosTab() {
  const { ids, cargado, addId, removeId } = useIndex("indice-documentos", true);
  const [docs, setDocs] = useState({});
  const [form, setForm] = useState(FORM_DOC_INICIAL);
  const [showForm, setShowForm] = useState(false);
  useAvisoAntesDeSalir(showForm && !!(form.titulo.trim() || form.contenido.trim()));
  const [copiedId, setCopiedId] = useState(null);
  const [cargandoArchivo, setCargandoArchivo] = useState(false);
  const [errorArchivo, setErrorArchivo] = useState("");
  const [editandoDocId, setEditandoDocId] = useState(null);
  const [formEdicionDoc, setFormEdicionDoc] = useState({});
  const [filtro, setFiltro] = useState("");
  const [integridad, setIntegridad] = useState({});
  const [filtroEstadoDoc, setFiltroEstadoDoc] = useState("Todos");
  const { confirmar, ConfirmarDialogo } = useConfirmarDialogo();

  const cargar = useCallback(async () => {
    const entries = {};
    for (const id of ids) {
      const raw = await storageGet(`documento:${id}`, true);
      if (raw) entries[id] = JSON.parse(raw);
    }
    setDocs(entries);
  }, [ids]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Verifica, para cada documento con al menos una firma, que el hash
  // guardado al firmar todavía coincida con el contenido actual — si no
  // coincide, alguien lo modificó después de firmado.
  useEffect(() => {
    (async () => {
      const resultados = {};
      for (const [id, d] of Object.entries(docs)) {
        const firmaConHash = (d.firmantes || []).find((f) => f.hashDocumento);
        if (!firmaConHash) continue;
        const contenidoActual = d.tipoDocumento === "pdf" ? d.archivoPdfBase64 || "" : d.contenido || "";
        const hashActual = await sha256Hex(contenidoActual);
        resultados[id] = hashActual && hashActual === firmaConHash.hashDocumento ? "ok" : "alterado";
      }
      setIntegridad(resultados);
    })();
  }, [docs]);

  const manejarArchivo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorArchivo("");
    const nombre = file.name.toLowerCase();

    if (archivoDemasiadoGrande(file)) {
      e.target.value = "";
      setErrorArchivo(`Ese archivo pesa demasiado (máximo ${TAMANO_MAX_ARCHIVO_MB} MB). Prueba con uno más liviano.`);
      return;
    }

    if (nombre.endsWith(".pdf")) {
      e.target.value = "";
      setErrorArchivo(
        "Para PDF, ábrelo, selecciona todo el texto (Ctrl+A o Cmd+A), cópialo (Ctrl+C) y pégalo en el cuadro de abajo. Es instantáneo y no da error."
      );
      return;
    }

    setCargandoArchivo(true);
    try {
      if (nombre.endsWith(".docx")) {
        await ensureMammoth();
        const arrayBuffer = await file.arrayBuffer();
        const result = await window.mammoth.extractRawText({ arrayBuffer });
        setForm((f) => ({ ...f, tipoDocumento: "texto", contenido: result.value, nombreArchivo: file.name, archivoPdfBase64: "" }));
      } else if (nombre.endsWith(".txt")) {
        const text = await file.text();
        setForm((f) => ({ ...f, tipoDocumento: "texto", contenido: text, nombreArchivo: file.name, archivoPdfBase64: "" }));
      } else {
        setErrorArchivo("Formatos permitidos: .docx o .txt. Para PDF, copia y pega el texto abajo.");
      }
    } catch (err) {
      setErrorArchivo("No pudimos leer ese archivo. Intenta con otro .docx o .txt, o pega el texto manualmente abajo.");
    }
    setCargandoArchivo(false);
  };

  const listoParaGuardar = form.titulo.trim() && (form.tipoDocumento === "pdf" ? form.archivoPdfBase64 : form.contenido.trim());

  const guardar = async () => {
    if (!listoParaGuardar) return;
    const id = uid();
    await storageSet(`documento:${id}`, JSON.stringify({ ...form, firmantes: [], creadoEn: new Date().toISOString() }), true);
    await addId(id);
    setForm(FORM_DOC_INICIAL);
    setShowForm(false);
  };

  const copiarCodigo = (id) => {
    navigator.clipboard?.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // Crea un documento nuevo a partir de uno existente, sin firmas ni código
  // de firma (es un documento distinto) — útil para reutilizar plantillas
  // (contratos, poderes) sin escribir todo desde cero cada vez.
  const duplicarDocumento = async (id) => {
    const original = docs[id];
    if (!original) return;
    const nuevoId = uid();
    const copia = {
      ...original,
      titulo: `${original.titulo} (copia)`,
      cliente: "",
      whatsappNumero: "",
      firmantes: [],
      creadoEn: new Date().toISOString(),
    };
    await storageSet(`documento:${nuevoId}`, JSON.stringify(copia), true);
    await addId(nuevoId);
  };

  const empezarEdicionDoc = (id) => {
    setEditandoDocId(id);
    setFormEdicionDoc(docs[id]);
  };

  const guardarEdicionDoc = async (id) => {
    if (!formEdicionDoc.titulo?.trim() || !formEdicionDoc.contenido?.trim()) return;
    await storageSet(`documento:${id}`, JSON.stringify(formEdicionDoc), true);
    setDocs((prev) => ({ ...prev, [id]: formEdicionDoc }));
    setEditandoDocId(null);
  };

  // Enlace directo a la pantalla de firma (#firmar) — así el cliente hace un
  // solo clic en vez de tener que abrir la app y buscar dónde escribir el código.
  const ENLACE_FIRMA = typeof window !== "undefined" ? `${window.location.origin}/#firmar` : "";

  const enviarPorWhatsapp = (d, id) => {
    const numero = `${d.whatsappIndicativo || ""}${(d.whatsappNumero || "").replace(/[^0-9]/g, "")}`;
    const pasos = ENLACE_FIRMA
      ? `1️⃣ Haz clic aquí: ${ENLACE_FIRMA}\n2️⃣ Cuando te lo pida, escribe este código: *${id}*\n3️⃣ Sigue los pasos en pantalla para firmar`
      : `1️⃣ Ingresa al aplicativo de firmas\n2️⃣ Escribe este código: *${id}*\n3️⃣ Sigue los pasos en pantalla para firmar`;
    const mensaje = `Hola ${d.cliente || ""} 👋\n\n*${getNombreDespacho()}* te comparte el documento *"${d.titulo}"* para tu firma electrónica.\n\n${pasos}\n\nCualquier duda, escríbenos por este mismo medio.`;
    const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, "_blank");
  };

  const enviarDocumentoListoPorWhatsapp = (d) => {
    const firmaCliente = (d.firmantes || []).find((f) => f.rol !== "abogado");
    const firmaAbogado = (d.firmantes || []).find((f) => f.rol === "abogado");
    const numero = `${d.whatsappIndicativo || ""}${(d.whatsappNumero || "").replace(/[^0-9]/g, "")}`;
    const fechaCliente = firmaCliente ? new Date(firmaCliente.firmadoEn).toLocaleDateString("es-CO", { dateStyle: "long" }) : "";
    const mensaje = `Hola ${d.cliente || ""}, tu documento "${d.titulo}" quedó firmado el ${fechaCliente} y también fue firmado por ${firmaAbogado ? firmaAbogado.nombre : "tu abogado"} de ${getNombreDespacho()}. Ya está listo.\n\nTe adjuntamos el PDF firmado.`;
    const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, "_blank");
  };

  const [firmandoDocId, setFirmandoDocId] = useState(null);
  const [nombreAbogado, setNombreAbogado] = useState("");
  const [registroAbogado, setRegistroAbogado] = useState("");
  const [previewAbogado, setPreviewAbogado] = useState(null);
  const [perfilCargado, setPerfilCargado] = useState(false);

  const abrirFirmaAbogado = async (id) => {
    if (!perfilCargado) {
      const raw = await storageGet("perfil-abogado", false);
      if (raw) {
        const perfil = JSON.parse(raw);
        setNombreAbogado(perfil.nombre || "");
        setRegistroAbogado(perfil.registro || "");
      }
      setPerfilCargado(true);
    }
    setFirmandoDocId(id);
    setPreviewAbogado({ x: 55, y: 82, textoFirma: "" });
  };

  const confirmarFirmaAbogado = async (id) => {
    if (!nombreAbogado.trim()) return;
    await storageSet("perfil-abogado", JSON.stringify({ nombre: nombreAbogado.trim(), registro: registroAbogado.trim() }), false);
    const raw = await storageGet(`documento:${id}`, true);
    const d = raw ? JSON.parse(raw) : docs[id];
    const nuevaFirma = {
      nombre: nombreAbogado.trim(),
      tipoId: "Tarjeta profesional",
      numeroId: registroAbogado.trim(),
      textoFirma: nombreAbogado.trim(),
      x: previewAbogado.x,
      y: previewAbogado.y,
      firmadoEn: new Date().toISOString(),
      rol: "abogado",
    };
    const updated = { ...d, firmantes: [...(d.firmantes || []), nuevaFirma] };
    await storageSet(`documento:${id}`, JSON.stringify(updated), true);
    setDocs((prev) => ({ ...prev, [id]: updated }));
    setFirmandoDocId(null);
    setPreviewAbogado(null);
  };

  const textoFiltro = filtro.trim().toLowerCase();
  const idsPorTexto = textoFiltro
    ? ids.filter((id) => {
        const d = docs[id];
        if (!d) return false;
        return d.titulo?.toLowerCase().includes(textoFiltro) || d.cliente?.toLowerCase().includes(textoFiltro);
      })
    : ids;

  // Prioriza lo que necesita acción: primero lo que falta que firme el
  // abogado (el cliente ya firmó y está esperando), luego lo pendiente, y
  // al final lo ya completado — para no tener que buscarlo entre lo
  // terminado.
  const ordenEstadoDoc = { falta_abogado: 0, pendiente: 1, listo: 2 };
  const idsOrdenadosPorEstado = [...idsPorTexto].sort((a, b) => {
    const ea = calcularEstado(docs[a]?.firmantes || []);
    const eb = calcularEstado(docs[b]?.firmantes || []);
    return (ordenEstadoDoc[ea] ?? 1) - (ordenEstadoDoc[eb] ?? 1);
  });
  const idsFiltrados =
    filtroEstadoDoc === "Todos"
      ? idsOrdenadosPorEstado
      : idsOrdenadosPorEstado.filter((id) => calcularEstado(docs[id]?.firmantes || []) === filtroEstadoDoc);

  // Cuántos documentos pendientes están por vencer o ya vencieron (el enlace
  // de firma expira a los 30 días) — para verlo de un vistazo sin tener que
  // revisar documento por documento.
  const porVencer = ids.filter((id) => {
    const d = docs[id];
    if (!d || calcularEstado(d.firmantes || []) === "listo") return false;
    return 30 - (diasDesde(d.creadoEn) || 0) <= 5;
  }).length;

  return (
    <div>
      <EncabezadoSeccion titulo="Firmar documentos" color="#10B981" />
      <div style={{ marginBottom: 14 }}>
        <input
          className="drx-input"
          style={{ ...inputStyle, maxWidth: 320 }}
          placeholder="Filtrar por título o cliente..."
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.muted, margin: 0 }}>
          {idsFiltrados.length} documento{idsFiltrados.length !== 1 ? "s" : ""}
          {filtro.trim() ? ` de ${ids.length}` : ""} · comparte el código con tus clientes para que firmen
          {porVencer > 0 && <span style={{ color: "#B45309", fontWeight: 600 }}> · {porVencer} por vencer o vencido{porVencer !== 1 ? "s" : ""}</span>}
        </p>
        <button className="drx-btn-primary drx-cta-shine" style={buttonPrimary} onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancelar" : "+ Nuevo documento"}
        </button>
      </div>

      {ids.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {[
            { key: "Todos", texto: "Todos" },
            { key: "falta_abogado", texto: "Falta tu firma" },
            { key: "pendiente", texto: "Pendiente" },
            { key: "listo", texto: "Listo" },
          ].map(({ key, texto }) => {
            const cantidad = key === "Todos" ? ids.length : ids.filter((id) => calcularEstado(docs[id]?.firmantes || []) === key).length;
            const activo = filtroEstadoDoc === key;
            return (
              <button
                key={key}
                onClick={() => setFiltroEstadoDoc(key)}
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "6px 12px",
                  borderRadius: 999,
                  border: `1px solid ${activo ? COLORS.navy : COLORS.border}`,
                  background: activo ? COLORS.navy : "#fff",
                  color: activo ? "#fff" : COLORS.inkSoft,
                  cursor: "pointer",
                }}
              >
                {texto} ({cantidad})
              </button>
            );
          })}
        </div>
      )}

      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <Field label="Título del documento">
              <input className="drx-input" style={inputStyle} value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
            </Field>
            <Field label="Cliente">
              <input className="drx-input" style={inputStyle} value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} />
            </Field>
          </div>

          <div style={{ marginBottom: 12 }}>
            <Field label="WhatsApp del cliente">
              <div style={{ display: "flex", gap: 8 }}>
                <select
                  className="drx-input"
                  style={{ ...inputStyle, maxWidth: 150 }}
                  value={form.whatsappIndicativo}
                  onChange={(e) => setForm({ ...form, whatsappIndicativo: e.target.value })}
                >
                  {INDICATIVOS.map((p) => (
                    <option key={p.pais} value={p.cod}>
                      {p.pais} {p.cod && `+${p.cod}`}
                    </option>
                  ))}
                </select>
                <input
                  className="drx-input"
                  style={{ ...inputStyle, flex: 1 }}
                  value={form.whatsappNumero}
                  onChange={(e) => setForm({ ...form, whatsappNumero: e.target.value })}
                  placeholder="Número sin indicativo, ej: 3001234567"
                />
              </div>
            </Field>
          </div>

          <Field label="Documento (sube .docx o .txt — para PDF, copia y pega el texto abajo)">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <label className="drx-btn-ghost" style={{ ...buttonGhost, cursor: "pointer", display: "inline-block" }}>
                {cargandoArchivo ? "Leyendo archivo..." : "Subir .docx o .txt"}
                <input type="file" accept=".docx,.txt,.pdf" onChange={manejarArchivo} style={{ display: "none" }} />
              </label>
              {form.nombreArchivo && <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted }}>{form.nombreArchivo}</span>}
            </div>
          </Field>
          {errorArchivo && <p style={{ color: "#B42318", fontSize: 12, marginTop: 8, fontFamily: "Inter, sans-serif" }}>{errorArchivo}</p>}
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: COLORS.muted, marginTop: 6 }}>
            El diseño original (logos, tablas, imágenes) no se conserva en esta vista de prueba — eso se resuelve al publicar la versión final.
          </p>

          <div style={{ marginTop: 12 }}>
            <Field label="Contenido del documento">
              <textarea
                className="drx-input"
                style={{ ...inputStyle, minHeight: 140, fontFamily: "'Source Serif 4', serif", resize: "vertical" }}
                value={form.contenido}
                onChange={(e) => setForm({ ...form, contenido: e.target.value })}
                placeholder="Para PDF: copia el texto (Ctrl+A, Ctrl+C) y pégalo aquí (Ctrl+V). Se llena solo al subir .docx o .txt."
              />
            </Field>
          </div>

          <button className="drx-btn-primary drx-cta-shine" style={{ ...buttonPrimary, marginTop: 14 }} onClick={guardar} disabled={!listoParaGuardar}>
            Crear y generar código de firma
          </button>
        </Card>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {idsFiltrados.map((id) => {
          const d = docs[id];
          if (!d) return null;
          const firmantes = d.firmantes || [];
          const estado = calcularEstado(firmantes);
          const puedeFirmarAbogado = estado === "falta_abogado";

          if (editandoDocId === id) {
            return (
              <Card key={id}>
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: COLORS.headingText, marginBottom: 12 }}>Editar documento</p>
                {firmantes.length > 0 && (
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "#B45309", background: "#FEF3E2", border: "1px solid #FCE3B8", borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
                    Este documento ya tiene {firmantes.length} firma{firmantes.length !== 1 ? "s" : ""}. Las firmas ya puestas no se borran, pero si cambias el contenido, revísalo con quien ya firmó.
                  </p>
                )}
                <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <Field label="Título del documento">
                    <input className="drx-input" style={inputStyle} value={formEdicionDoc.titulo || ""} onChange={(e) => setFormEdicionDoc({ ...formEdicionDoc, titulo: e.target.value })} />
                  </Field>
                  <Field label="Cliente">
                    <input className="drx-input" style={inputStyle} value={formEdicionDoc.cliente || ""} onChange={(e) => setFormEdicionDoc({ ...formEdicionDoc, cliente: e.target.value })} />
                  </Field>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <Field label="WhatsApp del cliente">
                    <div style={{ display: "flex", gap: 8 }}>
                      <select
                        className="drx-input"
                        style={{ ...inputStyle, maxWidth: 150 }}
                        value={formEdicionDoc.whatsappIndicativo || "57"}
                        onChange={(e) => setFormEdicionDoc({ ...formEdicionDoc, whatsappIndicativo: e.target.value })}
                      >
                        {INDICATIVOS.map((p) => (
                          <option key={p.pais} value={p.cod}>
                            {p.pais} {p.cod && `+${p.cod}`}
                          </option>
                        ))}
                      </select>
                      <input
                        className="drx-input"
                        style={{ ...inputStyle, flex: 1 }}
                        value={formEdicionDoc.whatsappNumero || ""}
                        onChange={(e) => setFormEdicionDoc({ ...formEdicionDoc, whatsappNumero: e.target.value })}
                        placeholder="Número sin indicativo, ej: 3001234567"
                      />
                    </div>
                  </Field>
                </div>
                <Field label="Contenido del documento">
                  <textarea
                    className="drx-input"
                    style={{ ...inputStyle, minHeight: 140, fontFamily: "'Source Serif 4', serif", resize: "vertical" }}
                    value={formEdicionDoc.contenido || ""}
                    onChange={(e) => setFormEdicionDoc({ ...formEdicionDoc, contenido: e.target.value })}
                  />
                </Field>
                <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                  <button className="drx-btn-ghost" style={buttonGhost} onClick={() => setEditandoDocId(null)}>
                    Cancelar
                  </button>
                  <button className="drx-btn-primary" style={buttonPrimary} onClick={() => guardarEdicionDoc(id)}>
                    Guardar cambios
                  </button>
                </div>
              </Card>
            );
          }

          return (
            <Card key={id} style={{ borderLeft: "4px solid #10B981" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 17, fontWeight: 700, margin: 0, color: COLORS.ink }}>{d.titulo}</p>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.muted, margin: "4px 0 0" }}>
                    Cliente: {d.cliente || "—"}
                  </p>
                  {d.creadoEn && (
                    <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: COLORS.muted, margin: "3px 0 0" }}>
                      Creado el {new Date(d.creadoEn).toLocaleDateString("es-CO", { dateStyle: "medium" })}
                    </p>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                  <EstadoBadge estado={estado} />
                  {estado === "pendiente" &&
                    d.creadoEn &&
                    (() => {
                      const diasRestantes = 30 - (diasDesde(d.creadoEn) || 0);
                      if (diasRestantes > 5) return null;
                      return (
                        <span style={{ fontFamily: "Inter, sans-serif", fontSize: 10.5, fontWeight: 700, color: diasRestantes <= 0 ? "#B42318" : "#B45309" }}>
                          {diasRestantes <= 0 ? (
                            <>
                              <Icono tipo="alerta" size={12} style={{ marginRight: 3, verticalAlign: -2 }} /> Enlace vencido
                            </>
                          ) : (
                            <>
                              <Icono tipo="cronometro" size={12} style={{ marginRight: 3, verticalAlign: -2 }} /> Vence en {diasRestantes} día{diasRestantes !== 1 ? "s" : ""}
                            </>
                          )}
                        </span>
                      );
                    })()}
                  {integridad[id] === "ok" && (
                    <span style={{ fontFamily: "Inter, sans-serif", fontSize: 10.5, fontWeight: 700, color: "#166534" }} title="El contenido no ha cambiado desde que se firmó">
                      ✓ Integridad verificada
                    </span>
                  )}
                  {integridad[id] === "alterado" && (
                    <span style={{ fontFamily: "Inter, sans-serif", fontSize: 10.5, fontWeight: 700, color: "#B42318" }} title="El contenido cambió después de la firma">
                      <Icono tipo="alerta" size={12} style={{ marginRight: 3, verticalAlign: -2 }} /> Modificado después de firmar
                    </span>
                  )}
                </div>
              </div>

              {firmantes.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
                  {firmantes.map((f, i) => (
                    <SelloFirma key={i} nombre={f.textoFirma} tipoId={f.tipoId} numeroId={f.numeroId} fecha={f.firmadoEn} rol={f.rol} />
                  ))}
                </div>
              )}

              {firmandoDocId === id && (
                <div style={{ marginBottom: 14, borderTop: `1px solid ${COLORS.border}`, paddingTop: 14 }}>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: COLORS.headingText, marginBottom: 10 }}>
                    Firmar como abogado responsable
                  </p>
                  <DocumentoTextoConFirmas
                    contenido={d.contenido}
                    firmantes={firmantes}
                    previewFirmante={previewAbogado ? { ...previewAbogado, textoFirma: nombreAbogado || "Tu firma" } : null}
                    onMovePreview={(pos) => setPreviewAbogado((p) => ({ ...p, ...pos }))}
                  />
                  <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                    <Field label="Tu nombre completo">
                      <input className="drx-input" style={inputStyle} value={nombreAbogado} onChange={(e) => setNombreAbogado(e.target.value)} />
                    </Field>
                    <Field label="Número de tarjeta profesional (opcional)">
                      <input className="drx-input" style={inputStyle} value={registroAbogado} onChange={(e) => setRegistroAbogado(e.target.value)} />
                    </Field>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button className="drx-btn-ghost" style={buttonGhost} onClick={() => { setFirmandoDocId(null); setPreviewAbogado(null); }}>
                      Cancelar
                    </button>
                    <button className="drx-btn-primary" style={buttonPrimary} onClick={() => confirmarFirmaAbogado(id)} disabled={!nombreAbogado.trim()}>
                      Confirmar mi firma
                    </button>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${COLORS.border}`, paddingTop: 10, flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted }}>Código para el cliente:</span>
                  <code
                    style={{
                      fontFamily: "monospace",
                      fontWeight: 700,
                      fontSize: 16,
                      letterSpacing: 1.5,
                      background: COLORS.accentSoft,
                      color: COLORS.navy,
                      border: `1px solid #C7D6EA`,
                      borderRadius: 6,
                      padding: "5px 12px",
                    }}
                  >
                    {id}
                  </code>
                  <button
                    className="drx-btn-ghost"
                    style={{ ...buttonGhost, padding: "6px 12px", fontSize: 12.5, fontWeight: 600 }}
                    onClick={() => copiarCodigo(id)}
                  >
                    {copiedId === id ? (
                      "¡Copiado! ✓"
                    ) : (
                      <>
                        <Icono tipo="portapapeles" size={13} style={{ marginRight: 4, verticalAlign: -2 }} /> Copiar código
                      </>
                    )}
                  </button>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {estado === "pendiente" && d.whatsappNumero && (
                    <button
                      className="drx-btn-primary"
                      style={{ ...buttonPrimary, padding: "6px 14px", fontSize: 12.5, background: "#1DA851" }}
                      onClick={() => enviarPorWhatsapp(d, id)}
                    >
                      Enviar por WhatsApp ↗
                    </button>
                  )}
                  {puedeFirmarAbogado && firmandoDocId !== id && (
                    <button className="drx-btn-primary" style={{ ...buttonPrimary, padding: "6px 14px", fontSize: 12.5 }} onClick={() => abrirFirmaAbogado(id)}>
                      Firmar documento
                    </button>
                  )}
                  {estado === "listo" && (
                    <>
                      <button className="drx-btn-ghost" style={{ ...buttonGhost, padding: "6px 14px", fontSize: 12.5 }} onClick={() => descargarPdfFirmado(d)}>
                        <Icono tipo="documento" size={13} style={{ marginRight: 4, verticalAlign: -2 }} /> Ver / descargar PDF firmado ↗
                      </button>
                      {d.whatsappNumero && (
                        <button
                          className="drx-btn-primary"
                          style={{ ...buttonPrimary, padding: "6px 14px", fontSize: 12.5, background: "#1DA851" }}
                          onClick={() => enviarDocumentoListoPorWhatsapp(d)}
                        >
                          Avisar al cliente ↗
                        </button>
                      )}
                    </>
                  )}
                  <button className="drx-btn-ghost" style={{ ...buttonGhost, padding: "4px 10px", fontSize: 12 }} onClick={() => empezarEdicionDoc(id)}>
                    Editar
                  </button>
                  <button className="drx-btn-ghost" style={{ ...buttonGhost, padding: "4px 10px", fontSize: 12 }} onClick={() => duplicarDocumento(id)} title="Crear un documento nuevo con el mismo contenido, sin firmas">
                    Duplicar
                  </button>
                  <button
                    className="drx-btn-ghost"
                    style={{ ...buttonGhost, padding: "4px 10px", fontSize: 12 }}
                    onClick={async () => {
                      if (!(await confirmar(`¿Eliminar "${d.titulo}"? Puedes recuperarlo después desde la Papelera.`))) return;
                      removeId(id);
                    }}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </Card>
          );
        })}
        {cargado && ids.length === 0 && !showForm && <EstadoVacio icono={<Icono tipo="lapiz" size={26} />} texto="Aún no has creado documentos para firma." />}
        {ids.length > 0 && idsFiltrados.length === 0 && (
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.muted, textAlign: "center" }}>Ningún documento coincide con "{filtro}".</p>
        )}
      </div>
      {ConfirmarDialogo}
    </div>
  );
}
