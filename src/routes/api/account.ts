import { createFileRoute } from "@tanstack/react-router";

import { createSupabaseAdmin } from "@/server/supabase";

const BUCKET = "anexos";

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

async function listarObjetosDoUsuario(
  admin: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
) {
  const objetos: string[] = [];
  const { data: pastas, error: pastasError } = await admin.storage.from(BUCKET).list(userId, {
    limit: 1000,
  });

  if (pastasError) throw pastasError;

  for (const pasta of pastas ?? []) {
    const prefixo = `${userId}/${pasta.name}`;
    const { data: arquivos, error: arquivosError } = await admin.storage
      .from(BUCKET)
      .list(prefixo, {
        limit: 1000,
      });

    if (arquivosError) throw arquivosError;
    for (const arquivo of arquivos ?? []) objetos.push(`${prefixo}/${arquivo.name}`);
  }

  return objetos;
}

export const Route = createFileRoute("/api/account")({
  server: {
    handlers: {
      DELETE: async ({ request }) => {
        const token = getBearerToken(request);
        if (!token) return jsonError("Sessão ausente.", 401);

        try {
          const admin = createSupabaseAdmin();
          const { data: authData, error: authError } = await admin.auth.getUser(token);
          if (authError || !authData.user) return jsonError("Sessão inválida.", 401);

          const userId = authData.user.id;
          const objetos = await listarObjetosDoUsuario(admin, userId);
          if (objetos.length > 0) {
            const { error: storageError } = await admin.storage.from(BUCKET).remove(objetos);
            if (storageError) throw storageError;
          }

          const { error: rpcError } = await admin.rpc("apagar_conta", { alvo: userId });
          if (rpcError) throw rpcError;

          return Response.json({ ok: true });
        } catch (error) {
          console.error("[api/account] falha ao apagar conta", error);
          return jsonError("Não foi possível apagar a conta agora.", 500);
        }
      },
    },
  },
});
