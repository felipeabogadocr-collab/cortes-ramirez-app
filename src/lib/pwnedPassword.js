// Revisa una contraseña contra la API pública "Have I Been Pwned: Pwned
// Passwords" (gratis, sin llave ni cuenta) usando k-anonimato: solo se
// mandan los primeros 5 caracteres del hash SHA-1, nunca la contraseña ni
// el hash completo — el servidor no puede saber cuál era la contraseña
// real, solo confirma si ALGÚN hash con ese prefijo aparece en su lista.
//
// Se usa además de validarContrasena (longitud, letras+números): una
// contraseña puede cumplir esas reglas y aun así ser "Nequi12345" — una de
// las miles ya filtradas en brechas de datos conocidas y probadas por bots
// en cuanto encuentran un panel de login.

async function sha1Hex(texto) {
  const datos = new TextEncoder().encode(texto);
  const hashBuffer = await crypto.subtle.digest("SHA-1", datos);
  return [...new Uint8Array(hashBuffer)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

// Devuelve true si la contraseña aparece en filtraciones conocidas, false
// si no aparece o si no se pudo consultar (nunca bloquea el registro por un
// problema de red o de la API — solo por una filtración confirmada).
export async function contrasenaFiltrada(contrasena) {
  try {
    const hash = await sha1Hex(contrasena);
    const prefijo = hash.slice(0, 5);
    const sufijo = hash.slice(5);
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefijo}`);
    if (!response.ok) return false;
    const texto = await response.text();
    return texto.split("\n").some((linea) => linea.split(":")[0].trim() === sufijo);
  } catch (e) {
    return false;
  }
}
