import { z } from "zod";

// Config do cliente. Só variáveis VITE_*, que o Vite injeta no bundle e são
// públicas por definição — nada de segredo aqui. Segredos ficam em src/server/.

const clientEnvSchema = z.object({
  VITE_SUPABASE_URL: z.string().url("VITE_SUPABASE_URL precisa ser uma URL válida"),
  VITE_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1, "VITE_SUPABASE_PUBLISHABLE_KEY é obrigatória (Settings > API no dashboard)"),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;

let cached: ClientEnv | null = null;

/**
 * Valida a config do cliente na primeira chamada. Falhar aqui, com a lista
 * completa do que falta, é melhor do que quebrar quando o usuário abre o chat.
 */
export function getClientEnv(): ClientEnv {
  if (cached) return cached;

  // Acesso explícito a cada variável: em build de produção o Vite substitui
  // `import.meta.env.FOO` estaticamente. Ler o objeto inteiro depende de ele ser
  // materializado, o que é detalhe de implementação — assim é garantido.
  const parsed = clientEnvSchema.safeParse({
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  });
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => `  - ${issue.message}`).join("\n");
    throw new Error(
      `Configuração do Supabase incompleta:\n${missing}\n\nDefina essas variáveis no .env (veja .env.example).`,
    );
  }

  cached = parsed.data;
  return cached;
}
