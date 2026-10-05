import { useState } from "react";
import { downloadBytes } from "../lib/pdfUtils.js";
import { IconCheck, IconArrowRight } from "./Icons.jsx";

const MAX_NOMBRE = 120;

function splitExt(filename) {
  const idx = filename.lastIndexOf(".");
  if (idx <= 0) return [filename, ""];
  return [filename.slice(0, idx), filename.slice(idx)];
}

// Quita caracteres inválidos/peligrosos en nombres de archivo (separadores de
// ruta, comodines, puntos/espacios al borde) y limita el largo.
function sanitizar(nombre) {
  return nombre
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, MAX_NOMBRE);
}

// Tarjeta que aparece cuando un archivo ya está listo: deja revisar/cambiar
// el nombre y solo dispara la descarga real con un clic directo del usuario
// (necesario para que funcione bien en Safari de iOS).
export default function DownloadCard({
  bytes,
  defaultName,
  mime = "application/pdf",
  herramienta,
  onDownloaded,
  chainOptions,
  onChain,
  style,
}) {
  const [base, ext] = splitExt(defaultName);
  const [nombre, setNombre] = useState(base);

  function descargar() {
    const limpio = sanitizar(nombre) || sanitizar(base) || "documento-folio";
    downloadBytes(bytes, `${limpio}${ext}`, mime, herramienta);
    if (onDownloaded) onDownloaded();
  }

  function enviar(toolId) {
    const limpio = sanitizar(nombre) || sanitizar(base) || "documento-folio";
    onChain(toolId, bytes, `${limpio}${ext}`, mime);
  }

  return (
    <div className="card fade-in" style={{ marginTop: 16, padding: 14, ...style }}>
      <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ color: "var(--accent)", display: "inline-flex" }}>
          <IconCheck size={15} />
        </span>
        Tu archivo está listo. Puedes cambiarle el nombre antes de descargarlo.
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          maxLength={MAX_NOMBRE}
          style={{
            flex: 1,
            minWidth: 0,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "var(--bg)",
            color: "var(--text)",
            fontSize: 14,
          }}
        />
        <span style={{ fontSize: 13, color: "var(--muted)", flexShrink: 0 }}>{ext}</span>
      </div>
      <button className="btn-primary" onClick={descargar}>
        Descargar {ext.replace(".", "").toUpperCase() || "archivo"}
      </button>

      {chainOptions && chainOptions.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          {chainOptions.map((opt) => (
            <button key={opt.id} className="btn-ghost" style={{ fontSize: 12 }} onClick={() => enviar(opt.id)}>
              {opt.label} <IconArrowRight size={11} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
