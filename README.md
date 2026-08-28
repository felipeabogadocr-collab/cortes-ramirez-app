# Cortés Ramírez Abogados — App de gestión

App interna del despacho para gestión de clientes, documentos (con firma), contabilidad,
vigilancia judicial, calendario de contenido y un asistente de IA. Construida con
Vite + React, Supabase (base de datos + autenticación real) y funciones serverless de
Vercel (proxy seguro hacia la API gratuita de Google Gemini, y creación de usuarios).
Instalable como PWA en celular/tablet.

## 1. Crear el proyecto en Supabase (plan gratuito)

1. Entra a [supabase.com](https://supabase.com) y crea un proyecto nuevo (gratis).
2. Ve a **SQL Editor** y ejecuta el contenido de [`supabase/schema.sql`](supabase/schema.sql).
   Esto crea las tablas `clientes`, `documentos`, `casos`, `chats`, `app_settings`,
   `perfiles` (usuarios) y `auditoria`, con Row Level Security habilitado — solo
   sesiones autenticadas pueden leer/escribir los datos del despacho.
3. Ve a **Project Settings > API** y copia:
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public key` → `VITE_SUPABASE_ANON_KEY`
   - `service_role key` (la secreta, no la anon) → `SUPABASE_SERVICE_ROLE_KEY`

## 2. Obtener la clave de la API de Gemini (gratis)

1. Entra a [aistudio.google.com/apikey](https://aistudio.google.com/apikey) e inicia sesión
   con una cuenta de Google.
2. **Create API key**. No pide tarjeta de crédito; tiene un nivel gratuito con límite de
   peticiones por minuto/día (suficiente para el uso de un despacho).
3. Guárdala como `GEMINI_API_KEY` (solo se usa en el servidor, nunca en el navegador).

## 3. Desarrollo local

```bash
npm install
cp .env.example .env.local   # y completa las 4 variables de arriba
npm run dev
```

Nota: en desarrollo local `npm run dev` (Vite) no ejecuta las funciones serverless de
`/api`. Para probar el asistente de IA o la creación de usuarios localmente usa
`vercel dev` (requiere el CLI de Vercel y haber hecho `vercel link` al proyecto) o
despliega directo a Vercel.

## 4. Desplegar en Vercel (plan gratuito)

1. Sube este repositorio a GitHub (ya está listo en la rama de este proyecto).
2. En [vercel.com](https://vercel.com) → **Add New Project** → importa el repositorio.
   Vercel detecta Vite automáticamente (build: `npm run build`, output: `dist`).
3. En **Environment Variables** agrega las 4 claves de arriba:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GEMINI_API_KEY`
4. Despliega. Vercel publica automáticamente las funciones serverless en
   `/api/assistant` (asistente de IA) y `/api/usuarios/crear` (alta de usuarios).

## 5. Primer ingreso

La primera vez que se abre la app, como no hay ningún usuario todavía, se muestra la
pantalla para crear el Administrador (nombre, correo, contraseña). Desde ahí, el
Administrador crea a los demás usuarios en "Usuarios y permisos" y decide qué secciones
ve cada uno. El login es real: las contraseñas las gestiona Supabase Auth, nunca se
guardan en texto plano.

## 6. Instalar como app (PWA)

Abre la URL publicada desde el navegador del celular/tablet y usa
"Agregar a pantalla de inicio" (Android/Chrome) o "Compartir → Agregar a inicio"
(iOS/Safari).

## Notas de arquitectura

- **Autenticación real (Supabase Auth):** el login usa correo + contraseña verificados
  por Supabase (hash seguro, JWT de sesión). La tabla `perfiles` guarda nombre, rol,
  permisos y preferencias de notificación de cada usuario, ligada al usuario real de
  `auth.users`. Crear un usuario nuevo pasa por `api/usuarios/crear.js`, la única
  función que puede usar la llave `service_role` para dar de alta cuentas.
- **Row Level Security:** `clientes`, `casos`, `chats`, `app_settings`, `perfiles` y
  `auditoria` exigen una sesión autenticada — ya no se puede leer el despacho completo
  solo con la llave pública `anon`, como en la primera versión.
  **Pendiente conocido:** la tabla `documentos` se dejó con acceso anónimo a propósito,
  porque el link de firma (`#firmar` + código) lo abren los clientes sin iniciar sesión.
  Es un pendiente para una fase futura: mover la firma a enlaces de un solo uso en vez
  de una tabla legible completa.
- **Auditoría:** la tabla `auditoria` registra quién hizo qué y cuándo (por ahora:
  crear/eliminar cliente, registrar pago, crear usuario, cambiar permisos). Solo un
  Administrador puede leerla, desde "Usuarios y permisos" → "Auditoría".
- `src/lib/storage.js` reemplaza el `window.storage` del prototipo original de
  Claude.ai por llamadas a Supabase, manteniendo la misma interfaz
  (`storageGet`/`storageSet`) para no reescribir la lógica de negocio del resto de la
  app (clientes, documentos, casos, calendario de contenido, etc. — todo lo que no es
  autenticación sigue viviendo así).
- `api/assistant.js` recibe las mismas peticiones "estilo Anthropic" que el frontend ya
  armaba (system/tools/messages con texto, imagen, PDF y uso de herramientas) y las
  traduce al formato de la API de Gemini (function calling incluido), usando
  `GEMINI_API_KEY` en el servidor.
