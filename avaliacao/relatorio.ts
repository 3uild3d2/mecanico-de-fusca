import { marcarFronteira, type PlacarModelo, type ResultadoCaso } from "./placar";
import { precoPorMilhao } from "./precos";

// Relatório HTML autocontido da bateria. Sem I/O: recebe os dados, devolve o
// texto. Todo texto vindo de caso ou de modelo passa por esc() — a resposta de
// um modelo é dado, não marcação.

export function esc(texto: string): string {
  return texto
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const nomeCurto = (id: string) => id.slice(id.indexOf(":") + 1);
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const num = (v: number | null, casas = 1) =>
  v === null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: casas });

/** Centavos de dólar importam aqui: custo por mensagem costuma ser fração de centavo. */
const dolar = (v: number | null) =>
  v === null
    ? "—"
    : `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;

const CAUSA = { acertou: "✔ acertou", parcial: "◐ parcial", errou: "✘ errou", nao_se_aplica: "—" };

function tabelaPlacar(placar: PlacarModelo[]): string {
  const linhas = [...placar]
    .sort((a, b) => (b.notaMedia ?? -1) - (a.notaMedia ?? -1))
    .map(
      (p) => `<tr>
  <th scope="row">${esc(nomeCurto(p.modelo))}</th>
  <td>${num(p.notaMedia)}</td>
  <td>${pct(p.acertoCausa)}</td>
  <td>${pct(p.criteriosCumpridos)}</td>
  <td>${pct(p.conformidadeHipoteses)}</td>
  <td>${p.casosComNumeroInventado}</td>
  <td>${p.registrosIncorretos}</td>
  <td>${p.falhasObjetivas}</td>
  <td>${dolar(p.custoPorMensagem)}</td>
  <td>${num(p.tokensPorCaso.entrada, 0)} → ${num(p.tokensPorCaso.saida, 0)}</td>
  <td>${num(p.segundosPorCaso)} s</td>
</tr>`,
    )
    .join("\n");

  return `<div class="rolagem"><table class="placar">
<thead><tr>
  <th>Modelo</th><th>Nota média</th><th>Acerto de causa</th><th>Critérios</th>
  <th>Painel de hipóteses</th><th>Inventou número</th><th>Registro errado</th>
  <th>Falhas objetivas</th><th>Custo por mensagem</th><th>Tokens por caso</th><th>Tempo por caso</th>
</tr></thead>
<tbody>${linhas}</tbody>
</table></div>`;
}

function custoTokens(modelo: string, entrada: number, saida: number): number | null {
  const p = precoPorMilhao(modelo);
  return p ? (entrada * p.entrada + saida * p.saida) / 1_000_000 : null;
}

/** Quanto o próprio estudo custou: modelos avaliados + juiz. Quem paga é o dono. */
function custoDoEstudo(resultados: ResultadoCaso[], juiz: string) {
  let modelos = 0;
  let juizTotal = 0;
  let incompleto = false;
  for (const r of resultados) {
    for (const t of r.turnos) {
      const c = custoTokens(r.modelo, t.tokensEntrada, t.tokensSaida);
      if (c === null) incompleto = true;
      else modelos += c;
    }
    if (r.tokensJuiz) {
      const c = custoTokens(juiz, r.tokensJuiz.entrada, r.tokensJuiz.saida);
      if (c === null) incompleto = true;
      else juizTotal += c;
    }
  }
  return { modelos, juiz: juizTotal, incompleto };
}

function dolarMensal(v: number | null): string {
  return v === null
    ? "—"
    : `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function secaoCusto(placar: PlacarModelo[], mensagensPorMes: number): string {
  const linhas = marcarFronteira(placar)
    .sort((a, b) => (a.custoPorMensagem ?? Infinity) - (b.custoPorMensagem ?? Infinity))
    .map((p) => {
      const status =
        p.dominado === null
          ? '<span class="fraco">sem dado</span>'
          : p.dominado
            ? '<span class="ruim">dominado</span>'
            : '<span class="ok">fronteira</span>';
      const mensal = p.custoPorMensagem === null ? null : p.custoPorMensagem * mensagensPorMes;
      return `<tr${p.dominado ? ' class="apagado"' : ""}>
  <th scope="row">${esc(nomeCurto(p.modelo))}</th>
  <td>${num(p.notaMedia)}</td>
  <td>${dolar(p.custoPorMensagem)}</td>
  <td>${dolarMensal(mensal)}</td>
  <td>${status}</td>
</tr>`;
    })
    .join("\n");

  return `<p class="leitura">Ordenado do mais barato para o mais caro. <b>Fronteira</b> = nenhum outro modelo é ao mesmo tempo melhor e mais barato; <b>dominado</b> = existe opção que não perde em nada para ele. Custo mensal por assinante supõe <b>${mensagensPorMes} mensagens por mês</b> — premissa, não medição.</p>
<div class="rolagem"><table class="custo">
<thead><tr><th>Modelo</th><th>Nota média</th><th>Custo por mensagem</th><th>Custo por assinante/mês</th><th></th></tr></thead>
<tbody>${linhas}</tbody>
</table></div>`;
}

