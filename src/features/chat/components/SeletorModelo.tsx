import { Cpu } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";

// Seletor de modelos do benchmark. Temporário: só aparece quando o servidor
// tem SELETOR_MODELOS=ligado, e o servidor valida a escolha de novo.

function rotulo(id: string, padrao: string) {
  const nome = id.slice(id.indexOf(":") + 1);
  return id === padrao ? `${nome} (atual)` : nome;
}

export function SeletorModelo({
  modelos,
  padrao,
  valor,
  onChange,
  disabled,
}: {
  modelos: string[];
  padrao: string;
  valor: string;
  onChange: (modelo: string) => void;
  disabled?: boolean;
}) {
  return (
    <Select value={valor} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="h-8 w-auto max-w-[220px] gap-1.5 text-xs" aria-label="Modelo">
        <Cpu className="size-3.5" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {modelos.map((id) => (
          <SelectItem key={id} value={id} className="text-xs">
            {rotulo(id, padrao)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
