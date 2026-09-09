// Función serverless de Vercel: única forma de leer folio_leads/folio_eventos
// con datos completos (nombre y celular). Usa la llave "service role" de
// Supabase, que NUNCA viaja al navegador (solo vive aquí, en el servidor), y
// exige la contraseña del panel antes de devolver nada.

import { createClient } from "@supabase/supabase-js";

const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DIAS_SEMANA_ORDENADOS = [1, 2, 3, 4, 5, 6, 0]; // Lunes primero, Domingo al final

function porDiaDeSemana(fechas) {
  const conteo = new Array(7).fill(0);
  for (const f of fechas) conteo[new Date(f).getDay()]++;
  return DIAS_SEMANA_ORDENADOS.map((i) => ({ dia: DIAS_SEMANA[i], total: conteo[i] }));
}

function porFecha(fechas, dias = 14) {
  const hoy = new Date();
  const buckets = {};
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(hoy);
    d.setDate(d.getDate() - i);
    buckets[d.toISOString().slice(0, 10)] = 0;
  }
  for (const f of fechas) {
    const clave = new Date(f).toISOString().slice(0, 10);
    if (clave in buckets) buckets[clave]++;
  }
  return Object.entries(buckets).map(([fecha, total]) => ({ fecha, total }));
}

export async function cargarEstadisticas() {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase no configurado en el servidor (faltan variables).");
  }
  const supabase = createClient(url, serviceKey);

  const [{ count: totalRegistros }, { data: leads, error: e1 }, { data: eventos, error: e2 }] = await Promise.all([
    supabase.from("folio_leads").select("*", { count: "exact", head: true }),
    supabase.from("folio_leads").select("nombre, telefono, created_at").order("created_at", { ascending: false }).limit(500),
    supabase.from("folio_eventos").select("herramienta, created_at"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const conteoPorHerramienta = {};
  for (const ev of eventos || []) {
    const clave = ev.herramienta || "Sin especificar";
    conteoPorHerramienta[clave] = (conteoPorHerramienta[clave] || 0) + 1;
  }
  const porHerramienta = Object.entries(conteoPorHerramienta)
    .map(([herramienta, total]) => ({ herramienta, total }))
    .sort((a, b) => b.total - a.total);

  const fechasLeads = (leads || []).map((l) => l.created_at);
  const fechasEventos = (eventos || []).map((e) => e.created_at);

  return {
    totalRegistros: totalRegistros ?? 0,
    totalDocumentos: eventos?.length ?? 0,
    porHerramienta,
    leads: leads || [],
    registrosPorDiaSemana: porDiaDeSemana(fechasLeads),
    registrosPorFecha: porFecha(fechasLeads),
    documentosPorFecha: porFecha(fechasEventos),
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { password } = req.body || {};
  if (!process.env.PANEL_PASSWORD || password !== process.env.PANEL_PASSWORD) {
    return res.status(401).json({ error: "Contraseña incorrecta" });
  }

  try {
    const datos = await cargarEstadisticas();
    return res.status(200).json(datos);
  } catch {
    return res.status(500).json({ error: "No se pudieron cargar los datos de Supabase." });
  }
}
