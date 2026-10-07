import { useState, useEffect } from "react";
import { COLORS, EncabezadoSeccion, Card, Icono, inputStyle, buttonGhost, buttonPrimary } from "../App.jsx";

// Todos estos portales son públicos y gratuitos (del Estado colombiano),
// pero ninguno es una API ni tiene forma confirmada de consultarse sin
// intervención humana — a diferencia de la Rama Judicial, que sí tiene un
// endpoint público que Nomos consulta solo. Por eso cada uno acá es un
// acceso directo: escribes el dato que pide, lo copias y lo abres para
// buscar a mano, igual que ya pasa con Fiscalía y SAMAI en Vigilancia
// judicial.
const HERRAMIENTAS_ANTECEDENTES = [
  {
    id: "rues",
    nombre: "RUES — Registro único empresarial",
    para: "Comercial · Concursal",
    descripcion: "Si una empresa existe, quién es su representante legal, y si está en liquidación o un proceso de insolvencia.",
    dato: "NIT o nombre de la empresa",
    url: "https://www.rues.org.co/RM",
    color: "#2563EB",
  },
  {
    id: "antecedentesJudiciales",
    nombre: "Antecedentes judiciales",
    para: "Penal",
    descripcion: "Si una persona tiene antecedentes penales vigentes — consulta de la Policía Nacional.",
    dato: "Número de cédula",
    url: "https://antecedentes.policia.gov.co:7005/WebJudicial/",
    color: "#B91C1C",
  },
  {
    id: "antecedentesDisciplinarios",
    nombre: "Antecedentes disciplinarios",
    para: "Todas las áreas",
    descripcion: "Si una persona (abogado, funcionario, contraparte) tiene sanciones disciplinarias — Procuraduría General.",
    dato: "Cédula o NIT",
    url: "https://www.procuraduria.gov.co/Pages/Consulta-de-Antecedentes.aspx",
    color: "#7C3AED",
  },
  {
    id: "antecedentesFiscales",
    nombre: "Antecedentes fiscales",
    para: "Todas las áreas",
    descripcion: "Boletín de responsables fiscales — si alguien está inhabilitado para manejar recursos públicos.",
    dato: "Cédula o NIT",
    url: "https://www.contraloria.gov.co/web/guest/certificado-de-antecedentes",
    color: "#0F766E",
  },
  {
    id: "runt",
    nombre: "RUNT — vehículos",
    para: "Civil · Comercial",
    descripcion: "Información de un vehículo: propietario, prendas, estado — útil en procesos con bienes de por medio.",
    dato: "Número de placa",
    url: "https://www.runt.com.co/consultaCiudadana/#/consultaVehiculo",
    color: "#D97706",
  },
  {
    id: "comparendos",
    nombre: "Comparendos / Código de Policía",
    para: "Administrativo",
    descripcion: "Medidas correctivas o comparendos de Policía (RNMC) asociados a una persona.",
    dato: "Número de cédula",
    url: "https://srvpsi.policia.gov.co:8443/PNC-RNMC-WEB/",
    color: "#DB2777",
  },
  {
    id: "simit",
    nombre: "SIMIT — multas de tránsito",
    para: "Civil · Administrativo",
    descripcion: "Multas de tránsito pendientes de una persona o un vehículo.",
    dato: "Cédula o placa",
    url: "https://www.fcm.org.co/simit/#/home-public",
    color: "#059669",
  },
];

function TarjetaHerramienta({ h }) {
  const [valor, setValor] = useState("");
  const [copiado, setCopiado] = useState(false);

  const copiar = () => {
    if (!valor.trim()) return;
    navigator.clipboard
      ?.writeText(valor.trim())
      .then(() => {
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1200);
      })
      .catch(() => {});
  };

  return (
    <Card style={{ borderTop: `3px solid ${h.color}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14.5, fontWeight: 800, color: COLORS.ink, margin: 0 }}>{h.nombre}</p>
        <span
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 10.5,
            fontWeight: 700,
            color: h.color,
            background: `${h.color}1A`,
            borderRadius: 20,
            padding: "2px 9px",
            whiteSpace: "nowrap",
          }}
        >
          {h.para}
        </span>
      </div>
      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.inkSoft, lineHeight: 1.5, margin: "0 0 12px" }}>{h.descripcion}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          className="drx-input"
          style={{ ...inputStyle, flex: "1 1 160px" }}
          placeholder={h.dato}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
        />
        <button className="drx-btn-ghost" style={buttonGhost} disabled={!valor.trim()} onClick={copiar}>
          {copiado ? "✓ Copiado" : "Copiar"}
        </button>
        <a
          href={h.url}
          target="_blank"
          rel="noreferrer"
          className="drx-btn-primary"
          style={{ ...buttonPrimary, background: h.color, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
        >
          Abrir ↗
        </a>
      </div>
    </Card>
  );
}

export default function AntecedentesTab({ onListo }) {
  useEffect(() => {
    onListo?.();
  }, [onListo]);

  return (
    <div>
      <EncabezadoSeccion titulo="Antecedentes" color="#6366F1" />
      <div
        style={{
          background: COLORS.surfaceSoft,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 10,
          padding: "14px 16px",
          marginBottom: 18,
          fontFamily: "Inter, sans-serif",
          fontSize: 12.5,
          color: COLORS.navy,
          lineHeight: 1.6,
        }}
      >
        <strong>
          <Icono tipo="escudo" size={13} style={{ marginRight: 4, verticalAlign: -2 }} /> Sobre esta sección:
        </strong>{" "}
        son enlaces a portales públicos y gratuitos del Estado para revisar antecedentes de clientes, contrapartes o
        bienes. Ninguno es una integración automática de Nomos (como sí lo es Rama Judicial) — escribe el dato que
        pide cada uno, cópialo con el botón y ábrelo para consultar a mano.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
        {HERRAMIENTAS_ANTECEDENTES.map((h) => (
          <TarjetaHerramienta key={h.id} h={h} />
        ))}
      </div>
    </div>
  );
}
