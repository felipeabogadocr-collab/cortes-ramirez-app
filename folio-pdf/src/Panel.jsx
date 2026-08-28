import { useEffect, useState } from "react";
import Logo from "./components/Logo.jsx";
import Footer from "./components/Footer.jsx";

const SESSION_KEY = "folio_panel_clave";

async function pedirDatos(password) {
  const resp = await fetch("/api/panel-leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.error || "No se pudo entrar al panel.");
  return json;
}

function PasswordGate({ onUnlock }) {
  const [clave, setClave] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  async function entrar() {
    setCargando(true);
    setError("");
    try {
      const datos = await pedirDatos(clave);
      try {
        sessionStorage.setItem(SESSION_KEY, clave);
      } catch {
        // si el navegador bloquea sessionStorage, igual dejamos entrar
      }
      onUnlock(datos);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
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
        <div style={{ position: "relative" }}>
          <input
            type={mostrar ? "text" : "password"}
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && entrar()}
            placeholder="Contraseña"
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            style={{
              width: "100%",
              padding: "10px 44px 10px 12px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text)",
              fontSize: 14,
            }}
          />
          <button
            type="button"
            onClick={() => setMostrar((m) => !m)}
            aria-label={mostrar ? "Ocultar contraseña" : "Mostrar contraseña"}
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              background: "transparent",
              border: "none",
              fontSize: 16,
              padding: 4,
            }}
          >
            {mostrar ? "🙈" : "👁️"}
          </button>
        </div>
        {error && <p style={{ color: "var(--danger)", fontSize: 12, marginTop: 8 }}>{error}</p>}
        <button className="btn-primary" style={{ width: "100%", marginTop: 14 }} onClick={entrar} disabled={cargando}>
          {cargando ? "Entrando…" : "Entrar"}
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

function Dashboard({ datos }) {
  const { totalRegistros, totalDocumentos, porHerramienta, leads } = datos;

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <header style={{ borderBottom: "1px solid var(--border)", background: "var(--panel)", padding: "16px 20px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
          <Logo size={34} />
          <div>
            <div className="uppercase" style={{ fontWeight: 800, fontSize: 17, letterSpacing: 1 }}>
              Panel de Folio
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>Solo tú puedes ver esta página</div>
          </div>
        </div>
      </header>

      <main style={{ flex: 1, maxWidth: 900, margin: "0 auto", width: "100%", padding: "24px 20px 60px" }}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 24 }}>
          <Stat label="Personas registradas" value={totalRegistros} />
          <Stat label="Documentos procesados" value={totalDocumentos} />
        </div>

        {porHerramienta.length > 0 && (
          <>
            <h2 className="uppercase" style={{ fontSize: 15, letterSpacing: 0.6, marginBottom: 10 }}>
              Documentos por herramienta
            </h2>
            <div className="card" style={{ overflow: "hidden", marginBottom: 28 }}>
              {porHerramienta.map((row, i) => (
                <div
                  key={row.herramienta}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "12px 16px",
                    borderTop: i === 0 ? "none" : "1px solid var(--border)",
                    fontSize: 14,
                  }}
                >
                  <span>{row.herramienta}</span>
                  <strong>{row.total}</strong>
                </div>
              ))}
            </div>
          </>
        )}

        <h2 className="uppercase" style={{ fontSize: 15, letterSpacing: 0.6, marginBottom: 10 }}>
          Personas registradas ({leads.length})
        </h2>
        {leads.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 13 }}>Todavía nadie se ha registrado.</p>
        ) : (
          <div className="card" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "10px 14px" }}>Nombre</th>
                  <th style={{ padding: "10px 14px" }}>Celular</th>
                  <th style={{ padding: "10px 14px" }}>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l, i) => (
                  <tr key={i} style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 14px" }}>{l.nombre}</td>
                    <td style={{ padding: "10px 14px" }}>{l.telefono}</td>
                    <td style={{ padding: "10px 14px", color: "var(--muted)" }}>
                      {new Date(l.created_at).toLocaleString("es-CR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

export default function Panel() {
  const [datos, setDatos] = useState(null);
  const [revisandoSesion, setRevisandoSesion] = useState(true);

  useEffect(() => {
    let claveGuardada = null;
    try {
      claveGuardada = sessionStorage.getItem(SESSION_KEY);
    } catch {
      // nada que hacer si el navegador bloquea sessionStorage
    }
    if (!claveGuardada) {
      setRevisandoSesion(false);
      return;
    }
    pedirDatos(claveGuardada)
      .then(setDatos)
      .catch(() => {
        try {
          sessionStorage.removeItem(SESSION_KEY);
        } catch {
          // nada que hacer
        }
      })
      .finally(() => setRevisandoSesion(false));
  }, []);

  if (revisandoSesion) return null;
  if (!datos) return <PasswordGate onUnlock={setDatos} />;
  return <Dashboard datos={datos} />;
}
