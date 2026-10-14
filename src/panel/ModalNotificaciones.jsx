// Se carga solo cuando se abre (React.lazy desde App.jsx): así no pesa en
// el primer ingreso al panel.

import { COLORS, Icono, buttonGhost, buttonPrimary } from "../ui/base.jsx";
import { formatoCOP, numeroWhatsappCliente, textoEstadoPago } from "../lib/utils.js";
import { useEffect, useRef } from "react";
import { DIAS_ALERTA_INACTIVIDAD, enviarRecordatorioPago, enviarRecordatorioPagoGrupo } from "../App.jsx";

export default function ModalNotificaciones({
  firmasNuevas,
  clientesInactivos,
  pagosPendientes,
  contenidoPendiente,
  contenidoVencido,
  novedadesJudiciales,
  clientesSinRadicado,
  clientesSinPago,
  onCerrar,
  onMarcarVistas,
  onIrADocumentos,
  onIrAClientes,
  onIrAContenido,
  onIrAVigilancia,
  onIrAContabilidad,
}) {
  const panelRef = useRef(null);

  useEffect(() => {
    const alPresionarTecla = (e) => {
      if (e.key === "Escape") onCerrar();
    };
    // Como ya no hay una capa oscura de fondo cubriendo toda la pantalla
    // (el panel sale directo de la campanita, no como ventana aparte), hay
    // que detectar el clic afuera nosotros mismos para poder cerrarlo.
    //
    // Ojo: este listener escucha "mousedown", que dispara ANTES que el
    // "click" del propio botón de la campanita. Si el usuario hacía clic en
    // la campanita para cerrar el panel, este listener corría primero (lo
    // cerraba por "clic afuera", ya que el botón está fuera de panelRef) y
    // justo después el onClick del botón volvía a alternar el estado — con
    // lo que el panel se reabría solo de inmediato (se sentía como que las
    // notificaciones "desaparecían" al usar la campanita). Por eso hay que
    // ignorar explícitamente los clics que caen sobre el propio botón.
    const alHacerClicAfuera = (e) => {
      if (e.target.closest?.("[data-notif-bell]")) return;
      if (panelRef.current && !panelRef.current.contains(e.target)) onCerrar();
    };
    window.addEventListener("keydown", alPresionarTecla);
    document.addEventListener("mousedown", alHacerClicAfuera);
    return () => {
      window.removeEventListener("keydown", alPresionarTecla);
      document.removeEventListener("mousedown", alHacerClicAfuera);
    };
  }, [onCerrar]);

  return (
    <div
      ref={panelRef}
      className="drx-dropdown-in"
      style={{
        position: "absolute",
        top: "calc(100% + 10px)",
        right: 0,
        background: COLORS.panel,
        borderRadius: 14,
        border: `1px solid ${COLORS.border}`,
        width: 400,
        maxWidth: "calc(100vw - 40px)",
        maxHeight: "70vh",
        overflowY: "auto",
        boxShadow: "0 20px 50px rgba(11,61,46,0.22)",
        zIndex: 1000,
      }}
    >
        <div style={{ padding: "18px 20px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontFamily: "Inter, sans-serif", fontSize: 19, fontWeight: 700, margin: 0, color: COLORS.ink }}>Notificaciones</h2>
          <button onClick={onCerrar} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: COLORS.muted }}>
            ✕
          </button>
        </div>

        <div style={{ padding: "16px 20px" }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 700, color: COLORS.headingText, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
            <Icono tipo="lapiz" size={14} style={{ marginRight: 4, verticalAlign: -2 }} /> Firmas nuevas
          </p>
          {firmasNuevas.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
              {firmasNuevas.map((f, i) => (
                <div key={i} style={{ background: COLORS.accentSoft, borderRadius: 8, padding: "10px 12px" }}>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: COLORS.navy, margin: 0 }}>{f.nombre} firmó "{f.titulo}"</p>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: COLORS.muted, margin: "2px 0 0" }}>
                    {new Date(f.fecha).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
              ))}
              <button
                className="drx-btn-ghost"
                style={{ ...buttonGhost, fontSize: 12, padding: "6px 12px", alignSelf: "flex-start" }}
                onClick={() => {
                  onMarcarVistas();
                  onIrADocumentos();
                }}
              >
                Ver documentos y marcar como vistas
              </button>
            </div>
          ) : (
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted, marginBottom: 18 }}>No hay firmas nuevas por revisar.</p>
          )}

          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 700, color: "#B45309", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
            ⏰ Clientes sin actividad ({DIAS_ALERTA_INACTIVIDAD}+ días)
          </p>
          {clientesInactivos.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {clientesInactivos.map((c, i) => (
                <div key={i} style={{ background: "#FEF3E2", borderRadius: 8, padding: "10px 12px" }}>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: "#92400E", margin: 0 }}>{c.nombre}</p>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: "#B45309", margin: "2px 0 0" }}>Sin novedades hace {c.dias} días</p>
                </div>
              ))}
              <button className="drx-btn-ghost" style={{ ...buttonGhost, fontSize: 12, padding: "6px 12px", alignSelf: "flex-start" }} onClick={onIrAClientes}>
                Ver clientes
              </button>
            </div>
          ) : (
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted, marginBottom: 18 }}>Todos los clientes tienen actuaciones recientes.</p>
          )}

          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 700, color: "#3E7C7C", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
            <Icono tipo="tarjeta" size={14} style={{ marginRight: 4, verticalAlign: -2 }} /> Pagos pendientes
          </p>
          {pagosPendientes.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {pagosPendientes.map(({ cliente, dias }, i) => {
                const tieneNumero = !!numeroWhatsappCliente(cliente.pagador?.telefono || cliente.telefono);
                return (
                  <div key={i} style={{ background: COLORS.accentSoft, borderRadius: 8, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div>
                      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: COLORS.navy, margin: 0 }}>{cliente.nombre}</p>
                      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: COLORS.navy, margin: "2px 0 0" }}>
                        {textoEstadoPago(dias)}
                        {cliente.proximoPago?.valorEsperado ? ` · ${formatoCOP(cliente.proximoPago.valorEsperado)}` : ""}
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {tieneNumero && (
                        <button className="drx-btn-primary" style={{ ...buttonPrimary, padding: "5px 10px", fontSize: 11.5, background: "#1DA851" }} onClick={() => enviarRecordatorioPago(cliente)}>
                          Recordar ↗
                        </button>
                      )}
                      {cliente.grupoWhatsapp && (
                        <button
                          className={tieneNumero ? "drx-btn-ghost" : "drx-btn-primary"}
                          style={tieneNumero ? { ...buttonGhost, padding: "5px 10px", fontSize: 11.5 } : { ...buttonPrimary, padding: "5px 10px", fontSize: 11.5, background: "#1DA851" }}
                          title="Copia el mensaje y abre el grupo de WhatsApp del proceso"
                          onClick={() => enviarRecordatorioPagoGrupo(cliente)}
                        >
                          Al grupo ↗
                        </button>
                      )}
                      {!tieneNumero && !cliente.grupoWhatsapp && (
                        <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: "#B45309" }}>Sin teléfono ni grupo</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted, marginBottom: 18 }}>No hay pagos por vencer en los próximos días.</p>
          )}

          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 700, color: "#7C3AED", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
            <Icono tipo="calendario" size={14} style={{ marginRight: 4, verticalAlign: -2 }} /> Contenido pendiente
          </p>
          {contenidoVencido.length > 0 || contenidoPendiente.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {contenidoVencido.map((it) => (
                <div key={it.id} style={{ background: "#FEECEC", borderRadius: 8, padding: "10px 12px" }}>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: "#B42318", margin: 0 }}>{it.titulo}</p>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: "#B42318", margin: "2px 0 0" }}>
                    Vencido — estaba programado para {new Date(`${it.fecha}T00:00:00`).toLocaleDateString("es-CO", { dateStyle: "medium" })}
                  </p>
                </div>
              ))}
              {contenidoPendiente.map((it) => (
                <div key={it.id} style={{ background: COLORS.accentSoft, borderRadius: 8, padding: "10px 12px" }}>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: COLORS.navy, margin: 0 }}>{it.titulo}</p>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: COLORS.navy, margin: "2px 0 0" }}>
                    Programado para hoy{it.hora ? ` a las ${it.hora}` : ""}
                  </p>
                </div>
              ))}
              <button className="drx-btn-ghost" style={{ ...buttonGhost, fontSize: 12, padding: "6px 12px", alignSelf: "flex-start" }} onClick={onIrAContenido}>
                Ver calendario de contenido
              </button>
            </div>
          ) : (
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted, marginBottom: 18 }}>No hay contenido pendiente ni vencido.</p>
          )}

          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 700, color: "#B45309", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
            <Icono tipo="balanza" size={14} style={{ marginRight: 4, verticalAlign: -2 }} /> Novedades judiciales
          </p>
          {novedadesJudiciales.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {novedadesJudiciales.map((n, i) => (
                <div key={i} style={{ background: "#FEF3E2", borderRadius: 8, padding: "10px 12px" }}>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: "#92400E", margin: 0 }}>{n.nombre}</p>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: "#B45309", margin: "2px 0 0" }}>
                    Actuación nueva detectada{n.radicado ? ` — radicado ${n.radicado}` : ""}
                  </p>
                </div>
              ))}
              <button className="drx-btn-ghost" style={{ ...buttonGhost, fontSize: 12, padding: "6px 12px", alignSelf: "flex-start" }} onClick={onIrAVigilancia}>
                Ver vigilancia judicial
              </button>
            </div>
          ) : (
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted, marginBottom: 18 }}>Sin novedades judiciales por revisar.</p>
          )}

          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 700, color: "#B45309", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
            <Icono tipo="portapapeles" size={14} style={{ marginRight: 4, verticalAlign: -2 }} /> Clientes sin radicado
          </p>
          {clientesSinRadicado.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {clientesSinRadicado.map((c, i) => (
                <div key={i} style={{ background: "#FEF3E2", borderRadius: 8, padding: "10px 12px" }}>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: "#92400E", margin: 0 }}>{c.nombre}</p>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: "#B45309", margin: "2px 0 0" }}>
                    Sin radicado: no se vigila su proceso automáticamente
                  </p>
                </div>
              ))}
              <button className="drx-btn-ghost" style={{ ...buttonGhost, fontSize: 12, padding: "6px 12px", alignSelf: "flex-start" }} onClick={onIrAClientes}>
                Ver clientes
              </button>
            </div>
          ) : (
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted, marginBottom: 18 }}>Todos los clientes tienen radicado registrado.</p>
          )}

          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 700, color: "#B42318", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
            <Icono tipo="tarjeta" size={14} style={{ marginRight: 4, verticalAlign: -2 }} /> Clientes sin plan de pago
          </p>
          {clientesSinPago.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {clientesSinPago.map((c, i) => (
                <div key={i} style={{ background: "#FEF2F2", border: "1px solid #FBD5D5", borderRadius: 8, padding: "10px 12px" }}>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: "#B42318", margin: 0 }}>{c.nombre}</p>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: "#B42318", margin: "2px 0 0" }}>
                    No tiene plan de pago ni próximo cobro configurado — nadie le está haciendo seguimiento a este cobro.
                  </p>
                </div>
              ))}
              <button className="drx-btn-ghost" style={{ ...buttonGhost, fontSize: 12, padding: "6px 12px", alignSelf: "flex-start" }} onClick={onIrAContabilidad}>
                Ir a Contabilidad
              </button>
            </div>
          ) : (
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted }}>Todos los clientes tienen un plan de pago configurado.</p>
          )}
        </div>
      </div>
  );
}
