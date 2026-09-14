import {
  COLORS,
  GlobalStyle,
  BotonTema,
  useTema,
  InsigniaPlataforma,
} from "../App.jsx";

export default function TerminosUso() {
  const { oscuro, alternar } = useTema();
  return (
    <div className={oscuro ? "drx-tema-oscuro" : "drx-tema-claro"} style={{ background: COLORS.bg, minHeight: "100%" }}>
      <GlobalStyle />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", maxWidth: 760, margin: "0 auto" }}>
        <InsigniaPlataforma />
        <BotonTema oscuro={oscuro} onClick={alternar} />
      </div>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "10px 24px 60px" }}>
        <h1 style={{ fontFamily: "Inter, sans-serif", fontSize: 26, fontWeight: 800, color: COLORS.headingText, marginBottom: 8 }}>
          Términos de uso y propiedad intelectual
        </h1>
        <div
          style={{
            background: "#FEF3E2",
            border: "1px solid #FCE3B8",
            borderRadius: 10,
            padding: "12px 16px",
            marginBottom: 24,
            fontFamily: "Inter, sans-serif",
            fontSize: 12.5,
            color: "#92400E",
            lineHeight: 1.6,
          }}
        >
          <strong>Borrador de referencia.</strong> Este texto está pensado para dar un punto de partida legalmente
          sólido, no para publicarse tal cual sin que un abogado (tú) lo revise y lo ajuste con los datos definitivos
          de la empresa antes de considerarlo vinculante frente a terceros.
        </div>

        {[
          {
            t: "1. Aceptación",
            c: "Al acceder o usar Nomos, el usuario acepta estos términos. Si actúa en representación de un despacho, declara tener autorización para vincularlo a estas condiciones.",
          },
          {
            t: "2. Propiedad intelectual",
            c: "El software, su código fuente, diseño de interfaz, marca, logotipo, textos, estructura de funcionalidades y demás elementos de Nomos son propiedad de su desarrollador y están protegidos por la Ley 23 de 1982 (derechos de autor en Colombia, que protege el software como obra literaria) y la Decisión Andina 351 de 1993 (régimen común sobre derecho de autor de la Comunidad Andina, vinculante para Colombia). Queda prohibida su reproducción, distribución o modificación sin autorización expresa.",
          },
          {
            t: "3. Usos prohibidos",
            c: "Está expresamente prohibido: (a) realizar ingeniería inversa del software o sus funcionalidades; (b) hacer scraping, extracción automatizada o recolección masiva del contenido o la estructura de la plataforma; (c) usar el contenido, diseño o funcionamiento de Nomos para entrenar modelos de inteligencia artificial; y (d) copiar, imitar o replicar sustancialmente el producto, su marca o su modelo de negocio con el fin de crear un producto competidor.",
          },
          {
            t: "4. Competencia desleal",
            c: "La copia o imitación sustancial del funcionamiento, diseño o modelo de negocio de Nomos, aprovechando indebidamente el esfuerzo ajeno, puede constituir un acto de competencia desleal bajo la Ley 256 de 1996, sin perjuicio de las acciones civiles y penales que correspondan por infracción a los derechos de autor.",
          },
          {
            t: "5. Consecuencias del incumplimiento",
            c: "El incumplimiento de estos términos puede dar lugar a la suspensión inmediata del acceso a la plataforma y al ejercicio de las acciones legales disponibles ante las autoridades competentes en Colombia.",
          },
          {
            t: "6. Disponibilidad del servicio",
            c: "Nomos se presta \"tal cual\" (as is). Se hacen esfuerzos razonables por mantener la disponibilidad y seguridad del servicio, pero no se garantiza una disponibilidad del 100%, especialmente para las integraciones que dependen de servicios de terceros no oficiales (por ejemplo, la consulta a la Rama Judicial).",
          },
          {
            t: "7. Ley aplicable y jurisdicción",
            c: "Estos términos se rigen por las leyes de la República de Colombia. Cualquier controversia se someterá a los jueces competentes de Colombia.",
          },
        ].map((s) => (
          <div key={s.t} style={{ marginBottom: 18 }}>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14.5, fontWeight: 700, color: COLORS.headingText, marginBottom: 6 }}>{s.t}</p>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.inkSoft, lineHeight: 1.7, margin: 0 }}>{s.c}</p>
          </div>
        ))}

        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: COLORS.muted, marginTop: 30 }}>
          Última actualización: {new Date().toLocaleDateString("es-CO", { dateStyle: "long" })}.
        </p>
        <a href="/" style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.accentBright }}>
          ← Volver al inicio
        </a>
      </div>
    </div>
  );
}
