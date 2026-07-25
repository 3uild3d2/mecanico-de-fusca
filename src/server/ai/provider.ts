import { createGoogleGenerativeAI } from "@ai-sdk/google";

export function createGoogleAiStudioProvider(apiKey: string) {
  return createGoogleGenerativeAI({ apiKey });
}
