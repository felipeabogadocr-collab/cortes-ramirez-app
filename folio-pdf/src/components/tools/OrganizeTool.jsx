import { useEffect, useRef, useState } from "react";
import { fileToBytes, renderThumbnails, organizePdf, extractPage, excedeTamano, MAX_FILE_MB } from "../../lib/pdfUtils.js";
import { IconUpload, IconRotate, Spinner } from "../Icons.jsx";
import UploadNote from "../UploadNote.jsx";
import DownloadCard from "../DownloadCard.jsx";
import DropZone from "../DropZone.jsx";

export default function OrganizeTool({ chainedFile, onConsumedChain, onSendTo }) {
  const [bytes, setBytes] = useState(null);
  const [pages, setPages] = useState([]); // { index, rotation, deleted, thumb }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState(null);
  const [paginaExtraida, setPaginaExtraida] = useState(null);
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
    setResultado(null);
    setPages((prev) => {
      const arr = [...prev];
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr;
    });
  }

  function rotar(i) {
    setResultado(null);
    setPages((prev) => prev.map((p, idx) => (idx === i ? { ...p, rotation: (p.rotation + 90) % 360 } : p)));
  }

  function alternarEliminar(i) {
    setResultado(null);
    setPages((prev) => prev.map((p, idx) => (idx === i ? { ...p, deleted: !p.deleted } : p)));
  }

  async function extraer(i) {
    try {
      const out = await extractPage(bytes, pages[i].index);
      setPaginaExtraida({ bytes: out, filename: `pagina-${pages[i].index + 1}.pdf` });
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
    setResultado(null);
    try {
      const out = await organizePdf(bytes, pages);
      setResultado(out);
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
        <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>{pages.length} páginas — reordena, rota o elimina.</p>
        <button
          className="btn-ghost"
          onClick={() => {
            setBytes(null);
            setPages([]);
            setResultado(null);
            setPaginaExtraida(null);
          }}
        >
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
              <button className="btn-icon" onClick={() => rotar(i)} title="Rotar 90°">
                <IconRotate size={13} />
              </button>
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
        {busy ? (
          <>
            <Spinner /> Guardando…
          </>
        ) : (
          "Guardar cambios"
        )}
      </button>

      {paginaExtraida && (
        <DownloadCard
          bytes={paginaExtraida.bytes}
          defaultName={paginaExtraida.filename}
          herramienta="Organizar páginas"
          onDownloaded={() => setPaginaExtraida(null)}
        />
      )}

      {resultado && (
        <DownloadCard
          bytes={resultado}
          defaultName="organizado-folio.pdf"
          herramienta="Organizar páginas"
          onDownloaded={() => {
            setBytes(null);
            setPages([]);
            setResultado(null);
          }}
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
