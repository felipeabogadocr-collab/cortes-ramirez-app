import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  diasDesde,
  diasHasta,
  calcularProximaFechaPorFrecuencia,
  formatoCOP,
  calcularEstado,
  numeroWhatsappCliente,
  textoEstadoPago,
  archivoDemasiadoGrande,
  TAMANO_MAX_ARCHIVO_MB,
  permisosPorDefecto,
  notificacionesPorDefecto,
} from "./utils.js";

describe("diasDesde", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("devuelve null si no hay fecha", () => {
    expect(diasDesde(null)).toBeNull();
    expect(diasDesde(undefined)).toBeNull();
    expect(diasDesde("")).toBeNull();
  });

  it("cuenta los días completos transcurridos", () => {
    expect(diasDesde("2026-09-02T12:00:00Z")).toBe(0);
    expect(diasDesde("2026-08-30T12:00:00Z")).toBe(3);
    expect(diasDesde("2026-08-26T00:00:00Z")).toBe(7);
  });
});

describe("diasHasta", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("devuelve null si no hay fecha", () => {
    expect(diasHasta(null)).toBeNull();
  });

  it("cuenta los días que faltan (redondeando hacia arriba)", () => {
    expect(diasHasta("2026-09-05T12:00:00Z")).toBe(3);
    expect(diasHasta("2026-08-30T12:00:00Z")).toBe(-3);
  });
});

describe("calcularProximaFechaPorFrecuencia", () => {
  it("suma 7 días para Semanal", () => {
    expect(calcularProximaFechaPorFrecuencia("2026-01-01", "Semanal")).toBe("2026-01-08");
  });

  it("suma 15 días para Quincenal", () => {
    expect(calcularProximaFechaPorFrecuencia("2026-01-01", "Quincenal")).toBe("2026-01-16");
  });

  it("suma 1 mes para Mensual, incluso cruzando fin de año", () => {
    expect(calcularProximaFechaPorFrecuencia("2026-12-01", "Mensual")).toBe("2027-01-01");
  });

  it("deja la misma fecha para frecuencias no reconocidas (Pago único, Otro)", () => {
    expect(calcularProximaFechaPorFrecuencia("2026-03-15", "Pago único")).toBe("2026-03-15");
    expect(calcularProximaFechaPorFrecuencia("2026-03-15", "Otro")).toBe("2026-03-15");
  });
});

// Intl.NumberFormat separa el símbolo del monto con un espacio de no
// separación (U+00A0), no un espacio normal — se normaliza antes de comparar.
const sinNbsp = (s) => s.replace(/\u00A0/g, " ");

describe("formatoCOP", () => {
  it("formatea un número como pesos colombianos sin decimales", () => {
    expect(sinNbsp(formatoCOP(1000000))).toBe("$ 1.000.000");
    expect(sinNbsp(formatoCOP(0))).toBe("$ 0");
  });

  it("trata valores no numéricos como cero en vez de romper", () => {
    expect(sinNbsp(formatoCOP(null))).toBe("$ 0");
    expect(sinNbsp(formatoCOP(undefined))).toBe("$ 0");
    expect(sinNbsp(formatoCOP("no es un número"))).toBe("$ 0");
  });

  it("acepta strings numéricos", () => {
    expect(sinNbsp(formatoCOP("50000"))).toBe("$ 50.000");
  });
});

describe("calcularEstado", () => {
  it("sin firmantes está pendiente", () => {
    expect(calcularEstado([])).toBe("pendiente");
    expect(calcularEstado(undefined)).toBe("pendiente");
  });

  it("solo el cliente firmó: falta el abogado", () => {
    expect(calcularEstado([{ rol: "cliente" }])).toBe("falta_abogado");
  });

  it("firmaron ambos: listo", () => {
    expect(calcularEstado([{ rol: "cliente" }, { rol: "abogado" }])).toBe("listo");
  });

  it("solo firmó el abogado (sin cliente): no cuenta como listo", () => {
    expect(calcularEstado([{ rol: "abogado" }])).toBe("pendiente");
  });
});

describe("numeroWhatsappCliente", () => {
  it("antepone el indicativo de Colombia a números locales de 10 dígitos", () => {
    expect(numeroWhatsappCliente("3001234567")).toBe("573001234567");
  });

  it("deja intacto un número que ya trae indicativo (más de 10 dígitos)", () => {
    expect(numeroWhatsappCliente("573001234567")).toBe("573001234567");
  });

  it("quita espacios, guiones y paréntesis", () => {
    expect(numeroWhatsappCliente("(300) 123-4567")).toBe("573001234567");
  });

  it("devuelve cadena vacía si no hay dígitos", () => {
    expect(numeroWhatsappCliente("")).toBe("");
    expect(numeroWhatsappCliente(undefined)).toBe("");
  });
});

describe("textoEstadoPago", () => {
  it("días negativos: atrasado", () => {
    expect(textoEstadoPago(-1)).toBe("Atrasado 1 día");
    expect(textoEstadoPago(-3)).toBe("Atrasado 3 días");
  });

  it("día cero: debe pagar hoy", () => {
    expect(textoEstadoPago(0)).toBe("Debe pagar hoy");
  });

  it("días positivos: cuenta regresiva", () => {
    expect(textoEstadoPago(1)).toBe("Debe pagar en 1 día");
    expect(textoEstadoPago(5)).toBe("Debe pagar en 5 días");
  });
});

describe("archivoDemasiadoGrande", () => {
  it("permite archivos por debajo del límite", () => {
    expect(archivoDemasiadoGrande({ size: 1024 })).toBe(false);
  });

  it("rechaza archivos por encima del límite configurado", () => {
    const unByteDeMas = TAMANO_MAX_ARCHIVO_MB * 1024 * 1024 + 1;
    expect(archivoDemasiadoGrande({ size: unByteDeMas })).toBe(true);
  });
});

describe("permisosPorDefecto", () => {
  it("Administrador y Abogado ven todas las secciones", () => {
    const permisosAdmin = permisosPorDefecto("Administrador");
    expect(permisosAdmin.contabilidad).toBe(true);
    expect(permisosAdmin.reportes).toBe(true);
    expect(permisosPorDefecto("Abogado").vigilancia).toBe(true);
  });

  it("Asistente arranca sin acceso a contabilidad, vigilancia, contenido ni reportes", () => {
    const permisosAsistente = permisosPorDefecto("Asistente");
    expect(permisosAsistente.contabilidad).toBe(false);
    expect(permisosAsistente.vigilancia).toBe(false);
    expect(permisosAsistente.contenido).toBe(false);
    expect(permisosAsistente.reportes).toBe(false);
    expect(permisosAsistente.clientes).toBe(true);
  });
});

describe("notificacionesPorDefecto", () => {
  it("todas las categorías empiezan activadas", () => {
    const prefs = notificacionesPorDefecto();
    expect(Object.values(prefs).every(Boolean)).toBe(true);
    expect(prefs.firmas).toBe(true);
    expect(prefs.pagos).toBe(true);
  });
});
