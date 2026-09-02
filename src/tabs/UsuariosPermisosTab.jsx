import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  setDespachoActual, getNombreDespacho, obtenerPapelera, restaurarDePapelera, eliminarDefinitivo,
} from "../lib/storage";
import {
  COLORS, formatoCOP, registrarAuditoria, useConfirmarDialogo, useUsuariosDespacho, Field,
  inputStyle, buttonPrimary, buttonGhost, Card, EncabezadoSeccion, Icono, IconoCampana,
  CampoContrasena, useCuentaRegresiva, leerJSONLocal, guardarJSONLocal, permisosPorDefecto,
  notificacionesPorDefecto, SECCIONES_PERMISOS, NOTIF_CATEGORIAS,
} from "../App.jsx";

// Los administradores ya pueden leer toda la auditoría de su despacho (ver
// política RLS "administradores leen auditoria del mismo despacho"), así que
// esto no necesita ningún permiso nuevo — solo faltaba mostrarlo.
function UltimaSesionUsuario({ usuarioId }) {
  const [fecha, setFecha] = useState(undefined);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const { data } = await supabase
        .from("auditoria")
        .select("creado_en")
        .eq("usuario_id", usuarioId)
        .eq("accion", "inicio_sesion")
        .order("creado_en", { ascending: false })
        .limit(1);
      if (!cancelado) setFecha(data?.[0]?.creado_en || null);
    })();
    return () => {
      cancelado = true;
    };
  }, [usuarioId]);

  if (fecha === undefined) return "Cargando última sesión…";
  if (!fecha) return "Sin inicios de sesión registrados todavía";
  return `Última sesión: ${new Date(fecha).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}`;
}

