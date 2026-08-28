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
export function getDespachoActualId() {
  return despachoActualId;
}

// Recibos de pago (imágenes generadas en canvas) --------------------------
// Antes se guardaban como texto base64 completo dentro de la fila del
// cliente en la base de datos — con cientos de pagos eso infla rápido el
// límite de espacio gratis de Supabase. Ahora se suben al bucket privado
// "recibos" (protegido por RLS: cada despacho solo puede leer su propia
// carpeta) y en el cliente solo se guarda la ruta del archivo, no la imagen.

export async function subirReciboImagen(clienteId, pagoId, blob) {
  if (!despachoActualId) throw new Error("Sin despacho activo");
  const ruta = `${despachoActualId}/${clienteId}/${pagoId}.png`;
  const { error } = await supabase.storage.from("recibos").upload(ruta, blob, { contentType: "image/png", upsert: true });
  if (error) throw error;
  return ruta;
}

export async function obtenerUrlReciboImagen(ruta) {
  if (!ruta) return null;
  const { data, error } = await supabase.storage.from("recibos").download(ruta);
  if (error) throw error;
  return URL.createObjectURL(data);
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
        .is("eliminado_en", null)
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
          .is("eliminado_en", null)
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
  const { data, error } = await supabase.from(table).select("id").eq("despacho_id", despachoActualId).is("eliminado_en", null);
  if (error) throw error;
  const currentIds = (data || []).map((r) => r.id);
  const toDelete = currentIds.filter((id) => !newIds.includes(id));
  if (toDelete.length > 0) {
    // Borrado suave: se marca con fecha en vez de borrarse de una, para
    // poder recuperarlo desde la Papelera si fue un error.
    const { error: delError } = await supabase
      .from(table)
      .update({ eliminado_en: new Date().toISOString() })
      .eq("despacho_id", despachoActualId)
      .in("id", toDelete);
    if (delError) throw delError;
  }
}

// Papelera --------------------------------------------------------------
// Los tres tipos de registro que se pueden "eliminar" desde la app en
// realidad solo se marcan con eliminado_en (ver syncIndexTable arriba).
// Estas funciones permiten verlos, recuperarlos o borrarlos para siempre.

const TABLAS_PAPELERA = { clientes: "clientes", documentos: "documentos", casos: "casos" };

export async function obtenerPapelera(tipo) {
  const table = TABLAS_PAPELERA[tipo];
  if (!table || !despachoActualId) return [];
  const { data, error } = await supabase
    .from(table)
    .select("id, data, eliminado_en")
    .eq("despacho_id", despachoActualId)
    .not("eliminado_en", "is", null)
    .order("eliminado_en", { ascending: false });
  if (error) {
    console.error("obtenerPapelera error", tipo, error);
    return [];
  }
  return data || [];
}

export async function restaurarDePapelera(tipo, id) {
  const table = TABLAS_PAPELERA[tipo];
  if (!table) return false;
  const { error } = await supabase.from(table).update({ eliminado_en: null }).eq("despacho_id", despachoActualId).eq("id", id);
  return !error;
}

export async function eliminarDefinitivo(tipo, id) {
  const table = TABLAS_PAPELERA[tipo];
  if (!table) return false;
  const { error } = await supabase.from(table).delete().eq("despacho_id", despachoActualId).eq("id", id);
  return !error;
}

// Firma pública de documentos ----------------------------------------------
// Cuando firma alguien SIN sesión (el cliente, desde #firmar), no se escribe
// directo a Supabase desde el navegador: pasa por esta función serverless
// para poder registrar la IP real de quien firmó (ver api/documentos/firmar.js).

export async function firmarDocumentoPublico(id, data) {
  const response = await fetch("/api/documentos/firmar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codigo: id, data }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || "No se pudo guardar la firma");
  return json;
}

// Búsqueda global ---------------------------------------------------------

export async function buscarGlobal(texto) {
  const consulta = (texto || "").trim();
  if (!despachoActualId || consulta.length < 2) return [];
  const patron = `%${consulta}%`;
  const [clientesRes, documentosRes] = await Promise.all([
    supabase.from("clientes").select("id, data").eq("despacho_id", despachoActualId).is("eliminado_en", null).ilike("data->>nombre", patron).limit(6),
    supabase.from("documentos").select("id, data").eq("despacho_id", despachoActualId).is("eliminado_en", null).ilike("data->>titulo", patron).limit(6),
  ]);
  const clientes = (clientesRes.data || []).map((r) => ({ tipo: "cliente", id: r.id, titulo: r.data?.nombre || "(sin nombre)" }));
  const documentos = (documentosRes.data || []).map((r) => ({ tipo: "documento", id: r.id, titulo: r.data?.titulo || "(sin título)" }));
  return [...clientes, ...documentos];
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
      // Sin sesión (cliente firmando #firmar) no pasa por aquí: usa
      // firmarDocumentoPublico(), que sí captura la IP en el servidor.
      const id = key.slice("documento:".length);
      const parsed = JSON.parse(value);
      const { error } = await supabase
        .from("documentos")
        .upsert({ id, despacho_id: despachoActualId, data: parsed, updated_at: new Date().toISOString() });
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
