import { tool } from "ai";
import { z } from "zod";

import { SISTEMAS } from "./schema";

// Ferramentas do agente.
//
// registrarEvento é deliberadamente definida SEM `execute`: no AI SDK isso a
// torna uma ferramenta de cliente. O agente decide chamar, mas quem escreve é o
// navegador — que é onde existe a sessão autenticada do Supabase. O servidor
// não tem credencial de administrador e não deveria ter só para isso.

export const registrarEventoTool = tool({
  description: `Registra um marco no histórico do carro. Use quando:
- o dono relatar um serviço feito ("troquei as 4 velas", "regulei as válvulas");
- um diagnóstico chegar a uma suspeita forte, mesmo sem confirmação;
- uma hipótese for descartada por teste — o descarte também é informação valiosa.

Escreva o título em UMA linha curta e direta, como anotação de oficina.
Não pergunte permissão antes de registrar um serviço que o dono acabou de relatar.
Não invente data: se ele não disser quando foi, deixe em branco que assume-se hoje.`,
  inputSchema: z.object({
    tipo: z
      .enum(["diagnostico", "servico", "observacao"])
      .describe("diagnostico = suspeita ou causa; servico = algo que foi feito no carro"),
    titulo: z
      .string()
      .min(3)
      .max(80)
      .describe('Uma linha curta. Ex.: "Problema na bobina", "Troca das 4 velas"'),
    sistema: z.enum(SISTEMAS).optional().describe("Sistema do carro envolvido"),
    desfecho: z
      .enum(["suspeita", "confirmado", "descartado", "sem_retorno"])
      .optional()
      .describe(
        "Para diagnóstico. Use sem_retorno quando a suspeita ficou em aberto — é o caso mais comum e continua valendo.",
      ),
    diasAtras: z
      .number()
      .int()
      .min(0)
      .max(3650)
      .optional()
      .describe("Se o dono disser que foi no passado. 0 ou ausente = hoje."),
    km: z.number().int().positive().optional().describe("Quilometragem, se ele mencionar"),
  }),
});

export const atualizarHipotesesTool = tool({
  description: `Publica o estado atual do seu raciocínio diagnóstico para o dono ver no painel.

Chame APENAS em diagnóstico — nunca em pedido de procedimento, de especificação ou em conversa solta.

Quando chamar:
- ao levantar as hipóteses iniciais, antes de fazer as perguntas;
- sempre que uma resposta ou teste mudar o quadro: peso alterado, hipótese descartada ou confirmada.

Mande SEMPRE a lista completa e atualizada, não só o que mudou.

Preencha comoRefutar em toda hipótese viva: é o que prova ao dono que você está testando suas próprias ideias em vez de defender a primeira. Ao descartar, o motivo tem que ser a evidência que refutou — não "achei menos provável".`,
  inputSchema: z.object({
    sintoma: z
      .string()
      .max(120)
      .optional()
      .describe("O sintoma em uma linha, como você o entendeu"),
    hipoteses: z
      .array(
        z.object({
          nome: z
            .string()
            .min(2)
            .max(60)
            .describe('Curto. Ex.: "Bobina fraca", "Boia do carburador"'),
          peso: z
            .number()
            .min(0)
            .max(100)
            .describe("Quanto você acredita nela agora, de 0 a 100. A soma não precisa dar 100."),
          status: z.enum(["viva", "descartada", "confirmada"]),
          porque: z.string().max(160).optional().describe("Por que é plausível NESTE carro"),
          comoRefutar: z
            .string()
            .max(160)
            .optional()
            .describe("O que provaria que NÃO é isso. Obrigatório nas hipóteses vivas."),
          motivoDescarte: z
            .string()
            .max(160)
            .optional()
            .describe("Só quando descartada: a evidência que a derrubou"),
        }),
      )
      .min(1)
      .max(6),
  }),
});

export const chatTools = {
  registrarEvento: registrarEventoTool,
  atualizarHipoteses: atualizarHipotesesTool,
};
