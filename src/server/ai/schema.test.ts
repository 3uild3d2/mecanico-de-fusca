import { describe, expect, it } from "vitest";

import { MAX_EVENTS_PER_REQUEST, chatRequestSchema } from "./schema";

function evento(i: number) {
  return {
    id: `e${i}`,
    tipo: "servico" as const,
    titulo: `Serviço ${i}`,
    data: 1_790_000_000_000 - i,
    origem: "agente" as const,
    criadoEm: 1_790_000_000_000 - i,
  };
}

function pedido(qtdEventos: number) {
  return {
    messages: [{ role: "user", parts: [{ type: "text", text: "Meu fusca falha" }] }],
    vehicle: null,
    events: Array.from({ length: qtdEventos }, (_, i) => evento(i)),
  };
}

describe("chatRequestSchema — teto de eventos", () => {
  // Regressão: o teto era 60 e o cliente envia o histórico inteiro do carro.
  // Como o agente registra eventos sozinho, todo usuário ativo passava de 60 e,
  // a partir daí, toda mensagem era recusada com 400.
  it("aceita um histórico bem acima do antigo teto de 60", () => {
    expect(chatRequestSchema.safeParse(pedido(61)).success).toBe(true);
    expect(chatRequestSchema.safeParse(pedido(500)).success).toBe(true);
  });

  it("continua recusando acima do teto — é defesa contra abuso, não recorte de contexto", () => {
    expect(chatRequestSchema.safeParse(pedido(MAX_EVENTS_PER_REQUEST)).success).toBe(true);
    expect(chatRequestSchema.safeParse(pedido(MAX_EVENTS_PER_REQUEST + 1)).success).toBe(false);
  });
});
