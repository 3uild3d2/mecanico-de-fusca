// Histórico temporal do veículo — lógica pura, sem I/O.
//
// Não é um diário de manutenção: é memória diagnóstica. O usuário abre o app
// para resolver problema, então o histórico existe para virar contexto no
// próximo diagnóstico, não para ser lido como relatório.
//
// Duas consequências de desenho:
//
// 1. Desfecho desconhecido é normal e continua valendo. "Identificamos problema
//    na bobina, não sei se trocou" é informação diagnóstica legítima — diz que
//    este carro já teve suspeita naquele sistema. Forçar o usuário a fechar o
//    ciclo faria o histórico morrer por atrito.
//
// 2. Cada evento é UMA LINHA CURTA. Brevidade aqui não é estética: o histórico
//    inteiro entra no contexto de toda conversa, e linha longa é custo por
//    mensagem que se paga para sempre.

export type TipoEvento = "diagnostico" | "servico" | "observacao";

/** Em que pé ficou a suspeita. `sem_retorno` é o caso mais comum e é esperado. */
export type Desfecho = "suspeita" | "confirmado" | "descartado" | "sem_retorno";

export type SistemaVeiculo =
  | "motor"
  | "eletrica"
  | "carburacao"
  | "ignicao"
  | "freios"
  | "suspensao"
  | "cambio"
  | "arrefecimento"
  | "outro";

export type VehicleEvent = {
  id: string;
  tipo: TipoEvento;
  /** Uma linha, direta. Ex.: "Problema na bobina", "Troca das 4 velas". */
  titulo: string;
  sistema?: SistemaVeiculo;
  desfecho?: Desfecho;
  /** Quando o fato ocorreu — pode ser anterior ao registro. */
  data: number;
  km?: number;
  /** Conversa que originou o registro, para rastrear de volta. */
  threadId?: string;
  origem: "agente" | "usuario";
  criadoEm: number;
};

export const MAX_TITULO_LENGTH = 80;

/** Quantos eventos recentes sempre entram no contexto. */
export const EVENTOS_RECENTES = 10;
/** Teto absoluto de linhas no contexto, para o custo não crescer sem limite. */
export const MAX_EVENTOS_CONTEXTO = 25;

const DESFECHO_LABEL: Record<Desfecho, string> = {
  suspeita: "suspeita levantada",
  confirmado: "confirmado que era o problema",
  descartado: "descartado",
  sem_retorno: "sem confirmação de que foi resolvido",
};

/** Corta e normaliza o título. Linha curta é requisito, não preferência. */
export function normalizeTitulo(titulo: string): string {
  const limpo = titulo.replace(/\s+/g, " ").trim();
  if (limpo.length <= MAX_TITULO_LENGTH) return limpo;
  return `${limpo.slice(0, MAX_TITULO_LENGTH - 1).trimEnd()}…`;
}

function formatData(timestamp: number): string {
  const data = new Date(timestamp);
  const dia = String(data.getDate()).padStart(2, "0");
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${data.getFullYear()}`;
}

/**
 * Renderiza um evento como uma linha para o contexto do modelo.
 * Ex.: "12/03/2026 · Problema na bobina — sem confirmação de que foi resolvido"
 */
export function formatEventLine(event: VehicleEvent): string {
  const partes = [formatData(event.data), "·", normalizeTitulo(event.titulo)];

  if (event.km) partes.push(`(${event.km.toLocaleString("pt-BR")} km)`);
  if (event.desfecho) partes.push(`— ${DESFECHO_LABEL[event.desfecho]}`);

  return partes.join(" ");
}

/**
 * Seleciona quais eventos entram no contexto: os mais recentes sempre, mais os
 * antigos que tocam o sistema em questão. Mesmo princípio da janela de anexos —
 * relevância em vez de despejar tudo.
 */
export function selectEventsForContext(
  events: VehicleEvent[],
  sistemaEmFoco?: SistemaVeiculo,
): VehicleEvent[] {
  const ordenados = [...events].sort((a, b) => b.data - a.data);

  const recentes = ordenados.slice(0, EVENTOS_RECENTES);
  const idsRecentes = new Set(recentes.map((e) => e.id));

  const relevantes = sistemaEmFoco
    ? ordenados.filter((e) => e.sistema === sistemaEmFoco && !idsRecentes.has(e.id))
    : [];

  return [...recentes, ...relevantes]
    .slice(0, MAX_EVENTOS_CONTEXTO)
    .sort((a, b) => b.data - a.data);
}

/**
 * Detecta sintoma que já apareceu antes. Recorrência é sinal diagnóstico forte:
 * se o problema voltou, a "solução" anterior não resolveu — ou a causa real é
 * outra, a montante.
 */
export function findRecurrences(events: VehicleEvent[], sistema: SistemaVeiculo): VehicleEvent[] {
  return events
    .filter((e) => e.sistema === sistema && e.tipo === "diagnostico")
    .sort((a, b) => b.data - a.data);
}

/** Monta o bloco de histórico para o prompt. Retorna null quando não há nada. */
export function buildHistoryContext(
  events: VehicleEvent[],
  sistemaEmFoco?: SistemaVeiculo,
): string | null {
  if (events.length === 0) return null;

  const selecionados = selectEventsForContext(events, sistemaEmFoco);
  if (selecionados.length === 0) return null;

  const linhas = selecionados.map((e) => `- ${formatEventLine(e)}`).join("\n");

  const recorrencias = sistemaEmFoco ? findRecurrences(events, sistemaEmFoco) : [];
  const alerta =
    recorrencias.length >= 2
      ? `\n\nATENÇÃO: este carro já teve ${recorrencias.length} episódios registrados em ${sistemaEmFoco}. Se o sintoma voltou, considere que a causa real pode estar a montante do que foi tratado antes.`
      : "";

  return `## Histórico deste carro\n\nDo mais recente para o mais antigo:\n\n${linhas}${alerta}`;
}
