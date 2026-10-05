import { IconLock } from "./Icons.jsx";

// Recordatorio de seguridad que acompaña cada botón de subir archivo.
export default function UploadNote({ children = "Tu archivo se procesa en este dispositivo; nunca se sube a un servidor." }) {
  return (
    <p
      style={{
        fontSize: 10.5,
        color: "var(--muted)",
        margin: "8px 0 0",
        display: "flex",
        alignItems: "flex-start",
        gap: 5,
      }}
    >
      <span style={{ flexShrink: 0, marginTop: 1 }}>
        <IconLock size={11} />
      </span>
      {children}
    </p>
  );
}
