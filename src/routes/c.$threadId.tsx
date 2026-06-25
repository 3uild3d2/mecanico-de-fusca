import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { ChatApp } from "@/components/chat/ChatApp";
import { ensureThread } from "@/lib/threads";

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

  // localStorage is client-only; make sure the thread record exists before chatting.
  useEffect(() => {
    ensureThread(threadId);
    setReady(true);
  }, [threadId]);

  if (!ready) {
    return <div className="h-[100dvh] w-full garage-bg" />;
  }

  return <ChatApp threadId={threadId} />;
}
