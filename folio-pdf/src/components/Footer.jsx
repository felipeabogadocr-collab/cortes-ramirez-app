import { useState } from "react";
import Logo from "./Logo.jsx";

const WHATSAPP_NUMBER = "573192875428";

export default function Footer() {
  const [mostrarPrivacidad, setMostrarPrivacidad] = useState(false);

  return (
    <footer style={{ borderTop: "1px solid var(--border)", background: "var(--panel)", padding: "28px 20px 20px" }}>
      <div style={{ maxWidth: 700, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <Logo size={30} />
        <p className="uppercase" style={{ fontSize: 14, fontWeight: 800, letterSpacing: 1, margin: "6px 0 0" }}>
          Folio
        </p>
        <p style={{ fontSize: 11.5, color: "var(--muted)", margin: "0 0 14px", textAlign: "center" }}>
          Herramientas PDF gratis para estudiantes y abogados.
        </p>

        <div
          style={{
            display: "flex",
            gap: 18,
            flexWrap: "wrap",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 600,
            marginBottom: 14,
          }}
        >
          <a href="/" style={{ color: "var(--text)", textDecoration: "none" }}>
            Inicio
          </a>
          <a
            href={`https://wa.me/${WHATSAPP_NUMBER}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--text)", textDecoration: "none" }}
          >
            Contacto
          </a>
          <button
            type="button"
            onClick={() => setMostrarPrivacidad((m) => !m)}
            style={{ background: "none", border: "none", padding: 0, color: "var(--text)", fontWeight: 600, fontSize: 12 }}
          >
            Privacidad
          </button>
        </div>

        {mostrarPrivacidad && (
          <p
            className="card"
            style={{
              fontSize: 11.5,
              color: "var(--muted)",
              textAlign: "center",
              padding: "12px 16px",
              marginBottom: 14,
              maxWidth: 480,
            }}
          >
            Folio procesa tus archivos por completo dentro de tu navegador: nunca se suben a
            ningún servidor ni se almacenan. Solo guardamos tu nombre y celular al registrarte,
            usados exclusivamente para enviarte novedades por WhatsApp.
          </p>
        )}

        <div style={{ width: "100%", height: 1, background: "var(--border)", margin: "0 0 14px" }} />

        <p style={{ textAlign: "center", fontSize: 11, color: "var(--muted)", margin: 0 }}>
          Diseñado por <strong style={{ color: "var(--text)" }}>LITIA.ai</strong>
        </p>
        <p style={{ textAlign: "center", fontSize: 11, color: "var(--muted)", margin: 0 }}>
          Desarrollado por <strong style={{ color: "var(--text)" }}>Felipe</strong> y{" "}
          <strong style={{ color: "var(--text)" }}>CR Abogados</strong>. Todos los derechos reservados.
        </p>
        <p style={{ textAlign: "center", fontSize: 10, color: "var(--muted)", margin: "6px 0 0" }}>
          🔒 Sitio con cifrado SSL · Tus archivos nunca se almacenan ni se comparten con terceros
        </p>
      </div>
    </footer>
  );
}
