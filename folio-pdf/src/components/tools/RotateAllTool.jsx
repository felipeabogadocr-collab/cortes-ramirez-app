import { useRef, useState } from "react";
import { fileToBytes, getPageCount, rotateAllPages, excedeTamano, MAX_FILE_MB } from "../../lib/pdfUtils.js";
import { IconUpload, IconRotate, Spinner } from "../Icons.jsx";
import UploadNote from "../UploadNote.jsx";
import DownloadCard from "../DownloadCard.jsx";
import DropZone from "../DropZone.jsx";

export default function RotateAllTool() {
  const [bytes, setBytes] = useState(null);
  const [total, setTotal] = useState(0);
  const [angulo, setAngulo] = useState(90);
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

  async function rotar() {
    setBusy(true);
    setError("");
    setResultado(null);
    try {
      const out = await rotateAllPages(bytes, angulo);
      setResultado(out);
    } catch {
      setError("No se pudo rotar el PDF.");
    } finally {
      setBusy(false);
    }
  }

  if (!bytes) {
    return (
      <div>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          Sube un PDF para girar TODAS sus páginas de una vez (útil cuando un documento escaneado quedó de lado).
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

      <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8 }}>Girar todas las páginas</label>
      <div className="sign-tabs">
        {[90, 180, 270].map((a) => (
          <button
            key={a}
            className={`sign-tab ${angulo === a ? "active" : ""}`}
            onClick={() => {
              setAngulo(a);
              setResultado(null);
            }}
          >
            <IconRotate size={13} /> {a}°
          </button>
        ))}
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{error}</p>}

      <button className="btn-primary" style={{ marginTop: 16 }} onClick={rotar} disabled={busy}>
        {busy ? (
          <>
            <Spinner /> Girando…
          </>
        ) : (
          `Girar ${angulo}°`
        )}
      </button>

      {resultado && (
        <DownloadCard
          bytes={resultado}
          defaultName="rotado-folio.pdf"
          herramienta="Rotar PDF"
          onDownloaded={limpiarTodo}
        />
      )}
    </div>
  );
}
