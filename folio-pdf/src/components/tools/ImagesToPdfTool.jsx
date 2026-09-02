import { useRef, useState } from "react";
import { imagesToPdf, excedeTamano, MAX_FILE_MB } from "../../lib/pdfUtils.js";
import { IconUpload, Spinner, IconRotate } from "../Icons.jsx";
import UploadNote from "../UploadNote.jsx";
import DownloadCard from "../DownloadCard.jsx";
import DropZone from "../DropZone.jsx";

export default function ImagesToPdfTool() {
  const [files, setFiles] = useState([]); // { file, rotation, url }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState(null);
  const inputRef = useRef(null);

  function addFiles(fileList) {
    const candidatos = Array.from(fileList).filter((f) => f.type === "image/png" || f.type === "image/jpeg");
    const validos = candidatos.filter((f) => !excedeTamano(f));
    const nuevos = validos.map((f) => ({ file: f, rotation: 0, url: URL.createObjectURL(f) }));
    setFiles((prev) => [...prev, ...nuevos]);
    setError(candidatos.length > validos.length ? `Algunas imágenes superan ${MAX_FILE_MB} MB y no se agregaron.` : "");
    setResultado(null);
  }

  function mover(i, dir) {
    setFiles((prev) => {
      const arr = [...prev];
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr;
    });
    setResultado(null);
  }

  function rotar(i) {
    setFiles((prev) => prev.map((p, idx) => (idx === i ? { ...p, rotation: (p.rotation + 90) % 360 } : p)));
    setResultado(null);
  }

  function quitar(i) {
    setFiles((prev) => {
      const item = prev[i];
      if (item) URL.revokeObjectURL(item.url);
      return prev.filter((_, idx) => idx !== i);
    });
    setResultado(null);
  }

  function limpiarTodo() {
    files.forEach((f) => URL.revokeObjectURL(f.url));
    setFiles([]);
    setResultado(null);
  }

  async function convertir() {
    if (!files.length) {
      setError("Agrega al menos una imagen (JPG o PNG).");
      return;
    }
    setBusy(true);
    setError("");
    setResultado(null);
    try {
      const bytes = await imagesToPdf(files);
      setResultado(bytes);
    } catch {
      setError("No se pudo generar el PDF. Verifica que las imágenes sean JPG o PNG.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p style={{ color: "var(--muted)", fontSize: 13 }}>
        Sube fotos o imágenes (JPG/PNG) — cada una se convierte en una página del PDF, en el orden que definas. Puedes rotarlas antes de generar el PDF.
      </p>
      <DropZone onFiles={addFiles}>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg"
          multiple
          style={{ display: "none" }}
          onChange={(e) => addFiles(e.target.files)}
        />
        <button className="btn-upload" onClick={() => inputRef.current.click()}>
          <IconUpload /> Agregar imágenes
        </button>
      </DropZone>
      <UploadNote />

      {files.length === 0 && (
        <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 14, textAlign: "center" }}>
          Aún no has agregado imágenes.
        </p>
      )}

      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10 }}>
        {files.map((f, i) => (
          <div key={i} className="card" style={{ padding: 6 }}>
            <div style={{ overflow: "hidden", borderRadius: 6, aspectRatio: "1" }}>
              <img
                src={f.url}
                alt={f.file.name}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  transform: `rotate(${f.rotation}deg)`,
                  transition: "transform 0.2s",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 6, flexWrap: "wrap" }}>
              <button className="btn-icon" onClick={() => mover(i, -1)} disabled={i === 0} title="Mover antes">↑</button>
              <button className="btn-icon" onClick={() => mover(i, 1)} disabled={i === files.length - 1} title="Mover después">↓</button>
              <button className="btn-icon" onClick={() => rotar(i)} title="Rotar 90°">
                <IconRotate size={13} />
              </button>
              <button className="btn-icon" onClick={() => quitar(i)} title="Quitar">✕</button>
            </div>
          </div>
        ))}
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{error}</p>}

      <button className="btn-primary" style={{ marginTop: 16 }} onClick={convertir} disabled={busy || !files.length}>
        {busy ? (
          <>
            <Spinner /> Generando…
          </>
        ) : (
          "Convertir a PDF"
        )}
      </button>

      {resultado && (
        <DownloadCard
          bytes={resultado}
          defaultName="imagenes-folio.pdf"
          herramienta="Imágenes a PDF"
          onDownloaded={limpiarTodo}
        />
      )}
    </div>
  );
}
