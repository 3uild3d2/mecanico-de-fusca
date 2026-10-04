import { z } from "zod";

// Config do servidor: segredos. Este módulo nunca pode chegar ao cliente —
// vite.config.ts bloqueia import de **/server/** no bundle do navegador.

const serverEnvSchema = z.object({
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1, "GOOGLE_GENERATIVE_AI_API_KEY é obrigatória"),
  VITE_SUPABASE_URL: z.string().url("VITE_SUPABASE_URL precisa ser uma URL válida"),
  SUPABASE_SECRET_KEY: z.string().min(1, "SUPABASE_SECRET_KEY é obrigatória"),
  // Opcional: sem ela o app segue só com o modelo padrão (Gemini). O nome NÃO
  // é OPENAI_API_KEY de propósito: nesta máquina existe uma OPENAI_API_KEY de
  // outra ferramenta nas variáveis do Windows, e carregadores de .env não
  // sobrescrevem variável que já existe — o app usaria a conta errada calado.
  MECANICO_OPENAI_API_KEY: z.string().min(1).optional(),
  // Seletor de modelos do benchmark. Só "ligado" ativa; fica fora do .env de
  // produção, então lá o servidor ignora qualquer escolha vinda do cliente.
  SELETOR_MODELOS: z.enum(["ligado", "desligado"]).optional(),
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
