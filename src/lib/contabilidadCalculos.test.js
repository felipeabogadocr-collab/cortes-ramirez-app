import { describe, it, expect } from "vitest";
import {
  valorRetenido,
  valorNetoPago,
  montoAhorro,
  pad2AcuerdoPago,
  ultimoDiaMesAcuerdoPago,
  fechaISODiaMesAcuerdoPago,
  calcularPrimeraFechaCuotaAcuerdo,
  generarCuotasAcuerdoPago,
} from "./contabilidadCalculos.js";

describe("valorRetenido", () => {
  it("devuelve 0 sin porcentaje de retención", () => {
    expect(valorRetenido({ valor: 1000000 })).toBe(0);
    expect(valorRetenido({ valor: 1000000, retencionPorcentaje: 0 })).toBe(0);
  });

  it("calcula el valor retenido redondeado", () => {
    expect(valorRetenido({ valor: 1000000, retencionPorcentaje: 4 })).toBe(40000);
    expect(valorRetenido({ valor: 333333, retencionPorcentaje: 11 })).toBe(36667); // 36666.63 -> redondea
  });

  it("ignora porcentajes negativos o inválidos", () => {
    expect(valorRetenido({ valor: 1000000, retencionPorcentaje: -5 })).toBe(0);
    expect(valorRetenido({ valor: 1000000, retencionPorcentaje: "no-numero" })).toBe(0);
  });

  it("no explota con un pago undefined/null", () => {
    expect(valorRetenido(undefined)).toBe(0);
    expect(valorRetenido(null)).toBe(0);
  });
});

describe("valorNetoPago", () => {
  it("resta la retención del valor bruto", () => {
    expect(valorNetoPago({ valor: 1000000, retencionPorcentaje: 10 })).toBe(900000);
  });

  it("es igual al valor bruto cuando no hay retención", () => {
    expect(valorNetoPago({ valor: 500000 })).toBe(500000);
  });
});

describe("montoAhorro", () => {
  it("calcula el ahorro sobre el NETO, no sobre el bruto", () => {
    // valor 1,000,000 con 10% de retención -> neto 900,000; 20% de eso = 180,000
    expect(montoAhorro({ valor: 1000000, retencionPorcentaje: 10 }, 20)).toBe(180000);
  });

  it("devuelve 0 sin porcentaje de ahorro", () => {
    expect(montoAhorro({ valor: 1000000 }, 0)).toBe(0);
    expect(montoAhorro({ valor: 1000000 }, null)).toBe(0);
  });
});

describe("pad2AcuerdoPago / ultimoDiaMesAcuerdoPago / fechaISODiaMesAcuerdoPago", () => {
  it("rellena con cero a la izquierda", () => {
    expect(pad2AcuerdoPago(3)).toBe("03");
    expect(pad2AcuerdoPago(11)).toBe("11");
  });

  it("calcula el último día del mes, incluyendo febrero bisiesto", () => {
    expect(ultimoDiaMesAcuerdoPago(2024, 1)).toBe(29); // feb 2024, bisiesto
    expect(ultimoDiaMesAcuerdoPago(2025, 1)).toBe(28); // feb 2025, no bisiesto
    expect(ultimoDiaMesAcuerdoPago(2025, 3)).toBe(30); // abril
  });

  it("arma la fecha ISO recortando el día si el mes es más corto", () => {
    expect(fechaISODiaMesAcuerdoPago(2025, 0, 15)).toBe("2025-01-15");
    // 31 de febrero no existe -> se recorta al último día real del mes
    expect(fechaISODiaMesAcuerdoPago(2025, 1, 31)).toBe("2025-02-28");
  });
});

describe("calcularPrimeraFechaCuotaAcuerdo", () => {
  it("usa hoy mismo cuando no se especifica día de pago", () => {
    const hoy = new Date();
    const esperado = fechaISODiaMesAcuerdoPago(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    expect(calcularPrimeraFechaCuotaAcuerdo(null)).toBe(esperado);
  });

  it("cae en el mes siguiente si el día de pago ya pasó este mes", () => {
    const hoy = new Date();
    const diaPasado = hoy.getDate() > 1 ? hoy.getDate() - 1 : null;
    if (diaPasado === null) return; // primer día del mes: no hay "día ya pasado" que probar hoy
    const resultado = calcularPrimeraFechaCuotaAcuerdo(diaPasado);
    let mesEsperado = hoy.getMonth() + 1;
    let anioEsperado = hoy.getFullYear();
    if (mesEsperado > 11) {
      mesEsperado = 0;
      anioEsperado += 1;
    }
    expect(resultado).toBe(fechaISODiaMesAcuerdoPago(anioEsperado, mesEsperado, diaPasado));
  });
});

describe("generarCuotasAcuerdoPago", () => {
  it("reparte el valor total en partes iguales", () => {
    const cuotas = generarCuotasAcuerdoPago({ valorTotal: 900000, numCuotas: 3, diaPago: 5 });
    expect(cuotas).toHaveLength(3);
    expect(cuotas.every((c) => c.valor === 300000)).toBe(true);
  });

  it("cada cuota cae un mes después de la anterior", () => {
    const cuotas = generarCuotasAcuerdoPago({ valorTotal: 300000, numCuotas: 3, diaPago: 10 });
    const meses = cuotas.map((c) => c.fecha.slice(0, 7));
    expect(new Set(meses).size).toBe(3); // 3 meses distintos, sin repetir
  });

  it("devuelve una lista vacía con 0 cuotas", () => {
    expect(generarCuotasAcuerdoPago({ valorTotal: 100000, numCuotas: 0, diaPago: 5 })).toEqual([]);
  });
});
