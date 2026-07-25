import { Link, useNavigate } from "@tanstack/react-router";
import {
  Check,
  LogIn,
  LogOut,
  MessageSquare,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserCircle,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { cn } from "@/shared/lib/utils";
import {
  createThread,
  deleteThread,
  updateThreadTitle,
  useThreads,
  useThreadsReady,
  type Thread,
} from "@/features/chat/api";
import { signInWithGoogle, signOutToAnonymous, useAuthUser } from "@/features/auth/api";
import { useIsAdmin } from "@/features/auth/entitlements";
import { VehicleProfileDialog } from "@/features/garage/components/VehicleProfileDialog";
import fuscaLogo from "@/assets/fusca-logo.png";

export function ChatSidebar({
  activeThreadId,
  onNavigate,
}: {
  activeThreadId: string;
  onNavigate?: () => void;
}) {
  const threads = useThreads();
  const ready = useThreadsReady();
  const user = useAuthUser();
  const isAdmin = useIsAdmin();
  const navigate = useNavigate();
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [savingTitleId, setSavingTitleId] = useState<string | null>(null);
  const isSignedIn = Boolean(user && !user.isAnonymous);
  const displayName = isSignedIn
    ? (user?.displayName ?? user?.email ?? "Conta Google")
    : "Visitante";

  const handleNew = async () => {
    try {
      const thread = await createThread();
      onNavigate?.();
      navigate({ to: "/c/$threadId", params: { threadId: thread.id } });
    } catch {
      toast.error("Não foi possível criar uma nova conversa.");
    }
  };

  const startEditing = (thread: Thread) => {
    setEditingThreadId(thread.id);
    setEditingTitle(thread.title);
  };

  const cancelEditing = () => {
    setEditingThreadId(null);
    setEditingTitle("");
  };

  const handleSaveTitle = async (id: string) => {
    const nextTitle = editingTitle.trim();
    if (!nextTitle) {
      toast.error("Digite um título para a conversa.");
      return;
    }

    try {
      setSavingTitleId(id);
      await updateThreadTitle(id, nextTitle);
      cancelEditing();
    } catch {
      toast.error("Não foi possível renomear a conversa.");
    } finally {
      setSavingTitleId(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteThread(id);
      if (id === activeThreadId) {
        navigate({ to: "/" });
      }
    } catch {
      toast.error("Não foi possível apagar a conversa.");
    }
  };

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
      toast.success("Login com Google realizado.");
      navigate({ to: "/" });
    } catch {
      toast.error("Não foi possível entrar com Google.");
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutToAnonymous();
      toast.success("Você saiu da conta Google.");
      navigate({ to: "/" });
    } catch {
      toast.error("Não foi possível sair da conta Google.");
    }
  };

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <img
          src={fuscaLogo}
          alt=""
          width={1024}
          height={1024}
          className="size-9 shrink-0 object-contain"
        />
        <div className="leading-tight">
          <p className="font-display text-xl tracking-wide text-sidebar-foreground">
            Mecânico de Fusca
          </p>
          <p className="text-[11px] text-sidebar-foreground/60">Oficina virtual a ar</p>
        </div>
      </div>

      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={handleNew}
          disabled={!ready}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-sidebar-primary px-3 py-2.5 text-sm font-semibold text-sidebar-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="size-4" />
          Nova conversa
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        <p className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">
          Conversas
        </p>
        {!ready ? (
          <p className="px-2 py-4 text-sm text-sidebar-foreground/50">Carregando conversas...</p>
        ) : threads.length === 0 ? (
          <p className="px-2 py-4 text-sm text-sidebar-foreground/50">
            Nenhuma conversa ainda. Comece uma nova!
          </p>
        ) : (
          <ul className="space-y-0.5">
            {threads.map((thread) => {
              const isActive = thread.id === activeThreadId;
              const isEditing = thread.id === editingThreadId;
              return (
                <li
                  key={thread.id}
                  className={cn(
                    "group flex items-center gap-1 rounded-lg pr-1 transition-colors",
                    isActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
                  )}
                >
                  {isEditing ? (
                    <>
                      <div className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 text-sm text-sidebar-foreground">
                        <MessageSquare className="size-4 shrink-0 text-sidebar-foreground/50" />
                        <input
                          aria-label="Título da conversa"
                          autoFocus
                          className="min-w-0 flex-1 rounded-md border border-sidebar-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-sidebar-primary"
                          disabled={savingTitleId === thread.id}
                          onChange={(event) => setEditingTitle(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") void handleSaveTitle(thread.id);
                            if (event.key === "Escape") cancelEditing();
                          }}
                          value={editingTitle}
                        />
                      </div>
                      <button
                        type="button"
                        aria-label="Salvar título"
                        disabled={savingTitleId === thread.id}
                        onClick={() => void handleSaveTitle(thread.id)}
                        className="shrink-0 rounded-md p-1.5 text-sidebar-foreground/50 transition-colors hover:bg-sidebar-border hover:text-sidebar-foreground disabled:opacity-50"
                      >
                        <Check className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Cancelar edição"
                        disabled={savingTitleId === thread.id}
                        onClick={cancelEditing}
                        className="shrink-0 rounded-md p-1.5 text-sidebar-foreground/50 transition-colors hover:bg-sidebar-border hover:text-sidebar-foreground disabled:opacity-50"
                      >
                        <X className="size-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <Link
                        to="/c/$threadId"
                        params={{ threadId: thread.id }}
                        onClick={onNavigate}
                        className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-sm text-sidebar-foreground"
                      >
                        <MessageSquare className="size-4 shrink-0 text-sidebar-foreground/50" />
                        <span className="truncate">{thread.title}</span>
                      </Link>
                      <button
                        type="button"
                        aria-label="Editar título da conversa"
                        onClick={() => startEditing(thread)}
                        className="shrink-0 rounded-md p-1.5 text-sidebar-foreground/40 opacity-0 transition-opacity hover:bg-sidebar-border hover:text-sidebar-foreground group-hover:opacity-100"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Apagar conversa"
                        onClick={() => void handleDelete(thread.id)}
                        className="shrink-0 rounded-md p-1.5 text-sidebar-foreground/40 opacity-0 transition-opacity hover:bg-sidebar-border hover:text-destructive group-hover:opacity-100"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-sidebar-border p-3">
        <div className="mb-2">
          <VehicleProfileDialog />
        </div>
        <div className="mb-2 flex min-w-0 items-center gap-2 rounded-lg bg-sidebar-accent/50 px-2.5 py-2">
          <UserCircle className="size-4 shrink-0 text-sidebar-foreground/55" />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="truncate text-sm font-medium text-sidebar-foreground">{displayName}</p>
              {isAdmin && <ShieldCheck className="size-3.5 shrink-0 text-sidebar-primary" />}
            </div>
            <p className="truncate text-[11px] text-sidebar-foreground/55">
              {isSignedIn ? user?.email : "Histórico salvo em usuário anônimo"}
            </p>
          </div>
        </div>
        {isSignedIn ? (
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-sidebar-border px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
          >
            <LogOut className="size-4" />
            Sair
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleSignIn()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-sidebar-border px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
          >
            <LogIn className="size-4" />
            Entrar com Google
          </button>
        )}
      </div>
    </div>
  );
}
