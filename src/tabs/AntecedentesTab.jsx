import { useState, useEffect, useRef } from "react";
import { COLORS, EncabezadoSeccion, Card, Icono, inputStyle, buttonGhost, buttonPrimary } from "../App.jsx";

// Todos estos portales son públicos y gratuitos (del Estado colombiano),
// pero ninguno es una API ni tiene forma confirmada de consultarse sin
// intervención humana — a diferencia de la Rama Judicial, que sí tiene un
// endpoint público que Nomos consulta solo. Por eso cada uno acá es un
// acceso directo: escribes el dato que pide, lo copias y lo abres para
// buscar a mano, igual que ya pasa con Fiscalía y SAMAI en Vigilancia
// judicial.
// Tipos de documento que piden los portales del Estado (cada uno usa una
// lista un poco distinta, pero estos son los que comparten).
const TIPOS_DOC = ["Cédula de ciudadanía", "Cédula de extranjería", "NIT", "Pasaporte", "Tarjeta de identidad"];

// Cada portal pide sus propios datos — Nomos los pide igual, en el mismo
// orden, para que solo haya que copiarlos y pegarlos allá. El código de
// verificación (captcha) de cada portal no se puede llenar desde Nomos.
const HERRAMIENTAS_ANTECEDENTES = [
  {
    id: "rues",
    nombre: "RUES — Registro único empresarial",
    para: "Comercial · Concursal",
    descripcion: "Si una empresa existe, quién es su representante legal, y si está en liquidación o un proceso de insolvencia.",
    campos: [{ id: "busqueda", label: "NIT (sin dígito de verificación) o razón social", principal: true }],
    nota: "En el RUES elige buscar por NIT o por razón social.",
    url: "https://www.rues.org.co/",
    color: "#2563EB",
  },
  {
    id: "antecedentesJudiciales",
    nombre: "Antecedentes judiciales",
    para: "Penal",
    descripcion: "Si una persona tiene antecedentes penales vigentes — consulta de la Policía Nacional.",
    campos: [
      { id: "tipo", label: "Tipo de documento", tipo: "doc" },
      { id: "numero", label: "Número de documento", principal: true },
    ],
    nota: "El portal primero pide aceptar los términos de uso.",
    url: "https://antecedentes.policia.gov.co:7005/WebJudicial/",
    color: "#B91C1C",
  },
  {
    id: "antecedentesDisciplinarios",
    nombre: "Antecedentes disciplinarios",
    para: "Todas las áreas",
    descripcion: "Si una persona (abogado, funcionario, contraparte) tiene sanciones disciplinarias — Procuraduría General.",
    campos: [
      { id: "tipo", label: "Tipo de documento", tipo: "doc" },
      { id: "numero", label: "Número de documento", principal: true },
    ],
    nota: "Entra a «Generar certificado de antecedentes». El portal hace una pregunta de seguridad (por ejemplo, un nombre) que se responde allá.",
    url: "https://www.procuraduria.gov.co/Pages/Consulta-de-Antecedentes.aspx",
    color: "#7C3AED",
  },
  {
    id: "antecedentesFiscales",
    nombre: "Antecedentes fiscales",
    para: "Todas las áreas",
    descripcion: "Boletín de responsables fiscales — si alguien está inhabilitado para manejar recursos públicos.",
    campos: [
      { id: "tipo", label: "Tipo de documento", tipo: "doc" },
      { id: "numero", label: "Número de documento o NIT", principal: true },
    ],
    nota: "En la página: Certificado de antecedentes fiscales → Persona natural (o jurídica).",
    url: "https://www.contraloria.gov.co/",
    color: "#0F766E",
  },
  {
    id: "runt",
    nombre: "RUNT — vehículos",
    para: "Civil · Comercial",
    descripcion: "Datos básicos de un vehículo (marca, modelo, estado). Prendas y embargos salen en el histórico vehicular, que es pago.",
    campos: [
      { id: "placa", label: "Placa", principal: true, mayus: true },
      { id: "tipo", label: "Tipo de documento del propietario", tipo: "doc" },
      { id: "numero", label: "Número de documento del propietario" },
    ],
    nota: "El RUNT exige la placa y el documento del propietario actual. Si la página queda en blanco, es el portal del RUNT cargando: espera unos segundos o recárgala.",
    url: "https://portalpublico.runt.gov.co/#/consulta-vehiculo/consulta/consulta-ciudadana",
    color: "#D97706",
  },
  {
    id: "comparendos",
    nombre: "Comparendos / Código de Policía",
    para: "Administrativo",
    descripcion: "Medidas correctivas o comparendos de Policía (RNMC) asociados a una persona.",
    campos: [
      { id: "tipo", label: "Tipo de documento", tipo: "doc" },
      { id: "numero", label: "Número de documento", principal: true },
      { id: "expedicion", label: "Fecha de expedición del documento (si la pide)", tipo: "fecha" },
    ],
    url: "https://srvcnpc.policia.gov.co/PSC/frm_cnp_consulta.aspx",
    color: "#DB2777",
  },
  {
    id: "simit",
    nombre: "SIMIT — multas de tránsito",
    para: "Civil · Administrativo",
    descripcion: "Multas de tránsito pendientes de una persona o un vehículo.",
    campos: [{ id: "busqueda", label: "Placa o número de documento", principal: true, mayus: true }],
    nota: "Escríbelo en el recuadro «Estado de cuenta» del SIMIT.",
    url: "https://www.fcm.org.co/simit/#/home-public",
    color: "#059669",
  },
];

