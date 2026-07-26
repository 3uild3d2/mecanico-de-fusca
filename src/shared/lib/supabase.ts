import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getClientEnv } from "@/shared/config/env";
import type { Database } from "@/shared/lib/database.types";

// Cliente do navegador. Usa a publishable key, que é pública por natureza — o
// que protege os dados é a RLS, não o segredo da chave. Ver AGENTS.md §1.

let cliente: SupabaseClient<Database> | null = null;

export function getSupabase(): SupabaseClient<Database> {
  if (cliente) return cliente;

  const env = getClientEnv();

  cliente = createClient<Database>(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // O app é uma SPA: o Supabase precisa ler o token do fragmento da URL
      // depois do retorno do OAuth do Google.
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  });

  return cliente;
}
