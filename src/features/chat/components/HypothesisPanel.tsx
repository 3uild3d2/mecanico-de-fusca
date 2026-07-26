import { CheckCircle2, HelpCircle, Search, XCircle } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import type { EstadoDiagnostico, Hipotese, StatusHipotese } from "@/features/chat/hipoteses";

// Painel do raciocínio. Não é enfeite: é o que transforma o método de
// diagnóstico em interface e ensina o dono a diagnosticar. O campo "refuta se"
// é o coração — mostra que o agente testa as próprias ideias.

const STATUS_STYLE: Record<
  StatusHipotese,
  { icon: typeof Search; classe: string; rotulo: string }
> = {
  confirmada: { icon: CheckCircle2, classe: "text-emerald-500", rotulo: "Confirmada" },
  viva: { icon: Search, classe: "text-accent", rotulo: "Em investigação" },
  descartada: { icon: XCircle, classe: "text-muted-foreground", rotulo: "Descartada" },
};

function BarraPeso({ peso, atenuada }: { peso: number; atenuada: boolean }) {
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"
      role="img"
      aria-label={`Confiança ${peso} de 100`}
    >
      <div
        className={cn(
          "h-full rounded-full transition-all duration-500",
          atenuada ? "bg-muted-foreground/40" : "bg-accent",
        )}
        style={{ width: `${peso}%` }}
      />
    </div>
  );
}

function CartaoHipotese({ hipotese }: { hipotese: Hipotese }) {
  const { icon: Icone, classe, rotulo } = STATUS_STYLE[hipotese.status];
  const descartada = hipotese.status === "descartada";

  return (
    <li
      className={cn(
        "rounded-lg border border-border bg-card p-3 transition-opacity",
        descartada && "opacity-60",
      )}
    >
      <div className="flex items-start gap-2">
        <Icone className={cn("mt-0.5 size-4 shrink-0", classe)} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p
              className={cn(
                "text-sm font-medium text-card-foreground",
                descartada && "line-through decoration-muted-foreground/50",
              )}
            >
              {hipotese.nome}
            </p>
            {!descartada && (
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {hipotese.peso}
              </span>
            )}
          </div>
          <p className="sr-only">{rotulo}</p>

          {!descartada && (
            <div className="mt-2">
              <BarraPeso peso={hipotese.peso} atenuada={false} />
            </div>
          )}

          {hipotese.porque && (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{hipotese.porque}</p>
          )}

          {hipotese.comoRefutar && !descartada && (
            <p className="mt-2 border-l-2 border-accent/40 pl-2 text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground/80">Refuta se:</span>{" "}
              {hipotese.comoRefutar}
            </p>
          )}

          {hipotese.motivoDescarte && (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground/70">Descartada:</span>{" "}
              {hipotese.motivoDescarte}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

export function HypothesisPanel({
  estado,
  className,
}: {
  estado: EstadoDiagnostico | null;
  className?: string;
}) {
  if (!estado) {
    return (
      <div
        className={cn(
          "flex h-full flex-col items-center justify-center px-6 text-center",
          className,
        )}
      >
        <HelpCircle className="size-8 text-muted-foreground/40" aria-hidden />
        <p className="mt-3 text-sm font-medium text-foreground">Raciocínio do mecânico</p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          Descreva um sintoma e acompanhe aqui as hipóteses, o peso de cada uma e o que já foi
          descartado.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="border-b border-border px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Raciocínio
        </p>
        {estado.sintoma && (
          <p className="mt-1 text-sm leading-snug text-foreground">{estado.sintoma}</p>
        )}
      </div>

      <ul className="flex-1 space-y-2 overflow-y-auto p-3">
        {estado.hipoteses.map((hipotese) => (
          <CartaoHipotese key={hipotese.nome} hipotese={hipotese} />
        ))}
      </ul>

      <p className="border-t border-border px-4 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
        Os pesos são a convicção do mecânico agora, não probabilidade calculada.
      </p>
    </div>
  );
}
