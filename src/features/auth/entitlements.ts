import { useQuery } from "@tanstack/react-query";

import { garantirSessao } from "@/features/auth/supabase-auth";
import { getSupabase } from "@/shared/lib/supabase";

/**
 * Direitos de acesso do usuário. O cliente apenas lê; `is_admin` e `plan` são
 * protegidos no banco por RLS + GRANT de coluna.
 */

export type Entitlements = {
  isAdmin: boolean;
  plan: "free" | "premium";
};

const ANONYMOUS_ENTITLEMENTS: Entitlements = { isAdmin: false, plan: "free" };
const ENTITLEMENTS_QUERY_KEY = ["entitlements"] as const;

async function fetchEntitlements(): Promise<Entitlements> {
  const user = await garantirSessao();
  const { data, error } = await getSupabase()
    .from("profiles")
    .select("is_admin,plan")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;

  return {
    isAdmin: data?.is_admin === true,
    plan: data?.plan === "premium" ? "premium" : "free",
  };
}

export function useEntitlements(): Entitlements {
  return (
    useQuery({ queryKey: ENTITLEMENTS_QUERY_KEY, queryFn: fetchEntitlements }).data ??
    ANONYMOUS_ENTITLEMENTS
  );
}

export function useEntitlementsReady(): boolean {
  return useQuery({ queryKey: ENTITLEMENTS_QUERY_KEY, queryFn: fetchEntitlements }).isSuccess;
}

export function useIsAdmin(): boolean {
  return useEntitlements().isAdmin;
}
