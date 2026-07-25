import { z } from "zod";

// Config do servidor: segredos. Este módulo nunca pode chegar ao cliente —
// vite.config.ts bloqueia import de **/server/** no bundle do navegador.

const serverEnvSchema = z.object({
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1, "GOOGLE_GENERATIVE_AI_API_KEY é obrigatória"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => `  - ${issue.message}`).join("\n");
    throw new Error(`Configuração do servidor incompleta:\n${missing}`);
  }

  cached = parsed.data;
  return cached;
}
