import { useEffect, useRef, useState } from "react";
import { fileToBytes, renderThumbnails, signPdf, downloadBytes } from "../../lib/pdfUtils.js";

const STAMP_W = 640;
const STAMP_H = 240;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function formatFechaHora() {
  const ahora = new Date();
  const fecha = ahora.toLocaleDateString("es-CR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const hora = ahora.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" });
  return { fecha, hora };
}

// Compone la firma (dibujada, imagen subida o texto en cursiva) junto con el
// sello automático "Firmado por... el... a las..." en una sola imagen.
async function composeStamp({ signatureDataUrl, nombre }) {
  const canvas = document.createElement("canvas");
  canvas.width = STAMP_W;
  canvas.height = STAMP_H;
  const ctx = canvas.getContext("2d");

  const img = await loadImage(signatureDataUrl);
  const maxW = STAMP_W * 0.85;
  const maxH = STAMP_H * 0.62;
  const scale = Math.min(maxW / img.width, maxH / img.height, 1);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (STAMP_W - w) / 2, 10 + (maxH - h) / 2, w, h);

  const lineY = STAMP_H * 0.66;
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(STAMP_W * 0.12, lineY);
  ctx.lineTo(STAMP_W * 0.88, lineY);
  ctx.stroke();

  const { fecha, hora } = formatFechaHora();
  ctx.textAlign = "center";
  ctx.fillStyle = "#1f2937";
  ctx.font = "700 22px Manrope, sans-serif";
  ctx.fillText(`Firmado por ${nombre}`, STAMP_W / 2, lineY + 34);
  ctx.fillStyle = "#4b5563";
  ctx.font = "500 17px Manrope, sans-serif";
  ctx.fillText(`el ${fecha} a las ${hora}`, STAMP_W / 2, lineY + 58);

  return canvas.toDataURL("image/png");
}

