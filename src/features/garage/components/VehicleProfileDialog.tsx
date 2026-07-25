import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Car } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/shared/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { useActiveVehicle, saveActiveVehicle } from "@/features/garage/api";
import { FUSCA_OPTIONS, VEHICLE_DEFAULTS, type VehicleProfile } from "@/features/garage/model";

export function VehicleProfileDialog() {
  const activeVehicle = useActiveVehicle();
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState<VehicleProfile>({});

  useEffect(() => {
    if (activeVehicle) {
      setFormData(activeVehicle);
    } else {
      setFormData({
        ignicao: VEHICLE_DEFAULTS.ignicao,
        sistema_eletrico: VEHICLE_DEFAULTS.sistema_eletrico,
      });
    }
  }, [activeVehicle, open]);

  const handleChange = (field: keyof VehicleProfile, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveActiveVehicle(formData);
      toast.success("Ficha do veículo salva com sucesso!");
      setOpen(false);
    } catch {
      toast.error("Não foi possível salvar a ficha. Verifique se você está conectado.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg border border-sidebar-border px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
        >
          <Car className="size-4" />
          Minha Garagem
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="size-5" />
            Ficha Técnica do Veículo
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Estes dados ajudam o mecânico a acertar o diagnóstico no chat.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-primary">IDENTIFICAÇÃO</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="apelido">Apelido do carro</Label>
                <Input
                  id="apelido"
                  placeholder="ex.: Besouro"
                  value={formData.apelido || ""}
                  onChange={(e) => handleChange("apelido", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Modelo</Label>
                <Select value={formData.modelo} onValueChange={(v) => handleChange("modelo", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o modelo" />
                  </SelectTrigger>
                  <SelectContent>
                    {FUSCA_OPTIONS.modelos.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Ano (carroceria)</Label>
                <Select value={formData.ano} onValueChange={(v) => handleChange("ano", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Ano do carro" />
                  </SelectTrigger>
                  <SelectContent>
                    {FUSCA_OPTIONS.anos.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-primary">MECÂNICA</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Motor / cilindrada</Label>
                <Select value={formData.motor} onValueChange={(v) => handleChange("motor", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o motor" />
                  </SelectTrigger>
                  <SelectContent>
                    {FUSCA_OPTIONS.motores.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ano_motor">Ano do motor (se trocado)</Label>
                <Input
                  id="ano_motor"
                  placeholder="ex.: 1975"
                  value={formData.ano_motor || ""}
                  onChange={(e) => handleChange("ano_motor", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Carburação</Label>
                <Select
                  value={formData.carburacao}
                  onValueChange={(v) => handleChange("carburacao", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Modelo do carburador" />
                  </SelectTrigger>
                  <SelectContent>
                    {FUSCA_OPTIONS.carburacoes.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Combustível</Label>
                <Select
                  value={formData.combustivel}
                  onValueChange={(v) => handleChange("combustivel", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Gasolina / Álcool" />
                  </SelectTrigger>
                  <SelectContent>
                    {FUSCA_OPTIONS.combustiveis.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Ignição</Label>
                <RadioGroup
                  value={formData.ignicao || VEHICLE_DEFAULTS.ignicao}
                  onValueChange={(v) => handleChange("ignicao", v)}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="platinado" id="ig-pl" />
                    <Label htmlFor="ig-pl">Platinado</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="eletronica" id="ig-el" />
                    <Label htmlFor="ig-el">Eletrônica</Label>
                  </div>
                </RadioGroup>
              </div>
              <div className="space-y-2">
                <Label>Sistema elétrico</Label>
                <RadioGroup
                  value={formData.sistema_eletrico || VEHICLE_DEFAULTS.sistema_eletrico}
                  onValueChange={(v) => handleChange("sistema_eletrico", v)}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="6V" id="se-6" />
                    <Label htmlFor="se-6">6V</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="12V" id="se-12" />
                    <Label htmlFor="se-12">12V</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            <div className="space-y-1.5 pt-2">
              <Label htmlFor="modificacoes">Modificações</Label>
              <Textarea
                id="modificacoes"
                placeholder="ex.: coletor esportivo, ventoinha de 12 pás, filtro cônico…"
                value={formData.modificacoes || ""}
                onChange={(e) => handleChange("modificacoes", e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit">Salvar ficha</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
