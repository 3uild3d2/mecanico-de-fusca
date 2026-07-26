import type { UIMessage } from "ai";

import type { SistemaVeiculo } from "@/features/garage/events";

// Detecta de qual sistema do carro a conversa está tratando. Serve para filtrar
// o histórico: sem isso, ou injetamos tudo (caro e ruidoso) ou nada (perde a
// recorrência, que é o sinal mais valioso).
//
// Heurística de propósito, não classificação por modelo: é barato, determinístico
// e testável. Errar aqui degrada a relevância do histórico, não a resposta.

/**
 * Ordem importa: o primeiro padrão que casar vence. Do mais específico ao mais geral.
 *
 * ATENÇÃO: o texto é normalizado sem acentos antes da comparação. Escreva os
 * padrões SEM ACENTO — `/válvula/` nunca casa, `/valvula/` casa com as duas
 * grafias. As variantes acentuadas abaixo são redundantes e estão só por clareza.
 */
const REGRAS: Array<{ sistema: SistemaVeiculo; match: RegExp }> = [
  { sistema: "arrefecimento", match: /superaquec|esquent|temperatura|ferv|ventoinha|defletor/ },
  {
    sistema: "ignicao",
    match: /ignic|platinad|condensador|bobina|vela|distribuidor|ponto|cabo de vela/,
  },
  {
    sistema: "carburacao",
    match: /carbur|solex|brosol|afogador|giclê|gicle|boia|mistura|marcha lenta/,
  },
  { sistema: "freios", match: /freio|lona|pastilha|cilindro de roda|fluido de freio|tambor/ },
  { sistema: "cambio", match: /cambio|câmbio|marcha|embreag|transmiss|diferencial/ },
  { sistema: "suspensao", match: /suspens|amortec|feixe|barra torc|bandeja|pivo|pivô/ },
  {
    sistema: "eletrica",
    match: /bateria|alternador|dinamo|dínamo|regulador|fio|farol|lanterna|chicote|eletric|elétric/,
  },
  {
    sistema: "motor",
    match:
      /motor|valvul|válvul|pistao|pistão|cilindro|biela|virabrequim|oleo|óleo|junta|cabecote|cabeçote|barulh|ruido|ruído|fumac|fumaça/,
  },
];

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase();
}

/** Quantas mensagens finais olhar. O assunto muda ao longo de uma conversa longa. */
const JANELA_MENSAGENS = 4;

export function detectSistemaFromText(text: string): SistemaVeiculo | undefined {
  const normalizado = normalize(text);
  return REGRAS.find((regra) => regra.match.test(normalizado))?.sistema;
}

/**
 * Olha as últimas mensagens do usuário — não a conversa inteira, porque o
 * assunto muda e o histórico deve seguir o assunto atual.
 */
export function detectSistema(messages: UIMessage[]): SistemaVeiculo | undefined {
  const texto = messages
    .filter((message) => message.role === "user")
    .slice(-JANELA_MENSAGENS)
    .flatMap((message) => message.parts.map((part) => (part.type === "text" ? part.text : "")))
    .join(" ");

  return texto.trim() ? detectSistemaFromText(texto) : undefined;
}
