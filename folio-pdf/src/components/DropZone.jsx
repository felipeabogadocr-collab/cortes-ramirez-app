import { useState } from "react";

// Envuelve el botón de "subir archivo" para que también acepte arrastrar y
// soltar archivos encima, además del clic de siempre.
export default function DropZone({ onFiles, disabled, children, style }) {
  const [activo, setActivo] = useState(false);

  function onDrop(e) {
    e.preventDefault();
    setActivo(false);
    if (disabled) return;
    if (e.dataTransfer?.files?.length) onFiles(e.dataTransfer.files);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setActivo(true);
      }}
      onDragLeave={() => setActivo(false)}
      onDrop={onDrop}
      className={activo ? "dropzone-active" : ""}
      style={{ borderRadius: 14, transition: "background 0.15s ease", ...style }}
    >
      {children}
    </div>
  );
}
