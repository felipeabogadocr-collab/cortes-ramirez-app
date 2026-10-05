import { IconLock, IconCheck } from "./Icons.jsx";

export default function PrivacyNotice({ style }) {
  return (
    <div
      className="card"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        background: "var(--panel)",
        borderColor: "var(--accent)",
        fontSize: 12.5,
        color: "var(--muted)",
        ...style,
      }}
    >
      <span style={{ color: "var(--accent)", flexShrink: 0 }}>
        <IconLock size={18} />
      </span>
      <span>
        <strong style={{ color: "var(--text)", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <IconCheck size={13} /> 100% privado: tus archivos no se almacenan.
        </strong>{" "}
        Todo el procesamiento ocurre en tu propio navegador; los archivos se eliminan de la
        memoria inmediatamente al cerrar o cambiar de herramienta. Nunca se suben a ningún
        servidor.
      </span>
    </div>
  );
}
