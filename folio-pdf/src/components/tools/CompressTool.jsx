import { useRef, useState } from "react";
import { fileToBytes, compressPdf, excedeTamano, MAX_FILE_MB } from "../../lib/pdfUtils.js";
import { IconUpload, IconFile, Spinner } from "../Icons.jsx";
import UploadNote from "../UploadNote.jsx";
import DownloadCard from "../DownloadCard.jsx";
import DropZone from "../DropZone.jsx";

export default function CompressTool() {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  function elegirArchivo(f) {
    if (f && excedeTamano(f)) {
      setError(`El archivo supera ${MAX_FILE_MB} MB.`);
      return;
    }
    setFile(f);
    setResult(null);
    setError("");
  }

  async function comprimir() {
    if (!file) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const original = await fileToBytes(file);
      const out = await compressPdf(original);
      setResult({ original: original.length, nuevo: out.length, bytes: out });
    } catch {
      setError("No se pudo comprimir el PDF. Puede estar dañado o protegido con contraseña.");
    } finally {
      setBusy(false);
    }
  }

  function kb(n) {
    return `${(n / 1024).toFixed(0)} KB`;
  }

  return (
    <div>
      <p style={{ color: "var(--muted)", fontSize: 13 }}>
        Compresión ligera: reduce el peso del archivo optimizando su estructura interna. No recomprime
        imágenes, así que el ahorro varía según el documento.
      </p>
      <DropZone onFiles={(files) => elegirArchivo(files[0])}>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          style={{ display: "none" }}
          onChange={(e) => elegirArchivo(e.target.files[0])}
        />
        <button className="btn-upload" onClick={() => inputRef.current.click()}>
          {file ? (
            <>
              <IconFile /> {file.name}
            </>
          ) : (
            <>
              <IconUpload /> Subir PDF
            </>
          )}
        </button>
      </DropZone>
      <UploadNote />

      {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{error}</p>}

      <button className="btn-primary" style={{ marginTop: 14, display: "block" }} onClick={comprimir} disabled={busy || !file}>
        {busy ? (
          <>
            <Spinner /> Comprimiendo…
          </>
        ) : (
          "Comprimir"
        )}
      </button>

      {result && (
        <>
          <p style={{ margin: "16px 0 0", fontSize: 13 }}>
            Original: <strong>{kb(result.original)}</strong> → Comprimido: <strong>{kb(result.nuevo)}</strong>
          </p>
          <DownloadCard
            bytes={result.bytes}
            defaultName="comprimido-folio.pdf"
            herramienta="Comprimir PDF"
            onDownloaded={() => {
              setFile(null);
              setResult(null);
            }}
          />
        </>
      )}
    </div>
  );
}
