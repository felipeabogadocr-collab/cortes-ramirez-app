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
2. En el proyecto **folio-pdf** de Vercel (Settings → Environment Variables), agrega
   `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con los mismos valores que ya tiene la app
   interna (Project Settings → API en Supabase).
3. Vuelve a desplegar. Ya cada registro (nombre + celular) queda guardado, y cada documento
   procesado queda contado por herramienta.
4. Entra a `/panel` (ej. `https://folio-pdf-omega.vercel.app/panel`) con la contraseña
   configurada en `src/Panel.jsx` (`PANEL_PASSWORD`) para ver los números.

Por seguridad, el panel público solo muestra **conteos** (nunca nombres ni celulares) — esos
datos personales solo se pueden ver en el Table Editor de Supabase (tabla `folio_leads`),
porque la llave `anon` que usa el navegador no tiene permiso de lectura sobre esa tabla.

## Firma electrónica

La firma es una firma electrónica simple (dibujada a mano y estampada como imagen sobre el
PDF), no una firma digital certificada con validez plena ante notarías/TSE. Para eso se
necesitaría un certificado de una entidad certificadora.

## Compresión

La herramienta de comprimir hace una optimización ligera de la estructura del PDF
(`useObjectStreams`). No recomprime imágenes internas, así que el ahorro depende del
documento.
