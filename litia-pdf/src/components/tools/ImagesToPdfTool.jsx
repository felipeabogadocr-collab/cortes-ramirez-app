import { useRef, useState } from "react";
import { imagesToPdf, downloadBytes } from "../../lib/pdfUtils.js";

export default function ImagesToPdfTool() {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  function addFiles(fileList) {
    const nuevos = Array.from(fileList).filter((f) => f.type === "image/png" || f.type === "image/jpeg");
    setFiles((prev) => [...prev, ...nuevos]);
    setError("");
  }

  function mover(i, dir) {
    setFiles((prev) => {
      const arr = [...prev];
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr;
    });
  }

  function quitar(i) {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function convertir() {
    if (!files.length) {
      setError("Agrega al menos una imagen (JPG o PNG).");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const bytes = await imagesToPdf(files);
      downloadBytes(bytes, "imagenes-litia.pdf");
    } catch {
      setError("No se pudo generar el PDF. Verifica que las imágenes sean JPG o PNG.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p style={{ color: "var(--muted)", fontSize: 13 }}>
        Sube fotos o imágenes (JPG/PNG) — cada una se convierte en una página del PDF, en el orden que definas.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        multiple
        style={{ display: "none" }}
        onChange={(e) => addFiles(e.target.files)}
      />
      <button className="btn-ghost" onClick={() => inputRef.current.click()}>
        + Agregar imágenes
      </button>

      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10 }}>
        {files.map((f, i) => (
          <div key={i} className="card" style={{ padding: 6 }}>
            <img src={URL.createObjectURL(f)} alt={f.name} style={{ width: "100%", borderRadius: 6, aspectRatio: "1", objectFit: "cover" }} />
            <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 6 }}>
              <button className="btn-icon" onClick={() => mover(i, -1)} disabled={i === 0}>↑</button>
              <button className="btn-icon" onClick={() => mover(i, 1)} disabled={i === files.length - 1}>↓</button>
              <button className="btn-icon" onClick={() => quitar(i)}>✕</button>
            </div>
          </div>
        ))}
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{error}</p>}

      <button className="btn-primary" style={{ marginTop: 16 }} onClick={convertir} disabled={busy || !files.length}>
        {busy ? "Generando…" : "Convertir a PDF y descargar"}
      </button>
    </div>
  );
}
