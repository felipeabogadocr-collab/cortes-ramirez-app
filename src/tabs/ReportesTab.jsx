import { useEffect, useState } from "react";
import { getNombreDespacho } from "../lib/storage";
import {
  COLORS, formatoCOP, exportarCSV, buttonGhost, Card, EncabezadoSeccion, Icono, EstadoVacio,
  Spinner, GraficaBarras, GraficaBarrasAgrupadas, COLOR_AREA_PROCESO, COLOR_ESTADO_VIGILANCIA,
  ESTADOS_VIGILANCIA, useDatosReportes, ensureJsPDF, obtenerLogoBase64,
} from "../App.jsx";

// Las gráficas en pantalla son SVG propio (GraficaBarras/GraficaBarrasAgrupadas,
// hechas a mano) — no hay forma directa de "imprimirlas" en un PDF, así que el
// reporte descargable muestra la misma información en listas/tablas de texto,
// sección por sección, en vez de intentar redibujar las barras.
async function generarReportePdf(datos) {
  await ensureJsPDF();
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const marginX = 56;
  const anchoUtil = pageWidth - marginX * 2;
  let y = 56;

  const salto = (alto) => {
    if (y + alto > pageHeight - 50) {
      pdf.addPage();
      y = 56;
    }
  };

  try {
    const logoSize = 44;
    pdf.addImage(await obtenerLogoBase64(), "PNG", pageWidth / 2 - logoSize / 2, y, logoSize, logoSize);
    y += logoSize + 14;
  } catch (e) {
    // el PDF se genera igual sin logo
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(11, 18, 32);
  pdf.text(getNombreDespacho(), pageWidth / 2, y, { align: "center" });
  y += 20;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(17);
  pdf.text("Reporte de gestión", pageWidth / 2, y, { align: "center" });
  y += 18;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(100, 116, 139);
  pdf.text(new Date().toLocaleDateString("es-CO", { dateStyle: "long" }), pageWidth / 2, y, { align: "center" });
  y += 32;

  const titulo = (texto) => {
    salto(28);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12.5);
    pdf.setTextColor(11, 18, 32);
    pdf.text(texto, marginX, y);
    y += 8;
    pdf.setDrawColor(203, 213, 225);
    pdf.line(marginX, y, pageWidth - marginX, y);
    y += 16;
  };

  const fila = (etiqueta, valor, opciones = {}) => {
    salto(16);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10.5);
    pdf.setTextColor(51, 65, 85);
    pdf.text(etiqueta, marginX, y);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...(opciones.color || [15, 23, 42]));
    pdf.text(String(valor), pageWidth - marginX, y, { align: "right" });
    y += 15;
  };

  const nota = (texto) => {
    salto(20);
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(9.5);
    pdf.setTextColor(100, 116, 139);
    pdf.splitTextToSize(texto, anchoUtil).forEach((linea) => {
      salto(13);
      pdf.text(linea, marginX, y);
      y += 13;
    });
    y += 6;
  };

  titulo("Resumen");
  fila("Clientes activos", datos.listaClientes.length);
  fila("Ingreso este mes", formatoCOP(datos.ingresoMesActual), { color: [22, 101, 52] });
  fila("Egresos este mes", formatoCOP(datos.egresoMesActual), { color: datos.egresoMesActual > 0 ? [180, 35, 24] : undefined });
  fila("Neto este mes", formatoCOP(datos.netoMesActual), { color: datos.netoMesActual >= 0 ? [22, 101, 52] : [180, 35, 24] });
  fila("Cartera pendiente", formatoCOP(datos.carteraPendienteTotal), { color: datos.carteraPendienteTotal > 0 ? [180, 35, 24] : undefined });
  y += 8;

  titulo("Ingresos vs. egresos por mes");
  fila("Total recaudado (histórico)", formatoCOP(datos.ingresoTotalHistorico));
  fila("Total egresos (histórico)", formatoCOP(datos.egresoTotalHistorico));
  fila("Neto histórico", formatoCOP(datos.netoTotalHistorico));
  y += 4;
  datos.mesesEtiquetas.forEach((m) => {
    fila(m.etiqueta, `${formatoCOP(datos.ingresosPorMes[m.clave])} · ${formatoCOP(datos.egresosPorMes[m.clave])} egresos`);
  });
  y += 8;

  titulo("Procesos por estado");
  if (datos.listaClientes.length === 0) {
    nota("Aún no hay clientes registrados.");
  } else {
    ESTADOS_VIGILANCIA.forEach((estado) => fila(estado, datos.conteoEstados[estado] || 0));
    if (datos.sinRevisar > 0) fila("Sin revisar", datos.sinRevisar);
  }
  y += 8;

  titulo("Carga de trabajo por abogado");
  if (datos.filasCarga.length === 0) {
    nota("Aún no hay clientes registrados.");
  } else {
    datos.filasCarga.forEach(([nombreAbogado, n]) => fila(nombreAbogado, n));
  }
  y += 8;

  titulo("Distribución por área del derecho");
  if (datos.filasArea.length === 0) {
    nota("Aún no hay clientes registrados.");
  } else {
    datos.filasArea.forEach(([area, n]) => fila(area, n));
    if (datos.clientesConPago > 0) fila("Ticket promedio por cliente que ha pagado", formatoCOP(datos.ticketPromedio));
  }

  const totalPaginas = pdf.internal.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    pdf.setPage(p);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(148, 163, 184);
    pdf.text(`Página ${p} de ${totalPaginas}`, pageWidth / 2, pageHeight - 24, { align: "center" });
  }

  pdf.save(`reporte_${getNombreDespacho().replace(/[^a-z0-9]+/gi, "_").toLowerCase()}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export default function ReportesTab({ onListo }) {
  const {
    cargando,
    usuarios,
    mesesEtiquetas,
    ingresosPorMes,
    ingresoTotalHistorico,
    maxIngresoMes,
    ingresoMesActual,
    cambioMensual,
    egresosPorMes,
    egresoTotalHistorico,
    egresoMesActual,
    netoMesActual,
    netoTotalHistorico,
    carteraPendienteTotal,
    conteoEstados,
    sinRevisar,
    maxEstado,
    filasCarga,
    maxCarga,
    filasArea,
    maxArea,
    clientesConPago,
    ticketPromedio,
    listaClientes,
  } = useDatosReportes();

  const [generandoPdf, setGenerandoPdf] = useState(false);
  const descargarPdf = async () => {
    setGenerandoPdf(true);
    try {
      await generarReportePdf({
        listaClientes,
        ingresoMesActual,
        egresoMesActual,
        netoMesActual,
        carteraPendienteTotal,
        ingresoTotalHistorico,
        egresoTotalHistorico,
        netoTotalHistorico,
        mesesEtiquetas,
        ingresosPorMes,
        egresosPorMes,
        conteoEstados,
        sinRevisar,
        filasCarga,
        filasArea,
        clientesConPago,
        ticketPromedio,
      });
    } catch (e) {
      console.error("No se pudo generar el reporte en PDF:", e);
    }
    setGenerandoPdf(false);
  };

  useEffect(() => {
    if (!cargando) onListo?.();
  }, [cargando]);

  if (cargando) {
    return (
      <div>
        <EncabezadoSeccion titulo="Reportes" color="#0EA5E9" />
        <Spinner />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <EncabezadoSeccion titulo="Reportes" color="#0EA5E9" />
        <div style={{ display: "flex", gap: 8 }}>
          <button className="drx-btn-ghost" style={buttonGhost} onClick={descargarPdf} disabled={generandoPdf}>
            {generandoPdf ? "Generando…" : "Exportar PDF"}
          </button>
          <button
            className="drx-btn-ghost"
            style={buttonGhost}
            onClick={() =>
              exportarCSV(
                "reporte-ingresos.csv",
                [
                  { titulo: "Mes", valor: (m) => m.etiqueta },
                  { titulo: "Ingreso", valor: (m) => ingresosPorMes[m.clave] },
                ],
                mesesEtiquetas
              )
            }
          >
            Exportar Excel
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        <Card>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>
            Clientes activos
          </p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 24, fontWeight: 800, color: COLORS.ink, margin: "4px 0 0" }}>{listaClientes.length}</p>
        </Card>
        <Card>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>
            Ingreso este mes
          </p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 24, fontWeight: 800, color: "#166534", margin: "4px 0 0" }}>{formatoCOP(ingresoMesActual)}</p>
          {cambioMensual !== null && (
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 600, color: cambioMensual >= 0 ? "#166534" : "#B42318", margin: "3px 0 0" }}>
              {cambioMensual >= 0 ? "▲" : "▼"} {Math.abs(cambioMensual)}% vs. mes anterior
            </p>
          )}
        </Card>
        <Card>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>
            Egresos este mes
          </p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 24, fontWeight: 800, color: egresoMesActual > 0 ? "#B42318" : COLORS.ink, margin: "4px 0 0" }}>
            {formatoCOP(egresoMesActual)}
          </p>
        </Card>
        <Card>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>
            Neto este mes
          </p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 24, fontWeight: 800, color: netoMesActual >= 0 ? "#166534" : "#B42318", margin: "4px 0 0" }}>
            {formatoCOP(netoMesActual)}
          </p>
        </Card>
        <Card>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>
            Cartera pendiente
          </p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 24, fontWeight: 800, color: carteraPendienteTotal > 0 ? "#B42318" : COLORS.ink, margin: "4px 0 0" }}>
            {formatoCOP(carteraPendienteTotal)}
          </p>
        </Card>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.ink, marginBottom: 4 }}>Ingresos vs. egresos por mes</p>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 14 }}>
          Histórico: {formatoCOP(ingresoTotalHistorico)} recaudado · {formatoCOP(egresoTotalHistorico)} en egresos · Neto {formatoCOP(netoTotalHistorico)}
        </p>
        <GraficaBarrasAgrupadas
          categorias={mesesEtiquetas.map((m) => m.etiqueta)}
          series={[
            { nombre: "Ingresos", color: "#2F80ED", valores: mesesEtiquetas.map((m) => ingresosPorMes[m.clave]) },
            { nombre: "Egresos", color: "#F43F5E", valores: mesesEtiquetas.map((m) => egresosPorMes[m.clave]) },
          ]}
          formatoValor={formatoCOP}
        />
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.ink, marginBottom: 14 }}>Procesos por estado</p>
        {listaClientes.length === 0 ? (
          <EstadoVacio icono={<Icono tipo="grafico" size={26} />} texto="Aún no hay clientes registrados." />
        ) : (
          <GraficaBarras
            datos={[
              ...ESTADOS_VIGILANCIA.map((estado) => ({ etiqueta: estado, valor: conteoEstados[estado], color: COLOR_ESTADO_VIGILANCIA[estado] })),
              ...(sinRevisar > 0 ? [{ etiqueta: "Sin revisar", valor: sinRevisar, color: "#94A3B8" }] : []),
            ]}
          />
        )}
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.ink, marginBottom: 4 }}>Carga de trabajo por abogado</p>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 14 }}>
          Cuántos clientes tiene asignados cada uno. Se asigna desde "Clientes" al crear o editar un cliente.
        </p>
        {filasCarga.length === 0 ? (
          <EstadoVacio icono={<Icono tipo="grafico" size={26} />} texto="Aún no hay clientes registrados." />
        ) : (
          <GraficaBarras datos={filasCarga.map(([nombre, n]) => ({ etiqueta: nombre, valor: n }))} color="#7C3AED" />
        )}
        {usuarios.length > 0 && filasCarga.length > 0 && (
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: COLORS.muted, marginTop: 10 }}>
            {usuarios.length} usuario{usuarios.length !== 1 ? "s" : ""} en el despacho.
          </p>
        )}
      </Card>

      <Card>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.ink, marginBottom: 4 }}>Distribución por área del derecho</p>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 14 }}>En qué se concentra el despacho — útil para decidir dónde especializarse.</p>
        {filasArea.length === 0 ? (
          <EstadoVacio icono={<Icono tipo="balanza" size={26} />} texto="Aún no hay clientes registrados." />
        ) : (
          <GraficaBarras datos={filasArea.map(([area, n]) => ({ etiqueta: area, valor: n, color: COLOR_AREA_PROCESO[area] || "#6B7480" }))} />
        )}
        {clientesConPago > 0 && (
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: COLORS.muted, marginTop: 10 }}>
            Ticket promedio por cliente que ha pagado: <strong style={{ color: COLORS.headingText }}>{formatoCOP(ticketPromedio)}</strong>
          </p>
        )}
      </Card>
    </div>
  );
}
