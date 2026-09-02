import { lazy, Suspense, useEffect, useState } from "react";
import Header from "./components/Header.jsx";
import Footer from "./components/Footer.jsx";
import PrivacyNotice from "./components/PrivacyNotice.jsx";
import WhatsAppFloat from "./components/WhatsAppFloat.jsx";
import Toast from "./components/Toast.jsx";
import LeadGate, { hasAcceptedLead } from "./components/LeadGate.jsx";
import {
  IconPaperclip,
  IconFolder,
  IconScissors,
  IconPen,
  IconImage,
  IconImages,
  IconCompress,
  IconRotate,
  IconRedact,
  IconTextDoc,
  IconLock,
  IconGlobe,
  IconCheck,
  IconArrowRight,
  Spinner,
} from "./components/Icons.jsx";

// Cada herramienta se carga solo cuando el usuario la abre: así la página de
// inicio no descarga pdf-lib/pdfjs-dist/jszip hasta que hagan falta de verdad.
const MergeTool = lazy(() => import("./components/tools/MergeTool.jsx"));
const OrganizeTool = lazy(() => import("./components/tools/OrganizeTool.jsx"));
const SplitTool = lazy(() => import("./components/tools/SplitTool.jsx"));
const SignTool = lazy(() => import("./components/tools/SignTool.jsx"));
const ImagesToPdfTool = lazy(() => import("./components/tools/ImagesToPdfTool.jsx"));
const PdfToImagesTool = lazy(() => import("./components/tools/PdfToImagesTool.jsx"));
const CompressTool = lazy(() => import("./components/tools/CompressTool.jsx"));
const RotateAllTool = lazy(() => import("./components/tools/RotateAllTool.jsx"));
const RedactTool = lazy(() => import("./components/tools/RedactTool.jsx"));
const ExtractTextTool = lazy(() => import("./components/tools/ExtractTextTool.jsx"));

const TOOLS = [
  { id: "unir", label: "Unir PDF", Icon: IconPaperclip, Component: MergeTool },
  { id: "organizar", label: "Organizar páginas", Icon: IconFolder, Component: OrganizeTool },
  { id: "dividir", label: "Dividir PDF", Icon: IconScissors, Component: SplitTool },
  { id: "firmar", label: "Firmar PDF", Icon: IconPen, Component: SignTool },
  { id: "imagenes", label: "Imágenes a PDF", Icon: IconImage, Component: ImagesToPdfTool },
  { id: "pdf-a-imagenes", label: "PDF a Imágenes", Icon: IconImages, Component: PdfToImagesTool },
  { id: "comprimir", label: "Comprimir PDF", Icon: IconCompress, Component: CompressTool },
  { id: "rotar", label: "Rotar PDF", Icon: IconRotate, Component: RotateAllTool },
  { id: "tachar", label: "Tachar información", Icon: IconRedact, Component: RedactTool },
  { id: "extraer-texto", label: "Extraer texto", Icon: IconTextDoc, Component: ExtractTextTool },
];

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("folio_theme") || "light");
  const [accepted, setAccepted] = useState(hasAcceptedLead());
  const [activeTool, setActiveTool] = useState(null);
  const [chainedFile, setChainedFile] = useState(null);

  // Deja que una herramienta mande su resultado directo a otra (ej. "Comprimir
  // este PDF" después de unirlo), sin tener que descargarlo y volver a subirlo.
  function enviarA(toolId, bytes, filename, mime) {
    setChainedFile(new File([bytes], filename, { type: mime || "application/pdf" }));
    setActiveTool(toolId);
  }

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("folio_theme", theme);
  }, [theme]);

  // Sube al inicio de la página cada vez que cambia la herramienta activa,
  // ya se haya elegido desde la cuadrícula, el pie de página o "volver".
  // Se hace aquí (tras el renderizado) para que no compita con el cambio
  // de tamaño del contenido y termine dejando el scroll abajo, como pasaba
  // al elegir una herramienta desde el pie de página en el celular.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeTool]);

  if (!accepted) {
    return (
      <>
        <LeadGate onDone={() => setAccepted(true)} />
        <WhatsAppFloat />
      </>
    );
  }

  const Active = TOOLS.find((t) => t.id === activeTool);

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <div className="bg-blobs" aria-hidden="true" />
      <Header
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        onGoHome={() => setActiveTool(null)}
      />

      <main style={{ flex: 1, maxWidth: 1100, margin: "0 auto", width: "100%", padding: "24px 20px 60px" }}>
        <PrivacyNotice style={{ marginBottom: 20 }} />

        {!Active && (
          <div className="fade-in">
            <div style={{ textAlign: "center", marginBottom: 22 }}>
              <span className="eyebrow uppercase">Plataforma 100% gratuita</span>
              <h1
                className="uppercase"
                style={{
                  fontSize: 28,
                  fontWeight: 800,
                  margin: "0 0 6px",
                  letterSpacing: 1,
                  backgroundImage: "linear-gradient(135deg, var(--brand), var(--brand-2))",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                Herramientas PDF gratis
              </h1>
              <p style={{ color: "var(--muted)", fontSize: 14, margin: "0 0 14px" }}>
                Para estudiantes y abogados. Rápidas, sencillas y sin costo.
              </p>
              <div className="trust-badges" style={{ justifyContent: "center" }}>
                <span className="trust-badge">
                  <IconLock /> Sin almacenamiento
                </span>
                <span className="trust-badge">
                  <IconGlobe /> 100% en tu navegador
                </span>
                <span className="trust-badge">
                  <IconCheck /> Gratis para siempre
                </span>
              </div>
            </div>
            <div className="tools-grid">
              {TOOLS.map((t) => (
                <button
                  key={t.id}
                  className="card tool-card"
                  onClick={() => setActiveTool(t.id)}
                  style={{
                    padding: "24px 14px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 10,
                    background: "var(--panel)",
                    color: "var(--text)",
                  }}
                >
                  <span className="tool-icon-badge">
                    <t.Icon size={26} />
                  </span>
                  <span className="uppercase" style={{ fontWeight: 700, fontSize: 13.5, letterSpacing: 0.4 }}>
                    {t.label}
                  </span>
                  <span className="tool-card-arrow">
                    Abrir <IconArrowRight />
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {Active && (
          <div className="fade-in" key={Active.id}>
            <button className="btn-ghost" style={{ marginBottom: 16 }} onClick={() => setActiveTool(null)}>
              ← Volver a herramientas
            </button>
            <h2
              className="uppercase"
              style={{
                fontSize: 18,
                margin: "0 0 16px",
                letterSpacing: 0.8,
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <span className="tool-icon-badge" style={{ width: 38, height: 38, borderRadius: 11 }}>
                <Active.Icon size={18} />
              </span>
              {Active.label}
            </h2>
            <Suspense
              fallback={
                <p style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: 13 }}>
                  <Spinner /> Cargando herramienta…
                </p>
              }
            >
              <Active.Component
                onSendTo={enviarA}
                chainedFile={chainedFile}
                onConsumedChain={() => setChainedFile(null)}
              />
            </Suspense>
          </div>
        )}
      </main>

      <Footer onSelectTool={setActiveTool} onExplore={() => setActiveTool(null)} />
      <WhatsAppFloat />
      <Toast />
    </div>
  );
}
