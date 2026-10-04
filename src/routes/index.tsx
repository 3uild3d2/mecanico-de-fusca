import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";

import { createThread, getThreads, waitForThreadsReady } from "@/features/chat/api";
import fuscaLogo from "@/assets/fusca-logo.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mecânico de Fusca — Diagnóstico e reparo do seu Fusca" },
      {
        name: "description",
        content:
          "Chatbot especialista em mecânica de VW Fusca. Tire dúvidas, diagnostique sintomas e resolva problemas do motor a ar com orientação passo a passo.",
      },
      { property: "og:title", content: "Mecânico de Fusca" },
      {
        property: "og:description",
        content:
          "Seu mestre mecânico virtual especialista em VW Fusca a ar. Diagnóstico e reparos passo a passo.",
      },
    ],
  }),
  component: Index,
});

// Single idempotent bootstrap: pick the most recent thread or create one, then
// navigate to its dedicated route so reloads restore the right conversation.
function Index() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    async function bootstrapThread() {
      try {
        await waitForThreadsReady();
        if (cancelled) return;

        const existing = getThreads();
        const thread = existing.length > 0 ? existing[0] : await createThread();
        if (cancelled) return;

        navigate({
          to: "/c/$threadId",
          params: { threadId: thread.id },
          replace: true,
        });
      } catch {
        toast.error("Não foi possível carregar suas conversas.");
      }
    }

    void bootstrapThread();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="flex h-[100dvh] w-full flex-col items-center justify-center gap-4 garage-bg">
      <img
        src={fuscaLogo}
        alt="Mecânico de Fusca"
        width={1024}
        height={1024}
        className="size-20 animate-pulse object-contain"
      />
      <p className="font-display text-2xl tracking-wide text-foreground">Mecânico de Fusca</p>
      <p className="text-sm text-muted-foreground">Aquecendo o motor...</p>
    </div>
  );
}
