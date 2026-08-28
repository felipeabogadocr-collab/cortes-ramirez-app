import { createClient } from "@supabase/supabase-js";

let client;

// Cliente de Supabase con la llave service_role: solo se usa dentro de
// funciones serverless (nunca se envía al navegador). Puede saltarse RLS y
// administrar usuarios de Supabase Auth (crear cuentas, etc.).
export function supabaseAdmin() {
  if (!client) {
    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("Faltan VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el servidor");
    }
    client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  }
  return client;
}
