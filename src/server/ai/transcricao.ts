import { Buffer } from "node:buffer";

import { createOpenAI } from "@ai-sdk/openai";
import { experimental_transcribe as transcribe } from "ai";

import type { ServerEnv } from "@/server/config/env";

// Transcrição da fala gravada no chat. Os modelos GPT de conversa não ouvem
// áudio; desde 2026-10-04 o áudio é transcrito no envio e só o texto vai ao
// mecânico (decisão do dono, ver docs/CONTEXTO.md).

/**
 * O mais barato da tabela oficial em 2026-10-04 (US$ 0,0045/minuto) e aceita
 * webm, que é o que o navegador grava. Precisa estar liberado no projeto da
 * OpenAI — whisper-1 é a reserva.
 */
export const MODELO_TRANSCRICAO = "gpt-transcribe";

/** Vocabulário de oficina: sem ele, "platinado" vira "platinada" e "Solex" vira "Solé". */
const VOCABULARIO =
  "Conversa sobre Fusca (VW refrigerado a ar): carburador Solex, platinado, condensador, bobina, distribuidor, tucho, cabeçote, virabrequim, dínamo, alternador, ventoinha, cordoalha, partida a frio, tanquinho.";

/** Teto do áudio aceito: ~2 minutos de webm/opus com folga. */
export const MAX_BYTES_AUDIO = 5 * 1024 * 1024;

/**
 * O servidor só baixa áudio que é do próprio app: embutido na requisição ou no
 * bucket de anexos do projeto. Qualquer outro destino é recusado — sem isso,
 * alguém faria o servidor acessar endereços internos (SSRF).
 */
export function urlDeAudioPermitida(url: string, supabaseUrl: string): boolean {
  if (url.startsWith("data:")) return url.startsWith("data:audio/");
  const prefixo = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/anexos/`;
  return url.startsWith(prefixo) && !url.includes("..");
}

export function decodificarDataUrl(url: string): { mediaType: string; bytes: Uint8Array } {
  const casamento = /^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/s.exec(url);
  if (!casamento) throw new Error("Áudio embutido fora do formato esperado (base64).");
  return { mediaType: casamento[1]!, bytes: Buffer.from(casamento[2]!, "base64") };
}

async function baixarAudio(url: string): Promise<Uint8Array> {
  if (url.startsWith("data:")) return decodificarDataUrl(url).bytes;

  // redirect: "error" — um redirecionamento poderia levar a destino não permitido.
  const resposta = await fetch(url, { redirect: "error" });
  if (!resposta.ok) throw new Error(`Não foi possível baixar o áudio (HTTP ${resposta.status}).`);
  return new Uint8Array(await resposta.arrayBuffer());
}

export async function transcreverAudio(url: string, env: ServerEnv): Promise<string> {
  if (!urlDeAudioPermitida(url, env.VITE_SUPABASE_URL)) {
    throw new Error("Endereço de áudio não permitido.");
  }
  if (!env.MECANICO_OPENAI_API_KEY) {
    throw new Error("MECANICO_OPENAI_API_KEY não está configurada no .env.");
  }

  const audio = await baixarAudio(url);
  if (audio.byteLength > MAX_BYTES_AUDIO) throw new Error("Áudio longo demais.");

  const openai = createOpenAI({ apiKey: env.MECANICO_OPENAI_API_KEY });
  const { text } = await transcribe({
    model: openai.transcription(MODELO_TRANSCRICAO),
    audio,
    providerOptions: { openai: { language: "pt", prompt: VOCABULARIO } },
  });
  return text;
}
