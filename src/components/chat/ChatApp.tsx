import { useState } from "react";
import { Menu, X } from "lucide-react";

import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatWindow } from "@/components/chat/ChatWindow";

export function ChatApp({ threadId }: { threadId: string }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden garage-bg">
      {/* Desktop sidebar */}
      <aside className="hidden w-72 shrink-0 border-r border-sidebar-border md:block">
        <ChatSidebar activeThreadId={threadId} />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-72 border-r border-sidebar-border shadow-xl">
            <ChatSidebar
              activeThreadId={threadId}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="flex items-center gap-2 border-b border-border bg-background/80 px-3 py-2.5 backdrop-blur md:hidden">
          <button
            type="button"
            aria-label="Abrir conversas"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-2 text-foreground hover:bg-secondary"
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          <span className="font-display text-lg tracking-wide">
            Mecânico de Fusca
          </span>
        </header>

        <main className="min-h-0 flex-1">
          <ChatWindow key={threadId} threadId={threadId} />
        </main>
      </div>
    </div>
  );
}
