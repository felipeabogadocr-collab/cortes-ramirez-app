import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Folio funciona sin base de datos (unir/organizar/firmar PDF sigue andando
// aunque falten estas variables); solo se pierden los registros y las
// estadísticas del panel si no están configuradas en Vercel.
export const supabase = url && anonKey ? createClient(url, anonKey) : null;