function copiarTexto(texto, inputEl) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(texto).then(() => true).catch(() => (inputEl?.select(), false));
  inputEl?.select();
  return Promise.resolve(false);
}

function CampoConCopiar({ campo, valor, onChange, color }) {
  const ref = useRef(null);
  const [copiado, setCopiado] = useState(false);
  const textoParaCopiar = campo.tipo === "fecha" && valor ? valor.split("-").reverse().join("/") : valor;
  const copiar = () => {
    if (!valor) return;
    copiarTexto(textoParaCopiar, ref.current).then((ok) => {
      if (!ok) return;
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1200);
    });
  };
  return (
    <div>
      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 600, color: COLORS.inkSoft, margin: "0 0 4px" }}>{campo.label}</p>
      <div style={{ display: "flex", gap: 6 }}>
        {campo.tipo === "doc" ? (
          <select ref={ref} className="drx-input" style={{ ...inputStyle, flex: 1 }} value={valor} onChange={(e) => onChange(e.target.value)}>
            {TIPOS_DOC.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        ) : (
          <input
            ref={ref}
            type={campo.tipo === "fecha" ? "date" : "text"}
            className="drx-input"
            style={{ ...inputStyle, flex: 1, minWidth: 0 }}
            value={valor}
            onChange={(e) => onChange(campo.mayus ? e.target.value.toUpperCase() : e.target.value)}
          />
        )}
        {campo.tipo !== "doc" && (
          <button
            type="button"
            className="drx-btn-ghost"
            style={{ ...buttonGhost, padding: "6px 10px", fontSize: 12, flexShrink: 0, color: copiado ? color : undefined }}
            disabled={!valor}
            onClick={copiar}
            title="Copiar para pegarlo en el portal"
          >
            {copiado ? "✓" : "Copiar"}
          </button>
        )}
      </div>
    </div>
  );
}

function TarjetaHerramienta({ h }) {
  const [valores, setValores] = useState(() => Object.fromEntries(h.campos.map((c) => [c.id, c.tipo === "doc" ? TIPOS_DOC[0] : ""])));
  const principal = h.campos.find((c) => c.principal);
  const valorPrincipal = (principal && valores[principal.id]?.trim()) || "";
  const [avisoCopiado, setAvisoCopiado] = useState(false);

  // Al abrir el portal, el dato principal (cédula, placa, NIT) queda copiado
  // para pegarlo de una vez.
  const abrir = (e) => {
    // En computador, el portal del Estado se abre en una ventana al lado de
    // Nomos (no en otra pestaña), para copiar y pegar sin perder de vista
    // la ficha. Esos portales no se dejan mostrar dentro de Nomos (lo
    // bloquean por seguridad), así que una ventana aparte es lo más cercano.
    const pantalla = window.screen || {};
    const anchoTotal = pantalla.availWidth || window.innerWidth;
    if (anchoTotal >= 1000) {
      const ancho = Math.round(anchoTotal * 0.55);
      const alto = pantalla.availHeight || window.innerHeight;
      const izquierda = (pantalla.availLeft || 0) + anchoTotal - ancho;
      const ventana = window.open(h.url, "nomos-antecedentes", `popup=yes,width=${ancho},height=${alto},left=${izquierda},top=${pantalla.availTop || 0}`);
      if (ventana) {
        e.preventDefault();
        ventana.focus();
      }
    }
    if (!valorPrincipal) return;
    copiarTexto(valorPrincipal).then((ok) => {
      if (!ok) return;
      setAvisoCopiado(true);
      setTimeout(() => setAvisoCopiado(false), 2500);
    });
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
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {h.campos.map((c) => (
          <CampoConCopiar key={c.id} campo={c} valor={valores[c.id]} color={h.color} onChange={(v) => setValores((prev) => ({ ...prev, [c.id]: v }))} />
        ))}
      </div>
      {h.nota && <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: COLORS.muted, lineHeight: 1.5, margin: "10px 0 0" }}>ℹ {h.nota}</p>}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <a
          href={h.url}
          target="_blank"
          rel="noreferrer"
          onClick={abrir}
          className="drx-btn-primary"
          style={{ ...buttonPrimary, background: h.color, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
        >
          Abrir portal ↗
        </a>
        {avisoCopiado && (
          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: h.color, fontWeight: 600 }}>
            ✓ {principal.label.split(" (")[0]} copiado — pégalo en el portal
          </span>
        )}
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
        pide cada portal (son los mismos datos que te pedirá allá) y toca "Abrir portal": el dato principal se copia solo. El código de verificación (captcha) de cada portal sí hay que llenarlo allá.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
        {HERRAMIENTAS_ANTECEDENTES.map((h) => (
          <TarjetaHerramienta key={h.id} h={h} />
        ))}
      </div>
    </div>
  );
}
