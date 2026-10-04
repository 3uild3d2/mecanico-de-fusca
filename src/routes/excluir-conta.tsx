import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteCurrentAccount, signInWithGoogle, useAuthUser } from "@/features/auth/api";
import { ehAnonimo } from "@/features/auth/supabase-auth";

export const Route = createFileRoute("/excluir-conta")({
  head: () => ({
    meta: [
      { title: "Excluir conta — Mecânico de Fusca" },
      {
        name: "description",
        content: "Solicite a exclusão da sua conta e dos dados salvos no Mecânico de Fusca.",
      },
    ],
  }),
  component: ExcluirContaPage,
});

function ExcluirContaPage() {
  const user = useAuthUser();
  const navigate = useNavigate();
  const signedIn = Boolean(user && !ehAnonimo(user));

  const handleDelete = async () => {
    const confirmed = window.confirm(
      "Apagar sua conta e todos os dados salvos? Esta ação não pode ser desfeita.",
    );
    if (!confirmed) return;

    try {
      await deleteCurrentAccount();
      toast.success("Conta apagada.");
      navigate({ to: "/" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível apagar a conta.");
    }
  };

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error("Erro no login com Google:", error);
      toast.error(error instanceof Error ? error.message : "Não foi possível entrar com Google.");
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center garage-bg px-4 py-10">
      <section className="w-full max-w-lg rounded-2xl border border-border bg-background/85 p-6 shadow-xl backdrop-blur">
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <Trash2 className="size-5" />
        </div>
        <h1 className="font-display text-3xl tracking-wide text-foreground">Excluir conta</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Esta ação remove sua conta, conversas, ficha do veículo, histórico diagnóstico e anexos
          enviados. Depois de confirmar, não há recuperação.
        </p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Para proteger seus dados, entre com a mesma conta Google usada no app antes de apagar.
        </p>

        <div className="mt-6">
          {signedIn ? (
            <button
              type="button"
              onClick={() => void handleDelete()}
              className="w-full rounded-lg bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90"
            >
              Apagar minha conta e dados
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSignIn()}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Entrar com Google para apagar
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
