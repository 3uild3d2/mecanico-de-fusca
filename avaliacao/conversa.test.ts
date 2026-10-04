import type { LanguageModelV3GenerateResult } from "@ai-sdk/provider";
import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";

import type { Caso } from "./casos";
import { conduzirCaso, historicoDoCaso } from "./conversa";
import { julgar, montarPromptJuiz } from "./juiz";

const USO = {
  inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 20, text: 20, reasoning: 0 },
};

function texto(t: string): LanguageModelV3GenerateResult {
  return {
    content: [{ type: "text", text: t }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: USO,
    warnings: [],
  };
}

function ferramenta(nome: string, entrada: object, id = "c1"): LanguageModelV3GenerateResult {
  return {
    content: [
      { type: "tool-call", toolCallId: id, toolName: nome, input: JSON.stringify(entrada) },
    ],
    finishReason: { unified: "tool-calls", raw: "tool_calls" },
    usage: USO,
    warnings: [],
  };
}

/**
 * Devolve as respostas em ordem. Não use a forma de array do MockLanguageModelV3:
 * no AI SDK 6.0.210 ele registra a chamada antes de indexar, então a primeira
 * chamada recebe o item 1 e o item 0 nunca é usado.
 */
function sequencia(...respostas: LanguageModelV3GenerateResult[]) {
  let i = 0;
  return async () => {
    const r = respostas[Math.min(i, respostas.length - 1)];
    i++;
    if (!r) throw new Error("sequência vazia");
    return r;
  };
}

// Precisa bater com o inputSchema real de atualizarHipoteses: entrada inválida
// vira tool-error e o SDK segue sozinho, sem parar como o navegador.
const HIPOTESES = {
  hipoteses: [
    { nome: "Bomba de aceleração", peso: 70, status: "viva", comoRefutar: "Esguicho forte" },
  ],
};

const CASO: Caso = {
  id: "teste",
  titulo: "Teste",
  categoria: "diagnostico",
  mede: "m",
  veiculo: { modelo: "Fusca", motor: "1300" },
  historico: [{ tipo: "servico", titulo: "Troca de velas", diasAtras: 10 }],
  falas: ["Meu Fusca falha.", "Falha só no pisão."],
  esperado: { causa: "x", criterios: ["k"], naoDeve: [], desfechosAceitos: ["suspeita"] },
  confianca: "alta",
  revisado: false,
};

describe("conduzirCaso", () => {
  it("responde à ferramenta como o navegador e segue até o texto", async () => {
    const modelo = new MockLanguageModelV3({
      doGenerate: sequencia(
        ferramenta("atualizarHipoteses", HIPOTESES),
        texto("Pergunta 1?"),
        ferramenta("atualizarHipoteses", HIPOTESES, "c2"),
        texto("Conclusão."),
      ),
    });

    const turnos = await conduzirCaso({ ...CASO }, modelo, { agora: 0 });

    expect(turnos).toHaveLength(2);
    expect(turnos[0]?.rodadas).toBe(2);
    expect(turnos[0]?.resposta).toBe("Pergunta 1?");
    expect(turnos[0]?.ferramentas.map((f) => f.nome)).toEqual(["atualizarHipoteses"]);
    expect(turnos[0]?.tokensEntrada).toBe(200);
    expect(turnos[1]?.resposta).toBe("Conclusão.");

    // A segunda ida ao modelo levou o resultado { ok: true }, como o navegador faz.
    const segunda = modelo.doGenerateCalls[1]?.prompt ?? [];
    const resultado = segunda.flatMap((m) => (m.role === "tool" ? m.content : []));
    expect(resultado).toEqual([
      expect.objectContaining({
        type: "tool-result",
        toolName: "atualizarHipoteses",
        output: { type: "json", value: { ok: true } },
      }),
    ]);
  });

  it("leva a ficha e o histórico do caso para o prompt de sistema", async () => {
    const modelo = new MockLanguageModelV3({ doGenerate: sequencia(texto("ok")) });
    await conduzirCaso({ ...CASO }, modelo, { agora: 0 });

    const sistema = modelo.doGenerateCalls[0]?.prompt.find((m) => m.role === "system");
    const conteudo = typeof sistema?.content === "string" ? sistema.content : "";
    expect(conteudo).toContain("1300");
    expect(conteudo).toContain("Troca de velas");
  });

  it("para o caso num laço de ferramenta, sem travar a bateria", async () => {
    const laco = Array.from({ length: 10 }, (_, i) =>
      ferramenta("atualizarHipoteses", HIPOTESES, `c${i}`),
    );
    const modelo = new MockLanguageModelV3({ doGenerate: sequencia(...laco) });

    const turnos = await conduzirCaso({ ...CASO, falas: ["Falha."] }, modelo, {
      agora: 0,
      maxRodadas: 3,
    });

    expect(turnos[0]?.rodadas).toBe(3);
    expect(turnos[0]?.estourouRodadas).toBe(true);
  });

  it("um erro interrompe o caso e fica registrado no turno", async () => {
    const modelo = new MockLanguageModelV3({
      doGenerate: async () => {
        throw new Error("HTTP 403");
      },
    });

    const turnos = await conduzirCaso({ ...CASO }, modelo, { agora: 0 });

    expect(turnos).toHaveLength(1);
    expect(turnos[0]?.erro).toContain("HTTP 403");
  });

  it("converte dias atrás do histórico em data", () => {
    const [evento] = historicoDoCaso(CASO, 100 * 24 * 60 * 60 * 1000);
    expect(evento?.data).toBe(90 * 24 * 60 * 60 * 1000);
  });
});

describe("juiz", () => {
  const turnos = [
    {
      fala: "Meu Fusca falha.",
      resposta: "Teste a bomba.",
      ferramentas: [{ nome: "atualizarHipoteses", entrada: HIPOTESES }],
      rodadas: 2,
      estourouRodadas: false,
      duracaoMs: 1,
      tokensEntrada: 1,
      tokensSaida: 1,
      tokensRaciocinio: 0,
    },
  ];

  it("o prompt traz caso, critérios e conversa — e nenhum nome de modelo", () => {
    const prompt = montarPromptJuiz(CASO, turnos);
    expect(prompt).toContain("Meu Fusca falha.");
    expect(prompt).toContain("Teste a bomba.");
    expect(prompt).toContain("atualizarHipoteses");
    expect(prompt).toContain("- k");
    expect(prompt).not.toMatch(/gpt|gemini|openai|google/i);
  });

  it("lê a avaliação estruturada e limita a nota entre 0 e 10", async () => {
    const resposta = {
      causa: "acertou",
      criterios: [{ criterio: "k", cumpriu: true, evidencia: "Teste a bomba." }],
      violacoes: [],
      inventouNumero: false,
      seguranca: "nao_se_aplica",
      nota: 14,
      justificativa: "Bom método.",
    };
    const juiz = new MockLanguageModelV3({ doGenerate: texto(JSON.stringify(resposta)) });

    const { avaliacao, tokensEntrada } = await julgar(CASO, turnos, juiz);

    expect(avaliacao.causa).toBe("acertou");
    expect(avaliacao.nota).toBe(10);
    expect(tokensEntrada).toBe(100);
  });
});
