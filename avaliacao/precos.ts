// Preço por 1 milhão de tokens, em US$, tier padrão, SEM desconto de cache —
// a estimativa fica do lado conservador. Tokens de raciocínio são cobrados
// como saída e já vêm somados nela.
//
// Fonte: https://developers.openai.com/api/docs/pricing, consultada em
// 2026-10-04. Preço muda: antes de decidir por custo, confira a página.
// Modelo fora desta tabela fica sem custo no relatório — nunca com custo
// inventado.

type Preco = { entrada: number; saida: number };

const TABELA: Record<string, Preco> = {
  "gpt-6-astra": { entrada: 10, saida: 50 },
  "gpt-6.1-sol": { entrada: 2, saida: 10 },
  "gpt-6-sol": { entrada: 2, saida: 10 },
  "gpt-6-luna": { entrada: 0.1, saida: 0.5 },
  "gpt-5.6-sol": { entrada: 4, saida: 20 },
  "gpt-5.6-terra": { entrada: 2, saida: 12 },
  "gpt-5.6-luna": { entrada: 0.2, saida: 1.2 },
  "gpt-5.5": { entrada: 5, saida: 30 },
  "gpt-5.4": { entrada: 2.5, saida: 15 },
  "gpt-5.4-mini": { entrada: 0.75, saida: 4.5 },
  "gpt-5.4-nano": { entrada: 0.2, saida: 1.25 },
  "gpt-5.2": { entrada: 1.75, saida: 14 },
  "gpt-5.1": { entrada: 1.25, saida: 10 },
  "gpt-5": { entrada: 1.25, saida: 10 },
  "gpt-5-mini": { entrada: 0.25, saida: 2 },
  "gpt-5-nano": { entrada: 0.05, saida: 0.4 },
  "gpt-4.1": { entrada: 2, saida: 8 },
  "gpt-4.1-mini": { entrada: 0.4, saida: 1.6 },
  "gpt-4.1-nano": { entrada: 0.1, saida: 0.4 },
  "gpt-4o": { entrada: 2.5, saida: 10 },
  "gpt-4o-2024-05-13": { entrada: 5, saida: 15 },
  "gpt-4o-mini": { entrada: 0.15, saida: 0.6 },
  o1: { entrada: 15, saida: 60 },
  o3: { entrada: 2, saida: 8 },
  "o3-mini": { entrada: 1.1, saida: 4.4 },
  "o4-mini": { entrada: 1.1, saida: 4.4 },
};

const SNAPSHOT_DATADO = /-(\d{4}-\d{2}-\d{2}|\d{4})$/;

/** Preço do modelo "fornecedor:modelo". Snapshot sem preço próprio usa o do modelo. */
export function precoPorMilhao(modeloId: string): Preco | null {
  if (!modeloId.startsWith("openai:")) return null;
  const nome = modeloId.slice("openai:".length);
  return TABELA[nome] ?? TABELA[nome.replace(SNAPSHOT_DATADO, "")] ?? null;
}
