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

// Genera un correo y contraseña al azar con acceso temporal, para probar la
// app en vivo (o prestárselo a alguien) sin usar tus propias credenciales.
// La cuenta se puede seguir usando después de vencida (queda en la lista de
// usuarios como cualquier otra, para borrarla a mano), pero deja de poder
// iniciar sesión — ver App.jsx: iniciarSesion / cargarPerfilActual.
function PanelAccesoPrueba() {
  const [minutos, setMinutos] = useState(10);
  const [rol, setRol] = useState("Administrador");
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState(null);
  const [copiado, setCopiado] = useState("");
  const [segundosRestantes, setSegundosRestantes] = useState(null);

  useEffect(() => {
    if (!resultado) return;
    const actualizar = () => {
      const restante = Math.max(0, Math.round((new Date(resultado.expiraEn).getTime() - Date.now()) / 1000));
      setSegundosRestantes(restante);
    };
    actualizar();
    const intervalo = setInterval(actualizar, 1000);
    return () => clearInterval(intervalo);
  }, [resultado]);

  const generar = async () => {
    setGenerando(true);
    setError("");
    try {
      const { data: sesionData } = await supabase.auth.getSession();
      const token = sesionData?.session?.access_token;
      const response = await fetch("/api/usuarios/crear-prueba", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ minutos, rol }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo crear el acceso de prueba.");
      setResultado(data);
    } catch (e) {
      setError(e.message);
    }
    setGenerando(false);
  };

  const copiar = (texto, etiqueta) => {
    navigator.clipboard?.writeText(texto);
    setCopiado(etiqueta);
    setTimeout(() => setCopiado(""), 1500);
  };

  const vencido = segundosRestantes === 0;
  const minutosRestantes = segundosRestantes !== null ? Math.floor(segundosRestantes / 60) : null;
  const segundosResto = segundosRestantes !== null ? segundosRestantes % 60 : null;

  return (
    <Card style={{ marginBottom: 20, borderLeft: "4px solid #2F80ED" }}>
      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: COLORS.headingText, marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
        <Icono tipo="reloj" size={14} /> Acceso de prueba
      </p>
      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 12 }}>
        Genera un correo y contraseña al azar (no hace falta que el correo exista) para probar la app o compartirlo con
        alguien sin usar tus propias credenciales. Deja de funcionar solo, al vencer el tiempo.
      </p>

      {!resultado ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Field label="Duración">
            <select className="drx-input" style={{ ...inputStyle, width: "auto" }} value={minutos} onChange={(e) => setMinutos(Number(e.target.value))}>
              <option value={10}>10 minutos</option>
              <option value={20}>20 minutos</option>
              <option value={30}>30 minutos</option>
              <option value={60}>1 hora</option>
            </select>
          </Field>
          <Field label="Rol">
            <select className="drx-input" style={{ ...inputStyle, width: "auto" }} value={rol} onChange={(e) => setRol(e.target.value)}>
              <option value="Administrador">Administrador (ve todo)</option>
              <option value="Abogado">Abogado</option>
              <option value="Asistente">Asistente</option>
            </select>
          </Field>
          <button className="drx-btn-primary" style={buttonPrimary} onClick={generar} disabled={generando}>
            {generando ? "Generando…" : "Generar acceso de prueba"}
          </button>
        </div>
      ) : (
        <div style={{ background: vencido ? "#FEF2F2" : COLORS.accentSoft, border: `1px solid ${vencido ? "#F3C6C0" : "#C7D6EA"}`, borderRadius: 10, padding: 14 }}>
          {vencido ? (
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: "#B42318", margin: 0 }}>
              Este acceso ya venció. Genera uno nuevo si lo sigues necesitando.
            </p>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 700, color: COLORS.navy, margin: 0 }}>
                  Vence en {minutosRestantes}:{String(segundosResto).padStart(2, "0")}
                </p>
                <button
                  className="drx-btn-ghost"
                  style={{ ...buttonGhost, padding: "5px 10px", fontSize: 11.5 }}
                  onClick={() => copiar(`Correo: ${resultado.email}\nContraseña: ${resultado.contrasena}`, "todo")}
                >
                  {copiado === "todo" ? "✓ Copiado" : "Copiar correo y contraseña"}
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, background: "#FFFFFF", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 12px" }}>
                  <code style={{ fontFamily: "monospace", fontSize: 13, color: COLORS.ink }}>{resultado.email}</code>
                  <button className="drx-btn-ghost" style={{ ...buttonGhost, padding: "3px 8px", fontSize: 11 }} onClick={() => copiar(resultado.email, "correo")}>
                    {copiado === "correo" ? "✓" : "Copiar"}
                  </button>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, background: "#FFFFFF", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 12px" }}>
                  <code style={{ fontFamily: "monospace", fontSize: 13, color: COLORS.ink }}>{resultado.contrasena}</code>
                  <button className="drx-btn-ghost" style={{ ...buttonGhost, padding: "3px 8px", fontSize: 11 }} onClick={() => copiar(resultado.contrasena, "contrasena")}>
                    {copiado === "contrasena" ? "✓" : "Copiar"}
                  </button>
                </div>
              </div>
            </>
          )}
          <button
            className="drx-btn-ghost"
            style={{ ...buttonGhost, marginTop: 10, fontSize: 11.5, padding: "5px 10px" }}
            onClick={() => {
              setResultado(null);
              setSegundosRestantes(null);
            }}
          >
            Generar otro
          </button>
        </div>
      )}
      {error && <p style={{ color: "#B42318", fontSize: 12.5, marginTop: 10, fontFamily: "Inter, sans-serif" }}>{error}</p>}
    </Card>
  );
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
      const tablas = ["clientes", "documentos", "chats", "app_settings"];
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
          Descarga ahora mismo un archivo con TODA la información de tu despacho (clientes, documentos y contenido) tal
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

      <PanelAccesoPrueba />

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

