import type { Caso } from "./casos";
import type { AvaliacaoJuiz } from "./juiz";
import type { Turno, Verificacao } from "./verificacao";

// Agregação por modelo. Sem I/O.

export type ResultadoCaso = {
  caso: Caso;
  modelo: string;
  turnos: Turno[];
  verificacao: Verificacao;
  juiz: AvaliacaoJuiz | null;
  erroJuiz?: string;
};

export type PlacarModelo = {
  modelo: string;
  casos: number;
  /** Média da nota 0–10 do juiz, só sobre casos julgados. */
  notaMedia: number | null;
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
};

function media(valores: number[]): number | null {
  return valores.length === 0 ? null : valores.reduce((a, b) => a + b, 0) / valores.length;
}

const PESO_CAUSA = { acertou: 1, parcial: 0.5, errou: 0 } as const;

export function calcularPlacar(
  resultados: ResultadoCaso[],
  opcoes: { apenasRevisados: boolean },
): PlacarModelo[] {
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
      casos: rs.length,
      notaMedia: media(julgados.map((j) => j.nota)),
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
    };
  });
}
