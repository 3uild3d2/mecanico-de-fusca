import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";

import { detectSistema, detectSistemaFromText } from "./sistema";

function userMsg(text: string): UIMessage {
  return { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text }] };
}

function assistantMsg(text: string): UIMessage {
  return { id: crypto.randomUUID(), role: "assistant", parts: [{ type: "text", text }] };
}

describe("detectSistemaFromText", () => {
  it.each([
    ["o motor está esquentando muito", "arrefecimento"],
    ["acho que a bobina está fraca", "ignicao"],
    ["o carburador está afogando", "carburacao"],
    ["o freio está baixando", "freios"],
    ["a embreagem está patinando", "cambio"],
    ["o amortecedor está batendo", "suspensao"],
    ["o dínamo não carrega a bateria", "eletrica"],
    ["está saindo fumaça azul", "motor"],
    ["preciso regular as válvulas", "motor"],
  ])("classifica %j como %j", (texto, esperado) => {
    expect(detectSistemaFromText(texto)).toBe(esperado);
  });

  it("ignora acento e caixa", () => {
    expect(detectSistemaFromText("SUPERAQUECENDO")).toBe("arrefecimento");
    expect(detectSistemaFromText("válvula")).toBe("motor");
  });

  it("prioriza arrefecimento sobre motor quando ambos casam", () => {
    // "motor esquentando" casa com as duas regras; a mais específica vence.
    expect(detectSistemaFromText("o motor está esquentando")).toBe("arrefecimento");
  });

  it("retorna undefined quando não reconhece", () => {
    expect(detectSistemaFromText("qual a cor original da tinta")).toBeUndefined();
  });
});

describe("detectSistema", () => {
  it("usa apenas mensagens do usuário", () => {
    const messages = [userMsg("qual a cor da tinta"), assistantMsg("a bobina pode falhar")];
    expect(detectSistema(messages)).toBeUndefined();
  });

  it("acompanha a mudança de assunto na conversa", () => {
    const messages = [
      userMsg("o freio está baixando"),
      assistantMsg("vamos ver"),
      userMsg("resolvi aquilo. agora o carburador está afogando"),
      assistantMsg("certo"),
      userMsg("sai muita gasolina pelo giclê"),
    ];
    expect(detectSistema(messages)).toBe("carburacao");
  });

  it("retorna undefined sem mensagens de usuário com texto", () => {
    expect(detectSistema([assistantMsg("olá")])).toBeUndefined();
    expect(detectSistema([])).toBeUndefined();
  });
});
