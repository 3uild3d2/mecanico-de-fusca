// Identificação e escolha de modelo. Lógica pura: quem cria o modelo de
// verdade é provider.ts. O seletor existe para o benchmark de modelos e é
// temporário — ver docs/CONTEXTO.md.

export const FORNECEDORES = ["google", "openai"] as const;
export type Fornecedor = (typeof FORNECEDORES)[number];

/** O modelo de produção. É o que todo mundo usa quando o seletor está desligado. */
export const MODELO_PADRAO = "google:gemini-3-flash-preview";

const NOME_DE_MODELO = /^[a-z0-9][a-z0-9.-]*$/i;

function ehFornecedor(valor: string): valor is Fornecedor {
  return FORNECEDORES.some((f) => f === valor);
}

/** "openai:gpt-x" → { fornecedor, modelo }. Qualquer coisa fora do formato → null. */
export function parseModeloId(id: string): { fornecedor: Fornecedor; modelo: string } | null {
  const separador = id.indexOf(":");
  if (separador <= 0) return null;

  const fornecedor = id.slice(0, separador);
  const modelo = id.slice(separador + 1);
  if (!ehFornecedor(fornecedor) || !NOME_DE_MODELO.test(modelo)) return null;

  return { fornecedor, modelo };
}

// A lista de /v1/models da OpenAI mistura tudo: áudio, imagem, embedding,
// moderação e snapshots datados de cada modelo. Para um seletor de chat só
// interessam os nomes de conversa sem data — o snapshot é o mesmo modelo.
//
// Também ficam de fora, por decisão de produto:
// - legados (gpt-3.5, gpt-4 puro e -turbo): não são candidatos a produção;
// - -pro: custo por mensagem incompatível com assinatura mensal — um clique
//   curioso no seletor sairia caro;
// - -chat-latest: alias do que roda no ChatGPT, muda sem aviso; a OpenAI não o
//   recomenda para produção;
// - live/realtime: voz em tempo real, outra API.
const PREFIXO_DE_CHAT = /^(gpt-|o\d)/;
const NAO_E_CHAT =
  /(audio|realtime|live|tts|transcribe|image|embedding|search|instruct|moderation|codex|dall-e|whisper|computer-use|deep-research|-pro$|-chat-latest$|-16k$)/;
const LEGADO = /^(gpt-3\.5|gpt-4$|gpt-4-)/;
const SNAPSHOT_DATADO = /-(\d{4}-\d{2}-\d{2}|\d{4})$/;

export function filtrarModelosDeChat(ids: string[]): string[] {
  const filtrados = ids.filter(
    (id) =>
      PREFIXO_DE_CHAT.test(id) &&
      !NAO_E_CHAT.test(id) &&
      !LEGADO.test(id) &&
      !SNAPSHOT_DATADO.test(id),
  );
  return [...new Set(filtrados)].sort();
}

/**
 * Decide qual modelo atende o pedido. O cliente só sugere: com o seletor
 * desligado (produção) a sugestão é ignorada, e com ele ligado só vale o que
 * está na lista — senão qualquer um escolheria o modelo mais caro da conta.
 */
export function resolverModelo(
  pedido: string | undefined,
  opcoes: { seletorLigado: boolean; permitidos: readonly string[] },
): string {
  if (!opcoes.seletorLigado || !pedido) return MODELO_PADRAO;
  return opcoes.permitidos.includes(pedido) ? pedido : MODELO_PADRAO;
}
