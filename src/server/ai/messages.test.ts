import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UIMessage } from "ai";

import { AUDIO_NOTE, TRIMMED_ATTACHMENT_NOTE } from "./prompt";
import {
  ATTACHMENT_WINDOW_MESSAGES,
  MAX_HISTORY_MESSAGES,
  UnsupportedAttachmentError,
  applyHistoryWindow,
  assertSupportedMediaType,
  clearAttachmentCache,
  fetchAsDataUrl,
  getAttachmentCacheStats,
  prepareModelMessages,
  stripAttachmentsOutsideWindow,
} from "./messages";

function msg(text: string, files: string[] = []): UIMessage {
  return {
    id: crypto.randomUUID(),
    role: "user",
    parts: [
      { type: "text", text },
      ...files.map((url) => ({ type: "file" as const, url, mediaType: "image/png" })),
    ],
  };
}

function okResponse(body = "imagem", contentType = "image/png") {
  return new Response(body, { status: 200, headers: { "content-type": contentType } });
}

beforeEach(() => {
  clearAttachmentCache();
});

describe("assertSupportedMediaType", () => {
  it("aceita imagem e áudio", () => {
    expect(() => assertSupportedMediaType("image/png")).not.toThrow();
    expect(() => assertSupportedMediaType("audio/webm")).not.toThrow();
  });

  it("recusa vídeo", () => {
    expect(() => assertSupportedMediaType("video/mp4")).toThrow(UnsupportedAttachmentError);
  });

  it("recusa outros tipos", () => {
    expect(() => assertSupportedMediaType("application/pdf")).toThrow(UnsupportedAttachmentError);
  });

  it("deixa passar quando o tipo não foi informado", () => {
    expect(() => assertSupportedMediaType(undefined)).not.toThrow();
  });
});

describe("applyHistoryWindow", () => {
  it("mantém a lista quando cabe na janela", () => {
    const items = [1, 2, 3];
    expect(applyHistoryWindow(items, 10)).toBe(items);
  });

  it("mantém as mensagens mais recentes", () => {
    expect(applyHistoryWindow([1, 2, 3, 4, 5], 2)).toEqual([4, 5]);
  });

  it("usa MAX_HISTORY_MESSAGES por padrão", () => {
    const items = Array.from({ length: MAX_HISTORY_MESSAGES + 10 }, (_, i) => i);
    expect(applyHistoryWindow(items)).toHaveLength(MAX_HISTORY_MESSAGES);
  });
});

describe("stripAttachmentsOutsideWindow", () => {
  it("troca anexos antigos por nota de texto", () => {
    const messages = [
      msg("antiga", ["https://storage/a.png"]),
      msg("m2"),
      msg("m3"),
      msg("m4"),
      msg("recente", ["https://storage/b.png"]),
    ];

    const result = stripAttachmentsOutsideWindow(messages, ATTACHMENT_WINDOW_MESSAGES);

    expect(result[0].parts).toEqual([
      { type: "text", text: "antiga" },
      { type: "text", text: TRIMMED_ATTACHMENT_NOTE },
    ]);
    // A mais recente mantém o anexo intacto.
    expect(result[4].parts.some((p) => p.type === "file")).toBe(true);
  });

  it("não altera nada quando tudo cabe na janela", () => {
    const messages = [msg("a", ["https://storage/a.png"]), msg("b")];
    expect(stripAttachmentsOutsideWindow(messages, 4)).toBe(messages);
  });

  it("preserva mensagens antigas sem anexo por referência", () => {
    const messages = [msg("sem anexo"), msg("b"), msg("c"), msg("d"), msg("e")];
    const result = stripAttachmentsOutsideWindow(messages, 2);
    expect(result[0]).toBe(messages[0]);
  });
});

