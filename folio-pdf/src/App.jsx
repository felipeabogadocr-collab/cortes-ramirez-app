import { useEffect, useState } from "react";
import Header from "./components/Header.jsx";
import Footer from "./components/Footer.jsx";
import PrivacyNotice from "./components/PrivacyNotice.jsx";
import WhatsAppFloat from "./components/WhatsAppFloat.jsx";
import Toast from "./components/Toast.jsx";
import LeadGate, { hasAcceptedLead } from "./components/LeadGate.jsx";
import MergeTool from "./components/tools/MergeTool.jsx";
import OrganizeTool from "./components/tools/OrganizeTool.jsx";
import SplitTool from "./components/tools/SplitTool.jsx";
import SignTool from "./components/tools/SignTool.jsx";
import ImagesToPdfTool from "./components/tools/ImagesToPdfTool.jsx";
import CompressTool from "./components/tools/CompressTool.jsx";
import {
  IconPaperclip,
  IconFolder,
  IconScissors,
  IconPen,
  IconImage,
  IconCompress,
  IconLock,
  IconGlobe,
  IconCheck,
} from "./components/Icons.jsx";

const TOOLS = [
  { id: "unir", label: "Unir PDF", Icon: IconPaperclip, Component: MergeTool },
  { id: "organizar", label: "Organizar páginas", Icon: IconFolder, Component: OrganizeTool },
  { id: "dividir", label: "Dividir PDF", Icon: IconScissors, Component: SplitTool },
  { id: "firmar", label: "Firmar PDF", Icon: IconPen, Component: SignTool },
  { id: "imagenes", label: "Imágenes a PDF", Icon: IconImage, Component: ImagesToPdfTool },
  { id: "comprimir", label: "Comprimir PDF", Icon: IconCompress, Component: CompressTool },
];

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("folio_theme") || "light");
  const [accepted, setAccepted] = useState(hasAcceptedLead());
  const [activeTool, setActiveTool] = useState(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("folio_theme", theme);
  }, [theme]);

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
          <>
            <div style={{ textAlign: "center", marginBottom: 22 }}>
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 14 }}>
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
                </button>
              ))}
            </div>
          </>
        )}

        {Active && (
          <div>
            <button className="btn-ghost" style={{ marginBottom: 16 }} onClick={() => setActiveTool(null)}>
              ← Volver a herramientas
            </button>
            <h2
              className="uppercase"
              style={{
                fontSize: 19,
                margin: "0 0 14px",
                letterSpacing: 0.8,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Active.Icon size={20} /> {Active.label}
            </h2>
            <Active.Component />
          </div>
        )}
      </main>

      <Footer onSelectTool={setActiveTool} onExplore={() => setActiveTool(null)} />
      <WhatsAppFloat />
      <Toast />
    </div>
  );
}
