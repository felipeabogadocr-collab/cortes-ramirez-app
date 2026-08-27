import Logo from "./Logo.jsx";

export default function Header({ theme, onToggleTheme, onGoHome }) {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        boxShadow: "0 1px 8px rgba(0,0,0,0.06)",
      }}
    >
      <div
        style={{
          background: "var(--brand)",
          color: "#fff",
          padding: "5px 16px",
          textAlign: "center",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 10.5,
            letterSpacing: 0.3,
            opacity: 0.92,
            lineHeight: 1.4,
          }}
        >
          Todos los derechos reservados · Desarrollado por <strong>Felipe</strong> · Una
          herramienta de <strong>LITIA.ai</strong> y <strong>CR Abogados</strong>
        </p>
      </div>

      <div
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--panel)",
          padding: "16px 20px",
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
          <button
            onClick={onGoHome}
            title="Ir al menú principal"
            aria-label="Ir al menú principal"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              justifySelf: "center",
              background: "transparent",
              border: "none",
              padding: 0,
            }}
          >
            <Logo size={38} />
            <div style={{ textAlign: "center" }}>
              <div
                className="uppercase"
                style={{ fontWeight: 800, fontSize: 20, letterSpacing: 2 }}
              >
                Folio
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: -2 }}>
                Herramientas PDF gratis
              </div>
            </div>
          </button>
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
      </div>
    </header>
  );
}