const ETIQUETAS_ACCION = {
  crear_cliente: { texto: "creó al cliente", color: "#10B981" },
  eliminar_cliente: { texto: "eliminó al cliente", color: "#B42318" },
  registrar_pago: { texto: "registró un pago de", color: "#10B981" },
  editar_pago: { texto: "editó un pago de", color: "#0EA5E9" },
  eliminar_pago: { texto: "eliminó un pago de", color: "#B42318" },
  registrar_egreso: { texto: "registró un egreso de", color: "#F43F5E" },
  eliminar_egreso: { texto: "eliminó un egreso de", color: "#B42318" },
  registrar_otro_ingreso: { texto: "registró un ingreso de", color: "#10B981" },
  eliminar_otro_ingreso: { texto: "eliminó un ingreso de", color: "#B42318" },
  crear_usuario: { texto: "creó al usuario", color: "#10B981" },
  eliminar_usuario: { texto: "eliminó al usuario", color: "#B42318" },
  cambiar_permiso: { texto: "cambió un permiso de", color: "#0EA5E9" },
  inicio_sesion: { texto: "inició sesión", color: "#6B7480" },
  descargar_respaldo: { texto: "descargó un respaldo completo", color: "#8B5CF6" },
  crear_documento: { texto: "creó el documento", color: "#10B981" },
  editar_documento: { texto: "editó el documento", color: "#0EA5E9" },
  duplicar_documento: { texto: "duplicó el documento", color: "#0EA5E9" },
  eliminar_documento: { texto: "eliminó el documento", color: "#B42318" },
  firmar_documento: { texto: "firmó el documento", color: "#10B981" },
  editar_cliente: { texto: "editó al cliente", color: "#0EA5E9" },
  agregar_actuacion: { texto: "agregó una actuación a", color: "#0EA5E9" },
  actualizar_vigilancia: { texto: "actualizó la vigilancia judicial de", color: "#0EA5E9" },
  crear_evento: { texto: "agendó el evento", color: "#10B981" },
  programar_cobro: { texto: "programó un cobro para", color: "#0EA5E9" },
};

const AUDITORIA_POR_PAGINA = 25;
const AUDITORIA_MAX_REGISTROS = 150;

