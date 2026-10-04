import {
  generateText,
  stepCountIs,
  type LanguageModel,
  type ModelMessage,
  type UIMessage,
} from "ai";

import type { VehicleEvent } from "@/features/garage/events";
import { buildSystemPrompt } from "@/server/ai/prompt";
import { detectSistema } from "@/server/ai/sistema";
import { chatTools } from "@/server/ai/tools";

import type { Caso } from "./casos";
import type { ChamadaFerramenta, Turno } from "./verificacao";

// Conduz um caso contra um modelo do mesmo jeito que o app conduz uma conversa:
// mesmo prompt, mesma ficha, mesmo histórico, mesmas ferramentas. As duas
// ferramentas são de cliente (sem execute); aqui, como no navegador, cada
// chamada recebe { ok: true } e a conversa segue numa nova ida ao modelo.

const DIA_MS = 24 * 60 * 60 * 1000;

/** Teto de idas ao modelo por fala. Um modelo em laço de ferramenta não pode travar a bateria. */
export const MAX_RODADAS_POR_FALA = 6;

export function historicoDoCaso(caso: Caso, agora: number): VehicleEvent[] {
  return (caso.historico ?? []).map((e, i) => ({
    id: `historico-${i}`,
    tipo: e.tipo,
    titulo: e.titulo,
    sistema: e.sistema,
    desfecho: e.desfecho,
    data: agora - e.diasAtras * DIA_MS,
    origem: "usuario",
    criadoEm: agora - e.diasAtras * DIA_MS,
  }));
}

function respostaDoCliente(nome: string, n: number) {
  return nome === "registrarEvento" ? { ok: true, id: `evento-${n}` } : { ok: true };
}

export async function conduzirCaso(
  caso: Caso,
  modelo: LanguageModel,
  opcoes: { agora?: number; maxRodadas?: number } = {},
): Promise<Turno[]> {
  const agora = opcoes.agora ?? Date.now();
  const maxRodadas = opcoes.maxRodadas ?? MAX_RODADAS_POR_FALA;
  const eventos = historicoDoCaso(caso, agora);

  const mensagens: ModelMessage[] = [];
  // Só para detectar o sistema em foco, como o servidor faz com as UIMessages.
  const ui: UIMessage[] = [];
  const turnos: Turno[] = [];
  let registros = 0;

  for (const [i, fala] of caso.falas.entries()) {
    mensagens.push({ role: "user", content: fala });
    ui.push({ id: `u${i}`, role: "user", parts: [{ type: "text", text: fala }] });

    const turno: Turno = {
      fala,
      resposta: "",
      ferramentas: [],
      rodadas: 0,
      estourouRodadas: false,
      duracaoMs: 0,
      tokensEntrada: 0,
      tokensSaida: 0,
      tokensRaciocinio: 0,
    };
    const inicio = Date.now();

    try {
      for (;;) {
        if (turno.rodadas >= maxRodadas) {
          turno.estourouRodadas = true;
          break;
        }
        turno.rodadas++;

        const resultado = await generateText({
          model: modelo,
          system: buildSystemPrompt({
            vehicle: caso.veiculo,
            events: eventos,
            sistemaEmFoco: detectSistema(ui),
          }),
          messages: mensagens,
          tools: chatTools,
          stopWhen: stepCountIs(4),
        });

        mensagens.push(...resultado.response.messages);
        if (resultado.text.trim()) {
          turno.resposta = turno.resposta
            ? `${turno.resposta}\n\n${resultado.text}`
            : resultado.text;
        }
        turno.tokensEntrada += resultado.totalUsage.inputTokens ?? 0;
        turno.tokensSaida += resultado.totalUsage.outputTokens ?? 0;
        turno.tokensRaciocinio += resultado.totalUsage.outputTokenDetails?.reasoningTokens ?? 0;

        const chamadas: ChamadaFerramenta[] = resultado.steps.flatMap((s) =>
          s.toolCalls.map((c) => ({ nome: c.toolName, entrada: c.input })),
        );
        turno.ferramentas.push(...chamadas);

        if (resultado.finishReason !== "tool-calls") break;

        mensagens.push({
          role: "tool",
          content: resultado.toolCalls.map((c) => ({
            type: "tool-result" as const,
            toolCallId: c.toolCallId,
            toolName: c.toolName,
            output: {
              type: "json" as const,
              value: respostaDoCliente(
                c.toolName,
                c.toolName === "registrarEvento" ? ++registros : 0,
              ),
            },
          })),
        });
      }
    } catch (error) {
      turno.erro = error instanceof Error ? error.message : String(error);
    }

    turno.duracaoMs = Date.now() - inicio;
    turnos.push(turno);
    ui.push({ id: `a${i}`, role: "assistant", parts: [{ type: "text", text: turno.resposta }] });

    // Sem a resposta desta fala, as próximas não fazem sentido: o caso para aqui.
    if (turno.erro) break;
  }

  return turnos;
}
