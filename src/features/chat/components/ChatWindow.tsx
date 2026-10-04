import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  type FileUIPart,
  type UIMessage,
} from "ai";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImageIcon, Mic, Paperclip, Square, Wrench, X } from "lucide-react";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/features/chat/components/conversation";
import { Message, MessageContent, MessageResponse } from "@/features/chat/components/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputButton,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  type PromptInputMessage,
} from "@/features/chat/components/prompt-input";
import { Shimmer } from "@/features/chat/components/shimmer";
import { uploadChatFiles } from "@/features/chat/attachments";
import { getThread, saveThreadMessages, useThread } from "@/features/chat/api";
import { extractEstadoDiagnostico, type EstadoDiagnostico } from "@/features/chat/hipoteses";
import { useActiveVehicle } from "@/features/garage/api";
import { registrarEvento, useVehicleEvents } from "@/features/garage/events-api";
import type { VehicleEvent } from "@/features/garage/events";
import fuscaLogo from "@/assets/fusca-logo.png";
import contaGirosNiveis from "@/assets/conta_giros_4_niveis.png";

const transport = new DefaultChatTransport({ api: "/api/chat" });

const SUGGESTIONS = [
  { level: 1, text: "Meu fusca falha quando acelero" },
  { level: 2, text: "Como troco a correia dentada da Brasília?" },
  { level: 3, text: "Qual o torque de aperto do cabeçote do 1500?" },
  { level: 4, text: "Como definir a sobremedida externa das bronzinas?" },
];

const ACCEPTED_MEDIA = "image/*,audio/*";
const MAX_ATTACHMENT_SIZE = 15 * 1024 * 1024;
const DIA_MS = 24 * 60 * 60 * 1000;
const DIFFICULTY_SPRITE_WIDTH = 2720;
const DIFFICULTY_SPRITE_HEIGHT = 672;
const DIFFICULTY_ICON_HEIGHT = 64;
const DIFFICULTY_ICON_SLOT_WIDTH = 132;
const DIFFICULTY_CROPS = [
  { x: 252, y: 164, width: 410, height: 212 },
  { x: 848, y: 164, width: 408, height: 212 },
  { x: 1444, y: 164, width: 423, height: 212 },
  { x: 2052, y: 164, width: 415, height: 212 },
] as const;

/** Espelha o inputSchema de registrarEvento em src/server/ai/tools.ts. */
type RegistrarEventoInput = {
  tipo: VehicleEvent["tipo"];
  titulo: string;
  sistema?: VehicleEvent["sistema"];
  desfecho?: VehicleEvent["desfecho"];
  diasAtras?: number;
  km?: number;
};

type SubmitFile = FileUIPart & { sourceFile?: File };

function getMessageText(message: UIMessage) {
  return message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
}

function getMessageFiles(message: UIMessage) {
  return message.parts.filter((part): part is FileUIPart => part.type === "file");
}

function defaultAttachmentPrompt(files: FileUIPart[]) {
  const hasAudio = files.some((file) => file.mediaType?.startsWith("audio/"));
  const hasImage = files.some((file) => file.mediaType?.startsWith("image/"));

  if (hasAudio && hasImage) {
    return "Analise o áudio e as imagens enviados e me ajude com o diagnóstico do Fusca.";
  }
  if (hasAudio) {
    return "Ouça o áudio enviado e me ajude com o diagnóstico do Fusca.";
  }
  return "Analise a imagem enviada e me ajude com o diagnóstico do Fusca.";
}

function removeLocalFileHandles(files: SubmitFile[]): FileUIPart[] {
  return files.map(({ sourceFile: _sourceFile, ...file }) => file);
}

