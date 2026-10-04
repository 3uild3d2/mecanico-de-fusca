import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { formatVehicleSpecs } from "@/features/garage/model";

import { CASOS } from "./casos";
import { esc } from "./relatorio";

// Página de revisão dos casos para o dono, gerada do próprio casos.ts — assim
// ela nunca diverge do que a bateria usa. Uso: npm run avaliar:revisao

const CATEGORIA = {
  diagnostico: "Diagnóstico",
  procedimento: "Procedimento",
  especificacao: "Especificação",
  conversa: "Conversa",
};

const itens = (xs: string[]) => `<ul>${xs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;

const cartoes = CASOS.map((c, i) => {
  const ficha = formatVehicleSpecs(c.veiculo);
  const historico = (c.historico ?? []).map(
    (e) => `${e.titulo} — ${e.tipo}${e.desfecho ? `, ${e.desfecho}` : ""}, há ${e.diasAtras} dias`,
  );
  return `<article>
<h2><span class="num">${i + 1}</span> ${esc(c.titulo)}</h2>
<p class="meta">${CATEGORIA[c.categoria]} · mede: ${esc(c.mede)} · minha confiança: <b class="${c.confianca}">${c.confianca}</b></p>
${c.duvida ? `<p class="duvida"><b>Confira com atenção:</b> ${esc(c.duvida)}</p>` : ""}
<h3>O carro</h3><pre>${esc(ficha ?? "(sem ficha)")}</pre>
${historico.length ? `<h3>Histórico que o mecânico recebe</h3>${itens(historico)}` : ""}
<h3>O que o dono diz, em ordem</h3><ol>${c.falas.map((f) => `<li>${esc(f)}</li>`).join("")}</ol>
${c.esperado.causa ? `<h3>Causa esperada</h3><p class="causa">${esc(c.esperado.causa)}</p>` : ""}
<h3>Uma boa resposta…</h3>${itens(c.esperado.criterios)}
${c.esperado.naoDeve.length ? `<h3>Uma boa resposta não…</h3>${itens(c.esperado.naoDeve)}` : ""}
</article>`;
}).join("\n");

const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Casos para revisão — Mecânico de Fusca</title>
<style>
:root{--fundo:#faf8f4;--texto:#1f1d1a;--fraco:#6b665e;--linha:#e3ded5;--cartao:#fff;--aviso:#9a6a00;--acento:#b3412f}
@media (prefers-color-scheme:dark){:root{--fundo:#171614;--texto:#ece8e1;--fraco:#a39d93;--linha:#34312c;--cartao:#211f1c;--aviso:#e0b44f;--acento:#ef8a76}}
body{margin:0;background:var(--fundo);color:var(--texto);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:760px;margin:0 auto;padding:28px 16px 64px}
h1{font-size:26px;margin:0 0 8px}.intro{color:var(--fraco)}
article{background:var(--cartao);border:1px solid var(--linha);border-radius:12px;padding:18px 20px;margin:22px 0}
h2{font-size:19px;margin:0}h3{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--fraco);margin:16px 0 4px}
.num{display:inline-block;min-width:28px;height:28px;line-height:28px;text-align:center;border-radius:50%;background:var(--acento);color:#fff;font-size:14px;margin-right:6px}
.meta{color:var(--fraco);font-size:14px;margin:6px 0 0}.media{color:var(--aviso)}
.duvida{background:color-mix(in srgb,var(--aviso) 14%,transparent);border-radius:8px;padding:10px 12px}
pre{white-space:pre-wrap;font-family:inherit;font-size:14px;margin:0;color:var(--fraco)}.causa{font-weight:600}
ul,ol{margin:4px 0;padding-left:22px}li{margin:3px 0}
</style></head><body><main>
<h1>Casos para revisão</h1>
<p class="intro">São ${CASOS.length} situações que vão testar o Mecânico. Para cada uma, confira se a fala do dono é realista, se a <b>causa esperada</b> está certa e se os critérios fazem sentido para um mecânico de verdade. Os marcados com confiança <b class="media">media</b> têm um ponto específico para você conferir. Responda no chat pelo número: “3 ok”, ou “7: a causa mais comum seria…”.</p>
${cartoes}
</main></body></html>`;

const pasta = join("avaliacao", "resultados");
await mkdir(pasta, { recursive: true });
const arquivo = join(pasta, "casos-para-revisao.html");
await writeFile(arquivo, html);
console.log(arquivo);
