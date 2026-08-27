# Cortés Ramírez Abogados — App de gestión

App interna del despacho para gestión de clientes, documentos (con firma), contabilidad,
vigilancia judicial, métricas de redes sociales y un asistente de IA. Construida con
Vite + React, Supabase (base de datos) y una función serverless de Vercel (proxy seguro
hacia la API gratuita de Google Gemini). Instalable como PWA en celular/tablet.

## 1. Crear el proyecto en Supabase (plan gratuito)

1. Entra a [supabase.com](https://supabase.com) y crea un proyecto nuevo (gratis).
2. Ve a **SQL Editor** y ejecuta el contenido de [`supabase/schema.sql`](supabase/schema.sql).
   Esto crea las tablas `clientes`, `documentos`, `casos`, `usuarios`, `metricas_redes`,
   `chats` y `app_settings`, con Row Level Security habilitado.
3. Ve a **Project Settings > API** y copia:
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public key` → `VITE_SUPABASE_ANON_KEY`

## 2. Obtener la clave de la API de Gemini (gratis)

1. Entra a [aistudio.google.com/apikey](https://aistudio.google.com/apikey) e inicia sesión
   con una cuenta de Google.
2. **Create API key**. No pide tarjeta de crédito; tiene un nivel gratuito con límite de
   peticiones por minuto/día (suficiente para el uso de un despacho).
3. Guárdala como `GEMINI_API_KEY` (solo se usa en el servidor, nunca en el navegador).

## 3. Desarrollo local

```bash
npm install
cp .env.example .env.local   # y completa las 3 variables de arriba
npm run dev
```

Nota: en desarrollo local `npm run dev` (Vite) no ejecuta las funciones serverless de
`/api`. Para probar el asistente de IA localmente usa `vercel dev` (requiere el CLI de
Vercel y haber hecho `vercel link` al proyecto) o despliega directo a Vercel.

## 4. Desplegar en Vercel (plan gratuito)

1. Sube este repositorio a GitHub (ya está listo en la rama de este proyecto).
2. En [vercel.com](https://vercel.com) → **Add New Project** → importa el repositorio.
   Vercel detecta Vite automáticamente (build: `npm run build`, output: `dist`).
3. En **Environment Variables** agrega las 3 claves de arriba:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `GEMINI_API_KEY`
4. Despliega. Vercel publica automáticamente la función `api/assistant.js` como
   endpoint serverless en `/api/assistant`.

## 5. Instalar como app (PWA)

Abre la URL publicada desde el navegador del celular/tablet y usa
"Agregar a pantalla de inicio" (Android/Chrome) o "Compartir → Agregar a inicio"
(iOS/Safari).

## Notas de arquitectura

- `src/lib/storage.js` reemplaza el `window.storage` del prototipo original por
  llamadas a Supabase, manteniendo la misma interfaz (`storageGet`/`storageSet`) para
  no tener que reescribir la lógica de negocio del resto de la app.
- `api/assistant.js` es la única función serverless: recibe las mismas peticiones "estilo
  Anthropic" que el frontend ya armaba (system/tools/messages con bloques de texto,
  imagen, PDF y uso de herramientas) y las traduce al formato de la API de Gemini
  (function calling incluido), usando la clave guardada en el servidor
  (`GEMINI_API_KEY`). La respuesta se traduce de vuelta a la misma forma que esperaba
  el frontend, así que el resto de la app no tuvo que cambiar.
- Las políticas de Row Level Security en `supabase/schema.sql` permiten acceso completo
  con la llave `anon` (uso interno del despacho). Si más adelante se necesita login por
  usuario, se puede activar Supabase Auth y restringir las políticas.
