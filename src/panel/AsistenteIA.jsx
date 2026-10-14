// Se carga solo cuando se abre (React.lazy desde App.jsx): así no pesa en
// el primer ingreso al panel.

import { COLORS, Card, Icono, IconoNomos, buttonGhost, buttonPrimary, fechaHoyISO, inputStyle } from "../ui/base.jsx";
import { Fragment, useEffect, useRef, useState } from "react";
import { TAMANO_MAX_ARCHIVO_MB, archivoDemasiadoGrande, calcularEstado, diasDesde, diasHasta, formatoCOP, radicadosDeCliente, textoEstadoPago } from "../lib/utils.js";
import { getNombreDespacho, obtenerClientesPorId, obtenerDocumentosPorId, obtenerValoresPorClaves, storageGet, storageSet } from "../lib/storage";
import { supabase } from "../lib/supabaseClient";
import { AREAS_PROCESO, DIAS_ALERTA_INACTIVIDAD, DIAS_AVISO_PROXIMO_PAGO, IconoLex, NOMBRE_ASISTENTE, TIPOS_PROCESO_POR_AREA, calcularResumenOperacion, diagnosticoOperacion, ensureMammoth, ensureXLSX, generarReciboImagen, registrarAuditoria, uid, useConfirmarDialogo, ensureJsPDF } from "../App.jsx";

// Se mantiene por compatibilidad con datos existentes y con el asistente de
// IA (que puede no conocer el área todavía al crear un cliente) — la lista
// completa de todos los tipos posibles, sin repetir "Otro".
export const TIPOS_PROCESO = [...new Set(Object.values(TIPOS_PROCESO_POR_AREA).flat())];

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function construirContextoOperacion() {
  const idsClientesRaw = await storageGet("indice-clientes", false);
  const idsClientes = idsClientesRaw ? JSON.parse(idsClientesRaw) : [];
  const clientesContexto = await obtenerClientesPorId(idsClientes);
  const clientes = idsClientes.map((id) => clientesContexto[id]).filter(Boolean);

  const idsDocsRaw = await storageGet("indice-documentos", true);
  const idsDocs = idsDocsRaw ? JSON.parse(idsDocsRaw) : [];
  const docsContexto = await obtenerDocumentosPorId(idsDocs);
  const documentos = idsDocs.map((id) => docsContexto[id]).filter(Boolean);

  const inactivos = clientes.filter((c) => {
    const d = diasDesde(c.ultimaActuacion);
    return d !== null && d >= DIAS_ALERTA_INACTIVIDAD;
  }).map((c) => c.nombre);

  const pagosPend = clientes
    .filter((c) => c.proximoPago?.fecha && diasHasta(c.proximoPago.fecha) <= DIAS_AVISO_PROXIMO_PAGO)
    .map((c) => `${c.nombre} (${textoEstadoPago(diasHasta(c.proximoPago.fecha))}${c.proximoPago.valorEsperado ? ", " + formatoCOP(c.proximoPago.valorEsperado) : ""})`);

  const conNovedad = clientes.filter((c) => c.estadoVigilancia === "Con novedad").map((c) => c.nombre);
  const docsPendientesFirma = documentos.filter((d) => calcularEstado(d.firmantes) === "pendiente").map((d) => d.titulo);
  const docsFaltaAbogado = documentos.filter((d) => calcularEstado(d.firmantes) === "falta_abogado").map((d) => d.titulo);

  return [
    `Total de clientes: ${clientes.length}`,
    `Clientes sin actividad hace ${DIAS_ALERTA_INACTIVIDAD}+ días: ${inactivos.length ? inactivos.join(", ") : "ninguno"}`,
    `Pagos por vencer o atrasados: ${pagosPend.length ? pagosPend.join("; ") : "ninguno"}`,
    `Procesos en vigilancia judicial con novedad: ${conNovedad.length ? conNovedad.join(", ") : "ninguno"}`,
    `Documentos pendientes de firma del cliente: ${docsPendientesFirma.length ? docsPendientesFirma.join(", ") : "ninguno"}`,
    `Documentos donde falta la firma del abogado: ${docsFaltaAbogado.length ? docsFaltaAbogado.join(", ") : "ninguno"}`,
  ].join("\n");
}

