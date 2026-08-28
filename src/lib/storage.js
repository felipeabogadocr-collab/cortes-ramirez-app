import { supabase } from "./supabaseClient";

/**
 * Reemplazo de window.storage (solo disponible dentro de Claude.ai) por Supabase.
 * Mantiene la misma firma que el prototipo original (storageGet/storageSet con
 * claves tipo "cliente:ID", "indice-clientes", etc.) para no tener que tocar el
 * resto de la aplicación: solo cambia dónde vive el dato.
 */

const RECORD_TABLES = {
  cliente: "clientes",
  documento: "documentos",
  caso: "casos",
};

const INDEX_TABLES = {
  "indice-clientes": "clientes",
  "indice-documentos": "documentos",
  "indice-casos": "casos",
};

// Ya no queda nada mapeado aquí: los usuarios viven en Supabase Auth +
// la tabla "perfiles" (ver useUsuariosDespacho en App.jsx), y las métricas
// de redes se eliminaron. Se deja el objeto vacío por si en el futuro se
// necesita otra lista completa (leer/reemplazar todo el arreglo).
const LIST_TABLES = {};

function parseRecordKey(key) {
  const idx = key.indexOf(":");
  if (idx === -1) return null;
  const prefix = key.slice(0, idx);
  const table = RECORD_TABLES[prefix];
  if (!table) return null;
  return { table, id: key.slice(idx + 1) };
}

export async function storageGet(key) {
  try {
    if (INDEX_TABLES[key]) {
      const table = INDEX_TABLES[key];
      const { data, error } = await supabase
        .from(table)
        .select("id")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return JSON.stringify((data || []).map((r) => r.id));
    }

    if (LIST_TABLES[key]) {
      const table = LIST_TABLES[key];
      const { data, error } = await supabase
        .from(table)
        .select("data")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return JSON.stringify((data || []).map((r) => r.data));
    }

    if (key.startsWith("chat-asistente:")) {
      const { data, error } = await supabase
        .from("chats")
        .select("value")
        .eq("id", key)
        .maybeSingle();
      if (error) throw error;
      return data ? data.value : null;
    }

    const record = parseRecordKey(key);
    if (record) {
      const { data, error } = await supabase
        .from(record.table)
        .select("data")
        .eq("id", record.id)
        .maybeSingle();
      if (error) throw error;
      return data ? JSON.stringify(data.data) : null;
    }

    // Ajustes simples de una sola clave: preferencia-tema, perfil-abogado,
    // sesion-usuario-id, ultimo-usuario-login, ultima-revision-firmas, etc.
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
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
  const { data, error } = await supabase.from(table).select("id");
  if (error) throw error;
  const currentIds = (data || []).map((r) => r.id);
  const toDelete = currentIds.filter((id) => !newIds.includes(id));
  if (toDelete.length > 0) {
    const { error: delError } = await supabase.from(table).delete().in("id", toDelete);
    if (delError) throw delError;
  }
}

async function replaceList(table, items) {
  const { data, error } = await supabase.from(table).select("id");
  if (error) throw error;
  const currentIds = (data || []).map((r) => r.id);
  if (currentIds.length > 0) {
    const { error: delError } = await supabase.from(table).delete().in("id", currentIds);
    if (delError) throw delError;
  }
  if (items.length > 0) {
    const rows = items.map((item) => ({ id: item.id, data: item }));
    const { error: insError } = await supabase.from(table).insert(rows);
    if (insError) throw insError;
  }
}

export async function storageSet(key, value) {
  try {
    if (INDEX_TABLES[key]) {
      const ids = value ? JSON.parse(value) : [];
      await syncIndexTable(INDEX_TABLES[key], ids);
      return true;
    }

    if (LIST_TABLES[key]) {
      const items = value ? JSON.parse(value) : [];
      await replaceList(LIST_TABLES[key], items);
      return true;
    }

    if (key.startsWith("chat-asistente:")) {
      const { error } = await supabase
        .from("chats")
        .upsert({ id: key, value, updated_at: new Date().toISOString() });
      if (error) throw error;
      return true;
    }

    const record = parseRecordKey(key);
    if (record) {
      const parsed = JSON.parse(value);
      const { error } = await supabase.from(record.table).upsert({
        id: record.id,
        data: parsed,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      return true;
    }

    const { error } = await supabase
      .from("app_settings")
      .upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error("storageSet error", key, e);
    return false;
  }
}
