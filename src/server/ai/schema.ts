import { z } from "zod";

// Validação do payload de /api/chat. Antes o handler fazia `as UIMessage[]` —
// um cast, que não verifica nada em tempo de execução.

export const MAX_MESSAGES_PER_REQUEST = 200;
export const MAX_PARTS_PER_MESSAGE = 32;

const textPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

const filePartSchema = z.object({
  type: z.literal("file"),
  url: z.string().min(1),
  mediaType: z.string().optional(),
  filename: z.string().optional(),
});

/**
 * Partes que o app não gera mas o AI SDK pode adicionar (step-start, reasoning,
 * tool-*). Passam adiante sem validação profunda: rejeitar o desconhecido
 * quebraria a cada atualização do SDK.
 */
const passthroughPartSchema = z
  .object({ type: z.string() })
  .passthrough()
  .refine((part) => part.type !== "text" && part.type !== "file", {
    message: "Parte inválida para o tipo declarado",
  });

const messagePartSchema = z.union([textPartSchema, filePartSchema, passthroughPartSchema]);

const uiMessageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(["system", "user", "assistant"]),
  parts: z.array(messagePartSchema).max(MAX_PARTS_PER_MESSAGE),
  metadata: z.unknown().optional(),
});

const vehicleSchema = z.record(z.string(), z.string()).nullable().optional();

export const SISTEMAS = [
  "motor",
  "eletrica",
  "carburacao",
  "ignicao",
  "freios",
  "suspensao",
  "cambio",
  "arrefecimento",
  "outro",
] as const;

/** Teto de eventos aceitos por requisição — o cliente já envia só o recorte. */
export const MAX_EVENTS_PER_REQUEST = 60;

const vehicleEventSchema = z.object({
  id: z.string(),
  tipo: z.enum(["diagnostico", "servico", "observacao"]),
  titulo: z.string().min(1),
  sistema: z.enum(SISTEMAS).optional(),
  desfecho: z.enum(["suspeita", "confirmado", "descartado", "sem_retorno"]).optional(),
  data: z.number(),
  km: z.number().optional(),
  threadId: z.string().optional(),
  origem: z.enum(["agente", "usuario"]),
  criadoEm: z.number(),
});

export const chatRequestSchema = z.object({
  messages: z.array(uiMessageSchema).min(1).max(MAX_MESSAGES_PER_REQUEST),
  vehicle: vehicleSchema,
  events: z.array(vehicleEventSchema).max(MAX_EVENTS_PER_REQUEST).optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

/** Erro de validação legível, para virar 400 em vez de 500. */
export function formatValidationError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "payload"}: ${issue.message}`)
    .join("; ");
}
