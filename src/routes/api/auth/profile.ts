import { createFileRoute } from "@tanstack/react-router";

import { createSupabaseAdmin } from "@/server/supabase";

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function nomeDoUsuario(user: { user_metadata: unknown; email?: string | null }) {
  const meta = user.user_metadata as { full_name?: string; name?: string } | null;
  return meta?.full_name ?? meta?.name ?? user.email ?? null;
}

export const Route = createFileRoute("/api/auth/profile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = getBearerToken(request);
        if (!token) return jsonError("Sessão ausente.", 401);

        try {
          const admin = createSupabaseAdmin();
          const { data, error: authError } = await admin.auth.getUser(token);
          if (authError || !data.user) return jsonError("Sessão inválida.", 401);

          const { error } = await admin.from("profiles").upsert(
            {
              id: data.user.id,
              display_name: nomeDoUsuario(data.user),
              email: data.user.email ?? null,
            },
            { onConflict: "id" },
          );

          if (error) throw error;

          return Response.json({ ok: true });
        } catch (error) {
          console.error("[api/auth/profile] falha ao sincronizar perfil", error);
          return jsonError("Não foi possível preparar seu perfil.", 500);
        }
      },
    },
  },
});
