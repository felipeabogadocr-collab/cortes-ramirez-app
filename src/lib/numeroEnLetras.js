// Convierte un valor en pesos colombianos a su forma escrita en español
// ("UN MILLÓN DOSCIENTOS MIL PESOS M/CTE"), como se acostumbra en una
// cuenta de cobro. Sin dependencias — función pura, cubre de 0 hasta
// 999.999.999 (más que suficiente para honorarios de un despacho).

const UNIDADES = ["", "UN", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
const DIEZ_A_DIECINUEVE = ["DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE"];
const DECENAS = ["", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const CENTENAS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

function grupoDeTres(n) {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes = [];
  if (c > 0) partes.push(CENTENAS[c]);
  if (resto >= 10 && resto <= 19) {
    partes.push(DIEZ_A_DIECINUEVE[resto - 10]);
  } else if (resto >= 20) {
    const d = Math.floor(resto / 10);
    const u = resto % 10;
    partes.push(u > 0 ? `${DECENAS[d]} Y ${UNIDADES[u]}` : DECENAS[d]);
  } else if (resto > 0) {
    partes.push(UNIDADES[resto]);
  }
  return partes.join(" ");
}

export function numeroEnLetras(valor) {
  const n = Math.round(Math.abs(Number(valor) || 0));
  if (n === 0) return "CERO PESOS M/CTE";

  const millones = Math.floor(n / 1000000);
  const miles = Math.floor((n % 1000000) / 1000);
  const cientos = n % 1000;

  const partes = [];
  if (millones > 0) {
    partes.push(millones === 1 ? "UN MILLÓN" : `${grupoDeTres(millones)} MILLONES`);
  }
  if (miles > 0) {
    partes.push(miles === 1 ? "MIL" : `${grupoDeTres(miles)} MIL`);
  }
  if (cientos > 0) {
    partes.push(grupoDeTres(cientos));
  }

  return `${partes.join(" ")} PESOS M/CTE`;
}
