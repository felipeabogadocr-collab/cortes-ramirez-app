import Logo from "./Logo.jsx";

export default function Header({ theme, onToggleTheme }) {
  return (
    <header
      style={{
        borderBottom: "1px solid var(--border)",
        background: "var(--panel)",
        padding: "14px 20px",
        position: "sticky",
        top: 0,
        zIndex: 20,
      }}
    >
      <div
        style={{
          maxWidth: 1000,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div />
        <div style={{ display: "flex", alignItems: "center", gap: 10, justifySelf: "center" }}>
          <Logo />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: 0.2 }}>IA Litia</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: -2 }}>Herramientas PDF gratis</div>
          </div>
        </div>
        <div style={{ justifySelf: "end" }}>
          <button
            className="btn-icon"
            onClick={onToggleTheme}
            title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            aria-label="Cambiar tema"
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>
      </div>
    </header>
  );
}
