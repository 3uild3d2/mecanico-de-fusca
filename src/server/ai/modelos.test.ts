import { describe, expect, it } from "vitest";

import { MODELO_PADRAO, filtrarModelosDeChat, parseModeloId, resolverModelo } from "./modelos";

describe("parseModeloId", () => {
  it("separa fornecedor e modelo", () => {
    expect(parseModeloId("openai:gpt-x-mini")).toEqual({
      fornecedor: "openai",
      modelo: "gpt-x-mini",
    });
    expect(parseModeloId("google:gemini-x")?.fornecedor).toBe("google");
    expect(parseModeloId(MODELO_PADRAO)).not.toBeNull();
  });

  it("recusa fornecedor desconhecido, modelo vazio ou caractere estranho", () => {
    expect(parseModeloId("anthropic:qualquer")).toBeNull();
    expect(parseModeloId("openai:")).toBeNull();
    expect(parseModeloId("sem-fornecedor")).toBeNull();
    expect(parseModeloId("openai:gpt x")).toBeNull();
    expect(parseModeloId("openai:../segredo")).toBeNull();
  });
});

describe("filtrarModelosDeChat", () => {
  it("fica só com modelos de conversa, sem snapshots datados", () => {
    const ids = [
      "gpt-x",
      "gpt-x-mini",
      "o9",
      "gpt-x-2026-05-13",
      "gpt-x-audio-preview",
      "gpt-x-realtime",
      "gpt-x-transcribe",
      "gpt-image-1",
      "text-embedding-3-large",
      "gpt-x-search-preview",
      "tts-1",
      "whisper-1",
      "dall-e-3",
      "omni-moderation-latest",
      "gpt-x-codex",
      "o9-deep-research",
      "davinci-002",
    ];
    expect(filtrarModelosDeChat(ids)).toEqual(["gpt-x", "gpt-x-mini", "o9"]);
  });

  // Casos reais vistos na lista da conta em 2026-10-04 (nomes trocados).
  it("tira snapshot de 4 dígitos, legados, voz, -pro e aliases do ChatGPT", () => {
    const ids = [
      "gpt-4o",
      "gpt-4.1",
      "gpt-x",
      "gpt-x-0125",
      "gpt-x-16k",
      "gpt-live-1",
      "gpt-x-pro",
      "gpt-x-chat-latest",
      "gpt-3.5-turbo",
      "gpt-4",
      "gpt-4-turbo",
      "o9-pro",
    ];
    expect(filtrarModelosDeChat(ids)).toEqual(["gpt-4.1", "gpt-4o", "gpt-x"]);
  });

  // Conta real em 2026-10-04: o projeto só tinha acesso ao snapshot datado do
  // gpt-4o, sem o alias. Escondê-lo deixava o modelo inacessível no seletor.
  it("mantém o snapshot datado quando o alias não está disponível", () => {
    expect(filtrarModelosDeChat(["gpt-x-2026-05-13", "gpt-x-mini"])).toEqual([
      "gpt-x-2026-05-13",
      "gpt-x-mini",
    ]);
  });

  it("entre vários snapshots sem alias, fica só o mais recente", () => {
    expect(filtrarModelosDeChat(["gpt-x-2025-01-01", "gpt-x-2026-05-13"])).toEqual([
      "gpt-x-2026-05-13",
    ]);
  });

  it("remove duplicados e ordena", () => {
    expect(filtrarModelosDeChat(["o9", "gpt-x", "o9"])).toEqual(["gpt-x", "o9"]);
  });
});

describe("resolverModelo — o servidor é a autoridade", () => {
  const permitidos = [MODELO_PADRAO, "openai:gpt-x"];

  it("com o seletor desligado, ignora o pedido do cliente", () => {
    expect(resolverModelo("openai:gpt-x", { seletorLigado: false, permitidos })).toBe(
      MODELO_PADRAO,
    );
  });

  it("com o seletor ligado, aceita só o que está na lista", () => {
    expect(resolverModelo("openai:gpt-x", { seletorLigado: true, permitidos })).toBe(
      "openai:gpt-x",
    );
    expect(resolverModelo("openai:o9-pro", { seletorLigado: true, permitidos })).toBe(
      MODELO_PADRAO,
    );
  });

  it("sem pedido, usa o padrão", () => {
    expect(resolverModelo(undefined, { seletorLigado: true, permitidos })).toBe(MODELO_PADRAO);
  });
});
