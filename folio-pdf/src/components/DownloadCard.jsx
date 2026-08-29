import { useState } from "react";
import { downloadBytes } from "../lib/pdfUtils.js";
import { IconFile } from "./Icons.jsx";

function splitExt(filename) {
  const idx = filename.lastIndexOf(".");
  if (idx <= 0) return [filename, ""];
  return [filename.slice(0, idx), filename.slice(idx)];
}

// Tarjeta que aparece cuando un archivo ya está listo: deja revisar/cambiar
// el nombre y solo dispara la descarga real con un clic directo del usuario
// (necesario para que funcione bien en Safari de iOS).
export default function DownloadCard({ bytes, defaultName, mime = "application/pdf", herramienta, style }) {
  const [base, ext] = splitExt(defaultName);
  const [nombre, setNombre] = useState(base);

  function descargar() {
    const limpio = (nombre.trim() || base).replace(/[\\/:*?"<>|]/g, "-");
    downloadBytes(bytes, `${limpio}${ext}`, mime, herramienta);
  }

  return (
    <div className="card" style={{ marginTop: 16, padding: 14, ...style }}>
      <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
        <IconFile size={15} /> Tu archivo está listo. Puedes cambiarle el nombre antes de descargarlo.
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
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
        Descargar {ext === ".zip" ? "ZIP" : "PDF"}
      </button>
    </div>
  );
}
