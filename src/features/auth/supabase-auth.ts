import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { getSupabase } from "@/shared/lib/supabase";

// Autenticação sobre o Supabase.
//
// Mesmo desenho de antes: entra anônimo para o histórico existir sem cadastro,
// e ao entrar com Google tenta VINCULAR a conta anônima em vez de criar outra,
// para não perder as conversas.

export type EstadoAuth = {
  user: User | null;
  session: Session | null;
  carregando: boolean;
};

let perfilSincronizadoPara: string | null = null;

async function sincronizarPerfil(session: Session | null) {
  if (!session || perfilSincronizadoPara === session.user.id) return;

  const response = await fetch("/api/auth/profile", {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(
      payload && typeof payload === "object" && "error" in payload
        ? String(payload.error)
        : "Não foi possível preparar seu perfil.",
    );
  }

  perfilSincronizadoPara = session.user.id;
}

/** Garante uma sessão, criando usuário anônimo se não houver nenhuma. */
export async function garantirSessao(): Promise<User> {
  const supabase = getSupabase();

  const { data } = await supabase.auth.getSession();
  if (data.session?.user) {
    await sincronizarPerfil(data.session);
    return data.session.user;
  }

  const { data: anon, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  if (!anon.user) throw new Error("Supabase não devolveu usuário anônimo.");

  await sincronizarPerfil(anon.session);

  return anon.user;
}

/**
 * Entra com Google. Se a sessão atual é anônima, usa linkIdentity para manter o
 * mesmo id de usuário — é isso que preserva o histórico criado antes do login.
 *
 * Quando a conta Google já existe, o Supabase recusa o vínculo; aí o caminho é
 * o login normal, e as conversas anônimas ficam órfãs. Mesmo comportamento que
 * o fluxo anterior tinha.
 */
export async function entrarComGoogle(): Promise<void> {
  const supabase = getSupabase();
  const redirectTo = `${window.location.origin}/`;

  const { data } = await supabase.auth.getSession();
  const anonimo = data.session?.user?.is_anonymous === true;

  if (anonimo) {
    const { error } = await supabase.auth.linkIdentity({
      provider: "google",
      options: { redirectTo },
    });
    if (!error) return;

    // Se o vínculo manual estiver desligado no Supabase, ou se a conta Google já
    // existir, cai para login normal. Melhor perder o vínculo anônimo do que
    // bloquear o acesso com Google.
    console.warn("Não foi possível vincular identidade Google; tentando login normal.", error);
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
  if (error) throw error;
}

export async function sair(): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;

  // Volta ao anônimo para o app continuar utilizável sem cadastro.
  await garantirSessao();
}

/** Assina o estado de autenticação. Chama garantirSessao na primeira montagem. */
export function useSupabaseAuth(): EstadoAuth {
  const [estado, setEstado] = useState<EstadoAuth>({
    user: null,
    session: null,
    carregando: true,
  });

  useEffect(() => {
    const supabase = getSupabase();
    let ativo = true;

    const { data: assinatura } = supabase.auth.onAuthStateChange((_evento, session) => {
      if (!ativo) return;
      setEstado({ user: session?.user ?? null, session, carregando: false });
      void sincronizarPerfil(session).catch((erro) => {
        console.error("Falha ao sincronizar perfil:", erro);
      });
    });

    void garantirSessao()
      .catch((erro) => {
        console.error("Falha ao iniciar sessão:", erro);
      })
      .finally(() => {
        if (ativo) setEstado((s) => ({ ...s, carregando: false }));
      });

    return () => {
      ativo = false;
      assinatura.subscription.unsubscribe();
    };
  }, []);

  return estado;
}

export function ehAnonimo(user: User | null): boolean {
  return user?.is_anonymous === true;
}

export function nomeExibicao(user: User | null): string {
  if (!user || ehAnonimo(user)) return "Visitante";
  const meta = user.user_metadata as { full_name?: string; name?: string } | undefined;
  return meta?.full_name ?? meta?.name ?? user.email ?? "Conta Google";
}
