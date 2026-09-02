import {
  COLORS, formatoCOP, exportarCSV, buttonGhost, Card, EncabezadoSeccion, Icono, EstadoVacio,
  Spinner, GraficaBarras, GraficaBarrasAgrupadas, COLOR_AREA_PROCESO, COLOR_ESTADO_VIGILANCIA,
  ESTADOS_VIGILANCIA, useDatosReportes,
} from "../App.jsx";

export default function ReportesTab() {
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
          Exportar CSV
        </button>
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
