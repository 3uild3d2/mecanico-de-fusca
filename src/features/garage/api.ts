import { useQuery } from "@tanstack/react-query";

import { garantirSessao } from "@/features/auth/supabase-auth";
import { getQueryClient } from "@/shared/lib/query-client";
import { getSupabase } from "@/shared/lib/supabase";
import { normalizeVehicle, type VehicleProfile } from "./model";

export type { VehicleProfile } from "./model";

export const VEHICLES_QUERY_KEY = ["vehicles"] as const;
export const ACTIVE_VEHICLE_QUERY_KEY = VEHICLES_QUERY_KEY;

export type VehicleRecord = {
  id: string;
  profile: VehicleProfile;
  active: boolean;
  updatedAt: number;
};

async function requireUserId() {
  return (await garantirSessao()).id;
}

function toTimestamp(value: string | null | undefined) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function normalizeVehicleRow(row: Record<string, unknown>): VehicleRecord {
  return {
    id: String(row.id),
    profile: normalizeVehicle(row),
    active: row.ativo === true,
    updatedAt: typeof row.atualizado_em === "string" ? toTimestamp(row.atualizado_em) : 0,
  };
}

function activeFrom(records: VehicleRecord[]) {
  return records.find((vehicle) => vehicle.active) ?? records[0] ?? null;
}

function setVehiclesCache(records: VehicleRecord[]) {
  getQueryClient().setQueryData(
    VEHICLES_QUERY_KEY,
    [...records].sort((a, b) => Number(b.active) - Number(a.active) || b.updatedAt - a.updatedAt),
  );
}

async function fetchVehicles(): Promise<VehicleRecord[]> {
  const uid = await requireUserId();
  const { data, error } = await getSupabase()
    .from("vehicles")
    .select(
      "id,apelido,modelo,ano,motor,ano_motor,carburacao,combustivel,ignicao,sistema_eletrico,modificacoes,ativo,atualizado_em",
    )
    .eq("user_id", uid)
    .order("ativo", { ascending: false })
    .order("atualizado_em", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(normalizeVehicleRow);
}

export async function initializeVehicles() {
  await getQueryClient().ensureQueryData({
    queryKey: VEHICLES_QUERY_KEY,
    queryFn: fetchVehicles,
  });
}

export function getVehicles(): VehicleRecord[] {
  return getQueryClient().getQueryData<VehicleRecord[]>(VEHICLES_QUERY_KEY) ?? [];
}

export function getActiveVehicleRecord(): VehicleRecord | null {
  return activeFrom(getVehicles());
}

export async function selectVehicle(id: string) {
  const uid = await requireUserId();
  const previous = getVehicles();
  setVehiclesCache(
    previous.map((vehicle) => ({
      ...vehicle,
      active: vehicle.id === id,
      updatedAt: vehicle.id === id ? Date.now() : vehicle.updatedAt,
    })),
  );

  const supabase = getSupabase();
  const { error: clearError } = await supabase
    .from("vehicles")
    .update({ ativo: false })
    .eq("user_id", uid);
  if (clearError) {
    setVehiclesCache(previous);
    throw clearError;
  }

  const { error } = await supabase
    .from("vehicles")
    .update({ ativo: true })
    .eq("id", id)
    .eq("user_id", uid);
  if (error) {
    setVehiclesCache(previous);
    throw error;
  }
}

export async function saveVehicle(
  vehicle: VehicleProfile,
  id: string | null,
): Promise<VehicleRecord> {
  const uid = await requireUserId();
  const previous = getVehicles();
  const optimisticId = id ?? crypto.randomUUID();
  const optimistic: VehicleRecord = {
    id: optimisticId,
    profile: vehicle,
    active: true,
    updatedAt: Date.now(),
  };

  setVehiclesCache(
    [optimistic, ...previous.filter((item) => item.id !== optimisticId)].map((item) => ({
      ...item,
      active: item.id === optimisticId,
    })),
  );

  const payload = {
    apelido: vehicle.apelido || null,
    modelo: vehicle.modelo || null,
    ano: vehicle.ano || null,
    motor: vehicle.motor || null,
    ano_motor: vehicle.ano_motor || null,
    carburacao: vehicle.carburacao || null,
    combustivel: vehicle.combustivel || null,
    ignicao: vehicle.ignicao || "platinado",
    sistema_eletrico: vehicle.sistema_eletrico || "12V",
    modificacoes: vehicle.modificacoes || null,
    ativo: true,
  };

  const supabase = getSupabase();
  const { error: clearError } = await supabase
    .from("vehicles")
    .update({ ativo: false })
    .eq("user_id", uid);
  if (clearError) {
    setVehiclesCache(previous);
    throw clearError;
  }

  const request = id
    ? supabase.from("vehicles").update(payload).eq("id", id).eq("user_id", uid).select("*").single()
    : supabase
        .from("vehicles")
        .insert({ ...payload, user_id: uid })
        .select("*")
        .single();

  const { data, error } = await request;
  if (error) {
    setVehiclesCache(previous);
    throw error;
  }

  const saved = normalizeVehicleRow(data);
  setVehiclesCache(
    [saved, ...previous.filter((item) => item.id !== saved.id)].map((item) => ({
      ...item,
      active: item.id === saved.id,
    })),
  );
  return saved;
}

export async function saveActiveVehicle(vehicle: VehicleProfile) {
  return saveVehicle(vehicle, getActiveVehicleRecord()?.id ?? null);
}

export function useVehicles(): VehicleRecord[] {
  return useQuery({ queryKey: VEHICLES_QUERY_KEY, queryFn: fetchVehicles }).data ?? [];
}

export function useActiveVehicle(): VehicleProfile | null {
  const vehicles = useQuery({ queryKey: VEHICLES_QUERY_KEY, queryFn: fetchVehicles }).data ?? [];
  return activeFrom(vehicles)?.profile ?? null;
}

export function useVehiclesReady(): boolean {
  return useQuery({ queryKey: VEHICLES_QUERY_KEY, queryFn: fetchVehicles }).isSuccess;
}
