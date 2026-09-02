import { describe, it, expect, vi, afterEach } from "vitest";
import { contrasenaFiltrada } from "./pwnedPassword.js";

// "password" en SHA-1 es 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8 — se usa
// tal cual (viene en cualquier lista de brechas) para no depender de
// mantener el hash de otra contraseña sincronizado a mano.
const HASH_PASSWORD = "5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8";
const PREFIJO = HASH_PASSWORD.slice(0, 5);
const SUFIJO = HASH_PASSWORD.slice(5);

describe("contrasenaFiltrada", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("true cuando el sufijo del hash aparece en la respuesta de la API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => `${SUFIJO}:3730471\nOTRO123:5\n`,
      })
    );
    expect(await contrasenaFiltrada("password")).toBe(true);
  });

  it("false cuando el sufijo no aparece", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => "AAAA1111:2\nBBBB2222:9\n",
      })
    );
    expect(await contrasenaFiltrada("una-contrasena-que-nadie-mas-usa-2026")).toBe(false);
  });

  it("no bloquea si la API falla o no responde (fail-open)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("sin red")));
    expect(await contrasenaFiltrada("cualquier-cosa")).toBe(false);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await contrasenaFiltrada("cualquier-cosa")).toBe(false);
  });

  it("manda solo el prefijo de 5 caracteres del hash a la API, nunca la contraseña", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    await contrasenaFiltrada("password");
    const urlLlamada = fetchMock.mock.calls[0][0];
    // La URL solo lleva el prefijo de 5 caracteres del hash — nunca la
    // contraseña en texto plano ni el hash completo (que sí la revelaría
    // por fuerza bruta si alguien interceptara la solicitud).
    expect(urlLlamada).toBe(`https://api.pwnedpasswords.com/range/${PREFIJO}`);
    expect(urlLlamada.length).toBe(`https://api.pwnedpasswords.com/range/`.length + 5);
  });
});
