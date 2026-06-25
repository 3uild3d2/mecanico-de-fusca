import { Link, useNavigate } from "@tanstack/react-router";
import { Plus, Trash2, MessageSquare } from "lucide-react";

import { cn } from "@/lib/utils";
import { createThread, deleteThread, useThreads } from "@/lib/threads";
import fuscaLogo from "@/assets/fusca-logo.png";

export function ChatSidebar({
  activeThreadId,
  onNavigate,
}: {
  activeThreadId: string;
  onNavigate?: () => void;
}) {
  const threads = useThreads();
  const navigate = useNavigate();

  const handleNew = () => {
    const thread = createThread();
    onNavigate?.();
    navigate({ to: "/c/$threadId", params: { threadId: thread.id } });
  };

  const handleDelete = (id: string) => {
    deleteThread(id);
    if (id === activeThreadId) {
      navigate({ to: "/" });
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
          <p className="text-[11px] text-sidebar-foreground/60">
            Oficina virtual a ar
          </p>
        </div>
      </div>

      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={handleNew}
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
        {threads.length === 0 ? (
          <p className="px-2 py-4 text-sm text-sidebar-foreground/50">
            Nenhuma conversa ainda. Comece uma nova!
          </p>
        ) : (
          <ul className="space-y-0.5">
            {threads.map((thread) => {
              const isActive = thread.id === activeThreadId;
              return (
                <li
                  key={thread.id}
                  className={cn(
                    "group flex items-center gap-1 rounded-lg pr-1 transition-colors",
                    isActive
                      ? "bg-sidebar-accent"
                      : "hover:bg-sidebar-accent/60"
                  )}
                >
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
                    aria-label="Apagar conversa"
                    onClick={() => handleDelete(thread.id)}
                    className="shrink-0 rounded-md p-1.5 text-sidebar-foreground/40 opacity-0 transition-opacity hover:bg-sidebar-border hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
