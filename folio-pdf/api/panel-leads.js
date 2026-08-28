// Función serverless de Vercel: única forma de leer folio_leads/folio_eventos
// con datos completos (nombre y celular). Usa la llave "service role" de
// Supabase, que NUNCA viaja al navegador (solo vive aquí, en el servidor), y
// exige la contraseña del panel antes de devolver nada.

import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { password } = req.body || {};
  if (!process.env.PANEL_PASSWORD || password !== process.env.PANEL_PASSWORD) {
    return res.status(401).json({ error: "Contraseña incorrecta" });
  }

  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return res.status(500).json({ error: "Supabase no configurado en el servidor (faltan variables)." });
  }

  const supabase = createClient(url, serviceKey);

  try {
    const [{ count: totalRegistros }, { data: leads, error: e1 }, { data: eventos, error: e2 }] = await Promise.all([
      supabase.from("folio_leads").select("*", { count: "exact", head: true }),
      supabase.from("folio_leads").select("nombre, telefono, created_at").order("created_at", { ascending: false }).limit(500),
      supabase.from("folio_eventos").select("herramienta"),
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

    return res.status(200).json({
      totalRegistros: totalRegistros ?? 0,
      totalDocumentos: eventos?.length ?? 0,
      porHerramienta,
      leads: leads || [],
    });
  } catch {
    return res.status(500).json({ error: "No se pudieron cargar los datos de Supabase." });
  }
}
