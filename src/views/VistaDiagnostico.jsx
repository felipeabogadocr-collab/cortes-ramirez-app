import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  COLORS,
  Card,
  Spinner,
  buttonPrimary,
  inputStyle,
  GlobalStyle,
  APP_VERSION,
} from "../App.jsx";

export default function VistaDiagnostico() {
  const [resultados, setResultados] = useState(null);
  const [correoPrueba, setCorreoPrueba] = useState("");
  const [contrasenaPrueba, setContrasenaPrueba] = useState("");
  const [probando, setProbando] = useState(false);
  const [resultadoLogin, setResultadoLogin] = useState(null);

  const probarLogin = async () => {
    if (!correoPrueba.trim() || !contrasenaPrueba.trim()) return;
    setProbando(true);
    setResultadoLogin(null);
    const t0 = Date.now();
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: correoPrueba.trim(), password: contrasenaPrueba });
      const ms = Date.now() - t0;
      if (error) {
        setResultadoLogin({ ok: false, texto: `Supabase respondió con error después de ${ms} ms:\n"${error.message}" (status ${error.status || "?"})` });
      } else if (data?.user) {
        setResultadoLogin({ ok: true, texto: `¡Funcionó! Sesión creada en ${ms} ms para ${data.user.email}. El problema entonces está en la pantalla normal de login, no en la conexión — avísame.` });
        // Se cierra de una vez para no dejar una sesión de prueba abierta
        // en esta pantalla, que no está pensada para usarse como panel.
        await supabase.auth.signOut();
      } else {
        setResultadoLogin({ ok: false, texto: `Respuesta rara después de ${ms} ms: no hubo error pero tampoco llegó un usuario.` });
      }
    } catch (e) {
      const ms = Date.now() - t0;
      setResultadoLogin({ ok: false, texto: `Se rompió con una excepción después de ${ms} ms:\n"${e.message}"` });
    }
    setProbando(false);
  };

  useEffect(() => {
    (async () => {
      const url = import.meta.env.VITE_SUPABASE_URL || "";
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
      const pruebas = [];

      if (!url || !key || url.includes("TU-PROYECTO") || url.includes("placeholder")) {
        setResultados([
          {
            nombre: "Variables de entorno",
            ok: false,
            detalle:
              "VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY no están configuradas en Vercel (o siguen con el valor de ejemplo). Hay que ponerlas en Project Settings → Environment Variables y volver a desplegar.",
          },
        ]);
        return;
      }

      pruebas.push({ nombre: "URL configurada", ok: true, detalle: url.replace(/^https:\/\//, "") });

      try {
        const t0 = Date.now();
        const resp = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
        const ms = Date.now() - t0;
        if (resp.ok) {
          pruebas.push({ nombre: "Conexión con Supabase Auth", ok: true, detalle: `Respondió en ${ms} ms.` });
        } else {
          pruebas.push({
            nombre: "Conexión con Supabase Auth",
            ok: false,
            detalle: `Respondió con error ${resp.status}. Si el proyecto está pausado en Supabase, esto es justo lo que se ve — entra a supabase.com y busca un botón "Restore project".`,
          });
        }
      } catch (e) {
        pruebas.push({
          nombre: "Conexión con Supabase Auth",
          ok: false,
          detalle: `No se pudo contactar (${e.message}). Puede ser que el proyecto esté pausado, la URL esté mal, o no haya internet en este momento.`,
        });
      }

      try {
        const { error } = await supabase.from("perfiles").select("id", { count: "exact", head: true }).limit(1);
        pruebas.push(
          error
            ? { nombre: "Conexión con la base de datos", ok: false, detalle: error.message }
            : { nombre: "Conexión con la base de datos", ok: true, detalle: "Responde con normalidad." }
        );
      } catch (e) {
        pruebas.push({ nombre: "Conexión con la base de datos", ok: false, detalle: e.message });
      }

      setResultados(pruebas);
    })();
  }, []);

  const todoBien = resultados && resultados.every((p) => p.ok);

  return (
    <div style={{ background: COLORS.bg, minHeight: "100%", padding: 24 }}>
      <GlobalStyle />
      <div style={{ maxWidth: 480, margin: "40px auto" }}>
        <Card>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 16, fontWeight: 800, color: COLORS.headingText, margin: "0 0 4px" }}>
            Diagnóstico de Nomos
          </p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, margin: "0 0 18px" }}>
            v{APP_VERSION} · {new Date().toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}
          </p>
          {!resultados && <Spinner texto="Revisando la conexión…" />}
          {resultados && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {resultados.map((p) => (
                <div
                  key={p.nombre}
                  style={{
                    background: p.ok ? "#F0FDF4" : "#FEF2F2",
                    border: `1px solid ${p.ok ? "#BBF7D0" : "#F2B8B5"}`,
                    borderRadius: 10,
                    padding: "10px 14px",
                  }}
                >
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 700, color: p.ok ? "#166534" : "#B42318", margin: 0 }}>
                    {p.ok ? "✓" : "✕"} {p.nombre}
                  </p>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: p.ok ? "#166534" : "#B42318", margin: "4px 0 0", lineHeight: 1.5 }}>
                    {p.detalle}
                  </p>
                </div>
              ))}
              {todoBien && (
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted, marginTop: 4 }}>
                  Todo responde bien — si el login sigue sin funcionar, el problema es otra cosa, no la conexión.
                </p>
              )}
            </div>
          )}

          <div style={{ marginTop: 20, paddingTop: 18, borderTop: `1px solid ${COLORS.border}` }}>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 700, color: COLORS.headingText, margin: "0 0 4px" }}>
              Probar inicio de sesión aquí mismo
            </p>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: COLORS.muted, margin: "0 0 12px" }}>
              Esto llama a Supabase directamente y te muestra el error real, sin pasar por el resto de la app.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
              <input
                type="email"
                className="drx-input"
                style={inputStyle}
                placeholder="Correo"
                value={correoPrueba}
                onChange={(e) => setCorreoPrueba(e.target.value)}
                autoCapitalize="none"
              />
              <input
                type="password"
                className="drx-input"
                style={inputStyle}
                placeholder="Contraseña"
                value={contrasenaPrueba}
                onChange={(e) => setContrasenaPrueba(e.target.value)}
              />
            </div>
            <button
              className="drx-btn-primary"
              style={{ ...buttonPrimary, width: "100%" }}
              onClick={probarLogin}
              disabled={probando || !correoPrueba.trim() || !contrasenaPrueba.trim()}
            >
              {probando ? "Probando…" : "Probar"}
            </button>
            {resultadoLogin && (
              <p
                style={{
                  fontFamily: "monospace",
                  fontSize: 12,
                  whiteSpace: "pre-wrap",
                  color: resultadoLogin.ok ? "#166534" : "#B42318",
                  background: resultadoLogin.ok ? "#F0FDF4" : "#FEF2F2",
                  border: `1px solid ${resultadoLogin.ok ? "#BBF7D0" : "#F2B8B5"}`,
                  borderRadius: 8,
                  padding: "10px 12px",
                  marginTop: 12,
                }}
              >
                {resultadoLogin.texto}
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