function blocoModelo(r: ResultadoCaso): string {
  const juiz = r.juiz
    ? `<p class="nota"><strong>${num(r.juiz.nota)}</strong>/10 · ${CAUSA[r.juiz.causa]}${
        r.juiz.inventouNumero ? ' · <span class="ruim">inventou número</span>' : ""
      }</p>
<ul class="criterios">${r.juiz.criterios
        .map(
          (c) =>
            `<li class="${c.cumpriu ? "ok" : "ruim"}">${c.cumpriu ? "✔" : "✘"} ${esc(c.criterio)}${
              c.evidencia ? `<br><small>“${esc(c.evidencia)}”</small>` : ""
            }</li>`,
        )
        .join("")}${r.juiz.violacoes
        .filter((v) => v.violou)
        .map(
          (v) => `<li class="ruim">⚠ ${esc(v.regra)}<br><small>“${esc(v.evidencia)}”</small></li>`,
        )
        .join("")}</ul>
<p class="justificativa">${esc(r.juiz.justificativa)}</p>`
    : `<p class="ruim">Sem avaliação do juiz${r.erroJuiz ? `: ${esc(r.erroJuiz)}` : ""}</p>`;

  const falhas = r.verificacao.falhas.length
    ? `<ul class="falhas">${r.verificacao.falhas.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>`
    : "";

  const conversa = r.turnos
    .map(
      (t) => `<div class="fala"><b>Dono:</b> ${esc(t.fala)}</div>
${t.ferramentas.map((f) => `<div class="ferramenta">⚙ ${esc(f.nome)} <code>${esc(JSON.stringify(f.entrada))}</code></div>`).join("")}
<div class="resposta">${esc(t.resposta || "(sem texto)")}</div>${t.erro ? `<div class="ruim">Erro: ${esc(t.erro)}</div>` : ""}`,
    )
    .join("\n");

  return `<section class="modelo">
<h4>${esc(nomeCurto(r.modelo))}</h4>
${juiz}
${falhas}
<details><summary>Conversa completa</summary>${conversa}</details>
</section>`;
}

function blocoCaso(id: string, rs: ResultadoCaso[]): string {
  const caso = rs[0]!.caso;
  const selo = caso.revisado
    ? '<span class="selo ok">revisado</span>'
    : '<span class="selo aviso">não revisado</span>';
  return `<article class="caso" id="${esc(id)}">
<h3>${esc(caso.titulo)} ${selo}</h3>
<p class="mede">${esc(caso.categoria)} · ${esc(caso.mede)}</p>
${caso.esperado.causa ? `<p><b>Causa esperada:</b> ${esc(caso.esperado.causa)}</p>` : ""}
${caso.duvida ? `<p class="duvida"><b>Para você conferir:</b> ${esc(caso.duvida)}</p>` : ""}
<div class="modelos">${rs.map(blocoModelo).join("\n")}</div>
</article>`;
}

