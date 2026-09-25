import { useState, useEffect } from "react";
import { storageGet, firmarDocumentoPublico, registrarEventoDocumentoPublico } from "../lib/storage";
import {
  COLORS,
  Card,
  Field,
  Icono,
  IconoNomos,
  EstadoBadge,
  buttonPrimary,
  buttonGhost,
  inputStyle,
  TIPOS_ID,
  NUMERO_WHATSAPP_DESPACHO,
  sha256Hex,
  DocumentoTextoConFirmas,
  calcularEstado,
} from "../App.jsx";

function DocumentoConFirmas({ doc, previewFirmante, onMovePreview }) {
  return <DocumentoTextoConFirmas contenido={doc.contenido} firmantes={doc.firmantes || []} previewFirmante={previewFirmante} onMovePreview={onMovePreview} />;
}

// ---------- Vista pública: firmar documento ----------
const DIAS_VENCIMIENTO_FIRMA = 30;

export default function VistaFirma() {
  const [codigo, setCodigo] = useState("");
  const [doc, setDoc] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [expirado, setExpirado] = useState(false);

  const [nombre, setNombre] = useState("");
  const [tipoId, setTipoId] = useState(TIPOS_ID[0]);
  const [numeroId, setNumeroId] = useState("");
  const [textoFirma, setTextoFirma] = useState("");
  const [colocando, setColocando] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const [aceptaConsentimiento, setAceptaConsentimiento] = useState(false);

  const buscar = async () => {
    const code = codigo.trim().toUpperCase();
    if (!code) return;
    setBuscando(true);
    setNotFound(false);
    setExpirado(false);
    const raw = await storageGet(`documento:${code}`, true);
    setBuscando(false);
    if (!raw) {
      setNotFound(true);
      setDoc(null);
      return;
    }
    const parsed = JSON.parse(raw);
    const yaFirmado = (parsed.firmantes || []).length > 0;
    const dias = parsed.creadoEn ? Math.floor((Date.now() - new Date(parsed.creadoEn).getTime()) / 86400000) : 0;
    if (!yaFirmado && dias > DIAS_VENCIMIENTO_FIRMA) {
      // El enlace de firma vence a los 30 días si nadie lo ha firmado, por
      // seguridad. Un documento ya firmado se puede seguir consultando como
      // comprobante, sin vencimiento.
      setExpirado(true);
      setDoc(null);
      return;
    }
    setDoc({ id: code, firmantes: [], ...parsed });
    // Evento propio de la cadena de custodia: el firmante abrió el
    // documento. Va por el servidor (captura la IP real) y no bloquea nada
    // si falla — es informativo, no un requisito para poder seguir.
    registrarEventoDocumentoPublico(code, "documento_visualizado");
  };

  const empezarColocacion = () => {
    if (!nombre.trim() || !numeroId.trim()) {
      setError("Escribe tu nombre completo y tu número de identificación antes de continuar.");
      return;
    }
    if (!aceptaConsentimiento) {
      setError("Debes aceptar la autorización de tratamiento de datos y la firma electrónica antes de continuar.");
      return;
    }
    setError("");
    // Evento propio, separado de la firma en sí: quedó un registro con su
    // propio timestamp de que aceptó la casilla de consentimiento ANTES de
    // colocar la firma — no se infiere ni se asume, queda su propio hecho.
    registrarEventoDocumentoPublico(doc.id, "consentimiento_aceptado", { nombre: nombre.trim(), numeroId: numeroId.trim() });
    setTextoFirma(nombre.trim());
    setPreview({ x: 55, y: 80, textoFirma: nombre.trim(), tipoId, numeroId: numeroId.trim() });
    setColocando(true);
  };

  const confirmarFirma = async () => {
    // Hash de integridad (SHA-256) del contenido del documento en el momento
    // de la firma: sirve para demostrar después que el texto firmado no fue
    // alterado (Ley 527 de 1999, art. 7 — requisito de integridad de la
    // firma electrónica).
    const hashDocumento = await sha256Hex(doc.tipoDocumento === "pdf" ? doc.archivoPdfBase64 || "" : doc.contenido || "");

    const nuevaFirma = {
      nombre: nombre.trim(),
      tipoId,
      numeroId: numeroId.trim(),
      textoFirma: textoFirma.trim() || nombre.trim(),
      x: preview.x,
      y: preview.y,
      firmadoEn: new Date().toISOString(),
      rol: "cliente",
      aceptaConsentimiento: true,
      hashDocumento,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    };
    const firmantesActualizados = [...(doc.firmantes || []), nuevaFirma];
    const updated = { ...doc, firmantes: firmantesActualizados };
    try {
      // Pasa por el servidor (no directo a Supabase) para que quede
      // registrada la IP real de quien firmó — el navegador no puede
      // falsificarla como sí podría falsificar cualquier otro dato del
      // formulario.
      const resultado = await firmarDocumentoPublico(doc.id, updated);
      if (resultado?.ip) {
        firmantesActualizados[firmantesActualizados.length - 1] = { ...nuevaFirma, ip: resultado.ip };
        updated.firmantes = firmantesActualizados;
      }
    } catch (e) {
      setError("No pudimos guardar tu firma en este momento. Intenta de nuevo en un momento.");
      return;
    }
    setDoc(updated);
    setColocando(false);
    setPreview(null);
    setConfirmado(true);
  };

  const agregarOtraPersona = () => {
    setNombre("");
    setTipoId(TIPOS_ID[0]);
    setNumeroId("");
    setTextoFirma("");
    setConfirmado(false);
  };

  const descargarCertificado = () => {
    const firma = (doc.firmantes || [])[doc.firmantes.length - 1];
    if (!firma) return;
    const texto = `CERTIFICADO DE FIRMA ELECTRÓNICA
Emitido por Nomos — válido como comprobante bajo la Ley 527 de 1999 (Colombia)

Documento firmado: ${doc.titulo}
Cliente/asunto: ${doc.cliente || "—"}

Datos del firmante
------------------
Nombre: ${firma.nombre}
Tipo de identificación: ${firma.tipoId}
Número de identificación: ${firma.numeroId}
Rol: ${firma.rol === "abogado" ? "Abogado del despacho" : "Firmante / cliente"}

Evidencia técnica
------------------
Fecha y hora de la firma: ${new Date(firma.firmadoEn).toLocaleString("es-CO", { dateStyle: "full", timeStyle: "medium" })}
Autorización de tratamiento de datos y firma electrónica aceptada: ${firma.aceptaConsentimiento ? "Sí" : "No registrada"}
Dirección IP de origen: ${firma.ip || "No disponible"}
Navegador/dispositivo (user-agent): ${firma.userAgent || "No disponible"}
Hash de integridad del documento (SHA-256): ${firma.hashDocumento || "No disponible"}

Este hash permite verificar que el documento no fue alterado después de
esta firma: si el contenido cambia, un nuevo cálculo del hash ya no
coincidirá con el valor de arriba.

Código del documento: ${doc.id}
Certificado generado: ${new Date().toLocaleString("es-CO", { dateStyle: "full", timeStyle: "medium" })}
`;
    const blob = new Blob([texto], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `certificado-firma-${doc.id}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 20px 40px" }}>
      <div style={{ background: COLORS.navy, margin: "0 -20px 28px", padding: "24px 20px", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.navy, flexShrink: 0 }}>
          <IconoNomos size={26} />
        </div>
        <div>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, letterSpacing: 1.5, color: "#9FB6D6", textTransform: "uppercase", margin: 0 }}>
            Nomos
          </p>
          <h1 style={{ fontFamily: "Inter, sans-serif", fontSize: 24, fontWeight: 700, color: "#FFFFFF", margin: "4px 0 0" }}>
            Firma de documento
          </h1>
        </div>
      </div>

      {!doc && (
        <Card>
          <Field label="Código del documento (te lo compartió tu abogado)">
            <input
              className="drx-input"
              style={{
                ...inputStyle,
                textTransform: "uppercase",
                fontWeight: 700,
                fontSize: 18,
                letterSpacing: 2,
                fontFamily: "monospace",
                textAlign: "center",
              }}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              placeholder="EJ: A1B2C3D4"
              onKeyDown={(e) => e.key === "Enter" && buscar()}
            />
          </Field>
          {notFound && (
            <p style={{ color: "#B42318", fontSize: 13, marginTop: 10, fontFamily: "Inter, sans-serif" }}>
              No encontramos ningún documento con ese código. Verifícalo con tu abogado.
            </p>
          )}
          {expirado && (
            <p style={{ color: "#B42318", fontSize: 13, marginTop: 10, fontFamily: "Inter, sans-serif" }}>
              Este enlace de firma venció (los enlaces sin firmar duran {DIAS_VENCIMIENTO_FIRMA} días por seguridad). Pídele a tu abogado que te comparta uno nuevo.
            </p>
          )}
          <button className="drx-btn-primary" style={{ ...buttonPrimary, marginTop: 14 }} onClick={buscar} disabled={buscando}>
            {buscando ? "Buscando..." : "Buscar documento"}
          </button>
        </Card>
      )}

      {doc && (
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
            <div>
              <h2 style={{ fontFamily: "Inter, sans-serif", fontSize: 19, fontWeight: 700, margin: 0, color: COLORS.ink }}>
                {doc.titulo}
              </h2>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.muted, margin: "4px 0 0" }}>Cliente: {doc.cliente}</p>
            </div>
            <EstadoBadge estado={calcularEstado(doc.firmantes)} />
          </div>

          <DocumentoConFirmas
            doc={doc}
            previewFirmante={colocando ? preview : null}
            onMovePreview={(pos) => setPreview((p) => ({ ...p, ...pos }))}
          />

          {confirmado && !colocando ? (
            <div style={{ textAlign: "center" }}>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.headingText, fontWeight: 600, marginBottom: 12 }}>
                Tu firma quedó registrada en el documento.
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                <button className="drx-btn-ghost" style={buttonGhost} onClick={descargarCertificado}>
                  <Icono tipo="documento" size={14} style={{ marginRight: 4, verticalAlign: -2 }} /> Descargar certificado de firma
                </button>
                <button className="drx-btn-ghost" style={buttonGhost} onClick={agregarOtraPersona}>
                  Agregar la firma de otra persona
                </button>
                <a
                  href={`https://wa.me/${NUMERO_WHATSAPP_DESPACHO}?text=${encodeURIComponent(
                    `Hola, tengo un problema técnico para firmar el documento "${doc.titulo}" en Nomos.`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    ...buttonGhost,
                    background: "#1DA851",
                    color: "#FFFFFF",
                    border: "none",
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {/* Este es soporte TÉCNICO de la plataforma Nomos (no del
                      despacho que envió el documento) — cada documento no
                      sabe a qué WhatsApp pertenece "su" despacho, así que
                      redirigir esto al despacho requeriría guardarlo en cada
                      documento al crearlo. Por ahora, para no hacerle creer a
                      un cliente de OTRO despacho que le está escribiendo al
                      suyo, el botón se etiqueta como lo que realmente es. */}
                  <Icono tipo="chat" size={14} style={{ marginRight: 4, verticalAlign: -2 }} /> ¿Problema técnico para firmar? Soporte Nomos
                </a>
              </div>
            </div>
          ) : !colocando ? (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, marginBottom: 10 }}>
                <Field label="Nombre completo">
                  <input className="drx-input" style={inputStyle} value={nombre} onChange={(e) => setNombre(e.target.value)} />
                </Field>
                <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12 }}>
                  <Field label="Tipo de identificación">
                    <select className="drx-input" style={inputStyle} value={tipoId} onChange={(e) => setTipoId(e.target.value)}>
                      {TIPOS_ID.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Número de identificación">
                    <input className="drx-input" style={inputStyle} value={numeroId} onChange={(e) => setNumeroId(e.target.value)} />
                  </Field>
                </div>
              </div>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 14, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={aceptaConsentimiento}
                  onChange={(e) => setAceptaConsentimiento(e.target.checked)}
                  style={{ marginTop: 3, flexShrink: 0 }}
                />
                <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: COLORS.muted, lineHeight: 1.5 }}>
                  Autorizo el tratamiento de mis datos personales conforme a la Ley 1581 de 2012, y entiendo que la firma
                  que voy a colocar es una <strong>firma electrónica</strong> con la validez legal establecida en la Ley
                  527 de 1999, que me identifica y expresa mi voluntad de aceptar el contenido de este documento.{" "}
                  <a href="/#privacidad" target="_blank" rel="noreferrer" style={{ color: COLORS.accentBright }}>
                    Ver política de tratamiento de datos.
                  </a>
                </span>
              </label>
              {error && <p style={{ color: "#B42318", fontSize: 13, marginBottom: 10, fontFamily: "Inter, sans-serif" }}>{error}</p>}
              <button className="drx-btn-primary" style={buttonPrimary} onClick={empezarColocacion} disabled={!aceptaConsentimiento}>
                Firmar documento
              </button>
            </div>
          ) : (
            <div>
              <Field label="Texto de tu firma">
                <input className="drx-input" style={inputStyle} value={textoFirma} onChange={(e) => setTextoFirma(e.target.value)} />
              </Field>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, margin: "8px 0 12px" }}>
                Arrastra tu sello de firma sobre el documento hasta el lugar donde quieras dejarlo.
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="drx-btn-ghost" style={buttonGhost} onClick={() => { setColocando(false); setPreview(null); }}>
                  Cancelar
                </button>
                <button className="drx-btn-primary" style={buttonPrimary} onClick={confirmarFirma}>
                  Confirmar firma
                </button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
