import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";

import { getServerEnv } from "@/server/config/env";
import { resolverModelo } from "@/server/ai/modelos";
import { criarModelo, modelosDisponiveis, seletorLigado } from "@/server/ai/provider";
import { UnsupportedAttachmentError, prepareModelMessages } from "@/server/ai/messages";
import { buildSystemPrompt } from "@/server/ai/prompt";
import { chatRequestSchema, formatValidationError } from "@/server/ai/schema";
import { detectSistema } from "@/server/ai/sistema";
import { chatTools } from "@/server/ai/tools";

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return jsonError("Corpo da requisição não é JSON válido.", 400);
        }

        const parsed = chatRequestSchema.safeParse(payload);
        if (!parsed.success) {
          return jsonError(formatValidationError(parsed.error), 400);
        }

        const { messages, vehicle, events, modelo: modeloPedido } = parsed.data;

        try {
          const env = getServerEnv();
          const ligado = seletorLigado(env);
          const modeloId = resolverModelo(modeloPedido, {
            seletorLigado: ligado,
            permitidos: ligado ? await modelosDisponiveis(env) : [],
          });
          const inicio = Date.now();

          const prepared = await prepareModelMessages(messages as UIMessage[]);
          const sistemaEmFoco = detectSistema(messages as UIMessage[]);

          const result = streamText({
            model: criarModelo(modeloId, env),
            system: buildSystemPrompt({ vehicle, events, sistemaEmFoco }),
            messages: await convertToModelMessages(prepared),
            tools: chatTools,
            // Permite ao modelo continuar a resposta depois que o cliente
            // devolve o resultado do registro, em vez de parar na chamada.
            stopWhen: stepCountIs(4),
          });

          return result.toUIMessageStreamResponse({
            originalMessages: messages as UIMessage[],
            // Medição do benchmark: só com o seletor ligado. Mede este pedido —
            // quando o cliente devolve resultado de ferramenta, a continuação é
            // outro pedido e a medição da mensagem passa a ser a dele.
            messageMetadata: ligado
              ? ({ part }) =>
                  part.type === "finish"
                    ? {
                        modelo: modeloId,
                        duracaoMs: Date.now() - inicio,
                        tokensEntrada: part.totalUsage.inputTokens ?? 0,
                        tokensSaida: part.totalUsage.outputTokens ?? 0,
                        tokensRaciocinio: part.totalUsage.outputTokenDetails?.reasoningTokens,
                      }
                    : undefined
              : undefined,
          });
        } catch (error) {
          if (error instanceof UnsupportedAttachmentError) {
            return jsonError(error.message, 400);
          }

          console.error("[api/chat] falha ao responder", error);
          return jsonError(
            error instanceof Error ? error.message : "Erro inesperado na API de chat.",
            500,
          );
        }
      },
    },
  },
});