export function gerarRelatorioHtml(dados: {
  geradoEm: Date;
  juiz: string;
  resultados: ResultadoCaso[];
  placar: PlacarModelo[];
  mensagensPorMes: number;
}): string {
  const estudo = custoDoEstudo(dados.resultados, dados.juiz);
  const porCaso = new Map<string, ResultadoCaso[]>();
  for (const r of dados.resultados) {
    porCaso.set(r.caso.id, [...(porCaso.get(r.caso.id) ?? []), r]);
  }
  const naoRevisados = new Set(
    dados.resultados.filter((r) => !r.caso.revisado).map((r) => r.caso.id),
  ).size;

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bateria do Mecânico de Fusca</title>
<style>
:root{--fundo:#faf8f4;--texto:#1f1d1a;--fraco:#6b665e;--linha:#e3ded5;--ok:#2f7d4f;--ruim:#b3412f;--aviso:#9a6a00;--cartao:#fff}
@media (prefers-color-scheme:dark){:root{--fundo:#171614;--texto:#ece8e1;--fraco:#a39d93;--linha:#34312c;--ok:#6cc08e;--ruim:#ef8a76;--aviso:#e0b44f;--cartao:#211f1c}}
body{margin:0;background:var(--fundo);color:var(--texto);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1200px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:24px;margin:0 0 4px}.sub{color:var(--fraco);margin:0 0 24px}
.rolagem{overflow-x:auto}table{border-collapse:collapse;width:100%;min-width:900px;background:var(--cartao)}
th,td{border-bottom:1px solid var(--linha);padding:8px 10px;text-align:right;font-variant-numeric:tabular-nums}
th:first-child,thead th{text-align:left}thead th{color:var(--fraco);font-weight:600;font-size:13px}
.caso{background:var(--cartao);border:1px solid var(--linha);border-radius:10px;padding:16px;margin:20px 0}
.caso h3{margin:0;font-size:18px}.mede{color:var(--fraco);margin:2px 0 10px}
.modelos{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px;margin-top:12px}
.modelo{border:1px solid var(--linha);border-radius:8px;padding:12px}.modelo h4{margin:0 0 6px}
.nota{margin:0 0 6px}.criterios,.falhas{padding-left:0;list-style:none;margin:6px 0}
.criterios li,.falhas li{margin:4px 0}.ok{color:var(--ok)}.ruim{color:var(--ruim)}
.justificativa{color:var(--fraco);font-size:14px}.falhas li{color:var(--aviso)}
.selo{font-size:12px;border-radius:999px;padding:2px 8px;margin-left:6px;vertical-align:middle;border:1px solid}
.selo.ok{color:var(--ok)}.selo.aviso{color:var(--aviso)}
.duvida{background:color-mix(in srgb,var(--aviso) 12%,transparent);padding:8px 10px;border-radius:6px}
details{margin-top:8px}summary{cursor:pointer;color:var(--fraco)}
.fala{margin-top:10px}.resposta{white-space:pre-wrap;border-left:3px solid var(--linha);padding-left:10px;margin:6px 0}
.ferramenta{font-size:12px;color:var(--fraco);overflow-wrap:anywhere}code{font-size:12px}
small{color:var(--fraco)}.fraco{color:var(--fraco)}.leitura{color:var(--fraco);max-width:820px}
tr.apagado{opacity:.55}table.custo{min-width:560px}
</style></head>
<body><main>
<h1>Bateria do Mecânico de Fusca</h1>
<p class="sub">Gerado em ${esc(dados.geradoEm.toLocaleString("pt-BR"))} · juiz: ${esc(nomeCurto(dados.juiz))} · ${porCaso.size} casos${
    naoRevisados ? ` · <span class="ruim">${naoRevisados} ainda não revisados pelo dono</span>` : ""
  }</p>
<h2>Custo × qualidade</h2>
${secaoCusto(dados.placar, dados.mensagensPorMes)}
<p class="leitura">Este estudo custou ${dolar(estudo.modelos + estudo.juiz)}: ${dolar(estudo.modelos)} nos modelos avaliados e ${dolar(estudo.juiz)} no juiz${
    estudo.incompleto ? " (parcial: há modelo sem preço na tabela)" : ""
  }.</p>
<h2>Placar completo</h2>
${tabelaPlacar(dados.placar)}
<h2>Casos</h2>
${[...porCaso.entries()].map(([id, rs]) => blocoCaso(id, rs)).join("\n")}
</main></body></html>`;
}
