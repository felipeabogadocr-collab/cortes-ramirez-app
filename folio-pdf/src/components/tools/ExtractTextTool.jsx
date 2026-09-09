import { useRef, useState } from "react";
import { fileToBytes, extractText, excedeTamano, MAX_FILE_MB } from "../../lib/pdfUtils.js";
import { IconUpload, Spinner } from "../Icons.jsx";
import UploadNote from "../UploadNote.jsx";
import DownloadCard from "../DownloadCard.jsx";
import DropZone from "../DropZone.jsx";

export default function ExtractTextTool() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [texto, setTexto] = useState(null);
  const inputRef = useRef(null);

  async function cargar(file) {
    if (!file) return;
    if (excedeTamano(file)) {
      setError(`El archivo supera ${MAX_FILE_MB} MB.`);
      return;
    }
    setBusy(true);
    setError("");
    setTexto(null);
    try {
      const buf = await fileToBytes(file);
      const contenido = await extractText(buf);
      if (!contenido.trim()) {
        setError(
          "No se encontró texto en este PDF. Puede ser un documento escaneado (una imagen), del cual no se puede extraer texto sin OCR."
        );
        return;
      }
      setTexto(contenido);
    } catch {
      setError("No se pudo leer el PDF. Puede estar dañado o protegido con contraseña.");
    } finally {
      setBusy(false);
    }
  }

  const resultado = texto ? new TextEncoder().encode(texto) : null;

  return (
    <div>
      <p style={{ color: "var(--muted)", fontSize: 13 }}>
        Saca el texto legible de un PDF para copiarlo o descargarlo en un archivo .txt. No conserva formato — solo texto plano.
      </p>
      <DropZone onFiles={(files) => cargar(files[0])} disabled={busy}>
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
              <Spinner /> Extrayendo…
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

      {texto && (
        <>
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", margin: "16px 0 6px" }}>
            Texto extraído (puedes seleccionarlo y copiarlo)
          </label>
          <textarea
            readOnly
            value={texto}
            style={{
              width: "100%",
              minHeight: 220,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text)",
              fontSize: 13,
              lineHeight: 1.5,
              fontFamily: "inherit",
              resize: "vertical",
            }}
          />
          <DownloadCard
            bytes={resultado}
            defaultName="texto-folio.txt"
            mime="text/plain"
            herramienta="Extraer texto"
            onDownloaded={() => setTexto(null)}
          />
        </>
      )}
    </div>
  );
}
