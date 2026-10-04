import { describe, expect, it } from "vitest";

import type { Caso } from "./casos";
import { calcularPlacar } from "./placar";
import { gerarRelatorioHtml } from "./relatorio";
import { verificar } from "./verificacao";

const caso: Caso = {
  id: "c1",
  titulo: "Caso <um>",
  categoria: "diagnostico",
  mede: "m",
  veiculo: null,
  falas: ["Falha <script>alert(1)</script>"],
  esperado: { causa: "x", criterios: ["k"], naoDeve: [], desfechosAceitos: ["suspeita"] },
  confianca: "media",
  duvida: "Confira isso",
  revisado: false,
};

const turnos = [
  {
    fala: caso.falas[0]!,
    resposta: "Resposta **com** markdown",
    ferramentas: [],
    rodadas: 1,
    estourouRodadas: false,
    duracaoMs: 2000,
    tokensEntrada: 10,
    tokensSaida: 5,
    tokensRaciocinio: 0,
  },
];

const resultados = [
  {
    caso,
    modelo: "openai:modelo-a",
    turnos,
    verificacao: verificar(caso, turnos),
    juiz: null,
    erroJuiz: "juiz caiu",
  },
];

function gerar() {
  return gerarRelatorioHtml({
    geradoEm: new Date("2026-10-04T12:00:00Z"),
    juiz: "openai:juiz-x",
    resultados,
    placar: calcularPlacar(resultados, { apenasRevisados: false }),
    mensagensPorMes: 120,
  });
}

describe("gerarRelatorioHtml", () => {
  it("escapa o texto vindo de casos e de modelos", () => {
    const html = gerar();
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Caso &lt;um&gt;");
  });

  it("mostra modelo, juiz, falhas objetivas e erro do juiz", () => {
    const html = gerar();
    expect(html).toContain("modelo-a");
    expect(html).toContain("juiz-x");
    expect(html).toContain("Painel de hipóteses ausente");
    expect(html).toContain("juiz caiu");
  });

  it("põe o custo no centro: seção custo × qualidade com a premissa explícita", () => {
    const html = gerar();
    expect(html).toContain("Custo × qualidade");
    expect(html).toContain("120 mensagens por mês");
    expect(html).toContain("Este estudo custou");
  });

  it("marca o caso ainda não revisado e mostra a dúvida para o dono", () => {
    const html = gerar();
    expect(html).toContain("não revisado");
    expect(html).toContain("Confira isso");
  });
});
