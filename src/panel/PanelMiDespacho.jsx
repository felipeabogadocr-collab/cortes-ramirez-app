// Se carga solo cuando se abre (React.lazy desde App.jsx): así no pesa en
// el primer ingreso al panel.

import { COLORS, Icono, buttonGhost, buttonPrimary, inputStyle } from "../ui/base.jsx";
import { TAMANO_MAX_ARCHIVO_MB, archivoDemasiadoGrande, formatoCOP } from "../lib/utils.js";
import { descargarLogoDespachoBlob, getCelularDespacho, getDespachoActualId, getLogoRutaDespacho, getNombreDespacho, setCelularDespachoLocal, setDespachoActual, setLogoRutaDespachoLocal, subirLogoDespacho } from "../lib/storage";
import { supabase } from "../lib/supabaseClient";
import { useEffect, useRef, useState } from "react";
import { AvatarIniciales, PagarPlanWompi, archivoEsImagenValida, convertirImagenAPngBlob, fechaLargaPlan, limpiarCacheLogoDespacho, llamarPagosNomos, ordenarMenu, useConfirmarDialogo, useUsuariosDespacho } from "../App.jsx";

// "Mi despacho": el perfil del despacho completo (no solo del usuario que
// entró) — nombre, celular y logo propio, más quiénes son los abogados del
// equipo. Se abre al hacer clic en la foto/nombre de abajo del menú, en vez
// de que ese clic dispare directo el selector de archivos para la foto
// personal (eso ahora vive adentro, como una fila más). El logo es lo que
// resuelve que cada despacho (tenant) vea SU propia marca en las cuentas de
// cobro, los recibos y los contratos que genera — antes todos veían el
// mismo logo fijo de Cortés Ramírez Abogados.
// Mi despacho → Personalizar menú: cada usuario ordena (flechas) y oculta
// las secciones del menú lateral. Solo afecta su propio menú.
function PersonalizarMenu({ pref, onGuardar, puedeVer }) {
  const [abierto, setAbierto] = useState(false);
  const lista = ordenarMenu(pref).filter((m) => !puedeVer || puedeVer(m.id));
  const ocultas = pref.ocultas || [];
  const mover = (i, d) => {
    const ids = lista.map((m) => m.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    onGuardar({ ...pref, orden: ids });
  };
  const alternar = (id) => onGuardar({ ...pref, ocultas: ocultas.includes(id) ? ocultas.filter((x) => x !== id) : [...ocultas, id] });
  const flecha = { background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 8, width: 30, height: 30, cursor: "pointer", color: COLORS.inkSoft, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
  return (
    <div style={{ marginBottom: 18, background: COLORS.surfaceSoft, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 14 }}>
      <button type="button" onClick={() => setAbierto(!abierto)} style={{ background: "none", border: "none", padding: 0, width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", fontFamily: "Inter, sans-serif" }}>
        <span style={{ textAlign: "left" }}>
          <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: COLORS.headingText }}>Personalizar menú</span>
          <span style={{ display: "block", fontSize: 11.5, color: COLORS.muted, marginTop: 3 }}>Ordena u oculta las secciones de tu menú. Solo cambia el tuyo.</span>
        </span>
        <span style={{ color: COLORS.muted, fontSize: 18 }}>{abierto ? "−" : "+"}</span>
      </button>
      {abierto && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, padding: "4px 2px" }}>Resumen · siempre primero</div>
          {lista.map((m, i) => {
            const oculta = ocultas.includes(m.id);
            return (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "6px 8px", opacity: oculta ? 0.5 : 1 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: COLORS.ink, textDecoration: oculta ? "line-through" : "none" }}>{m.nombre}</span>
                <button type="button" style={flecha} onClick={() => mover(i, -1)} disabled={i === 0} title="Subir">↑</button>
                <button type="button" style={flecha} onClick={() => mover(i, 1)} disabled={i === lista.length - 1} title="Bajar">↓</button>
                <button type="button" style={{ ...flecha, width: "auto", padding: "0 10px", fontSize: 12, fontWeight: 700 }} onClick={() => alternar(m.id)}>
                  {oculta ? "Mostrar" : "Ocultar"}
                </button>
              </div>
            );
          })}
          <button type="button" onClick={() => onGuardar({})} style={{ background: "none", border: "none", color: COLORS.muted, fontFamily: "Inter, sans-serif", fontSize: 12, textDecoration: "underline", cursor: "pointer", alignSelf: "flex-start", marginTop: 4, padding: 0 }}>
            Restablecer orden original
          </button>
        </div>
      )}
    </div>
  );
}

