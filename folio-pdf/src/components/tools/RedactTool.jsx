import { useEffect, useRef, useState } from "react";
import {
  fileToBytes,
  getPageCount,
  renderSinglePage,
  redactPdf,
  excedeTamano,
  MAX_FILE_MB,
} from "../../lib/pdfUtils.js";
import { IconUpload, Spinner, IconShield } from "../Icons.jsx";
import UploadNote from "../UploadNote.jsx";
import DownloadCard from "../DownloadCard.jsx";
import DropZone from "../DropZone.jsx";

const MIN_CAJA = 0.01; // fracción mínima de ancho/alto para contar como un tachón real

export default function RedactTool({ onSendTo }) {
  const [bytes, setBytes] = useState(null);
  const [totalPaginas, setTotalPaginas] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageImage, setPageImage] = useState(null);
  const [cajas, setCajas] = useState({}); // { [pageIndex]: [{x,y,width,height}] }
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState(null);
  const inputRef = useRef(null);
  const areaRef = useRef(null);
  const puntoInicial = useRef(null);

  useEffect(() => {
    if (!bytes) return;
    let cancelado = false;
    renderSinglePage(bytes, pageIndex, 1.3).then((url) => {
      if (!cancelado) setPageImage(url);
    });
    return () => {
      cancelado = true;
    };
  }, [bytes, pageIndex]);

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
      setTotalPaginas(n);
      setPageIndex(0);
      setCajas({});
    } catch {
      setError("No se pudo leer el PDF. Puede estar dañado o protegido con contraseña.");
    } finally {
      setBusy(false);
    }
  }

  function limpiarTodo() {
    setBytes(null);
    setTotalPaginas(0);
    setPageIndex(0);
    setPageImage(null);
    setCajas({});
    setResultado(null);
  }

  function fraccionDesdeEvento(e) {
    const rect = areaRef.current.getBoundingClientRect();
    const x = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    const y = Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1);
    return { x, y };
  }

  function onPointerDown(e) {
    if (!pageImage) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    puntoInicial.current = fraccionDesdeEvento(e);
    setDraft({ x: puntoInicial.current.x, y: puntoInicial.current.y, width: 0, height: 0 });
  }

  function onPointerMove(e) {
    if (!puntoInicial.current) return;
    const actual = fraccionDesdeEvento(e);
    const x = Math.min(puntoInicial.current.x, actual.x);
    const y = Math.min(puntoInicial.current.y, actual.y);
    const width = Math.abs(actual.x - puntoInicial.current.x);
    const height = Math.abs(actual.y - puntoInicial.current.y);
    setDraft({ x, y, width, height });
  }

  function onPointerUp() {
    if (draft && draft.width > MIN_CAJA && draft.height > MIN_CAJA) {
      setCajas((prev) => ({ ...prev, [pageIndex]: [...(prev[pageIndex] || []), draft] }));
      setResultado(null);
    }
    setDraft(null);
    puntoInicial.current = null;
  }

  function quitarCaja(i) {
    setCajas((prev) => ({ ...prev, [pageIndex]: prev[pageIndex].filter((_, idx) => idx !== i) }));
    setResultado(null);
  }

  const totalTachones = Object.values(cajas).reduce((acc, arr) => acc + arr.length, 0);

  async function aplicar() {
    if (!totalTachones) {
      setError("Marca al menos un área para tachar.");
      return;
    }
    setBusy(true);
    setError("");
    setResultado(null);
    try {
      const out = await redactPdf(bytes, cajas);
      setResultado(out);
    } catch {
      setError("No se pudo generar el PDF tachado.");
    } finally {
      setBusy(false);
    }
  }

  if (!bytes) {
    return (
      <div>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          Sube un PDF y marca con el mouse o el dedo las áreas con información sensible (cédulas, cuentas, datos de
          un cliente) para taparlas de forma permanente antes de compartirlo.
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

  const cajasPagina = cajas[pageIndex] || [];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>
          Página {pageIndex + 1} de {totalPaginas} — dibuja un rectángulo sobre lo que quieras tachar.
        </p>
        <button className="btn-ghost" onClick={limpiarTodo}>
          Cambiar archivo
        </button>
      </div>

      <p style={{ fontSize: 10.5, color: "var(--muted)", margin: "0 0 12px", display: "flex", alignItems: "flex-start", gap: 5 }}>
        <span style={{ flexShrink: 0, marginTop: 1 }}>
          <IconShield size={12} />
        </span>
        Las páginas tachadas se convierten en imagen para que el texto quede realmente eliminado, no solo cubierto.
      </p>

      <div style={{ display: "flex", justifyContent: "center" }}>
        <div
          ref={areaRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{
            position: "relative",
            display: "inline-block",
            touchAction: "none",
            userSelect: "none",
            maxWidth: "100%",
            border: "1px solid var(--border)",
            borderRadius: 8,
            overflow: "hidden",
            cursor: "crosshair",
          }}
        >
          {pageImage ? (
            <img src={pageImage} alt={`Página ${pageIndex + 1}`} style={{ display: "block", maxWidth: "100%", pointerEvents: "none" }} />
          ) : (
            <div
              style={{
                width: 320,
                height: 420,
                maxWidth: "70vw",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--muted)",
                fontSize: 13,
                gap: 8,
              }}
            >
              <Spinner /> Cargando página…
            </div>
          )}
          {cajasPagina.map((c, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${c.x * 100}%`,
                top: `${c.y * 100}%`,
                width: `${c.width * 100}%`,
                height: `${c.height * 100}%`,
                background: "rgba(0,0,0,0.85)",
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  quitarCaja(i);
                }}
                title="Quitar este tachón"
                style={{
                  position: "absolute",
                  top: -8,
                  right: -8,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "var(--danger)",
                  color: "#fff",
                  border: "2px solid var(--panel)",
                  fontSize: 10,
                  lineHeight: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ✕
              </button>
            </div>
          ))}
          {draft && (
            <div
              style={{
                position: "absolute",
                left: `${draft.x * 100}%`,
                top: `${draft.y * 100}%`,
                width: `${draft.width * 100}%`,
                height: `${draft.height * 100}%`,
                background: "rgba(0,0,0,0.5)",
                border: "1px dashed #fff",
              }}
            />
          )}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 12 }}>
        <button className="btn-ghost" onClick={() => setPageIndex((p) => p - 1)} disabled={pageIndex === 0}>
          ← Anterior
        </button>
        <button
          className="btn-ghost"
          onClick={() => setPageIndex((p) => p + 1)}
          disabled={pageIndex === totalPaginas - 1}
        >
          Siguiente →
        </button>
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 10, textAlign: "center" }}>{error}</p>}

      <button className="btn-primary" style={{ marginTop: 16, display: "flex", margin: "16px auto 0" }} onClick={aplicar} disabled={busy || !totalTachones}>
        {busy ? (
          <>
            <Spinner /> Generando…
          </>
        ) : (
          `Tachar y generar PDF${totalTachones ? ` (${totalTachones})` : ""}`
        )}
      </button>

      {resultado && (
        <DownloadCard
          bytes={resultado}
          defaultName="tachado-folio.pdf"
          herramienta="Tachar información sensible"
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