function PanelAuditoria() {
  const [registros, setRegistros] = useState([]);
  const [cargado, setCargado] = useState(false);
  const [cargandoPagina, setCargandoPagina] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [totalRegistros, setTotalRegistros] = useState(0);

  useEffect(() => {
    if (!abierto) return;
    (async () => {
      setCargandoPagina(true);
      const desde = pagina * AUDITORIA_POR_PAGINA;
      const hasta = desde + AUDITORIA_POR_PAGINA - 1;
      const { data, count } = await supabase
        .from("auditoria")
        .select("*", { count: "exact" })
        .order("creado_en", { ascending: false })
        .range(desde, hasta);
      setRegistros(data || []);
      setTotalRegistros(count || 0);
      setCargado(true);
      setCargandoPagina(false);
    })();
  }, [abierto, pagina]);

  // Se acota a los últimos 150 (6 páginas) — suficiente para auditar lo
  // reciente sin convertir esto en un reporte histórico completo, que
  // necesitaría su propia pantalla de filtros por fecha/usuario.
  const totalAcotado = Math.min(totalRegistros, AUDITORIA_MAX_REGISTROS);
  const totalPaginas = Math.max(1, Math.ceil(totalAcotado / AUDITORIA_POR_PAGINA));

  return (
    <Card style={{ marginTop: 24 }}>
      <button
        onClick={() => setAbierto((a) => !a)}
        style={{ background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: 0 }}
      >
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.ink, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
          <Icono tipo="portapapeles" size={15} /> Auditoría {totalRegistros > 0 ? `(${Math.min(totalRegistros, AUDITORIA_MAX_REGISTROS)}${totalRegistros > AUDITORIA_MAX_REGISTROS ? "+" : ""} registros)` : ""}
        </p>
        <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted }}>{abierto ? "Ocultar ▲" : "Ver ▼"}</span>
      </button>

      {abierto && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 14 }}>
            Quién hizo qué y cuándo — clientes, pagos, egresos e ingresos, usuarios y permisos, documentos y respaldos.
          </p>
          {registros.length === 0 && cargado && !cargandoPagina && (
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted }}>Sin registros todavía.</p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 2, opacity: cargandoPagina ? 0.5 : 1, transition: "opacity 0.15s ease" }}>
            {registros.map((r) => {
              const etiqueta = ETIQUETAS_ACCION[r.accion];
              return (
                <div
                  key={r.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "9px 10px",
                    borderRadius: 8,
                    transition: "background 0.15s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.surfaceSoft)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: etiqueta?.color || "#6B7480", marginTop: 5, flexShrink: 0 }} />
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.inkSoft, margin: 0, lineHeight: 1.5 }}>
                    <span style={{ color: COLORS.muted }}>{new Date(r.creado_en).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}</span>
                    {" — "}
                    <strong style={{ color: COLORS.headingText }}>{r.usuario_nombre || "Alguien"}</strong>{" "}
                    {etiqueta?.texto || r.accion} {r.detalle?.nombre || r.detalle?.usuario || ""}
                    {r.detalle?.valor ? ` (${formatoCOP(r.detalle.valor)})` : ""}
                  </p>
                </div>
              );
            })}
          </div>
          {totalRegistros > AUDITORIA_POR_PAGINA && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 14, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${COLORS.border}` }}>
              <button
                onClick={() => setPagina((p) => Math.max(0, p - 1))}
                disabled={pagina === 0 || cargandoPagina}
                style={{
                  fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 999,
                  border: `1px solid ${COLORS.border}`, background: "#fff", color: pagina === 0 ? COLORS.muted : COLORS.headingText,
                  cursor: pagina === 0 || cargandoPagina ? "default" : "pointer", opacity: pagina === 0 ? 0.5 : 1,
                }}
              >
                ← Anterior
              </button>
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, minWidth: 90, textAlign: "center" }}>
                Página {pagina + 1} de {totalPaginas}
              </span>
              <button
                onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
                disabled={pagina + 1 >= totalPaginas || cargandoPagina}
                style={{
                  fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 999,
                  border: `1px solid ${COLORS.border}`, background: "#fff", color: pagina + 1 >= totalPaginas ? COLORS.muted : COLORS.headingText,
                  cursor: pagina + 1 >= totalPaginas || cargandoPagina ? "default" : "pointer", opacity: pagina + 1 >= totalPaginas ? 0.5 : 1,
                }}
              >
                Siguiente →
              </button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
