# IA Litia — Herramientas PDF gratis

App gratuita, sin login ni registro, para unir, organizar (reordenar/rotar/eliminar/extraer
páginas), dividir, firmar (firma electrónica simple) y convertir imágenes a PDF. Pensada para
estudiantes y abogados.

## Por qué es gratis y rápida

- **Sin backend**: todo el procesamiento del PDF ocurre en el navegador del usuario con
  `pdf-lib` y `pdfjs-dist`. Los archivos nunca se suben a ningún servidor, así que no hay
  costos de almacenamiento ni límites de uso.
- Se publica gratis en Vercel/Netlify como sitio estático (solo `npm run build`).

## Acceso (sin login)

En vez de una cuenta/contraseña, se pide una sola vez nombre + celular con indicativo. Al
continuar se abre WhatsApp con un mensaje prellenado hacia el número del despacho, aceptando
recibir actualizaciones/descuentos de IA Litia. No se guarda nada en un servidor propio; el
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
`litia-pdf` → build command `npm run build`, output `dist`. No requiere variables de entorno.

## Firma electrónica

La firma es una firma electrónica simple (dibujada a mano y estampada como imagen sobre el
PDF), no una firma digital certificada con validez plena ante notarías/TSE. Para eso se
necesitaría un certificado de una entidad certificadora.

## Compresión

La herramienta de comprimir hace una optimización ligera de la estructura del PDF
(`useObjectStreams`). No recomprime imágenes internas, así que el ahorro depende del
documento.
