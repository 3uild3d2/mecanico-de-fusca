import { useCallback, useState } from "react";
import { Brain, Menu, X } from "lucide-react";

import { ChatSidebar } from "@/features/chat/components/ChatSidebar";
import { ChatWindow } from "@/features/chat/components/ChatWindow";
import { HypothesisPanel } from "@/features/chat/components/HypothesisPanel";
import { contarVivas, type EstadoDiagnostico } from "@/features/chat/hipoteses";

export function ChatApp({ threadId }: { threadId: string }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [estado, setEstado] = useState<EstadoDiagnostico | null>(null);

  // Precisa ser estável: o ChatWindow chama isso num efeito que depende da
  // identidade da função. Sem useCallback, vira laço de renderização.
  const handleEstadoChange = useCallback((proximo: EstadoDiagnostico | null) => {
    setEstado(proximo);
  }, []);

  const vivas = contarVivas(estado);

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden garage-bg">
      {/* Conversas — desktop */}
      <aside className="hidden w-72 shrink-0 border-r border-sidebar-border md:block">
        <ChatSidebar activeThreadId={threadId} />
      </aside>

      {/* Conversas — celular */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 border-r border-sidebar-border shadow-xl">
            <ChatSidebar activeThreadId={threadId} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Cabeçalho do celular */}
        <header className="flex items-center gap-2 border-b border-border bg-background/80 px-3 py-2.5 backdrop-blur md:hidden">
          <button
            type="button"
            aria-label="Abrir conversas"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-2 text-foreground hover:bg-secondary"
          >
            <Menu className="size-5" />
          </button>
          <span className="flex-1 font-display text-lg tracking-wide">Mecânico de Fusca</span>
        </header>

        <main className="min-h-0 flex-1">
          <ChatWindow key={threadId} threadId={threadId} onEstadoChange={handleEstadoChange} />
        </main>

        {/* Abre o painel onde ele não cabe fixo. Só existe quando há raciocínio
            para mostrar — botão que abre uma tela vazia é ruído. */}
        {estado && (
          <button
            type="button"
            aria-label={`Ver raciocínio do mecânico${vivas > 0 ? `, ${vivas} hipóteses em investigação` : ""}`}
            onClick={() => setPanelOpen(true)}
            className="absolute right-3 top-3 z-20 flex items-center gap-1.5 rounded-full border border-border bg-background/90 px-3 py-2 text-sm shadow-md backdrop-blur transition-colors hover:bg-secondary md:top-4 xl:hidden"
          >
            <Brain className="size-4 text-accent" aria-hidden />
            {vivas > 0 && <span className="tabular-nums">{vivas}</span>}
          </button>
        )}
      </div>

      {/* Raciocínio — tela larga. Só ocupa espaço quando há o que mostrar. */}
      {estado && (
        <aside className="hidden w-80 shrink-0 border-l border-border bg-background/60 xl:block">
          <HypothesisPanel estado={estado} />
        </aside>
      )}

      {/* Raciocínio — sobreposição nas demais larguras */}
      {panelOpen && (
        <div className="fixed inset-0 z-40 xl:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPanelOpen(false)} />
          <aside className="absolute right-0 top-0 flex h-full w-[85%] max-w-sm flex-col border-l border-border bg-background shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
              <span className="font-display text-lg tracking-wide">Raciocínio</span>
              <button
                type="button"
                aria-label="Fechar raciocínio"
                onClick={() => setPanelOpen(false)}
                className="rounded-md p-2 text-foreground hover:bg-secondary"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <HypothesisPanel estado={estado} />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
