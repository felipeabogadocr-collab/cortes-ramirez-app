import { useRef, useState } from "react";
import JSZip from "jszip";
import { fileToBytes, renderThumbnails, renderPageImages, excedeTamano, MAX_FILE_MB } from "../../lib/pdfUtils.js";
import { IconUpload, Spinner, IconCheck } from "../Icons.jsx";
import UploadNote from "../UploadNote.jsx";
import DownloadCard from "../DownloadCard.jsx";

export default function PdfToImagesTool() {
  const [bytes, setBytes] = useState(null);
  const [thumbs, setThumbs] = useState([]);
  const [seleccionadas, setSeleccionadas] = useState(new Set());
  const [formato, setFormato] = useState("png");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState(null);
  const inputRef = useRef(null);

  async function cargar(file) {
    if (!file) return;
    if (excedeTamano(file)) {
      setError(`El archivo supera ${MAX_FILE_MB} MB.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const buf = await fileToBytes(file);
      const t = await renderThumbnails(buf);
      setBytes(buf);
      setThumbs(t);
      setSeleccionadas(new Set(t.map((_, i) => i)));
    } catch {
      setError("No se pudo leer el PDF. Puede estar dañado o protegido con contraseña.");
    } finally {
      setBusy(false);
    }
  }

  function alternar(i) {
    setResultado(null);
    setSeleccionadas((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function limpiarTodo() {
    setBytes(null);
    setThumbs([]);
    setSeleccionadas(new Set());
    setResultado(null);
  }

  async function convertir() {
    if (!seleccionadas.size) {
      setError("Elige al menos una página.");
      return;
    }
    setBusy(true);
    setError("");
    setResultado(null);
    try {
      const indices = Array.from(seleccionadas).sort((a, b) => a - b);
      const imagenes = await renderPageImages(bytes, { scale: 2, format: formato, pageIndexes: indices });
      const ext = formato === "jpg" ? "jpg" : "png";
      if (imagenes.length === 1) {
        setResultado({
          bytes: imagenes[0].bytes,
          filename: `pagina-${imagenes[0].index + 1}.${ext}`,
          mime: formato === "jpg" ? "image/jpeg" : "image/png",
        });
      } else {
        const zip = new JSZip();
        imagenes.forEach((img) => zip.file(`pagina-${img.index + 1}.${ext}`, img.bytes));
        const zipBytes = await zip.generateAsync({ type: "uint8array" });
        setResultado({ bytes: zipBytes, filename: "paginas-folio.zip", mime: "application/zip" });
      }
    } catch {
      setError("No se pudieron generar las imágenes.");
    } finally {
      setBusy(false);
    }
  }

  if (!bytes) {
    return (
      <div>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          Sube un PDF para convertir sus páginas en imágenes JPG o PNG.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          style={{ display: "none" }}
          onChange={(e) => cargar(e.target.files[0])}
        />
        <button className="btn-upload" onClick={() => inputRef.current.click()} disabled={busy}>
          {busy ? (
            <>
              <Spinner /> Cargando…
            </>
          ) : (
            <>
              <IconUpload /> Subir PDF
            </>
          )}
        </button>
        <UploadNote />
        {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>
          {thumbs.length} páginas — elige cuáles convertir.
        </p>
        <button className="btn-ghost" onClick={limpiarTodo}>
          Cambiar archivo
        </button>
      </div>

      <div className="sign-tabs">
        <button className={`sign-tab ${formato === "png" ? "active" : ""}`} onClick={() => setFormato("png")}>
          PNG
        </button>
        <button className={`sign-tab ${formato === "jpg" ? "active" : ""}`} onClick={() => setFormato("jpg")}>
          JPG
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
        {thumbs.map((thumb, i) => {
          const elegida = seleccionadas.has(i);
          return (
            <button
              key={i}
              type="button"
              className="card"
              onClick={() => alternar(i)}
              style={{
                padding: 8,
                cursor: "pointer",
                textAlign: "left",
                borderColor: elegida ? "var(--brand-2)" : "var(--border)",
                boxShadow: elegida ? "0 0 0 2px var(--brand-2)" : "none",
                position: "relative",
              }}
            >
              {elegida && (
                <span
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: "var(--brand-2)",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <IconCheck size={11} />
                </span>
              )}
              <img src={thumb} alt={`Página ${i + 1}`} style={{ width: "100%", borderRadius: 6, opacity: elegida ? 1 : 0.45 }} />
              <div style={{ textAlign: "center", fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
                Página {i + 1}
              </div>
            </button>
          );
        })}
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{error}</p>}

      <button className="btn-primary" style={{ marginTop: 16 }} onClick={convertir} disabled={busy || !seleccionadas.size}>
        {busy ? (
          <>
            <Spinner /> Generando…
          </>
        ) : (
          `Convertir ${seleccionadas.size > 1 ? `${seleccionadas.size} páginas` : "página"} a ${formato.toUpperCase()}`
        )}
      </button>

      {resultado && (
        <DownloadCard
          bytes={resultado.bytes}
          defaultName={resultado.filename}
          mime={resultado.mime}
          herramienta="PDF a Imágenes"
          onDownloaded={limpiarTodo}
        />
      )}
    </div>
  );
}