describe("fetchAsDataUrl", () => {
  it("converte a resposta em data URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse("abc", "image/png"));
    const url = await fetchAsDataUrl("https://storage/a.png", undefined, fetchImpl);
    expect(url).toBe(`data:image/png;base64,${Buffer.from("abc").toString("base64")}`);
  });

  it("serve do cache na segunda chamada", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse());

    await fetchAsDataUrl("https://storage/a.png", undefined, fetchImpl);
    await fetchAsDataUrl("https://storage/a.png", undefined, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(getAttachmentCacheStats().entries).toBe(1);
  });

  it("propaga erro de HTTP", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("nope", { status: 404 }));
    await expect(fetchAsDataUrl("https://storage/a.png", undefined, fetchImpl)).rejects.toThrow(
      "HTTP 404",
    );
  });

  it("recusa vídeo mesmo quando o cliente declarou imagem", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse("x", "video/mp4"));
    await expect(fetchAsDataUrl("https://storage/a.mp4", "image/png", fetchImpl)).rejects.toThrow(
      UnsupportedAttachmentError,
    );
  });

  it("não cacheia o que falhou", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("nope", { status: 500 }));
    await expect(fetchAsDataUrl("https://storage/a.png", undefined, fetchImpl)).rejects.toThrow();
    expect(getAttachmentCacheStats().entries).toBe(0);
  });
});

describe("prepareModelMessages", () => {
  it("não rebaixa anexos antigos — a correção do custo", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse());
    const messages = [
      msg("m1", ["https://storage/1.png"]),
      msg("m2", ["https://storage/2.png"]),
      msg("m3"),
      msg("m4"),
      msg("m5"),
      msg("m6", ["https://storage/6.png"]),
    ];

    await prepareModelMessages(messages, fetchImpl);

    // Só o anexo dentro da janela é baixado; os dois antigos viram nota.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith("https://storage/6.png");
  });

  it("embute anexos remotos recentes", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse("abc"));
    const [result] = await prepareModelMessages(
      [msg("veja", ["https://storage/a.png"])],
      fetchImpl,
    );

    const filePart = result.parts.find((p) => p.type === "file");
    expect(filePart).toMatchObject({ url: expect.stringContaining("data:image/png;base64,") });
  });

  it("deixa data URLs como estão", async () => {
    const fetchImpl = vi.fn();
    const messages: UIMessage[] = [
      {
        id: "1",
        role: "user",
        parts: [{ type: "file", url: "data:image/png;base64,AAAA", mediaType: "image/png" }],
      },
    ];

    const [result] = await prepareModelMessages(messages, fetchImpl);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.parts[0]).toMatchObject({ url: "data:image/png;base64,AAAA" });
  });

  it("aplica a janela de histórico", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse());
    const messages = Array.from({ length: MAX_HISTORY_MESSAGES + 5 }, (_, i) => msg(`m${i}`));

    const result = await prepareModelMessages(messages, fetchImpl);

    expect(result).toHaveLength(MAX_HISTORY_MESSAGES);
  });

  it("reaproveita o cache entre requisições da mesma conversa", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse());
    const conversation = [msg("veja", ["https://storage/a.png"])];

    await prepareModelMessages(conversation, fetchImpl);
    await prepareModelMessages([...conversation, msg("e agora?")], fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("áudio não vai para o modelo", () => {
  it("troca o áudio pela nota e não baixa o arquivo — o modelo de texto não ouve", async () => {
    const fetchSpy = vi.fn();
    const mensagens: UIMessage[] = [
      {
        id: "m1",
        role: "user",
        parts: [
          { type: "file", url: "https://storage/a.webm", mediaType: "audio/webm" },
          { type: "text", text: "Transcrição do áudio: o motor falha" },
        ],
      },
    ];

    const [m] = await prepareModelMessages(mensagens, fetchSpy);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(m?.parts).toEqual([
      { type: "text", text: AUDIO_NOTE },
      { type: "text", text: "Transcrição do áudio: o motor falha" },
    ]);
  });
});
