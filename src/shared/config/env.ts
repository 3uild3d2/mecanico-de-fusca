import { z } from "zod";

// Config do cliente. Só variáveis VITE_*, que o Vite injeta no bundle e são
// públicas por definição — nada de segredo aqui. Segredos ficam em src/server/.

const clientEnvSchema = z.object({
  VITE_SUPABASE_URL: z.string().url("VITE_SUPABASE_URL precisa ser uma URL válida"),
  VITE_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1, "VITE_SUPABASE_PUBLISHABLE_KEY é obrigatória (Settings > API no dashboard)"),

  // Firebase sai de cena ao fim da Fase 2; opcional enquanto os dois coexistem.
  VITE_FIREBASE_API_KEY: z.string().min(1, "VITE_FIREBASE_API_KEY é obrigatória"),
  VITE_FIREBASE_AUTH_DOMAIN: z.string().min(1, "VITE_FIREBASE_AUTH_DOMAIN é obrigatória"),
  VITE_FIREBASE_PROJECT_ID: z.string().min(1, "VITE_FIREBASE_PROJECT_ID é obrigatória"),
  VITE_FIREBASE_STORAGE_BUCKET: z.string().min(1, "VITE_FIREBASE_STORAGE_BUCKET é obrigatória"),
  VITE_FIREBASE_MESSAGING_SENDER_ID: z.string().optional(),
  VITE_FIREBASE_APP_ID: z.string().min(1, "VITE_FIREBASE_APP_ID é obrigatória"),
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
    VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
    VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
  });
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => `  - ${issue.message}`).join("\n");
    throw new Error(
      `Configuração do Firebase incompleta:\n${missing}\n\nDefina essas variáveis no .env (veja .env.example).`,
    );
  }

  cached = parsed.data;
  return cached;
}
