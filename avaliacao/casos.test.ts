import { describe, expect, it } from "vitest";

import { CASOS } from "./casos";

// Os casos são dados escritos à mão e revisados por alguém que não programa:
// estes testes pegam o erro de digitação antes de ele virar placar errado.

describe("bateria de casos", () => {
  it("tem ids únicos", () => {
    const ids = CASOS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("todo caso tem fala, critério e o que medir", () => {
    for (const caso of CASOS) {
      expect(caso.falas.length, caso.id).toBeGreaterThan(0);
      expect(caso.esperado.criterios.length, caso.id).toBeGreaterThan(0);
      expect(caso.mede.trim(), caso.id).not.toBe("");
    }
  });

  it("diagnóstico tem causa esperada e desfechos aceitos; os demais não", () => {
    for (const caso of CASOS) {
      if (caso.categoria === "diagnostico") {
        expect(caso.esperado.causa, caso.id).toBeTruthy();
        expect(caso.esperado.desfechosAceitos?.length, caso.id).toBeGreaterThan(0);
      } else {
        expect(caso.esperado.causa, caso.id).toBeUndefined();
        expect(caso.historico, caso.id).toBeUndefined();
      }
    }
  });

  it("caso de confiança média explica o que o dono deve conferir", () => {
    for (const caso of CASOS.filter((c) => c.confianca === "media")) {
      expect(caso.duvida, caso.id).toBeTruthy();
    }
  });

  it("cobre as quatro categorias da triagem", () => {
    const categorias = new Set(CASOS.map((c) => c.categoria));
    expect(categorias).toEqual(
      new Set(["diagnostico", "procedimento", "especificacao", "conversa"]),
    );
  });
});
