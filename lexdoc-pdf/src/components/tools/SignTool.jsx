import { useEffect, useRef, useState } from "react";
import { fileToBytes, renderThumbnails, signPdf, downloadBytes } from "../../lib/pdfUtils.js";

function SignaturePad({ onChange }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";
  }, []);

  function pos(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  }

  function start(e) {
    e.preventDefault();
    drawing.current = true;
    const { x, y } = pos(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e) {
    if (!drawing.current) return;
    e.preventDefault();
    const { x, y } = pos(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(canvasRef.current.toDataURL("image/png"));
  }

  function limpiar() {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    onChange(null);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={340}
        height={140}
        style={{ background: "#fff", borderRadius: 8, border: "1px solid var(--border)", touchAction: "none", width: "100%", maxWidth: 340 }}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <button className="btn-ghost" style={{ marginTop: 8 }} onClick={limpiar}>
        Borrar firma
      </button>
    </div>
  );
}

export default function SignTool() {
  const [bytes, setBytes] = useState(null);
  const [thumbs, setThumbs] = useState([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [firma, setFirma] = useState(null);
  const [box, setBox] = useState({ x: 0.55, y: 0.8, width: 0.3, height: 0.1 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  async function cargar(file) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const buf = await fileToBytes(file);
      const t = await renderThumbnails(buf, 0.6);
      setBytes(buf);
      setThumbs(t);
      setPageIndex(0);
    } catch {
      setError("No se pudo leer el PDF. Puede estar dañado o protegido con contraseña.");
    } finally {
      setBusy(false);
    }
  }

  async function aplicar() {
    if (!firma) {
      setError("Dibuja tu firma primero.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const out = await signPdf(bytes, firma, pageIndex, box);
      downloadBytes(out, "firmado-litia.pdf");
    } catch {
      setError("No se pudo firmar el PDF.");
    } finally {
      setBusy(false);
    }
  }

  if (!bytes) {
    return (
      <div>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          Sube el PDF que quieres firmar. La firma es electrónica simple (dibujada), no una firma digital
          certificada.
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
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <div>
        <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Página a firmar</label>
        <select
          value={pageIndex}
          onChange={(e) => setPageIndex(Number(e.target.value))}
          style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
        >
          {thumbs.map((_, i) => (
            <option key={i} value={i}>
              Página {i + 1}
            </option>
          ))}
        </select>
        <div style={{ position: "relative", marginTop: 10 }}>
          <img src={thumbs[pageIndex]} alt="" style={{ width: "100%", borderRadius: 8, border: "1px solid var(--border)" }} />
          {firma && (
            <img
              src={firma}
              alt="firma"
              style={{
                position: "absolute",
                left: `${box.x * 100}%`,
                top: `${box.y * 100}%`,
                width: `${box.width * 100}%`,
                height: `${box.height * 100}%`,
                pointerEvents: "none",
              }}
            />
          )}
        </div>

        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 11 }}>Posición horizontal</label>
          <input type="range" min="0" max="0.85" step="0.01" value={box.x} onChange={(e) => setBox((b) => ({ ...b, x: Number(e.target.value) }))} />
          <label style={{ fontSize: 11 }}>Posición vertical</label>
          <input type="range" min="0" max="0.85" step="0.01" value={box.y} onChange={(e) => setBox((b) => ({ ...b, y: Number(e.target.value) }))} />
          <label style={{ fontSize: 11 }}>Tamaño</label>
          <input type="range" min="0.1" max="0.6" step="0.01" value={box.width} onChange={(e) => setBox((b) => ({ ...b, width: Number(e.target.value), height: Number(e.target.value) * 0.35 }))} />
        </div>
      </div>

      <div>
        <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Dibuja tu firma</label>
        <SignaturePad onChange={setFirma} />
        {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{error}</p>}
        <button className="btn-primary" style={{ marginTop: 14 }} onClick={aplicar} disabled={busy}>
          {busy ? "Firmando…" : "Firmar y descargar PDF"}
        </button>
        <button className="btn-ghost" style={{ marginTop: 8 }} onClick={() => { setBytes(null); setFirma(null); }}>
          Cambiar archivo
        </button>
      </div>
    </div>
  );
}
