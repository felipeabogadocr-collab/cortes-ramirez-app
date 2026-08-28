import { useState } from "react";

async function preguntarIA(password, pregunta) {
  const resp = await fetch("/api/panel-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password, pregunta }),
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.error || "No se pudo consultar a la IA.");
  return json.respuesta;
}

export default function PanelChat({ password }) {
  const [historial, setHistorial] = useState([]);
  const [pregunta, setPregunta] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  async function enviar() {
    const texto = pregunta.trim();
    if (!texto || cargando) return;
    setPregunta("");
    setError("");
    setHistorial((h) => [...h, { rol: "usuario", texto }]);
    setCargando(true);
    try {
      const respuesta = await preguntarIA(password, texto);
      setHistorial((h) => [...h, { rol: "ia", texto: respuesta }]);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 12px" }}>
        Pregúntale a la IA sobre estos números, ej: "¿cuántas personas entraron esta semana?" o
        "¿qué herramienta se usa menos?".
      </p>

      {historial.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14, maxHeight: 320, overflowY: "auto" }}>
          {historial.map((m, i) => (
            <div
              key={i}
              style={{
                alignSelf: m.rol === "usuario" ? "flex-end" : "flex-start",
                background: m.rol === "usuario" ? "var(--brand-2)" : "var(--panel-2)",
                color: m.rol === "usuario" ? "#fff" : "var(--text)",
                padding: "8px 12px",
                borderRadius: 10,
                fontSize: 13.5,
                maxWidth: "85%",
                whiteSpace: "pre-wrap",
              }}
            >
              {m.texto}
            </div>
          ))}
        </div>
      )}

      {error && <p style={{ color: "var(--danger)", fontSize: 12.5, marginBottom: 8 }}>{error}</p>}

      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={pregunta}
          onChange={(e) => setPregunta(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && enviar()}
          placeholder="Escribe tu pregunta…"
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "var(--bg)",
            color: "var(--text)",
            fontSize: 14,
          }}
        />
        <button className="btn-primary" onClick={enviar} disabled={cargando || !pregunta.trim()}>
          {cargando ? "…" : "Enviar"}
        </button>
      </div>
    </div>
  );
}
