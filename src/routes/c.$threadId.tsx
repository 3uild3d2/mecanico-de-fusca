import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ChatApp } from "@/features/chat/components/ChatApp";
import { ensureThread } from "@/features/chat/api";

export const Route = createFileRoute("/c/$threadId")({
  head: () => ({
    meta: [
      { title: "Conversa — Mecânico de Fusca" },
      {
        name: "description",
        content:
          "Converse com o Mecânico de Fusca, especialista em diagnóstico e reparo do VW Fusca a ar.",
      },
    ],
  }),
  component: ThreadPage,
});

function ThreadPage() {
  const { threadId } = useParams({ from: "/c/$threadId" });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadThread() {
      try {
        await ensureThread(threadId);
        if (!cancelled) setReady(true);
      } catch {
        toast.error("Não foi possível carregar esta conversa do Firebase.");
      }
    }

    setReady(false);
    void loadThread();

    return () => {
      cancelled = true;
    };
  }, [threadId]);

  if (!ready) {
    return <div className="h-[100dvh] w-full garage-bg" />;
  }

  return <ChatApp threadId={threadId} />;
}
