import { useRef, useState } from "react";
import { fileToBytes, renderThumbnails, organizePdf, extractPage, downloadBytes } from "../../lib/pdfUtils.js";

export default function OrganizeTool() {
  const [bytes, setBytes] = useState(null);
  const [pages, setPages] = useState([]); // { index, rotation, deleted, thumb }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  async function cargar(file) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const buf = await fileToBytes(file);
      const thumbs = await renderThumbnails(buf);
      setBytes(buf);
      setPages(thumbs.map((thumb, index) => ({ index, rotation: 0, deleted: false, thumb })));
    } catch (e) {
      setError("No se pudo leer el PDF. Puede estar dañado o protegido con contraseña.");
    } finally {
      setBusy(false);
    }
  }

  function mover(i, dir) {
    setPages((prev) => {
      const arr = [...prev];
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr;
    });
  }

  function rotar(i) {
    setPages((prev) => prev.map((p, idx) => (idx === i ? { ...p, rotation: (p.rotation + 90) % 360 } : p)));
  }

  function alternarEliminar(i) {
    setPages((prev) => prev.map((p, idx) => (idx === i ? { ...p, deleted: !p.deleted } : p)));
  }

  async function extraer(i) {
    try {
      const out = await extractPage(bytes, pages[i].index);
      downloadBytes(out, `pagina-${pages[i].index + 1}.pdf`);
    } catch {
      setError("No se pudo extraer esa página.");
    }
  }

  async function guardar() {
    if (pages.every((p) => p.deleted)) {
      setError("No puedes eliminar todas las páginas.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const out = await organizePdf(bytes, pages);
      downloadBytes(out, "organizado-folio.pdf");
    } catch {
      setError("No se pudo guardar el PDF organizado.");
    } finally {
      setBusy(false);
    }
  }

  if (!bytes) {
    return (
      <div>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          Sube un PDF para reordenar, rotar, eliminar o extraer páginas.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          style={{ display: "none" }}
          onChange={(e) => cargar(e.target.files[0])}
        />
        <button className="btn-ghost" onClick={() => inputRef.current.click()} disabled={busy}>
          {busy ? "Cargando…" : "+ Subir PDF"}
        </button>
        {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>{pages.length} páginas — reordena, rota o elimina.</p>
        <button className="btn-ghost" onClick={() => { setBytes(null); setPages([]); }}>
          Cambiar archivo
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
        {pages.map((p, i) => (
          <div
            key={p.index}
            className="card"
            style={{ padding: 8, opacity: p.deleted ? 0.4 : 1, position: "relative" }}
          >
            <img
              src={p.thumb}
              alt={`Página ${p.index + 1}`}
              style={{ width: "100%", borderRadius: 6, transform: `rotate(${p.rotation}deg)`, transition: "transform 0.2s" }}
            />
            <div style={{ textAlign: "center", fontSize: 11, color: "var(--muted)", margin: "6px 0" }}>
              Original #{p.index + 1}
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
              <button className="btn-icon" onClick={() => mover(i, -1)} title="Mover antes" disabled={i === 0}>↑</button>
              <button className="btn-icon" onClick={() => mover(i, 1)} title="Mover después" disabled={i === pages.length - 1}>↓</button>
              <button className="btn-icon" onClick={() => rotar(i)} title="Rotar 90°">⟳</button>
              <button className="btn-icon" onClick={() => extraer(i)} title="Extraer esta página">⇩</button>
              <button className="btn-icon" onClick={() => alternarEliminar(i)} title={p.deleted ? "Restaurar" : "Eliminar"}>
                {p.deleted ? "↺" : "✕"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{error}</p>}

      <button className="btn-primary" style={{ marginTop: 16 }} onClick={guardar} disabled={busy}>
        {busy ? "Guardando…" : "Guardar y descargar PDF"}
      </button>
    </div>
  );
}
