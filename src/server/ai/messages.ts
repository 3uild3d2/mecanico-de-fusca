import { Buffer } from "node:buffer";
import type { UIMessage } from "ai";

import { JANELA_HISTORICO_MENSAGENS } from "@/features/chat/model";

import { TRIMMED_ATTACHMENT_NOTE } from "./prompt";

/**
 * Preparo das mensagens antes de mandar ao modelo.
 *
 * Duas defesas de custo vivem aqui:
 *
 * 1. Janela de histórico — só as últimas MAX_HISTORY_MESSAGES vão adiante. Sem
 *    isso o custo por mensagem cresce junto com a conversa, sem teto.
 * 2. Janela de anexos — só os anexos das últimas ATTACHMENT_WINDOW_MESSAGES são
 *    embutidos. A implementação anterior rebaixava e reconvertia para base64
 *    *todos* os anexos do histórico a *cada* requisição: uma conversa com 5
 *    fotos reenviava as 5 imagens inteiras em toda mensagem nova.
 */

export const MAX_HISTORY_MESSAGES = JANELA_HISTORICO_MENSAGENS;
export const ATTACHMENT_WINDOW_MESSAGES = 4;

const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX_BYTES = 64 * 1024 * 1024;

type FilePart = { type: "file"; url: string; mediaType?: string; filename?: string };

export class UnsupportedAttachmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedAttachmentError";
  }
}

export function isFilePart(part: unknown): part is FilePart {
  return (
    part != null &&
    typeof part === "object" &&
    "type" in part &&
    (part as { type: unknown }).type === "file" &&
    "url" in part &&
    typeof (part as { url: unknown }).url === "string"
  );
}

export function isRemoteUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

/** Só imagem e áudio. Vídeo é recusado no cliente e aqui de novo. */
export function assertSupportedMediaType(mediaType: string | undefined): void {
  if (!mediaType) return;
  if (mediaType.startsWith("video/")) {
    throw new UnsupportedAttachmentError("Vídeo não é suportado. Envie imagem ou áudio.");
  }
  if (!mediaType.startsWith("image/") && !mediaType.startsWith("audio/")) {
    throw new UnsupportedAttachmentError("Apenas imagem e áudio são suportados.");
  }
}

// ---------------------------------------------------------------------------
// Transformações puras
// ---------------------------------------------------------------------------

/** Mantém apenas as últimas N mensagens. */
export function applyHistoryWindow<T>(messages: T[], limit = MAX_HISTORY_MESSAGES): T[] {
  return messages.length <= limit ? messages : messages.slice(-limit);
}

/**
 * Troca anexos fora da janela recente por uma nota em texto. O modelo continua
 * sabendo que houve um anexo, sem pagar o custo de recebê-lo de novo.
 */
export function stripAttachmentsOutsideWindow(
  messages: UIMessage[],
  windowSize = ATTACHMENT_WINDOW_MESSAGES,
): UIMessage[] {
  const cutoff = messages.length - windowSize;
  if (cutoff <= 0) return messages;

  return messages.map((message, index) => {
    if (index >= cutoff) return message;
    if (!message.parts.some(isFilePart)) return message;

    return {
      ...message,
      parts: message.parts.map((part) =>
        isFilePart(part) ? { type: "text" as const, text: TRIMMED_ATTACHMENT_NOTE } : part,
      ),
    };
  });
}

// ---------------------------------------------------------------------------
// Cache de anexos
// ---------------------------------------------------------------------------

type CacheEntry = { dataUrl: string; bytes: number; at: number };

const cache = new Map<string, CacheEntry>();
let cacheBytes = 0;

function evictExpiredAndOverflow() {
  const now = Date.now();

  for (const [url, entry] of cache) {
    if (now - entry.at > CACHE_TTL_MS) {
      cache.delete(url);
      cacheBytes -= entry.bytes;
    }
  }

  // Map preserva ordem de inserção: o primeiro é o mais antigo.
  while (cacheBytes > CACHE_MAX_BYTES && cache.size > 0) {
    const [url, entry] = cache.entries().next().value!;
    cache.delete(url);
    cacheBytes -= entry.bytes;
  }
}

export function clearAttachmentCache() {
  cache.clear();
  cacheBytes = 0;
}

export function getAttachmentCacheStats() {
  return { entries: cache.size, bytes: cacheBytes };
}

type FetchLike = (url: string) => Promise<Response>;

/** Baixa o anexo e converte para data URL, servindo do cache quando possível. */
export async function fetchAsDataUrl(
  url: string,
  fallbackMediaType?: string,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.at <= CACHE_TTL_MS) {
    return cached.dataUrl;
  }

  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Não foi possível baixar o anexo (HTTP ${response.status}).`);
  }

  const mediaType =
    response.headers.get("content-type") ?? fallbackMediaType ?? "application/octet-stream";
  assertSupportedMediaType(mediaType);

  const buffer = Buffer.from(await response.arrayBuffer());
  const dataUrl = `data:${mediaType};base64,${buffer.toString("base64")}`;

  cache.set(url, { dataUrl, bytes: dataUrl.length, at: Date.now() });
  cacheBytes += dataUrl.length;
  evictExpiredAndOverflow();

  return dataUrl;
}

// ---------------------------------------------------------------------------
// Orquestração
// ---------------------------------------------------------------------------

async function inlineAttachments(
  messages: UIMessage[],
  fetchImpl: FetchLike = fetch,
): Promise<UIMessage[]> {
  return Promise.all(
    messages.map(async (message) => {
      if (!message.parts.some(isFilePart)) return message;

      return {
        ...message,
        parts: await Promise.all(
          message.parts.map(async (part) => {
            if (!isFilePart(part)) return part;

            assertSupportedMediaType(part.mediaType);
            if (!isRemoteUrl(part.url)) return part;

            return { ...part, url: await fetchAsDataUrl(part.url, part.mediaType, fetchImpl) };
          }),
        ),
      };
    }),
  );
}

/**
 * Aplica janela de histórico, poda anexos antigos e embute os recentes.
 * A ordem importa: podar antes de embutir evita baixar o que seria descartado.
 */
export async function prepareModelMessages(
  messages: UIMessage[],
  fetchImpl: FetchLike = fetch,
): Promise<UIMessage[]> {
  const windowed = applyHistoryWindow(messages);
  const pruned = stripAttachmentsOutsideWindow(windowed);
  return inlineAttachments(pruned, fetchImpl);
}
