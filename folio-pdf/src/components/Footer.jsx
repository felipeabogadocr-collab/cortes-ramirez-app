import { useState } from "react";
import Logo from "./Logo.jsx";
import { IconChat, IconChevronUp, IconLock } from "./Icons.jsx";

const WHATSAPP_NUMBER = "573192875428";

const HERRAMIENTAS = [
  { id: "unir", label: "Unir PDF" },
  { id: "organizar", label: "Organizar páginas" },
  { id: "dividir", label: "Dividir PDF" },
  { id: "firmar", label: "Firmar PDF" },
  { id: "imagenes", label: "Imágenes a PDF" },
  { id: "comprimir", label: "Comprimir PDF" },
];

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

export default function Footer({ onSelectTool, onExplore }) {
  const [panel, setPanel] = useState(null); // "privacidad" | "terminos" | null

  function abrirHerramienta(id) {
    if (onSelectTool) onSelectTool(id);
    scrollToTop();
  }

  function explorar() {
    if (onExplore) onExplore();
    scrollToTop();
  }

  return (
    <footer style={{ background: "var(--footer-bg)", color: "var(--footer-text)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 36px" }}>
        <div className="footer-grid">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <Logo size={34} />
              <span className="uppercase" style={{ fontSize: 17, fontWeight: 800, letterSpacing: 1 }}>
                Folio
              </span>
            </div>
            <p style={{ fontSize: 13, color: "var(--footer-muted)", lineHeight: 1.6, maxWidth: 260, margin: 0 }}>
              Herramientas PDF gratuitas para estudiantes y abogados en Colombia.
            </p>
          </div>

          <div>
            <p className="footer-heading uppercase">Herramientas</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {HERRAMIENTAS.map((h) => (
                <button key={h.id} type="button" className="footer-link" onClick={() => abrirHerramienta(h.id)}>
                  {h.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="footer-heading uppercase">Legal</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                type="button"
                className="footer-link"
                onClick={() => setPanel((p) => (p === "privacidad" ? null : "privacidad"))}
              >
                Política de privacidad
              </button>
              <button
                type="button"
                className="footer-link"
                onClick={() => setPanel((p) => (p === "terminos" ? null : "terminos"))}
              >
                Términos de uso
              </button>
            </div>
          </div>

          <div>
            <p className="footer-heading uppercase">Contacto</p>
            <a
              href={`https://wa.me/${WHATSAPP_NUMBER}`}
              target="_blank"
              rel="noopener noreferrer"
              className="footer-link"
              style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
            >
              <IconChat size={15} /> Escríbenos por WhatsApp
            </a>
          </div>
        </div>

        {panel && (
          <div
            className="card"
            style={{
              marginTop: 28,
              padding: "14px 18px",
              background: "rgba(255,255,255,0.06)",
              borderColor: "var(--footer-border)",
              color: "var(--footer-muted)",
              fontSize: 12.5,
              lineHeight: 1.6,
              maxWidth: 640,
            }}
          >
            {panel === "privacidad" ? (
              <>
                Folio procesa tus archivos por completo dentro de tu navegador: nunca se suben a
                ningún servidor ni se almacenan. Solo guardamos tu nombre y celular al
                registrarte, usados exclusivamente para enviarte novedades por WhatsApp.
              </>
            ) : (
              <>
                Folio es una herramienta gratuita ofrecida "tal cual", sin garantías sobre
                resultados específicos. Eres responsable de verificar los documentos generados
                antes de usarlos. El uso de la plataforma implica la aceptación de estos
                términos.
              </>
            )}
          </div>
        )}
      </div>

      <div style={{ borderTop: "1px solid var(--footer-border)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 24px" }} className="footer-bottom-row">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button
              type="button"
              className="footer-top-btn"
              onClick={scrollToTop}
              aria-label="Volver arriba"
              title="Volver arriba"
            >
              <IconChevronUp />
            </button>
            <span style={{ fontSize: 14, fontWeight: 600 }}>¿Listo para simplificar tus documentos?</span>
          </div>
          <button className="btn-primary" onClick={explorar}>
            Explorar herramientas
          </button>
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--footer-border)", padding: "16px 24px" }}>
        <p style={{ textAlign: "center", fontSize: 11, color: "var(--footer-muted)", margin: "0 0 4px" }}>
          Diseñado por <strong style={{ color: "var(--footer-text)" }}>LITIA.ai</strong> · Desarrollado por{" "}
          <strong style={{ color: "var(--footer-text)" }}>Felipe</strong> y{" "}
          <strong style={{ color: "var(--footer-text)" }}>CR Abogados</strong>. Todos los derechos reservados.
        </p>
        <p
          style={{
            textAlign: "center",
            fontSize: 10.5,
            color: "var(--footer-muted)",
            margin: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
          }}
        >
          <IconLock size={11} /> Sitio con cifrado SSL · Tus archivos nunca se almacenan ni se comparten con terceros
        </p>
      </div>
    </footer>
  );
}
