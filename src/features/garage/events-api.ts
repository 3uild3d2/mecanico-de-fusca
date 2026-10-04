import { useQuery } from "@tanstack/react-query";

import { garantirSessao } from "@/features/auth/supabase-auth";
import type { VehicleEventRow } from "@/shared/lib/database.types";
import { getQueryClient } from "@/shared/lib/query-client";
import { getSupabase } from "@/shared/lib/supabase";
import { getActiveVehicleRecord, initializeVehicles } from "./api";
import { normalizeTitulo, type VehicleEvent } from "./events";

export const VEHICLE_EVENTS_QUERY_KEY = ["vehicle-events"] as const;

export type NovoEvento = Omit<VehicleEvent, "id" | "criadoEm"> & { id?: string };

async function requireUserId() {
  return (await garantirSessao()).id;
}

function toTimestamp(value: string | null | undefined) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function normalizeEvent(row: VehicleEventRow): VehicleEvent {
  return {
    id: row.id,
    tipo: row.tipo,
    titulo: row.titulo,
    sistema: row.sistema ?? undefined,
    desfecho: row.desfecho ?? undefined,
    data: toTimestamp(row.data_evento),
    km: row.km ?? undefined,
    threadId: row.thread_id ?? undefined,
    origem: row.origem,
    criadoEm: toTimestamp(row.criado_em),
  };
}

async function fetchVehicleEvents(): Promise<VehicleEvent[]> {
  const uid = await requireUserId();
  const { data, error } = await getSupabase()
    .from("vehicle_events")
    .select("*")
    .eq("user_id", uid)
    .order("data_evento", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(normalizeEvent);
}

export async function initializeEvents() {
  await getQueryClient().ensureQueryData({
    queryKey: VEHICLE_EVENTS_QUERY_KEY,
    queryFn: fetchVehicleEvents,
  });
}

async function getActiveVehicleId() {
  await initializeVehicles();
  return getActiveVehicleRecord()?.id ?? null;
}

export async function registrarEvento(evento: NovoEvento): Promise<VehicleEvent> {
  const uid = await requireUserId();
  const registro: VehicleEvent = {
    ...evento,
    id: evento.id ?? crypto.randomUUID(),
    titulo: normalizeTitulo(evento.titulo),
    criadoEm: Date.now(),
  };

  const payload = {
    id: registro.id,
    vehicle_id: await getActiveVehicleId(),
    user_id: uid,
    tipo: registro.tipo,
    titulo: registro.titulo,
    sistema: registro.sistema ?? null,
    desfecho: registro.desfecho ?? null,
    data_evento: new Date(registro.data).toISOString(),
    km: registro.km ?? null,
    thread_id: registro.threadId ?? null,
    origem: registro.origem,
  };

  const { error } = await getSupabase().from("vehicle_events").upsert(payload, {
    onConflict: "id",
  });
  if (error) throw error;

  const queryClient = getQueryClient();
  queryClient.setQueryData<VehicleEvent[]>(VEHICLE_EVENTS_QUERY_KEY, (current = []) =>
    [registro, ...current.filter((item) => item.id !== registro.id)].sort(
      (a, b) => b.data - a.data,
    ),
  );

  return registro;
}

export async function removerEvento(id: string) {
  const previous = getQueryClient().getQueryData<VehicleEvent[]>(VEHICLE_EVENTS_QUERY_KEY) ?? [];
  getQueryClient().setQueryData<VehicleEvent[]>(
    VEHICLE_EVENTS_QUERY_KEY,
    previous.filter((event) => event.id !== id),
  );

  const { error } = await getSupabase().from("vehicle_events").delete().eq("id", id);
  if (error) {
    getQueryClient().setQueryData(VEHICLE_EVENTS_QUERY_KEY, previous);
    throw error;
  }
}

export function useVehicleEvents(): VehicleEvent[] {
  return useQuery({ queryKey: VEHICLE_EVENTS_QUERY_KEY, queryFn: fetchVehicleEvents }).data ?? [];
}

export function useVehicleEventsReady(): boolean {
  return useQuery({ queryKey: VEHICLE_EVENTS_QUERY_KEY, queryFn: fetchVehicleEvents }).isSuccess;
}