const TOOLS_ASISTENTE = [
  {
    name: "crear_cliente",
    description: "Crea un nuevo cliente en el sistema del despacho.",
    input_schema: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "Nombre completo del cliente" },
        telefono: { type: "string" },
        email: { type: "string" },
        tipoProceso: {
          type: "string",
          description:
            "El trámite específico, ajustado al área del caso — cada área tiene su propia clasificación, no son intercambiables. Civil/Comercial: Ordinario, Verbal, Verbal sumario, Ejecutivo, Declarativo. Penal: Indagación, Imputación, Acusación, Juicio oral, Ejecución de penas. Laboral: Ordinario laboral, Ejecutivo laboral, Fuero sindical. Familia: Divorcio o cesación de efectos civiles, Custodia y alimentos, Sucesión, Verbal. Administrativo: Nulidad y restablecimiento del derecho, Reparación directa, Nulidad simple. Constitucional: Tutela, Acción de cumplimiento, Acción popular, Habeas corpus. Concursal: Reorganización empresarial, Liquidación judicial, Liquidación patrimonial, Insolvencia de persona natural no comerciante. Si no encaja en ninguna, usa Otro.",
        },
        areaProceso: { type: "string", description: "Civil, Penal, Laboral, Familia, Comercial, Administrativo, Constitucional, Concursal u Otro" },
        radicado: { type: "string" },
        notas: { type: "string" },
        otras_personas: {
          type: "array",
          description: "Otras personas involucradas en el mismo contrato o proceso (ej: co-arrendatarios, socios, herederos), si las menciona el abogado.",
          items: {
            type: "object",
            properties: {
              nombre: { type: "string" },
              telefono: { type: "string" },
              rol: { type: "string", description: "Ej: cónyuge, socio, co-arrendatario, heredero" },
            },
            required: ["nombre"],
          },
        },
      },
      required: ["nombre"],
    },
  },
  {
    name: "registrar_pago",
    description: "Registra un pago recibido de un cliente que ya existe en el sistema.",
    input_schema: {
      type: "object",
      properties: {
        nombre_cliente: { type: "string", description: "Nombre del cliente que hizo el pago" },
        medio_pago: { type: "string", description: "Efectivo, Efectivo y transacción, Nequi, Daviplata, Nu, Cuenta bancaria o Llave" },
        valor: { type: "number", description: "Valor pagado en pesos colombianos" },
        concepto: { type: "string" },
      },
      required: ["nombre_cliente", "medio_pago", "valor"],
    },
  },
  {
    name: "agregar_actuacion",
    description: "Agrega una novedad o actuación a la línea de tiempo de un cliente que ya existe.",
    input_schema: {
      type: "object",
      properties: {
        nombre_cliente: { type: "string" },
        nota: { type: "string" },
      },
      required: ["nombre_cliente", "nota"],
    },
  },
  {
    name: "actualizar_estado_vigilancia",
    description: "Actualiza el estado de vigilancia judicial de un cliente existente.",
    input_schema: {
      type: "object",
      properties: {
        nombre_cliente: { type: "string" },
        estado: { type: "string", description: "En trámite, Con novedad, Pendiente de revisión o Finalizado" },
      },
      required: ["nombre_cliente", "estado"],
    },
  },
  {
    name: "editar_cliente",
    description: "Actualiza los datos de un cliente que ya existe (solo los campos que se indiquen).",
    input_schema: {
      type: "object",
      properties: {
        nombre_cliente: { type: "string", description: "Nombre del cliente a editar" },
        telefono: { type: "string" },
        email: { type: "string" },
        tipoProceso: { type: "string" },
        areaProceso: { type: "string" },
        radicado: { type: "string" },
        notas: { type: "string" },
      },
      required: ["nombre_cliente"],
    },
  },
  {
    name: "generar_informe_pdf",
    description: "Genera un informe en PDF descargable con el diagnóstico y las métricas actuales del despacho (clientes, dinero recaudado, pendientes, documentos, vigilancia).",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Título del informe, opcional" },
      },
      required: [],
    },
  },
  {
    name: "generar_reporte_excel",
    description: "Genera un archivo Excel descargable con el listado completo de clientes y todos sus pagos registrados.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "buscar_cliente",
    description: "Busca un cliente que ya existe y devuelve su información completa: contacto, radicado, tipo y área del proceso, estado de vigilancia judicial, total pagado, saldo pendiente y notas.",
    input_schema: {
      type: "object",
      properties: { nombre_cliente: { type: "string" } },
      required: ["nombre_cliente"],
    },
  },
  {
    name: "crear_documento_firma",
    description: "Crea un nuevo documento de texto (contrato, poder, autorización, etc.) listo para enviar a firma electrónica, opcionalmente asociado a un cliente.",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        contenido: { type: "string", description: "Texto completo del documento" },
        nombre_cliente: { type: "string", description: "Nombre del cliente al que pertenece, opcional" },
      },
      required: ["titulo", "contenido"],
    },
  },
  {
    name: "crear_evento_agenda",
    description: "Agrega un evento nuevo a la agenda del despacho (audiencia, reunión, cita, vencimiento de término, etc.).",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        fecha: { type: "string", description: "Fecha del evento en formato YYYY-MM-DD" },
        hora: { type: "string", description: "Hora en formato HH:MM (24 horas), opcional" },
        notas: { type: "string" },
      },
      required: ["titulo", "fecha"],
    },
  },
  {
    name: "listar_agenda_proxima",
    description: "Lista los próximos eventos pendientes en la agenda del despacho.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "programar_cobro",
    description: "Programa el próximo cobro de un cliente existente: la fecha del próximo pago y el valor esperado.",
    input_schema: {
      type: "object",
      properties: {
        nombre_cliente: { type: "string" },
        valor_esperado: { type: "number", description: "Valor esperado en pesos colombianos" },
        fecha: { type: "string", description: "Fecha del próximo cobro en formato YYYY-MM-DD" },
      },
      required: ["nombre_cliente", "valor_esperado", "fecha"],
    },
  },
];

async function buscarClientePorNombre(nombreBuscado) {
  const idsRaw = await storageGet("indice-clientes", false);
  const ids = idsRaw ? JSON.parse(idsRaw) : [];
  const buscado = (nombreBuscado || "").trim().toLowerCase();
  const clientes = await obtenerClientesPorId(ids);
  for (const id of ids) {
    const c = clientes[id];
    if (!c) continue;
    const nombreC = (c.nombre || "").toLowerCase();
    if (nombreC.includes(buscado) || buscado.includes(nombreC)) return { id, cliente: c };
  }
  return null;
}

