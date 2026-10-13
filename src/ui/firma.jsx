// Sello y texto de documentos firmados: aparte de base.jsx porque el sello
// muestra el nombre del despacho (lib/storage → Supabase), y solo lo
// necesitan el panel y la página pública de firma.

import { useState, useEffect, useRef } from "react";
import { getNombreDespacho } from "../lib/storage";
import { COLORS, Icono } from "./base.jsx";

// ---------- Sello de firma ----------
export function SelloFirma({ nombre, tipoId, numeroId, fecha, compact, rol }) {
  const esAbogado = rol === "abogado";
  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "flex-start",
        background: esAbogado ? COLORS.navy : "rgba(255,255,255,0.96)",
        border: `1.5px solid ${COLORS.navy}`,
        borderRadius: 6,
        padding: compact ? "4px 8px" : "8px 12px",
        boxShadow: "0 1px 3px rgba(11,61,46,0.18)",
      }}
    >
      <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: compact ? 14 : 16, color: esAbogado ? "#FFFFFF" : COLORS.navy, lineHeight: 1.2 }}>
        {nombre}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3 }}>
        <span style={{ fontSize: 9, color: esAbogado ? "#9FB6D6" : COLORS.accentBright, fontWeight: 700 }}>&#10003;</span>
        <span
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 8.5,
            letterSpacing: 0.4,
            color: esAbogado ? "#D7E2F1" : "#3B4657",
            textTransform: "uppercase",
          }}
        >
          {esAbogado ? `${getNombreDespacho()} · firmado` : "Firmado electrónicamente"}
        </span>
      </div>
      {(tipoId || numeroId) && (
        <span style={{ fontFamily: "Inter, sans-serif", fontSize: 9.5, color: esAbogado ? "#C4D3E8" : "#6B7480", marginTop: 1 }}>
          {tipoId} {numeroId}
        </span>
      )}
      {fecha && (
        <span style={{ fontFamily: "Inter, sans-serif", fontSize: 9, color: esAbogado ? "#C4D3E8" : "#6B7480" }}>
          {new Date(fecha).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}
        </span>
      )}
    </div>
  );
}

// ---------- Documento de TEXTO con firmas colocables ----------
export function DocumentoTextoConFirmas({ contenido, firmantes, previewFirmante, onMovePreview }) {
  const containerRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const posFromEvent = (e) => {
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    let x = ((clientX - rect.left) / rect.width) * 100;
    let y = ((clientY - rect.top) / rect.height) * 100;
    x = Math.max(2, Math.min(80, x));
    y = Math.max(2, Math.min(96, y));
    return { x, y };
  };

  const empezarArrastre = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
    onMovePreview(posFromEvent(e));
  };

  useEffect(() => {
    if (!dragging) return;
    const mover = (e) => {
      e.preventDefault();
      onMovePreview(posFromEvent(e));
    };
    const soltar = () => setDragging(false);
    window.addEventListener("mousemove", mover);
    window.addEventListener("mouseup", soltar);
    window.addEventListener("touchmove", mover, { passive: false });
    window.addEventListener("touchend", soltar);
    return () => {
      window.removeEventListener("mousemove", mover);
      window.removeEventListener("mouseup", soltar);
      window.removeEventListener("touchmove", mover);
      window.removeEventListener("touchend", soltar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  return (
    <div>
      {previewFirmante && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: COLORS.accentSoft,
            border: `1px solid #C7D6EA`,
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 10,
          }}
        >
          <Icono tipo="mano" size={17} style={{ color: COLORS.navy }} />
          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.navy, fontWeight: 600 }}>
            Puedes desplazarte libremente por el documento. Mantén presionado el recuadro que parpadea y arrástralo hasta donde quieras dejar tu firma.
          </span>
        </div>
      )}
      <div
        ref={containerRef}
        style={{
          position: "relative",
          whiteSpace: "pre-wrap",
          fontFamily: "'Source Serif 4', serif",
          fontSize: 15,
          lineHeight: 1.75,
          color: "#0B1220",
          background: "#FFFFFF",
          border: `1px solid ${COLORS.border}`,
          borderTop: `4px solid ${COLORS.navy}`,
          borderRadius: 8,
          padding: 24,
          minHeight: 320,
          maxHeight: "62vh",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          marginBottom: 12,
        }}
      >
        {contenido}
        {firmantes.map((f, i) => (
          <div key={i} style={{ position: "absolute", left: `${f.x}%`, top: `${f.y}%`, pointerEvents: "none" }}>
            <SelloFirma nombre={f.textoFirma} tipoId={f.tipoId} numeroId={f.numeroId} fecha={f.firmadoEn} compact rol={f.rol} />
          </div>
        ))}
        {previewFirmante && (
          <div
            onMouseDown={empezarArrastre}
            onTouchStart={empezarArrastre}
            style={{
              position: "absolute",
              left: `${previewFirmante.x}%`,
              top: `${previewFirmante.y}%`,
              cursor: dragging ? "grabbing" : "grab",
              touchAction: "none",
              outline: `2px dashed ${COLORS.accentBright}`,
              outlineOffset: 3,
              borderRadius: 8,
              animation: "drx-pulse 1.4s ease-in-out infinite",
            }}
          >
            <SelloFirma nombre={previewFirmante.textoFirma} tipoId={previewFirmante.tipoId} numeroId={previewFirmante.numeroId} compact />
          </div>
        )}
      </div>
    </div>
  );
}
