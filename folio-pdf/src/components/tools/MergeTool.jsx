import { useRef, useState } from "react";
import { mergePdfs } from "../../lib/pdfUtils.js";
import { IconUpload } from "../Icons.jsx";
import UploadNote from "../UploadNote.jsx";
import DownloadCard from "../DownloadCard.jsx";

export default function MergeTool() {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState(null);
  const inputRef = useRef(null);

  function addFiles(fileList) {
    const nuevos = Array.from(fileList).filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    setFiles((prev) => [...prev, ...nuevos]);
    setError("");
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
  }

  function quitar(i) {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function unir() {
    if (files.length < 2) {
      setError("Agrega al menos 2 archivos PDF.");
      return;
    }
    setBusy(true);
    setError("");
    setResultado(null);
    try {
      const bytes = await mergePdfs(files);
      setResultado(bytes);
    } catch (e) {
      setError("No se pudo unir el PDF. Verifica que los archivos no estén dañados o protegidos con contraseña.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p style={{ color: "var(--muted)", fontSize: 13 }}>
        Selecciona 2 o más archivos PDF y ordénalos como quieras antes de unirlos.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        multiple
        style={{ display: "none" }}
        onChange={(e) => addFiles(e.target.files)}
      />
      <button className="btn-upload" onClick={() => inputRef.current.click()}>
        <IconUpload /> Agregar PDF
      </button>
      <UploadNote />

      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
        {files.map((f, i) => (
          <div
            key={i}
            className="card"
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", fontSize: 13 }}
          >
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {i + 1}. {f.name}
            </span>
            <button className="btn-icon" onClick={() => mover(i, -1)} title="Subir" disabled={i === 0}>
              ↑
            </button>
            <button className="btn-icon" onClick={() => mover(i, 1)} title="Bajar" disabled={i === files.length - 1}>
              ↓
            </button>
            <button className="btn-icon" onClick={() => quitar(i)} title="Quitar">
              ✕
            </button>
          </div>
        ))}
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{error}</p>}

      <button className="btn-primary" style={{ marginTop: 16 }} onClick={unir} disabled={busy || files.length < 2}>
        {busy ? "Uniendo…" : "Unir PDF"}
      </button>

      {resultado && (
        <DownloadCard bytes={resultado} defaultName="unido-folio.pdf" herramienta="Unir PDF" />
      )}
    </div>
  );
}
