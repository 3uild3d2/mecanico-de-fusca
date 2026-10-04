import { createFileRoute } from "@tanstack/react-router";

import { getServerEnv } from "@/server/config/env";
import { MODELO_PADRAO } from "@/server/ai/modelos";
import { modelosDisponiveis, seletorLigado } from "@/server/ai/provider";

// Lista do seletor de modelos (benchmark). Com o seletor desligado responde só
// { habilitado: false } — o cliente nem desenha o seletor.
export const Route = createFileRoute("/api/modelos")({
  server: {
    handlers: {
      GET: async () => {
        const env = getServerEnv();
        if (!seletorLigado(env)) return Response.json({ habilitado: false });

        return Response.json({
          habilitado: true,
          padrao: MODELO_PADRAO,
          modelos: await modelosDisponiveis(env),
        });
      },
    },
  },
});
