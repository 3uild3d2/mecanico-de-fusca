// Tipos do banco, escritos à mão a partir de supabase/migrations/.
//
// SUBSTITUIR pela geração automática assim que as migrations forem aplicadas:
//   npx supabase gen types typescript --project-id <ref> > src/shared/lib/database.types.ts
//
// Até lá, este arquivo é a única coisa que impede o cliente de ficar sem tipo —
// mas ele NÃO é verificado contra o banco. Se divergir do SQL, o TypeScript
// mente. Regerar é a primeira coisa a fazer depois de aplicar as migrations.

export type Plano = "free" | "premium";
export type TipoEvento = "diagnostico" | "servico" | "observacao";
export type Desfecho = "suspeita" | "confirmado" | "descartado" | "sem_retorno";
export type OrigemEvento = "agente" | "usuario";
export type PapelMensagem = "system" | "user" | "assistant";
export type ConfiancaDoc = "alta" | "media" | "verificar";
export type StatusAssinatura =
  | "ativa"
  | "em_teste"
  | "em_carencia"
  | "pausada"
  | "cancelada"
  | "expirada";

export type SistemaVeiculo =
  | "motor"
  | "eletrica"
  | "carburacao"
  | "ignicao"
  | "freios"
  | "suspensao"
  | "cambio"
  | "arrefecimento"
  | "outro";

type Timestamps = { criado_em: string; atualizado_em: string };

export type ProfileRow = {
  id: string;
  display_name: string | null;
  email: string | null;
  is_admin: boolean;
  plan: Plano;
  plan_expira_em: string | null;
} & Timestamps;

export type VehicleRow = {
  id: string;
  user_id: string;
  apelido: string | null;
  modelo: string | null;
  ano: string | null;
  motor: string | null;
  ano_motor: string | null;
  carburacao: string | null;
  combustivel: string | null;
  ignicao: string;
  sistema_eletrico: string;
  modificacoes: string | null;
  ativo: boolean;
} & Timestamps;

export type VehicleEventRow = {
  id: string;
  vehicle_id: string | null;
  user_id: string;
  tipo: TipoEvento;
  titulo: string;
  sistema: SistemaVeiculo | null;
  desfecho: Desfecho | null;
  data_evento: string;
  km: number | null;
  thread_id: string | null;
  origem: OrigemEvento;
  criado_em: string;
};

export type ThreadRow = {
  id: string;
  user_id: string;
  titulo: string;
  titulo_editado: boolean;
} & Timestamps;

export type MessageRow = {
  id: string;
  thread_id: string;
  user_id: string;
  papel: PapelMensagem;
  partes: unknown;
  criado_em: string;
};

export type SubscriptionRow = {
  user_id: string;
  plano: Plano;
  status: StatusAssinatura;
  play_purchase_token: string | null;
  play_product_id: string | null;
  play_order_id: string | null;
  periodo_fim: string | null;
  cancelada_em: string | null;
} & Timestamps;

type Tabela<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Tabela<ProfileRow>;
      vehicles: Tabela<VehicleRow>;
      vehicle_events: Tabela<VehicleEventRow>;
      threads: Tabela<ThreadRow>;
      messages: Tabela<MessageRow>;
      subscriptions: Tabela<SubscriptionRow>;
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: {
      plano: Plano;
      tipo_evento: TipoEvento;
      desfecho: Desfecho;
      origem_evento: OrigemEvento;
      papel_mensagem: PapelMensagem;
      confianca_doc: ConfiancaDoc;
      status_assinatura: StatusAssinatura;
      sistema_veiculo: SistemaVeiculo;
    };
    CompositeTypes: Record<never, never>;
  };
};
