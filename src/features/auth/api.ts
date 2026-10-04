import { useSupabaseAuth, entrarComGoogle, sair } from "./supabase-auth";
import { reloadThreadsForCurrentUser } from "@/features/chat/api";
import { getSupabase } from "@/shared/lib/supabase";

export function useAuthUser() {
  return useSupabaseAuth().user;
}

export function useAuthReady() {
  return !useSupabaseAuth().carregando;
}

export async function signInWithGoogle() {
  await entrarComGoogle();
  await reloadThreadsForCurrentUser();
}

export async function signOutToAnonymous() {
  await sair();
  await reloadThreadsForCurrentUser();
}

export async function deleteCurrentAccount() {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) throw new Error("Sessão ausente.");

  const response = await fetch("/api/account", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(
      payload && typeof payload === "object" && "error" in payload
        ? String(payload.error)
        : "Não foi possível apagar a conta.",
    );
  }

  await supabase.auth.signOut();
  await reloadThreadsForCurrentUser();
}