export default function UsuariosPermisosTab({ usuarioActual, onDespachoRenombrado }) {
  const usuarioActualId = usuarioActual.id;
  const { usuarios, crear: crearUsuario, actualizar, eliminar: eliminarUsuario } = useUsuariosDespacho();
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [rol, setRol] = useState("Asistente");
  const [error, setError] = useState("");
  const [creando, setCreando] = useState(false);
  const [eliminandoId, setEliminandoId] = useState(null);
  const [enviandoResetId, setEnviandoResetId] = useState(null);
  const [resetEnviadoId, setResetEnviadoId] = useState(null);
  const { confirmar, ConfirmarDialogo } = useConfirmarDialogo();

  const enviarResetContrasena = async (u) => {
    setEnviandoResetId(u.id);
    setError("");
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(u.email, {
        redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
      });
      if (resetError) throw resetError;
      setResetEnviadoId(u.id);
      setTimeout(() => setResetEnviadoId(null), 4000);
    } catch (e) {
      setError("No se pudo enviar el correo de restablecimiento.");
    }
    setEnviandoResetId(null);
  };

  const eliminarUsuarioClick = async (u) => {
    if (!(await confirmar(`¿Eliminar el acceso de ${u.nombre}? Ya no podrá iniciar sesión. No se puede deshacer.`))) return;
    setEliminandoId(u.id);
    setError("");
    try {
      await eliminarUsuario(u.id);
      registrarAuditoria(usuarioActual, "eliminar_usuario", "usuario", u.id, { nombre: u.nombre, rol: u.rol });
    } catch (e) {
      setError(e.message || "No se pudo eliminar el usuario.");
    }
    setEliminandoId(null);
  };
  const [nombreDespachoEdit, setNombreDespachoEdit] = useState(getNombreDespacho());
  const [editandoDespacho, setEditandoDespacho] = useState(false);
  const [guardandoDespacho, setGuardandoDespacho] = useState(false);

  const guardarNombreDespacho = async () => {
    if (!nombreDespachoEdit.trim()) return;
    setGuardandoDespacho(true);
    const { error: renombrarError } = await supabase.from("despachos").update({ nombre: nombreDespachoEdit.trim() }).eq("id", usuarioActual.despacho_id);
    setGuardandoDespacho(false);
    if (!renombrarError) {
      setDespachoActual(usuarioActual.despacho_id, nombreDespachoEdit.trim());
      onDespachoRenombrado?.(nombreDespachoEdit.trim());
      setEditandoDespacho(false);
    }
  };

  const crear = async () => {
    if (!nombre.trim() || !email.trim() || !contrasena.trim()) return;
    setCreando(true);
    setError("");
    try {
      const nuevoUsuario = await crearUsuario({ nombre: nombre.trim(), email: email.trim(), contrasena, rol });
      registrarAuditoria(usuarioActual, "crear_usuario", "usuario", nuevoUsuario?.id, { nombre: nombre.trim(), rol });
      setNombre("");
      setEmail("");
      setContrasena("");
      setRol("Asistente");
      setMostrarForm(false);
    } catch (e) {
      setError(e.message || "No se pudo crear el usuario.");
    }
    setCreando(false);
  };

  const cambiarPermiso = (u, seccionId, valor) => {
    const permisos = { ...(u.permisos || permisosPorDefecto(u.rol)), [seccionId]: valor };
    actualizar(u.id, { permisos });
    registrarAuditoria(usuarioActual, "cambiar_permiso", "usuario", u.id, { seccion: seccionId, valor, usuario: u.nombre });
  };

  const cambiarNotificacion = (u, categoriaId, valor) => {
    const notificaciones = { ...(u.notificaciones || notificacionesPorDefecto()), [categoriaId]: valor };
    actualizar(u.id, { notificaciones });
  };

  const [respaldando, setRespaldando] = useState(false);
  const [pidiendoContrasenaRespaldo, setPidiendoContrasenaRespaldo] = useState(false);
  const [contrasenaRespaldo, setContrasenaRespaldo] = useState("");
  const [errorRespaldo, setErrorRespaldo] = useState("");
  const LLAVE_COOLDOWN_RESPALDO = "nomos_cooldown_respaldo";
  const [proximoRespaldoDisponible, setProximoRespaldoDisponible] = useState(() => leerJSONLocal(LLAVE_COOLDOWN_RESPALDO, {})[usuarioActual.id] || 0);
  const segundosEsperaRespaldo = useCuentaRegresiva(proximoRespaldoDisponible);

  // Descargar TODA la información del despacho de un clic es justo lo que
  // buscaría alguien que robó una sesión activa (un computador desatendido,
  // una cookie robada) — pedir la contraseña otra vez aquí, aparte de la del
  // login, frena ese ataque puntual aunque ya esté "adentro". El enfriamiento
  // evita además que se use para sacar el respaldo una y otra vez seguido.
  const confirmarRespaldo = async () => {
    if (!contrasenaRespaldo.trim() || segundosEsperaRespaldo > 0) return;
    setErrorRespaldo("");
    const { error: reauthError } = await supabase.auth.signInWithPassword({ email: usuarioActual.email, password: contrasenaRespaldo });
    if (reauthError) {
      setErrorRespaldo("Contraseña incorrecta.");
      return;
    }
    setContrasenaRespaldo("");
    setPidiendoContrasenaRespaldo(false);
    const proximo = Date.now() + 5 * 60 * 1000;
    const mapa = leerJSONLocal(LLAVE_COOLDOWN_RESPALDO, {});
    mapa[usuarioActual.id] = proximo;
    guardarJSONLocal(LLAVE_COOLDOWN_RESPALDO, mapa);
    setProximoRespaldoDisponible(proximo);
    await descargarRespaldo();
  };

  const descargarRespaldo = async () => {
    setRespaldando(true);
    try {
      const despachoId = usuarioActual.despacho_id;
      const tablas = ["clientes", "documentos", "casos", "chats", "app_settings"];
      const respaldo = { despacho: getNombreDespacho(), generadoEn: new Date().toISOString() };
      for (const tabla of tablas) {
        const { data, error } = await supabase.from(tabla).select("*").eq("despacho_id", despachoId);
        if (error) throw error;
        respaldo[tabla] = data || [];
      }
      const contenido = JSON.stringify(respaldo, null, 2);
      const blob = new Blob([contenido], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `respaldo-${getNombreDespacho().toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      registrarAuditoria(usuarioActual, "descargar_respaldo", "despacho", despachoId, {});
    } catch (e) {
      setErrorRespaldo("No se pudo generar el respaldo. Intenta de nuevo en un momento.");
    }
    setRespaldando(false);
  };

  return (
    <div>
      <EncabezadoSeccion titulo="Usuarios y permisos" color="#6B7480" />
      <div
        style={{
          background: COLORS.accentSoft,
          border: "1px solid #C7D6EA",
          borderRadius: 10,
          padding: "12px 16px",
          marginBottom: 18,
          fontFamily: "Inter, sans-serif",
          fontSize: 12.5,
          color: COLORS.navy,
        }}
      >
        Solo tú, como Administrador, puedes crear usuarios y decidir qué puede ver cada uno.
      </div>

      <Card style={{ marginBottom: 20 }}>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: COLORS.headingText, marginBottom: 4 }}>Nombre del despacho</p>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 10 }}>
          Aparece en el menú, los PDFs, los recibos y los mensajes de WhatsApp que manda la app.
        </p>
        {editandoDespacho ? (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              className="drx-input"
              style={{ ...inputStyle, flex: 1, minWidth: 200 }}
              value={nombreDespachoEdit}
              onChange={(e) => setNombreDespachoEdit(e.target.value)}
            />
            <button className="drx-btn-primary" style={buttonPrimary} onClick={guardarNombreDespacho} disabled={guardandoDespacho || !nombreDespachoEdit.trim()}>
              {guardandoDespacho ? "Guardando…" : "Guardar"}
            </button>
            <button
              className="drx-btn-ghost"
              style={buttonGhost}
              onClick={() => {
                setNombreDespachoEdit(getNombreDespacho());
                setEditandoDespacho(false);
              }}
            >
              Cancelar
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.ink, margin: 0 }}>{getNombreDespacho()}</p>
            <button className="drx-btn-ghost" style={buttonGhost} onClick={() => setEditandoDespacho(true)}>
              Editar
            </button>
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: 20, borderLeft: "4px solid #10B981" }}>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: COLORS.headingText, marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}><Icono tipo="escudo" size={14} /> Respaldo de tus datos</p>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 12 }}>
          Descarga ahora mismo un archivo con TODA la información de tu despacho (clientes, documentos, casos y contenido) tal
          como está en este momento. Guárdalo en tu computador o en la nube (Google Drive, etc.). Recomendado: descárgalo
          cada semana o antes de cualquier cambio grande.
        </p>
        {!pidiendoContrasenaRespaldo ? (
          <>
            <button
              className="drx-btn-primary"
              style={{ ...buttonPrimary, background: "#10B981" }}
              onClick={() => setPidiendoContrasenaRespaldo(true)}
              disabled={respaldando || segundosEsperaRespaldo > 0}
            >
              {segundosEsperaRespaldo > 0 ? (
                `Vuelve a intentar en ${segundosEsperaRespaldo}s`
              ) : (
                <>
                  <Icono tipo="cursorArriba" size={13} style={{ marginRight: 4, verticalAlign: -2, transform: "rotate(180deg)" }} /> Descargar respaldo completo
                </>
              )}
            </button>
            {errorRespaldo && <p style={{ color: "#B42318", fontSize: 12, marginTop: 8, fontFamily: "Inter, sans-serif" }}>{errorRespaldo}</p>}
          </>
        ) : (
          <div style={{ maxWidth: 320 }}>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.inkSoft, marginBottom: 8 }}>
              Por seguridad, escribe tu contraseña otra vez para confirmar la descarga.
            </p>
            <CampoContrasena valor={contrasenaRespaldo} onChange={setContrasenaRespaldo} onEnter={confirmarRespaldo} autoFocus />
            {errorRespaldo && <p style={{ color: "#B42318", fontSize: 12, marginTop: 6, fontFamily: "Inter, sans-serif" }}>{errorRespaldo}</p>}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button
                className="drx-btn-ghost"
                style={buttonGhost}
                onClick={() => {
                  setPidiendoContrasenaRespaldo(false);
                  setContrasenaRespaldo("");
                  setErrorRespaldo("");
                }}
              >
                Cancelar
              </button>
              <button className="drx-btn-primary" style={{ ...buttonPrimary, background: "#10B981" }} onClick={confirmarRespaldo} disabled={respaldando || !contrasenaRespaldo.trim()}>
                {respaldando ? "Generando respaldo…" : "Confirmar y descargar"}
              </button>
            </div>
          </div>
        )}
      </Card>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button className="drx-btn-primary" style={buttonPrimary} onClick={() => setMostrarForm((s) => !s)}>
          {mostrarForm ? "Cancelar" : "+ Nuevo usuario"}
        </button>
      </div>

      {mostrarForm && (
        <Card style={{ marginBottom: 16 }}>
          <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Nombre">
              <input className="drx-input" style={inputStyle} value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </Field>
            <Field label="Correo">
              <input type="email" className="drx-input" style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Ej: novia@correo.com" />
            </Field>
            <Field label="Contraseña">
              <input type="password" className="drx-input" style={inputStyle} value={contrasena} onChange={(e) => setContrasena(e.target.value)} />
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: COLORS.muted, margin: "4px 0 0" }}>Mínimo 10 caracteres, combinando letras y números.</p>
            </Field>
            <Field label="Rol">
              <select className="drx-input" style={inputStyle} value={rol} onChange={(e) => setRol(e.target.value)}>
                <option>Administrador</option>
                <option>Abogado</option>
                <option>Asistente</option>
              </select>
            </Field>
          </div>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: COLORS.muted, marginTop: 10 }}>
            Los permisos se asignan según el rol y los puedes ajustar después en la lista de abajo.
          </p>
          {error && <p style={{ color: "#B42318", fontSize: 12.5, marginTop: 10, fontFamily: "Inter, sans-serif" }}>{error}</p>}
          <button
            className="drx-btn-primary"
            style={{ ...buttonPrimary, marginTop: 12 }}
            onClick={crear}
            disabled={creando || !nombre.trim() || !email.trim() || !contrasena.trim()}
          >
            {creando ? "Creando…" : "Crear usuario"}
          </button>
        </Card>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {usuarios.map((u) => {
          const permisos = u.permisos || permisosPorDefecto(u.rol);
          return (
            <Card key={u.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                <div>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.ink, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    {u.nombre} {u.id === usuarioActualId && <span style={{ color: COLORS.muted, fontWeight: 400, fontSize: 12 }}>(tú)</span>}
                    <span
                      style={{
                        fontFamily: "Inter, sans-serif",
                        fontSize: 10.5,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 20,
                        textTransform: "uppercase",
                        letterSpacing: 0.3,
                        background: u.rol === "Administrador" ? "#FEF3E2" : u.rol === "Abogado" ? COLORS.accentSoft : "#F0F0F0",
                        color: u.rol === "Administrador" ? "#B45309" : u.rol === "Abogado" ? COLORS.navy : COLORS.muted,
                      }}
                    >
                      {u.rol}
                    </span>
                  </p>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, margin: "2px 0 0" }}>{u.email}</p>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: COLORS.muted, margin: "2px 0 0" }}>
                    <UltimaSesionUsuario usuarioId={u.id} />
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="drx-btn-ghost"
                    style={{ ...buttonGhost, fontSize: 12, padding: "6px 12px" }}
                    onClick={() => enviarResetContrasena(u)}
                    disabled={enviandoResetId === u.id}
                  >
                    {resetEnviadoId === u.id ? "✓ Correo enviado" : enviandoResetId === u.id ? "Enviando…" : "Restablecer contraseña"}
                  </button>
                  {u.id !== usuarioActualId && (
                    <button
                      className="drx-btn-ghost"
                      style={{ ...buttonGhost, color: "#B42318", borderColor: "#F3C6C0", fontSize: 12, padding: "6px 12px" }}
                      onClick={() => eliminarUsuarioClick(u)}
                      disabled={eliminandoId === u.id}
                    >
                      {eliminandoId === u.id ? "Eliminando…" : "Eliminar acceso"}
                    </button>
                  )}
                </div>
              </div>
              {u.rol !== "Administrador" && (
                <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
                  <button
                    onClick={() => SECCIONES_PERMISOS.forEach((s) => cambiarPermiso(u, s.id, true))}
                    style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.accentBright, fontSize: 11.5, fontFamily: "Inter, sans-serif", textDecoration: "underline", padding: 0 }}
                  >
                    Marcar todo
                  </button>
                  <button
                    onClick={() => SECCIONES_PERMISOS.forEach((s) => cambiarPermiso(u, s.id, false))}
                    style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted, fontSize: 11.5, fontFamily: "Inter, sans-serif", textDecoration: "underline", padding: 0 }}
                  >
                    Ninguno
                  </button>
                </div>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {SECCIONES_PERMISOS.map((s) => (
                  <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.inkSoft, cursor: "pointer" }}>
                    <input type="checkbox" checked={permisos[s.id] !== false} onChange={(e) => cambiarPermiso(u, s.id, e.target.checked)} disabled={u.rol === "Administrador"} />
                    {s.nombre}
                  </label>
                ))}
              </div>
              {u.rol === "Administrador" && (
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: COLORS.muted, marginTop: 8, fontStyle: "italic" }}>
                  Los administradores siempre ven todas las secciones.
                </p>
              )}

              <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 12, paddingTop: 10 }}>
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 600, color: COLORS.muted, marginBottom: 8 }}>
                  <IconoCampana size={14} /> Qué notificaciones recibe (campana)
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                  {NOTIF_CATEGORIAS.map((n) => {
                    const notifs = u.notificaciones || notificacionesPorDefecto();
                    return (
                      <label key={n.id} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.inkSoft, cursor: "pointer" }}>
                        <input type="checkbox" checked={notifs[n.id] !== false} onChange={(e) => cambiarNotificacion(u, n.id, e.target.checked)} />
                        {n.nombre}
                      </label>
                    );
                  })}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <PanelSeguridadSesion confirmar={confirmar} />
      <PapeleraPanel />
      <PanelAuditoria />
      {ConfirmarDialogo}
    </div>
  );
}

function PanelSeguridadSesion({ confirmar }) {
  const [cerrando, setCerrando] = useState(false);
  const [hecho, setHecho] = useState(false);

  const cerrarTodasLasSesiones = async () => {
    if (!(await confirmar("¿Cerrar tu sesión en todos los dispositivos donde hayas iniciado sesión? Tendrás que volver a ingresar tu contraseña en todos ellos, incluido este."))) return;
    setCerrando(true);
    await supabase.auth.signOut({ scope: "global" });
    setHecho(true);
    setTimeout(() => window.location.reload(), 1200);
  };

  return (
    <Card style={{ marginBottom: 20 }}>
      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: COLORS.headingText, marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
        <Icono tipo="escudo" size={14} /> Seguridad de tu sesión
      </p>
      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 12 }}>
        Si crees que alguien más pudo haber entrado a tu cuenta, o dejaste una sesión abierta en un computador que no es tuyo, ciérralas todas de un clic.
      </p>
      <button className="drx-btn-ghost" style={{ ...buttonGhost, borderColor: "#B42318", color: "#B42318" }} onClick={cerrarTodasLasSesiones} disabled={cerrando}>
        {hecho ? "Listo, cerrando sesión..." : cerrando ? "Cerrando todas las sesiones..." : "Cerrar sesión en todos los dispositivos"}
      </button>
    </Card>
  );
}

const TIPOS_PAPELERA = [
  { tipo: "clientes", etiqueta: "Clientes", campo: "nombre" },
  { tipo: "documentos", etiqueta: "Documentos", campo: "titulo" },
];

function PapeleraPanel() {
  const [abierto, setAbierto] = useState(false);
  const [cargado, setCargado] = useState(false);
  const [items, setItems] = useState({ clientes: [], documentos: [] });
  const { confirmar, ConfirmarDialogo } = useConfirmarDialogo();

  const cargar = useCallback(async () => {
    const [clientes, documentos] = await Promise.all([obtenerPapelera("clientes"), obtenerPapelera("documentos")]);
    setItems({ clientes, documentos });
    setCargado(true);
  }, []);

  useEffect(() => {
    if (abierto && !cargado) cargar();
  }, [abierto, cargado, cargar]);

  const restaurar = async (tipo, id) => {
    await restaurarDePapelera(tipo, id);
    cargar();
  };

  const borrarDefinitivo = async (tipo, id) => {
    if (!(await confirmar("Esto borra el registro para siempre, sin poder recuperarlo. ¿Seguro?"))) return;
    await eliminarDefinitivo(tipo, id);
    cargar();
  };

  const totalItems = items.clientes.length + items.documentos.length;

  return (
    <>
    <Card style={{ marginTop: 20 }}>
      <button
        onClick={() => setAbierto((a) => !a)}
        style={{ background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: 0 }}
      >
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.ink, margin: 0 }}>
          <Icono tipo="papelera" size={14} style={{ marginRight: 4, verticalAlign: -2 }} /> Papelera {cargado ? `(${totalItems})` : ""}
        </p>
        <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted }}>{abierto ? "Ocultar ▲" : "Ver ▼"}</span>
      </button>

      {abierto && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 14 }}>
            Lo que se elimina desde Clientes o Firmar documentos queda aquí, no se borra de una. Puedes recuperarlo o borrarlo para siempre.
          </p>
          {TIPOS_PAPELERA.map(({ tipo, etiqueta, campo }) => (
            <div key={tipo} style={{ marginBottom: 16 }}>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 700, color: COLORS.headingText, marginBottom: 8 }}>{etiqueta}</p>
              {items[tipo].length === 0 && cargado && (
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, margin: 0 }}>Vacía.</p>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {items[tipo].map((r) => {
                  const dias = Math.floor((Date.now() - new Date(r.eliminado_en).getTime()) / 86400000);
                  return (
                    <div
                      key={r.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 8,
                        background: COLORS.accentSoft,
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: 8,
                        padding: "8px 12px",
                      }}
                    >
                      <div>
                        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 600, color: COLORS.ink, margin: 0 }}>
                          {r.data?.[campo] || "(sin nombre)"}
                        </p>
                        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: COLORS.muted, margin: "2px 0 0" }}>
                          Eliminado hace {dias} día{dias !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="drx-btn-ghost" style={{ ...buttonGhost, padding: "5px 10px", fontSize: 12 }} onClick={() => restaurar(tipo, r.id)}>
                          Restaurar
                        </button>
                        <button
                          className="drx-btn-ghost"
                          style={{ ...buttonGhost, padding: "5px 10px", fontSize: 12, color: "#B42318", borderColor: "#F3B4AC" }}
                          onClick={() => borrarDefinitivo(tipo, r.id)}
                        >
                          Borrar para siempre
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
    {ConfirmarDialogo}
    </>
  );
}

function PanelAuditoria() {
  const [registros, setRegistros] = useState([]);
  const [cargado, setCargado] = useState(false);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    if (!abierto || cargado) return;
    (async () => {
      const { data } = await supabase.from("auditoria").select("*").order("creado_en", { ascending: false }).limit(50);
      setRegistros(data || []);
      setCargado(true);
    })();
  }, [abierto, cargado]);

  const ETIQUETAS_ACCION = {
    crear_cliente: "creó al cliente",
    eliminar_cliente: "eliminó al cliente",
    registrar_pago: "registró un pago de",
    crear_usuario: "creó al usuario",
    cambiar_permiso: "cambió un permiso de",
    inicio_sesion: "inició sesión",
    descargar_respaldo: "descargó un respaldo completo",
  };

  return (
    <Card style={{ marginTop: 24 }}>
      <button
        onClick={() => setAbierto((a) => !a)}
        style={{ background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: 0 }}
      >
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.ink, margin: 0, display: "flex", alignItems: "center", gap: 6 }}><Icono tipo="portapapeles" size={15} /> Auditoría (últimos 50 registros)</p>
        <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted }}>{abierto ? "Ocultar ▲" : "Ver ▼"}</span>
      </button>

      {abierto && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 12 }}>
            Quién hizo qué y cuándo. Por ahora cubre creación/eliminación de clientes, pagos, creación de usuarios y cambios de permisos — se puede ampliar
            a más acciones cuando quieran.
          </p>
          {registros.length === 0 && cargado && <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted }}>Sin registros todavía.</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {registros.map((r) => (
              <p key={r.id} style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.inkSoft, margin: 0 }}>
                {new Date(r.creado_en).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })} — <strong>{r.usuario_nombre || "Alguien"}</strong>{" "}
                {ETIQUETAS_ACCION[r.accion] || r.accion} {r.detalle?.nombre || r.detalle?.usuario || ""}
                {r.detalle?.valor ? ` (${formatoCOP(r.detalle.valor)})` : ""}
              </p>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
