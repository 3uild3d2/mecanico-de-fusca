import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

import type { ServerEnv } from "@/server/config/env";

import { MODELO_PADRAO, filtrarModelosDeChat, parseModeloId } from "./modelos";

export function createGoogleAiStudioProvider(apiKey: string) {
  return createGoogleGenerativeAI({ apiKey });
}

export function seletorLigado(env: ServerEnv): boolean {
  return env.SELETOR_MODELOS === "ligado";
}

/** Cria o modelo a partir do id "fornecedor:modelo". Falha alto se faltar chave. */
export function criarModelo(id: string, env: ServerEnv): LanguageModel {
  const parsed = parseModeloId(id);
  if (!parsed) throw new Error(`Modelo inválido: ${id}`);

  if (parsed.fornecedor === "openai") {
    if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY não está configurada no .env.");
    return createOpenAI({ apiKey: env.OPENAI_API_KEY })(parsed.modelo);
  }
  return createGoogleAiStudioProvider(env.GOOGLE_GENERATIVE_AI_API_KEY)(parsed.modelo);
}

// A lista da OpenAI muda pouco; consultar a cada mensagem seria desperdício.
const CACHE_MODELOS_MS = 10 * 60 * 1000;
let cacheModelos: { ids: string[]; em: number } | null = null;

async function listarModelosOpenAI(apiKey: string): Promise<string[]> {
  if (cacheModelos && Date.now() - cacheModelos.em < CACHE_MODELOS_MS) return cacheModelos.ids;

  const resposta = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!resposta.ok) throw new Error(`OpenAI /v1/models respondeu HTTP ${resposta.status}`);

  const corpo: unknown = await resposta.json();
  const dados =
    corpo && typeof corpo === "object" && "data" in corpo && Array.isArray(corpo.data)
      ? corpo.data
      : [];
  const ids = filtrarModelosDeChat(
    dados.flatMap((m: unknown) =>
      m && typeof m === "object" && "id" in m && typeof m.id === "string" ? [m.id] : [],
    ),
  );

  cacheModelos = { ids, em: Date.now() };
  return ids;
}

/**
 * Modelos que o seletor oferece: o padrão (referência) e os de chat da OpenAI
 * disponíveis para a chave configurada. A lista vem da própria API, não de um
 * catálogo escrito à mão — assim não oferece modelo que a conta não tem.
 */
export async function modelosDisponiveis(env: ServerEnv): Promise<string[]> {
  if (!env.OPENAI_API_KEY) return [MODELO_PADRAO];
  try {
    const openai = await listarModelosOpenAI(env.OPENAI_API_KEY);
    return [MODELO_PADRAO, ...openai.map((m) => `openai:${m}`)];
  } catch (error) {
    console.error("[modelos] não foi possível listar os modelos da OpenAI", error);
    return [MODELO_PADRAO];
  }
}
