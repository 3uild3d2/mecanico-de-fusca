import { useSyncExternalStore } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";

import { getFirebaseDb } from "@/shared/lib/firebase";
import { getCurrentThreadUserId, waitForThreadsReady } from "@/features/chat/api";
import { normalizeVehicle, type VehicleProfile } from "./model";

// Acesso a dados da ficha do veículo. Lógica pura em model.ts.

export type { VehicleProfile } from "./model";

let activeVehicle: VehicleProfile | null = null;
let ready = false;
let unsubscribe: (() => void) | null = null;

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function vehicleDoc(uid: string) {
  return doc(getFirebaseDb(), "users", uid, "vehicle", "active");
}

export async function initializeVehicles() {
  await waitForThreadsReady();
  const uid = getCurrentThreadUserId();
  if (!uid) return;

  unsubscribe?.();

  unsubscribe = onSnapshot(
    vehicleDoc(uid),
    (snapshot) => {
      activeVehicle = snapshot.exists() ? normalizeVehicle(snapshot.data()) : null;
      ready = true;
      emit();
    },
    (error) => {
      console.error("Erro ao carregar veículo:", error);
      ready = true;
      emit();
    },
  );
}

export async function saveActiveVehicle(vehicle: VehicleProfile) {
  const uid = getCurrentThreadUserId();
  if (!uid) throw new Error("Usuário não autenticado");

  activeVehicle = vehicle;
  emit();

  await setDoc(vehicleDoc(uid), vehicle, { merge: true });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!unsubscribe) void initializeVehicles();
  return () => listeners.delete(cb);
}

export function useActiveVehicle(): VehicleProfile | null {
  return useSyncExternalStore(
    subscribe,
    () => activeVehicle,
    () => activeVehicle,
  );
}

export function useVehiclesReady(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => ready,
    () => ready,
  );
}
