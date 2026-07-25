import { describe, expect, it } from "vitest";

import { FUSCA_OPTIONS, formatVehicleSpecs, normalizeVehicle } from "./model";

describe("normalizeVehicle", () => {
  it("preenche ignição e sistema elétrico com o padrão", () => {
    const vehicle = normalizeVehicle({});
    expect(vehicle.ignicao).toBe("platinado");
    expect(vehicle.sistema_eletrico).toBe("12V");
  });

  it("preserva os valores informados", () => {
    const vehicle = normalizeVehicle({ ignicao: "eletronica", sistema_eletrico: "6V" });
    expect(vehicle.ignicao).toBe("eletronica");
    expect(vehicle.sistema_eletrico).toBe("6V");
  });

  it("descarta valores que não são string", () => {
    const vehicle = normalizeVehicle({ ano: 1975, modelo: null, motor: { a: 1 } });
    expect(vehicle.ano).toBe("");
    expect(vehicle.modelo).toBe("");
    expect(vehicle.motor).toBe("");
  });

  it("substitui string vazia pelo padrão nos campos com default", () => {
    const vehicle = normalizeVehicle({ ignicao: "", sistema_eletrico: "" });
    expect(vehicle.ignicao).toBe("platinado");
    expect(vehicle.sistema_eletrico).toBe("12V");
  });
});

describe("formatVehicleSpecs", () => {
  it("retorna null quando não há veículo", () => {
    expect(formatVehicleSpecs(null)).toBeNull();
    expect(formatVehicleSpecs(undefined)).toBeNull();
  });

  it("retorna null quando a ficha está vazia", () => {
    expect(formatVehicleSpecs({})).toBeNull();
    expect(formatVehicleSpecs({ apelido: "   ", modelo: "" })).toBeNull();
  });

  it("inclui ano_motor, que antes era perdido ao montar o contexto", () => {
    const specs = formatVehicleSpecs({ motor: "1600", ano_motor: "1975" });
    expect(specs).toContain("Ano do motor: 1975");
  });

  it("monta a ficha na ordem dos rótulos", () => {
    const specs = formatVehicleSpecs({
      apelido: "Besouro",
      modelo: "Fusca 1600",
      ano: "1975",
      ignicao: "platinado",
    });
    expect(specs).toBe("Apelido: Besouro | Modelo: Fusca 1600 | Ano: 1975 | Ignição: platinado");
  });

  it("omite campos vazios", () => {
    const specs = formatVehicleSpecs({ apelido: "Besouro", modelo: "", ano: "   " });
    expect(specs).toBe("Apelido: Besouro");
  });
});

describe("FUSCA_OPTIONS", () => {
  it("cobre os anos de produção sem duplicatas", () => {
    const anos = FUSCA_OPTIONS.anos;
    expect(new Set(anos).size).toBe(anos.length);
    expect(anos).toContain("1959");
    expect(anos).toContain("1986");
    expect(anos).toContain("1996");
    // 1987–1992: o Fusca saiu de linha e voltou com o Itamar.
    expect(anos).not.toContain("1990");
  });
});
