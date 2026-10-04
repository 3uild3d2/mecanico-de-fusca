import type { Caso } from "./casos";
import type { AvaliacaoJuiz } from "./juiz";
import { precoPorMilhao } from "./precos";
import type { Turno, Verificacao } from "./verificacao";

// Agregação por modelo. Sem I/O.

export type ResultadoCaso = {
  caso: Caso;
  modelo: string;
  /** Qual execução do caso é esta (1, 2, ...). O mesmo caso varia entre execuções. */
  repeticao?: number;
  turnos: Turno[];
  verificacao: Verificacao;
  juiz: AvaliacaoJuiz | null;
  erroJuiz?: string;
  tokensJuiz?: { entrada: number; saida: number };
};

export type PlacarModelo = {
  modelo: string;
  casos: number;
  /** Execuções somadas (casos × repetições). */
  execucoes: number;
  /** Média da nota 0–10 do juiz, só sobre casos julgados. */
  notaMedia: number | null;
  /**
   * Desvio-padrão da nota entre execuções. Dois modelos cuja diferença de nota
   * é menor que isto estão empatados na prática.
   */
  notaDesvio: number | null;
  /** Diagnósticos: acertou = 1, parcial = 0,5, errou = 0. */
  acertoCausa: number | null;
  /** Fração de critérios cumpridos, somando todos os casos julgados. */
  criteriosCumpridos: number | null;
  conformidadeHipoteses: number;
  registrosIncorretos: number;
  casosComNumeroInventado: number;
  falhasObjetivas: number;
  tokensPorCaso: { entrada: number; saida: number };
  segundosPorCaso: number;
  /**
   * US$ por mensagem do dono — o número que se compara com a assinatura.
   * null quando o modelo não está na tabela de preços.
   */
  custoPorMensagem: number | null;
};

function media(valores: number[]): number | null {
  return valores.length === 0 ? null : valores.reduce((a, b) => a + b, 0) / valores.length;
}

function desvio(valores: number[]): number | null {
  const m = media(valores);
  if (m === null || valores.length < 2) return null;
  return Math.sqrt(valores.reduce((s, v) => s + (v - m) ** 2, 0) / valores.length);
}

const PESO_CAUSA = { acertou: 1, parcial: 0.5, errou: 0 } as const;

export function calcularPlacar(
  resultados: ResultadoCaso[],
  opcoes: {
    apenasRevisados: boolean;
    preco?: (modelo: string) => { entrada: number; saida: number } | null;
  },
): PlacarModelo[] {
  const preco = opcoes.preco ?? precoPorMilhao;
  const validos = resultados.filter((r) => !opcoes.apenasRevisados || r.caso.revisado);
  const porModelo = new Map<string, ResultadoCaso[]>();
  for (const r of validos) porModelo.set(r.modelo, [...(porModelo.get(r.modelo) ?? []), r]);

  return [...porModelo.entries()].map(([modelo, rs]) => {
    const julgados = rs.flatMap((r) => (r.juiz ? [r.juiz] : []));
    const causas = rs.flatMap((r) =>
      r.caso.categoria === "diagnostico" && r.juiz && r.juiz.causa !== "nao_se_aplica"
        ? [PESO_CAUSA[r.juiz.causa]]
        : [],
    );
    const criterios = julgados.flatMap((j) => j.criterios);
    const soma = (f: (t: Turno) => number) => (r: ResultadoCaso) =>
      r.turnos.reduce((total, t) => total + f(t), 0);

    return {
      modelo,
      casos: new Set(rs.map((r) => r.caso.id)).size,
      execucoes: rs.length,
      notaMedia: media(julgados.map((j) => j.nota)),
      notaDesvio: desvio(julgados.map((j) => j.nota)),
      acertoCausa: media(causas),
      criteriosCumpridos:
        criterios.length === 0
          ? null
          : criterios.filter((c) => c.cumpriu).length / criterios.length,
      conformidadeHipoteses: media(rs.map((r) => r.verificacao.conformidadeHipoteses)) ?? 0,
      registrosIncorretos: rs.filter((r) => r.verificacao.registroCorreto === false).length,
      casosComNumeroInventado: julgados.filter((j) => j.inventouNumero).length,
      falhasObjetivas: rs.reduce((n, r) => n + r.verificacao.falhas.length, 0),
      tokensPorCaso: {
        entrada: media(rs.map(soma((t) => t.tokensEntrada))) ?? 0,
        saida: media(rs.map(soma((t) => t.tokensSaida))) ?? 0,
      },
      segundosPorCaso: (media(rs.map(soma((t) => t.duracaoMs))) ?? 0) / 1000,
      custoPorMensagem: custoPorMensagem(rs, preco(modelo)),
    };
  });
}

function custoPorMensagem(
  rs: ResultadoCaso[],
  p: { entrada: number; saida: number } | null,
): number | null {
  const turnos = rs.flatMap((r) => r.turnos);
  if (!p || turnos.length === 0) return null;
  const total = turnos.reduce(
    (soma, t) => soma + (t.tokensEntrada * p.entrada + t.tokensSaida * p.saida) / 1_000_000,
    0,
  );
  return total / turnos.length;
}

/**
 * Fronteira custo × qualidade. Um modelo é dominado quando outro tem nota
 * maior ou igual E custo por mensagem menor ou igual, sendo estritamente
 * melhor em pelo menos um dos dois. Dominado sai da discussão: sempre existe
 * uma escolha que não perde em nada para ele.
 *
 * null = sem nota ou sem custo; fica fora da comparação em vez de ser julgado
 * com número que não temos.
 */
export function marcarFronteira<
  T extends { modelo: string; notaMedia: number | null; custoPorMensagem: number | null },
>(placar: T[]): (T & { dominado: boolean | null })[] {
  const comparaveis = placar.filter((p) => p.notaMedia !== null && p.custoPorMensagem !== null);
  return placar.map((p) => {
    if (p.notaMedia === null || p.custoPorMensagem === null) return { ...p, dominado: null };
    const nota = p.notaMedia;
    const custo = p.custoPorMensagem;
    const dominado = comparaveis.some(
      (o) =>
        o.modelo !== p.modelo &&
        o.notaMedia! >= nota &&
        o.custoPorMensagem! <= custo &&
        (o.notaMedia! > nota || o.custoPorMensagem! < custo),
    );
    return { ...p, dominado };
  });
}
