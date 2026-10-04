import { createClient } from "@supabase/supabase-js";

import { getServerEnv } from "@/server/config/env";
import type { Database } from "@/shared/lib/database.types";

export function createSupabaseAdmin() {
  const env = getServerEnv();

  return createClient<Database>(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
