import { useState } from "react";
import Logo from "./Logo.jsx";

const WHATSAPP_NUMBER = "573192875428";
const STORAGE_KEY = "lexdoc_lead_ok";

export function hasAcceptedLead() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

const INDICATIVOS = [
  { code: "+57", country: "Colombia" },
  { code: "+506", country: "Costa Rica" },
  { code: "+52", country: "México" },
  { code: "+34", country: "España" },
  { code: "+1", country: "EE. UU. / Canadá" },
  { code: "+51", country: "Perú" },
  { code: "+593", country: "Ecuador" },
  { code: "+58", country: "Venezuela" },
  { code: "+507", country: "Panamá" },
];

export default function LeadGate({ onDone }) {
  const [nombre, setNombre] = useState("");
  const [indicativo, setIndicativo] = useState("+57");
  const [numero, setNumero] = useState("");
  const [error, setError] = useState("");

  const listo = nombre.trim().length >= 2 && numero.trim().replace(/\D/g, "").length >= 7;

  function continuar() {
    if (!listo) {
      setError("Escribe tu nombre y un número de celular válido.");
      return;
    }
    const telefonoCompleto = `${indicativo}${numero.trim().replace(/\D/g, "")}`;
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // si el navegador bloquea localStorage, igual dejamos continuar
    }
    const texto = encodeURIComponent(
      `Hola, soy ${nombre.trim()} (${telefonoCompleto}). Quiero recibir por WhatsApp actualizaciones, noticias de LITIA.ai y acceder a descuentos.`
    );
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${texto}`, "_blank", "noopener,noreferrer");
    onDone();
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
      <div className="card" style={{ maxWidth: 420, width: "100%", padding: "28px 26px" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: 18 }}>
          <Logo size={44} />
          <h1 style={{ fontSize: 20, margin: 0, textAlign: "center" }}>Bienvenido a LexDoc</h1>
          <p style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", margin: 0 }}>
            Sin registro ni contraseñas. Solo necesitamos tu nombre y celular para darte acceso.
          </p>
        </div>

        <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Nombre</label>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Tu nombre completo"
          style={inputStyle}
        />

        <label style={{ fontSize: 12, fontWeight: 600, display: "block", margin: "12px 0 4px" }}>
          Celular (con indicativo)
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={indicativo} onChange={(e) => setIndicativo(e.target.value)} style={{ ...inputStyle, width: 110 }}>
            {INDICATIVOS.map((i) => (
              <option key={i.code} value={i.code}>
                {i.code} {i.country}
              </option>
            ))}
          </select>
          <input
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            placeholder="3001234567"
            inputMode="numeric"
            style={{ ...inputStyle, flex: 1 }}
          />
        </div>

        {error && <p style={{ color: "var(--danger)", fontSize: 12, marginTop: 8 }}>{error}</p>}

        <button className="btn-primary" style={{ width: "100%", marginTop: 18 }} onClick={continuar}>
          Acepto recibir novedades y descuentos por WhatsApp — Continuar
        </button>
        <p style={{ fontSize: 10.5, color: "var(--muted)", textAlign: "center", marginTop: 10 }}>
          Al continuar aceptas recibir por WhatsApp actualizaciones y noticias de LITIA.ai, y acceder a
          descuentos. Tus documentos nunca se almacenan.
        </p>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: 14,
};