function isLocalDevOrigin() {
  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

function DifficultyIcon({ level }: { level: number }) {
  const crop = DIFFICULTY_CROPS[level - 1] ?? DIFFICULTY_CROPS[0];
  const scale = DIFFICULTY_ICON_HEIGHT / crop.height;
  const iconWidth = crop.width * scale;
  const centeredOffset = (DIFFICULTY_ICON_SLOT_WIDTH - iconWidth) / 2;

  return (
    <span
      aria-hidden
      className="relative shrink-0 overflow-hidden"
      style={{
        height: DIFFICULTY_ICON_HEIGHT,
        width: DIFFICULTY_ICON_SLOT_WIDTH,
      }}
    >
      <img
        alt=""
        className="absolute left-0 top-0 max-w-none"
        src={contaGirosNiveis}
        style={{
          height: DIFFICULTY_SPRITE_HEIGHT * scale,
          transform: `translate(${centeredOffset - crop.x * scale}px, ${-crop.y * scale}px)`,
          width: DIFFICULTY_SPRITE_WIDTH * scale,
        }}
      />
    </span>
  );
}

function MessageFiles({ files }: { files: FileUIPart[] }) {
  if (files.length === 0) return null;

  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {files.map((file, index) => {
        const key = `${file.url}-${index}`;
        if (file.mediaType?.startsWith("image/")) {
          return (
            <a
              className="block overflow-hidden rounded-lg border border-border bg-background/40"
              href={file.url}
              key={key}
              rel="noreferrer"
              target="_blank"
            >
              <img
                alt={file.filename ?? "Imagem enviada"}
                className="max-h-56 max-w-full object-contain"
                src={file.url}
              />
            </a>
          );
        }

        if (file.mediaType?.startsWith("audio/")) {
          return (
            <div className="rounded-lg border border-border bg-background/40 p-2" key={key}>
              <p className="mb-1 text-xs text-muted-foreground">
                {file.filename ?? "Áudio enviado"}
              </p>
              <audio controls src={file.url} />
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

function PromptAttachmentPreview() {
  const attachments = usePromptInputAttachments();

  if (attachments.files.length === 0) return null;

  return (
    <PromptInputHeader className="gap-2 px-3 pt-3">
      {attachments.files.map((file) => (
        <div
          className="group relative flex max-w-44 items-center gap-2 rounded-lg border border-border bg-background/80 p-2 text-xs"
          key={file.id}
        >
          {file.mediaType?.startsWith("image/") ? (
            <img
              alt={file.filename ?? "Imagem anexada"}
              className="size-10 rounded object-cover"
              src={file.url}
            />
          ) : (
            <div className="flex size-10 items-center justify-center rounded bg-secondary">
              <Mic className="size-4 text-muted-foreground" />
            </div>
          )}
          <span className="truncate text-muted-foreground">{file.filename ?? "Anexo"}</span>
          <button
            aria-label="Remover anexo"
            className="absolute -right-2 -top-2 rounded-full bg-background p-1 text-muted-foreground shadow transition-colors hover:text-destructive"
            onClick={() => attachments.remove(file.id)}
            type="button"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
    </PromptInputHeader>
  );
}

function AudioRecorderButton({ disabled }: { disabled?: boolean }) {
  const attachments = usePromptInputAttachments();
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const stopRecording = () => {
    recorderRef.current?.stop();
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Seu navegador não permite gravação de áudio.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      streamRef.current = stream;
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const type = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const file = new File(
          [blob],
          `audio-${new Date().toISOString().replaceAll(/[:.]/g, "-")}.webm`,
          {
            type,
          },
        );
        attachments.add([file]);
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setIsRecording(false);
      };

      recorder.start();
      setIsRecording(true);
      window.setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, 120_000);
    } catch {
      toast.error("Não foi possível acessar o microfone.");
    }
  };

  useEffect(
    () => () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  return (
    <PromptInputButton
      disabled={disabled}
      onClick={() => (isRecording ? stopRecording() : void startRecording())}
      tooltip={isRecording ? "Parar gravação" : "Gravar áudio"}
    >
      {isRecording ? <Square className="size-4 text-destructive" /> : <Mic className="size-4" />}
    </PromptInputButton>
  );
}

function AttachFileButton({ disabled }: { disabled?: boolean }) {
  const attachments = usePromptInputAttachments();

  return (
    <PromptInputButton
      disabled={disabled}
      onClick={attachments.openFileDialog}
      tooltip="Enviar foto, imagem ou áudio"
    >
      <Paperclip className="size-4" />
    </PromptInputButton>
  );
}

export function ChatWindow({
  threadId,
  onEstadoChange,
}: {
  threadId: string;
  onEstadoChange?: (estado: EstadoDiagnostico | null) => void;
}) {
  useThread(threadId);
  const initial = getThread(threadId);
  const activeVehicle = useActiveVehicle();
  const vehicleEvents = useVehicleEvents();
  const composerRef = useRef<HTMLDivElement | null>(null);

  const { messages, sendMessage, status, addToolResult } = useChat({
    id: threadId,
    messages: initial?.messages ?? [],
    transport,
    // Sem isto, o fluxo trava: o resultado da ferramenta é gravado na mensagem e
    // nada reenvia ao servidor, então o modelo nunca continua a resposta. O
    // sintoma é uma bolha de assistente vazia e um único POST em /api/chat.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    // Ferramentas de cliente: o agente decide, o navegador executa — é aqui que
    // existe a sessão autenticada do Supabase.
    onToolCall: async ({ toolCall }) => {
      // atualizarHipoteses não tem efeito colateral: o estado é derivado das
      // partes da mensagem. Só precisa devolver resultado para o SDK seguir.
      if (toolCall.toolName === "atualizarHipoteses") {
        addToolResult({
          tool: "atualizarHipoteses",
          toolCallId: toolCall.toolCallId,
          output: { ok: true },
        });
        return;
      }

      if (toolCall.toolName !== "registrarEvento") return;

      const input = toolCall.input as RegistrarEventoInput;
      try {
        const evento = await registrarEvento({
          tipo: input.tipo,
          titulo: input.titulo,
          sistema: input.sistema,
          desfecho: input.desfecho,
          km: input.km,
          data: Date.now() - (input.diasAtras ?? 0) * DIA_MS,
          threadId,
          origem: "agente",
        });

        toast.success(`Registrado: ${evento.titulo}`);
        addToolResult({
          tool: "registrarEvento",
          toolCallId: toolCall.toolCallId,
          output: { ok: true, id: evento.id },
        });
      } catch (error) {
        addToolResult({
          tool: "registrarEvento",
          toolCallId: toolCall.toolCallId,
          output: {
            ok: false,
            erro: error instanceof Error ? error.message : "Falha ao registrar",
          },
        });
      }
    },
    onError: (error) => {
      toast.error(
        error.message?.includes("402")
          ? "Os créditos de IA acabaram. Adicione créditos para continuar."
          : error.message?.includes("429")
            ? "Muitas mensagens em sequência. Aguarde um instante e tente de novo."
            : "Algo deu errado ao falar com o mecânico. Tente novamente.",
      );
    },
  });

  const isLoading = status === "submitted" || status === "streaming";

  // A ficha do veículo vai como body por requisição. Antes estava em useChat({ body }),
  // que o AI SDK v6 ignora — o perfil do carro nunca chegava ao modelo.
  const requestOptions = { body: { vehicle: activeVehicle, events: vehicleEvents } };

  // Persist messages for this thread whenever they change.
  useEffect(() => {
    if (messages.length > 0) {
      saveThreadMessages(threadId, messages);
    }
  }, [messages, threadId]);

  // O estado do raciocínio é derivado das mensagens, então acompanha o streaming
  // sem armazenamento próprio. Sobe para o ChatApp, que é quem monta o painel.
  useEffect(() => {
    onEstadoChange?.(extractEstadoDiagnostico(messages));
  }, [messages, onEstadoChange]);

  // Keep the composer focused for fast back-and-forth.
  useEffect(() => {
    if (!isLoading) {
      composerRef.current?.querySelector("textarea")?.focus();
    }
  }, [isLoading, threadId]);

  const handleSubmit = async (message: PromptInputMessage) => {
    const text = message.text?.trim();
    const files = message.files.filter(
      (file) => file.mediaType?.startsWith("image/") || file.mediaType?.startsWith("audio/"),
    );
    if (isLoading || (!text && files.length === 0)) return;

    if (files.length !== message.files.length) {
      toast.error("Vídeo e outros arquivos não são suportados. Envie imagem ou áudio.");
      return;
    }

    try {
      let preparedFiles: FileUIPart[] = [];
      if (files.length > 0) {
        const inlineFiles = removeLocalFileHandles(files as SubmitFile[]);
        const canSendInline = inlineFiles.every((file) => file.url.startsWith("data:"));

        if (isLocalDevOrigin() && canSendInline) {
          preparedFiles = inlineFiles;
          toast.warning("Enviando anexo sem salvar no Storage em ambiente local.");
        } else {
          try {
            preparedFiles = await uploadChatFiles(threadId, files);
          } catch (uploadError) {
            if (!canSendInline) {
              throw uploadError;
            }
            preparedFiles = inlineFiles;
            toast.warning("Storage indisponível. Enviando anexo sem salvar a imagem no histórico.");
          }
        }
      }

      sendMessage(
        { files: preparedFiles, text: text || defaultAttachmentPrompt(preparedFiles) },
        requestOptions,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar o anexo.");
      throw error;
    }
  };

  const sendSuggestion = (text: string) => {
    if (isLoading) return;
    sendMessage({ text }, requestOptions);
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
                  Sou o Mecânico de Fusca. Me conte o sintoma, o ano e o motor do seu carro que a
                  gente diagnostica juntos.
                </p>
              </div>
              <div className="mt-2 grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-x-4">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion.text}
                    type="button"
                    onClick={() => sendSuggestion(suggestion.text)}
                    className="flex min-h-24 items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm text-card-foreground transition-colors hover:border-primary hover:bg-secondary"
                  >
                    <DifficultyIcon level={suggestion.level} />
                    <span>{suggestion.text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => {
              const text = getMessageText(message);
              const files = getMessageFiles(message);
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
                      <>
                        <MessageFiles files={files} />
                        {text && <p className="whitespace-pre-wrap">{text}</p>}
                      </>
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
          <PromptInput
            accept={ACCEPTED_MEDIA}
            maxFileSize={MAX_ATTACHMENT_SIZE}
            multiple
            onError={(error) => toast.error(error.message)}
            onSubmit={handleSubmit}
          >
            <PromptAttachmentPreview />
            <PromptInputTextarea placeholder="Descreva o sintoma do seu Fusca..." />
            <PromptInputFooter>
              <PromptInputTools>
                <AttachFileButton disabled={isLoading} />
                <AudioRecorderButton disabled={isLoading} />
              </PromptInputTools>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <ImageIcon className="size-3.5" />
                Foto, imagem ou áudio
              </div>
              <PromptInputSubmit status={status} disabled={isLoading} />
            </PromptInputFooter>
          </PromptInput>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            O Mecânico de Fusca pode errar. Confira torques e especificações no manual.
          </p>
        </div>
      </div>
    </div>
  );
}
