import Logo from "./Logo.jsx";

export default function Footer() {
  return (
    <footer style={{ borderTop: "1px solid var(--border)", background: "var(--panel)", padding: "24px 20px 20px" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <Logo size={26} />
        <p style={{ fontSize: 13, fontWeight: 700, margin: "4px 0 0" }}>LexDoc</p>
        <p style={{ textAlign: "center", fontSize: 11, color: "var(--muted)", margin: 0 }}>
          Diseñado por <strong style={{ color: "var(--text)" }}>LITIA.ai</strong>
        </p>
        <p style={{ textAlign: "center", fontSize: 11, color: "var(--muted)", margin: 0 }}>
          Desarrollado por <strong style={{ color: "var(--text)" }}>Felipe</strong> y{" "}
          <strong style={{ color: "var(--text)" }}>CR Abogados</strong>. Todos los derechos reservados.
        </p>
      </div>
    </footer>
  );
}
