import { useSyncExternalStore } from "react";
import { doc, onSnapshot } from "firebase/firestore";

import { getFirebaseDb } from "@/shared/lib/firebase";
import { getCurrentThreadUserId, waitForThreadsReady } from "@/features/chat/api";

/**
 * Direitos de acesso do usuário (admin hoje; plano e assinatura na Fase 5).
 *
 * Regra inegociável: o cliente apenas LÊ daqui. Antes, o navegador comparava o
 * e-mail com uma constante e gravava `isAdmin` no próprio documento — ou seja, o
 * cliente escrevia o próprio direito de acesso. Com assinatura isso viraria uma
 * falha de receita. Ver docs/ARCHITECTURE.md §3.2.
 *
 * Quem escreve estes campos é o servidor. As regras do Firestore
 * (firestore.rules) tornam o documento somente-leitura para o dono.
 */

export type Entitlements = {
  isAdmin: boolean;
  plan: "free" | "premium";
};

const ANONYMOUS_ENTITLEMENTS: Entitlements = { isAdmin: false, plan: "free" };

let entitlements: Entitlements = ANONYMOUS_ENTITLEMENTS;
let ready = false;
let unsubscribe: (() => void) | null = null;

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

async function initialize() {
  await waitForThreadsReady();
  const uid = getCurrentThreadUserId();
  if (!uid) return;

  unsubscribe?.();

  unsubscribe = onSnapshot(
    doc(getFirebaseDb(), "users", uid),
    (snapshot) => {
      const data = snapshot.data();
      entitlements = {
        isAdmin: data?.isAdmin === true,
        plan: data?.plan === "premium" ? "premium" : "free",
      };
      ready = true;
      emit();
    },
    (error) => {
      console.error("Erro ao carregar permissões:", error);
      entitlements = ANONYMOUS_ENTITLEMENTS;
      ready = true;
      emit();
    },
  );
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!unsubscribe) void initialize();
  return () => listeners.delete(cb);
}

export function useEntitlements(): Entitlements {
  return useSyncExternalStore(
    subscribe,
    () => entitlements,
    () => entitlements,
  );
}

export function useEntitlementsReady(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => ready,
    () => ready,
  );
}

export function useIsAdmin(): boolean {
  return useEntitlements().isAdmin;
}
