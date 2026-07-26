import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";

import {
  HIPOTESES_TOOL_NAME,
  MAX_HIPOTESES,
  contarVivas,
  extractEstadoDiagnostico,
  normalizeEstado,
  normalizeHipotese,
  ordenarHipoteses,
  type Hipotese,
} from "./hipoteses";

function hip(overrides: Partial<Hipotese> = {}): Hipotese {
  return { nome: "Bobina fraca", peso: 50, status: "viva", ...overrides };
}

function toolMsg(input: unknown): UIMessage {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    parts: [{ type: `tool-${HIPOTESES_TOOL_NAME}`, input } as never],
  };
}

function textMsg(text: string): UIMessage {
  return { id: crypto.randomUUID(), role: "assistant", parts: [{ type: "text", text }] };
}

describe("ordenarHipoteses", () => {
  it("põe confirmada primeiro, descartada por último", () => {
    const ordenadas = ordenarHipoteses([
      hip({ nome: "descartada", status: "descartada", peso: 90 }),
      hip({ nome: "viva", status: "viva", peso: 10 }),
      hip({ nome: "confirmada", status: "confirmada", peso: 5 }),
    ]);
    expect(ordenadas.map((h) => h.nome)).toEqual(["confirmada", "viva", "descartada"]);
  });

  it("ordena vivas por peso decrescente", () => {
    const ordenadas = ordenarHipoteses([
      hip({ nome: "baixa", peso: 20 }),
      hip({ nome: "alta", peso: 80 }),
    ]);
    expect(ordenadas.map((h) => h.nome)).toEqual(["alta", "baixa"]);
  });

  it("não muta a entrada", () => {
    const lista = [hip({ nome: "a", peso: 10 }), hip({ nome: "b", peso: 90 })];
    ordenarHipoteses(lista);
    expect(lista[0].nome).toBe("a");
  });
});

describe("normalizeHipotese", () => {
  it("rejeita entrada sem nome", () => {
    expect(normalizeHipotese({ peso: 50 })).toBeNull();
    expect(normalizeHipotese({ nome: "   " })).toBeNull();
    expect(normalizeHipotese(null)).toBeNull();
  });

  it("limita o peso entre 0 e 100", () => {
    expect(normalizeHipotese({ nome: "x", peso: 150 })?.peso).toBe(100);
    expect(normalizeHipotese({ nome: "x", peso: -20 })?.peso).toBe(0);
    expect(normalizeHipotese({ nome: "x", peso: "muito" })?.peso).toBe(0);
  });

  it("assume viva para status desconhecido", () => {
    expect(normalizeHipotese({ nome: "x", status: "sei-la" })?.status).toBe("viva");
  });

  it("preserva o falseamento", () => {
    const h = normalizeHipotese({
      nome: "Bobina fraca",
      comoRefutar: "faísca continua forte com o motor quente",
    });
    expect(h?.comoRefutar).toBe("faísca continua forte com o motor quente");
  });

  it("só guarda motivo de descarte quando descartada", () => {
    expect(
      normalizeHipotese({ nome: "x", status: "viva", motivoDescarte: "..." })?.motivoDescarte,
    ).toBeUndefined();
    expect(
      normalizeHipotese({ nome: "x", status: "descartada", motivoDescarte: "testou e passou" })
        ?.motivoDescarte,
    ).toBe("testou e passou");
  });
});

describe("normalizeEstado", () => {
  it("retorna null sem hipóteses aproveitáveis", () => {
    expect(normalizeEstado({ hipoteses: [] })).toBeNull();
    expect(normalizeEstado({ hipoteses: [{ semNome: true }] })).toBeNull();
    expect(normalizeEstado("lixo")).toBeNull();
  });

  it("limita a quantidade de hipóteses", () => {
    const estado = normalizeEstado({
      hipoteses: Array.from({ length: 20 }, (_, i) => ({ nome: `h${i}`, peso: i })),
    });
    expect(estado?.hipoteses).toHaveLength(MAX_HIPOTESES);
  });

  it("já devolve ordenado", () => {
    const estado = normalizeEstado({
      hipoteses: [
        { nome: "fraca", peso: 10 },
        { nome: "forte", peso: 90 },
      ],
    });
    expect(estado?.hipoteses[0].nome).toBe("forte");
  });
});

describe("extractEstadoDiagnostico", () => {
  it("retorna null quando não houve chamada da ferramenta", () => {
    expect(extractEstadoDiagnostico([textMsg("oi")])).toBeNull();
    expect(extractEstadoDiagnostico([])).toBeNull();
  });

  it("usa a chamada mais recente", () => {
    const messages = [
      toolMsg({ hipoteses: [{ nome: "antiga", peso: 50 }] }),
      textMsg("investigando"),
      toolMsg({ hipoteses: [{ nome: "nova", peso: 70 }] }),
    ];
    expect(extractEstadoDiagnostico(messages)?.hipoteses[0].nome).toBe("nova");
  });

  it("ignora chamada inválida e cai na anterior válida", () => {
    const messages = [
      toolMsg({ hipoteses: [{ nome: "válida", peso: 50 }] }),
      toolMsg({ hipoteses: [] }),
    ];
    expect(extractEstadoDiagnostico(messages)?.hipoteses[0].nome).toBe("válida");
  });

  it("preserva o sintoma", () => {
    const messages = [
      toolMsg({ sintoma: "falha em alta rotação", hipoteses: [{ nome: "Bobina", peso: 60 }] }),
    ];
    expect(extractEstadoDiagnostico(messages)?.sintoma).toBe("falha em alta rotação");
  });
});

describe("contarVivas", () => {
  it("conta só as vivas", () => {
    const estado = normalizeEstado({
      hipoteses: [
        { nome: "a", status: "viva" },
        { nome: "b", status: "descartada" },
        { nome: "c", status: "viva" },
        { nome: "d", status: "confirmada" },
      ],
    });
    expect(contarVivas(estado)).toBe(2);
  });

  it("é zero sem estado", () => {
    expect(contarVivas(null)).toBe(0);
  });
});
