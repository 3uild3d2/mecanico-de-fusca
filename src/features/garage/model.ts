// Lógica pura do domínio "garagem": a ficha técnica do veículo. Sem I/O.

export type VehicleProfile = {
  apelido?: string;
  modelo?: string;
  ano?: string;
  motor?: string;
  ano_motor?: string;
  carburacao?: string;
  combustivel?: string;
  ignicao?: string;
  sistema_eletrico?: string;
  modificacoes?: string;
};

export const VEHICLE_DEFAULTS = {
  ignicao: "platinado",
  sistema_eletrico: "12V",
} as const;

/** Rótulo de cada campo no contexto enviado ao modelo. A ordem define a leitura. */
const FIELD_LABELS: Array<[keyof VehicleProfile, string]> = [
  ["apelido", "Apelido"],
  ["modelo", "Modelo"],
  ["ano", "Ano"],
  ["motor", "Motor"],
  ["ano_motor", "Ano do motor"],
  ["carburacao", "Carburação"],
  ["combustivel", "Combustível"],
  ["ignicao", "Ignição"],
  ["sistema_eletrico", "Sistema elétrico"],
  ["modificacoes", "Modificações"],
];

export const FUSCA_OPTIONS = {
  anos: [
    "1996",
    "1995",
    "1994",
    "1993",
    ...Array.from({ length: 1986 - 1959 + 1 }, (_, i) => String(1986 - i)),
    "Não sei / outro",
  ],
  modelos: [
    "Fusca 1200",
    "Fusca 1300",
    "Fusca 1300 L",
    "Fusca 1500 (Fuscão)",
    "Fusca 1600",
    "Fusca 1600 S (carburação dupla)",
    "Fusca 1600 Itamar (1993–1996)",
    "Fusca Conversível",
    "Outro / não sei",
  ],
  motores: [
    "1200 — 1.192 cm³",
    "1300 — 1.285 cm³",
    "1500 — 1.493 cm³",
    "1600 — 1.584 cm³",
    "1600 a álcool (Itamar)",
    "Motor AP (conversão)",
    "Outro / não sei",
  ],
  carburacoes: [
    "Solex/Brosol H 30/31 PICT (1600 gasolina)",
    "Solex/Brosol 30 PIC (1500/1600)",
    "Solex 30 PICT (1300)",
    "Solex 28 PICT (1200/1300 antigo)",
    "Dupla — Solex 32 PDSIT (1600 S)",
    "Carburador a álcool (Itamar)",
    "Injeção eletrônica (conversão)",
    "Carburador esportivo / Weber (modificado)",
    "Outro / não sei",
  ],
  combustiveis: [
    "Gasolina",
    "Etanol (álcool)",
    "Flex (adaptado)",
    "GNV (instalado)",
    "Outro / não sei",
  ],
} as const;

export function normalizeVehicle(data: Record<string, unknown>): VehicleProfile {
  const read = (key: string) => (typeof data[key] === "string" ? (data[key] as string) : "");

  return {
    apelido: read("apelido"),
    modelo: read("modelo"),
    ano: read("ano"),
    motor: read("motor"),
    ano_motor: read("ano_motor"),
    carburacao: read("carburacao"),
    combustivel: read("combustivel"),
    ignicao: read("ignicao") || VEHICLE_DEFAULTS.ignicao,
    sistema_eletrico: read("sistema_eletrico") || VEHICLE_DEFAULTS.sistema_eletrico,
    modificacoes: read("modificacoes"),
  };
}

/**
 * Serializa a ficha para o prompt. Retorna null quando não há nada de útil —
 * assim o servidor não injeta um bloco de contexto vazio.
 */
export function formatVehicleSpecs(vehicle: VehicleProfile | null | undefined): string | null {
  if (!vehicle) return null;

  const specs = FIELD_LABELS.map(([key, label]) => {
    const value = vehicle[key]?.trim();
    return value ? `${label}: ${value}` : null;
  }).filter((entry): entry is string => entry !== null);

  return specs.length > 0 ? specs.join(" | ") : null;
}
