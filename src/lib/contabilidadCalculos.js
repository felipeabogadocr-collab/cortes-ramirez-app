// Cálculos de dinero puros de Contabilidad, separados de ContabilidadTab.jsx
// (que además arrastra React y todo App.jsx) para poder probarlos sin
// necesitar Supabase ni el navegador. Contabilidad es el módulo que maneja
// plata real y hasta ahora no tenía ni una prueba — ver también
// contabilidadCalculos.test.js.
import { calcularProximaFechaPorFrecuencia } from "./utils.js";

// Cuando el cliente que paga es agente retenedor (típicamente una empresa),
// no transfiere el valor completo de la cuenta de cobro: retiene un
// porcentaje y se lo entrega directamente a la DIAN a nombre del abogado.
export function valorRetenido(pago) {
  const porcentaje = Number(pago?.retencionPorcentaje) || 0;
  if (porcentaje <= 0) return 0;
  return Math.round(((Number(pago.valor) || 0) * porcentaje) / 100);
}

export function valorNetoPago(pago) {
  return (Number(pago?.valor) || 0) - valorRetenido(pago);
}

// El ahorro sugerido se calcula sobre lo que de verdad entra a la cuenta
// (el neto, después de la retención) — no tendría sentido sugerir apartar
// plata que ni siquiera llega a estar en la mano.
export function montoAhorro(pago, porcentajeAhorro) {
  const porcentaje = Number(porcentajeAhorro) || 0;
  if (porcentaje <= 0) return 0;
  return Math.round((valorNetoPago(pago) * porcentaje) / 100);
}

export const pad2AcuerdoPago = (n) => String(n).padStart(2, "0");
export const ultimoDiaMesAcuerdoPago = (anio, mesIndex) => new Date(anio, mesIndex + 1, 0).getDate();
export const fechaISODiaMesAcuerdoPago = (anio, mesIndex, dia) =>
  `${anio}-${pad2AcuerdoPago(mesIndex + 1)}-${pad2AcuerdoPago(Math.min(dia, ultimoDiaMesAcuerdoPago(anio, mesIndex)))}`;

// Mismo criterio que en la Calculadora de precios: si el cliente acuerda
// pagar un día del mes distinto al de hoy, la primera cuota del acuerdo no
// es hoy, es la próxima vez que caiga ese día.
export function calcularPrimeraFechaCuotaAcuerdo(diaPago) {
  const hoy = new Date();
  if (!diaPago) return fechaISODiaMesAcuerdoPago(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  let anio = hoy.getFullYear();
  let mes = hoy.getMonth();
  if (hoy.getDate() > diaPago) {
    mes += 1;
    if (mes > 11) {
      mes = 0;
      anio += 1;
    }
  }
  return fechaISODiaMesAcuerdoPago(anio, mes, diaPago);
}

export function generarCuotasAcuerdoPago({ valorTotal, numCuotas, diaPago }) {
  const primera = calcularPrimeraFechaCuotaAcuerdo(diaPago);
  const valorCuota = numCuotas > 0 ? valorTotal / numCuotas : 0;
  const cuotas = [];
  let fecha = primera;
  for (let i = 0; i < numCuotas; i++) {
    cuotas.push({ fecha, valor: valorCuota });
    fecha = calcularProximaFechaPorFrecuencia(fecha, "Mensual");
  }
  return cuotas;
}