async function ejecutarHerramienta(nombreHerramienta, input, usuarioActual) {
  if (nombreHerramienta === "crear_cliente") {
    const id = uid();
    const nuevoCliente = {
      nombre: input.nombre,
      telefono: input.telefono || "",
      email: input.email || "",
      tipoProceso: input.tipoProceso || TIPOS_PROCESO[0],
      areaProceso: input.areaProceso || AREAS_PROCESO[0],
      radicado: input.radicado || "",
      radicados: input.radicado ? [input.radicado] : [],
      notas: input.notas || "",
      otrasPersonas: (input.otras_personas || []).map((p) => ({ id: uid(), nombre: p.nombre, telefono: p.telefono || "", rol: p.rol || "" })),
      timeline: [],
      ultimaActuacion: new Date().toISOString(),
    };
    await storageSet(`cliente:${id}`, JSON.stringify(nuevoCliente), false);
    const idsRaw = await storageGet("indice-clientes", false);
    const ids = idsRaw ? JSON.parse(idsRaw) : [];
    await storageSet("indice-clientes", JSON.stringify([id, ...ids]), false);
    registrarAuditoria(usuarioActual, "crear_cliente", "cliente", id, { nombre: nuevoCliente.nombre });
    const otras = nuevoCliente.otrasPersonas.length ? ` junto con ${nuevoCliente.otrasPersonas.map((p) => p.nombre).join(", ")}` : "";
    return { mensaje: `Cliente "${input.nombre}" creado correctamente${otras}.` };
  }

  if (nombreHerramienta === "registrar_pago") {
    const encontrado = await buscarClientePorNombre(input.nombre_cliente);
    if (!encontrado) return { mensaje: `No encontré ningún cliente llamado "${input.nombre_cliente}". Verifica el nombre exacto.` };
    const { id, cliente } = encontrado;
    const pago = { id: uid(), fecha: new Date().toISOString(), medioPago: input.medio_pago, valor: Number(input.valor), concepto: input.concepto || "" };
    pago.reciboImagen = await generarReciboImagen(id, cliente, pago);
    const actualizado = { ...cliente, pagos: [...(cliente.pagos || []), pago] };
    await storageSet(`cliente:${id}`, JSON.stringify(actualizado), false);
    registrarAuditoria(usuarioActual, "registrar_pago", "cliente", id, { nombre: cliente.nombre, valor: pago.valor });
    return { mensaje: `Pago de ${formatoCOP(input.valor)} registrado para ${cliente.nombre}, con su recibo generado.` };
  }

  if (nombreHerramienta === "agregar_actuacion") {
    const encontrado = await buscarClientePorNombre(input.nombre_cliente);
    if (!encontrado) return { mensaje: `No encontré ningún cliente llamado "${input.nombre_cliente}". Verifica el nombre exacto.` };
    const { id, cliente } = encontrado;
    const nuevaEntrada = { id: uid(), fecha: new Date().toISOString(), nota: input.nota };
    const actualizado = { ...cliente, timeline: [...(cliente.timeline || []), nuevaEntrada], ultimaActuacion: new Date().toISOString() };
    await storageSet(`cliente:${id}`, JSON.stringify(actualizado), false);
    registrarAuditoria(usuarioActual, "agregar_actuacion", "cliente", id, { nombre: cliente.nombre });
    return { mensaje: `Actuación agregada a la línea de tiempo de ${cliente.nombre}.` };
  }

  if (nombreHerramienta === "actualizar_estado_vigilancia") {
    const encontrado = await buscarClientePorNombre(input.nombre_cliente);
    if (!encontrado) return { mensaje: `No encontré ningún cliente llamado "${input.nombre_cliente}". Verifica el nombre exacto.` };
    const { id, cliente } = encontrado;
    const actualizado = { ...cliente, estadoVigilancia: input.estado };
    await storageSet(`cliente:${id}`, JSON.stringify(actualizado), false);
    registrarAuditoria(usuarioActual, "actualizar_vigilancia", "cliente", id, { nombre: cliente.nombre });
    return { mensaje: `Estado de vigilancia judicial de ${cliente.nombre} actualizado a "${input.estado}".` };
  }

  if (nombreHerramienta === "editar_cliente") {
    const encontrado = await buscarClientePorNombre(input.nombre_cliente);
    if (!encontrado) return { mensaje: `No encontré ningún cliente llamado "${input.nombre_cliente}". Verifica el nombre exacto.` };
    const { id, cliente } = encontrado;
    const actualizado = { ...cliente };
    ["telefono", "email", "tipoProceso", "areaProceso", "radicado", "notas"].forEach((campo) => {
      if (input[campo] !== undefined && input[campo] !== null && input[campo] !== "") actualizado[campo] = input[campo];
    });
    if (input.radicado) {
      // Reemplaza solo el radicado principal (el primero de la lista) —
      // conserva los demás que el cliente ya tuviera, si tiene más de uno.
      const resto = radicadosDeCliente(cliente).slice(1);
      actualizado.radicados = [input.radicado, ...resto];
    }
    await storageSet(`cliente:${id}`, JSON.stringify(actualizado), false);
    registrarAuditoria(usuarioActual, "editar_cliente", "cliente", id, { nombre: cliente.nombre });
    return { mensaje: `Datos de ${cliente.nombre} actualizados.` };
  }

  if (nombreHerramienta === "generar_informe_pdf") {
    const r = await calcularResumenOperacion();
    const d = diagnosticoOperacion(r);
    await ensureJsPDF();
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const marginX = 48;
    let y = 64;

    pdf.setFillColor(11, 61, 46);
    pdf.rect(0, 0, pageWidth, 90, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.text(input.titulo || "Informe de Operación", pageWidth / 2, 48, { align: "center" });
    pdf.setFontSize(11);
    pdf.setFont("helvetica", "normal");
    pdf.text(getNombreDespacho(), pageWidth / 2, 70, { align: "center" });

    y = 130;
    pdf.setTextColor(11, 18, 32);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text(`Diagnóstico general: ${d.etiqueta} (${d.puntaje}/100)`, pageWidth / 2, y, { align: "center" });
    y += 30;

    const filas = [
      ["Fecha del informe", new Date().toLocaleDateString("es-CO", { dateStyle: "long" })],
      ["Total de clientes", String(r.totalClientes)],
      ["Clientes sin actividad reciente", String(r.clientesInactivos)],
      ["Recaudado hoy", formatoCOP(r.recaudadoHoy)],
      ["Recaudado esta semana", formatoCOP(r.recaudadoSemana)],
      ["Recaudado este mes", formatoCOP(r.recaudadoMes)],
      ["Plata pendiente por cobrar", formatoCOP(r.pendienteTotal)],
      ["Documentos pendientes de firma", String(r.docsPendientes)],
      ["Documentos donde falta tu firma", String(r.docsFaltaAbogado)],
      ["Procesos con novedad en vigilancia", String(r.procesosConNovedad)],
    ];
    const filaAlto = 24;
    pdf.setFontSize(11);
    filas.forEach(([etiqueta, valor], idx) => {
      if (idx % 2 === 0) {
        pdf.setFillColor(244, 246, 249);
        pdf.rect(marginX, y - 15, pageWidth - marginX * 2, filaAlto, "F");
      }
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(75, 85, 99);
      pdf.text(etiqueta, marginX + 8, y);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(11, 18, 32);
      pdf.text(valor, pageWidth - marginX - 8, y, { align: "right" });
      y += filaAlto;
    });
    pdf.setDrawColor(210, 214, 220);
    pdf.setLineWidth(0.6);
    pdf.line(marginX, y - filaAlto + 6, pageWidth - marginX, y - filaAlto + 6);

    if (d.sugerencias.length) {
      y += 20;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.setTextColor(11, 18, 32);
      pdf.text("Sugerencias", marginX, y);
      y += 8;
      pdf.setDrawColor(11, 61, 46);
      pdf.setLineWidth(1);
      pdf.line(marginX, y, marginX + 60, y);
      y += 18;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10.5);
      pdf.setTextColor(30, 41, 59);
      d.sugerencias.forEach((s) => {
        const lineas = pdf.splitTextToSize(`•  ${s}`, pageWidth - marginX * 2 - 10);
        pdf.text(lineas, marginX + 6, y);
        y += lineas.length * 14 + 8;
      });
    }

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(148, 163, 184);
    pdf.text(`Generado el ${new Date().toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}`, pageWidth / 2, pdf.internal.pageSize.getHeight() - 30, { align: "center" });

    const blob = pdf.output("blob");
    const url = URL.createObjectURL(blob);
    return { mensaje: "Informe en PDF generado con el estado actual del despacho.", archivo: { url, nombre: "informe_operacion.pdf" } };
  }

  if (nombreHerramienta === "generar_reporte_excel") {
    await ensureXLSX();
    const idsRaw = await storageGet("indice-clientes", false);
    const ids = idsRaw ? JSON.parse(idsRaw) : [];
    const clientesPago = await obtenerClientesPorId(ids);
    const filas = [];
    ids.forEach((id) => {
      const c = clientesPago[id];
      if (!c) return;
      const pagos = c.pagos || [];
      if (pagos.length === 0) {
        filas.push({ Cliente: c.nombre, Fecha: "", "Medio de pago": "", Valor: "", Concepto: "Sin pagos registrados" });
      } else {
        pagos.forEach((p) => {
          filas.push({
            Cliente: c.nombre,
            Fecha: new Date(p.fecha).toLocaleDateString("es-CO"),
            "Medio de pago": p.medioPago,
            Valor: p.valor,
            Concepto: p.concepto || "",
          });
        });
      }
    });
    const hoja = window.XLSX.utils.json_to_sheet(filas);
    // Ancho de columna automático — sin esto el Excel sale con todo apretado
    // en columnas angostas por defecto.
    const columnasReporte = filas.length > 0 ? Object.keys(filas[0]) : ["Cliente", "Fecha", "Medio de pago", "Valor", "Concepto"];
    hoja["!cols"] = columnasReporte.map((col) => {
      const maxContenido = filas.reduce((max, f) => Math.max(max, String(f[col] ?? "").length), col.length);
      return { wch: Math.min(Math.max(maxContenido + 2, 10), 45) };
    });
    const libro = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(libro, hoja, "Pagos");
    const salida = window.XLSX.write(libro, { bookType: "xlsx", type: "array" });
    const blob = new Blob([salida], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    return { mensaje: "Reporte en Excel generado con todos los clientes y sus pagos.", archivo: { url, nombre: "reporte_pagos.xlsx" } };
  }

  if (nombreHerramienta === "buscar_cliente") {
    const encontrado = await buscarClientePorNombre(input.nombre_cliente);
    if (!encontrado) return { mensaje: `No encontré ningún cliente llamado "${input.nombre_cliente}". Verifica el nombre exacto.` };
    const { cliente } = encontrado;
    const totalPagado = (cliente.pagos || []).reduce((s, p) => s + (Number(p.valor) || 0), 0);
    const saldo = cliente.valorTotal ? Number(cliente.valorTotal) - totalPagado : null;
    const partes = [
      `Cliente: ${cliente.nombre}`,
      cliente.telefono ? `Teléfono: ${cliente.telefono}` : null,
      cliente.email ? `Email: ${cliente.email}` : null,
      cliente.radicado ? `Radicado: ${cliente.radicado}` : "Sin radicado registrado",
      `Proceso: ${cliente.tipoProceso || "—"} / ${cliente.areaProceso || "—"}`,
      cliente.estadoVigilancia ? `Estado de vigilancia: ${cliente.estadoVigilancia}` : null,
      `Total pagado: ${formatoCOP(totalPagado)}`,
      saldo !== null ? `Saldo pendiente: ${formatoCOP(saldo)}` : null,
      cliente.proximoPago?.fecha ? `Próximo cobro: ${formatoCOP(cliente.proximoPago.valorEsperado || 0)} el ${cliente.proximoPago.fecha}` : null,
      cliente.notas ? `Notas: ${cliente.notas}` : null,
    ].filter(Boolean);
    return { mensaje: partes.join("\n") };
  }

  if (nombreHerramienta === "crear_documento_firma") {
    const id = uid();
    await storageSet(
      `documento:${id}`,
      JSON.stringify({
        titulo: input.titulo,
        cliente: input.nombre_cliente || "",
        whatsappIndicativo: "57",
        whatsappNumero: "",
        contenido: input.contenido,
        nombreArchivo: "",
        tipoDocumento: "texto",
        archivoPdfBase64: "",
        firmantes: [],
        creadoEn: new Date().toISOString(),
      }),
      true
    );
    const idsDocsRaw = await storageGet("indice-documentos", true);
    const idsDocs = idsDocsRaw ? JSON.parse(idsDocsRaw) : [];
    await storageSet("indice-documentos", JSON.stringify([id, ...idsDocs]), true);
    registrarAuditoria(usuarioActual, "crear_documento", "documento", id, { nombre: input.titulo });
    return { mensaje: `Documento "${input.titulo}" creado y listo para enviar a firma desde la pestaña Firmar documentos.` };
  }

  if (nombreHerramienta === "crear_evento_agenda") {
    const id = uid();
    await storageSet(`evento:${id}`, JSON.stringify({ titulo: input.titulo, fecha: input.fecha, hora: input.hora || "", notas: input.notas || "", creadoEn: new Date().toISOString() }), true);
    const idsAgendaRaw = await storageGet("indice-agenda", true);
    const idsAgenda = idsAgendaRaw ? JSON.parse(idsAgendaRaw) : [];
    await storageSet("indice-agenda", JSON.stringify([id, ...idsAgenda]), true);
    registrarAuditoria(usuarioActual, "crear_evento", "evento", id, { nombre: input.titulo });
    return { mensaje: `Evento "${input.titulo}" agendado para el ${input.fecha}${input.hora ? ` a las ${input.hora}` : ""}.` };
  }

  if (nombreHerramienta === "listar_agenda_proxima") {
    const idsAgendaRaw = await storageGet("indice-agenda", true);
    const idsAgenda = idsAgendaRaw ? JSON.parse(idsAgendaRaw) : [];
    const hoyISO = fechaHoyISO();
    const eventos = [];
    const valoresAgenda = await obtenerValoresPorClaves(idsAgenda.map((id) => `evento:${id}`));
    for (const id of idsAgenda) {
      const raw = valoresAgenda[`evento:${id}`];
      if (!raw) continue;
      const e = JSON.parse(raw);
      if (e.fecha >= hoyISO) eventos.push(e);
    }
    eventos.sort((a, b) => `${a.fecha}T${a.hora || "00:00"}`.localeCompare(`${b.fecha}T${b.hora || "00:00"}`));
    if (eventos.length === 0) return { mensaje: "No hay eventos próximos en la agenda." };
    const texto = eventos
      .slice(0, 10)
      .map((e) => `- ${e.titulo} — ${e.fecha}${e.hora ? ` ${e.hora}` : ""}${e.notas ? ` (${e.notas})` : ""}`)
      .join("\n");
    return { mensaje: texto };
  }

  if (nombreHerramienta === "programar_cobro") {
    const encontrado = await buscarClientePorNombre(input.nombre_cliente);
    if (!encontrado) return { mensaje: `No encontré ningún cliente llamado "${input.nombre_cliente}". Verifica el nombre exacto.` };
    const { id, cliente } = encontrado;
    const actualizado = { ...cliente, proximoPago: { fecha: input.fecha, valorEsperado: Number(input.valor_esperado) } };
    await storageSet(`cliente:${id}`, JSON.stringify(actualizado), false);
    registrarAuditoria(usuarioActual, "programar_cobro", "cliente", id, { nombre: cliente.nombre, valor: Number(input.valor_esperado) });
    return { mensaje: `Próximo cobro de ${cliente.nombre} programado: ${formatoCOP(input.valor_esperado)} para el ${input.fecha}.` };
  }

  return { mensaje: "No reconozco esa acción." };
}

// El asistente de IA a veces responde con markdown (**negrilla**, listas con
// "- "). Sin esto se veían los asteriscos sueltos en el chat en vez de texto
// con formato real.
function lineaConNegrillas(linea, keyPrefix) {
  const partes = linea.split(/(\*\*[^*]+\*\*)/g).filter((p) => p !== "");
  return partes.map((parte, i) =>
    parte.startsWith("**") && parte.endsWith("**") ? (
      <strong key={`${keyPrefix}-${i}`}>{parte.slice(2, -2)}</strong>
    ) : (
      <Fragment key={`${keyPrefix}-${i}`}>{parte}</Fragment>
    )
  );
}

function TextoAsistente({ texto }) {
  const lineas = (texto || "").split("\n");
  return (
    <>
      {lineas.map((linea, i) => {
        const esViñeta = /^\s*[-*]\s+/.test(linea);
        const contenido = esViñeta ? linea.replace(/^\s*[-*]\s+/, "") : linea;
        return (
          <div key={i} style={{ display: "flex", gap: esViñeta ? 6 : 0, marginTop: i > 0 ? (linea.trim() === "" ? 8 : 2) : 0 }}>
            {esViñeta && <span style={{ opacity: 0.6 }}>•</span>}
            <span>{lineaConNegrillas(contenido, i)}</span>
          </div>
        );
      })}
    </>
  );
}

function PuntosEscribiendo() {
  return (
    <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: COLORS.muted,
            animation: `drx-pulse 1s ease-in-out ${i * 0.15}s infinite`,
          }}
        />
      ))}
    </span>
  );
}

