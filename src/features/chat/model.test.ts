import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";

import {
  NEW_THREAD_TITLE,
  deriveTitle,
  getMessageText,
  knownTopicTitle,
  nextThreadTitle,
  normalizeManualTitle,
  sanitizeMessages,
} from "./model";

function userMsg(text: string): UIMessage {
  return { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text }] };
}

function assistantMsg(text: string): UIMessage {
  return { id: crypto.randomUUID(), role: "assistant", parts: [{ type: "text", text }] };
}

describe("getMessageText", () => {
  it("junta apenas as partes de texto", () => {
    const message: UIMessage = {
      id: "1",
      role: "user",
      parts: [
        { type: "text", text: "olha" },
        { type: "file", url: "https://x/y.png", mediaType: "image/png" },
        { type: "text", text: "essa foto" },
      ],
    };
    expect(getMessageText(message)).toBe("olha  essa foto");
  });

  it("retorna string vazia quando não há texto", () => {
    const message: UIMessage = {
      id: "1",
      role: "user",
      parts: [{ type: "file", url: "https://x/y.png", mediaType: "image/png" }],
    };
    expect(getMessageText(message)).toBe("");
  });
});

describe("knownTopicTitle", () => {
  it.each([
    ["meu fusca está esquentando demais", "Superaquecimento Motor"],
    ["como faço a regulagem das válvulas", "Regulagem Válvulas"],
    ["ouvi um barulho nas valvulas", "Válvulas Motor"],
    ["difícil dar partida de manhã", "Partida Fria"],
    ["não quer dar partida", "Partida Motor"],
    ["qual o ponto de ignição ideal", "Ponto Ignição"],
    ["preciso regular o carburador", "Regulagem Carburador"],
    ["que carburador usar", "Carburador Fusca"],
    ["o freio está falhando", "Freios Fusca"],
    ["saindo fumaça azul", "Fumaça Motor"],
    ["o dínamo não carrega", "Elétrica Fusca"],
    ["está gastando muita gasolina", "Consumo Combustível"],
  ])("classifica %j como %j", (text, expected) => {
    expect(knownTopicTitle(text)).toBe(expected);
  });

  it("ignora acento e caixa ao classificar", () => {
    expect(knownTopicTitle("SUPERAQUECENDO")).toBe("Superaquecimento Motor");
    expect(knownTopicTitle("válvula")).toBe("Válvulas Motor");
  });

  it("retorna null para assunto desconhecido", () => {
    expect(knownTopicTitle("qual a cor original da tinta")).toBeNull();
  });
});

describe("deriveTitle", () => {
  it("não nomeia a conversa antes da resposta do assistente", () => {
    expect(deriveTitle([userMsg("meu fusca está esquentando")])).toBeNull();
  });

  it("não nomeia quando o assistente respondeu vazio", () => {
    expect(deriveTitle([userMsg("está esquentando"), assistantMsg("")])).toBeNull();
  });

  it("usa o tópico conhecido quando houver", () => {
    expect(deriveTitle([userMsg("meu fusca está esquentando"), assistantMsg("Vamos ver.")])).toBe(
      "Superaquecimento Motor",
    );
  });

  it("cai para palavras-chave quando o tópico é desconhecido", () => {
    expect(
      deriveTitle([userMsg("qual a cor original da tinta"), assistantMsg("Depende do ano.")]),
    ).toBe("Cor Original Tinta");
  });

  it("completa com 'Fusca' quando sobra uma palavra só", () => {
    expect(deriveTitle([userMsg("estribo"), assistantMsg("Certo.")])).toBe("Estribo Fusca");
  });

  it("descarta stopwords e palavras curtas", () => {
    expect(deriveTitle([userMsg("o de um na"), assistantMsg("Certo.")])).toBeNull();
  });

  it("não repete a mesma palavra", () => {
    expect(deriveTitle([userMsg("tinta tinta tinta capô"), assistantMsg("Certo.")])).toBe(
      "Tinta Capô",
    );
  });

  it("ignora mensagens do assistente ao montar o título", () => {
    const title = deriveTitle([
      userMsg("estribo"),
      assistantMsg("superaquecimento válvulas carburador"),
    ]);
    expect(title).toBe("Estribo Fusca");
  });
});

describe("normalizeManualTitle", () => {
  it("colapsa espaços em excesso", () => {
    expect(normalizeManualTitle("  meu   fusca  ")).toBe("meu fusca");
  });

  it("volta ao padrão quando o título fica vazio", () => {
    expect(normalizeManualTitle("   ")).toBe(NEW_THREAD_TITLE);
  });

  it("trunca em 60 caracteres", () => {
    const result = normalizeManualTitle("a".repeat(120));
    expect(result).toHaveLength(60);
  });
});

describe("nextThreadTitle", () => {
  const messages = [userMsg("está esquentando"), assistantMsg("Vamos ver.")];

  it("deriva quando a thread ainda é nova", () => {
    expect(nextThreadTitle({ title: NEW_THREAD_TITLE, titleEdited: false }, messages)).toBe(
      "Superaquecimento Motor",
    );
  });

  it("preserva título editado manualmente", () => {
    expect(nextThreadTitle({ title: "Meu título", titleEdited: true }, messages)).toBe(
      "Meu título",
    );
  });

  it("preserva título já derivado antes", () => {
    expect(nextThreadTitle({ title: "Freios Fusca", titleEdited: false }, messages)).toBe(
      "Freios Fusca",
    );
  });
});

describe("sanitizeMessages", () => {
  it("remove anexos data: e blob: mas mantém os remotos", () => {
    const messages: UIMessage[] = [
      {
        id: "1",
        role: "user",
        parts: [
          { type: "text", text: "veja" },
          { type: "file", url: "data:image/png;base64,AAAA", mediaType: "image/png" },
          { type: "file", url: "blob:http://localhost/abc", mediaType: "audio/webm" },
          { type: "file", url: "https://storage/x.png", mediaType: "image/png" },
        ],
      },
    ];

    const [result] = sanitizeMessages(messages);

    expect(result.parts).toHaveLength(2);
    expect(result.parts.filter((p) => p.type === "file")).toEqual([
      { type: "file", url: "https://storage/x.png", mediaType: "image/png" },
    ]);
  });

  it("não muta a entrada", () => {
    const messages: UIMessage[] = [
      {
        id: "1",
        role: "user",
        parts: [{ type: "file", url: "data:image/png;base64,AA", mediaType: "image/png" }],
      },
    ];
    sanitizeMessages(messages);
    expect(messages[0].parts).toHaveLength(1);
  });
});
