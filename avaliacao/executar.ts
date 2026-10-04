import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { MODELO_PADRAO, parseModeloId } from "@/server/ai/modelos";
import { criarModelo } from "@/server/ai/provider";
import { getServerEnv } from "@/server/config/env";

import { CASOS } from "./casos";
import { conduzirCaso } from "./conversa";
import { julgar } from "./juiz";
import { calcularPlacar, type ResultadoCaso } from "./placar";
import { gerarRelatorioHtml } from "./relatorio";
import { verificar } from "./verificacao";

// Roda a bateria. Uso (o .env é lido pelo próprio script npm):
//
//   npm run avaliar -- --modelos google:gemini-3-flash-preview,openai:gpt-x \
//                      --juiz openai:gpt-y [--casos id1,id2] [--paralelo 3]
//
// Grava avaliacao/resultados/<data-hora>.json e .html. Os resultados não vão
// para o git: são gerados; o que se decide a partir deles vai para o CONTEXTO.

const { values } = parseArgs({
  options: {
    modelos: { type: "string", default: MODELO_PADRAO },
    juiz: { type: "string" },
    casos: { type: "string" },
    paralelo: { type: "string", default: "3" },
    // Premissa de uso para projetar o custo mensal por assinante. Não é dado
    // medido: ajuste quando houver uso real.
    "mensagens-por-mes": { type: "string", default: "100" },
  },
});

function lista(valor: string | undefined): string[] {
  return (valor ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

async function emLotes<T, R>(
  itens: T[],
  tamanho: number,
  f: (item: T) => Promise<R>,
): Promise<R[]> {
  const saida: R[] = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    saida.push(...(await Promise.all(itens.slice(i, i + tamanho).map(f))));
  }
  return saida;
}

async function main() {
  const modelos = lista(values.modelos);
  const juizId = values.juiz;
  const paralelo = Math.max(1, Number(values.paralelo) || 1);

  if (!juizId) throw new Error("Informe o juiz: --juiz fornecedor:modelo");
  for (const id of [...modelos, juizId]) {
    if (!parseModeloId(id)) throw new Error(`Modelo inválido: ${id} (use fornecedor:modelo)`);
  }

  const filtro = lista(values.casos);
  const casos = filtro.length ? CASOS.filter((c) => filtro.includes(c.id)) : CASOS;
  const desconhecidos = filtro.filter((id) => !CASOS.some((c) => c.id === id));
  if (desconhecidos.length) throw new Error(`Casos inexistentes: ${desconhecidos.join(", ")}`);

  const env = getServerEnv();
  const modeloJuiz = criarModelo(juizId, env);
  const resultados: ResultadoCaso[] = [];

  for (const modeloId of modelos) {
    const modelo = criarModelo(modeloId, env);
    console.log(`\n▶ ${modeloId} — ${casos.length} casos`);

    const doModelo = await emLotes(casos, paralelo, async (caso) => {
      const turnos = await conduzirCaso(caso, modelo);
      const verificacao = verificar(caso, turnos);
      let resultado: ResultadoCaso = { caso, modelo: modeloId, turnos, verificacao, juiz: null };
      try {
        const j = await julgar(caso, turnos, modeloJuiz);
        resultado = {
          ...resultado,
          juiz: j.avaliacao,
          tokensJuiz: { entrada: j.tokensEntrada, saida: j.tokensSaida },
        };
      } catch (error) {
        resultado = {
          ...resultado,
          erroJuiz: error instanceof Error ? error.message : String(error),
        };
      }
      const nota = resultado.juiz ? `${resultado.juiz.nota}/10` : "sem nota";
      const alerta = verificacao.falhas.length ? ` · ${verificacao.falhas.length} falha(s)` : "";
      console.log(`  ${caso.id.padEnd(26)} ${nota}${alerta}`);
      return resultado;
    });
    resultados.push(...doModelo);
  }

  const geradoEm = new Date();
  const placar = calcularPlacar(resultados, { apenasRevisados: false });
  const nome = geradoEm.toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const pasta = join("avaliacao", "resultados");
  await mkdir(pasta, { recursive: true });
  await writeFile(
    join(pasta, `${nome}.json`),
    JSON.stringify({ geradoEm, juiz: juizId, resultados, placar }, null, 2),
  );
  await writeFile(
    join(pasta, `${nome}.html`),
    gerarRelatorioHtml({
      geradoEm,
      juiz: juizId,
      resultados,
      placar,
      mensagensPorMes: Math.max(1, Number(values["mensagens-por-mes"]) || 100),
    }),
  );

  console.log(
    "\nPlacar (nota média · acerto de causa · US$ por mensagem · tokens por caso · tempo por caso)",
  );
  for (const p of placar) {
    const causa = p.acertoCausa === null ? "—" : `${Math.round(p.acertoCausa * 100)}%`;
    const custo = p.custoPorMensagem === null ? "—" : p.custoPorMensagem.toFixed(4);
    const tokens = `${Math.round(p.tokensPorCaso.entrada)}→${Math.round(p.tokensPorCaso.saida)}`;
    console.log(
      `  ${p.modelo.padEnd(36)} ${p.notaMedia?.toFixed(1) ?? "—"} · ${causa} · ${custo} · ${tokens} · ${p.segundosPorCaso.toFixed(1)} s`,
    );
  }
  console.log(`\nRelatório: ${join(pasta, `${nome}.html`)}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
