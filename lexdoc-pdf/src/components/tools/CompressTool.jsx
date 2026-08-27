import { useRef, useState } from "react";
import { fileToBytes, compressPdf, downloadBytes } from "../../lib/pdfUtils.js";

export default function CompressTool() {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

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
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        style={{ display: "none" }}
        onChange={(e) => {
          setFile(e.target.files[0]);
          setResult(null);
          setError("");
        }}
      />
      <button className="btn-ghost" onClick={() => inputRef.current.click()}>
        {file ? file.name : "+ Subir PDF"}
      </button>

      {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{error}</p>}

      <button className="btn-primary" style={{ marginTop: 14, display: "block" }} onClick={comprimir} disabled={busy || !file}>
        {busy ? "Comprimiendo…" : "Comprimir"}
      </button>

      {result && (
        <div className="card" style={{ marginTop: 16, padding: 14, fontSize: 13 }}>
          <p style={{ margin: "0 0 6px" }}>
            Original: <strong>{kb(result.original)}</strong> → Comprimido: <strong>{kb(result.nuevo)}</strong>
          </p>
          <button className="btn-primary" onClick={() => downloadBytes(result.bytes, "comprimido-litia.pdf")}>
            Descargar PDF comprimido
          </button>
        </div>
      )}
    </div>
  );
}
