import { describe, expect, it } from "vitest";

import type { Caso } from "./casos";
import { calcularPlacar } from "./placar";
import { type Turno, verificar } from "./verificacao";

function caso(parcial: Partial<Caso> = {}): Caso {
  return {
    id: "c",
    titulo: "t",
    categoria: "diagnostico",
    mede: "m",
    veiculo: null,
    falas: ["a", "b"],
    esperado: { causa: "x", criterios: ["k"], naoDeve: [], desfechosAceitos: ["suspeita"] },
    confianca: "alta",
    revisado: true,
    ...parcial,
  };
}

function turno(parcial: Partial<Turno> = {}): Turno {
  return {
    fala: "f",
    resposta: "r",
    ferramentas: [],
    rodadas: 1,
    estourouRodadas: false,
    duracaoMs: 1000,
    tokensEntrada: 100,
    tokensSaida: 50,
    tokensRaciocinio: 0,
    ...parcial,
  };
}

const HIPOTESES = { nome: "atualizarHipoteses", entrada: {} };

describe("verificar — painel de hipóteses", () => {
  it("diagnóstico: mede a fração de turnos com o painel", () => {
    const v = verificar(caso(), [turno({ ferramentas: [HIPOTESES] }), turno()]);
    expect(v.conformidadeHipoteses).toBe(0.5);
    expect(v.falhas).toContain("Painel de hipóteses ausente em 1 de 2 turnos");
  });

  it("fora de diagnóstico, chamar o painel é falha de triagem", () => {
    const v = verificar(caso({ categoria: "procedimento" }), [turno({ ferramentas: [HIPOTESES] })]);
    expect(v.conformidadeHipoteses).toBe(0);
    expect(v.falhas).toContain("Chamou o painel de hipóteses fora de diagnóstico");
  });

  it("fora de diagnóstico, não chamar é conformidade total", () => {
    const v = verificar(caso({ categoria: "conversa" }), [turno()]);
    expect(v.conformidadeHipoteses).toBe(1);
    expect(v.falhas).toEqual([]);
  });
});

describe("verificar — registro do diagnóstico", () => {
  const registro = (desfecho: string) => ({
    nome: "registrarEvento",
    entrada: { tipo: "diagnostico", titulo: "x", desfecho },
  });

  it("aceita desfecho previsto no caso", () => {
    const v = verificar(caso(), [turno({ ferramentas: [HIPOTESES, registro("suspeita")] })]);
    expect(v.registroCorreto).toBe(true);
  });

  it("acusa 'confirmado' quando o caso só admite suspeita", () => {
    const v = verificar(caso(), [turno({ ferramentas: [HIPOTESES, registro("confirmado")] })]);
    expect(v.registroCorreto).toBe(false);
    expect(v.falhas).toContain("Registrou desfecho não aceito: confirmado");
  });

  it("sem registro de diagnóstico, não há o que julgar", () => {
    const servico = { nome: "registrarEvento", entrada: { tipo: "servico", titulo: "x" } };
    const v = verificar(caso(), [turno({ ferramentas: [HIPOTESES, servico] })]);
    expect(v.registroCorreto).toBeNull();
  });

  it("entrada fora do formato não quebra a verificação", () => {
    const lixo = { nome: "registrarEvento", entrada: "não é objeto" };
    const v = verificar(caso(), [turno({ ferramentas: [HIPOTESES, lixo] })]);
    expect(v.registroCorreto).toBeNull();
  });
});

describe("verificar — erros de execução", () => {
  it("registra erro e estouro de rodadas por turno", () => {
    const v = verificar(caso(), [
      turno({ ferramentas: [HIPOTESES], erro: "HTTP 500" }),
      turno({ ferramentas: [HIPOTESES], estourouRodadas: true }),
    ]);
    expect(v.falhas).toContain("Erro no turno 1: HTTP 500");
    expect(v.falhas).toContain("Excedeu o limite de rodadas de ferramenta no turno 2");
  });
});

describe("calcularPlacar", () => {
  const juiz = (nota: number, causa: "acertou" | "parcial" | "errou", cumpridos: boolean[]) => ({
    causa,
    criterios: cumpridos.map((cumpriu, i) => ({ criterio: `c${i}`, cumpriu, evidencia: "" })),
    violacoes: [],
    inventouNumero: false,
    seguranca: "nao_se_aplica" as const,
    nota,
    justificativa: "",
  });

  it("agrega por modelo: nota, acerto de causa, critérios, custo e tempo", () => {
    const casoA = caso({ id: "a" });
    const casoB = caso({ id: "b" });
    const placar = calcularPlacar(
      [
        {
          caso: casoA,
          modelo: "m1",
          turnos: [turno({ ferramentas: [HIPOTESES] }), turno({ ferramentas: [HIPOTESES] })],
          verificacao: verificar(casoA, [turno({ ferramentas: [HIPOTESES] })]),
          juiz: juiz(8, "acertou", [true, true]),
        },
        {
          caso: casoB,
          modelo: "m1",
          turnos: [turno({ ferramentas: [HIPOTESES] })],
          verificacao: verificar(casoB, [turno()]),
          juiz: juiz(4, "parcial", [true, false]),
        },
      ],
      { apenasRevisados: false },
    );

    expect(placar).toHaveLength(1);
    const m1 = placar[0]!;
    expect(m1.modelo).toBe("m1");
    expect(m1.casos).toBe(2);
    expect(m1.notaMedia).toBe(6);
    expect(m1.acertoCausa).toBe(0.75);
    expect(m1.criteriosCumpridos).toBe(0.75);
    expect(m1.conformidadeHipoteses).toBe(0.5);
    expect(m1.tokensPorCaso).toEqual({ entrada: 150, saida: 75 });
    expect(m1.segundosPorCaso).toBe(1.5);
  });

  it("com apenasRevisados, ignora casos que o dono ainda não revisou", () => {
    const naoRevisado = caso({ id: "n", revisado: false });
    const placar = calcularPlacar(
      [
        {
          caso: naoRevisado,
          modelo: "m1",
          turnos: [turno()],
          verificacao: verificar(naoRevisado, [turno()]),
          juiz: juiz(10, "acertou", [true]),
        },
      ],
      { apenasRevisados: true },
    );
    expect(placar[0]?.casos ?? 0).toBe(0);
  });
});