export default function PanelMiDespacho({ usuarioActual, fotoPerfilUrl, subiendoFotoPerfil, cambiarFotoPerfil, onCerrar, onDespachoRenombrado, menuPref, onGuardarMenu, puedeVer }) {
  const panelRef = useRef(null);
  const esAdmin = usuarioActual.rol === "Administrador";
  const { usuarios: usuariosDespacho } = useUsuariosDespacho();
  const abogados = usuariosDespacho.filter((u) => u.rol === "Abogado" || u.rol === "Administrador");

  const [nombreEdit, setNombreEdit] = useState(getNombreDespacho());
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [guardandoNombre, setGuardandoNombre] = useState(false);

  const [celularEdit, setCelularEdit] = useState(getCelularDespacho());
  const [editandoCelular, setEditandoCelular] = useState(false);
  const [guardandoCelular, setGuardandoCelular] = useState(false);

  const [logoUrl, setLogoUrl] = useState("");
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [errorLogo, setErrorLogo] = useState("");

  useEffect(() => {
    let cancelado = false;
    let urlCreada = null;
    const ruta = getLogoRutaDespacho();
    if (!ruta) return;
    descargarLogoDespachoBlob(ruta)
      .then((blob) => {
        if (cancelado || !blob) return;
        urlCreada = URL.createObjectURL(blob);
        setLogoUrl(urlCreada);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
      if (urlCreada) URL.revokeObjectURL(urlCreada);
    };
  }, []);

  useEffect(() => {
    const alPresionarTecla = (e) => {
      if (e.key === "Escape") onCerrar();
    };
    const alHacerClicAfuera = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onCerrar();
    };
    document.addEventListener("keydown", alPresionarTecla);
    document.addEventListener("mousedown", alHacerClicAfuera);
    return () => {
      document.removeEventListener("keydown", alPresionarTecla);
      document.removeEventListener("mousedown", alHacerClicAfuera);
    };
  }, [onCerrar]);

  const guardarNombre = async () => {
    if (!nombreEdit.trim()) return;
    setGuardandoNombre(true);
    const { error } = await supabase.from("despachos").update({ nombre: nombreEdit.trim() }).eq("id", usuarioActual.despacho_id);
    setGuardandoNombre(false);
    if (!error) {
      setDespachoActual(getDespachoActualId(), nombreEdit.trim(), getLogoRutaDespacho(), getCelularDespacho());
      onDespachoRenombrado?.(nombreEdit.trim());
      setEditandoNombre(false);
    }
  };

  const guardarCelular = async () => {
    setGuardandoCelular(true);
    const { error } = await supabase.from("despachos").update({ celular: celularEdit.trim() }).eq("id", usuarioActual.despacho_id);
    setGuardandoCelular(false);
    if (!error) {
      setCelularDespachoLocal(celularEdit.trim());
      setEditandoCelular(false);
    }
  };

  const cambiarLogo = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    if (archivoDemasiadoGrande(archivo)) {
      setErrorLogo(`El logo no puede pesar más de ${TAMANO_MAX_ARCHIVO_MB} MB.`);
      return;
    }
    if (!(await archivoEsImagenValida(archivo))) {
      setErrorLogo("Ese archivo no es una imagen válida (o es un formato no admitido, como SVG). Prueba con un JPG, PNG o WEBP.");
      return;
    }
    setErrorLogo("");
    setSubiendoLogo(true);
    try {
      const png = await convertirImagenAPngBlob(archivo);
      const ruta = await subirLogoDespacho(png);
      const { error } = await supabase.from("despachos").update({ logo_ruta: ruta }).eq("id", usuarioActual.despacho_id);
      if (error) throw error;
      setLogoRutaDespachoLocal(ruta);
      limpiarCacheLogoDespacho();
      setLogoUrl(URL.createObjectURL(png));
    } catch (err) {
      setErrorLogo("No se pudo actualizar el logo. Intenta de nuevo.");
    }
    setSubiendoLogo(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(6,14,28,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "calc(20px + var(--sat)) calc(20px + var(--sar)) calc(20px + var(--sab)) calc(20px + var(--sal))" }}>
      <div
        ref={panelRef}
        className="drx-dropdown-in"
        style={{
          background: COLORS.panel, borderRadius: 16, border: `1px solid ${COLORS.border}`, width: 460, maxWidth: "100%",
          maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 50px rgba(11,61,46,0.25)", padding: 24,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 17, fontWeight: 800, color: COLORS.headingText, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <Icono tipo="edificio" size={18} /> Mi despacho
          </p>
          <button onClick={onCerrar} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: COLORS.muted }}>
            ✕
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
          <label
            title={esAdmin ? "Cambiar el logo del despacho" : "Solo el Administrador puede cambiarlo"}
            style={{
              width: 64, height: 64, borderRadius: 12, flexShrink: 0, border: `1px solid ${COLORS.border}`, background: COLORS.surfaceSoft,
              display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
              cursor: esAdmin ? (subiendoLogo ? "wait" : "pointer") : "default", opacity: subiendoLogo ? 0.6 : 1,
            }}
          >
            {logoUrl ? (
              <img src={logoUrl} alt="Logo del despacho" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            ) : (
              <Icono tipo="imagen" size={22} style={{ color: COLORS.muted }} />
            )}
            {esAdmin && <input type="file" accept="image/*" onChange={cambiarLogo} disabled={subiendoLogo} style={{ display: "none" }} />}
          </label>
          <div>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 700, color: COLORS.headingText, margin: 0 }}>Logo del despacho</p>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: COLORS.muted, margin: "3px 0 0", lineHeight: 1.4 }}>
              {esAdmin
                ? "Aparece en tus cuentas de cobro, recibos y contratos. Sube cualquier formato (JPG, PNG, WEBP...) — Nomos lo ajusta solo."
                : "Solo el Administrador puede cambiarlo."}
            </p>
          </div>
        </div>
        {errorLogo && (
          <p style={{ color: "#B42318", fontSize: 12.5, marginTop: -10, marginBottom: 14, fontFamily: "Inter, sans-serif" }}>{errorLogo}</p>
        )}

        <div style={{ marginBottom: 14 }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>
            Nombre completo de la firma
          </p>
          {editandoNombre ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input className="drx-input" style={{ ...inputStyle, flex: 1, minWidth: 160 }} value={nombreEdit} onChange={(e) => setNombreEdit(e.target.value)} autoFocus />
              <button className="drx-btn-primary" style={{ ...buttonPrimary, padding: "8px 14px" }} onClick={guardarNombre} disabled={guardandoNombre || !nombreEdit.trim()}>
                {guardandoNombre ? "..." : "Guardar"}
              </button>
              <button
                className="drx-btn-ghost"
                style={{ ...buttonGhost, padding: "8px 14px" }}
                onClick={() => {
                  setNombreEdit(getNombreDespacho());
                  setEditandoNombre(false);
                }}
              >
                Cancelar
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14.5, fontWeight: 700, color: COLORS.ink, margin: 0 }}>{getNombreDespacho()}</p>
              {esAdmin && (
                <button onClick={() => setEditandoNombre(true)} style={{ background: "none", border: "none", color: COLORS.accentBright, fontSize: 12, cursor: "pointer", fontFamily: "Inter, sans-serif", fontWeight: 600 }}>
                  Editar
                </button>
              )}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 18 }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>
            Número celular
          </p>
          {editandoCelular ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                className="drx-input"
                style={{ ...inputStyle, flex: 1, minWidth: 160 }}
                value={celularEdit}
                onChange={(e) => setCelularEdit(e.target.value)}
                placeholder="Ej: 3001234567"
                autoFocus
              />
              <button className="drx-btn-primary" style={{ ...buttonPrimary, padding: "8px 14px" }} onClick={guardarCelular} disabled={guardandoCelular}>
                {guardandoCelular ? "..." : "Guardar"}
              </button>
              <button
                className="drx-btn-ghost"
                style={{ ...buttonGhost, padding: "8px 14px" }}
                onClick={() => {
                  setCelularEdit(getCelularDespacho());
                  setEditandoCelular(false);
                }}
              >
                Cancelar
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14.5, fontWeight: 700, color: celularEdit ? COLORS.ink : COLORS.muted, margin: 0 }}>
                {celularEdit || "Sin registrar"}
              </p>
              {esAdmin && (
                <button onClick={() => setEditandoCelular(true)} style={{ background: "none", border: "none", color: COLORS.accentBright, fontSize: 12, cursor: "pointer", fontFamily: "Inter, sans-serif", fontWeight: 600 }}>
                  Editar
                </button>
              )}
            </div>
          )}
        </div>

        {onGuardarMenu && <PersonalizarMenu pref={menuPref || {}} onGuardar={onGuardarMenu} puedeVer={puedeVer} />}

        {esAdmin && !usuarioActual.es_superadmin && (
          <div style={{ marginBottom: 18, background: COLORS.surfaceSoft, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 14 }}>
            <SuscripcionNomos usuarioActual={usuarioActual} />
          </div>
        )}

        <div style={{ marginBottom: 18 }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>
            Abogados del equipo
          </p>
          {abogados.length === 0 ? (
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted, margin: 0 }}>
              Aún no hay abogados registrados — se agregan desde "Usuarios y permisos".
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {abogados.map((a) => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <AvatarIniciales nombre={a.nombre} size={28} />
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.ink, margin: 0 }}>
                    {a.nombre} <span style={{ color: COLORS.muted, fontSize: 11.5 }}>· {a.rol}</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <label title="Cambiar tu foto de perfil" style={{ position: "relative", cursor: subiendoFotoPerfil ? "wait" : "pointer", display: "flex", opacity: subiendoFotoPerfil ? 0.6 : 1 }}>
            <AvatarIniciales nombre={usuarioActual.nombre} size={36} fotoUrl={fotoPerfilUrl} />
            <input type="file" accept="image/*" onChange={cambiarFotoPerfil} disabled={subiendoFotoPerfil} style={{ display: "none" }} />
          </label>
          <div>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 700, color: COLORS.ink, margin: 0 }}>{usuarioActual.nombre}</p>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: COLORS.muted, margin: "2px 0 0" }}>
              {subiendoFotoPerfil ? "Subiendo..." : "Clic en tu foto para cambiarla"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

const NOMBRE_PLAN_NOMOS = { abogado: "Abogado", despacho: "Despacho" };

// Cobro automático mensual con tarjeta. El número de la tarjeta va del
// navegador DIRECTO a Wompi (que devuelve un token); a Nomos solo llega ese
// token y una etiqueta tipo "VISA •••• 4242" — Nomos nunca ve ni guarda el
// número completo ni el código de seguridad.
function CobroAutomaticoWompi({ usuarioActual, config, plan }) {
  const [abierto, setAbierto] = useState(false);
  const [aut, setAut] = useState(null);
  const [tarjeta, setTarjeta] = useState({ numero: "", mes: "", anio: "", cvc: "", titular: "" });
  const [acepta, setAcepta] = useState(false);
  const [procesando, setProcesando] = useState("");
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const { confirmar, ConfirmarDialogo } = useConfirmarDialogo();
  if (!config?.recurrente) return null;
  const valorPlan = config.planes?.[plan]?.valor || 0;

  const abrir = async () => {
    setAbierto(true);
    setError("");
    try {
      setAut(await llamarPagosNomos({ accion: "wompi_autorizacion" }));
    } catch (e) {
      setError(e.message);
    }
  };

  const esperarCobro = async (id) => {
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 4000));
      const { estado } = await llamarPagosNomos({ accion: "wompi_estado", id });
      if (estado === "APPROVED") return "APPROVED";
      if (estado !== "PENDING") return estado;
    }
    return "PENDING";
  };

  const activar = async () => {
    setError("");
    const numero = tarjeta.numero.replace(/\D/g, "");
    if (numero.length < 13 || !tarjeta.mes || !tarjeta.anio || tarjeta.cvc.length < 3 || !tarjeta.titular.trim()) {
      setError("Revisa los datos de la tarjeta: número, vencimiento (MM/AA), código de seguridad y nombre del titular.");
      return;
    }
    if (!acepta) {
      setError("Para continuar debes aceptar la autorización de cobro y los términos de Wompi.");
      return;
    }
    try {
      setProcesando("Verificando la tarjeta con Wompi…");
      const resp = await fetch(`${aut.api}/tokens/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${aut.llavePublica}` },
        body: JSON.stringify({
          number: numero,
          cvc: tarjeta.cvc,
          exp_month: tarjeta.mes.padStart(2, "0"),
          exp_year: tarjeta.anio.slice(-2),
          card_holder: tarjeta.titular.trim(),
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json?.data?.id) throw new Error("Wompi no aceptó los datos de la tarjeta. Revísalos o prueba con otra tarjeta.");
      const etiqueta = `${json.data.brand || "Tarjeta"} •••• ${json.data.last_four || numero.slice(-4)}`;
      setProcesando("Guardando la tarjeta para el cobro automático…");
      const r = await llamarPagosNomos({ accion: "wompi_activar_cobro", token: json.data.id, acceptanceToken: aut.acceptanceToken, plan, tarjeta: etiqueta });
      setTarjeta({ numero: "", mes: "", anio: "", cvc: "", titular: "" });
      if (r.cobrado && r.transaccionId) {
        setProcesando("Cobrando el primer mes…");
        const estado = r.estado === "APPROVED" ? "APPROVED" : await esperarCobro(r.transaccionId);
        if (estado !== "APPROVED") throw new Error(estado === "PENDING" ? "La tarjeta quedó guardada y el cobro está en proceso; tu plan se activa solo apenas Wompi lo apruebe." : "La tarjeta quedó guardada, pero el cobro fue rechazado. Revisa con tu banco o registra otra tarjeta.");
        setExito(`✓ Listo: se cobró el primer mes a ${etiqueta} y el cobro automático quedó activo.`);
      } else {
        setExito(`✓ Cobro automático activo con ${etiqueta}. El próximo cobro será el ${fechaLargaPlan(r.pagadoHasta)}.`);
      }
      setProcesando("");
      setTimeout(() => window.location.reload(), 2500);
    } catch (e) {
      setProcesando("");
      setError(e.message);
    }
  };

  const desactivar = async () => {
    if (!(await confirmar("¿Desactivar el cobro automático? Tendrás que pagar tu plan a mano cada mes para no perder el acceso."))) return;
    try {
      await llamarPagosNomos({ accion: "wompi_desactivar_cobro" });
      window.location.reload();
    } catch (e) {
      setError(e.message);
    }
  };

  const campo = { ...inputStyle, padding: "9px 11px", fontSize: 14, width: "100%", boxSizing: "border-box" };
  if (usuarioActual.cobroAutomatico) {
    return (
      <div style={{ marginTop: 12, borderTop: `1px solid ${COLORS.border}`, paddingTop: 12, fontFamily: "Inter, sans-serif" }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: COLORS.ink, margin: 0 }}>🔁 Cobro automático activo</p>
        <p style={{ fontSize: 12.5, color: COLORS.inkSoft, margin: "4px 0 0" }}>
          {usuarioActual.wompiTarjeta || "Tarjeta guardada en Wompi"}
          {usuarioActual.pagadoHasta ? ` · próximo cobro el ${fechaLargaPlan(usuarioActual.pagadoHasta)}` : ""}
        </p>
        {usuarioActual.cobroAutoError && <p style={{ fontSize: 12.5, color: "#B42318", margin: "6px 0 0" }}>⚠ El último cobro no se pudo hacer: {usuarioActual.cobroAutoError}. Registra otra tarjeta o paga a mano.</p>}
        <button type="button" onClick={desactivar} style={{ ...buttonGhost, padding: "6px 12px", fontSize: 12, marginTop: 8 }}>
          Desactivar cobro automático
        </button>
        {error && <p style={{ color: "#B42318", fontSize: 12.5, margin: "8px 0 0" }}>{error}</p>}
        {ConfirmarDialogo}
      </div>
    );
  }
  return (
    <div style={{ marginTop: 12, borderTop: `1px solid ${COLORS.border}`, paddingTop: 12, fontFamily: "Inter, sans-serif", textAlign: "left" }}>
      {!abierto ? (
        <button type="button" onClick={abrir} style={{ ...buttonGhost, width: "100%", padding: "9px 12px", fontSize: 13 }}>
          🔁 Activar cobro automático mensual con tarjeta
        </button>
      ) : exito ? (
        <p style={{ fontSize: 13, color: "#166534", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: "10px 12px", margin: 0 }}>{exito}</p>
      ) : (
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: COLORS.ink, margin: "0 0 8px" }}>Cobro automático con tarjeta</p>
          <div style={{ display: "grid", gap: 8 }}>
            <input style={campo} inputMode="numeric" autoComplete="cc-number" placeholder="Número de la tarjeta" value={tarjeta.numero} onChange={(e) => setTarjeta({ ...tarjeta, numero: e.target.value.replace(/[^\d ]/g, "").slice(0, 23) })} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <input style={campo} inputMode="numeric" autoComplete="cc-exp-month" placeholder="Mes (MM)" value={tarjeta.mes} onChange={(e) => setTarjeta({ ...tarjeta, mes: e.target.value.replace(/\D/g, "").slice(0, 2) })} />
              <input style={campo} inputMode="numeric" autoComplete="cc-exp-year" placeholder="Año (AA)" value={tarjeta.anio} onChange={(e) => setTarjeta({ ...tarjeta, anio: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
              <input style={campo} inputMode="numeric" autoComplete="cc-csc" placeholder="CVC" value={tarjeta.cvc} onChange={(e) => setTarjeta({ ...tarjeta, cvc: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
            </div>
            <input style={campo} autoComplete="cc-name" placeholder="Nombre del titular (como aparece en la tarjeta)" value={tarjeta.titular} onChange={(e) => setTarjeta({ ...tarjeta, titular: e.target.value.toUpperCase() })} />
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: COLORS.inkSoft, margin: "10px 0", lineHeight: 1.5 }}>
            <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} style={{ marginTop: 3 }} />
            <span>
              Autorizo a Nomos a cobrar {formatoCOP(valorPlan)} cada mes (plan {NOMBRE_PLAN_NOMOS[plan]}) a esta tarjeta hasta que desactive el cobro automático, y acepto los{" "}
              {aut?.terminosUrl ? (
                <a href={aut.terminosUrl} target="_blank" rel="noreferrer" style={{ color: COLORS.accentBright }}>
                  términos y condiciones de Wompi
                </a>
              ) : (
                "términos y condiciones de Wompi"
              )}
              .
            </span>
          </label>
          <button className="drx-btn-primary" style={{ ...buttonPrimary, width: "100%" }} onClick={activar} disabled={!!procesando || !aut}>
            {procesando || "Guardar tarjeta y activar"}
          </button>
          <p style={{ fontSize: 11, color: COLORS.muted, margin: "6px 0 0", textAlign: "center" }}>🔒 Los datos de la tarjeta van directo a Wompi; Nomos no los guarda.</p>
        </div>
      )}
      {error && <p style={{ color: "#B42318", fontSize: 12.5, margin: "8px 0 0" }}>{error}</p>}
    </div>
  );
}

