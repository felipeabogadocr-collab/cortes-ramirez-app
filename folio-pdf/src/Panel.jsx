import { useEffect, useState } from "react";
import Logo from "./components/Logo.jsx";
import Footer from "./components/Footer.jsx";
import { supabase } from "./lib/supabaseClient.js";

const PANEL_PASSWORD = "Foliocrabogaods";
const SESSION_KEY = "folio_panel_ok";

function PasswordGate({ onUnlock }) {
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");

  function entrar() {
    if (clave === PANEL_PASSWORD) {
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        // si el navegador bloquea sessionStorage, igual dejamos entrar
      }
      onUnlock();
    } else {
      setError("Contraseña incorrecta.");
    }
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "var(--bg)",
      }}
    >
      <div className="card" style={{ maxWidth: 360, width: "100%", padding: "28px 26px" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: 18 }}>
          <Logo size={44} />
          <h1 style={{ fontSize: 18, margin: 0 }}>Panel de Folio</h1>
          <p style={{ fontSize: 12.5, color: "var(--muted)", textAlign: "center", margin: 0 }}>
            Solo para el equipo de CR Abogados.
          </p>
        </div>
        <input
          type="password"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && entrar()}
          placeholder="Contraseña"
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "var(--bg)",
            color: "var(--text)",
            fontSize: 14,
          }}
        />
        {error && <p style={{ color: "var(--danger)", fontSize: 12, marginTop: 8 }}>{error}</p>}
        <button className="btn-primary" style={{ width: "100%", marginTop: 14 }} onClick={entrar}>
          Entrar
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="card" style={{ padding: "18px 20px", flex: "1 1 160px" }}>
      <div style={{ fontSize: 32, fontWeight: 800, color: "var(--brand-2)" }}>{value}</div>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4 }}>{label}</div>
    </div>
  );
}

function Dashboard() {
  const [resumen, setResumen] = useState(null);
  const [porHerramienta, setPorHerramienta] = useState([]);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    async function cargar() {
      if (!supabase) {
        setError(
          "Faltan las variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en este proyecto de Vercel."
        );
        setCargando(false);
        return;
      }
      try {
        const [r1, r2] = await Promise.all([
          supabase.from("folio_stats_resumen").select("*").single(),
          supabase.from("folio_stats_por_herramienta").select("*"),
        ]);
        if (r1.error) throw r1.error;
        if (r2.error) throw r2.error;
        setResumen(r1.data);
        setPorHerramienta(r2.data || []);
      } catch (e) {
        setError(
          "No se pudieron cargar las estadísticas. Verifica que ejecutaste el script folio-pdf/supabase/schema.sql en Supabase."
        );
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, []);

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <header style={{ borderBottom: "1px solid var(--border)", background: "var(--panel)", padding: "16px 20px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
          <Logo size={34} />
          <div>
            <div className="uppercase" style={{ fontWeight: 800, fontSize: 17, letterSpacing: 1 }}>
              Panel de Folio
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>Solo números — sin datos personales</div>
          </div>
        </div>
      </header>

      <main style={{ flex: 1, maxWidth: 900, margin: "0 auto", width: "100%", padding: "24px 20px 60px" }}>
        {cargando && <p style={{ color: "var(--muted)" }}>Cargando estadísticas…</p>}
        {error && <p style={{ color: "var(--danger)", fontSize: 13.5 }}>{error}</p>}

        {resumen && (
          <>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 24 }}>
              <Stat label="Personas registradas" value={resumen.total_registros ?? 0} />
              <Stat label="Documentos procesados" value={resumen.total_documentos ?? 0} />
            </div>

            <h2 className="uppercase" style={{ fontSize: 15, letterSpacing: 0.6, marginBottom: 10 }}>
              Documentos por herramienta
            </h2>
            {porHerramienta.length === 0 && (
              <p style={{ color: "var(--muted)", fontSize: 13 }}>Todavía no hay documentos procesados.</p>
            )}
            <div className="card" style={{ overflow: "hidden" }}>
              {porHerramienta.map((row, i) => (
                <div
                  key={row.herramienta || i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "12px 16px",
                    borderTop: i === 0 ? "none" : "1px solid var(--border)",
                    fontSize: 14,
                  }}
                >
                  <span>{row.herramienta || "Sin especificar"}</span>
                  <strong>{row.total}</strong>
                </div>
              ))}
            </div>

            <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 24 }}>
              Para ver la lista de nombres y celulares registrados, entra directo a tu proyecto de
              Supabase → Table Editor → tabla <code>folio_leads</code>. Por seguridad, esos datos
              nunca se muestran en esta página pública.
            </p>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}

export default function Panel() {
  const [desbloqueado, setDesbloqueado] = useState(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      return false;
    }
  });

  if (!desbloqueado) return <PasswordGate onUnlock={() => setDesbloqueado(true)} />;
  return <Dashboard />;
}
