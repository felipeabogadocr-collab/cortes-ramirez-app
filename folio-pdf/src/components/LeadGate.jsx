import { useState } from "react";
import Logo from "./Logo.jsx";
import { registrarLead } from "../lib/analytics.js";
import { IconLock, IconShield } from "./Icons.jsx";

const WHATSAPP_NUMBER = "573192875428";
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

export default function LeadGate({ onDone }) {
  const [nombre, setNombre] = useState("");
  const [indicativo, setIndicativo] = useState("+57");
  const [numero, setNumero] = useState("");
  const [confirmaWhatsapp, setConfirmaWhatsapp] = useState(false);
  const [error, setError] = useState("");

  const paisInfo = INDICATIVOS.find((i) => i.code === indicativo);
  const digitos = numero.trim().replace(/\D/g, "");
  const numeroValido = digitos.length === paisInfo.digits;
  const listo = nombre.trim().length >= 2 && numeroValido && confirmaWhatsapp;

  function continuar() {
    if (nombre.trim().length < 2) {
      setError("Escribe tu nombre completo.");
      return;
    }
    if (!numeroValido) {
      setError(`El número de ${paisInfo.country} debe tener ${paisInfo.digits} dígitos (sin el indicativo).`);
      return;
    }
    if (!confirmaWhatsapp) {
      setError("Debes confirmar que ese número tiene WhatsApp activo para continuar.");
      return;
    }
    const telefonoCompleto = `${indicativo}${digitos}`;
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // si el navegador bloquea localStorage, igual dejamos continuar
    }
    registrarLead(nombre.trim(), telefonoCompleto);
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
        position: "relative",
      }}
    >
      <div className="bg-blobs" aria-hidden="true" />
      <div className="card" style={{ maxWidth: 420, width: "100%", padding: "28px 26px", position: "relative" }}>
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
          style={inputStyle}
        />

        <label style={{ fontSize: 12, fontWeight: 600, display: "block", margin: "12px 0 4px" }}>
          Celular de WhatsApp (con indicativo) *
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
          Tu número solo se usa para contactarte por WhatsApp; nunca se comparte ni se vende a
          terceros.
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
            checked={confirmaWhatsapp}
            onChange={(e) => setConfirmaWhatsapp(e.target.checked)}
            required
            style={{ marginTop: 2 }}
          />
          <span>
            Confirmo que este es <strong>mi</strong> número y que tiene WhatsApp activo. *
          </span>
        </label>

        {error && <p style={{ color: "var(--danger)", fontSize: 12, marginTop: 8 }}>{error}</p>}

        <button className="btn-primary" style={{ width: "100%", marginTop: 18 }} onClick={continuar} disabled={!listo}>
          Acepto recibir novedades y descuentos por WhatsApp — Continuar
        </button>
        <p style={{ fontSize: 10.5, color: "var(--muted)", textAlign: "center", marginTop: 10 }}>
          Al continuar se abrirá WhatsApp para confirmar tu número, y aceptas recibir por ahí
          actualizaciones y noticias de LITIA.ai, y acceder a descuentos. Tus documentos nunca se
          almacenan.
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
