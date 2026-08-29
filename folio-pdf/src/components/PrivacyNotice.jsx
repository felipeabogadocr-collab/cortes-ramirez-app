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
      <span style={{ fontSize: 16 }}>🔒</span>
      <span>
        <strong style={{ color: "var(--text)" }}>✅ 100% privado: tus archivos no se almacenan.</strong> Todo
        el procesamiento ocurre en tu propio navegador; los archivos se eliminan de la memoria
        inmediatamente al cerrar o cambiar de herramienta. Nunca se suben a ningún servidor.
      </span>
    </div>
  );
}
