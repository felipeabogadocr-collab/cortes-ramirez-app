import { useState } from "react";
import Logo from "./Logo.jsx";
import { registrarLead } from "../lib/analytics.js";
import { IconLock, IconShield } from "./Icons.jsx";

const STORAGE_KEY = "folio_lead_ok";

export function hasAcceptedLead() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

// Largo esperado del número local (sin indicativo) por país, para detectar de una vez
// números incompletos o inventados antes de dejar continuar.
const INDICATIVOS = [
  { code: "+57", country: "Colombia", digits: 10 },
  { code: "+506", country: "Costa Rica", digits: 8 },
  { code: "+52", country: "México", digits: 10 },
  { code: "+34", country: "España", digits: 9 },
  { code: "+1", country: "EE. UU. / Canadá", digits: 10 },
  { code: "+51", country: "Perú", digits: 9 },
  { code: "+593", country: "Ecuador", digits: 9 },
  { code: "+58", country: "Venezuela", digits: 10 },
  { code: "+507", country: "Panamá", digits: 8 },
];

export default function LeadGate({ onDone, onCancel }) {
  const [nombre, setNombre] = useState("");
  const [indicativo, setIndicativo] = useState("+57");
  const [numero, setNumero] = useState("");
  const [confirmaDatos, setConfirmaDatos] = useState(false);
  const [error, setError] = useState("");

  const paisInfo = INDICATIVOS.find((i) => i.code === indicativo);
  const digitos = numero.trim().replace(/\D/g, "");
  const numeroValido = digitos.length === paisInfo.digits;
  const listo = nombre.trim().length >= 2 && numeroValido && confirmaDatos;

  function continuar() {
    if (nombre.trim().length < 2) {
      setError("Escribe tu nombre completo.");
      return;
    }
    if (!numeroValido) {
      setError(`El número de ${paisInfo.country} debe tener ${paisInfo.digits} dígitos (sin el indicativo).`);
      return;
    }
    if (!confirmaDatos) {
      setError("Debes confirmar tus datos para continuar.");
      return;
    }
    const telefonoCompleto = `${indicativo}${digitos}`;
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // si el navegador bloquea localStorage, igual dejamos continuar
    }
    registrarLead(nombre.trim(), telefonoCompleto);
    onDone();
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(8, 12, 18, 0.6)",
      }}
    >
      <div className="card fade-in" style={{ maxWidth: 420, width: "100%", padding: "28px 26px", position: "relative" }}>
        {onCancel && (
          <button
            onClick={onCancel}
            aria-label="Cerrar"
            title="Cerrar"
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              width: 28,
              height: 28,
              borderRadius: "50%",
              border: "1px solid var(--border)",
              background: "var(--panel-2)",
              color: "var(--text)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
            }}
          >
            ✕
          </button>
        )}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: 18 }}>
          <Logo size={44} />
          <h1 style={{ fontSize: 20, margin: 0, textAlign: "center" }}>Bienvenido a Folio</h1>
          <p style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", margin: 0 }}>
            Sin registro ni contraseñas. Solo esta vez necesitamos tu nombre y celular para darte
            acceso; la próxima vez ya no te lo pediremos.
          </p>
        </div>

        <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Nombre *</label>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Tu nombre completo"
          required
          autoComplete="off"
          style={inputStyle}
        />

        <label style={{ fontSize: 12, fontWeight: 600, display: "block", margin: "12px 0 4px" }}>
          Celular (con indicativo) *
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <select
            value={indicativo}
            onChange={(e) => {
              setIndicativo(e.target.value);
              setError("");
            }}
            style={{ ...inputStyle, width: 110 }}
          >
            {INDICATIVOS.map((i) => (
              <option key={i.code} value={i.code}>
                {i.code} {i.country}
              </option>
            ))}
          </select>
          <input
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            placeholder={"9".repeat(paisInfo.digits)}
            inputMode="numeric"
            maxLength={paisInfo.digits + 2}
            required
            autoComplete="off"
            style={{ ...inputStyle, flex: 1 }}
          />
        </div>
        <p style={{ fontSize: 10.5, color: "var(--muted)", margin: "4px 0 0" }}>
          Debe tener {paisInfo.digits} dígitos (sin el {indicativo}).
        </p>
        <p style={{ fontSize: 10.5, color: "var(--muted)", margin: "6px 0 0", display: "flex", alignItems: "flex-start", gap: 5 }}>
          <span style={{ flexShrink: 0, marginTop: 1 }}>
            <IconShield size={12} />
          </span>
          Tus datos nunca se comparten ni se venden a terceros.
        </p>

        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            marginTop: 14,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={confirmaDatos}
            onChange={(e) => setConfirmaDatos(e.target.checked)}
            required
            style={{ marginTop: 2 }}
          />
          <span>
            Confirmo que estos son <strong>mis</strong> datos. *
          </span>
        </label>

        {error && <p style={{ color: "var(--danger)", fontSize: 12, marginTop: 8 }}>{error}</p>}

        <button className="btn-primary" style={{ width: "100%", marginTop: 18 }} onClick={continuar} disabled={!listo}>
          Continuar a la herramienta
        </button>
        <p style={{ fontSize: 10.5, color: "var(--muted)", textAlign: "center", marginTop: 10 }}>
          Tus documentos nunca se almacenan ni se suben a ningún servidor.
        </p>
        <div className="trust-badges" style={{ justifyContent: "center", marginTop: 12 }}>
          <span className="trust-badge">
            <IconLock /> Conexión cifrada
          </span>
          <span className="trust-badge">
            <IconShield /> Datos protegidos
          </span>
        </div>
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
