import { supabase } from "./supabaseClient.js";

// Registro de una persona nueva (nombre + celular) al pasar la puerta de entrada.
export async function registrarLead(nombre, telefono) {
  if (!supabase) return;
  try {
    await supabase.from("folio_leads").insert({ nombre, telefono });
  } catch {
    // si falla (sin conexión, tablas no creadas, etc.) no debe romper la app
  }
}

// Un documento procesado con éxito en alguna herramienta.
export async function registrarEvento(herramienta) {
  if (!supabase) return;
  try {
    await supabase.from("folio_eventos").insert({ tipo: "documento_procesado", herramienta });
  } catch {
    // silencioso a propósito
  }
}
