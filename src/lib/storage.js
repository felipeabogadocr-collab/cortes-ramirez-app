import { supabase } from "./supabaseClient";

/**
 * Reemplazo de window.storage (solo disponible dentro de Claude.ai) por Supabase.
 * Mantiene la misma firma que el prototipo original (storageGet/storageSet con
 * claves tipo "cliente:ID", "indice-clientes", etc.) para no tener que tocar el
 * resto de la aplicación: solo cambia dónde vive el dato.
 *
 * Multi-despacho: cada fila de datos (menos "documentos", ver abajo) tiene una
 * columna despacho_id, y aquí se filtra siempre por el despacho del usuario
 * que inició sesión, para que un despacho nunca vea los datos de otro.
 */

let despachoActualId = null;
let despachoActualNombre = "";
export function setDespachoActual(id, nombre) {
  despachoActualId = id || null;
  despachoActualNombre = nombre || "";
}

// Para textos (PDFs, WhatsApp, recibos, etc.) que antes decían siempre
// "Cortés Ramírez Abogados" a mano: ahora usan el nombre del despacho de la
// sesión activa, para que la misma app sirva a cualquier despacho.
export function getNombreDespacho() {
  return despachoActualNombre || "tu despacho";
}

// "documento" es la excepción: el link de firma que reciben los clientes
// funciona sin iniciar sesión. Ese caso NO pasa por esta tabla genérica: se
// maneja aparte, más abajo, con funciones de base de datos que solo dejan
// leer/firmar UN documento puntual por su código (nunca listar la tabla
// completa). El índice de documentos (listado dentro de la app) sí se
// filtra por despacho, porque ese solo se usa autenticado.
const RECORD_TABLES = {
  cliente: { table: "clientes", filtrarDespacho: true },
  caso: { table: "casos", filtrarDespacho: true },
};

const INDEX_TABLES = {
  "indice-clientes": "clientes",
  "indice-documentos": "documentos",
  "indice-casos": "casos",
};

function parseRecordKey(key) {
  const idx = key.indexOf(":");
  if (idx === -1) return null;
  const prefix = key.slice(0, idx);
  const info = RECORD_TABLES[prefix];
  if (!info) return null;
  return { ...info, id: key.slice(idx + 1) };
}

export async function storageGet(key) {
  try {
    if (INDEX_TABLES[key]) {
      const table = INDEX_TABLES[key];
      const { data, error } = await supabase
        .from(table)
        .select("id")
        .eq("despacho_id", despachoActualId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return JSON.stringify((data || []).map((r) => r.id));
    }

    if (key.startsWith("chat-asistente:")) {
      const { data, error } = await supabase
        .from("chats")
        .select("value")
        .eq("despacho_id", despachoActualId)
        .eq("id", key)
        .maybeSingle();
      if (error) throw error;
      return data ? data.value : null;
    }

    if (key.startsWith("documento:")) {
      const id = key.slice("documento:".length);
      if (despachoActualId) {
        const { data, error } = await supabase
          .from("documentos")
          .select("data")
          .eq("id", id)
          .eq("despacho_id", despachoActualId)
          .maybeSingle();
        if (error) throw error;
        return data ? JSON.stringify(data.data) : null;
      }
      // Sin sesión (cliente firmando): solo este documento puntual, vía función segura.
      const { data, error } = await supabase.rpc("obtener_documento_publico", { p_id: id });
      if (error) throw error;
      return data ? JSON.stringify(data) : null;
    }

    const record = parseRecordKey(key);
    if (record) {
      let query = supabase.from(record.table).select("data").eq("id", record.id);
      if (record.filtrarDespacho) query = query.eq("despacho_id", despachoActualId);
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return data ? JSON.stringify(data.data) : null;
    }

    // Ajustes simples de una sola clave: preferencia-tema, perfil-abogado,
    // ultima-revision-firmas, estrategia-contenido, indice-contenido, etc.
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("despacho_id", despachoActualId)
      .eq("key", key)
      .maybeSingle();
    if (error) throw error;
    return data ? data.value : null;
  } catch (e) {
    console.error("storageGet error", key, e);
    return null;
  }
}

async function syncIndexTable(table, newIds) {
  const { data, error } = await supabase.from(table).select("id").eq("despacho_id", despachoActualId);
  if (error) throw error;
  const currentIds = (data || []).map((r) => r.id);
  const toDelete = currentIds.filter((id) => !newIds.includes(id));
  if (toDelete.length > 0) {
    const { error: delError } = await supabase.from(table).delete().eq("despacho_id", despachoActualId).in("id", toDelete);
    if (delError) throw delError;
  }
}

export async function storageSet(key, value) {
  try {
    if (INDEX_TABLES[key]) {
      const ids = value ? JSON.parse(value) : [];
      await syncIndexTable(INDEX_TABLES[key], ids);
      return true;
    }

    if (key.startsWith("chat-asistente:")) {
      const { error } = await supabase
        .from("chats")
        .upsert({ id: key, despacho_id: despachoActualId, value, updated_at: new Date().toISOString() });
      if (error) throw error;
      return true;
    }

    if (key.startsWith("documento:")) {
      const id = key.slice("documento:".length);
      const parsed = JSON.parse(value);
      if (despachoActualId) {
        const { error } = await supabase
          .from("documentos")
          .upsert({ id, despacho_id: despachoActualId, data: parsed, updated_at: new Date().toISOString() });
        if (error) throw error;
        return true;
      }
      // Sin sesión (cliente firmando): solo actualiza este documento puntual, vía función segura.
      const { error } = await supabase.rpc("guardar_firma_documento", { p_id: id, p_data: parsed });
      if (error) throw error;
      return true;
    }

    const record = parseRecordKey(key);
    if (record) {
      const parsed = JSON.parse(value);
      const row = {
        id: record.id,
        data: parsed,
        updated_at: new Date().toISOString(),
        despacho_id: despachoActualId,
      };
      const { error } = await supabase.from(record.table).upsert(row);
      if (error) throw error;
      return true;
    }

    const { error } = await supabase
      .from("app_settings")
      .upsert({ key, despacho_id: despachoActualId, value, updated_at: new Date().toISOString() });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error("storageSet error", key, e);
    return false;
  }
}
