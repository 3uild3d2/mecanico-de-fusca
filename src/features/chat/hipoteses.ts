import type { UIMessage } from "ai";

// Estado do raciocínio diagnóstico — lógica pura, sem I/O.
//
// Decisão central: o estado NÃO tem armazenamento próprio. Ele é derivado das
// chamadas da ferramenta `atualizarHipoteses` que já vivem nas partes das
// mensagens. Consequências, todas boas:
//
// - persiste junto com a thread, sem tabela nem coleção nova;
// - sobrevive a recarregar a página e volta ao abrir uma conversa antiga;
// - o histórico do raciocínio fica auditável: dá para ver como as hipóteses
//   evoluíram ao longo da conversa, não só onde pararam.
//
// O campo `comoRefutar` é o que torna o falseamento visível ao usuário. É o
// diferencial do painel: não mostra só no que o agente acredita, mostra o que
// derrubaria cada crença.

export const HIPOTESES_TOOL_NAME = "atualizarHipoteses";

export type StatusHipotese = "viva" | "descartada" | "confirmada";

export type Hipotese = {
  nome: string;
  /** 0 a 100. Peso relativo, não probabilidade calibrada. */
  peso: number;
  status: StatusHipotese;
  /** Por que é plausível neste carro. */
  porque?: string;
  /** O que provaria que NÃO é isso. O falseamento, visível. */
  comoRefutar?: string;
  /** Preenchido quando status = descartada. */
  motivoDescarte?: string;
};

export type EstadoDiagnostico = {
  sintoma?: string;
  hipoteses: Hipotese[];
};

export const MAX_HIPOTESES = 6;

/** Ordena: vivas primeiro (por peso), depois confirmadas, descartadas ao fim. */
const PESO_STATUS: Record<StatusHipotese, number> = {
  confirmada: 0,
  viva: 1,
  descartada: 2,
};

export function ordenarHipoteses(hipoteses: Hipotese[]): Hipotese[] {
  return [...hipoteses].sort((a, b) => {
    const porStatus = PESO_STATUS[a.status] - PESO_STATUS[b.status];
    return porStatus !== 0 ? porStatus : b.peso - a.peso;
  });
}

function clampPeso(valor: unknown): number {
  const numero = typeof valor === "number" && Number.isFinite(valor) ? valor : 0;
  return Math.min(100, Math.max(0, Math.round(numero)));
}

function normalizeTexto(valor: unknown): string | undefined {
  if (typeof valor !== "string") return undefined;
  const limpo = valor.replace(/\s+/g, " ").trim();
  return limpo.length > 0 ? limpo : undefined;
}

/** Aceita a entrada crua da ferramenta e devolve algo confiável para a UI. */
export function normalizeHipotese(entrada: unknown): Hipotese | null {
  if (entrada == null || typeof entrada !== "object") return null;

  const bruta = entrada as Record<string, unknown>;
  const nome = normalizeTexto(bruta.nome);
  if (!nome) return null;

  const status: StatusHipotese =
    bruta.status === "descartada" || bruta.status === "confirmada" ? bruta.status : "viva";

  return {
    nome,
    peso: clampPeso(bruta.peso),
    status,
    porque: normalizeTexto(bruta.porque),
    comoRefutar: normalizeTexto(bruta.comoRefutar),
    motivoDescarte: status === "descartada" ? normalizeTexto(bruta.motivoDescarte) : undefined,
  };
}

export function normalizeEstado(entrada: unknown): EstadoDiagnostico | null {
  if (entrada == null || typeof entrada !== "object") return null;

  const bruta = entrada as Record<string, unknown>;
  const lista = Array.isArray(bruta.hipoteses) ? bruta.hipoteses : [];

  const hipoteses = lista
    .map(normalizeHipotese)
    .filter((h): h is Hipotese => h !== null)
    .slice(0, MAX_HIPOTESES);

  if (hipoteses.length === 0) return null;

  return {
    sintoma: normalizeTexto(bruta.sintoma),
    hipoteses: ordenarHipoteses(hipoteses),
  };
}

type ToolPart = { type: string; input?: unknown };

function isHipotesesToolPart(part: unknown): part is ToolPart {
  if (part == null || typeof part !== "object") return false;
  const tipo = (part as { type?: unknown }).type;
  // O AI SDK nomeia a parte como `tool-<nome>`.
  return typeof tipo === "string" && tipo === `tool-${HIPOTESES_TOOL_NAME}`;
}

/**
 * Extrai o estado mais recente varrendo as mensagens de trás para frente.
 * A última chamada vence — o agente reescreve a lista inteira a cada atualização,
 * em vez de mandar diffs, que seriam frágeis de reconciliar.
 */
export function extractEstadoDiagnostico(messages: UIMessage[]): EstadoDiagnostico | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const partes = messages[i].parts;

    for (let j = partes.length - 1; j >= 0; j -= 1) {
      const parte = partes[j];
      if (!isHipotesesToolPart(parte)) continue;

      const estado = normalizeEstado(parte.input);
      if (estado) return estado;
    }
  }

  return null;
}

export function contarVivas(estado: EstadoDiagnostico | null): number {
  return estado?.hipoteses.filter((h) => h.status === "viva").length ?? 0;
}
