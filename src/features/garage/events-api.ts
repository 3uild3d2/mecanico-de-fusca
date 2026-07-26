import { useSyncExternalStore } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  type DocumentData,
} from "firebase/firestore";

import { getFirebaseDb } from "@/shared/lib/firebase";
import { getCurrentThreadUserId, waitForThreadsReady } from "@/features/chat/api";
import { normalizeTitulo, type VehicleEvent } from "./events";

// Persistência do histórico do veículo. Lógica pura em events.ts.
//
// NOTA DE MIGRAÇÃO: hoje em Firestore, vira a tabela vehicle_events no Postgres
// na Fase 2. Só este arquivo é reescrito — events.ts é portável.

let events: VehicleEvent[] = [];
let ready = false;
let unsubscribe: (() => void) | null = null;

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function eventsCollection(uid: string) {
  return collection(getFirebaseDb(), "users", uid, "vehicleEvents");
}

function normalizeEvent(id: string, data: DocumentData): VehicleEvent {
  return {
    id,
    tipo: data.tipo ?? "observacao",
    titulo: typeof data.titulo === "string" ? data.titulo : "(sem título)",
    sistema: data.sistema ?? undefined,
    desfecho: data.desfecho ?? undefined,
    data: typeof data.data === "number" ? data.data : 0,
    km: typeof data.km === "number" ? data.km : undefined,
    threadId: data.threadId ?? undefined,
    origem: data.origem === "usuario" ? "usuario" : "agente",
    criadoEm: typeof data.criadoEm === "number" ? data.criadoEm : 0,
  };
}

export async function initializeEvents() {
  await waitForThreadsReady();
  const uid = getCurrentThreadUserId();
  if (!uid) return;

  unsubscribe?.();

  unsubscribe = onSnapshot(
    query(eventsCollection(uid), orderBy("data", "desc")),
    (snapshot) => {
      events = snapshot.docs.map((d) => normalizeEvent(d.id, d.data()));
      ready = true;
      emit();
    },
    (error) => {
      console.error("Erro ao carregar histórico do veículo:", error);
      ready = true;
      emit();
    },
  );
}

export type NovoEvento = Omit<VehicleEvent, "id" | "criadoEm"> & { id?: string };

export async function registrarEvento(evento: NovoEvento): Promise<VehicleEvent> {
  const uid = getCurrentThreadUserId();
  if (!uid) throw new Error("Usuário não autenticado");

  const registro: VehicleEvent = {
    ...evento,
    id: evento.id ?? crypto.randomUUID(),
    titulo: normalizeTitulo(evento.titulo),
    criadoEm: Date.now(),
  };

  // Firestore rejeita undefined; remove antes de gravar.
  const payload = Object.fromEntries(
    Object.entries(registro).filter(([, value]) => value !== undefined),
  );

  await setDoc(doc(eventsCollection(uid), registro.id), payload, { merge: true });
  return registro;
}

export async function removerEvento(id: string) {
  const uid = getCurrentThreadUserId();
  if (!uid) throw new Error("Usuário não autenticado");
  await deleteDoc(doc(eventsCollection(uid), id));
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!unsubscribe) void initializeEvents();
  return () => listeners.delete(cb);
}

export function useVehicleEvents(): VehicleEvent[] {
  return useSyncExternalStore(
    subscribe,
    () => events,
    () => events,
  );
}

export function useVehicleEventsReady(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => ready,
    () => ready,
  );
}
