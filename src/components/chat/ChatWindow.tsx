import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Wrench } from "lucide-react";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { getThread, saveThreadMessages } from "@/lib/threads";
import fuscaLogo from "@/assets/fusca-logo.png";

const transport = new DefaultChatTransport({ api: "/api/chat" });

const SUGGESTIONS = [
  "Meu Fusca está esquentando demais, o que pode ser?",
  "Como faço a regulagem das válvulas?",
  "Está difícil dar partida de manhã, o que verifico?",
  "Qual o ponto de ignição ideal do motor 1600?",
];

export function ChatWindow({ threadId }: { threadId: string }) {
  const initial = getThread(threadId);
  const composerRef = useRef<HTMLDivElement | null>(null);

  const { messages, sendMessage, status } = useChat({
    id: threadId,
    messages: initial?.messages ?? [],
    transport,
    onError: (error) => {
      toast.error(
        error.message?.includes("402")
          ? "Os créditos de IA acabaram. Adicione créditos para continuar."
          : error.message?.includes("429")
            ? "Muitas mensagens em sequência. Aguarde um instante e tente de novo."
            : "Algo deu errado ao falar com o mecânico. Tente novamente."
      );
    },
  });

  const isLoading = status === "submitted" || status === "streaming";

  // Persist messages for this thread whenever they change.
  useEffect(() => {
    if (messages.length > 0) {
      saveThreadMessages(threadId, messages);
    }
  }, [messages, threadId]);

  // Keep the composer focused for fast back-and-forth.
  useEffect(() => {
    if (!isLoading) {
      composerRef.current?.querySelector("textarea")?.focus();
    }
  }, [isLoading, threadId]);

  const handleSubmit = (message: PromptInputMessage) => {
    const text = message.text?.trim();
    if (!text || isLoading) return;
    sendMessage({ text });
  };

  const sendSuggestion = (text: string) => {
    if (isLoading) return;
    sendMessage({ text });
  };

  return (
    <div className="flex h-full flex-col">
      <Conversation className="flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl gap-6 px-4 py-6">
          {messages.length === 0 ? (
            <div className="flex size-full flex-col items-center justify-center gap-4 py-10 text-center">
              <img
                src={fuscaLogo}
                alt="Mecânico de Fusca"
                width={1024}
                height={1024}
                className="size-24 object-contain"
              />
              <div className="space-y-1.5">
                <h2 className="text-3xl font-display tracking-wide text-foreground">
                  Bem-vindo à oficina!
                </h2>
                <p className="mx-auto max-w-md text-sm text-muted-foreground">
                  Sou o Mecânico de Fusca. Me conte o sintoma, o ano e o motor
                  do seu carro que a gente diagnostica juntos.
                </p>
              </div>
              <div className="mt-2 grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => sendSuggestion(s)}
                    className="rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm text-card-foreground transition-colors hover:border-primary hover:bg-secondary"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => {
              const text = message.parts
                .map((p) => (p.type === "text" ? p.text : ""))
                .join("");
              return (
                <Message key={message.id} from={message.role}>
                  {message.role === "assistant" && (
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <Wrench className="size-3.5 text-accent" />
                      Mecânico de Fusca
                    </div>
                  )}
                  <MessageContent
                    className={
                      message.role === "user"
                        ? "group-[.is-user]:bg-chat-user group-[.is-user]:text-chat-user-foreground"
                        : undefined
                    }
                  >
                    {message.role === "assistant" ? (
                      <MessageResponse>{text}</MessageResponse>
                    ) : (
                      <p className="whitespace-pre-wrap">{text}</p>
                    )}
                  </MessageContent>
                </Message>
              );
            })
          )}

          {status === "submitted" && (
            <Message from="assistant">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Wrench className="size-3.5 text-accent" />
                Mecânico de Fusca
              </div>
              <Shimmer>Abrindo o capô...</Shimmer>
            </Message>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t border-border bg-background/80 backdrop-blur">
        <div ref={composerRef} className="mx-auto w-full max-w-3xl px-4 py-4">
          <PromptInput onSubmit={handleSubmit}>
            <PromptInputTextarea placeholder="Descreva o sintoma do seu Fusca..." />
            <PromptInputFooter className="justify-end">
              <PromptInputSubmit status={status} disabled={isLoading} />
            </PromptInputFooter>
          </PromptInput>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            O Mecânico de Fusca pode errar. Confira torques e especificações no
            manual.
          </p>
        </div>
      </div>
    </div>
  );
}
