# Folio — Herramientas PDF gratis

Diseñado por **LITIA.ai**. App gratuita, sin login ni registro, para unir, organizar
(reordenar/rotar/eliminar/extraer páginas), dividir, firmar (firma electrónica simple) y
convertir imágenes a PDF. Pensada para estudiantes y abogados.

Desplegado en Vercel con **Root Directory** = `folio-pdf` desde esta misma rama (URL de
producción: `folio-pdf-omega.vercel.app`).

## Por qué es gratis y rápida

- **Sin backend**: todo el procesamiento del PDF ocurre en el navegador del usuario con
  `pdf-lib` y `pdfjs-dist`. Los archivos nunca se suben a ningún servidor, así que no hay
  costos de almacenamiento ni límites de uso.
- Se publica gratis en Vercel/Netlify como sitio estático (solo `npm run build`).

## Acceso (sin login)

En vez de una cuenta/contraseña, se pide una sola vez nombre + celular con indicativo. Al
continuar se abre WhatsApp con un mensaje prellenado hacia el número del despacho, aceptando
recibir actualizaciones/descuentos de LITIA.ai. No se guarda nada en un servidor propio; el
lead llega directo al WhatsApp configurado en `src/components/WhatsAppFloat.jsx` y
`src/components/LeadGate.jsx` (`WHATSAPP_NUMBER`).

## Desarrollo local

```bash
npm install
npm run dev
```

## Build / despliegue

```bash
npm run build
```

En Vercel: **Add New Project** → selecciona este repo → en **Root Directory** elige
`folio-pdf` → build command `npm run build`, output `dist`. Funciona sin variables de
entorno (solo no se guardan registros ni funciona `/panel` — ver siguiente sección).

## Panel de estadísticas y registro de leads (opcional)

1. En el SQL Editor del **mismo proyecto de Supabase** que usa la app interna del despacho,
   ejecuta `folio-pdf/supabase/schema.sql`.
2. En el proyecto **folio-pdf** de Vercel (Settings → Environment Variables), agrega:
   - `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` — mismos valores que ya tiene la app
     interna (Project Settings → API en Supabase). Tipo **Config** (se pueden volver a ver).
   - `SUPABASE_SERVICE_ROLE_KEY` — la llave **service_role** de ese mismo proyecto de
     Supabase (Project Settings → API Keys → "secret" / service_role). Tipo **Secret**, y
     **sin** el prefijo `VITE_` (para que nunca llegue al navegador).
   - `PANEL_PASSWORD` — la contraseña para entrar a `/panel`. Tipo **Secret**, sin prefijo
     `VITE_`.
   - `GEMINI_API_KEY` — para el chat de IA y el informe en PDF del panel (ver abajo). Es la
     misma clave gratuita de Google AI Studio que ya usa la app interna del despacho.
3. Vuelve a desplegar. Ya cada registro (nombre + celular) queda guardado, y cada documento
   procesado queda contado por herramienta.
4. Entra a `/panel` (ej. `https://folio-pdf-omega.vercel.app/panel`) con la contraseña que
   pusiste en `PANEL_PASSWORD`.

La lista de personas registradas (nombre y celular) se muestra directo en `/panel`, pero se
lee desde una función serverless (`api/panel-leads.js`) que usa la llave `service_role` de
Supabase — esa llave nunca llega al navegador, solo vive en el servidor de Vercel, y la
función exige la contraseña antes de devolver cualquier dato.

El panel también incluye:
- **Gráficas** de registros por día, por día de la semana, y documentos por herramienta.
- **Chat con IA** (`api/panel-ai.js`) para preguntar sobre los datos en lenguaje natural.
- **Generar informe PDF**: pide un análisis breve a la IA y arma un PDF (con `pdf-lib`, en el
  navegador) con los números, las tablas y las recomendaciones.

Todo esto vive detrás de la misma contraseña de `/panel` — es decir, solo para el
administrador, nunca visible para quienes usan Folio.

## Firma electrónica

La firma es una firma electrónica simple (dibujada a mano y estampada como imagen sobre el
PDF), no una firma digital certificada con validez plena ante notarías/TSE. Para eso se
necesitaría un certificado de una entidad certificadora.

## Compresión

La herramienta de comprimir hace una optimización ligera de la estructura del PDF
(`useObjectStreams`). No recomprime imágenes internas, así que el ahorro depende del
documento.
