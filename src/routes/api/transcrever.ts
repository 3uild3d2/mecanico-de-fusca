import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { transcreverAudio } from "@/server/ai/transcricao";
import { getServerEnv } from "@/server/config/env";

// Transcreve o áudio gravado no chat. Chamado uma vez, no envio: o texto fica
// salvo na mensagem e é ele que o mecânico recebe.

const pedidoSchema = z.object({ url: z.string().min(1).max(8_000_000) });

export const Route = createFileRoute("/api/transcrever")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let corpo: unknown;
        try {
          corpo = await request.json();
        } catch {
          return Response.json(
            { error: "Corpo da requisição não é JSON válido." },
            { status: 400 },
          );
        }

        const lido = pedidoSchema.safeParse(corpo);
        if (!lido.success) {
          return Response.json({ error: "Informe a URL do áudio." }, { status: 400 });
        }

        try {
          const texto = await transcreverAudio(lido.data.url, getServerEnv());
          return Response.json({ texto });
        } catch (error) {
          console.error("[api/transcrever] falha ao transcrever", error);
          const mensagem = error instanceof Error ? error.message : "Falha ao transcrever o áudio.";
          const status = mensagem === "Endereço de áudio não permitido." ? 400 : 500;
          return Response.json({ error: mensagem }, { status });
        }
      },
    },
  },
});
