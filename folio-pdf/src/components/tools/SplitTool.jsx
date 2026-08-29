import { useRef, useState } from "react";
import JSZip from "jszip";
import { fileToBytes, getPageCount, splitPdf, downloadBytes } from "../../lib/pdfUtils.js";
import { IconUpload } from "../Icons.jsx";
import UploadNote from "../UploadNote.jsx";

export default function SplitTool() {
  const [bytes, setBytes] = useState(null);
  const [total, setTotal] = useState(0);
  const [rangos, setRangos] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState(null);
  const inputRef = useRef(null);

  async function cargar(file) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const buf = await fileToBytes(file);
      const n = await getPageCount(buf);
      setBytes(buf);
      setTotal(n);
      setRangos(`1-${n}`);
    } catch {
      setError("No se pudo leer el PDF. Puede estar dañado o protegido con contraseña.");
    } finally {
      setBusy(false);
    }
  }

  function parseRangos(texto, max) {
    const partes = texto.split(",").map((s) => s.trim()).filter(Boolean);
    const out = [];
    for (const parte of partes) {
      const m = parte.match(/^(\d+)(?:-(\d+))?$/);
      if (!m) throw new Error(`Rango inválido: "${parte}"`);
      const start = parseInt(m[1], 10);
      const end = m[2] ? parseInt(m[2], 10) : start;
      if (start < 1 || end > max || start > end) throw new Error(`Rango fuera de 1-${max}: "${parte}"`);
      out.push([start, end]);
    }
    if (!out.length) throw new Error("Escribe al menos un rango, ej: 1-3, 4-6");
    return out;
  }

  async function dividir() {
    setBusy(true);
    setError("");
    setResultado(null);
    try {
      const ranges = parseRangos(rangos, total);
      const partes = await splitPdf(bytes, ranges);
      if (partes.length === 1) {
        setResultado({ bytes: partes[0], filename: "parte-1.pdf", mime: "application/pdf" });
      } else {
        const zip = new JSZip();
        partes.forEach((p, i) => zip.file(`parte-${i + 1}.pdf`, p));
        const zipBytes = await zip.generateAsync({ type: "uint8array" });
        setResultado({ bytes: zipBytes, filename: "pdf-dividido-folio.zip", mime: "application/zip" });
      }
    } catch (e) {
      setError(e.message || "No se pudo dividir el PDF.");
    } finally {
      setBusy(false);
    }
  }

  if (!bytes) {
    return (
      <div>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>Sube un PDF para dividirlo en varios archivos por rango de páginas.</p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          style={{ display: "none" }}
          onChange={(e) => cargar(e.target.files[0])}
        />
        <button className="btn-upload" onClick={() => inputRef.current.click()} disabled={busy}>
          {busy ? (
            "Cargando…"
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
        <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>El PDF tiene {total} páginas.</p>
        <button className="btn-ghost" onClick={() => { setBytes(null); setResultado(null); }}>
          Cambiar archivo
        </button>
      </div>

      <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
        Rangos de páginas (separados por coma)
      </label>
      <input
        value={rangos}
        onChange={(e) => {
          setRangos(e.target.value);
          setResultado(null);
        }}
        placeholder="Ej: 1-3, 4-6, 7"
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid var(--border)",
          background: "var(--bg)",
          color: "var(--text)",
          fontSize: 14,
        }}
      />
      <p style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 6 }}>
        Cada rango se descarga como un PDF aparte. Si defines más de uno, se te entregan en un .zip.
      </p>

      {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{error}</p>}

      <button className="btn-primary" style={{ marginTop: 12 }} onClick={dividir} disabled={busy}>
        {busy ? "Dividiendo…" : "Dividir PDF"}
      </button>

      {resultado && (
        <div className="card" style={{ marginTop: 16, padding: 14 }}>
          <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--muted)" }}>
            Tu archivo está listo. Toca el botón para descargarlo.
          </p>
          <button
            className="btn-primary"
            onClick={() => downloadBytes(resultado.bytes, resultado.filename, resultado.mime, "Dividir PDF")}
          >
            Descargar {resultado.filename.endsWith(".zip") ? "ZIP" : "PDF"}
          </button>
        </div>
      )}
    </div>
  );
}
