import { useEffect, useState } from "react";
import Logo from "./Logo.jsx";
import { IconLock, IconSun, IconMoon } from "./Icons.jsx";

// Solo afirmamos "sitio seguro" cuando la conexión realmente es HTTPS
// (o estamos en desarrollo local), en vez de mostrarlo como texto fijo.
function conexionEsSegura() {
  if (typeof window === "undefined") return true;
  return window.location.protocol === "https:" || window.location.hostname === "localhost";
}

export default function Header({ theme, onToggleTheme, onGoHome }) {
  const [conScroll, setConScroll] = useState(false);

  useEffect(() => {
    function onScroll() {
      setConScroll(window.scrollY > 4);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function abrirPrivacidad() {
    window.dispatchEvent(new CustomEvent("folio:open-privacy"));
  }

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        boxShadow: conScroll ? "0 4px 16px rgba(0,0,0,0.1)" : "0 1px 8px rgba(0,0,0,0.06)",
        transition: "box-shadow 0.2s ease",
      }}
    >
      <div className="top-accent-bar" aria-hidden="true" />

      <div
        style={{
          background: "var(--brand)",
          color: "#fff",
          padding: "3px 16px",
          textAlign: "center",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 9.5,
            letterSpacing: 0.2,
            opacity: 0.92,
            lineHeight: 1.4,
          }}
        >
          Diseñado por <strong>Felipe Cortés Ramírez</strong>, CEO de{" "}
          <strong>Cortés Ramírez Abogados</strong> · Todos los derechos reservados
        </p>
      </div>

      <div
        className="header-hero"
        style={{
          borderBottom: "1px solid var(--border)",
          padding: "10px 20px",
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
          {conexionEsSegura() ? (
            <button
              type="button"
              className="trust-badge header-trust-badge"
              onClick={abrirPrivacidad}
              title="Ver nuestra política de privacidad"
              style={{ justifySelf: "start", border: "1px solid var(--border)", cursor: "pointer" }}
            >
              <IconLock /> Sitio seguro
            </button>
          ) : (
            <span />
          )}
          <button
            onClick={onGoHome}
            title="Ir al menú principal"
            aria-label="Ir al menú principal"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              justifySelf: "center",
              background: "transparent",
              border: "none",
              padding: 0,
            }}
          >
            <Logo size={32} />
            <div style={{ textAlign: "center" }}>
              <div
                className="uppercase"
                style={{ fontWeight: 800, fontSize: 17, letterSpacing: 1.6 }}
              >
                Folio
              </div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: -2 }}>
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
              {theme === "dark" ? <IconSun /> : <IconMoon />}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
