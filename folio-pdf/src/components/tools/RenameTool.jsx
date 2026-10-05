import { useEffect, useRef, useState } from "react";
import { fileToBytes, excedeTamano, MAX_FILE_MB } from "../../lib/pdfUtils.js";
import { IconUpload, Spinner } from "../Icons.jsx";
import UploadNote from "../UploadNote.jsx";
import DownloadCard from "../DownloadCard.jsx";
import DropZone from "../DropZone.jsx";

export default function RenameTool({ chainedFile, onConsumedChain, onSendTo }) {
  const [bytes, setBytes] = useState(null);
  const [nombreOriginal, setNombreOriginal] = useState("documento.pdf");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (chainedFile) {
      cargar(chainedFile);
      onConsumedChain?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainedFile]);

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
      setBytes(buf);
      setNombreOriginal(file.name || "documento.pdf");
    } catch {
      setError("No se pudo leer el PDF. Puede estar dañado o protegido con contraseña.");
    } finally {
      setBusy(false);
    }
  }

  function limpiarTodo() {
    setBytes(null);
    setNombreOriginal("documento.pdf");
  }

  return (
    <div>
      <p style={{ color: "var(--muted)", fontSize: 13 }}>
        Sube un PDF y ponle el nombre que quieras — el contenido no cambia, solo el nombre del archivo.
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
              <Spinner /> Cargando…
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

      {bytes && (
        <DownloadCard
          bytes={bytes}
          defaultName={nombreOriginal}
          herramienta="Renombrar PDF"
          onDownloaded={limpiarTodo}
          chainOptions={
            onSendTo
              ? [
                  { id: "comprimir", label: "Comprimir este PDF" },
                  { id: "firmar", label: "Firmar este PDF" },
                ]
              : null
          }
          onChain={onSendTo}
        />
      )}
    </div>
  );
}
