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

const TOOLS = [
  { id: "unir", label: "Unir PDF", icon: "📎", Component: MergeTool },
  { id: "organizar", label: "Organizar páginas", icon: "🗂️", Component: OrganizeTool },
  { id: "dividir", label: "Dividir PDF", icon: "✂️", Component: SplitTool },
  { id: "firmar", label: "Firmar PDF", icon: "✍️", Component: SignTool },
  { id: "imagenes", label: "Imágenes a PDF", icon: "🖼️", Component: ImagesToPdfTool },
  { id: "comprimir", label: "Comprimir PDF", icon: "🗜️", Component: CompressTool },
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
      <Header
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        onGoHome={() => setActiveTool(null)}
      />

      <main style={{ flex: 1, maxWidth: 1100, margin: "0 auto", width: "100%", padding: "24px 20px 60px" }}>
        <PrivacyNotice style={{ marginBottom: 20 }} />

        {!Active && (
          <>
            <h1 className="uppercase" style={{ fontSize: 22, margin: "0 0 4px", letterSpacing: 1 }}>
              Herramientas PDF gratis
            </h1>
            <p style={{ color: "var(--muted)", fontSize: 14, margin: "0 0 20px" }}>
              Para estudiantes y abogados. Rápidas, sencillas y sin costo.
            </p>
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
                  <span style={{ fontSize: 30 }}>{t.icon}</span>
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
            <h2 className="uppercase" style={{ fontSize: 19, margin: "0 0 14px", letterSpacing: 0.8 }}>
              {Active.icon} {Active.label}
            </h2>
            <Active.Component />
          </div>
        )}
      </main>

      <Footer />
      <WhatsAppFloat />
      <Toast />
    </div>
  );
}