const SUGERENCIAS_ASISTENTE = [
  "¿Qué debería priorizar hoy?",
  "Registra un pago de 500.000 de Juan Pérez por Nequi",
  "Dame 3 ideas de contenido para redes",
  "¿Cómo va el despacho este mes?",
];

export default function AsistenteIA({ nombre, usuarioId, usuarioActual, onAccionCompletada }) {
  const claveIndice = `chat-asistente-indice:${usuarioId || "general"}`;
  const claveMensajes = (idConv) => `chat-asistente-conv:${usuarioId || "general"}:${idConv}`;

  const [conversaciones, setConversaciones] = useState([]);
  const [convActivaId, setConvActivaId] = useState(null);
  const [indiceCargado, setIndiceCargado] = useState(false);
  const [mostrarLista, setMostrarLista] = useState(false);
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState("");
  const [adjuntos, setAdjuntos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [historialCargado, setHistorialCargado] = useState(false);
  const [esperandoCuotaHasta, setEsperandoCuotaHasta] = useState(0);
  const [segundosRestantes, setSegundosRestantes] = useState(0);
  const contenedorRef = useRef(null);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);
  const { confirmar, ConfirmarDialogo } = useConfirmarDialogo();

  // Cuando Gemini avisa que hay que esperar X segundos por el límite gratuito,
  // se bloquea el envío ese tiempo exacto — sin esto, reintentar de inmediato
  // solo mantenía el límite activo en vez de dejarlo liberarse.
  useEffect(() => {
    if (!esperandoCuotaHasta) return;
    const actualizar = () => {
      const restante = Math.max(0, Math.ceil((esperandoCuotaHasta - Date.now()) / 1000));
      setSegundosRestantes(restante);
      if (restante === 0) setEsperandoCuotaHasta(0);
    };
    actualizar();
    const intervalo = setInterval(actualizar, 1000);
    return () => clearInterval(intervalo);
  }, [esperandoCuotaHasta]);

  const abrirConversacion = async (idConv) => {
    setConvActivaId(idConv);
    setHistorialCargado(false);
    const raw = await storageGet(claveMensajes(idConv), true);
    setMensajes(raw ? JSON.parse(raw) : []);
    setHistorialCargado(true);
    setMostrarLista(false);
  };

  useEffect(() => {
    (async () => {
      const raw = await storageGet(claveIndice, true);
      const lista = raw ? JSON.parse(raw) : [];
      setConversaciones(lista);
      if (lista.length > 0) {
        await abrirConversacion(lista[0].id);
      } else {
        setHistorialCargado(true);
      }
      setIndiceCargado(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveIndice]);

  useEffect(() => {
    if (!historialCargado || !convActivaId) return;
    // Al guardar, quitamos el contenido pesado de los adjuntos (base64/texto extraído)
    // y los enlaces de archivos generados (dejan de servir tras recargar la página).
    const paraGuardar = mensajes.map((m) => {
      const limpio = { ...m };
      if (limpio.adjuntos) {
        limpio.adjuntos = limpio.adjuntos.map(({ base64, texto: textoAdjunto, ...resto }) => resto);
      }
      delete limpio.archivoGenerado;
      return limpio;
    });
    storageSet(claveMensajes(convActivaId), JSON.stringify(paraGuardar), true);
  }, [mensajes, historialCargado, convActivaId]);

  useEffect(() => {
    if (contenedorRef.current) contenedorRef.current.scrollTo({ top: contenedorRef.current.scrollHeight, behavior: "smooth" });
  }, [mensajes, cargando]);

  const nuevaConversacion = () => {
    setConvActivaId(null);
    setMensajes([]);
    setMostrarLista(false);
    inputRef.current?.focus();
  };

  const eliminarConversacion = async (idConv, e) => {
    e.stopPropagation();
    if (!(await confirmar("¿Eliminar esta conversación? No se puede deshacer."))) return;
    const restantes = conversaciones.filter((c) => c.id !== idConv);
    setConversaciones(restantes);
    await storageSet(claveIndice, JSON.stringify(restantes), true);
    await storageSet(claveMensajes(idConv), JSON.stringify([]), true);
    if (idConv === convActivaId) {
      if (restantes.length > 0) await abrirConversacion(restantes[0].id);
      else nuevaConversacion();
    }
  };

  const copiarMensaje = (texto) => {
    navigator.clipboard?.writeText(texto).catch(() => {});
  };

  const MAX_ADJUNTOS = 5;

  const adjuntarArchivo = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;

    for (const file of files.slice(0, MAX_ADJUNTOS - adjuntos.length)) {
      const nombreArchivo = file.name.toLowerCase();
      let nuevo;
      if (archivoDemasiadoGrande(file)) {
        nuevo = { id: uid(), tipoBloque: "error", nombre: `${file.name} (pesa más de ${TAMANO_MAX_ARCHIVO_MB} MB)` };
      } else if (file.type.startsWith("image/")) {
        const base64 = await fileToBase64(file);
        nuevo = { id: uid(), tipoBloque: "image", base64, mediaType: file.type, nombre: file.name };
      } else if (nombreArchivo.endsWith(".pdf")) {
        const base64 = await fileToBase64(file);
        nuevo = { id: uid(), tipoBloque: "document", base64, mediaType: "application/pdf", nombre: file.name };
      } else if (nombreArchivo.endsWith(".docx")) {
        await ensureMammoth();
        const arrayBuffer = await file.arrayBuffer();
        const resultado = await window.mammoth.extractRawText({ arrayBuffer });
        nuevo = { id: uid(), tipoBloque: "texto_extraido", texto: resultado.value, nombre: file.name };
      } else {
        nuevo = { id: uid(), tipoBloque: "error", nombre: file.name };
      }
      setAdjuntos((prev) => [...prev, nuevo]);
    }
  };

  const quitarAdjunto = (id) => setAdjuntos((prev) => prev.filter((a) => a.id !== id));

  const enviar = async () => {
    if ((!texto.trim() && adjuntos.length === 0) || cargando || segundosRestantes > 0) return;
    const pregunta = texto.trim();
    const adjuntosActuales = adjuntos;
    setTexto("");
    setAdjuntos([]);
    if (inputRef.current) inputRef.current.style.height = "auto";

    // Si no hay una conversación activa (recién abierta o "Nueva conversación"),
    // se crea aquí, con el primer mensaje como título — así cada tema queda
    // organizado en su propio historial, en vez de todo mezclado en un chat sin fin.
    let idConv = convActivaId;
    if (!idConv) {
      idConv = uid();
      const titulo = pregunta.slice(0, 46) || "Nueva conversación";
      const nuevaLista = [{ id: idConv, titulo, actualizadoEn: new Date().toISOString() }, ...conversaciones];
      setConvActivaId(idConv);
      setConversaciones(nuevaLista);
      await storageSet(claveIndice, JSON.stringify(nuevaLista), true);
    } else {
      const actual = conversaciones.find((c) => c.id === idConv);
      if (actual) {
        const reordenado = [{ ...actual, actualizadoEn: new Date().toISOString() }, ...conversaciones.filter((c) => c.id !== idConv)];
        setConversaciones(reordenado);
        storageSet(claveIndice, JSON.stringify(reordenado), true);
      }
    }

    const nuevos = [...mensajes, { rol: "usuario", texto: pregunta, adjuntos: adjuntosActuales }];
    setMensajes(nuevos);
    setCargando(true);

    try {
      const contexto = await construirContextoOperacion();
      const systemPrompt =
        `Te llamas ${NOMBRE_ASISTENTE}. Eres el asistente virtual de ${getNombreDespacho()}, dentro de su panel de gestión (la plataforma Nomos). Si te preguntan tu nombre o quién eres, respondes con naturalidad que te llamas ${NOMBRE_ASISTENTE} — no lo repites sin que venga al caso. Le hablas a ${nombre}, el abogado dueño del despacho, como lo haría un empresario visionario: con confianza, ambición sana, y viendo siempre oportunidades de crecer el negocio. Incluyes de forma natural y respetuosa una referencia a Dios en tus respuestas cuando encaje (por ejemplo, dar gracias por el progreso, pedir sabiduría, o reconocer que el esfuerzo y la fe van de la mano), sin exagerar ni forzarlo en cada frase. ` +
        `Actúas como un verdadero experto en contabilidad de despachos legales, en redes sociales y marketing para abogados, y en gestión de operaciones legales — da consejos con ese nivel de criterio, no genéricos. ` +
        `Eres el cerebro de la operación del despacho: puedes crear y editar clientes, buscar la información completa de un cliente existente, registrar pagos y generarles su recibo automáticamente, programar el próximo cobro de un cliente, agregar actuaciones a la línea de tiempo de un cliente, actualizar el estado de vigilancia judicial, crear documentos de texto listos para firma electrónica, agendar eventos (audiencias, reuniones, vencimientos) y consultar los próximos eventos de la agenda, crear usuarios nuevos con acceso al panel, registrar métricas de redes sociales, generar un informe en PDF con el diagnóstico del despacho, generar un reporte en Excel con todos los pagos, leer imágenes, PDF y documentos de Word que te envíen, y dar ideas prácticas de gestión, negocio y contenido. Cuando te pregunten qué puedes hacer, cuéntalo con entusiasmo y de forma concreta. ` +
        `Usa las herramientas disponibles para actuar de verdad cuando te lo pidan (no solo describir qué harías), y confirma siempre al final qué hiciste. Este es el estado actual del despacho:\n\n${contexto}\n\nResponde en español, de forma cercana, breve y con visión de negocio.`;

      let mensajesAPI = nuevos.map((m, idx) => {
        const esUltimo = idx === nuevos.length - 1;
        const adjuntosValidos = esUltimo ? (m.adjuntos || []).filter((a) => a.tipoBloque !== "error") : [];
        if (adjuntosValidos.length > 0) {
          const textoExtraido = adjuntosValidos
            .filter((a) => a.tipoBloque === "texto_extraido")
            .map((a) => `\n\nContenido del documento adjunto (${a.nombre}):\n${a.texto}`)
            .join("");
          const bloques = adjuntosValidos
            .filter((a) => a.tipoBloque === "image")
            .map((a) => ({ type: "image", source: { type: "base64", media_type: a.mediaType, data: a.base64 } }))
            .concat(
              adjuntosValidos
                .filter((a) => a.tipoBloque === "document")
                .map((a) => ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: a.base64 } }))
            );
          bloques.push({ type: "text", text: (m.texto || "Analiza el/los archivo(s) adjunto(s).") + textoExtraido });
          return { role: "user", content: bloques };
        }
        return { role: m.rol === "usuario" ? "user" : "assistant", content: m.texto };
      });

      const { data: sesionDataIA } = await supabase.auth.getSession();
      const tokenIA = sesionDataIA?.session?.access_token;

      let respuestaFinal = "";
      let archivoGenerado = null;
      for (let intento = 0; intento < 3; intento++) {
        const response = await fetch("/api/assistant", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(tokenIA ? { Authorization: `Bearer ${tokenIA}` } : {}),
          },
          body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 700, system: systemPrompt, tools: TOOLS_ASISTENTE, messages: mensajesAPI }),
        });
        const data = await response.json();
        if (!response.ok || data.error) {
          const err = new Error(data.error || "No se pudo contactar al asistente de IA");
          if (data.retryAfterSegundos) err.retryAfterSegundos = data.retryAfterSegundos;
          throw err;
        }
        const bloques = data.content || [];
        const textoBloque = bloques.filter((b) => b.type === "text").map((b) => b.text).join("\n");
        const toolUses = bloques.filter((b) => b.type === "tool_use");

        if (toolUses.length === 0) {
          respuestaFinal = textoBloque;
          break;
        }

        const toolResults = [];
        for (const tu of toolUses) {
          const resultado = await ejecutarHerramienta(tu.name, tu.input, usuarioActual);
          if (resultado.archivo) archivoGenerado = resultado.archivo;
          toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: resultado.mensaje });
        }
        if (onAccionCompletada) onAccionCompletada();

        mensajesAPI = [...mensajesAPI, { role: "assistant", content: bloques }, { role: "user", content: toolResults }];
        if (intento === 2) respuestaFinal = textoBloque || "Listo, hice los cambios que me pediste.";
      }

      setMensajes((prev) => [...prev, { rol: "asistente", texto: respuestaFinal || "No pude generar una respuesta, intenta de nuevo.", archivoGenerado }]);
    } catch (e) {
      setMensajes((prev) => [...prev, { rol: "asistente", texto: `Tuve un problema para responder: ${e.message || "intenta de nuevo en un momento."}` }]);
      if (e.retryAfterSegundos) setEsperandoCuotaHasta(Date.now() + e.retryAfterSegundos * 1000);
    }
    setCargando(false);
    inputRef.current?.focus();
  };

  const conversacionActual = conversaciones.find((c) => c.id === convActivaId);

  return (
    <Card style={{ marginBottom: 24, padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${COLORS.navy}, ${COLORS.accentBright})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#FFFFFF",
              flexShrink: 0,
              boxShadow: `0 2px 8px ${COLORS.navy}40`,
            }}
          >
            <IconoLex size={18} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14.5, fontWeight: 800, color: COLORS.headingText, margin: 0, letterSpacing: 0.2, display: "flex", alignItems: "baseline", gap: 6 }}>
              {NOMBRE_ASISTENTE}
              <span style={{ fontSize: 11, fontWeight: 500, color: COLORS.muted }}>· tu asistente en Nomos</span>
            </p>
            {conversacionActual && (
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: COLORS.muted, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
                {conversacionActual.titulo}
              </p>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <button onClick={nuevaConversacion} title="Nueva conversación" className="drx-btn-ghost" style={{ ...buttonGhost, padding: "7px 10px", display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
            <Icono tipo="chispa" size={13} /> Nueva
          </button>
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setMostrarLista((v) => !v)}
              title="Ver conversaciones"
              className="drx-btn-ghost"
              style={{ ...buttonGhost, padding: "7px 9px", display: "flex", alignItems: "center" }}
            >
              <Icono tipo="portapapeles" size={14} />
            </button>
            {mostrarLista && (
              <div
                className="drx-fade-in"
                style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  right: 0,
                  width: 240,
                  maxHeight: 300,
                  overflowY: "auto",
                  background: COLORS.panel,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 12,
                  boxShadow: "0 12px 30px rgba(11,61,46,0.18)",
                  zIndex: 30,
                  padding: 6,
                }}
              >
                {conversaciones.length === 0 && (
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, padding: 10, margin: 0 }}>Aún no tienes conversaciones.</p>
                )}
                {conversaciones.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => abrirConversacion(c.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 6,
                      padding: "8px 9px",
                      borderRadius: 8,
                      cursor: "pointer",
                      background: c.id === convActivaId ? COLORS.accentSoft : "transparent",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.ink, margin: 0, fontWeight: c.id === convActivaId ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.titulo}
                      </p>
                      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 10.5, color: COLORS.muted, margin: 0 }}>
                        {new Date(c.actualizadoEn).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}
                      </p>
                    </div>
                    <button onClick={(e) => eliminarConversacion(c.id, e)} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted, display: "flex", flexShrink: 0, padding: 2 }} title="Eliminar">
                      <Icono tipo="papelera" size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div style={{ position: "relative", height: 340, marginBottom: 12 }}>
        <div
          aria-hidden="true"
          style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.09, pointerEvents: "none", color: COLORS.accentBright }}
        >
          <IconoNomos size={150} />
        </div>
        <div ref={contenedorRef} style={{ position: "relative", height: "100%", overflowY: "auto", overscrollBehavior: "contain", display: "flex", flexDirection: "column", gap: 12, paddingRight: 4 }}>
        {mensajes.length === 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {SUGERENCIAS_ASISTENTE.map((s) => (
              <button
                key={s}
                className="drx-btn-ghost"
                onClick={() => setTexto(s)}
                style={{ background: COLORS.surfaceSoft, border: `1px solid ${COLORS.border}`, borderRadius: 20, padding: "6px 12px", fontSize: 11.5, fontFamily: "Inter, sans-serif", color: COLORS.inkSoft, cursor: "pointer" }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {mensajes.map((m, i) => (
          <div key={i} style={{ display: "flex", flexDirection: m.rol === "usuario" ? "row-reverse" : "row", gap: 8, alignItems: "flex-end" }}>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: m.rol === "usuario" ? COLORS.accentSoft : `linear-gradient(135deg, ${COLORS.navy}, ${COLORS.accentBright})`,
                color: m.rol === "usuario" ? COLORS.navy : "#FFFFFF",
              }}
            >
              {m.rol === "usuario" ? <Icono tipo="persona" size={13} /> : <IconoLex size={13} />}
            </div>
            <div
              className="drx-fade-in"
              style={{
                position: "relative",
                background: m.rol === "usuario" ? COLORS.navy : COLORS.accentSoft,
                color: m.rol === "usuario" ? "#FFFFFF" : COLORS.navy,
                borderRadius: 12,
                padding: "9px 13px",
                maxWidth: "80%",
                fontSize: 13,
                fontFamily: "Inter, sans-serif",
                lineHeight: 1.55,
              }}
            >
              {(m.adjuntos || []).map((a) =>
                a.tipoBloque === "image" ? (
                  a.base64 ? (
                    <img key={a.id} src={`data:${a.mediaType};base64,${a.base64}`} alt="Adjunta" style={{ maxWidth: "100%", borderRadius: 8, marginBottom: 6, display: "block" }} />
                  ) : (
                    <p key={a.id} style={{ margin: "0 0 6px", fontSize: 12, opacity: 0.85, display: "flex", alignItems: "center", gap: 5 }}>
                      <Icono tipo="imagen" size={13} /> {a.nombre}
                    </p>
                  )
                ) : (
                  <p key={a.id} style={{ margin: "0 0 6px", fontSize: 12, opacity: 0.85, display: "flex", alignItems: "center", gap: 5 }}>
                    <Icono tipo="documento" size={13} /> {a.nombre}
                  </p>
                )
              )}
              <TextoAsistente texto={m.texto} />
              {m.archivoGenerado && (
                <div style={{ marginTop: 8 }}>
                  <a
                    href={m.archivoGenerado.url}
                    download={m.archivoGenerado.nombre}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      background: "#FFFFFF",
                      color: COLORS.navy,
                      border: `1px solid ${COLORS.navy}`,
                      borderRadius: 6,
                      padding: "5px 12px",
                      fontSize: 12,
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    <Icono tipo="cursorArriba" size={13} style={{ transform: "rotate(180deg)" }} /> Descargar {m.archivoGenerado.nombre}
                  </a>
                </div>
              )}
              {m.rol === "asistente" && (
                <button
                  onClick={() => copiarMensaje(m.texto)}
                  title="Copiar respuesta"
                  style={{ position: "absolute", top: 6, right: -26, background: "none", border: "none", cursor: "pointer", color: COLORS.muted, opacity: 0.6, padding: 2 }}
                >
                  <Icono tipo="portapapeles" size={13} />
                </button>
              )}
            </div>
          </div>
        ))}
        {cargando && (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg, ${COLORS.navy}, ${COLORS.accentBright})`, color: "#FFFFFF" }}>
              <IconoLex size={13} />
            </div>
            <div style={{ background: COLORS.accentSoft, borderRadius: 12, padding: "10px 14px" }}>
              <PuntosEscribiendo />
            </div>
          </div>
        )}
        </div>
      </div>

      {adjuntos.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {adjuntos.map((a) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 6, background: COLORS.surfaceSoft, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "5px 8px", maxWidth: 200 }}>
              {a.tipoBloque === "image" ? (
                <img src={`data:${a.mediaType};base64,${a.base64}`} alt="Adjunta" style={{ width: 24, height: 24, borderRadius: 4, objectFit: "cover", flexShrink: 0 }} />
              ) : (
                <Icono tipo="documento" size={15} style={{ color: COLORS.muted, flexShrink: 0 }} />
              )}
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: a.tipoBloque === "error" ? "#B42318" : COLORS.inkSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {a.tipoBloque === "error" ? `Formato no soportado: ${a.nombre}` : a.nombre}
              </span>
              <button onClick={() => quitarAdjunto(a.id)} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted, display: "flex", flexShrink: 0 }}>
                <Icono tipo="check" size={12} style={{ transform: "rotate(45deg)" }} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <input type="file" accept="image/*,.pdf,.docx" multiple ref={fileInputRef} onChange={adjuntarArchivo} style={{ display: "none" }} />
        <button
          className="drx-btn-ghost"
          style={{ ...buttonGhost, padding: "10px 12px", display: "flex", alignItems: "center" }}
          onClick={() => fileInputRef.current?.click()}
          title="Adjuntar hasta 5 fotos, PDF o Word"
          disabled={adjuntos.length >= MAX_ADJUNTOS}
        >
          <Icono tipo="clip" size={16} />
        </button>
        <textarea
          ref={inputRef}
          className="drx-input"
          rows={1}
          style={{ ...inputStyle, flex: 1, resize: "none", maxHeight: 66, lineHeight: 1.4, fontFamily: "Inter, sans-serif" }}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 66)}px`;
          }}
          placeholder="Ej: registra un pago de 500.000 de Juan Pérez por Nequi (Shift+Enter para salto de línea)"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar();
            }
          }}
        />
        <button
          className="drx-btn-primary"
          style={{ ...buttonPrimary, display: "flex", alignItems: "center", gap: 6, opacity: segundosRestantes > 0 ? 0.6 : 1 }}
          onClick={enviar}
          disabled={cargando || segundosRestantes > 0 || (!texto.trim() && adjuntos.length === 0)}
          title={segundosRestantes > 0 ? "Esperando a que se libere el límite gratuito" : undefined}
        >
          {segundosRestantes > 0 ? (
            `Espera ${segundosRestantes}s`
          ) : (
            <>
              Enviar <Icono tipo="cursorArriba" size={14} style={{ transform: "rotate(90deg)" }} />
            </>
          )}
        </button>
      </div>
      {ConfirmarDialogo}
    </Card>
  );
}