// Bloque "Tu plan de Nomos" de Mi despacho: estado y vencimiento, pago en
// línea y cobro automático.
function SuscripcionNomos({ usuarioActual }) {
  const [config, setConfig] = useState(null);
  useEffect(() => {
    fetch("/api/despachos/reportar-pago?wompi=config")
      .then((r) => (r.ok ? r.json() : null))
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);
  const plan = usuarioActual.planNomos || "despacho";
  const vence = usuarioActual.pagadoHasta;
  const dias = vence ? Math.ceil((new Date(vence).getTime() - Date.now()) / 86400000) : null;
  return (
    <div style={{ fontFamily: "Inter, sans-serif" }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4, margin: "0 0 6px" }}>Tu plan de Nomos</p>
      {vence && (
        <p style={{ fontSize: 13, color: dias < 0 ? "#B42318" : dias <= 5 ? "#B45309" : COLORS.inkSoft, margin: "0 0 10px" }}>
          Plan {NOMBRE_PLAN_NOMOS[plan] || "Despacho"} · {dias < 0 ? `venció el ${fechaLargaPlan(vence)}` : `pagado hasta el ${fechaLargaPlan(vence)}`}
        </p>
      )}
      <PagarPlanWompi compacto />
      <CobroAutomaticoWompi usuarioActual={usuarioActual} config={config} plan={plan} />
    </div>
  );
}
