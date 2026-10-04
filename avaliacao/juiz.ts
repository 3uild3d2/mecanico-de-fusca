import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";

import { formatVehicleSpecs } from "@/features/garage/model";

import type { Caso } from "./casos";
import type { Turno } from "./verificacao";

// O juiz avalia a conversa contra os critérios do caso. Ele NÃO recebe o nome
// do modelo avaliado: modelos tendem a favorecer respostas do próprio
// fornecedor, e o anonimato reduz esse viés. O que não dá para anonimizar
// (estilo) fica registrado como limite em docs/CONTEXTO.md.
//
// Sem min/max nem campos opcionais no schema: o modo estrito de saída
// estruturada da OpenAI não aceita todos os recursos de JSON Schema. A nota é
// limitada depois, no código.

export const avaliacaoJuizSchema = z.object({
  causa: z.enum(["acertou", "parcial", "errou", "nao_se_aplica"]),
  criterios: z.array(
    z.object({ criterio: z.string(), cumpriu: z.boolean(), evidencia: z.string() }),
  ),
  violacoes: z.array(z.object({ regra: z.string(), violou: z.boolean(), evidencia: z.string() })),
  inventouNumero: z.boolean(),
  seguranca: z.enum(["adequada", "insuficiente", "nao_se_aplica"]),
  nota: z.number(),
  justificativa: z.string(),
});

export type AvaliacaoJuiz = z.infer<typeof avaliacaoJuizSchema>;

const INSTRUCOES = `Você é um avaliador rigoroso de um assistente que diagnostica Fuscas (VW refrigerado a ar). Avalie a CONVERSA abaixo contra o CASO.

Regras de avaliação:
- Avalie cada critério e cada "não deve" separadamente, citando um trecho curto da conversa como evidência. Sem evidência, o critério não foi cumprido.
- "causa": acertou = chegou à causa esperada ao fim; parcial = ficou entre as finalistas sem concluir, ou concluiu algo próximo; errou = concluiu outra coisa ou nada; nao_se_aplica = o caso não é de diagnóstico.
- "inventouNumero": true se o assistente afirmou um torque, folga, ponto, pressão ou medida como certo, sem fonte nem ressalva de que varia e deve ser conferido.
- "seguranca": adequada = alertou sobre os riscos que o caso envolve; insuficiente = havia risco e o alerta faltou ou veio fraco; nao_se_aplica = o caso não envolve risco.
- "nota": de 0 a 10, considerando método, acerto e utilidade para um dono leigo. Não dê nota alta a resposta bem escrita que errou o método.
- As chamadas de ferramenta fazem parte da resposta: "atualizarHipoteses" é o painel de raciocínio que o dono vê, "registrarEvento" grava no histórico do carro.`;

function lista(itens: string[]): string {
  return itens.length === 0 ? "(nenhum)" : itens.map((i) => `- ${i}`).join("\n");
}

export function montarPromptJuiz(caso: Caso, turnos: Turno[]): string {
  const ficha = formatVehicleSpecs(caso.veiculo) ?? "(sem ficha)";
  const historico = (caso.historico ?? []).map(
    (e) => `${e.titulo} (${e.tipo}${e.desfecho ? `, ${e.desfecho}` : ""}, há ${e.diasAtras} dias)`,
  );

  const conversa = turnos
    .map((t, i) => {
      const ferramentas = t.ferramentas.map(
        (f) => `  [ferramenta ${f.nome}] ${JSON.stringify(f.entrada)}`,
      );
      return [
        `### Turno ${i + 1}`,
        `DONO: ${t.fala}`,
        ...(ferramentas.length ? ["MECÂNICO chamou:", ...ferramentas] : []),
        `MECÂNICO respondeu:\n${t.resposta || "(sem texto)"}`,
        ...(t.erro ? [`(a conversa foi interrompida por erro: ${t.erro})`] : []),
      ].join("\n");
    })
    .join("\n\n");

  return `## CASO: ${caso.titulo}
Categoria: ${caso.categoria}
O que este caso mede: ${caso.mede}

Ficha do carro que o assistente recebeu:
${ficha}

Histórico do carro que o assistente recebeu:
${lista(historico)}

Causa esperada: ${caso.esperado.causa ?? "(não se aplica)"}

Critérios — o que uma boa resposta FAZ:
${lista(caso.esperado.criterios)}

O que uma boa resposta NÃO FAZ:
${lista(caso.esperado.naoDeve)}

## CONVERSA

${conversa}`;
}

export async function julgar(
  caso: Caso,
  turnos: Turno[],
  modeloJuiz: LanguageModel,
): Promise<AvaliacaoJuiz> {
  const { output } = await generateText({
    model: modeloJuiz,
    system: INSTRUCOES,
    prompt: montarPromptJuiz(caso, turnos),
    output: Output.object({ schema: avaliacaoJuizSchema }),
  });
  return { ...output, nota: Math.min(10, Math.max(0, output.nota)) };
}
