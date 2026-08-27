const WHATSAPP_NUMBER = "573192875428";

export default function WhatsAppFloat() {
  const href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
    "Hola, tengo una consulta sobre IA Litia."
  )}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escribir por WhatsApp"
      title="Escríbenos por WhatsApp"
      style={{
        position: "fixed",
        right: 20,
        bottom: 20,
        width: 56,
        height: 56,
        borderRadius: "50%",
        background: "#25D366",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
        zIndex: 50,
      }}
    >
      <svg width="30" height="30" viewBox="0 0 32 32" fill="#fff" aria-hidden="true">
        <path d="M16.02 3C9.4 3 4 8.38 4 15c0 2.36.68 4.56 1.86 6.42L4 29l7.77-1.83A11.94 11.94 0 0 0 16.02 27C22.64 27 28 21.62 28 15S22.64 3 16.02 3zm0 21.8c-1.98 0-3.83-.55-5.4-1.5l-.39-.23-4.6 1.08 1.1-4.48-.25-.4A9.7 9.7 0 0 1 6.2 15c0-5.4 4.4-9.8 9.82-9.8 5.42 0 9.82 4.4 9.82 9.8 0 5.4-4.4 9.8-9.82 9.8zm5.38-7.34c-.29-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.66.15-.2.29-.76.96-.93 1.16-.17.2-.34.22-.63.07-.29-.15-1.24-.46-2.36-1.46-.87-.78-1.46-1.74-1.63-2.03-.17-.29-.02-.45.13-.6.13-.13.29-.34.44-.51.15-.17.2-.29.29-.49.1-.2.05-.37-.02-.51-.07-.15-.66-1.59-.9-2.17-.24-.57-.48-.5-.66-.5-.17 0-.37-.02-.56-.02-.2 0-.51.07-.78.37-.27.29-1.02 1-1.02 2.44s1.05 2.83 1.2 3.03c.15.2 2.07 3.16 5.02 4.43.7.3 1.25.48 1.68.62.7.22 1.34.19 1.84.11.56-.08 1.75-.71 2-1.4.24-.68.24-1.27.17-1.4-.07-.13-.27-.2-.56-.35z" />
      </svg>
    </a>
  );
}
