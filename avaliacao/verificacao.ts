import { z } from "zod";

import type { Caso } from "./casos";

// Checagens objetivas de um caso: o que dá para medir sem opinião. O juiz
// cuida do resto. Sem I/O — é o que os testes cobrem.

export type ChamadaFerramenta = { nome: string; entrada: unknown };

/** Uma fala do dono e tudo o que o mecânico fez até responder a ela. */
export type Turno = {
  fala: string;
  resposta: string;
  ferramentas: ChamadaFerramenta[];
  /** Quantas idas ao modelo a fala custou (cada resultado de ferramenta é uma). */
  rodadas: number;
  estourouRodadas: boolean;
  duracaoMs: number;
  tokensEntrada: number;
  tokensSaida: number;
  tokensRaciocinio: number;
  erro?: string;
};

export type Verificacao = {
  /** 0..1. Diagnóstico: fração de turnos com o painel. Demais: 1 se nunca chamou, 0 se chamou. */
  conformidadeHipoteses: number;
  /** null quando o mecânico não registrou diagnóstico — não há o que julgar. */
  registroCorreto: boolean | null;
  desfechosRegistrados: string[];
  falhas: string[];
};

// A entrada vem do modelo: passa por zod, nada de cast (regra 3 do AGENTS.md).
const registroSchema = z.object({ tipo: z.string(), desfecho: z.string().optional() });

export function verificar(caso: Caso, turnos: Turno[]): Verificacao {
  const diagnostico = caso.categoria === "diagnostico";
  const falhas: string[] = [];

  const comHipoteses = turnos.filter((t) =>
    t.ferramentas.some((f) => f.nome === "atualizarHipoteses"),
  ).length;

  let conformidadeHipoteses: number;
  if (diagnostico) {
    conformidadeHipoteses = turnos.length === 0 ? 0 : comHipoteses / turnos.length;
    if (comHipoteses < turnos.length) {
      falhas.push(
        `Painel de hipóteses ausente em ${turnos.length - comHipoteses} de ${turnos.length} turnos`,
      );
    }
  } else {
    conformidadeHipoteses = comHipoteses === 0 ? 1 : 0;
    if (comHipoteses > 0) falhas.push("Chamou o painel de hipóteses fora de diagnóstico");
  }

  const registros = turnos
    .flatMap((t) => t.ferramentas)
    .filter((f) => f.nome === "registrarEvento");
  if (!diagnostico && registros.length > 0) falhas.push("Registrou evento fora de diagnóstico");

  const desfechosRegistrados = registros.flatMap((f) => {
    const lido = registroSchema.safeParse(f.entrada);
    return lido.success && lido.data.tipo === "diagnostico"
      ? [lido.data.desfecho ?? "sem desfecho"]
      : [];
  });

  const aceitos = caso.esperado.desfechosAceitos ?? [];
  const naoAceitos = desfechosRegistrados.filter((d) => !aceitos.some((a) => a === d));
  const registroCorreto = desfechosRegistrados.length === 0 ? null : naoAceitos.length === 0;
  for (const d of new Set(naoAceitos)) falhas.push(`Registrou desfecho não aceito: ${d}`);

  turnos.forEach((t, i) => {
    if (t.erro) falhas.push(`Erro no turno ${i + 1}: ${t.erro}`);
    if (t.estourouRodadas)
      falhas.push(`Excedeu o limite de rodadas de ferramenta no turno ${i + 1}`);
  });

  return { conformidadeHipoteses, registroCorreto, desfechosRegistrados, falhas };
}
