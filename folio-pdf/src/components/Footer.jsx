import { useEffect, useRef, useState } from "react";
import Logo from "./Logo.jsx";
import { IconChat, IconChevronUp, IconLock } from "./Icons.jsx";
import { APP_VERSION, LAST_UPDATED } from "../version.js";

const WHATSAPP_NUMBER = "573192875428";

const HERRAMIENTAS = [
  { id: "unir", label: "Unir PDF" },
  { id: "organizar", label: "Organizar páginas" },
  { id: "dividir", label: "Dividir PDF" },
  { id: "firmar", label: "Firmar PDF" },
  { id: "imagenes", label: "Imágenes a PDF" },
  { id: "pdf-a-imagenes", label: "PDF a Imágenes" },
  { id: "comprimir", label: "Comprimir PDF" },
];

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

export default function Footer({ onSelectTool, onExplore }) {
  const [panel, setPanel] = useState(null); // "privacidad" | "terminos" | null
  const privacidadRef = useRef(null);

  useEffect(() => {
    function onOpenPrivacy() {
      setPanel("privacidad");
      setTimeout(() => privacidadRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
    }
    window.addEventListener("folio:open-privacy", onOpenPrivacy);
    return () => window.removeEventListener("folio:open-privacy", onOpenPrivacy);
  }, []);

  function abrirHerramienta(id) {
    // El scroll al inicio lo hace App.jsx cuando cambia la herramienta activa,
    // así no compite con el cambio de tamaño del contenido.
    if (onSelectTool) onSelectTool(id);
  }

  function explorar() {
    if (onExplore) onExplore();
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
            <p style={{ fontSize: 13, color: "var(--footer-muted)", lineHeight: 1.6, maxWidth: 260, margin: "0 0 14px" }}>
              Herramientas PDF gratuitas para estudiantes y abogados en Colombia.
            </p>
            <span
              title={`Versión ${APP_VERSION}, actualizada el ${LAST_UPDATED}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 10.5,
                fontWeight: 600,
                color: "var(--footer-muted)",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid var(--footer-border)",
                borderRadius: 999,
                padding: "4px 10px",
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)" }} />
              Actualizado {LAST_UPDATED} · v{APP_VERSION}
            </span>
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
            ref={privacidadRef}
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

      <div style={{ borderTop: "1px solid var(--footer-border)", padding: "14px 24px" }}>
        <p style={{ textAlign: "center", fontSize: 10.5, color: "var(--footer-muted)", margin: "0 0 3px" }}>
          Diseñado por <strong style={{ color: "var(--footer-text)" }}>LITIA.ai</strong> · Desarrollado por{" "}
          <strong style={{ color: "var(--footer-text)" }}>Felipe Cortés Ramírez</strong>, CEO{" "}
          <strong style={{ color: "var(--footer-text)" }}>Cortés Ramírez Abogados</strong>
        </p>
        <p style={{ textAlign: "center", fontSize: 10.5, color: "var(--footer-muted)", margin: "0 0 6px" }}>
          Todos los derechos reservados.
        </p>
        <p
          style={{
            textAlign: "center",
            fontSize: 10,
            color: "var(--footer-muted)",
            margin: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            flexWrap: "wrap",
          }}
        >
          <IconLock size={11} /> Cifrado SSL · Sin cookies de rastreo · Tus archivos nunca se almacenan
        </p>
      </div>
    </footer>
  );
}
