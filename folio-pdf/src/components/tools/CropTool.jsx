import { useEffect, useRef, useState } from "react";
import { fileToBytes, getPageCount, cropPdf, excedeTamano, MAX_FILE_MB } from "../../lib/pdfUtils.js";
import { IconUpload, IconCrop, Spinner } from "../Icons.jsx";
import UploadNote from "../UploadNote.jsx";
import DownloadCard from "../DownloadCard.jsx";
import DropZone from "../DropZone.jsx";

const OPCIONES = [5, 10, 15, 20];

export default function CropTool({ chainedFile, onConsumedChain, onSendTo }) {
  const [bytes, setBytes] = useState(null);
  const [total, setTotal] = useState(0);
  const [margen, setMargen] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState(null);
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
      const n = await getPageCount(buf);
      setBytes(buf);
      setTotal(n);
    } catch {
      setError("No se pudo leer el PDF. Puede estar dañado o protegido con contraseña.");
    } finally {
      setBusy(false);
    }
  }

  function limpiarTodo() {
    setBytes(null);
    setTotal(0);
    setResultado(null);
  }

  async function recortar() {
    setBusy(true);
    setError("");
    setResultado(null);
    try {
      const out = await cropPdf(bytes, margen);
      setResultado(out);
    } catch {
      setError("No se pudo recortar el PDF.");
    } finally {
      setBusy(false);
    }
  }

  if (!bytes) {
    return (
      <div>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          Sube un PDF para quitar márgenes o bordes blancos/negros de todas sus páginas (muy útil en documentos escaneados).
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
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>El PDF tiene {total} páginas.</p>
        <button className="btn-ghost" onClick={limpiarTodo}>
          Cambiar archivo
        </button>
      </div>

      <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8 }}>
        Margen a recortar en cada borde
      </label>
      <div className="sign-tabs">
        {OPCIONES.map((m) => (
          <button
            key={m}
            className={`sign-tab ${margen === m ? "active" : ""}`}
            onClick={() => {
              setMargen(m);
              setResultado(null);
            }}
          >
            <IconCrop size={13} /> {m}%
          </button>
        ))}
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{error}</p>}

      <button className="btn-primary" style={{ marginTop: 16 }} onClick={recortar} disabled={busy}>
        {busy ? (
          <>
            <Spinner /> Recortando…
          </>
        ) : (
          `Recortar ${margen}%`
        )}
      </button>

      {resultado && (
        <DownloadCard
          bytes={resultado}
          defaultName="recortado-folio.pdf"
          herramienta="Recortar PDF"
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