async function renderTextoCursivo(texto) {
  const canvas = document.createElement("canvas");
  canvas.width = STAMP_W;
  canvas.height = 180;
  const ctx = canvas.getContext("2d");
  try {
    await document.fonts.load('700 72px "Dancing Script"');
    await document.fonts.ready;
  } catch {
    // si la fuente no carga a tiempo, se dibuja con la de respaldo
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#111827";
  ctx.font = '700 72px "Dancing Script", cursive';
  ctx.fillText(texto, STAMP_W / 2, canvas.height / 2);
  return canvas.toDataURL("image/png");
}

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
        style={{
          background: "#fff",
          borderRadius: 8,
          border: "1px solid var(--border)",
          touchAction: "none",
          width: "100%",
          maxWidth: 340,
        }}
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

const MIN_W = 0.16;
const MAX_W = 0.75;

function DragStampBox({ stampUrl, box, setBox, containerRef }) {
  const dragState = useRef(null);

  function onDragStart(e) {
    e.preventDefault();
    e.stopPropagation();
    e.target.setPointerCapture?.(e.pointerId);
    dragState.current = { mode: "move", startX: e.clientX, startY: e.clientY, box: { ...box } };
  }

  function onResizeStart(e) {
    e.preventDefault();
    e.stopPropagation();
    e.target.setPointerCapture?.(e.pointerId);
    dragState.current = { mode: "resize", startX: e.clientX, startY: e.clientY, box: { ...box } };
  }

  function onMove(e) {
    if (!dragState.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dxFrac = (e.clientX - dragState.current.startX) / rect.width;
    const dyFrac = (e.clientY - dragState.current.startY) / rect.height;
    const start = dragState.current.box;

    if (dragState.current.mode === "move") {
      const x = Math.min(Math.max(start.x + dxFrac, 0), 1 - start.width);
      const y = Math.min(Math.max(start.y + dyFrac, 0), 1 - start.height);
      setBox((b) => ({ ...b, x, y }));
    } else {
      const newWidthPx = start.width * rect.width + (e.clientX - dragState.current.startX);
      let width = Math.min(Math.max(newWidthPx / rect.width, MIN_W), MAX_W);
      if (start.x + width > 1) width = 1 - start.x;
      let height = (width * rect.width * (STAMP_H / STAMP_W)) / rect.height;
      if (start.y + height > 1) {
        height = 1 - start.y;
        width = (height * rect.height * (STAMP_W / STAMP_H)) / rect.width;
      }
      setBox((b) => ({ ...b, width, height }));
    }
  }

  function onUp() {
    dragState.current = null;
  }

  return (
    <div
      className="drag-box"
      onPointerDown={onDragStart}
      onPointerMove={onMove}
      onPointerUp={onUp}
      style={{
        left: `${box.x * 100}%`,
        top: `${box.y * 100}%`,
        width: `${box.width * 100}%`,
        height: `${box.height * 100}%`,
      }}
    >
      <img src={stampUrl} alt="Firma" style={{ width: "100%", height: "100%", pointerEvents: "none" }} draggable={false} />
      <div className="resize-handle" onPointerDown={onResizeStart} />
    </div>
  );
}

export default function SignTool() {
  const [bytes, setBytes] = useState(null);
  const [thumbs, setThumbs] = useState([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [metodo, setMetodo] = useState("dibujar");
  const [nombre, setNombre] = useState("");
  const [firmaDibujada, setFirmaDibujada] = useState(null);
  const [firmaImagen, setFirmaImagen] = useState(null);
  const [stampUrl, setStampUrl] = useState(null);
  const [box, setBox] = useState({ x: 0.3, y: 0.78, width: 0.4, height: 0.15 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const imagenInputRef = useRef(null);
  const containerRef = useRef(null);

  const firmaGrafica = metodo === "dibujar" ? firmaDibujada : metodo === "imagen" ? firmaImagen : nombre.trim() ? "texto" : null;

  useEffect(() => {
    let cancelado = false;
    async function generarPreview() {
      if (!nombre.trim()) {
        setStampUrl(null);
        return;
      }
      try {
        let grafica = null;
        if (metodo === "dibujar" && firmaDibujada) grafica = firmaDibujada;
        else if (metodo === "imagen" && firmaImagen) grafica = firmaImagen;
        else if (metodo === "texto") grafica = await renderTextoCursivo(nombre.trim());
        if (!grafica) {
          setStampUrl(null);
          return;
        }
        const compuesta = await composeStamp({ signatureDataUrl: grafica, nombre: nombre.trim() });
        if (!cancelado) setStampUrl(compuesta);
      } catch {
        if (!cancelado) setStampUrl(null);
      }
    }
    generarPreview();
    return () => {
      cancelado = true;
    };
  }, [metodo, nombre, firmaDibujada, firmaImagen]);

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

  function cargarImagenFirma(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setFirmaImagen(reader.result);
    reader.readAsDataURL(file);
  }

  async function aplicar() {
    if (!nombre.trim()) {
      setError("Escribe el nombre y apellido de quien firma.");
      return;
    }
    if (!firmaGrafica) {
      setError(
        metodo === "dibujar" ? "Dibuja tu firma primero." : metodo === "imagen" ? "Sube una imagen de tu firma." : "Escribe tu nombre."
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      let grafica = firmaDibujada;
      if (metodo === "imagen") grafica = firmaImagen;
      if (metodo === "texto") grafica = await renderTextoCursivo(nombre.trim());
      const compuesta = await composeStamp({ signatureDataUrl: grafica, nombre: nombre.trim() });
      const out = await signPdf(bytes, compuesta, pageIndex, box);
      downloadBytes(out, "firmado-folio.pdf");
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
          Sube el PDF que quieres firmar. La firma es electrónica simple (no una firma digital
          certificada), y queda acompañada de un sello automático con nombre, fecha y hora.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          style={{ display: "none" }}
          onChange={(e) => cargar(e.target.files[0])}
        />
        <button className="btn-upload" onClick={() => inputRef.current.click()} disabled={busy}>
          {busy ? "Cargando…" : "📤 Subir PDF"}
        </button>
        {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{error}</p>}
      </div>
    );
  }

  return (
    <div className="sign-layout">
      <div>
        <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Página a firmar</label>
        <select
          value={pageIndex}
          onChange={(e) => setPageIndex(Number(e.target.value))}
          style={{
            width: "100%",
            padding: 8,
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--bg)",
            color: "var(--text)",
          }}
        >
          {thumbs.map((_, i) => (
            <option key={i} value={i}>
              Página {i + 1}
            </option>
          ))}
        </select>
        <div ref={containerRef} style={{ position: "relative", marginTop: 10, userSelect: "none", WebkitUserSelect: "none" }}>
          <img
            src={thumbs[pageIndex]}
            alt=""
            draggable={false}
            style={{ width: "100%", borderRadius: 8, border: "1px solid var(--border)", display: "block" }}
          />
          {stampUrl && <DragStampBox stampUrl={stampUrl} box={box} setBox={setBox} containerRef={containerRef} />}
        </div>
        <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
          Arrastra el sello para moverlo, y usa el punto azul de la esquina para cambiar su tamaño.
        </p>
      </div>

      <div>
        <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
          Nombre y apellido de quien firma
        </label>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej: María Pérez"
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "var(--bg)",
            color: "var(--text)",
            fontSize: 14,
            marginBottom: 14,
          }}
        />

        <div className="sign-tabs">
          <button className={`sign-tab ${metodo === "dibujar" ? "active" : ""}`} onClick={() => setMetodo("dibujar")}>
            ✍️ Dibujar
          </button>
          <button className={`sign-tab ${metodo === "imagen" ? "active" : ""}`} onClick={() => setMetodo("imagen")}>
            🖼️ Subir imagen
          </button>
          <button className={`sign-tab ${metodo === "texto" ? "active" : ""}`} onClick={() => setMetodo("texto")}>
            🖋️ Escribir nombre
          </button>
        </div>

        {metodo === "dibujar" && <SignaturePad onChange={setFirmaDibujada} />}

        {metodo === "imagen" && (
          <div>
            <input
              ref={imagenInputRef}
              type="file"
              accept="image/png,image/jpeg"
              style={{ display: "none" }}
              onChange={(e) => cargarImagenFirma(e.target.files[0])}
            />
            <button className="btn-upload" onClick={() => imagenInputRef.current.click()}>
              📤 Subir imagen de mi firma
            </button>
            {firmaImagen && (
              <img
                src={firmaImagen}
                alt="Firma subida"
                style={{ display: "block", marginTop: 10, maxWidth: 220, maxHeight: 100, background: "#fff", borderRadius: 8, border: "1px solid var(--border)" }}
              />
            )}
            <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
              Para mejor resultado, usa una foto o escaneo de tu firma con fondo blanco o transparente.
            </p>
          </div>
        )}

        {metodo === "texto" && (
          <p style={{ fontSize: 12, color: "var(--muted)" }}>
            Tu nombre se convierte automáticamente en una firma con estilo cursivo, junto con el sello
            de fecha y hora.
          </p>
        )}

        {stampUrl && (
          <div style={{ marginTop: 14 }}>
            <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>
              Vista previa del sello
            </label>
            <img
              src={stampUrl}
              alt="Vista previa del sello"
              style={{ maxWidth: 260, background: "#fff", borderRadius: 8, border: "1px solid var(--border)" }}
            />
          </div>
        )}

        {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{error}</p>}

        <button className="btn-primary" style={{ marginTop: 14 }} onClick={aplicar} disabled={busy}>
          {busy ? "Firmando…" : "Firmar y descargar PDF"}
        </button>
        <button
          className="btn-ghost"
          style={{ marginTop: 8 }}
          onClick={() => {
            setBytes(null);
            setFirmaDibujada(null);
            setFirmaImagen(null);
            setNombre("");
            setStampUrl(null);
          }}
        >
          Cambiar archivo
        </button>
      </div>
    </div>
  );
}
