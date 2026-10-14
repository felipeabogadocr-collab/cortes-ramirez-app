import { Component, StrictMode, Suspense, lazy } from "react";
import { COLORS, GlobalStyle, CargandoSeccion, PantallaCargaInicial, haySesionGuardada } from "./ui/base.jsx";

// Páginas que abre gente SIN sesión (clientes del despacho, visitantes de la
// landing, quien firma un documento). Se sirven desde aquí, sin App.jsx: así
// no descargan el panel completo ni, en la mayoría, la librería de Supabase.
const LandingPage = lazy(() => import("./views/LandingPage.jsx"));
const VistaFirma = lazy(() => import("./views/VistaFirma.jsx"));
const VistaPortalCliente = lazy(() => import("./views/VistaPortalCliente.jsx"));
const PoliticaPrivacidad = lazy(() => import("./views/PoliticaPrivacidad.jsx"));
const TerminosUso = lazy(() => import("./views/TerminosUso.jsx"));

function reportarError(error, info) {
  console.error("Error no controlado en página pública:", error, info);
  fetch("/api/errores/registrar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mensaje: `[público] ${error?.message || String(error)}`,
      pila: error?.stack || "",
      infoComponente: info?.componentStack || "",
      url: window.location.href,
      userAgent: navigator.userAgent,
    }),
  }).catch(() => {});
}

class LimiteDeError extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    reportarError(error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" style={{ minHeight: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 32, textAlign: "center", fontFamily: "Inter, sans-serif", background: "#F7F8FA" }}>
        <p style={{ fontSize: 18, fontWeight: 700, color: "#11213A", margin: 0 }}>No pudimos cargar esta página</p>
        <p style={{ fontSize: 13.5, color: "#4C5A6B", margin: 0, maxWidth: 400 }}>Revisa tu conexión e inténtalo de nuevo. Si el problema sigue, escríbele al despacho.</p>
        <button type="button" onClick={() => window.location.reload()} style={{ fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: 13.5, padding: "10px 22px", borderRadius: 10, border: "none", background: "#0B3B33", color: "#fff", cursor: "pointer" }}>
          Recargar
        </button>
      </div>
    );
  }
}

function EnlacePanel({ onEntrarAlPanel }) {
  if (!haySesionGuardada()) return null;
  return (
    <p style={{ textAlign: "center", paddingBottom: 24, margin: 0 }}>
      <button type="button" onClick={() => onEntrarAlPanel("login")} style={{ background: "none", border: "none", color: COLORS.muted, textDecoration: "underline", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: 12 }}>
        Volver al panel del despacho
      </button>
    </p>
  );
}

function Contenido({ vista, onEntrarAlPanel }) {
  if (vista === "landing") {
    return (
      <Suspense fallback={<PantallaCargaInicial />}>
        <LandingPage onRegistrar={() => onEntrarAlPanel("registro")} onIniciarSesion={() => onEntrarAlPanel("login")} />
      </Suspense>
    );
  }
  if (vista === "privacidad" || vista === "terminos") {
    const Pagina = vista === "privacidad" ? PoliticaPrivacidad : TerminosUso;
    return (
      <Suspense fallback={<PantallaCargaInicial />}>
        <Pagina />
      </Suspense>
    );
  }
  const Vista = vista === "firma" ? VistaFirma : VistaPortalCliente;
  return (
    <div style={{ background: COLORS.bg, minHeight: "100%" }}>
      <GlobalStyle />
      <Suspense fallback={<CargandoSeccion />}>
        <Vista />
      </Suspense>
      <EnlacePanel onEntrarAlPanel={onEntrarAlPanel} />
    </div>
  );
}

export default function PublicApp(props) {
  return (
    <StrictMode>
      <LimiteDeError>
        <Contenido {...props} />
      </LimiteDeError>
    </StrictMode>
  );
}
