import type { UIMessage } from "ai";

// Lógica pura do domínio "conversa": tipos, derivação de título e saneamento de
// mensagens. Sem I/O — é o que os testes cobrem. Acesso a dados fica em api.ts.

export type Thread = {
  id: string;
  title: string;
  titleEdited?: boolean;
  updatedAt: number;
  messages: UIMessage[];
};

export const NEW_THREAD_TITLE = "Nova conversa";
export const MAX_TITLE_LENGTH = 60;

const TITLE_STOPWORDS = new Set([
  "a",
  "ao",
  "aos",
  "as",
  "com",
  "como",
  "da",
  "das",
  "de",
  "demais",
  "desse",
  "dessa",
  "do",
  "dos",
  "e",
  "ele",
  "em",
  "enviada",
  "enviado",
  "esta",
  "está",
  "estao",
  "estão",
  "esse",
  "essa",
  "eu",
  "faço",
  "faco",
  "faz",
  "foi",
  "me",
  "meu",
  "minha",
  "na",
  "nas",
  "no",
  "nos",
  "o",
  "os",
  "para",
  "por",
  "que",
  "qual",
  "se",
  "sem",
  "um",
  "uma",
]);

// Ordem importa: o primeiro padrão que casar define o título.
const TOPIC_RULES: Array<{ match: RegExp; title: string | ((text: string) => string) }> = [
  { match: /superaquec|esquent|temperatura|ferv/, title: "Superaquecimento Motor" },
  {
    match: /valvul/,
    title: (text) => (/regulag|regular|folga/.test(text) ? "Regulagem Válvulas" : "Válvulas Motor"),
  },
  {
    match: /partida|arranque|pegar|liga/,
    title: (text) => (/frio|manha/.test(text) ? "Partida Fria" : "Partida Motor"),
  },
  { match: /ignic|ponto/, title: "Ponto Ignição" },
  {
    match: /carbur/,
    title: (text) => (/regulag|regular/.test(text) ? "Regulagem Carburador" : "Carburador Fusca"),
  },
  { match: /freio/, title: "Freios Fusca" },
  { match: /embreag/, title: "Embreagem Fusca" },
  { match: /oleo|lubrific/, title: "Óleo Motor" },
  { match: /fumac|fumaça/, title: "Fumaça Motor" },
  { match: /barulh|ruido|ruído/, title: "Barulho Motor" },
  { match: /bateria|alternador|dinamo|dínamo|eletric/, title: "Elétrica Fusca" },
  { match: /vazament/, title: "Vazamento Motor" },
  { match: /consumo|gastando/, title: "Consumo Combustível" },
  { match: /cambio|câmbio|marcha/, title: "Câmbio Marchas" },
  { match: /suspens|amortec/, title: "Suspensão Fusca" },
  { match: /direcao|direção/, title: "Direção Fusca" },
  { match: /foto|imagem/, title: "Análise Imagem" },
  { match: /audio|áudio|som/, title: "Análise Áudio" },
];

export function getMessageText(message: UIMessage): string {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join(" ")
    .trim();
}

function normalizeForTitle(value: string): string {
  // NFD separa o acento da letra; \p{Mn} remove os acentos assim isolados.
  return value
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase();
}

function titleCaseWord(word: string): string {
  const lower = word.toLocaleLowerCase("pt-BR");
  return `${lower.charAt(0).toLocaleUpperCase("pt-BR")}${lower.slice(1)}`;
}

export function normalizeManualTitle(title: string): string {
  const normalized = title.replace(/\s+/g, " ").trim();
  if (!normalized) return NEW_THREAD_TITLE;
  return normalized.length > MAX_TITLE_LENGTH
    ? normalized.slice(0, MAX_TITLE_LENGTH).trim()
    : normalized;
}

export function knownTopicTitle(text: string): string | null {
  const normalized = normalizeForTitle(text);

  for (const rule of TOPIC_RULES) {
    if (!rule.match.test(normalized)) continue;
    return typeof rule.title === "function" ? rule.title(normalized) : rule.title;
  }

  return null;
}

/**
 * Deriva um título a partir das mensagens do usuário. Retorna null enquanto o
 * assistente não tiver respondido, para não nomear a conversa cedo demais.
 */
export function deriveTitle(messages: UIMessage[]): string | null {
  const hasAssistantReply = messages.some(
    (message) => message.role === "assistant" && getMessageText(message).length > 0,
  );
  if (!hasAssistantReply) return null;

  const text = messages
    .filter((message) => message.role === "user")
    .map(getMessageText)
    .join(" ")
    .trim();
  if (!text) return null;

  const knownTitle = knownTopicTitle(text);
  if (knownTitle) return knownTitle;

  const words = text.match(/[A-Za-zÀ-ÖØ-öø-ÿ0-9]+/g) ?? [];
  const titleWords: string[] = [];
  const used = new Set<string>();

  for (const word of words) {
    const normalized = normalizeForTitle(word);
    if (normalized.length < 3 || TITLE_STOPWORDS.has(normalized) || used.has(normalized)) continue;
    used.add(normalized);
    titleWords.push(titleCaseWord(word));
    if (titleWords.length === 3) break;
  }

  if (titleWords.length === 0) return null;
  if (titleWords.length === 1) titleWords.push("Fusca");
  return titleWords.join(" ");
}

/** Decide o título de uma thread após novas mensagens, respeitando edição manual. */
export function nextThreadTitle(
  thread: Pick<Thread, "title" | "titleEdited">,
  messages: UIMessage[],
) {
  if (thread.titleEdited || thread.title !== NEW_THREAD_TITLE) return thread.title;
  return deriveTitle(messages) ?? thread.title;
}

/**
 * Remove anexos locais (data:/blob:) antes de persistir: são pesados, efêmeros e
 * já foram enviados ao Storage. O clone via JSON também elimina undefined antes
 * de persistir.
 */
export function sanitizeMessages(messages: UIMessage[]): UIMessage[] {
  const sanitized = messages.map((message) => ({
    ...message,
    parts: message.parts.filter(
      (part) =>
        !(
          part.type === "file" &&
          typeof part.url === "string" &&
          (part.url.startsWith("data:") || part.url.startsWith("blob:"))
        ),
    ),
  }));

  return JSON.parse(JSON.stringify(sanitized)) as UIMessage[];
}

export function sanitizeThread(thread: Thread) {
  return {
    id: thread.id,
    title: thread.title,
    titleEdited: thread.titleEdited === true,
    updatedAt: thread.updatedAt,
    messages: sanitizeMessages(thread.messages),
  };
}
