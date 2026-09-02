import { describe, it, expect } from "vitest";
import { numeroEnLetras } from "./numeroEnLetras.js";

describe("numeroEnLetras", () => {
  it("cero", () => {
    expect(numeroEnLetras(0)).toBe("CERO PESOS M/CTE");
  });

  it("unidades y decenas simples", () => {
    expect(numeroEnLetras(5)).toBe("CINCO PESOS M/CTE");
    expect(numeroEnLetras(20)).toBe("VEINTE PESOS M/CTE");
    expect(numeroEnLetras(21)).toBe("VEINTE Y UN PESOS M/CTE");
  });

  it("decenas 10-19 (caso especial en español)", () => {
    expect(numeroEnLetras(15)).toBe("QUINCE PESOS M/CTE");
    expect(numeroEnLetras(16)).toBe("DIECISÉIS PESOS M/CTE");
  });

  it("cien exacto vs ciento + resto", () => {
    expect(numeroEnLetras(100)).toBe("CIEN PESOS M/CTE");
    expect(numeroEnLetras(150)).toBe("CIENTO CINCUENTA PESOS M/CTE");
  });

  it("miles", () => {
    expect(numeroEnLetras(1000)).toBe("MIL PESOS M/CTE");
    expect(numeroEnLetras(2000)).toBe("DOS MIL PESOS M/CTE");
    expect(numeroEnLetras(500000)).toBe("QUINIENTOS MIL PESOS M/CTE");
  });

  it("millones", () => {
    expect(numeroEnLetras(1000000)).toBe("UN MILLÓN PESOS M/CTE");
    expect(numeroEnLetras(2000000)).toBe("DOS MILLONES PESOS M/CTE");
  });

  it("valor típico de honorarios, combinando millones/miles/cientos", () => {
    expect(numeroEnLetras(1250000)).toBe("UN MILLÓN DOSCIENTOS CINCUENTA MIL PESOS M/CTE");
    expect(numeroEnLetras(3750500)).toBe("TRES MILLONES SETECIENTOS CINCUENTA MIL QUINIENTOS PESOS M/CTE");
  });

  it("redondea decimales y trata negativos como su valor absoluto", () => {
    expect(numeroEnLetras(1000.6)).toBe("MIL UN PESOS M/CTE");
    expect(numeroEnLetras(-5000)).toBe("CINCO MIL PESOS M/CTE");
  });

  it("valores no numéricos se tratan como cero", () => {
    expect(numeroEnLetras("no es un número")).toBe("CERO PESOS M/CTE");
    expect(numeroEnLetras(null)).toBe("CERO PESOS M/CTE");
  });
});
