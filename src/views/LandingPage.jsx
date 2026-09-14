import { useState, useRef, useEffect } from "react";
import {
  COLORS,
  Card,
  Icono,
  buttonPrimary,
  buttonGhost,
  navLinkStyle,
  footerLinkStyle,
  GlobalStyle,
  BotonTema,
  TexturaGrano,
  useTema,
  AlEntrar,
  VistaPreviaAnimada,
  Kicker,
  IconoNomos,
  InsigniaPlataforma,
  IconoSeguridad,
  ICONOS_SEGURIDAD_ORDEN,
  NUMERO_WHATSAPP_DESPACHO,
  PLANES_PRECIO,
  FUNCIONES_LANDING,
  FAQ_LANDING,
  SEGURIDAD_LANDING,
} from "../App.jsx";

export default function LandingPage({ onRegistrar, onIniciarSesion }) {
  const { oscuro, alternar } = useTema();
  const [progresoScroll, setProgresoScroll] = useState(0);
  const [scrolleado, setScrolleado] = useState(false);
  const [mostrarSubir, setMostrarSubir] = useState(false);
  const [mostrarCtaFlotante, setMostrarCtaFlotante] = useState(false);
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);
  const ctaFlotanteRef = useRef(null);
  const [ctaFlotanteAltura, setCtaFlotanteAltura] = useState(0);
  // La barra flotante de abajo puede pasar a dos líneas en pantallas
  // angostas — sin medir su alto real, el botón de WhatsApp y el de
  // "volver arriba" (ambos fixed) le quedaban encima tapando el botón de
  // "Registrar mi despacho" en móvil.
  useEffect(() => {
    const elemento = ctaFlotanteRef.current;
    if (!elemento || typeof ResizeObserver === "undefined") return;
    const observador = new ResizeObserver(([entrada]) => setCtaFlotanteAltura(entrada.contentRect.height));
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  useEffect(() => {
    const alScroll = () => {
      const alto = document.documentElement.scrollHeight - window.innerHeight;
      setProgresoScroll(alto > 0 ? Math.min(100, (window.scrollY / alto) * 100) : 0);
      setScrolleado(window.scrollY > 20);
      setMostrarSubir(window.scrollY > 600);
      setMostrarCtaFlotante(window.scrollY > 700);
    };
    window.addEventListener("scroll", alScroll, { passive: true });
    alScroll();
    return () => window.removeEventListener("scroll", alScroll);
  }, []);

  return (
    <div className={oscuro ? "drx-tema-oscuro" : "drx-tema-claro"} style={{ background: COLORS.bg, minHeight: "100%" }}>
      <GlobalStyle />
      <style>{`
        html { scroll-behavior: smooth; }
        .drx-navlink { position: relative; padding-bottom: 3px; }
        .drx-navlink::after {
          content: ""; position: absolute; left: 0; right: 100%; bottom: 0; height: 2px;
          background: ${COLORS.accentBright}; transition: right 0.2s ease;
        }
        .drx-navlink:hover::after { right: 0; }
        .drx-faq summary { list-style: none; }
        .drx-faq summary::-webkit-details-marker { display: none; }
        .drx-faq summary::after { content: "+"; display: block; text-align: center; font-size: 16px; color: ${COLORS.accentBright}; margin-top: 4px; }
        .drx-faq details[open] summary::after { content: "−"; }
        @keyframes drx-subir { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
        .drx-hero-item { opacity: 0; animation: drx-subir 0.7s ease forwards; }

        /* Móvil: los links de navegación se esconden detrás de un botón de
           hamburguesa en vez de desbordarse a una segunda línea — en
           escritorio y tablet quedan igual que siempre, fijos en la barra. */
        .drx-landing-hamburguesa { display: none; }
        @media (max-width: 760px) {
          .drx-landing-links { display: none !important; }
          .drx-landing-inicio-desktop { display: none !important; }
          .drx-landing-hamburguesa {
            display: flex !important;
            align-items: center;
            justify-content: center;
            width: 38px;
            height: 38px;
            flex-shrink: 0;
            background: transparent;
            border: 1px solid ${COLORS.border};
            border-radius: 8px;
            cursor: pointer;
            color: ${COLORS.headingText};
          }
        }
      `}</style>

      <TexturaGrano />

      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 30,
          background: scrolleado ? (oscuro ? "rgba(26,33,44,0.92)" : "rgba(255,255,255,0.92)") : COLORS.panel,
          backdropFilter: scrolleado ? "blur(8px)" : "none",
          WebkitBackdropFilter: scrolleado ? "blur(8px)" : "none",
          borderBottom: `1px solid ${COLORS.border}`,
          borderTop: `3px solid ${COLORS.accentBright}`,
          boxShadow: scrolleado ? "0 4px 18px rgba(11,61,46,0.12)" : "0 2px 12px rgba(11,61,46,0.08)",
          transition: "box-shadow 0.2s ease, background 0.2s ease",
        }}
      >
        <div style={{ position: "absolute", left: 0, right: 0, bottom: -2, height: 2, background: COLORS.border }}>
          <div style={{ width: `${progresoScroll}%`, height: "100%", background: COLORS.accentBright, transition: "width 0.1s linear" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: scrolleado ? "10px 24px" : "14px 24px", maxWidth: 1040, margin: "0 auto", flexWrap: "wrap", gap: 12, transition: "padding 0.2s ease" }}>
          <InsigniaPlataforma />
          <div className="drx-landing-links" style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
            <a href="#funciones" className="drx-navlink" style={navLinkStyle}>Funciones</a>
            <a href="#seguridad" className="drx-navlink" style={navLinkStyle}>Seguridad</a>
            <a href="#planes" className="drx-navlink" style={navLinkStyle}>Planes</a>
            <a href="#faq" className="drx-navlink" style={navLinkStyle}>Preguntas frecuentes</a>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button
              onClick={onIniciarSesion}
              className="drx-landing-inicio-desktop"
              style={{ background: "none", border: "none", color: COLORS.muted, fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}
            >
              Iniciar sesión
            </button>
            <button className="drx-btn-primary" style={{ ...buttonPrimary, padding: "9px 18px", fontSize: 13 }} onClick={onRegistrar}>
              Registrar despacho
            </button>
            <BotonTema oscuro={oscuro} onClick={alternar} />
            <button
              className="drx-landing-hamburguesa"
              onClick={() => setMenuMovilAbierto((v) => !v)}
              title="Menú"
              aria-label="Abrir menú"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </div>
        </div>
        {menuMovilAbierto && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              padding: "4px 24px 16px",
              borderTop: `1px solid ${COLORS.border}`,
              background: oscuro ? "rgba(26,33,44,0.98)" : "#FFFFFF",
            }}
          >
            {[
              { href: "#funciones", texto: "Funciones" },
              { href: "#seguridad", texto: "Seguridad" },
              { href: "#planes", texto: "Planes" },
              { href: "#faq", texto: "Preguntas frecuentes" },
            ].map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuMovilAbierto(false)}
                style={{ ...navLinkStyle, padding: "12px 0", borderBottom: `1px solid ${COLORS.border}` }}
              >
                {link.texto}
              </a>
            ))}
            <button
              onClick={() => {
                setMenuMovilAbierto(false);
                onIniciarSesion();
              }}
              style={{ ...navLinkStyle, background: "none", border: "none", textAlign: "left", padding: "12px 0", cursor: "pointer", fontFamily: "Inter, sans-serif" }}
            >
              Iniciar sesión
            </button>
          </div>
        )}
      </div>

      <div className="drx-glow" style={{ textAlign: "center", padding: "40px 20px 50px", position: "relative", overflow: "hidden" }}>
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: -120,
            left: "10%",
            width: 320,
            height: 320,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(22,163,74,0.22) 0%, rgba(22,163,74,0) 70%)",
            animation: "drx-mesh 10s ease-in-out infinite",
            pointerEvents: "none",
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: -60,
            right: "8%",
            width: 260,
            height: 260,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(20,184,166,0.18) 0%, rgba(20,184,166,0) 70%)",
            animation: "drx-mesh 13s ease-in-out infinite reverse",
            pointerEvents: "none",
          }}
        />
        <span
          className="drx-hero-item"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            border: `1px solid #C7D6EA`,
            borderRadius: 20,
            padding: "7px 18px",
            fontFamily: "Inter, sans-serif",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 0.3,
            color: COLORS.navy,
            background: COLORS.accentSoft,
            animationDelay: "0s",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981", animation: "drx-pulse 1.8s ease-in-out infinite" }} />
          Software de gestión legal para despachos en Colombia
        </span>
        <h1
          className="drx-hero-item"
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 48,
            fontWeight: 800,
            letterSpacing: -0.5,
            margin: "26px auto 18px",
            maxWidth: 680,
            lineHeight: 1.12,
            animationDelay: "0.1s",
          }}
        >
          <span style={{ color: COLORS.headingText }}>Todo tu despacho, </span>
          <span
            style={{
              background: `linear-gradient(100deg, ${COLORS.navy}, ${COLORS.accentBright} 55%, #14B8A6)`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            en un solo lugar
          </span>
        </h1>
        <p className="drx-hero-item" style={{ fontFamily: "Inter, sans-serif", fontSize: 16, color: COLORS.muted, maxWidth: 580, margin: "0 auto 34px", lineHeight: 1.65, animationDelay: "0.2s" }}>
          Clientes, procesos judiciales, cobros, documentos con <strong style={{ color: COLORS.inkSoft }}>firma electrónica</strong> y
          contenido para redes sociales — con inteligencia artificial que te ayuda en el día a día. Sin instalar nada,
          desde el celular o el computador.
        </p>
        <div className="drx-hero-item" style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", animationDelay: "0.3s" }}>
          <button className="drx-btn-primary drx-cta-shine" style={{ ...buttonPrimary, padding: "14px 28px", fontSize: 14 }} onClick={onRegistrar}>
            Registrar mi despacho
          </button>
        </div>
        <div className="drx-hero-item" style={{ display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap", marginTop: 18, animationDelay: "0.4s" }}>
          {["Sin instalar nada", "Datos protegidos (Ley 1581 de 2012)", "Firma electrónica válida (Ley 527 de 1999)"].map((t) => (
            <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "Inter, sans-serif", fontSize: 11.5, color: COLORS.muted }}>
              <span style={{ color: "#10B981", fontWeight: 800 }}>✓</span>
              {t}
            </span>
          ))}
        </div>

        <div className="drx-hero-item" style={{ animationDelay: "0.5s" }}>
          <VistaPreviaAnimada />
        </div>

        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            bottom: -140,
            left: "38%",
            width: 300,
            height: 300,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(139,92,246,0.16) 0%, rgba(139,92,246,0) 70%)",
            animation: "drx-mesh 15s ease-in-out infinite",
            pointerEvents: "none",
          }}
        />
      </div>

      <div aria-hidden="true" style={{ lineHeight: 0, marginTop: -36, position: "relative", zIndex: 0, pointerEvents: "none" }}>
        <svg viewBox="0 0 1440 90" preserveAspectRatio="none" style={{ width: "100%", height: 70, display: "block" }}>
          <path d="M0,45 C240,90 480,0 720,25 C960,50 1200,10 1440,40 L1440,90 L0,90 Z" fill={COLORS.navy} opacity="0.05" />
        </svg>
      </div>

      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "0 20px 60px" }}>
        <Kicker texto="Cómo funciona" />
        <h2 style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 800, color: COLORS.headingText, textAlign: "center", marginBottom: 8, marginTop: 0 }}>
          De cero a operando, en tres pasos
        </h2>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.muted, textAlign: "center", marginBottom: 34 }}>
          No hay nada que instalar ni configurar a mano — empiezas a usarlo el mismo día.
        </p>
        <div style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 24, marginBottom: 64 }}>
          <div
            aria-hidden="true"
            style={{ position: "absolute", top: 22, left: "16%", right: "16%", height: 2, background: `linear-gradient(90deg, ${COLORS.border}, ${COLORS.accentBright}, ${COLORS.border})`, display: window?.innerWidth < 720 ? "none" : "block" }}
          />
          {[
            { n: "1", titulo: "Registra tu despacho", texto: "Con tu correo y el nombre del despacho — sin tarjeta de crédito ni formularios largos." },
            { n: "2", titulo: "Invita a tu equipo", texto: "Agrega abogados y asistentes, cada uno con el rol y los permisos que le correspondan." },
            { n: "3", titulo: "Empieza a gestionar", texto: "Carga tus clientes y procesos, y desde ahí Nomos vigila, cobra y firma contigo." },
          ].map((paso, i) => (
            <AlEntrar key={paso.n} retraso={i * 90}>
              <div style={{ textAlign: "center", position: "relative" }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    background: COLORS.navy,
                    color: "#FFFFFF",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 800,
                    fontSize: 17,
                    margin: "0 auto 14px",
                    boxShadow: "0 8px 20px rgba(11,61,46,0.25)",
                  }}
                >
                  {paso.n}
                </div>
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14.5, fontWeight: 700, color: COLORS.headingText, marginBottom: 6 }}>{paso.titulo}</p>
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted, lineHeight: 1.6, margin: 0, maxWidth: 240, marginLeft: "auto", marginRight: "auto" }}>
                  {paso.texto}
                </p>
              </div>
            </AlEntrar>
          ))}
        </div>

        <Kicker texto="Todo en un solo lugar" />
        <h2 id="funciones" style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 800, color: COLORS.headingText, textAlign: "center", marginBottom: 8, marginTop: 0, scrollMarginTop: 90 }}>
          Qué encuentras adentro
        </h2>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.muted, textAlign: "center", marginBottom: 30 }}>
          Cada pestaña de la app resuelve una parte real de la operación de un despacho.
        </p>
        {/* Lista editorial en dos columnas, no tarjetas de colores — un
            despacho de abogados se lee más serio con algo cercano a una
            hoja de especificaciones (número + título + texto) que con un
            mosaico de íconos pastel tipo plantilla genérica de SaaS. */}
        <div
          className="drx-lista-funciones"
          style={{ columns: typeof window !== "undefined" && window.innerWidth < 720 ? 1 : 2, columnGap: 56, marginBottom: 60 }}
        >
          {FUNCIONES_LANDING.map((f, i) => (
            <AlEntrar key={f.titulo} retraso={(i % 4) * 60}>
              <div className="drx-fila-funcion" style={{ breakInside: "avoid", display: "flex", gap: 18, padding: "24px 0", borderBottom: `1px solid ${COLORS.border}` }}>
                <p
                  aria-hidden="true"
                  style={{ fontFamily: "Inter, sans-serif", fontSize: 26, fontWeight: 800, color: COLORS.border, margin: 0, lineHeight: 1, flexShrink: 0, minWidth: 38, transition: "color .2s ease" }}
                >
                  {String(i + 1).padStart(2, "0")}
                </p>
                <div>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 800, color: COLORS.headingText, margin: "0 0 6px", letterSpacing: -0.2 }}>{f.titulo}</p>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.inkSoft, lineHeight: 1.65, margin: 0 }}>{f.texto}</p>
                </div>
              </div>
            </AlEntrar>
          ))}
        </div>

        <Kicker texto="En detalle" />
        <h2 style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 800, color: COLORS.headingText, textAlign: "center", marginBottom: 44 }}>
          Lo que más usan los despachos
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 56, marginBottom: 64 }}>
          {[
            {
              kicker: "Vigilancia judicial",
              titulo: "La Rama Judicial, vigilada sola todos los días",
              texto: "Registras el radicado una vez y Nomos consulta el proceso automáticamente cada día. Cuando hay una actuación nueva, una IA te la explica en palabras simples y te sugiere el siguiente paso — no vuelves a revisar procesos uno por uno.",
              color: "#F5A524",
              contenido: (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { nombre: "Proceso 2024-00187", estado: "Con novedad", color: "#F5A524" },
                    { nombre: "Proceso 2023-00542", estado: "En trámite", color: "#2F80ED" },
                    { nombre: "Proceso 2022-00931", estado: "Finalizado", color: "#10B981" },
                  ].map((p) => (
                    <div key={p.nombre} style={{ background: "#0d3524", borderRadius: 8, padding: "9px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontFamily: "monospace", fontSize: 11, color: "#D7E2F1" }}>{p.nombre}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "Inter, sans-serif", fontSize: 9.5, fontWeight: 700, color: p.color }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: p.color }} />
                        {p.estado}
                      </span>
                    </div>
                  ))}
                </div>
              ),
            },
            {
              kicker: "Firma electrónica",
              titulo: "Firmas con validez legal, desde el celular",
              texto: "Compartes un código con tu cliente y firma sin instalar nada. Cada firma queda con hash de integridad, consentimiento expreso e IP capturada del lado del servidor — con base en la Ley 527 de 1999, y verificable después si el documento se modificó.",
              color: "#10B981",
              contenido: (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ background: "#0d3524", borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#10B981", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span style={{ color: "#FFFFFF", fontWeight: 800, fontSize: 14 }}>✓</span>
                    </div>
                    <div>
                      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: "#FFFFFF", margin: 0 }}>Contrato de prestación de servicios</p>
                      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 9.5, color: "#9FB6D6", margin: "2px 0 0" }}>Firmado por cliente y abogado</p>
                    </div>
                  </div>
                  <div style={{ background: "#0d3524", borderRadius: 8, padding: "8px 12px", fontFamily: "monospace", fontSize: 9.5, color: "#7C93B8", wordBreak: "break-all" }}>
                    hash: 8f3a2c…e91d — íntegro ✓
                  </div>
                </div>
              ),
            },
            {
              kicker: "Reportes",
              titulo: "Decide con datos reales, no con intuición",
              texto: "Ingresos por mes, procesos por estado y carga de trabajo por abogado, siempre actualizados y sin armar nada en Excel. Sabes cuánto entró este mes y cuánto falta por cobrar con solo entrar a la pestaña.",
              color: "#0EA5E9",
              contenido: (
                <div>
                  <div style={{ background: "#0d3524", borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "flex-end", gap: 8, height: 84, marginBottom: 10 }}>
                    {[30, 48, 40, 62, 58, 75, 66].map((h, i) => (
                      <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: 3, background: i === 5 ? "#0EA5E9" : "#1e5fb4" }} />
                    ))}
                  </div>
                  <div style={{ background: "#0d3524", borderRadius: 8, padding: "9px 12px", display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: "Inter, sans-serif", fontSize: 10, color: "#9FB6D6" }}>Ingreso este mes</span>
                    <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 800, color: "#10B981" }}>▲ 18%</span>
                  </div>
                </div>
              ),
            },
          ].map((f, i) => (
            <AlEntrar key={f.kicker}>
              <div
                style={{
                  display: "flex",
                  flexDirection: i % 2 === 0 ? "row" : "row-reverse",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 36,
                }}
              >
                <div style={{ flex: "1 1 320px" }}>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: f.color, marginBottom: 8 }}>
                    {f.kicker}
                  </p>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 19, fontWeight: 800, color: COLORS.headingText, marginBottom: 10, lineHeight: 1.35 }}>{f.titulo}</p>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.inkSoft, lineHeight: 1.65, margin: 0 }}>{f.texto}</p>
                </div>
                <div style={{ flex: "1 1 320px" }}>
                  <div style={{ background: COLORS.navy, borderRadius: 14, padding: 18, boxShadow: "0 18px 40px rgba(11,61,46,0.22)" }}>{f.contenido}</div>
                </div>
              </div>
            </AlEntrar>
          ))}
        </div>

        <Kicker texto="La comparación" />
        <h2 style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 800, color: COLORS.headingText, textAlign: "center", marginBottom: 8, marginTop: 0 }}>
          El antes y el después
        </h2>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.muted, textAlign: "center", marginBottom: 24 }}>
          Lo que hoy le toma a un despacho hacer a mano, con Nomos pasa solo.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18, marginBottom: 60 }}>
          <AlEntrar>
            <div style={{ background: COLORS.surfaceSoft, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 22, opacity: 0.9 }}>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 }}>
                Sin Nomos, hoy
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  "Expedientes repartidos entre carpetas físicas y chats de WhatsApp",
                  "Recordar de memoria a quién le toca pagar y cuándo",
                  "Revisar la Rama Judicial proceso por proceso, uno por uno",
                  "Imprimir, firmar a mano y escanear cada documento",
                  "Armar reportes en Excel cuando alcanza el tiempo",
                ].map((t, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ color: "#B42318", fontWeight: 800, fontSize: 13 }}>✕</span>
                    <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.inkSoft, lineHeight: 1.5 }}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </AlEntrar>
          <AlEntrar retraso={100}>
            <div style={{ background: COLORS.navy, borderRadius: 14, padding: 22, boxShadow: "0 16px 40px rgba(11,61,46,0.25)" }}>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: "#9FB6D6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 }}>
                Con Nomos
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  "Todo el expediente de cada cliente en un solo lugar, con línea de tiempo",
                  "Recordatorios automáticos de pagos por vencer, listos para enviar por WhatsApp",
                  "El estado de todos los procesos con un clic, todos los días",
                  "Firma electrónica válida (Ley 527 de 1999), en minutos, desde el celular",
                  "Reportes que se arman solos y siempre están al día",
                ].map((t, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ color: "#10B981", fontWeight: 800, fontSize: 13 }}>✓</span>
                    <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: "#E4EBF5", lineHeight: 1.5 }}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </AlEntrar>
        </div>

      </div>

      <div style={{ background: COLORS.surfaceSoft, borderTop: `1px solid ${COLORS.border}`, borderBottom: `1px solid ${COLORS.border}`, padding: "56px 20px" }}>
        <div style={{ maxWidth: 1040, margin: "0 auto" }}>
          <Kicker texto="Datos sensibles, en serio" />
          <h2 id="seguridad" style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 800, color: COLORS.headingText, textAlign: "center", marginBottom: 8, marginTop: 0, scrollMarginTop: 90 }}>
            Seguridad
          </h2>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.muted, textAlign: "center", marginBottom: 30 }}>
            Se registra información sensible de tus clientes — la protegemos en serio.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            {SEGURIDAD_LANDING.map((s, i) => (
              <AlEntrar key={s.titulo} retraso={(i % 4) * 70}>
                <Card style={{ position: "relative", overflow: "hidden" }}>
                  <div
                    aria-hidden="true"
                    style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, transparent, ${COLORS.accentBright}, transparent)` }}
                  />
                  <div
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      top: -30,
                      right: -30,
                      width: 90,
                      height: 90,
                      borderRadius: "50%",
                      background: `radial-gradient(circle, ${COLORS.accentBright}22 0%, transparent 70%)`,
                      pointerEvents: "none",
                    }}
                  />
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 11,
                      background: `linear-gradient(135deg, ${COLORS.accentBright}2E, ${COLORS.accentBright}0F)`,
                      boxShadow: `0 8px 18px ${COLORS.accentBright}26`,
                      color: COLORS.navy,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 17,
                      marginBottom: 12,
                      position: "relative",
                    }}
                  >
                    <IconoSeguridad tipo={ICONOS_SEGURIDAD_ORDEN[i % ICONOS_SEGURIDAD_ORDEN.length]} />
                  </div>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, fontWeight: 800, color: COLORS.headingText, margin: "0 0 5px", position: "relative" }}>{s.titulo}</p>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.inkSoft, lineHeight: 1.55, margin: 0, position: "relative" }}>{s.texto}</p>
                </Card>
              </AlEntrar>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "56px 20px 0" }}>
        <Kicker texto="Sin sorpresas" />
        <h2 id="planes" style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 800, color: COLORS.headingText, textAlign: "center", marginBottom: 8, marginTop: 0, scrollMarginTop: 90 }}>
          Planes
        </h2>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.muted, textAlign: "center", marginBottom: 6 }}>
          Precios de referencia — se ajustan antes del lanzamiento comercial.
        </p>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, textAlign: "center", marginBottom: 30 }}>Pesos colombianos, IVA no incluido.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginBottom: 50 }}>
          {PLANES_PRECIO.map((p, i) => (
            <AlEntrar key={p.nombre} retraso={i * 90}>
            <Card
              style={{
                border: p.destacado ? `2px solid ${COLORS.accentBright}` : `1px solid ${COLORS.border}`,
                borderTop: `4px solid ${p.destacado ? COLORS.accentBright : COLORS.navy}`,
                ...(p.destacado ? { boxShadow: "0 10px 30px rgba(22,163,74,0.18)" } : {}),
                position: "relative",
              }}
            >
              {p.destacado && (
                <span
                  style={{
                    position: "absolute",
                    top: -11,
                    left: 20,
                    background: COLORS.accentBright,
                    color: "#FFFFFF",
                    fontFamily: "Inter, sans-serif",
                    fontSize: 10.5,
                    fontWeight: 700,
                    padding: "3px 10px",
                    borderRadius: 20,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Más elegido
                </span>
              )}
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  background: p.destacado ? COLORS.accentSoft : COLORS.surfaceSoft,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 16,
                  marginBottom: 10,
                  marginTop: 6,
                }}
              >
                <Icono tipo={p.destacado ? "edificio" : "persona"} size={16} />
              </div>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.headingText, margin: "0 0 4px" }}>{p.nombre}</p>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 14, minHeight: 32, lineHeight: 1.5 }}>{p.descripcion}</p>
              <p style={{ fontFamily: "Inter, sans-serif", margin: "0 0 16px" }}>
                <span style={{ fontSize: 30, fontWeight: 800, color: COLORS.headingText }}>{p.precio}</span>
                <span style={{ fontSize: 12.5, color: COLORS.muted }}> {p.periodo}</span>
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
                {p.caracteristicas.map((c, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{ color: "#10B981", fontWeight: 800, fontSize: 12.5 }}>✓</span>
                    <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.inkSoft }}>{c}</span>
                  </div>
                ))}
              </div>
              <button
                className={p.destacado ? "drx-btn-primary" : "drx-btn-ghost"}
                style={{ ...(p.destacado ? buttonPrimary : buttonGhost), width: "100%" }}
                onClick={onRegistrar}
              >
                Empezar
              </button>
            </Card>
            </AlEntrar>
          ))}
        </div>

        <AlEntrar>
          <div style={{ overflowX: "auto", marginBottom: 50 }}>
            <table className="drx-tabla-planes" style={{ width: "100%", borderCollapse: "collapse", minWidth: 460, fontFamily: "Inter, sans-serif" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "10px 14px", fontSize: 12, color: COLORS.muted, fontWeight: 600, borderBottom: `1px solid ${COLORS.border}` }}>Incluye</th>
                  <th style={{ textAlign: "center", padding: "10px 14px", fontSize: 12.5, color: COLORS.headingText, fontWeight: 800, borderBottom: `1px solid ${COLORS.border}` }}>Abogado</th>
                  <th style={{ textAlign: "center", padding: "10px 14px", fontSize: 12.5, color: COLORS.accentBright, fontWeight: 800, borderBottom: `2px solid ${COLORS.accentBright}` }}>Despacho</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { fila: "Usuarios", abogado: "1", despacho: "Ilimitados" },
                  { fila: "Clientes activos", abogado: "Hasta 30", despacho: "Ilimitados" },
                  { fila: "Firma electrónica", abogado: true, despacho: true },
                  { fila: "Vigilancia judicial automática", abogado: true, despacho: true },
                  { fila: "Portal del cliente", abogado: true, despacho: true },
                  { fila: "Reportes y carga por abogado", abogado: false, despacho: true },
                  { fila: "Roles y permisos por usuario", abogado: false, despacho: true },
                  { fila: "Soporte prioritario", abogado: false, despacho: true },
                ].map((r, i) => (
                  <tr key={r.fila} style={{ background: i % 2 === 0 ? "transparent" : COLORS.surfaceSoft }}>
                    <td style={{ padding: "10px 14px", fontSize: 12.5, color: COLORS.inkSoft }}>{r.fila}</td>
                    <td style={{ padding: "10px 14px", textAlign: "center", fontSize: 12.5, color: COLORS.inkSoft }}>
                      {typeof r.abogado === "boolean" ? <span style={{ color: r.abogado ? "#10B981" : COLORS.border, fontWeight: 800 }}>{r.abogado ? "✓" : "—"}</span> : r.abogado}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "center", fontSize: 12.5, color: COLORS.inkSoft, background: `${COLORS.accentBright}0D` }}>
                      {typeof r.despacho === "boolean" ? <span style={{ color: r.despacho ? "#10B981" : COLORS.border, fontWeight: 800 }}>{r.despacho ? "✓" : "—"}</span> : r.despacho}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AlEntrar>

        <div style={{ textAlign: "center", marginBottom: 60 }}>
          <button className="drx-btn-primary drx-cta-shine" style={{ ...buttonPrimary, padding: "14px 28px", fontSize: 14 }} onClick={onRegistrar}>
            Registrar mi despacho
          </button>
        </div>

      </div>

      <div style={{ background: COLORS.surfaceSoft, borderTop: `1px solid ${COLORS.border}`, padding: "56px 20px 60px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <Kicker texto="Antes de escribirnos" />
          <h2 id="faq" style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 800, color: COLORS.headingText, textAlign: "center", marginBottom: 30, marginTop: 0, scrollMarginTop: 90 }}>
            Preguntas frecuentes
          </h2>
          <div className="drx-faq" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 12 }}>
            {FAQ_LANDING.map((f, i) => (
              <AlEntrar key={i} retraso={(i % 4) * 60}>
                <details style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "14px 20px", height: "100%" }}>
                  <summary
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      fontFamily: "Inter, sans-serif",
                      fontSize: 13,
                      fontWeight: 800,
                      letterSpacing: 0.3,
                      color: COLORS.ink,
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ width: 22, height: 22, borderRadius: 6, background: COLORS.accentSoft, color: COLORS.navy, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                      ?
                    </span>
                    {f.p}
                  </summary>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.inkSoft, lineHeight: 1.7, margin: "12px 0 0" }}>
                    {f.r}
                  </p>
                </details>
              </AlEntrar>
            ))}
          </div>
        </div>
      </div>

      <AlEntrar>
        <div
          style={{
            margin: "0 20px 40px",
            maxWidth: 1000,
            marginLeft: "auto",
            marginRight: "auto",
            background: `linear-gradient(120deg, ${COLORS.navy}, #143c72)`,
            borderRadius: 20,
            padding: "44px 28px",
            textAlign: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div aria-hidden="true" style={{ position: "absolute", top: -100, right: -80, width: 260, height: 260, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 24, fontWeight: 800, color: "#FFFFFF", margin: "0 0 10px", position: "relative" }}>
            ¿Listo para dejar el papel atrás?
          </p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, color: "#C4D3E8", margin: "0 0 24px", maxWidth: 480, marginLeft: "auto", marginRight: "auto", position: "relative" }}>
            Registra tu despacho hoy y empieza a gestionar clientes, procesos y firmas desde un solo lugar.
          </p>
          <button
            className="drx-btn-primary"
            style={{ ...buttonPrimary, padding: "14px 30px", fontSize: 14, position: "relative", background: "#FFFFFF", color: COLORS.navy }}
            onClick={onRegistrar}
          >
            Registrar mi despacho
          </button>
        </div>
      </AlEntrar>

      <div style={{ background: COLORS.navy, padding: "44px 24px 26px", marginTop: 20 }}>
        <div
          style={{
            maxWidth: 1040,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 28,
            marginBottom: 30,
          }}
        >
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.navy, flexShrink: 0 }}>
                <IconoNomos size={18} />
              </div>
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: 17, fontWeight: 800, letterSpacing: 1, color: "#FFFFFF" }}>Nomos</span>
            </div>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "#9FB6D6", lineHeight: 1.6, margin: 0 }}>
              Software de gestión legal para despachos de abogados en Colombia.
            </p>
          </div>

          <div>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: "#FFFFFF", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
              Producto
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              <a href="#funciones" style={footerLinkStyle}>Funciones</a>
              <a href="#seguridad" style={footerLinkStyle}>Seguridad</a>
              <a href="#planes" style={footerLinkStyle}>Planes</a>
              <a href="#faq" style={footerLinkStyle}>Preguntas frecuentes</a>
            </div>
          </div>

          <div>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: "#FFFFFF", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
              Legal
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              <a href="/#privacidad" target="_blank" rel="noreferrer" style={footerLinkStyle}>Política de tratamiento de datos</a>
              <a href="/#terminos" target="_blank" rel="noreferrer" style={footerLinkStyle}>Términos de uso</a>
            </div>
          </div>

          <div>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: "#FFFFFF", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
              Contacto
            </p>
            <a
              href={`https://wa.me/${NUMERO_WHATSAPP_DESPACHO}?text=${encodeURIComponent("Hola, tengo una pregunta sobre Nomos.")}`}
              target="_blank"
              rel="noreferrer"
              style={{ ...footerLinkStyle, display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Icono tipo="chat" size={14} style={{ marginRight: 5, verticalAlign: -2 }} /> Escríbenos por WhatsApp
            </a>
          </div>
        </div>

        <div style={{ borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 18, textAlign: "center" }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: "#9FB6D6", margin: 0, lineHeight: 1.6 }}>
            Nomos — creado por <strong style={{ color: "#FFFFFF" }}>Felipe Cortés Ramírez</strong>, abogado y CEO de Cortés Ramírez Abogados.
            <br />
            Todos los derechos reservados.
          </p>
        </div>
      </div>

      <a
        href={`https://wa.me/${NUMERO_WHATSAPP_DESPACHO}?text=${encodeURIComponent("Hola, tengo una pregunta sobre Nomos.")}`}
        target="_blank"
        rel="noreferrer"
        title="Escríbenos por WhatsApp"
        style={{
          position: "fixed",
          bottom: mostrarCtaFlotante ? ctaFlotanteAltura + 16 : 22,
          right: 22,
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "#1DA851",
          transition: "bottom 0.3s ease",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 8px 20px rgba(0,0,0,0.25)",
          zIndex: 40,
          textDecoration: "none",
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="#FFFFFF">
          <path d="M17.5 14.4c-.3-.1-1.7-.8-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-1 1.2-.2.2-.4.2-.6.1-.3-.1-1.3-.5-2.5-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6.1-.1.3-.4.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.1-.7-1.6-.9-2.2-.2-.5-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1.1 2.8 1.2 3c.1.2 2.2 3.4 5.4 4.7.8.3 1.4.5 1.8.7.8.2 1.5.2 2 .1.6-.1 1.7-.7 2-1.4.2-.7.2-1.2.1-1.4-.1-.1-.3-.2-.6-.3Z" />
          <path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.1-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.6 0-3.1-.4-4.5-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Z" />
        </svg>
      </a>

      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label="Volver arriba"
        style={{
          position: "fixed",
          bottom: mostrarCtaFlotante ? ctaFlotanteAltura + 18 : 24,
          left: 24,
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: COLORS.navy,
          border: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 8px 20px rgba(11,61,46,0.3)",
          zIndex: 40,
          cursor: "pointer",
          opacity: mostrarSubir ? 1 : 0,
          transform: mostrarSubir ? "translateY(0)" : "translateY(12px)",
          pointerEvents: mostrarSubir ? "auto" : "none",
          transition: "opacity 0.25s ease, transform 0.25s ease, bottom 0.3s ease",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12l6-6 6 6" />
        </svg>
      </button>

      <div
        ref={ctaFlotanteRef}
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 39,
          background: COLORS.panel,
          borderTop: `1px solid ${COLORS.border}`,
          boxShadow: "0 -6px 20px rgba(11,61,46,0.12)",
          padding: "12px 20px",
          transform: mostrarCtaFlotante ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.3s ease",
        }}
      >
        <div style={{ maxWidth: 1040, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 700, color: COLORS.headingText, margin: 0 }}>
            ¿Listo para dejar el papel atrás?
          </p>
          <button className="drx-btn-primary drx-cta-shine" style={{ ...buttonPrimary, padding: "9px 20px", fontSize: 13 }} onClick={onRegistrar}>
            Registrar mi despacho
          </button>
        </div>
      </div>
    </div>
  );
}
