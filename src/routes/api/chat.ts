import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";

import { getServerEnv } from "@/server/config/env";
import { createGoogleAiStudioProvider } from "@/server/ai/provider";
import { UnsupportedAttachmentError, prepareModelMessages } from "@/server/ai/messages";
import { buildSystemPrompt } from "@/server/ai/prompt";
import { chatRequestSchema, formatValidationError } from "@/server/ai/schema";
import { detectSistema } from "@/server/ai/sistema";
import { chatTools } from "@/server/ai/tools";

const MODEL_ID = "gemini-3-flash-preview";

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

        const { messages, vehicle, events } = parsed.data;

        try {
          const { GOOGLE_GENERATIVE_AI_API_KEY } = getServerEnv();
          const google = createGoogleAiStudioProvider(GOOGLE_GENERATIVE_AI_API_KEY);

          const prepared = await prepareModelMessages(messages as UIMessage[]);
          const sistemaEmFoco = detectSistema(messages as UIMessage[]);

          const result = streamText({
            model: google(MODEL_ID),
            system: buildSystemPrompt({ vehicle, events, sistemaEmFoco }),
            messages: await convertToModelMessages(prepared),
            tools: chatTools,
            // Permite ao modelo continuar a resposta depois que o cliente
            // devolve o resultado do registro, em vez de parar na chamada.
            stopWhen: stepCountIs(4),
          });

          return result.toUIMessageStreamResponse({
            originalMessages: messages as UIMessage[],
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
