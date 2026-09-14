import {
  COLORS,
  GlobalStyle,
  BotonTema,
  useTema,
  InsigniaPlataforma,
} from "../App.jsx";
import { getNombreDespacho } from "../lib/storage";

export default function PoliticaPrivacidad() {
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
          Política de tratamiento de datos personales
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
          <strong>Borrador de referencia.</strong> Este texto cubre los elementos que exige la Ley 1581 de 2012 (habeas
          data), pero cada despacho debe revisarlo y ajustarlo con su propio abogado antes de publicarlo como su
          política definitiva — especialmente el nombre del responsable, sus datos de contacto y el detalle de las
          finalidades según lo que realmente hace con la información.
        </div>

        {[
          {
            t: "1. Responsable del tratamiento",
            c: `${getNombreDespacho()}, en su calidad de despacho de abogados, es responsable del tratamiento de los datos personales que recolecta a través de esta plataforma para la gestión de sus clientes y procesos.`,
          },
          {
            t: "2. Finalidad del tratamiento",
            c: "Los datos personales (nombre, identificación, contacto, información del proceso judicial, información de pagos y documentos) se usan exclusivamente para: prestar el servicio de representación o asesoría legal contratado, hacer seguimiento a los procesos judiciales, gestionar cobros y pagos, comunicarse con el cliente, y cumplir obligaciones legales o contractuales derivadas de la relación.",
          },
          {
            t: "3. Derechos del titular de los datos",
            c: "Como titular de tus datos personales tienes derecho a: conocer, actualizar y rectificar tus datos; solicitar prueba de la autorización otorgada; ser informado sobre el uso que se les ha dado; presentar quejas ante la Superintendencia de Industria y Comercio (SIC) por infracciones a la ley; revocar la autorización y/o solicitar la supresión del dato cuando no exista un deber legal o contractual que lo impida; y acceder de forma gratuita a tus datos.",
          },
          {
            t: "4. Cómo ejercer tus derechos",
            c: "Puedes ejercer estos derechos escribiendo directamente al despacho, por los medios de contacto que te compartió tu abogado (correo o WhatsApp). El despacho debe responder dentro de los términos que establece la ley.",
          },
          {
            t: "5. Seguridad de la información",
            c: "La información se almacena con controles técnicos de seguridad: autenticación de usuarios, cifrado de la conexión (HTTPS), registro de auditoría de accesos y cambios, y acceso restringido únicamente al personal autorizado del despacho.",
          },
          {
            t: "6. Vigencia",
            c: "Esta política aplica mientras exista una relación contractual o legal entre el titular y el despacho, y durante el tiempo adicional necesario para atender obligaciones legales, contables o de defensa judicial.",
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
