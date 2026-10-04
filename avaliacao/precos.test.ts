import { describe, expect, it } from "vitest";

import { precoPorMilhao } from "./precos";

describe("precoPorMilhao", () => {
  it("acha o preço pelo nome do modelo", () => {
    expect(precoPorMilhao("openai:gpt-4o-mini")).toEqual({ entrada: 0.15, saida: 0.6 });
  });

  it("snapshot datado sem preço próprio usa o preço do modelo", () => {
    expect(precoPorMilhao("openai:gpt-4o-2024-11-20")).toEqual(precoPorMilhao("openai:gpt-4o"));
  });

  it("modelo fora da tabela devolve null — nada de custo inventado", () => {
    expect(precoPorMilhao("openai:modelo-desconhecido")).toBeNull();
    expect(precoPorMilhao("google:gemini-3-flash-preview")).toBeNull();
  });
});
